# 功能与接口

截至 2026-09-29，外部接口共 24 项。下表负责导航；参数、类型、返回字段以正式服务的在线 Schema 为准，不另维护字段手册。

## 合作方：`/api/graphql/partner`

由可信后端使用应用签名调用，权限限于应用获准访问的组织。签名见 [签名与登录](requests.md)。

| 想做什么 | 接口 | 要点 |
| --- | --- | --- |
| 登录成员 | Mutation `login` | 传组织、Team 和真实用户 OpenID，取得 Token。 |
| 查看已开通商城 | Query `listMalls`、`getMall` | 先确认商城可见，再确认需要的上游能力已开通。 |
| 查看 Team | Query `listTeams`、`getTeam` | 单查按 ID，或组织 ID + 名称定位。 |
| 创建 Team | Mutation `createTeam` | 组织内同名返回已有 Team。 |
| 修改 Team 返利比例 | Mutation `updateTeam` | 只支持默认返利比例；具体清空规则见业务规则。 |
| 查收益统计 | Query `listRevenueStatistic` | 组织 / Team / 成员三选一；按日、月、年分页。 |
| 查组织提现申请 | Query `listWithdrawals` | 含申请时收款资料快照，供人工核对。 |
| 查打款记录 | Query `listWithdrawalPayments` | 用 withdrawalId 关联提现申请。 |
| 查提现流转记录 | Query `listWithdrawalAudits` | 按提现 ID 查询，返回时间顺序列表，无分页。 |
| 登记驳回或已打款 | Mutation `transitionWithdrawal` | 只登记处理结果，不执行银行或支付平台转账。 |

## 成员：`/api/graphql/member`

使用 `Authorization: Bearer <Token>` 调用，只能访问当前成员自己的数据。

| 想做什么 | 接口 | 要点 |
| --- | --- | --- |
| 查身份和钱包 | Query `getProfile` | 返回成员、Team 和三类余额。 |
| 解析分享内容 | Query `parsePromotionMaterial` | 返回解析结果数组，多条时让用户选择。 |
| 查商品详情 | Query `getPromotionItem` | 优先使用解析出的商品 ID；活动类不一定有详情。 |
| 生成推广入口 | Mutation `createPromotionLink` | 使用所选解析结果的平台、类型和商品链接。 |
| 查订单 | Query `listOrders` | 订单状态和返利结算状态分开显示。 |
| 查账单 | Query `listBills` | 查看资金变动记录。 |
| 查收款账号 | Query `listWithdrawalAccounts` | 返回本人未删除的账号，无分页。 |
| 管理收款账号 | Mutation `createWithdrawalAccount`、`updateWithdrawalAccount`、`deleteWithdrawalAccount` | 修改仅限姓名和证件号码；换账号需重新登记。 |
| 申请提现 | Mutation `requestWithdrawal` | 核对余额、金额和账号后提交。 |
| 查本人提现 | Query `listWithdrawals` | 与合作方的同名接口范围、参数不同。 |

接入顺序：登录 → 商品解析 / 详情 / 转链 → 订单与账单 → 收款账号与提现。组织运营再接入 Team、统计和人工打款处理；具体规则见 [业务规则](business.md)，可复制的请求见 [业务调用示例](examples.md)。
