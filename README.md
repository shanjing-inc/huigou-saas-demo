# 合作方返利小程序联调 Demo

原生微信小程序 + **仅监听本机回环地址**的 Node BFF。界面只展示隔离测试环境的真实返回；不含模拟订单、不提供收款账号登记、提现申请、处理方状态流转或打款。转链成功不代表订单产生。合作方业务导览参见生产仓库 `saas/docs/partner-guide.html`；本文档仅说明如何运行 Demo，不复制接口指南。

## 前提与安全

- Node.js >= 20.11；微信开发者工具模拟器；一套**专用隔离测试环境**、获授权的 App Key/Secret、organizationId、teamId、**隔离测试成员 OpenID**，以及已开通联盟的有效测试物料。不要使用生产客户账号、生产凭证或客户真实订单。只有本机回环地址允许用 HTTP 接入本地启动的 saas 开发服务；其他地址仍须 HTTPS。
- `.env` 只能存在于本机；不提交、不截图、不放日志。小程序仅保存内存中的随机 BFF 会话 ID；真正的成员 JWT 仅在 BFF 内存。BFF 重启后会话失效。
- 不调用 `wx.login` 或 `code2Session`。固定测试 OpenID 只用于隔离 Demo；**正式接入必须由合作方可信登录服务认证用户并提供 OpenID**，不能将此固定身份机制带入生产。
- 这个本机 BFF 未提供面向公网的用户认证或设备鉴权；只允许在受信任开发机运行，不端口转发、不绑定公网、不部署成共享测试服务。

## 启动与最短操作链

1. 将 `.env.example` 复制成不提交的 `.env`，仅在本机填写测试值。`DEMO_API_BASE_URL` 填测试服务的 HTTPS 站点根地址（如 `https://test.example.com`）；若本机启动 saas 开发服务，可填 `http://127.0.0.1:4322`（只允许 `localhost` 或 `127.0.0.1`）。BFF 会分别调用 `/api/graphql/application` 和 `/api/graphql/member`。默认端口为 8787；更改 `DEMO_PORT` 时须同步修改 `miniprogram/pages/index/index.js` 的 `BASE`。
2. 在仓库根目录运行 `node --env-file=.env bff/server.mjs`（或 `pnpm dev`）。检查 `http://127.0.0.1:8787/api/status` 的 `configured: true`；它**仅表示私有配置格式有效**，不是接口联通结果。
3. 微信开发者工具中导入仓库根目录。`project.config.json` 的 AppID 是本机可用的测试号，其他机器需替换为自己的测试 AppID。仅在**本地**设置 `project.private.config.json` 的 `setting.urlCheck: false`，允许模拟器访问 `http://127.0.0.1:8787`；该文件已忽略，严禁上传此开发期放宽配置。真机与体验版不在验收范围。
4. 点击「连接测试环境」验证 `login → getProfile`；粘贴**有效测试物料**解析，明确选择候选，按需查询详情，然后生成真实转链。订单、账单、提现标签会直接查询真实测试环境（含空列表）并按需加载下一页。
5. 退出：关闭开发者工具项目窗口；在运行 BFF 的终端按 `Ctrl+C`。会话仅保存在 BFF 内存，退出即清除。

确认本机 saas 开发服务 `127.0.0.1:4322` 指向隔离数据库、调试页可预填时，可运行 `node verify/local-smoke.mjs`：它临时启动 8787 的 BFF，用随机合成 OpenID 在该数据库创建测试成员、连接模拟器并检查成员与三个空列表，结束时关闭 BFF。脚本不会查询外部解析服务或触发转链；需要先完成微信开发者工具授权并打开此小程序项目窗口。不要对生产或共享客户数据库执行。

## 协议边界

- 应用签名：`x-app-key`、秒级 `x-timestamp`、`x-signature`；签名为 GraphQL variables 中非空字段按 key 升序拼接 `key=value` 并追加 Secret 后的 **MD5 小写十六进制**。`login` 的 OpenID/organizationId/teamId 来自 BFF 私有配置，客户端无法覆盖。
- 成员请求仅走 `Authorization: Bearer <JWT>`，限定为 `getProfile`、`parsePromotionMaterial`、按需 `getPromotionItem`、`createPromotionLink`、`listOrders`、`listBills`、`listWithdrawals`。客户端和 BFF 均不支持任意 GraphQL 查询。
- 字段以本仓实现时 `saas/src/graphql/generated/{application,member}-schema.graphql` 为基线；请在实际联调目标上复核 SDL 和提现状态。本 Demo **不预设**尚未上线的转链入参变更或免审核提现流程。
- 上游错误只对外返回安全的错误码/提示，不透传原始报错、Secret、JWT 或完整客户信息；订单只取编号/金额/状态等展示字段，提现不请求账号快照。错误凭证返回 `LOGIN_FAILED`，成员 Token 失效返回 `SESSION_EXPIRED` 并清空会话。

## 离线验证

`pnpm test`（或 `node --test tests/*.test.mjs`）使用本地模拟 GraphQL 响应，**只验证请求协议和页面所需字段，不证明真实联调**。真实转链验收需另行提供合法隔离测试凭证和可用联盟物料；没有时必须如实标记未完成。
