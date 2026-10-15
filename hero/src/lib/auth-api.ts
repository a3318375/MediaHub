import { readSession } from "./media-service";

// All migrated adapters share the HeroUI session; never use the old frontend's token.
export function getAccessToken() {
  const session = readSession();
  if (session?.mode !== "live")
    throw new Error("请连接 MediaHub 服务后使用此功能");
  return session.token;
}
