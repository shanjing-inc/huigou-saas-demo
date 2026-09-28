---
name: partner-rebate-api
description: 对接返利项目合作方 GraphQL API，或解释商品推广、订单、钱包与提现流程时使用；帮助 AI 核对业务边界、目标环境 Schema、应用签名及调用权限，不自动授权资金写入。
---
# 合作方 GraphQL 接入

业务概览见 Demo 仓库根目录的[使用说明](https://github.com/shanjing-inc/huigou-saas-demo/blob/master/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.html)；Demo 的启动、安全边界和当前操作范围见同仓 `README.md`。本 skill 可独立阅读，但不代替目标环境 Schema，也不表示已正式对外交接。

## 业务路线与职责

- 应用代表合作方系统，通过密钥取得已授权组织的访问权；成员代表已认证用户在特定组织/Team 下的返利身份，使用自己的 Token。同一用户切换组织或 Team 要重新登录，不可复用旧 Token。
- 典型顺序是用户认证、解析分享物料、按需查商品、生成推广入口、用户下单、订单结算、查看返利与提现处理。具体商城和物料能力以组织授权及上游为准；转链成功不代表产生订单，预估返利也不等于最终到账，不为缺失的商品或订单数据造值。
- `getProfile.pendingMoney` 包含未结算返利和在途提现本金，不是可提现余额；只有可用余额可申请提现，不能把在途本金重复计算。系统登记提现及打款结果，不执行真实转账；如合作方承担提现处理，应核对资料、人工打款并登记结果。
- 我方开通服务、组织及商城推广能力，提供商品、转链、订单、返利和资金记录接口；合作方负责认证用户、页面与后端集成，并在可信后端保管 App Secret、成员 Token 及收款资料。

## 先确认接口与范围

1. 向对接人确认**实际目标环境**的 HTTPS 根地址、已授权的组织/Team、应用凭证及隔离测试成员；不要从 Demo、截图或文档推断生产授权。仅用可信后端保存 App Secret 和成员 Token，不把凭证贴进对话、代码、命令参数或日志。
2. 浏览该环境的 `GET /api/graphql/application` 和 `GET /api/graphql/member`（GraphiQL），或对同一路径执行**纯 Schema 自省**。前者是应用级字段，后者是成员级字段；自省可匿名读取元数据，执行业务字段仍需鉴权。
3. 从 Schema 的 `Query` / `Mutation` 根字段、参数类型、字段说明、返回字段及错误码确认操作；以已开通组织、商城和物料能力为准，Schema 有字段不意味着该身份获得授权。Demo 只实现其中一小部分（见 `backend/queries.mjs`），不是 API 全集；不要为不存在的能力补造字段或数据。

## 用户提供的联调商品链接

以下是可用于**尝试**解析或查询的真实商品页面，不是已验证的推广商品清单；链接有效性、商品查询能力、商城/物料授权和返利资格均须在目标隔离环境核对。优先逐条输入 Demo 的「分享内容解析」并明确选择返回的候选；不要仅凭链接生成订单或假设转链成功。调用 GraphQL 时 1688 的 `PromotionPlatform` 枚举是 `alibaba`，抖音普通商品使用 `douyin` + `goods`，不要把普通商品当作 `life` 团购。

| 平台 | 商品页面 |
| --- | --- |
| 淘宝/天猫 | https://detail.tmall.com/item.htm?id=649479273712 |
| 京东 | https://item.jd.com/10211463817676.html |
| 1688 | https://detail.1688.com/offer/585468402829.html |
| 唯品会 | https://detail.vip.com/detail-1710612785-6919169191930082065.html |
| 抖音 | https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3644272059510584408 |

## 身份与调用

- 应用请求：`POST /api/graphql/application`，JSON `{ "query": "...", "variables": { ... } }`，头为 `content-type: application/json`、`x-app-key`、`x-timestamp`（UTC Unix 秒）及 `x-signature`（32 位小写 MD5）。**只签最终发送的 GraphQL variables 集合**，包含业务范围 ID，不签 query、时间戳或请求路径；Secret 直接追加在规范化变量串后，不发送到服务端。标量签名与隔离 Demo 的 `backend/core.mjs` 一致；对象/数组签名请以 SaaS 的 `src/rebate/application-signature.ts` 为准，不可套用 Demo 仅适用于标量的 `sign` 实现。具体过程和请求示例见 [请求示例](references/requests.md)。签名无 nonce，时间戳有效窗口为 ±300 秒；每次请求用当前秒数。
- 用应用签名调用 `login(openid, organizationId, teamId)`，其中 OpenID 必须来自**已认证用户的可信登录服务**；Demo 中固定 OpenID 只属于隔离联调。确认登录返回成员 ID 与 Token 后，成员请求用 `POST /api/graphql/member` + `Authorization: Bearer <JWT>`；`getProfile` 可核对该 Token 对应的成员及钱包范围。换组织/Team 时重新登录，不凭前端传参切换成员身份。
- 应用端可查询已授权的 Team、商城和收益统计；成员端可读取资料、解析物料、查询商品、转链、读取本人订单/账单/提现及收款账号。提现申请、账号变更、提现流转、Team 修改等是**有真实业务副作用的 Mutation**，不得仅因 Schema 存在就自动执行；需要用户明确的操作授权、合法范围和环境确认。Demo 的本机后端只允许 `backend/queries.mjs` 列出的操作；登录隔离测试身份后收款账号增删改和提现申请默认可用、无额外开关，但这不等于 AI 获得操作授权。结果不明时先查提现记录，不要直接重试。钱包统计由后端绑定已登录成员 ID，客户端不能任意指定身份。
- 先用授权隔离环境做 `login → getProfile` 的最小验证，再按具体任务挑选操作和所需选择集。任何生产写入或资金相关操作都须另行取得明确授权；联调失败时只记录脱敏变量、操作名、HTTP 状态和 GraphQL 错误码，勿泄露 JWT、Secret 或收款资料。

本 skill 提供接入指引，不会自动导入 SaaS 源码或授予目标环境访问权限。若无法访问目标 Schema、拿不到授权测试身份或字段版本不一致，停在文档/离线检查并联系对接人，不能声称已真实联通。
