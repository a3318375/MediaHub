package discovery

import "sort"

type Registry struct{ providers map[string]Provider }

func NewRegistry(ps ...Provider) *Registry {
	r := &Registry{providers: map[string]Provider{}}
	for _, p := range ps {
		r.providers[p.Capabilities().Source] = p
	}
	return r
}
func (r *Registry) Get(source string) (Provider, error) {
	p, ok := r.providers[source]
	if !ok {
		return nil, Unsupported("source")
	}
	return p, nil
}
func (r *Registry) Capabilities() []Capabilities {
	out := []Capabilities{}
	for _, p := range r.providers {
		out = append(out, p.Capabilities())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Source < out[j].Source })
	return out
}
