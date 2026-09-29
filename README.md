# 惠购 Saas 版 · 使用说明

为你的应用接入商品推广、订单返利和提现功能。想先体验小程序？按 [Demo 启动说明](DEMO-README.md) 操作。

服务地址：https://saas.tbxzs.cn/

## 能做什么

**用户登录 → 查询商品 → 生成推广链接 → 用户下单 → 订单结算 → 申请提现**

可接入京东、淘宝、1688 等商城；实际可用范围以组织开通的商城和服务能力为准。

提现由接入方人工转账。

## 怎么接入

1. **准备接入配置。** 向对接人取得接口域名、App Key/Secret、组织 ID 和 Team ID；已有配置可直接使用。
2. **让后端登录。** 先认证自己的用户，再用 OpenID、组织 ID、Team ID 调用 `login`，取得成员 Token（用户身份凭证）。密钥和 Token 只保存在可信后端，不放进小程序、网页或聊天。
3. **调用业务接口。** 用成员 Token 查询商品、转链、查订单和申请提现；用应用签名管理 Team、查询组织收益和处理提现。

Demo 使用固定 OpenID；正式接入时，由你的后端提供实际登录用户的 OpenID。

### 接口文档

- https://saas.tbxzs.cn/api/graphql/partner ：应用接口，用 App Key、时间戳和签名鉴权。
- https://saas.tbxzs.cn/api/graphql/member ：成员接口，用 `Authorization: Bearer <Token>` 鉴权。

浏览器打开上述地址，即可查看参数、返回字段和枚举。也可用 [Altair GraphQL Client](https://chromewebstore.google.com/detail/altair-graphql-client/flnheeellpciglgpaodhkhmapeljopja) 导入接口定义。

按需要阅读：

- [功能与接口](skills/huigou-saas-skills/references/capabilities.md)：全部外部接口及调用身份。
- [业务规则](skills/huigou-saas-skills/references/business.md)：组织、Team、成员、余额和提现流程。
- [签名与登录](skills/huigou-saas-skills/references/requests.md)：完整签名规则和可复用函数。
- [业务调用示例](skills/huigou-saas-skills/references/examples.md)：商品转链、分页、收益统计和提现处理。
- [错误处理](skills/huigou-saas-skills/references/errors.md) / [商品样例](skills/huigou-saas-skills/references/test-materials.md)：排错与联调。

## 让 AI 帮你开发

将下面的指令发给 AI：

### 全局安装

> 将以下 skill 安装到当前 AI 工具的全局技能目录：
> https://github.com/shanjing-inc/huigou-saas-demo/tree/master/skills/huigou-saas-skills

### 启动 Demo

> 使用 huigou-saas-skills，启动 demo 后端和小程序。

### 了解接口

> 使用 huigou-saas-skills，查看接口文档，说明提现功能需要哪些接口。本次只读分析。

### 集成到已有项目

> 使用 huigou-saas-skills，帮我在本项目接入返利功能。先实现登录、商品转链和订单查询；使用已配置的服务地址，凭证从后端私有配置读取。
