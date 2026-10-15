package download

import "fmt"

// Link is the common normalized input for search results and channel messages.
// Parsing shares and magnets here keeps candidate eligibility equal to enqueue eligibility.
type Link struct{ Kind, URL, ReceiveCode, ResourceID string }

func NormalizeLink(raw, password string) (Link, error) {
	if canonical, hash, err := NormalizeMagnet(raw); err == nil {
		return Link{Kind: "offline", URL: canonical, ResourceID: hash}, nil
	}
	if canonical, code, receive, err := ParseShare(raw, password); err == nil {
		return Link{Kind: "share_transfer", URL: canonical, ReceiveCode: receive, ResourceID: "share:" + code}, nil
	}
	return Link{}, fmt.Errorf("需要有效的 115 分享或 BT v1 磁力链接")
}
