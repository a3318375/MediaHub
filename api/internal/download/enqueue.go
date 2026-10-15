package download

import (
	"context"

	"media-center/internal/pan115"
)

// EnqueueToLibrary is the common entry for movies, TV and future channel matches.
// It validates before contacting 115 and binds directory resolution and enqueue
// to one account, including when credentials are edited during a remote request.
func (s *Service) EnqueueToLibrary(ctx context.Context, r Request) (Task, bool, error) {
	if err := ctx.Err(); err != nil {
		return Task{}, false, err
	}
	r.DirectoryID = "1"
	if _, err := Validate(&r); err != nil {
		return Task{}, false, err
	}
	cookie, err := s.Store.ReadSecret("115", "115.cookie")
	if err != nil {
		return Task{}, false, err
	}
	account, err := pan115.AccountID(cookie)
	if err != nil {
		return Task{}, false, err
	}
	directory, err := s.ResolveLibraryDirectory(ctx, r.Reference.Media.Type)
	if err != nil {
		return Task{}, false, err
	}
	r.DirectoryID = directory
	if err := ctx.Err(); err != nil {
		return Task{}, false, err
	}
	return s.enqueue(r, account)
}
