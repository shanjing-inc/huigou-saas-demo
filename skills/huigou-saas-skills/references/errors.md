# 接口错误处理

直接调用 GraphQL 时，同时检查 HTTP 状态和响应中的 `errors`；HTTP 200 不一定表示业务成功，也可能同时返回部分 data 和 errors。不能仅凭 HTTP 状态宣布写入成功。

## GraphQL 原始错误

| `errors[].extensions.code` | 怎么处理 |
| --- | --- |
| `UNAUTHENTICATED` | 合作方检查 Key、签名、秒级时间戳和时钟；成员检查 Token 是否缺失或过期。 |
| `FORBIDDEN` | 检查应用的组织授权、Team / 成员状态，不能靠重复登录绕过。 |
| `BAD_USER_INPUT` | 对照 Schema 检查变量类型、范围选择、状态值；合作方参数不能内联常量。 |
| `NOT_FOUND` | 记录不存在或不在授权范围内；核对身份与 ID。 |
| `CONFLICT` | 账号已存在、提现重复或状态已变化；先刷新记录再决定操作。 |
| `SERVICE_UNAVAILABLE` / `INTERNAL_SERVER_ERROR` | 保留接口名、时间和脱敏错误码；只读请求可退避重试，写请求先核对是否已生效。 |

商品解析 / 详情的错误还可能带 `extensions.reasonCode`：

- `INVALID_CONTENT`、`INVALID_CANDIDATE`：重新选择有效分享内容或解析结果。
- `EMPTY_RESULT`：没有解析结果；成功响应的空数组也应显示“未找到”。
- `UNSUPPORTED_PLATFORM`、`PRODUCT_SOURCE_UNSUPPORTED`：平台或商品详情能力未支持，改用已开通能力。
- `PRODUCT_ID_REQUIRED`、`PRODUCT_ID_MISMATCH`、`ITEM_UNAVAILABLE`：核对商品 ID、平台，或更换商品。
- `UPSTREAM_TIMEOUT`、`UPSTREAM_UNAVAILABLE`、`UPSTREAM_RATE_LIMITED`、`PRODUCT_TIMEOUT`、`PRODUCT_UPSTREAM_UNAVAILABLE`、`PRODUCT_RESPONSE_INVALID`：上游异常，稍后重试读取；持续失败时联系对接人。

未知代码保留脱敏记录，不假定成功。不要把原始收款资料、签名或 Token 放进日志。

## Demo 后端错误

Demo 本机后端会将错误转换成以下代码，避免把原始响应或私密资料传给页面。这些是 **Demo 错误码**，不等同于 GraphQL 原始错误码。

| 代码 | 怎么处理 |
| --- | --- |
| `CONFIG` | 核对 `.env` 中服务地址、应用凭证、成员 OpenID 和组织 / Team ID，修改后重启后端。 |
| `LOGIN_FAILED` | 核对应用凭证和成员授权，修正后重新连接。 |
| `SESSION_EXPIRED` | 重新连接取得会话；后端重启也会清除原会话。 |
| `INPUT` | 按接口文档核对参数；提现时核对金额、可用余额和收款账号。 |
| `CONFLICT` | 刷新账号或提现记录，确认是否已登记或已有同金额提现在处理。 |
| `NETWORK` / `UPSTREAM` | 核对网络、服务地址、字段和商城授权；保留接口名、时间和脱敏错误码供对接人排查。 |
| `UNCERTAIN` | 提现结果尚未确认，先查询提现记录，不直接重试。 |

资金请求超时、断网或后续刷新失败时，也应先核对记录，不能仅凭页面报错判断申请未成功。
