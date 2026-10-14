package store

import "strings"

func MaskSecret(value string) string {
	chars := []rune(value)
	if len(chars) <= 2 {
		return strings.Repeat("•", 8)
	}
	if len(chars) <= 8 {
		return string(chars[:1]) + strings.Repeat("•", 8) + string(chars[len(chars)-1:])
	}
	return string(chars[:4]) + strings.Repeat("•", 8) + string(chars[len(chars)-4:])
}
func IsSecretSetting(section, key string) bool {
	return strings.HasPrefix(key, section+".") && secretSettingNames[key]
}
func (s *Store) ReadSettingMasks(section string, keys []string) (map[string]string, error) {
	out := map[string]string{}
	for _, key := range keys {
		if !IsSecretSetting(section, key) {
			continue
		}
		value, e := s.ReadSecret(section, key)
		if e != nil {
			return nil, e
		}
		out[key] = MaskSecret(value)
	}
	return out, nil
}
