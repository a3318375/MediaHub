package organize

import (
	"context"
	"fmt"
	"path"
	"strings"

	"media-center/internal/download"
	"media-center/internal/pan115"
)

// Lookup must return verified download artifacts or an explicit manual binding.
// A filename or a nonzero size alone never proves that a download is finished.
type Lookup func(context.Context, pan115.File) (Binding, error)

func Preview(ctx context.Context, g pan115.Gateway, r Rule, lookup Lookup) (Plan, error) {
	p := Plan{Rule: r, State: "preview", Actions: []Action{}, Issues: []Issue{}}
	if err := ValidateRule(r); err != nil {
		return p, err
	}
	if err := g.CheckAccount(); err != nil {
		return p, pan115.SafeError(err)
	}
	source, err := g.GetFile(r.SourceID)
	if err != nil {
		return p, pan115.SafeError(err)
	}
	if !source.Directory {
		return p, fmt.Errorf("未整理目录不是文件夹")
	}
	targets := map[string]bool{}
	for _, id := range r.Targets() {
		targets[id] = true
		f, e := g.GetFile(id)
		if e != nil {
			return p, pan115.SafeError(e)
		}
		if !f.Directory {
			return p, fmt.Errorf("目标不是文件夹")
		}
	}
	// A source inside any target could consume already organized media.
	ancestor := source
	seen := map[string]bool{}
	for depth := 0; ancestor.ParentID != "" && ancestor.ParentID != "0"; depth++ {
		if depth >= 32 || seen[ancestor.ID] {
			return p, fmt.Errorf("目录层级异常")
		}
		seen[ancestor.ID] = true
		if targets[ancestor.ParentID] {
			return p, fmt.Errorf("未整理目录不能位于目标目录内")
		}
		ancestor, err = g.GetFile(ancestor.ParentID)
		if err != nil {
			return p, pan115.SafeError(err)
		}
	}
	files := []pan115.File{}
	visited := map[string]bool{}
	var scan func(string, int) error
	scan = func(id string, depth int) error {
		if e := ctx.Err(); e != nil {
			return e
		}
		if depth > 8 || visited[id] {
			return fmt.Errorf("扫描目录层级过深或重复")
		}
		visited[id] = true
		list, e := g.ListFiles(id)
		if e != nil {
			return pan115.SafeError(e)
		}
		for _, f := range list {
			if f.ParentID != id {
				return fmt.Errorf("115 文件父目录不匹配")
			}
			if f.Directory {
				if r.Recursive && !targets[f.ID] && !skipDirectory(f.Name) {
					if e = scan(f.ID, depth+1); e != nil {
						return e
					}
				}
				continue
			}
			files = append(files, f)
			if len(files) > 2000 {
				return fmt.Errorf("扫描超过 2000 个文件，请缩小规则范围")
			}
		}
		return nil
	}
	if err = scan(r.SourceID, 0); err != nil {
		return p, err
	}
	issue := func(f pan115.File, code, message string) { p.Issues = append(p.Issues, Issue{f, code, message}) }
	videos := map[string]int{}
	for _, f := range files {
		if !IsVideo(f.Name) {
			continue
		}
		if f.Size <= 0 || incomplete(f.Name) {
			issue(f, "not_ready", "文件尚未就绪")
			continue
		}
		b := Binding{}
		if lookup != nil {
			b, err = lookup(ctx, f)
			if err != nil {
				issue(f, "binding", err.Error())
				continue
			}
		}
		if b.Size != 0 && (b.Size != f.Size || b.SHA1 != "" && !strings.EqualFold(b.SHA1, f.SHA1)) {
			issue(f, "changed", "文件与已记录下载产物不同")
			continue
		}
		if !b.Ready && !r.AllowExisting {
			issue(f, "not_ready", "没有完成下载记录，需明确确认历史文件已就绪")
			continue
		}
		m := b.Media
		if m.Title == "" && r.Binding != nil {
			m = *r.Binding
		}
		if m.Title == "" {
			issue(f, "identity", "作品身份未确认，请绑定作品信息")
			continue
		}
		m, err = mediaForFile(m, f.Name)
		if err != nil {
			issue(f, "episode", err.Error())
			continue
		}
		root := r.Target(m.Type)
		if root == "" {
			issue(f, "target", "此媒体类型没有目标目录")
			continue
		}
		dirs, name, e := naming(r, m, f.Name)
		if e != nil {
			issue(f, "name", e.Error())
			continue
		}
		a := Action{ID: f.ID, Source: f, TargetRootID: root, TargetDirectories: dirs, TargetName: name, Media: m, State: "planned"}
		videos[f.ParentID+"/"+strings.TrimSuffix(f.Name, path.Ext(f.Name))] = len(p.Actions)
		p.Actions = append(p.Actions, a)
	}
	for _, f := range files {
		if !subtitleExtensions[strings.ToLower(path.Ext(f.Name))] {
			continue
		}
		stem := strings.TrimSuffix(f.Name, path.Ext(f.Name))
		matches := []struct {
			index  int
			suffix string
		}{}
		for key, index := range videos {
			prefix := f.ParentID + "/"
			if !strings.HasPrefix(key, prefix) {
				continue
			}
			base := strings.TrimPrefix(key, prefix)
			if stem == base {
				matches = append(matches, struct {
					index  int
					suffix string
				}{index, ""})
			} else if strings.HasPrefix(stem, base+".") {
				suffix := strings.TrimPrefix(stem, base)
				if subtitleSuffix.MatchString(strings.TrimPrefix(suffix, ".")) {
					matches = append(matches, struct {
						index  int
						suffix string
					}{index, suffix})
				}
			}
		}
		if len(matches) != 1 {
			issue(f, "subtitle", "字幕无法唯一对应视频")
			continue
		}
		if f.Size <= 0 || incomplete(f.Name) {
			issue(f, "not_ready", "字幕尚未就绪")
			continue
		}
		if lookup != nil {
			b, e := lookup(ctx, f)
			if e != nil {
				issue(f, "binding", e.Error())
				continue
			}
			if !b.Ready && !r.AllowExisting {
				issue(f, "not_ready", "字幕没有完成下载记录")
				continue
			}
			if b.Size != 0 && (b.Size != f.Size || b.SHA1 != "" && !strings.EqualFold(b.SHA1, f.SHA1)) {
				issue(f, "changed", "字幕与下载记录不同")
				continue
			}
		} else if !r.AllowExisting {
			issue(f, "not_ready", "字幕没有完成下载记录")
			continue
		}
		match := matches[0]
		a := p.Actions[match.index]
		a.ID = f.ID
		a.Source = f
		a.TargetName = strings.TrimSuffix(a.TargetName, path.Ext(a.TargetName)) + match.suffix + path.Ext(f.Name)
		p.Actions = append(p.Actions, a)
	}
	keys := map[string][]int{}
	for i, a := range p.Actions {
		key := a.TargetRootID + "/" + strings.ToLower(strings.Join(a.TargetDirectories, "/")+"/"+a.TargetName)
		keys[key] = append(keys[key], i)
	}
	for _, indices := range keys {
		if len(indices) > 1 {
			for _, i := range indices {
				p.Actions[i].State = "conflict"
				p.Actions[i].Error = "多个来源文件对应同一目标，需人工选择"
			}
		}
	}
	return p, nil
}

