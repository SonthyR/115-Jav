package pan

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Upload status values returned by /open/upload/init.
const (
	uploadNeedsData  = 1
	uploadDone       = 2
	uploadSignFirst  = 6
	uploadSignSecond = 7
	uploadSignThird  = 8

	maxUploadBytes  = 64 << 20
	uploadPreIDSize = 128 << 10
)

// UploadedFile identifies a file created by Upload. 115 may omit the IDs in an
// OSS callback, so callers that need them list the parent directory.
type UploadedFile struct {
	FileID   string
	PickCode string
}

// jsonObject accepts 115 fields that are sometimes an object and sometimes a
// one-element array of that object.
type jsonObject[T any] struct{ Value T }

func (object *jsonObject[T]) UnmarshalJSON(body []byte) error {
	body = bytes.TrimSpace(body)
	if len(body) > 0 && body[0] == '[' {
		var values []T
		if err := json.Unmarshal(body, &values); err != nil {
			return err
		}
		if len(values) > 0 {
			object.Value = values[0]
		}
		return nil
	}
	return json.Unmarshal(body, &object.Value)
}

type uploadInitWire struct {
	apiResponse
	Data jsonObject[struct {
		Status    int    `json:"status"`
		FileID    string `json:"file_id"`
		PickCode  string `json:"pick_code"`
		SignKey   string `json:"sign_key"`
		SignCheck string `json:"sign_check"`
		Bucket    string `json:"bucket"`
		Object    string `json:"object"`
		Callback  jsonObject[struct {
			Callback    string `json:"callback"`
			CallbackVar string `json:"callback_var"`
		}] `json:"callback"`
	}] `json:"data"`
}

type uploadTokenWire struct {
	apiResponse
	Data jsonObject[struct {
		Endpoint        string `json:"endpoint"`
		AccessKeyID     string `json:"AccessKeyId"`
		AccessKeySecret string `json:"AccessKeySecret"`
		SecurityToken   string `json:"SecurityToken"`
	}] `json:"data"`
}

// Upload stores a small sidecar such as an NFO or poster in parentID. 115
// completes known content by hash; other content goes to its OSS bucket.
func (client *Client) Upload(ctx context.Context, accessToken, parentID, name string, body []byte) (UploadedFile, error) {
	if len(body) > maxUploadBytes {
		return UploadedFile{}, fmt.Errorf("upload %s exceeds %d bytes", name, maxUploadBytes)
	}
	form := map[string]string{
		"file_name": name,
		"file_size": strconv.Itoa(len(body)),
		"target":    "U_1_" + parentID,
		"fileid":    upperSHA1(body),
		"preid":     upperSHA1(body[:min(len(body), uploadPreIDSize)]),
	}
	for attempt := 0; ; attempt++ {
		result, err := apiRequest[uploadInitWire](
			client,
			client.http.R().SetContext(ctx).SetAuthToken(accessToken).SetFormData(form),
			http.MethodPost,
			apiURL+"/open/upload/init",
			"upload initialization",
		)
		if err != nil {
			return UploadedFile{}, err
		}
		data := result.Data.Value
		switch data.Status {
		case uploadDone:
			return UploadedFile{FileID: data.FileID, PickCode: data.PickCode}, nil
		case uploadSignFirst, uploadSignSecond, uploadSignThird:
			if attempt >= 3 {
				return UploadedFile{}, fmt.Errorf("115 kept requesting upload verification for %s", name)
			}
			value, err := signRange(body, data.SignCheck)
			if err != nil {
				return UploadedFile{}, err
			}
			form["sign_key"], form["sign_val"] = data.SignKey, value
		case uploadNeedsData:
			if data.Bucket == "" || data.Object == "" {
				return UploadedFile{}, fmt.Errorf("115 upload for %s is missing its OSS object", name)
			}
			token, err := apiRequest[uploadTokenWire](
				client,
				client.http.R().SetContext(ctx).SetAuthToken(accessToken),
				http.MethodGet,
				apiURL+"/open/upload/get_token",
				"upload token",
			)
			if err != nil {
				return UploadedFile{}, err
			}
			credentials := token.Data.Value
			callback := data.Callback.Value
			return client.putOSS(ctx, ossPut{
				endpoint: credentials.Endpoint, bucket: data.Bucket, object: data.Object,
				keyID: credentials.AccessKeyID, secret: credentials.AccessKeySecret, token: credentials.SecurityToken,
				callback: callback.Callback, callbackVar: callback.CallbackVar, body: body,
			}, data.PickCode)
		default:
			return UploadedFile{}, fmt.Errorf("115 upload for %s returned status %d", name, data.Status)
		}
	}
}

