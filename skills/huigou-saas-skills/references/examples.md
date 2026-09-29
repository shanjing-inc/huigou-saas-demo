# 业务调用示例

以下请求放入 JSON 的 `query`，紧随其后的 JSON 放入 `variables`。鉴权和发送方法见 [签名与登录](requests.md)。ID、金额和分享内容均为示例，运行时换成当前授权身份和用户选择的数据；写操作只在已授权范围内执行。

## 商品：解析 → 详情 → 转链

三个请求都走成员入口。先解析分享文本：

```graphql
query Parse($content: String!) {
  parsePromotionMaterial(content: $content) {
    platform type detail { itemId itemUrl itemTitle }
  }
}
```

```json
{"content":"粘贴用户选择的商品分享文本或链接"}
```

空数组显示“未找到”；多条结果让用户选择。以下以所选结果为京东商品为例，变量分别取其 `platform`、`type` 和 `detail.itemId`。没有 ID 时可用商品详情链接，不从短链猜 ID。活动素材可以直接转链，无需调用商品详情。

```graphql
query Item($platform: PromotionPlatform!, $material: String!, $materialType: PromotionMaterialType) {
  getPromotionItem(platform: $platform, material: $material, materialType: $materialType) {
    itemId title price imageUrl rebateInfo { status rebate }
  }
}
```

```json
{"platform":"jd","material":"所选解析结果的商品ID","materialType":"goods"}
```

转链时 `material` 改用所选结果的 `detail.itemUrl`，保持平台和类型一致：

```graphql
mutation Link($platform: PromotionPlatform!, $material: String!, $materialType: PromotionMaterialType) {
  createPromotionLink(platform: $platform, material: $material, materialType: $materialType) {
    url shortUrl code appScheme miniProgram { appId path shortLink }
  }
}
```

```json
{"platform":"jd","material":"https://item.jd.com/123456.html","materialType":"goods"}
```

物料类型包括 goods / activity / life / live；1688 的平台枚举为 `alibaba`。枚举存在不代表组织已开通该能力。小程序可用 appId + path 或官方 shortLink 跳转；网页按支持的链接打开，无法跳转时提供复制链接 / 口令。各入口可能为 null，不能拼造。

## 订单分页

成员入口；同类分页均从 page = 1 开始，`hasMore === true` 才继续 page + 1，每页最多 100。不要假设存在 total 字段。筛选和排序参数类型随接口而异，以 Schema 为准。

```graphql
query Orders($page: Int!, $limit: Int!) {
  listOrders(page: $page, limit: $limit) {
    hasMore
    items { id orderSn status settleStatus rebateMoney expectedSettleAt settledAt }
  }
}
```

```json
{"page":1,"limit":20}
```

账单和提现也按此方式分页；收款账号、解析结果和提现流转记录直接返回数组。

## 合作方：带筛选条件的 Team 查询

合作方入口；此例的 where / orderBy 是对象，必须按完整规则签名。

```graphql
query Teams($organizationId: Int!, $page: Int!, $where: ApplicationTeamWhereInput, $orderBy: ApplicationTeamOrderByInput) {
  listTeams(organizationId: $organizationId, page: $page, where: $where, orderBy: $orderBy) {
    hasMore items { id name status defaultRebateRate }
  }
}
```

```json
{"organizationId":1,"page":1,"where":{"status":{"eq":1}},"orderBy":{"id":"DESC"}}
```

## 合作方：成员收益

合作方入口；下面只传 memberId。查询 Team 或组织时，替换变量声明、参数和 variables，范围参数三选一，不能叠加。memberId 从后端已验证的登录结果取得。

```graphql
query Revenue($memberId: Int!, $period: RevenueStatisticPeriod!, $page: Int!) {
  listRevenueStatistic(memberId: $memberId, period: $period, page: $page) {
    hasMore items { date orderCount estimateMemberOrderCommission settledMemberOrderCommission }
  }
}
```

```json
{"memberId":1,"period":"day","page":1}
```

默认查询最近 30 个业务日，也可传 from / to（YYYY-MM-DD，跨度不超过 366 天）。结果按日、月或年汇总，只返回有数据的时段，按时间倒序；统计金额不等于钱包可用余额。

## 提现：申请和人工处理

成员先查询余额、账号；用户核对金额和收款人后才提交申请。规则见 [业务规则](business.md)。

```graphql
query Wallet {
  getProfile { memberId money pendingMoney withdrawalMoney }
  listWithdrawalAccounts { id type name account isDefault }
}
```

```json
{}
```

成员入口：

```graphql
mutation Withdraw($amount: String!, $withdrawalAccountId: ID!) {
  requestWithdrawal(amount: $amount, withdrawalAccountId: $withdrawalAccountId) {
    id amount status withdrawalAccountId
  }
}
```

```json
{"amount":"10.00","withdrawalAccountId":"1"}
```

保存返回的提现 ID。合作方从自己的入口分页查询申请、收款快照和打款记录；用 withdrawalId 关联打款记录，不要把两个列表的第一行当成同一笔。

```graphql
query Payouts($organizationId: Int!, $page: Int!) {
  listWithdrawals(organizationId: $organizationId, page: $page) {
    hasMore items { id memberId amount status account { type name account ext } }
  }
  listWithdrawalPayments(organizationId: $organizationId, page: $page) {
    hasMore items { id withdrawalId status amount memo }
  }
}
```

```json
{"organizationId":1,"page":1}
```

两个列表独立判断 hasMore。核对申请后人工转账，确认转账成功才在合作方入口登记已打款；下面的 status = 5 **只登记结果，不转账**。驳回则用 status = 2，填写真实原因。

```graphql
mutation RecordPayout($organizationId: Int!, $id: Int!, $status: Int!, $memo: String!) {
  transitionWithdrawal(organizationId: $organizationId, id: $id, status: $status, memo: $memo) {
    id amount status
  }
}
```

```json
{"organizationId":1,"id":1,"status":5,"memo":"人工转账已核实，填写实际凭证编号"}
```

结果不明先查询记录。合作方可进一步查看流转留痕：

```graphql
query Audits($organizationId: Int!, $id: Int!) {
  listWithdrawalAudits(organizationId: $organizationId, id: $id) {
    id originStatus targetStatus memo createdAt
  }
}
```

```json
{"organizationId":1,"id":1}
```

成员通过成员入口的 `listWithdrawals` 查看本人进度。资金请求超时后不要自动重提，按 [错误处理](errors.md) 核对。
