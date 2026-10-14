package discovery

import "fmt"

type ErrorKind string

const InvalidResponse ErrorKind = "InvalidResponse"

type Error struct {
	Kind       ErrorKind
	Status     int
	Message    string
	RetryAfter string
}

func (e *Error) Error() string                 { return e.Message }
func Problem(status int, message string) error { return &Error{Status: status, Message: message} }
func Invalid() error {
	return &Error{Status: 502, Kind: InvalidResponse, Message: "上游返回格式异常"}
}
func Unsupported(field string) error {
	return Problem(400, fmt.Sprintf("该来源不支持 %s 参数或组合", field))
}