func skipDirectory(name string) bool {
	switch strings.ToLower(name) {
	case "bdmv", "video_ts", "extras", "trailers", "sample", "samples":
		return true
	}
	return false
}
func incomplete(name string) bool {
	n := strings.ToLower(name)
	return strings.Contains(n, ".part.") || strings.Contains(n, ".tmp.") || strings.HasSuffix(n, ".!qb") || strings.Contains(n, "sample")
}

// MetadataForArtifact avoids assigning one episode to every file in a batch.
func MetadataForArtifact(t download.Task, f pan115.File) (Binding, error) {
	found := false
	videos := 0
	for _, a := range t.Artifacts {
		if IsVideo(a.Name) {
			videos++
		}
		if a.ID == f.ID {
			found = true
		}
	}
	if !found {
		return Binding{}, nil
	}
	if t.State != "completed" {
		return Binding{}, fmt.Errorf("下载仍未确认完成")
	}
	var m download.MediaContext
	for _, ref := range t.References {
		candidate := ref.Media
		if candidate.Title == "" {
			continue
		}
		if m.Title != "" && (NormalTitle(m.Title) != NormalTitle(candidate.Title) || m.Type != candidate.Type || m.ProviderID != candidate.ProviderID) {
			return Binding{}, fmt.Errorf("下载任务关联多个作品，请明确绑定")
		}
		m = candidate
	}
	if videos > 1 {
		if m.Type == "movie" {
			return Binding{}, fmt.Errorf("电影合集需要逐文件绑定作品")
		}
		m.Episodes = nil
	}
	for _, a := range t.Artifacts {
		if a.ID == f.ID {
			return Binding{Media: m, Ready: true, Size: a.Size, SHA1: a.SHA1}, nil
		}
	}
	return Binding{}, nil
}
