---
name: huigou-saas-skills
description: 接入惠购 Saas 版 GraphQL API，查询接口文档、实现签名，或开发商品推广、订单、钱包和提现功能时使用。
---

# 惠购 Saas 版接入

按任务查阅：

- [接入说明](https://github.com/shanjing-inc/huigou-saas-demo/blob/master/README.md)：接入入口和在线 GraphQL 文档的打开方法。
- [业务规则](references/business.md)：组织、Team、成员、Token、余额和提现流程。
- [功能与接口](references/capabilities.md)：接口清单、调用身份和顺序。
- [签名与登录](references/requests.md)：完整签名规则、固定校验样例和登录代码；复用 [Node.js 签名函数](scripts/signature.mjs)。
- [业务调用示例](references/examples.md)：商品转链、分页、收益统计和提现处理。
- [商品样例](references/test-materials.md)：解析、详情查询和转链用的商品链接。
- [接口错误处理](references/errors.md)：错误码和处理方法。
- 运行小程序 Demo 时，按 [Demo 启动说明](https://github.com/shanjing-inc/huigou-saas-demo/blob/master/DEMO-README.md) 操作。

执行要求：

1. 使用已配置的服务地址和授权身份；正式域名为 `https://saas.tbxzs.cn/`。按当前 Schema（接口定义）选择参数和返回字段，不编造字段或数据。浏览器可直接查看接口文档；插件用 POST JSON 自省请求导入。
2. 凭证只从可信后端私有配置读取，不写入前端、对话或日志。先验证 `login → getProfile`，再做所需功能。
3. 账号变更、提现、Team 修改只执行用户已授权的操作，不重复索取已有授权。资金请求结果不明时先查记录，不直接重试。
4. 无法取得授权身份或读取 Schema 时，继续可做的文档 / 离线工作，说明缺项；只有真实请求成功才能报告已联通。
