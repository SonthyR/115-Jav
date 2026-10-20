package pan

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func jsonResponse(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(body))}
}

func formOf(t *testing.T, request *http.Request) url.Values {
	t.Helper()
	if err := request.ParseForm(); err != nil {
		t.Fatal(err)
	}
	return request.PostForm
}

func TestFileOperationsSendExpectedForms(t *testing.T) {
	client := New()
	defer client.Close()
	var got []string
	client.http.SetTransport(offlineRoundTrip(func(request *http.Request) (*http.Response, error) {
		form := formOf(t, request)
		switch request.URL.Path {
		case "/open/folder/add":
			got = append(got, "mkdir "+form.Get("pid")+" "+form.Get("file_name"))
			return jsonResponse(`{"state":true,"code":0,"data":{"file_name":"ABP-123","file_id":"900"}}`), nil
		case "/open/ufile/move":
			got = append(got, "move "+form.Get("file_ids")+" "+form.Get("to_cid"))
		case "/open/ufile/update":
			got = append(got, "rename "+form.Get("file_id")+" "+form.Get("file_name"))
		case "/open/ufile/delete":
			got = append(got, "delete "+form.Get("file_ids")+" "+form.Get("parent_id"))
		default:
			t.Fatalf("unexpected %s", request.URL.Path)
		}
		return jsonResponse(`{"state":true,"code":0,"data":[]}`), nil
	}))
	ctx := t.Context()
	id, err := client.Mkdir(ctx, "token", "10", "ABP-123")
	if err != nil || id != "900" {
		t.Fatalf("mkdir = %q, %v", id, err)
	}
	if err := client.Move(ctx, "token", []string{"1", "2"}, "900"); err != nil {
		t.Fatal(err)
	}
	if err := client.Rename(ctx, "token", "1", "ABP-123-C.mp4"); err != nil {
		t.Fatal(err)
	}
	if err := client.Delete(ctx, "token", []string{"3"}, "11"); err != nil {
		t.Fatal(err)
	}
	want := []string{"mkdir 10 ABP-123", "move 1,2 900", "rename 1 ABP-123-C.mp4", "delete 3 11"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("requests = %q", got)
	}
}

func TestFileOperationReportsAPIRejection(t *testing.T) {
	client := New()
	defer client.Close()
	client.http.SetTransport(offlineRoundTrip(func(*http.Request) (*http.Response, error) {
		return jsonResponse(`{"state":false,"code":20004,"message":"exists"}`), nil
	}))
	if _, err := client.Mkdir(t.Context(), "token", "10", "ABP-123"); err == nil {
		t.Fatal("accepted a rejected mkdir")
	}
}

func TestUploadCompletesByHashAfterSignCheck(t *testing.T) {
	client := New()
	defer client.Close()
	body := []byte("0123456789")
	calls := 0
	client.http.SetTransport(offlineRoundTrip(func(request *http.Request) (*http.Response, error) {
		calls++
		form := formOf(t, request)
		if form.Get("target") != "U_1_10" || form.Get("fileid") != upperSHA1(body) || form.Get("file_size") != "10" {
			t.Fatalf("init form = %v", form)
		}
		if calls == 1 {
			return jsonResponse(`{"state":true,"code":0,"data":{"status":7,"sign_key":"k","sign_check":"2-4"}}`), nil
		}
		if form.Get("sign_key") != "k" || form.Get("sign_val") != upperSHA1([]byte("234")) {
			t.Fatalf("sign form = %v", form)
		}
		return jsonResponse(`{"state":true,"code":0,"data":{"status":2,"file_id":"77","pick_code":"pc77"}}`), nil
	}))
	file, err := client.Upload(t.Context(), "token", "10", "ABP-123.nfo", body)
	if err != nil || file.FileID != "77" || file.PickCode != "pc77" || calls != 2 {
		t.Fatalf("upload = %+v, %v after %d calls", file, err, calls)
	}
}

func TestUploadSendsSignedOSSPutWithCallback(t *testing.T) {
	client := New()
	defer client.Close()
	body := []byte("poster")
	client.http.SetTransport(offlineRoundTrip(func(request *http.Request) (*http.Response, error) {
		switch request.URL.Path {
		case "/open/upload/init":
			return jsonResponse(`{"state":true,"code":0,"data":{"status":1,"pick_code":"pc1","bucket":"fhnfile","object":"abc/def","callback":{"callback":"{\"url\":\"cb\"}","callback_var":"{\"x:a\":\"b\"}"}}}`), nil
		case "/open/upload/get_token":
			return jsonResponse(`{"state":true,"code":0,"data":[{"endpoint":"http://oss-cn-shenzhen.aliyuncs.com","AccessKeyId":"id","AccessKeySecret":"secret","SecurityToken":"sts"}]}`), nil
		}
		t.Fatalf("unexpected %s", request.URL.Path)
		return nil, nil
	}))
	client.media.Transport = offlineRoundTrip(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPut || request.URL.String() != "https://fhnfile.oss-cn-shenzhen.aliyuncs.com/abc/def" {
			t.Fatalf("OSS request = %s %s", request.Method, request.URL)
		}
		sent, _ := io.ReadAll(request.Body)
		if !bytes.Equal(sent, body) || request.Header.Get("x-oss-security-token") != "sts" {
			t.Fatalf("OSS body %q headers %v", sent, request.Header)
		}
		if callback, _ := base64.StdEncoding.DecodeString(request.Header.Get("x-oss-callback")); string(callback) != `{"url":"cb"}` {
			t.Fatalf("callback = %q", callback)
		}
		payload := "PUT\n\napplication/octet-stream\n" + request.Header.Get("Date") + "\n" +
			"x-oss-callback:" + request.Header.Get("x-oss-callback") + "\n" +
			"x-oss-callback-var:" + request.Header.Get("x-oss-callback-var") + "\n" +
			"x-oss-security-token:sts\n/fhnfile/abc/def"
		mac := hmac.New(sha1.New, []byte("secret"))
		mac.Write([]byte(payload))
		if want := "OSS id:" + base64.StdEncoding.EncodeToString(mac.Sum(nil)); request.Header.Get("Authorization") != want {
			t.Fatalf("authorization = %q, want %q", request.Header.Get("Authorization"), want)
		}
		return jsonResponse(`{"state":true,"code":0,"data":{"file_id":"88","pick_code":"pc88"}}`), nil
	})
	file, err := client.Upload(t.Context(), "token", "10", "poster.jpg", body)
	if err != nil || file.FileID != "88" || file.PickCode != "pc88" {
		t.Fatalf("upload = %+v, %v", file, err)
	}
}

func TestSignRangeRejectsOutOfBounds(t *testing.T) {
	for _, check := range []string{"", "3", "4-2", "0-10", "-1-2"} {
		if _, err := signRange([]byte("0123456789"), check); err == nil {
			t.Fatalf("accepted %q", check)
		}
	}
}
