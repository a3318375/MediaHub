package main

import (
 "bytes"
 "context"
 "encoding/json"
 "fmt"
 "io"
 "net/http"
 "os"
 "strings"
 "time"
 "mediahub/internal/store"
)

func main() {
 if err := send(); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
}

func send() error {
 db, err := store.Open("../data")
 if err != nil { return fmt.Errorf("无法打开 MediaHub 数据库") }
 defer db.Close()
 token, err := db.ReadSecret("notifications", "notifications.botToken")
 if err != nil || strings.TrimSpace(token) == "" { return fmt.Errorf("尚未保存 TG Bot Token") }
 values, _, err := db.ReadSettings("notifications")
 if err != nil { return fmt.Errorf("读取通知配置失败") }
 chatID := fmt.Sprint(values["notifications.chatId"])
 if chatID == "" || chatID == "<nil>" { return fmt.Errorf("尚未保存 TG Chat ID") }
 body, err := json.Marshal(map[string]string{"chat_id":chatID, "text":"MediaHub 测试通知\nTelegram 消息发送正常。"})
 if err != nil { return fmt.Errorf("生成测试消息失败") }
 ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
 defer cancel()
 req, err := http.NewRequestWithContext(ctx, "POST", "https://api.telegram.org/bot"+strings.TrimSpace(token)+"/sendMessage", bytes.NewReader(body))
 if err != nil { return fmt.Errorf("Bot Token 格式无效") }
 req.Header.Set("Content-Type", "application/json")
 client := &http.Client{Timeout:20*time.Second, CheckRedirect:func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
 resp, err := client.Do(req)
 if err != nil { return fmt.Errorf("Telegram 网络请求失败，请检查服务器网络或代理") }
 defer resp.Body.Close()
 var result struct { OK bool `json:"ok"`; Description string `json:"description"`; Result struct { MessageID int64 `json:"message_id"` } `json:"result"` }
 if err = json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&result); err != nil { return fmt.Errorf("Telegram 返回无效响应（HTTP %d）",resp.StatusCode) }
 if !result.OK { return fmt.Errorf("Telegram 拒绝发送（HTTP %d）：%s",resp.StatusCode, strings.ReplaceAll(result.Description, token, "[redacted]")) }
 fmt.Printf("测试消息已发送，message_id=%d\n", result.Result.MessageID)
 return nil
}
