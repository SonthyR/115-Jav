package pan

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

// ListVideos reads one page of the videos anywhere below directoryID
// (cur=0, type=4), newest change first. A quick scan can use it to find new
// files without listing every folder.
func (client *Client) ListVideos(ctx context.Context, accessToken, directoryID string, offset, limit int) (FilePage, error) {
	type videoListWire struct {
		apiResponse
		Count json.Number `json:"count"`
		Data  []struct {
			ID       string      `json:"fid"`
			ParentID string      `json:"pid"`
			Name     string      `json:"fn"`
			Size     json.Number `json:"fs"`
			PickCode string      `json:"pc"`
			SHA1     string      `json:"sha1"`
		} `json:"data"`
	}
	result, err := apiRequest[videoListWire](
		client,
		client.http.R().SetContext(ctx).SetAuthToken(accessToken).SetQueryParams(map[string]string{
			"cid": directoryID, "offset": strconv.Itoa(offset), "limit": strconv.Itoa(limit),
			"show_dir": "0", "cur": "0", "type": "4", "o": "user_utime", "asc": "0",
		}),
		http.MethodGet,
		apiURL+"/open/ufile/files",
		"video list",
	)
	if err != nil {
		return FilePage{}, err
	}
	total, err := result.Count.Int64()
	if err != nil && result.Count != "" {
		return FilePage{}, fmt.Errorf("decode 115 file count: %w", err)
	}
	page := FilePage{Files: make([]File, len(result.Data)), Total: int(total), HasMore: int64(offset+len(result.Data)) < total}
	for index, file := range result.Data {
		size, err := file.Size.Int64()
		if err != nil && file.Size != "" {
			return FilePage{}, fmt.Errorf("decode 115 file size: %w", err)
		}
		page.Files[index] = File{ID: file.ID, ParentID: file.ParentID, Name: file.Name, Size: size, PickCode: file.PickCode, SHA1: file.SHA1}
	}
	return page, nil
}
