//go:build windows

package pansoubridge

import (
	"golang.org/x/sys/windows/registry"
	"os"
	"strings"
)

// Read the current developer machine's proxy; never change Windows settings.
func configureSystemProxy() error {
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return nil
	}
	defer key.Close()
	enabled, _, err := key.GetIntegerValue("ProxyEnable")
	if err != nil || enabled == 0 {
		return nil
	}
	raw, _, err := key.GetStringValue("ProxyServer")
	if err != nil || strings.TrimSpace(raw) == "" {
		return nil
	}
	httpProxy, httpsProxy := windowsProxyAddresses(raw)
	if httpProxy != "" {
		if err := os.Setenv("HTTP_PROXY", httpProxy); err != nil {
			return err
		}
	}
	if httpsProxy != "" {
		if err := os.Setenv("HTTPS_PROXY", httpsProxy); err != nil {
			return err
		}
	}
	return nil
}
