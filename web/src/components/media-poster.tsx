import { useEffect, useState } from "react"
import { getAccessToken } from "@/lib/auth-api"
import { cn } from "@/lib/utils"

// The authenticated Douban proxy cannot receive a Bearer token through an img tag.
// 豆瓣签名 CDN（*-sign.doubanio.com）会拒绝携带其它站点 Referer 的请求（403），
// 因此对豆瓣图片显式关闭 Referer；其它 CDN 不受影响。
function referrerPolicyFor(src: string): "no-referrer" | undefined {
  try {
    const host = new URL(src, "http://localhost").hostname
    return /(^|\.)doubanio\.com$/i.test(host) ? "no-referrer" : undefined
  } catch {
    return undefined
  }
}

export function MediaPoster({
  src,
  alt,
  className,
  loading,
  fallbackLabel = "暂无海报",
}: {
  src: string
  alt: string
  className?: string
  loading?: "lazy" | "eager"
  fallbackLabel?: string
}) {
  const [image, setImage] = useState<{ source: string; url: string } | null>(
    null
  )
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const proxy = src.startsWith("/api/media/image?")
  useEffect(() => {
    if (!proxy) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    const token = getAccessToken()
    void fetch(src, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("图片不可用")
        const blob = await response.blob()
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setImage({ source: src, url: objectUrl })
      })
      .catch(() => undefined)
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, proxy])
  const url = proxy ? (image?.source === src ? image.url : undefined) : src
  return url && failedSource !== src ? (
    <img
      src={url}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy={referrerPolicyFor(src)}
      onError={() => setFailedSource(src)}
    />
  ) : (
    <span
      className={cn(
        "flex items-center justify-center p-4 text-xs text-muted-foreground",
        className
      )}
    >
      {fallbackLabel}
    </span>
  )
}
