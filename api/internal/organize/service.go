package organize

import (
	"context"
	"fmt"
	"media-center/internal/download"
	"media-center/internal/pan115"
	"strings"
	"sync"
	"time"
)

type Repository interface {
	ReadSecret(string, string) (string, error)
	OrganizeRules() ([]Rule, error)
	OrganizeRule(string) (Rule, error)
	OrganizePlans(bool) ([]Plan, error)
	OrganizePlan(string) (Plan, error)
	CreateOrganizePlan(Plan) (Plan, error)
	SaveOrganizePlan(Plan) error
	OrganizeRan(string, string) (bool, error)
	OrganizeLookup(string) Lookup
	OrganizeUnfinished(string) ([]download.Task, error)
}
type Service struct {
	Resolve func(context.Context, download.MediaContext, pan115.File) (download.MediaContext, error)
	Store   Repository
	Factory download.Factory
	mu      sync.Mutex
}

func (s *Service) gateway(ctx context.Context, account string) (pan115.FileGateway, error) {
	cookie, e := s.Store.ReadSecret("115", "115.cookie")
	if e != nil {
		return nil, e
	}
	current, e := pan115.AccountID(cookie)
	if e != nil {
		return nil, e
	}
	if current != account {
		return nil, fmt.Errorf("115 账号已变更，请重新保存整理规则")
	}
	g, e := s.Factory(ctx, cookie)
	if e != nil {
		return nil, e
	}
	if e = g.CheckAccount(); e != nil {
		return nil, pan115.SafeError(e)
	}
	files, ok := g.(pan115.FileGateway)
	if !ok {
		return nil, fmt.Errorf("115 文件操作不可用")
	}
	return files, nil
}
func (s *Service) Preview(ctx context.Context, id string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.preview(ctx, id, "", false)
}
func (s *Service) preview(ctx context.Context, id, date string, execute bool) (Plan, error) {
	r, e := s.Store.OrganizeRule(id)
	if e != nil {
		return Plan{}, e
	}
	g, e := s.gateway(ctx, r.AccountID)
	if e != nil {
		return Plan{}, e
	}
	lookup := s.Store.OrganizeLookup(r.AccountID)
	active, e := s.Store.OrganizeUnfinished(r.AccountID)
	if e != nil {
		return Plan{}, e
	}
	blocked := map[string]bool{}
	for _, t := range active {
		if t.AccountID == r.AccountID {
			blocked[t.DirectoryID] = true
		}
	}
	ancestorBlocked := map[string]bool{}
	p, e := Preview(ctx, g, r, func(ctx context.Context, f pan115.File) (Binding, error) {
		id := f.ParentID
		if value, ok := ancestorBlocked[id]; ok {
			if value {
				return Binding{}, fmt.Errorf("此目录仍有未完成下载任务")
			}
			b, e := lookup(ctx, f)
			if e == nil && s.Resolve != nil && (b.Ready || r.AllowExisting) {
				b.Media, e = s.Resolve(ctx, b.Media, f)
			}
			return b, e
		}
		seen := map[string]bool{}
		for depth := 0; id != "" && id != "0"; depth++ {
			if blocked[id] {
				ancestorBlocked[f.ParentID] = true
				return Binding{}, fmt.Errorf("此目录仍有未完成下载任务")
			}
			if depth >= 32 || seen[id] {
				return Binding{}, fmt.Errorf("目录层级异常")
			}
			seen[id] = true
			parent, e := g.GetFile(id)
			if e != nil {
				return Binding{}, pan115.SafeError(e)
			}
			id = parent.ParentID
		}
		ancestorBlocked[f.ParentID] = false
		b, e := lookup(ctx, f)
		if e == nil && s.Resolve != nil && (b.Ready || r.AllowExisting) {
			b.Media, e = s.Resolve(ctx, b.Media, f)
		}
		return b, e
	})
	if e != nil {
		return p, e
	}
	p.Mode = "manual"
	if date != "" {
		p.Mode = "scheduled"
		p.RunDate = date
	}
	if execute {
		p.State = "running"
	}
	return s.Store.CreateOrganizePlan(p)
}
func (s *Service) Start(id string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, e := s.Store.OrganizePlan(id)
	if e != nil {
		return p, e
	}
	r, e := s.Store.OrganizeRule(p.Rule.ID)
	if e != nil {
		return p, e
	}
	if r.Version != p.Rule.Version || r.AccountID != p.Rule.AccountID {
		return p, ErrConflict
	}
	if p.State != "preview" && p.State != "paused" {
		return p, ErrConflict
	}
	p.State = "running"
	p.Error = ""
	e = s.Store.SaveOrganizePlan(p)
	if e == nil {
		p, e = s.Store.OrganizePlan(id)
	}
	return p, e
}
func (s *Service) Run(ctx context.Context, report func(string)) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		child, cancel := context.WithTimeout(ctx, 50*time.Second)
		e := s.Tick(child)
		cancel()
		if e != nil && ctx.Err() == nil && report != nil {
			report("公共整理任务处理失败，请查看整理计划")
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
func (s *Service) Tick(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	rules, e := s.Store.OrganizeRules()
	if e != nil {
		return e
	}
	now := time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600))
	running, e := s.Store.OrganizePlans(true)
	if e != nil {
		return e
	}
	activeRules := map[string]bool{}
	for _, plan := range running {
		activeRules[plan.Rule.ID] = true
	}
	for _, r := range rules {
		date := DueSlot(r, now)
		if date == "" || activeRules[r.ID] {
			continue
		}
		ran, e := s.Store.OrganizeRan(r.ID, date)
		if e != nil {
			return e
		}
		if ran {
			continue
		}
		if _, e = s.preview(ctx, r.ID, date, true); e != nil {
			return e
		}
	}
	plans, e := s.Store.OrganizePlans(true)
	if e != nil {
		return e
	}
	for _, p := range plans {
		if e = ctx.Err(); e != nil {
			return e
		}
		r, e := s.Store.OrganizeRule(p.Rule.ID)
		if e != nil {
			return e
		}
		if r.Version != p.Rule.Version {
			p.State = "paused"
			p.Error = "整理规则已变更，请重新预览"
			if e = s.Store.SaveOrganizePlan(p); e != nil {
				return e
			}
			continue
		}
		g, e := s.gateway(ctx, p.Rule.AccountID)
		if e != nil {
			p.State = "paused"
			p.Error = "115 账号或连接异常，请核对后恢复"
			if e = s.Store.SaveOrganizePlan(p); e != nil {
				return e
			}
			continue
		}
		processed := 0
		for i := range p.Actions {
			a := &p.Actions[i]
			if a.State == "completed" || a.State == "conflict" {
				continue
			}
			if processed >= 3 {
				break
			}
			processed++
			if e = s.execute(ctx, g, &p, i); e != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				p.State = "paused"
				a.Error = e.Error()
				p.Error = "有操作未完成，核对后恢复会先检查文件实际状态"
				_ = s.Store.SaveOrganizePlan(p)
				break
			}
			fresh, e := s.Store.OrganizePlan(p.ID)
			if e != nil {
				return e
			}
			p = fresh
		}
		if p.State == "running" {
			pending := false
			for _, a := range p.Actions {
				if a.State != "completed" && a.State != "conflict" {
					pending = true
				}
			}
			if pending {
				continue
			}
			p.State = "completed"
			if e = s.cleanupEmptyDirectories(ctx, g, p.Rule); e != nil {
				p.Issues = append(p.Issues, Issue{Code: "cleanup", Message: "空目录清理未完成：" + e.Error()})
			}
			for _, a := range p.Actions {
				if a.State == "conflict" {
					p.State = "completed_with_issues"
				}
			}
			if len(p.Issues) > 0 {
				p.State = "completed_with_issues"
			}
			if e = s.Store.SaveOrganizePlan(p); e != nil {
				return e
			}
		}
	}
	return nil
}
func (s *Service) save(p *Plan) error {
	if e := s.Store.SaveOrganizePlan(*p); e != nil {
		return e
	}
	p.Revision++
	return nil
}
func (s *Service) execute(ctx context.Context, g pan115.FileGateway, p *Plan, index int) error {
	rule, e := s.Store.OrganizeRule(p.Rule.ID)
	if e != nil {
		return e
	}
	if rule.Version != p.Rule.Version {
		return fmt.Errorf("规则或作品绑定已变更，请重新预览")
	}
	a := &p.Actions[index]
	f, e := g.GetFile(a.Source.ID)
	if e != nil {
		return pan115.SafeError(e)
	}
	if f.Directory || f.Size != a.Source.Size || a.Source.SHA1 != "" && !strings.EqualFold(f.SHA1, a.Source.SHA1) {
		return fmt.Errorf("文件内容已变更，请重新预览")
	}
	active, e := s.Store.OrganizeUnfinished(p.Rule.AccountID)
	if e != nil {
		return e
	}
	blocked := map[string]bool{}
	for _, task := range active {
		if task.AccountID == p.Rule.AccountID {
			blocked[task.DirectoryID] = true
		}
	}
	parentID := f.ParentID
	seen := map[string]bool{}
	for depth := 0; parentID != "" && parentID != "0"; depth++ {
		if blocked[parentID] {
			return fmt.Errorf("文件所在目录仍有未完成下载，暂停整理")
		}
		if depth >= 32 || seen[parentID] {
			return fmt.Errorf("目录层级异常")
		}
		seen[parentID] = true
		parent, e := g.GetFile(parentID)
		if e != nil {
			return pan115.SafeError(e)
		}
		parentID = parent.ParentID
	}
	if a.TargetParentID == "" {
		parent := a.TargetRootID
		for _, name := range a.TargetDirectories {
			if e = ctx.Err(); e != nil {
				return e
			}
			list, e := g.ListFiles(parent)
			if e != nil {
				return pan115.SafeError(e)
			}
			id := ""
			for _, candidate := range list {
				if strings.EqualFold(candidate.Name, name) {
					if !candidate.Directory || id != "" {
						return fmt.Errorf("目标目录名称冲突")
					}
					id = candidate.ID
				}
			}
			if id == "" {
				folder, e := g.CreateDirectory(parent, name)
				if e != nil {
					return pan115.SafeError(e)
				}
				if !folder.Directory || folder.ParentID != parent {
					return fmt.Errorf("新建目标目录返回异常")
				}
				id = folder.ID
			}
			parent = id
		}
		a.TargetParentID = parent
		if e = s.save(p); e != nil {
			return e
		}
	}
	if f.ParentID != a.Source.ParentID && f.ParentID != a.TargetParentID {
		return fmt.Errorf("来源文件已被其他操作移动")
	}
	if f.Name != a.Source.Name && f.Name != a.TargetName {
		return fmt.Errorf("来源文件已被其他操作改名")
	}
	list, e := g.ListFiles(a.TargetParentID)
	if e != nil {
		return pan115.SafeError(e)
	}
	for _, candidate := range list {
		if strings.EqualFold(candidate.Name, a.TargetName) && candidate.ID != f.ID {
			return fmt.Errorf("目标已有同名文件，保留来源文件")
		}
	}
	if f.Name != a.TargetName {
		siblings, e := g.ListFiles(f.ParentID)
		if e != nil {
			return pan115.SafeError(e)
		}
		for _, candidate := range siblings {
			if strings.EqualFold(candidate.Name, a.TargetName) && candidate.ID != f.ID {
				return fmt.Errorf("来源目录存在改名冲突")
			}
		}
		a.State = "renaming"
		if e = s.save(p); e != nil {
			return e
		}
		if e = g.RenameFile(f.ID, a.TargetName); e != nil {
			return pan115.SafeError(e)
		}
		f, e = g.GetFile(f.ID)
		if e != nil {
			return pan115.SafeError(e)
		}
		if f.Name != a.TargetName {
			return fmt.Errorf("改名结果尚未确认")
		}
	}
	a.State = "renamed"
	if e = s.save(p); e != nil {
		return e
	}
	if f.ParentID != a.TargetParentID {
		a.State = "moving"
		if e = s.save(p); e != nil {
			return e
		}
		if e = g.MoveFile(f.ID, a.TargetParentID); e != nil {
			return pan115.SafeError(e)
		}
	}
	f, e = g.GetFile(f.ID)
	if e != nil {
		return pan115.SafeError(e)
	}
	if f.ParentID != a.TargetParentID || f.Name != a.TargetName {
		return fmt.Errorf("移动结果尚未确认")
	}
	a.State = "completed"
	a.Error = ""
	return s.save(p)
}
