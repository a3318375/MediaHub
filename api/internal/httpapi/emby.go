package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type EmbyDashboardResponse struct {
	UpdatedAt        string               `json:"updatedAt"`
	Sites            []EmbySite           `json:"sites"`
	Stats            map[string]EmbyStats `json:"stats"`
	Libraries        []EmbyLibrary        `json:"libraries"`
	RecentlyAdded    []EmbyDashboardItem  `json:"recentlyAdded"`
	ContinueWatching []EmbyResumeItem     `json:"continueWatching"`
	Warnings         []string             `json:"warnings"`
}

type EmbySite struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}
type EmbyStats struct {
	Movies   int `json:"movies"`
	Series   int `json:"series"`
	Episodes int `json:"episodes"`
	Plays    int `json:"plays"`
	Viewers  int `json:"viewers"`
	Hours    int `json:"hours"`
}
type EmbyLibrary struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Type   string `json:"type"`
	Count  int    `json:"count"`
	SiteID string `json:"siteId"`
}
type EmbyDashboardItem struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	ArtworkTitle string `json:"artworkTitle"`
	Kind         string `json:"kind"`
	Year         int    `json:"year"`
	Rating       string `json:"rating"`
	LibraryID    string `json:"libraryId"`
	SiteID       string `json:"siteId"`
	Summary      string `json:"summary"`
	Palette      string `json:"palette"`
}
type EmbyResumeItem struct {
	EmbyDashboardItem
	Progress    int    `json:"progress"`
	ResumeLabel string `json:"resumeLabel"`
	Remaining   string `json:"remaining"`
}

type embyItem struct {
	ID              string   `json:"Id"`
	Name            string   `json:"Name"`
	Type            string   `json:"Type"`
	CollectionType  string   `json:"CollectionType"`
	ParentID        string   `json:"ParentId"`
	TopParentID     string   `json:"TopParentId"`
	AncestorIDs     []string `json:"AncestorIds"`
	Overview        string   `json:"Overview"`
	ProductionYear  int      `json:"ProductionYear"`
	CommunityRating float64  `json:"CommunityRating"`
	RunTimeTicks    int64    `json:"RunTimeTicks"`
	UserData        struct {
		PlaybackPositionTicks int64   `json:"PlaybackPositionTicks"`
		PlayedPercentage      float64 `json:"PlayedPercentage"`
	} `json:"UserData"`
	ParentIndexNumber int    `json:"ParentIndexNumber"`
	IndexNumber       int    `json:"IndexNumber"`
	SeriesName        string `json:"SeriesName"`
	ChildCount        int    `json:"ChildCount"`
}

type embyQueryResult struct {
	Items            []embyItem `json:"Items"`
	TotalRecordCount int        `json:"TotalRecordCount"`
	MovieCount       int        `json:"MovieCount"`
	SeriesCount      int        `json:"SeriesCount"`
	EpisodeCount     int        `json:"EpisodeCount"`
}

func (result *embyQueryResult) UnmarshalJSON(data []byte) error {
	if len(data) > 0 && data[0] == '[' {
		return json.Unmarshal(data, &result.Items)
	}
	type plain embyQueryResult
	return json.Unmarshal(data, (*plain)(result))
}

func (a *API) embyConfig() (string, string, time.Duration, error) {
	values, _, err := a.store.ReadSettings("emby")
	if err != nil {
		return "", "", 12 * time.Hour, err
	}
	base, _ := values["emby.url"].(string)
	if strings.TrimSpace(base) == "" {
		return "", "", 12 * time.Hour, errors.New("请先在设置中填写 Emby 地址")
	}
	key, err := a.store.ReadSecret("emby", "emby.apiKey")
	if err != nil || key == "" {
		return "", "", 12 * time.Hour, errors.New("请先在设置中配置 Emby API Key")
	}
	hours := 12.0
	switch value := values["emby.cacheExpirationHours"].(type) {
	case float64:
		hours = value
	case string:
		if parsed, parseErr := strconv.ParseFloat(value, 64); parseErr == nil {
			hours = parsed
		}
	}
	if hours < 1 {
		hours = 1
	}
	if hours > 24*365 {
		hours = 24 * 365
	}
	return strings.TrimRight(strings.TrimSpace(base), "/"), key, time.Duration(hours * float64(time.Hour)), nil
}

