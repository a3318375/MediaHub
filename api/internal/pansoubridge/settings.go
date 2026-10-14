package pansoubridge

import (
	"encoding/json"
	"fmt"
)

type SettingsStore interface {
	ReadSettings(string) (map[string]any, []string, error)
	SaveSettings(string, map[string]json.RawMessage, []string) error
}

type SearchSettings struct {
	Channels         []string `json:"channels"`
	Plugins          []string `json:"plugins"`
	CloudTypes       []string `json:"cloudTypes"`
	CustomChannels   []string `json:"customChannels"`
	DetectionEnabled bool     `json:"detectionEnabled"`
}

// Startup fills missing keys, preserving explicit [] and false selections.
func (b *Bootstrap) InitializeSettings(db SettingsStore) error {
	values, _, err := db.ReadSettings("pansou")
	if err != nil {
		return err
	}
	defaults := b.defaultSettings()
	seed := map[string]any{
		"pansou.channels": defaults.Channels, "pansou.plugins": defaults.Plugins,
		"pansou.cloudTypes": defaults.CloudTypes, "pansou.customChannels": []string{},
		"pansou.detectionEnabled": false, "pansou.configVersion": 1,
	}
	missing := map[string]json.RawMessage{}
	_, versioned := values["pansou.configVersion"]
	if version, ok := values["pansou.configVersion"].(float64); ok && version < 1 {
		versioned = false
	}
	for key, value := range seed {
		if saved, exists := values[key]; exists {
			legacyEmpty := false
			if !versioned && (key == "pansou.channels" || key == "pansou.plugins" || key == "pansou.cloudTypes") {
				if list, ok := saved.([]any); ok && len(list) == 0 {
					legacyEmpty = true
				}
			}
			if !legacyEmpty && (key != "pansou.configVersion" || versioned) {
				continue
			}
		}
		missing[key], err = json.Marshal(value)
		if err != nil {
			return err
		}
	}
	if len(missing) > 0 {
		if err := db.SaveSettings("pansou", missing, nil); err != nil {
			return err
		}
	}
	b.settings = db
	_, err = b.ReadSearchSettings()
	return err
}

func (b *Bootstrap) defaultSettings() SearchSettings {
	return SearchSettings{Channels: append([]string{}, b.channels...), Plugins: append([]string{}, b.plugins...), CloudTypes: append([]string{}, supportedCloudTypes...), CustomChannels: []string{}}
}

func (b *Bootstrap) ReadSearchSettings() (SearchSettings, error) {
	selected := b.defaultSettings()
	if b.settings == nil {
		return selected, nil
	}
	values, _, err := b.settings.ReadSettings("pansou")
	if err != nil {
		return selected, err
	}
	rawValues := map[string]json.RawMessage{}
	for key, value := range values {
		rawValues[key], err = json.Marshal(value)
		if err != nil {
			return selected, err
		}
	}
	if err := ValidateSettings(rawValues); err != nil {
		return selected, err
	}
	for key, target := range map[string]*[]string{
		"pansou.channels": &selected.Channels, "pansou.plugins": &selected.Plugins,
		"pansou.cloudTypes": &selected.CloudTypes, "pansou.customChannels": &selected.CustomChannels,
	} {
		if raw, exists := rawValues[key]; exists {
			if err := json.Unmarshal(raw, target); err != nil {
				return selected, err
			}
		}
	}
	if raw, exists := rawValues["pansou.detectionEnabled"]; exists {
		if err := json.Unmarshal(raw, &selected.DetectionEnabled); err != nil {
			return selected, err
		}
	}
	// A plugin can disappear after updating; do not turn an empty selection into all.
	allowed := make(map[string]bool, len(b.plugins))
	for _, name := range b.plugins {
		allowed[name] = true
	}
	filtered := make([]string, 0, len(selected.Plugins))
	for _, name := range selected.Plugins {
		if allowed[name] {
			filtered = append(filtered, name)
		}
	}
	selected.Plugins = filtered
	for i, cloud := range selected.CloudTypes {
		if cloud == "other" {
			selected.CloudTypes[i] = "others"
		}
	}
	return selected, nil
}

func ValidateSettings(values map[string]json.RawMessage) error {
	for key, raw := range values {
		switch key {
		case "pansou.channels", "pansou.customChannels", "pansou.plugins", "pansou.cloudTypes":
			var names []string
			if err := json.Unmarshal(raw, &names); err != nil || names == nil {
				return fmt.Errorf("%s must be an array of strings", key)
			}
			limit := 200
			if key == "pansou.plugins" {
				limit = 100
			}
			if key == "pansou.cloudTypes" {
				limit = len(supportedCloudTypes)
			}
			if len(names) > limit {
				return fmt.Errorf("too many entries in %s", key)
			}
			for _, name := range names {
				if !cloudTypeRE.MatchString(name) {
					return fmt.Errorf("invalid name in %s", key)
				}
				if key == "pansou.cloudTypes" && !knownCloudType(name) {
					return fmt.Errorf("unsupported cloud type %s", name)
				}
			}
		case "pansou.detectionEnabled":
			var flag bool
			if string(raw) == "null" || json.Unmarshal(raw, &flag) != nil {
				return fmt.Errorf("%s must be a boolean", key)
			}
		case "pansou.configVersion":
			var version int
			if json.Unmarshal(raw, &version) != nil || version != 1 {
				return fmt.Errorf("unsupported PanSou settings version")
			}
		default:
			return fmt.Errorf("unknown PanSou setting %s", key)
		}
	}
	return nil
}

func knownCloudType(name string) bool {
	if name == "other" {
		return true
	}
	for _, cloud := range supportedCloudTypes {
		if name == cloud {
			return true
		}
	}
	return false
}
