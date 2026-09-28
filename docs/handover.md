# 合作方返利小程序 Demo 交接

本文档随 Demo 仓库维护，记录接手时需要的代码边界、验证方式和安全约束。启动命令、环境变量示例以根目录 [README](../README.md) 和 `.env.example` 为准；合作方业务定义以生产仓库 `saas/docs/partner-guide.html` 为准。联调进度和阻塞事项以 FEATURE-682 议题为准，不在这里复制状态。

源码仓库：[saas-demo](https://codeup.aliyun.com/shanjing/huigou/saas-demo)（`master`）；SSH 克隆地址：`git@codeup.aliyun.com:shanjing/huigou/saas-demo.git`。

## 代码与数据流

| 位置 | 作用 |
| --- | --- |
| `miniprogram/pages/index/` | 唯一页面：连接测试身份、解析与选择候选、读取商品详情、转链、查看资金记录。 |
| `bff/server.mjs`、`bff/http.mjs` | 仅监听 `127.0.0.1` 的 Node HTTP 服务；仅开放固定 `/api/*` 路由。 |
| `bff/core.mjs`、`bff/queries.mjs` | 固定测试身份登录、签名、会话内存、输入校验和允许调用的 GraphQL 操作。 |
| `tests/` | 模拟上游的协议及小程序行为测试；不证明真实环境联通。 |
| `verify/` | 微信模拟器验证脚本，运行条件各不相同，见下文。 |

小程序只向本机 BFF 请求。BFF 用私有 App Key/Secret 和隔离测试 OpenID 调用 application GraphQL `login`，成员 JWT 只保留在 BFF 内存，页面持有随机会话 ID。后续 member GraphQL 请求通过该 JWT 访问；BFF 重启或会话失效后须重新连接。

解析分享内容得到候选后，页面最多并发两条 `getPromotionItem` 查询，逐步补齐真实图片、价格、券、可估算返利和店铺；上游失败时仍可选候选。商品详情优先按解析出的 `itemId` 查询，转链仍使用候选的 `itemUrl`。上游没有的字段不补造；返利状态为 `-1` 时不展示响应中的占位金额。订单、账单和提现仅展示测试环境返回的记录，不提供资金写操作。

## 接手环境

1. 确认 Node.js >= 20.11、pnpm、微信开发者工具及有授权的测试 AppID；只在隔离测试环境操作，不使用生产客户账号或真实订单。模拟器验证脚本调用 `wechatide -c Codex`，运行前须在本机完成该 clientName 的开发者工具授权。
2. 从隔离环境的授权负责人取得测试服务地址、应用凭证、组织/Team ID、专用测试 OpenID 和已开通联盟的物料；自行在本机用 `.env.example` 创建 `.env`。不要在仓库、文档、截图、议题或命令日志中写入凭证和成员 JWT。
3. 按 [README 的启动步骤](../README.md#启动与最短操作链) 启动 saas 测试服务（若需要）和本地 BFF。`/api/status` 的 `configured: true` 只证明配置格式有效，不代表登录、商品上游或转链可用。默认 BFF 端口为 8787；改端口须同步修改小程序的 `BASE`。
4. 在微信开发者工具导入仓库根目录。仅本地关闭 `project.private.config.json` 中的合法域名校验以访问本机 BFF；该文件被忽略，不要提交此设置，也不要将 BFF 端口映射公网。真机、体验版及公开部署不属于此 Demo 的验收范围。

## 验证顺序

- `pnpm test`：运行离线协议和页面行为测试。测试里的上游响应是模拟数据，不能替代联调验收。
- `verify/simulator.sh`：**仅用于未配置 BFF 的离线首屏**，断言未连接状态；不要把它当作已连接环境的用例。
- `node verify/local-smoke.mjs`：仅在确认本机 saas `127.0.0.1:4322` 指向可写的**隔离数据库**、开发调试页可预填且本机 8787 未被占用时运行。它会创建合成测试成员、临时启动 BFF，并核对资料和三个列表；不会调用转链。禁止在生产或共享客户数据库运行。
- `DEMO_TEST_MATERIAL='<获授权的测试商品链接>' node verify/candidate-cards.mjs`：先启动配置好的本地 BFF 并打开小程序模拟器。脚本会登录、解析、只读查询商品详情，确认至少一张卡片有真实图片和价格；截图写到被 Git 忽略的 `verify/candidate-cards.jpg`。商品上游不可用会使本项失败，不能用假图或硬编码价格绕过。

在联调目标上再手工核对 `login → getProfile → parsePromotionMaterial → getPromotionItem`。**只有确认专用隔离联盟账号及测试物料后**才可调用 `createPromotionLink`；核对真实返回的落地链接/口令即可，转链不代表已下单或已产生返利。订单、账单、提现列表须检查真实返回（包括空列表及分页），不能生成假记录填充界面。记录每项的环境、时间、结果与失败原因到 FEATURE-682 议题，切勿贴出私有响应或会话 ID。

## 常见边界与后续

- 详情请求应传商品 ID 或详情页链接，不应把推广短链当作商品 ID。解析成功但商品上游暂不可用时，卡片仍可选择，并会显示“详情暂不可用”；排查上游前不要把失败归因于样式。
- `SESSION_EXPIRED` 时小程序清除本地会话，需要重新连接；`UPSTREAM` 和 `NETWORK` 需分别检查目标 GraphQL SDL/服务配置、网络与商品上游。BFF 不对外透传私有错误详情。
- 正式集成必须替换固定 OpenID：由合作方可信登录服务认证实际用户。当前 BFF 无公网身份认证或设备鉴权，不可直接部署成共享测试服务或生产服务。
- 更新 GraphQL 字段时先对照目标环境的 `saas/src/graphql/generated/{application,member}-schema.graphql`，再改 `bff/queries.mjs`、页面和受影响测试。功能完成后更新本交接文档中的稳定操作约定；实时完成/阻塞状态继续在 FEATURE-682 议题更新。