func embyAPIURL(base, path string) (string, error) {
	parsed, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	endpoint, err := url.Parse(strings.TrimLeft(path, "/"))
	if err != nil {
		return "", err
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	if !strings.HasSuffix(parsed.Path, "/emby") {
		parsed.Path += "/emby"
	}
	parsed.Path += "/" + strings.TrimLeft(endpoint.Path, "/")
	parsed.RawQuery = endpoint.RawQuery
	return parsed.String(), nil
}

func canonicalEmbyID(id string) string {
	if len(id) != 32 {
		return id
	}
	if _, err := hex.DecodeString(id); err != nil {
		return id
	}
	return id[:8] + "-" + id[8:12] + "-" + id[12:16] + "-" + id[16:20] + "-" + id[20:]
}

func (a *API) embyRequest(ctx context.Context, base, key, path string) (*http.Response, error) {
	target, err := embyAPIURL(base, path)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("X-Emby-Token", key)
	request.Header.Set("Accept", "application/json")
	return (&http.Client{Timeout: 15 * time.Second}).Do(request)
}

func (a *API) readEmbyJSON(ctx context.Context, base, key, path string, target any) error {
	response, err := a.embyRequest(ctx, base, key, path)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 1024))
		return fmt.Errorf("Emby 接口 %s 返回 HTTP %d: %s", path, response.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(io.LimitReader(response.Body, 8<<20)).Decode(target)
}

func (a *API) embyDashboard(c *gin.Context) {
	base, key, ttl, err := a.embyConfig()
	if err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	keyDigest := sha256.Sum256([]byte(key))
	cacheKey := base + ":" + hex.EncodeToString(keyDigest[:])
	a.embyMu.Lock()
	defer a.embyMu.Unlock()
	if c.Query("refresh") != "true" && a.embyCache != nil && a.embyCacheKey == cacheKey && time.Since(a.embyCachedAt) < ttl {
		c.JSON(http.StatusOK, a.embyCache)
		return
	}
	appUser, _ := currentUser(c)
	result, err := a.fetchEmbyDashboard(c.Request.Context(), base, key, appUser.Account)
	if err != nil {
		fail(c, http.StatusBadGateway, "读取 Emby 媒体数据失败："+err.Error())
		return
	}
	result.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	a.embyCache = result
	a.embyCacheKey = cacheKey
	a.embyCachedAt = time.Now()
	c.JSON(http.StatusOK, result)
}

