---
name: huigou-saas-skills
description: 接入惠购 Saas 版 GraphQL API，查询接口文档、实现签名，或开发商品推广、订单、钱包和提现功能时使用。
---

# 惠购 Saas 版接入

按任务读取随 skill 一起提供的文档，无需访问服务端源码：

- [接入说明](references/guide.md)：支持的功能、业务规则、登录顺序，以及浏览器 / 插件查询 GraphQL 文档的方法。首次接入或解释业务时读。
- [功能与接口](references/capabilities.md)：按用户需求选择接口、确认调用身份和先后顺序。开发具体功能时读。
- [签名与请求示例](references/requests.md)：实现应用签名或调用接口时读。
- [商品样例](references/test-materials.md)：需要商品解析、查询或转链联调时读。
- [接口错误处理](references/errors.md)：遇到鉴权、参数、上游或资金请求异常时读。
- 运行小程序 Demo 时，按 [Demo README](https://github.com/shanjing-inc/huigou-saas-demo/blob/master/README.md) 操作。

执行要求：

1. Demo 使用正式服务域名和已配置的应用凭证。确认服务地址和已授权身份，读取该服务的 Schema（接口字段定义），按任务选择接口及返回字段。浏览器 GET 可打开 Yoga GraphiQL；文档插件通过 POST JSON 纯自省导入 Schema，详细用法见[接入说明](references/guide.md)。Demo 只覆盖部分接口；不要补造字段或数据。
2. 凭证只从可信后端私有配置读取，不写入前端、对话或日志。先验证 `login → getProfile`，再做所需功能。
3. 账号变更、提现、Team 修改等写操作，须在用户明确授权的环境和范围内执行。已有授权不重复索取；安装 skill 本身不授予操作权限。资金请求结果不明时先查记录，不直接重试。
4. 无法取得授权身份或读取 Schema 时，继续可做的文档 / 离线工作，说明缺项；只有真实请求成功才能报告已联通。
