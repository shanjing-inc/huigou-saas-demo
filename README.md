# 合作方返利小程序联调 Demo

原生微信小程序 + **仅监听本机回环地址**的 Node 后端。界面展示隔离测试环境的真实返回；不含模拟订单或处理方打款操作。收款账号登记/修改/删除和提现申请须本机显式开启，默认禁用。转链成功不代表订单产生。合作方业务导览请使用对接人交付的接入指南；本文档仅说明如何运行 Demo，不复制接口指南。

接手维护请先阅读 [交接文档](docs/handover.md)；本文档保留启动步骤和接口安全约束。

AI 辅助对接请先阅读 [合作方 GraphQL skill](skills/partner-rebate-api/SKILL.md)；它说明签名、目标环境 Schema 和授权调用边界，不替代对接人的环境授权。

## 前提与安全

- Node.js >= 20.11；微信开发者工具模拟器；一套**专用隔离测试环境**、获授权的 App Key/Secret、organizationId、teamId、**隔离测试成员 OpenID**，以及已开通联盟的有效测试物料。不要使用生产客户账号、生产凭证或客户真实订单。联调目标服务须提供 HTTPS 地址。
- `.env` 只能存在于本机；不提交、不截图、不放日志。小程序仅保存内存中的随机后端会话 ID；真正的成员 JWT 仅在后端内存。后端重启后会话失效。
- 不调用 `wx.login` 或 `code2Session`。固定测试 OpenID 只用于隔离 Demo；**正式接入必须由合作方可信登录服务认证用户并提供 OpenID**，不能将此固定身份机制带入生产。
- 这个本机后端未提供面向公网的用户认证或设备鉴权；只允许在受信任开发机运行，不端口转发、不绑定公网、不部署成共享测试服务。
- 资金写入默认关闭。**仅在确认接入的服务、成员及余额均为专用隔离测试数据且已获授权后**，才在本机 `.env` 中设置 `DEMO_ENABLE_FINANCIAL_WRITES=1` 并重启后端。HTTPS、`/api/status` 的 `configured: true` 均不等于隔离环境证明；不要把开关用于生产或共享环境。

## 启动与最短操作链

1. 将 `.env.example` 复制成不提交的 `.env`，仅在本机填写测试值。`DEMO_API_BASE_URL` 填对接人提供的测试服务 HTTPS 站点根地址（如 `https://test.example.com`）。后端会分别调用 `/api/graphql/application` 和 `/api/graphql/member`。默认端口为 8787；更改 `DEMO_PORT` 时须同步修改 `miniprogram/pages/index/index.js` 的 `BASE`。
2. 在仓库根目录运行 `pnpm backend`（已有的 `pnpm dev` 也可用）。检查 `http://127.0.0.1:8787/api/status` 的 `configured: true`；它**仅表示私有配置格式有效**，不是接口联通结果。若小程序已先打开、后端稍后才启动，在页面点击「重新检测本机后端」；修改 `.env` 或更新后端代码后须先在原终端 `Ctrl+C` 停止旧进程，再运行 `pnpm backend` 并重新连接。新版状态响应应包含 `financialWritesEnabled` 布尔值；缺少该字段说明 8787 端口仍由旧版进程提供服务。
3. 微信开发者工具中导入仓库根目录。`project.config.json` 的 AppID 是本机可用的测试号，其他机器需替换为自己的测试 AppID。仅在**本地**设置 `project.private.config.json` 的 `setting.urlCheck: false`，允许模拟器访问 `http://127.0.0.1:8787`；该文件已忽略，严禁上传此开发期放宽配置。真机与体验版不在验收范围。
4. 点击「连接测试环境」验证 `login → getProfile`；粘贴**有效测试物料**解析，明确选择候选，按需查询详情，然后生成真实转链。订单、账单、提现标签直接查询真实测试环境（含空列表）并按需加载下一页。钱包页显示实际成员余额及按日/月/年的收益统计。
5. 钱包的「管理收款账号」始终可查看脱敏账号；开启写操作后可登记支付宝、微信 OpenID 或银行卡账号，修改姓名/证件号或删除登记。账号号码、类型和开户行不能原地修改，需登记新账号再删除旧账号。首次登记自动成为默认；申请提现时选择收款账号、输入不低于 1 元且最多两位小数的金额，在确认弹窗复核后提交；成功会占用可用余额并更新默认账号，请查看提现记录确认处理状态。遇到超时或刷新失败，**先查看提现记录，不要重复提交**。
6. 退出：关闭开发者工具项目窗口；在运行后端的终端按 `Ctrl+C`。会话仅保存在后端内存，退出即清除。

## 协议边界

- 应用签名：`x-app-key`、秒级 `x-timestamp`、`x-signature`；签名为 GraphQL variables 中非空字段按 key 升序拼接 `key=value` 并追加 Secret 后的 **MD5 小写十六进制**。`login` 的 OpenID/organizationId/teamId 来自后端私有配置，客户端无法覆盖。
- 成员请求仅走 `Authorization: Bearer <JWT>`，限定为 `getProfile`、`parsePromotionMaterial`、按需 `getPromotionItem`、`createPromotionLink`、`listOrders`、`listBills`、`listWithdrawals`、`listWithdrawalAccounts` 和开关保护的账号增删改及 `requestWithdrawal`。钱包统计使用应用签名调用 `listRevenueStatistic`，成员 ID 固定由后端会话确认，客户端不能选择其他成员或任意日期。客户端和后端均不支持任意 GraphQL 查询。
- 接口字段与提现状态以实际联调目标环境的 application/member GraphQL Schema 为准；如与 Demo 不一致，请联系对接人确认。本 Demo **不预设**尚未上线的转链入参变更或免审核提现流程。
- 上游错误只对外返回安全的错误码/提示，不透传原始报错、Secret、JWT 或完整客户信息；账号列表仅返回脱敏账号/姓名，证件号和银行扩展信息不下发，提现不请求账号快照。错误凭证返回 `LOGIN_FAILED`，成员 Token 失效返回 `SESSION_EXPIRED` 并清空会话。资金写请求结果不明时返回 `UNCERTAIN`，须查询提现记录，切勿直接重试。

## 离线验证

`pnpm test`（或 `node --test tests/*.test.mjs`）使用本地模拟 GraphQL 响应，**只验证请求协议和页面所需字段，不证明真实联调或真实提现成功**。真实转链及资金操作验收需另行提供合法隔离测试凭证、资金及可用物料；没有时必须如实标记未完成。