func (a *API) fetchEmbyDashboard(ctx context.Context, base, key, preferredAccount string) (*EmbyDashboardResponse, error) {
	var users []struct {
		ID   string `json:"Id"`
		Name string `json:"Name"`
	}
	if err := a.readEmbyJSON(ctx, base, key, "Users", &users); err != nil {
		return nil, fmt.Errorf("用户列表：%w", err)
	}
	if len(users) == 0 || users[0].ID == "" {
		return nil, errors.New("Emby 中没有可读取的用户")
	}
	preferredIndex := 0
	for i := range users {
		if strings.EqualFold(strings.TrimSpace(users[i].Name), strings.TrimSpace(preferredAccount)) {
			preferredIndex = i
			break
		}
	}
	users[0], users[preferredIndex] = users[preferredIndex], users[0]
	userID := url.PathEscape(canonicalEmbyID(users[0].ID))
	var views embyQueryResult
	if err := a.readEmbyJSON(ctx, base, key, "Users/"+userID+"/Views", &views); err != nil {
		return nil, fmt.Errorf("媒体库列表：%w", err)
	}
	var counts embyQueryResult
	if err := a.readEmbyJSON(ctx, base, key, "Items/Counts?UserId="+url.QueryEscape(users[0].ID), &counts); err != nil {
		return nil, fmt.Errorf("媒体计数：%w", err)
	}
	var latest embyQueryResult
	latestErr := a.readEmbyJSON(ctx, base, key, "Users/"+userID+"/Items/Latest?Limit=12&GroupItems=true&Fields=Overview,ProductionYear,CommunityRating", &latest)
	resumeItems := []embyItem{}
	resumeErrors := []string{}
	resumeOrder := make([]int, 0, len(users))
	resumeOrder = append(resumeOrder, preferredIndex)
	for i := range users {
		if i != preferredIndex {
			resumeOrder = append(resumeOrder, i)
		}
	}
	for _, userIndex := range resumeOrder {
		resumeUser := users[userIndex]
		if resumeUser.ID == "" {
			continue
		}
		resumeUserID := url.PathEscape(canonicalEmbyID(resumeUser.ID))
		resumePath := "Users/" + resumeUserID + "/Sections/resume/Items?Limit=12&Fields=BasicSyncInfo,CanDelete,CanDownload,PrimaryImageAspectRatio,ProgramPrimaryImageAspectRatio,ProductionYear,Status,EndDate,Overview,CommunityRating,UserData,RunTimeTicks,ParentId,SeriesName,ParentIndexNumber,IndexNumber&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb,Logo"
		var userResume embyQueryResult
		resumeErr := a.readEmbyJSON(ctx, base, key, resumePath, &userResume)
		if resumeErr != nil {
			fallbackPath := "Users/" + resumeUserID + "/Items/Resume?Limit=12&MediaTypes=Video&Fields=Overview,ProductionYear,CommunityRating,UserData,RunTimeTicks,ParentId,SeriesName,ParentIndexNumber,IndexNumber"
			resumeErr = a.readEmbyJSON(ctx, base, key, fallbackPath, &userResume)
		}
		if resumeErr != nil {
			resumeErrors = append(resumeErrors, fmt.Sprintf("用户 %s：%v", resumeUser.ID, resumeErr))
			continue
		}
		if len(userResume.Items) > 0 {
			resumeItems = userResume.Items
			break
		}
	}
	response := &EmbyDashboardResponse{Sites: []EmbySite{{ID: "all", Label: "全部站点"}, {ID: "main", Label: "主媒体库"}}, Stats: map[string]EmbyStats{}, Libraries: []EmbyLibrary{}, RecentlyAdded: []EmbyDashboardItem{}, ContinueWatching: []EmbyResumeItem{}, Warnings: []string{}}
	stats := EmbyStats{Movies: counts.MovieCount, Series: counts.SeriesCount, Episodes: counts.EpisodeCount}
	knownLibraries := map[string]bool{}
	libraryForItem := map[string]string{}
	recentForLibraries := []embyItem{}
	for _, view := range views.Items {
		libType := embyLibraryType(view.CollectionType, view.Name)
		if libType == "" {
			continue
		}
		count := view.ChildCount
		if count == 0 {
			var countErr error
			count, countErr = viewCount(ctx, a, base, key, view.ID)
			if countErr != nil {
				response.Warnings = append(response.Warnings, view.Name+"数量读取失败："+countErr.Error())
			}
		}
		response.Libraries = append(response.Libraries, EmbyLibrary{ID: view.ID, Title: view.Name, Type: libType, Count: count, SiteID: "main"})
		knownLibraries[view.ID] = true
	}
	for _, library := range response.Libraries {
		var recentForLibrary embyQueryResult
		parentID := url.QueryEscape(canonicalEmbyID(library.ID))
		latestPath := "Users/" + userID + "/Items/Latest?ParentId=" + parentID + "&Limit=2&GroupItems=true&Fields=Overview,ProductionYear,CommunityRating"
		if err := a.readEmbyJSON(ctx, base, key, latestPath, &recentForLibrary); err == nil {
			for _, item := range recentForLibrary.Items {
				libraryForItem[item.ID] = library.ID
				recentForLibraries = append(recentForLibraries, item)
			}
		}
	}
	if len(recentForLibraries) == 0 && latestErr != nil {
		response.Warnings = append(response.Warnings, "最近入库暂不可用："+latestErr.Error())
	}
	if len(resumeItems) == 0 && len(resumeErrors) > 0 {
		response.Warnings = append(response.Warnings, "继续播放暂不可用："+strings.Join(resumeErrors, "；"))
	}
	response.Stats["all"], response.Stats["main"] = stats, stats
	recentItems := latest.Items
	if len(recentForLibraries) > 0 {
		recentItems = recentForLibraries
	}
	for _, item := range recentItems {
		entry := normalizeEmbyItem(item, knownLibraries)
		if libraryID := libraryForItem[item.ID]; libraryID != "" {
			entry.LibraryID = libraryID
		}
		response.RecentlyAdded = append(response.RecentlyAdded, entry)
	}
	for _, item := range resumeItems {
		entry := normalizeEmbyItem(item, knownLibraries)
		if libraryID := libraryForItem[item.ID]; libraryID != "" {
			entry.LibraryID = libraryID
		}
		progress := int(item.UserData.PlayedPercentage)
		if progress == 0 && item.RunTimeTicks > 0 {
			progress = int(float64(item.UserData.PlaybackPositionTicks) / float64(item.RunTimeTicks) * 100)
		}
		if progress > 100 {
			progress = 100
		}
		if progress < 0 {
			progress = 0
		}
		label := "继续播放"
		if item.SeriesName != "" {
			label = item.SeriesName
			if item.ParentIndexNumber > 0 && item.IndexNumber > 0 {
				label = fmt.Sprintf("第 %d 季 · 第 %d 集", item.ParentIndexNumber, item.IndexNumber)
			}
		}
		remaining := ""
		if item.RunTimeTicks > 0 {
			ticks := item.RunTimeTicks - item.UserData.PlaybackPositionTicks
			if ticks > 0 {
				remaining = fmt.Sprintf("还剩 %d 分钟", int(ticks/10_000_000/60))
			}
		}
		response.ContinueWatching = append(response.ContinueWatching, EmbyResumeItem{EmbyDashboardItem: entry, Progress: progress, ResumeLabel: label, Remaining: remaining})
	}
	return response, nil
}

