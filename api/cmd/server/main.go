package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"media-center/internal/anime"
	"media-center/internal/animesync"
	"media-center/internal/download"
	"media-center/internal/httpapi"
	"media-center/internal/organize"
	"media-center/internal/pansoubridge"
	"media-center/internal/store"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	dataDir := os.Getenv("MEDIA_CENTER_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	db, err := store.Open(filepath.Clean(dataDir))
	if err != nil {
		return err
	}
	defer db.Close()
	search, err := pansoubridge.New(filepath.Clean(dataDir))
	if err != nil {
		return fmt.Errorf("initialize PanSou in-process search: %w", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := search.Shutdown(ctx); err != nil {
			log.Printf("PanSou shutdown: %v", err)
		}
	}()

	if err := search.InitializeSettings(db); err != nil {
		return fmt.Errorf("initialize PanSou settings: %w", err)
	}
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":18080"
	}
	updater := animesync.New(db, anime.New())
	schedulerCtx, stopScheduler := context.WithCancel(context.Background())
	schedulerDone := make(chan struct{})
	go func() {
		defer close(schedulerDone)
		updater.Run(schedulerCtx, func(message string) { _ = db.RecordLog("anime", "WARN", message) })
	}()
	defer func() { stopScheduler(); <-schedulerDone }()
	downloads := download.New(db)
	downloads.FetchTorrent = anime.New().Fetch
	downloadCtx, stopDownloads := context.WithCancel(context.Background())
	downloadDone := make(chan struct{})
	go func() {
		defer close(downloadDone)
		downloads.Run(downloadCtx, func(message string) { _ = db.RecordLog("download", "WARN", message) })
	}()
	defer func() { stopDownloads(); <-downloadDone }()
	organizer := &organize.Service{Store: db, Factory: downloads.Factory}
	handler := httpapi.NewRouterWithOrganizer(db, updater, downloads, organizer, search.Handler(), search.MetaHandler(), search.CheckHandler())
	if staticDir := os.Getenv("MEDIA_CENTER_WEB_DIR"); staticDir != "" {
		if err := httpapi.MountFrontend(handler, staticDir); err != nil {
			return err
		}
	}
	organizeCtx, stopOrganize := context.WithCancel(context.Background())
	organizeDone := make(chan struct{})
	go func() {
		defer close(organizeDone)
		organizer.Run(organizeCtx, func(message string) { _ = db.RecordLog("organize", "WARN", message) })
	}()
	defer func() { stopOrganize(); <-organizeDone }()
	server := &http.Server{Addr: addr, Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	serverDone := make(chan error, 1)
	go func() { serverDone <- server.ListenAndServe() }()
	stopped := make(chan os.Signal, 1)
	signal.Notify(stopped, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stopped)
	log.Printf("media-center API listening on %s (data: %s)", addr, dataDir)

	select {
	case err := <-serverDone:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-stopped:
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		_ = server.Close()
		return fmt.Errorf("HTTP server shutdown: %w", err)
	}
	if err := <-serverDone; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