// signRange hashes the inclusive byte range "start-end" that 115 asks for.
func signRange(body []byte, check string) (string, error) {
	first, last, found := strings.Cut(check, "-")
	start, startErr := strconv.Atoi(first)
	end, endErr := strconv.Atoi(last)
	if !found || startErr != nil || endErr != nil || start < 0 || end < start || end >= len(body) {
		return "", fmt.Errorf("invalid 115 upload sign range %q", check)
	}
	return upperSHA1(body[start : end+1]), nil
}

func upperSHA1(body []byte) string {
	sum := sha1.Sum(body)
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

type ossPut struct {
	endpoint, bucket, object string
	keyID, secret, token     string
	callback, callbackVar    string
	body                     []byte
}

// putOSS sends one signed PutObject with the 115 callback, which registers the
// file. OSS answers with the callback response from 115.
func (client *Client) putOSS(ctx context.Context, put ossPut, pickCode string) (UploadedFile, error) {
	endpoint, err := url.Parse(put.endpoint)
	if err != nil || endpoint.Host == "" {
		return UploadedFile{}, fmt.Errorf("invalid 115 OSS endpoint %q", put.endpoint)
	}
	if endpoint.Scheme == "" || endpoint.Scheme == "http" {
		endpoint.Scheme = "https"
	}
	target := url.URL{Scheme: endpoint.Scheme, Host: put.bucket + "." + endpoint.Host, Path: "/" + put.object}
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, target.String(), bytes.NewReader(put.body))
	if err != nil {
		return UploadedFile{}, err
	}
	request.ContentLength = int64(len(put.body))
	headers := map[string]string{
		"x-oss-callback":     base64.StdEncoding.EncodeToString([]byte(put.callback)),
		"x-oss-callback-var": base64.StdEncoding.EncodeToString([]byte(put.callbackVar)),
	}
	if put.token != "" {
		headers["x-oss-security-token"] = put.token
	}
	contentType := "application/octet-stream"
	date := time.Now().UTC().Format(http.TimeFormat)
	request.Header.Set("Content-Type", contentType)
	request.Header.Set("Date", date)
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	request.Header.Set("Authorization", "OSS "+put.keyID+":"+ossSignature(put.secret, http.MethodPut, contentType, date, headers, "/"+put.bucket+"/"+put.object))

	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	response, err := client.media.Do(request.WithContext(ctx))
	if err != nil {
		return UploadedFile{}, fmt.Errorf("upload to 115 OSS: %w", err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return UploadedFile{}, fmt.Errorf("115 OSS upload returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	var callback struct {
		State bool `json:"state"`
		Data  struct {
			FileID   string `json:"file_id"`
			PickCode string `json:"pick_code"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &callback); err == nil && callback.State {
		if callback.Data.PickCode != "" {
			pickCode = callback.Data.PickCode
		}
		return UploadedFile{FileID: callback.Data.FileID, PickCode: pickCode}, nil
	}
	return UploadedFile{PickCode: pickCode}, nil
}

// ossSignature implements the OSS V1 header signature over the request line,
// content type, date, x-oss-* headers and the bucket resource.
func ossSignature(secret, method, contentType, date string, headers map[string]string, resource string) string {
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, strings.ToLower(key))
	}
	sort.Strings(keys)
	var canonical strings.Builder
	for _, key := range keys {
		canonical.WriteString(key + ":" + headers[key] + "\n")
	}
	payload := method + "\n\n" + contentType + "\n" + date + "\n" + canonical.String() + resource
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(payload))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