func viewCount(ctx context.Context, api *API, base, key, id string) (int, error) {
	var result embyQueryResult
	err := api.readEmbyJSON(ctx, base, key, "Items?ParentId="+url.QueryEscape(canonicalEmbyID(id))+"&Recursive=true&Limit=1", &result)
	return result.TotalRecordCount, err
}

func embyLibraryType(collection, name string) string {
	switch strings.ToLower(collection) {
	case "movies":
		return "电影"
	case "tvshows":
		return "剧集"
	case "music":
		return "演出"
	case "homevideos", "boxsets":
		return "纪录片"
	}
	lower := strings.ToLower(name)
	if strings.Contains(lower, "动画") || strings.Contains(lower, "anime") {
		return "动画"
	}
	if strings.Contains(lower, "电影") || strings.Contains(lower, "movie") {
		return "电影"
	}
	if strings.Contains(lower, "剧") || strings.Contains(lower, "series") || strings.Contains(lower, "tv") {
		return "剧集"
	}
	return "纪录片"
}

func normalizeEmbyItem(item embyItem, libraries map[string]bool) EmbyDashboardItem {
	kind := "剧集"
	if item.Type == "Movie" {
		kind = "电影"
	} else if item.Type == "Episode" || item.Type == "Series" {
		kind = "剧集"
	}
	lib := item.TopParentID
	if !libraries[lib] {
		lib = item.ParentID
	}
	if !libraries[lib] {
		lib = ""
		for _, ancestor := range item.AncestorIDs {
			if libraries[ancestor] {
				lib = ancestor
				break
			}
		}
	}
	rating := "—"
	if item.CommunityRating > 0 {
		rating = fmt.Sprintf("%.1f", item.CommunityRating)
	}
	return EmbyDashboardItem{ID: item.ID, Title: item.Name, ArtworkTitle: item.Name, Kind: kind, Year: item.ProductionYear, Rating: rating, LibraryID: lib, SiteID: "main", Summary: item.Overview, Palette: "from-chart-1 via-chart-3 to-chart-5"}
}

func (a *API) embyImage(c *gin.Context) {
	base, key, _, err := a.embyConfig()
	if err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	id := c.Param("id")
	if id == "" || strings.Contains(id, "/") {
		fail(c, http.StatusBadRequest, "媒体项目 ID 无效")
		return
	}
	response, err := a.embyRequest(c.Request.Context(), base, key, "Items/"+url.PathEscape(canonicalEmbyID(id))+"/Images/Primary?maxWidth=480&quality=85")
	if err != nil {
		fail(c, http.StatusBadGateway, "读取 Emby 海报失败")
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		c.Status(response.StatusCode)
		return
	}
	contentType := response.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		fail(c, http.StatusBadGateway, "Emby 返回了无效的海报格式")
		return
	}
	c.Header("Cache-Control", "private, max-age=3600")
	c.DataFromReader(http.StatusOK, response.ContentLength, contentType, response.Body, nil)
}
