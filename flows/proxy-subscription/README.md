# 代理订阅

12 小时一刷：拉取订阅、解析节点、交宿主写入设置。

**输入**：设置页「订阅地址」→ `storage.kv` 的 `proxy.subscription.url`；
未配置或拉取失败时回落到内置 demo 链接，保证路径可演示。

**支持的订阅形态**：

- Clash YAML `proxies:` 段（浅解析器：`- {inline}` 与缩进 `key: value` 两种）
- 分享链接：`vmess://`、`vless://`、`trojan://`、`anytls://`、`hysteria2://`/`hy2://`
- 字段：WS / gRPC / REALITY / xtls-rprx-vision / obfs

**输出**：`installNodes`（节点 intent → 宿主设置页装节点）+ `openView`。
本 flow 不直接写代理配置——那是宿主的权限。
