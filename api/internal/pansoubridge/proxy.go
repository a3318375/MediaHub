package pansoubridge

import (
	"os"
	"strings"
)

func initializeProxyEnvironment() error {
	for _, key := range []string{"PROXY", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"} {
		if strings.TrimSpace(os.Getenv(key)) != "" {
			return nil
		}
	}
	return configureSystemProxy()
}

func windowsProxyAddresses(raw string) (string, string) {
	normalize := func(value string) string {
		value = strings.TrimSpace(value)
		if value != "" && !strings.Contains(value, "://") {
			value = "http://" + value
		}
		return value
	}
	if !strings.Contains(raw, "=") {
		value := normalize(raw)
		return value, value
	}
	var httpProxy, httpsProxy string
	for _, entry := range strings.Split(raw, ";") {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		switch strings.TrimSpace(strings.ToLower(key)) {
		case "http":
			httpProxy = normalize(value)
		case "https":
			httpsProxy = normalize(value)
		}
	}
	if httpProxy == "" {
		httpProxy = httpsProxy
	}
	if httpsProxy == "" {
		httpsProxy = httpProxy
	}
	return httpProxy, httpsProxy
}
