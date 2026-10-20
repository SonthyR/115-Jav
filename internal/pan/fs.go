package pan

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// Mkdir creates one directory under parentID and returns its ID. 115 rejects a
// name that already exists there, so callers list the parent first.
func (client *Client) Mkdir(ctx context.Context, accessToken, parentID, name string) (string, error) {
	type mkdirWire struct {
		apiResponse
		Data struct {
			FileID string `json:"file_id"`
		} `json:"data"`
	}
	result, err := apiRequest[mkdirWire](
		client,
		client.http.R().SetContext(ctx).SetAuthToken(accessToken).SetFormData(map[string]string{
			"pid": parentID, "file_name": name,
		}),
		http.MethodPost,
		apiURL+"/open/folder/add",
		"directory creation",
	)
	if err != nil {
		return "", err
	}
	if result.Data.FileID == "" {
		return "", fmt.Errorf("115 directory creation is missing file_id")
	}
	return result.Data.FileID, nil
}

// Move moves files or directories into targetID. IDs are kept by 115, so
// indexed files and exported STRM links stay valid.
func (client *Client) Move(ctx context.Context, accessToken string, fileIDs []string, targetID string) error {
	_, err := apiRequest[apiResponse](
		client,
		client.http.R().SetContext(ctx).SetAuthToken(accessToken).SetFormData(map[string]string{
			"file_ids": strings.Join(fileIDs, ","), "to_cid": targetID,
		}),
		http.MethodPost,
		apiURL+"/open/ufile/move",
		"file move",
	)
	return err
}

// Rename renames one file or directory in place.
func (client *Client) Rename(ctx context.Context, accessToken, fileID, name string) error {
	_, err := apiRequest[apiResponse](
		client,
		client.http.R().SetContext(ctx).SetAuthToken(accessToken).SetFormData(map[string]string{
			"file_id": fileID, "file_name": name,
		}),
		http.MethodPost,
		apiURL+"/open/ufile/update",
		"file rename",
	)
	return err
}

// Delete moves files or directories of one parent into the 115 recycle bin.
func (client *Client) Delete(ctx context.Context, accessToken string, fileIDs []string, parentID string) error {
	_, err := apiRequest[apiResponse](
		client,
		client.http.R().SetContext(ctx).SetAuthToken(accessToken).SetFormData(map[string]string{
			"file_ids": strings.Join(fileIDs, ","), "parent_id": parentID,
		}),
		http.MethodPost,
		apiURL+"/open/ufile/delete",
		"file deletion",
	)
	return err
}
