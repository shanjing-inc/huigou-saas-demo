# 惠购 Saas 版 · 使用说明

为你的应用接入商品推广、订单返利和提现功能。想先体验小程序？按 [Demo 启动说明](DEMO-README.md) 操作。

生产环境域名：**https://saas.tbxzs.cn/**。接口路径见下文；不要将 App Secret 或成员 Token 放在小程序中。

## 能做什么

**用户登录 → 查询商品 → 生成推广链接 → 用户下单 → 订单结算 → 申请提现**

支持商城：京东、淘宝、1688、唯品会、抖音。

打款：实际打款需接入方人工转账。

## 怎么接入

1. **准备接入配置。** 向对接人取得接口域名、App Key/Secret、组织 ID 和 Team ID；已有配置可直接使用。
2. **让后端登录。** 先认证自己的用户，再用 OpenID、组织 ID、Team ID 调用 `login`，取得成员 Token（用户身份凭证）。密钥和 Token 只保存在可信后端，不放进小程序、网页或聊天。
3. **调用业务接口。**

我们负责开通服务、商城能力并提供接口；你负责用户认证、页面和后端集成。注意：Demo 使用配置中的固定 OpenID，面向用户的应用需要按实际登录用户取得 OpenID。

### 去哪里看接口文档

拿到接口域名后，拼接以下路径：

- https://saas.tbxzs.cn/api/graphql/partner：应用接口，用 App Key、时间戳和签名鉴权。
- https://saas.tbxzs.cn/api/graphql/member：成员接口，用 `Authorization: Bearer <Token>` 鉴权。

浏览器访问上述地址，可直接进入网页版 Yoga GraphiQL 浏览接口。也可以使用 Chrome 插件 [Altair GraphQL Client](https://chromewebstore.google.com/detail/altair-graphql-client/flnheeellpciglgpaodhkhmapeljopja) 导入查看。

开发时查阅 [签名与请求示例](skills/huigou-saas-skills/references/requests.md)；商品联调可用 [商品样例链接](skills/huigou-saas-skills/references/test-materials.md)。

功能与调用顺序见 [功能与接口](skills/huigou-saas-skills/references/capabilities.md)。

### Demo 功能与接口

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

遇到报错时查 [接口错误处理](skills/huigou-saas-skills/references/errors.md)。

## 让 AI 帮你开发

先确保你的网络能访问 [Demo 仓库](https://github.com/shanjing-inc/huigou-saas-demo)，再复制下面的指令发送给 AI。

### 全局安装

> 帮我把以下 skill 安装到当前 AI 工具的全局技能目录，并简述它的作用：
> https://github.com/shanjing-inc/huigou-saas-demo/tree/master/skills/huigou-saas-skills

### 测试 Demo

> 使用 huigou-saas-skills，启动 demo 后端和小程序。

### 了解接口

> 使用 huigou-saas-skills，查看接口文档，说明提现功能需要哪些接口。本次只读分析。

> 惠购 Saas 可以做什么？

### 集成到已有项目

> 使用 huigou-saas-skills，结合 demo 用例，评估在本项目接入惠购 Saas 的方案。

> 使用 huigou-saas-skills，帮我在本项目接入返利功能。先实现登录、商品转链和订单查询；使用已配置的服务地址，凭证从后端私有配置读取。
