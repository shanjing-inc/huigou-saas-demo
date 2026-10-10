# 接口错误处理

同时检查 HTTP 状态和响应中的 `errors`。HTTP 200 也可能包含错误及部分 `data`，不能据此判断业务成功。

## GraphQL 原始错误

| `errors[].extensions.code` | 怎么处理 |
| --- | --- |
| `UNAUTHENTICATED` | 合作方检查 Key、签名、秒级时间戳和时钟；成员检查 Token 是否缺失或过期。 |
| `FORBIDDEN` | 检查应用的组织授权、Team / 成员状态。 |
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

以下代码由 Demo 后端转换后返回，与 GraphQL 原始错误码不同。

| 代码 | 怎么处理 |
| --- | --- |
| `CONFIG` | 核对 `.env` 中服务地址、应用凭证、成员 OpenID 和组织 / Team ID，修改后重启后端。 |
| `LOGIN_FAILED` | 核对应用凭证和成员授权，修正后点击「重试加载」。 |
| `SESSION_EXPIRED` | 点击「重试加载」重新登录；后端重启后也需重新登录。 |
| `FORBIDDEN` | 当前身份无操作权限，核对组织、Team、成员状态和商城授权；重新登录不一定能解决。 |
| `INPUT` | 按当前操作提示检查：转链的平台、素材类型和链接；商品查询的 ID；解析的分享内容；提现的金额、余额和收款账号；列表的页码。 |
| `NOT_FOUND` | 核对素材、商城授权或记录 ID，刷新后再选择。 |
| `CONFLICT` | 按当前操作刷新账号、提现或其他记录，确认账号是否已登记、是否已有同金额提现或状态已变化。 |
| `RATE_LIMITED` | 请求过于频繁，稍后再试。 |
| `NETWORK` / `UPSTREAM` | 核对网络、服务地址、字段和商城授权；保留接口名、时间和脱敏错误码供对接人排查。 |
| `UNCERTAIN` | 提现结果尚未确认，先查询提现记录，不直接重试。 |

资金请求超时、断网或后续刷新失败时，也应先核对记录，不能仅凭页面报错判断申请未成功。

商品接口会将已知 `reasonCode` 转为具体中文提示并保留该代码；未知原因使用通用提示。Demo 不直接显示上游原始错误文本，避免泄露凭证或个人资料。错误提示的改善不代表该平台或物料类型已开通。
