# Demo 与 Go 推广接口核对

2026-10-10 核对 Demo `8c00dda` 与 Go `49037a4`（含京粉链接修复）。本次补丁仅修改错误分类、可选参数及平台别名；不改真实配置或自动执行资金／联盟操作。

| 项目 | 核对结果 |
| --- | --- |
| 调用身份 | parse/item/link 均为 `/api/graphql/member`，使用后端持有的成员 Bearer Token；不新增客户端组织、成员、PID、scene 参数 |
| 平台 | 20 项公开枚举；`alibaba` 对应内部 `1688`，`meituanCoupon` 对应内部 `meituan_coupon`，其余18项原值 |
| 素材类型 | goods/activity/live/life；省略或 null 为默认 goods，实际能力受已授权联盟配置限制 |
| 素材 | material 必填字符串，去首尾空白后最多2048个Unicode字符；平台链接／商品 ID 合法性由服务继续校验 |
| 解析 | content 必填，去空白后1–4096字符；保留公开平台与type；Demo商品详情优先itemId，转链使用detail.itemUrl |
| 返回 | Link: url/shortUrl/code/appScheme/miniProgram(appId/path/shortLink)，可空字段保留；Item/Parse当前选择集均与SDL一致 |
| 其他字段 | Go没有提供客户端mallId、PID、sceneId、tracking等转链参数；跟单与组织范围由成员身份和服务配置确定，Demo拒绝覆盖 |

Go原来遗漏美团优惠券双向映射：公开meituanCoupon被输入校验拒绝，解析返回内部slug又导致枚举序列化失败。本次Go补丁修复输入与解析／商品输出；优惠券商品详情仍明确返回PRODUCT_SOURCE_UNSUPPORTED，不假造详情成功。

Demo原来使用JavaScript UTF-16长度并拒绝可选null，已按Go字符计数和可选默认值对齐。公开enum的内部slug仍不接受；不把四种素材类型的参数兼容等同于所有商城都支持四种业务能力。

错误提示按转链、商品、解析、提现、收款账号、统计／分页区分。FORBIDDEN保留会话并提示授权，UNAUTHENTICATED清除失效会话；已知商品reasonCode显示安全中文说明，未知原因不透传。提现网络／服务失败保持UNCERTAIN，仍要求先查记录，未新增自动重试。

验证：新增错误分类及枚举／可选／Unicode回归先失败再通过；离线Node后端与小程序页面测试通过。额外将backend/queries.mjs实际导出的全部14份operation交给Go当前SDL校验，变量声明及选择集全部通过；20平台与4素材类型一致。Go真实HTTP隔离fixture覆盖美团优惠券解析→转链派发与不支持商品详情的明确错误，保留跟单sid。不重放生产转链，不把离线通过扩大为真实上游已联通。

合并Demo与Go对应修复后，分别更新Go Web及Demo代码。Demo本机后端需要重启并在小程序点击「重试加载」；仅更新文档或保留旧8787进程不会生效。
