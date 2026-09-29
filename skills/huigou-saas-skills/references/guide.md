# 惠购 Saas 版 · 使用说明

为你的应用接入商品推广、订单返利和提现功能。想先体验小程序？按 [Demo README](https://github.com/shanjing-inc/huigou-saas-demo/blob/master/README.md) 启动。

## 能做什么

**用户登录 → 分享商品 → 生成推广链接 → 用户下单 → 订单结算 → 申请提现**

支持哪些商城和商品，以对接人为你开通的范围为准。

生成链接后，用户还需下单才可能产生返利。系统记录提现处理结果，实际打款由约定的处理方完成。

预估返利还未到账，只有**可用余额**能申请提现。`pendingMoney`（待结算）包含未结算返利和在途提现本金；收益统计也不是钱包余额。

## 怎么接入

1. **准备接入配置。** Demo 使用正式服务域名和应用凭证。向对接人取得 App Key/Secret、组织 ID 和 Team ID；已有配置可直接使用。组织表示授权范围，Team 表示成员归属。
2. **让后端登录。** 先认证自己的用户，再用可信 OpenID、组织 ID、Team ID 调用 `login`，取得成员 Token（用户身份凭证）。密钥和 Token 只保存在可信后端，不放进小程序、网页或聊天。
3. **确认身份，再接业务。** 用 Token 调用 `getProfile`，核对成员和钱包；之后按需接商品、订单或提现功能。切换组织或 Team 时重新登录。

我们负责开通服务、商城能力并提供接口；你负责用户认证、页面和后端集成。Demo 中的固定 OpenID 是为了方便测试，实际应用中需要按实际登录用户取得 OpenID。

### 去哪里看接口文档

在**对接人提供的目标站点**后加以下路径：

- `/api/graphql/partner`：应用接口，用 App Key、时间戳和签名鉴权；旧 `/api/graphql/application` 已停用，不提供兼容转发。
- `/api/graphql/member`：成员接口，用 `Authorization: Bearer <Token>` 鉴权。

浏览器对上述地址发送 HTML `GET`，可直接进入 **Yoga GraphiQL**，在 Docs 中查看字段。支持 GraphQL 自省的文档插件/客户端可把同一地址设为 Schema 地址，发送 `POST` 请求，以 `Content-Type: application/json` 提交标准自省查询（`__schema` / `__type`），通过 JSON 响应导入字段与类型；不要将 GraphiQL 的 HTML 页面当作 JSON Schema 导入。纯 Schema 自省可匿名读取元数据；页面公开不代表业务查询或 Mutation 免鉴权，业务调用仍需相应身份与授权。

字段和参数以所连接服务的 Schema（接口定义）为准。开发时查阅 [签名与请求示例](requests.md)；商品联调可用 [商品样例链接](test-materials.md)。

功能与调用顺序见 [功能与接口](capabilities.md)。

<!-- include:capabilities.md -->

## 让 AI 帮你开发

先确保 AI 能访问 [Demo 仓库](https://github.com/shanjing-inc/huigou-saas-demo)，再复制下面的指令。

### 安装一次

> 帮我把以下 skill 安装到当前 AI 工具的全局技能目录，并简述它的作用：
> https://github.com/shanjing-inc/huigou-saas-demo/tree/master/skills/huigou-saas-skills

需安装整个目录（含 `references/`）。也可以让 AI 直接读取仓库中的 `skills/huigou-saas-skills/SKILL.md`。

### 开始集成

> 使用 huigou-saas-skills，帮我在本项目接入返利功能。先实现登录、商品转链和订单查询；使用已配置的服务地址，凭证从后端私有配置读取。

### 先了解接口

> 使用 huigou-saas-skills，查看接口文档，说明提现功能需要哪些接口。本次只读分析。

安装 skill 不会自动取得接口权限。需要执行账号变更、提现等操作时，说明允许操作的成员和范围。
