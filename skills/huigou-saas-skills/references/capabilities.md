## 功能与接口

下表列出 Demo 已使用的接口。应用接口用密钥签名，成员接口用登录得到的 Token；具体参数、返回字段及更多能力请查当前服务的 GraphQL 文档。

| 想做什么 | 调用身份与顺序 |
| --- | --- |
| 登录、查看资料 | 应用调用 `login` → 成员调用 `getProfile`，确认成员和 Team。 |
| 把分享内容变成推广链接 | 成员：`parsePromotionMaterial` → 选择解析结果 → 按需 `getPromotionItem` → `createPromotionLink`。 |
| 查看订单和账单 | 成员：`listOrders` / `listBills`；按分页继续读取。 |
| 查看余额和收益 | 成员用 `getProfile` 查余额；应用用 `listRevenueStatistic` 查收益统计，由后端绑定当前成员 ID。 |
| 管理收款账号 | 成员：`listWithdrawalAccounts` → 按需 `createWithdrawalAccount` / `updateWithdrawalAccount` / `deleteWithdrawalAccount`。 |
| 申请提现、查看进度 | 成员：`getProfile` → `listWithdrawalAccounts` → 核对账号和金额 → `requestWithdrawal` → `listWithdrawals`。 |

商品详情优先用解析出的商品 ID，转链用解析结果中的商品链接。账号变更和提现会影响实际数据，只执行用户已授权的操作；提现结果不明时先查记录。

遇到报错时查 [接口错误处理](errors.md)。
