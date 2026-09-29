# 惠购 Saas 版 · 小程序 Demo

用微信开发者工具体验商品转链、订单、钱包、收款账号和提现。`miniprogram/` 是小程序，`backend/` 是替小程序调用接口的本机 Node 服务。

- **了解接入方式、让 AI 帮忙开发**：阅读 [README.md](README.md)。
- **先把 Demo 跑起来**：按下面三步操作。

## 启动 Demo

准备 Node.js ≥ 20.11、pnpm 和微信开发者工具。Demo 默认连接生产环境 `https://saas.tbxzs.cn/`（由本机后端代为调用），向对接人取得 App Key/Secret、组织 ID、Team ID 和获授权的成员 OpenID。

### 1. 填写配置

首次使用时复制 `.env.example` 为 `.env`，填写对接人提供的配置；已有 `.env` 则继续使用。服务地址填 HTTPS 站点根地址，不带接口路径。`.env` 只留在本机，不提交或发到聊天中。

### 2. 启动本机后端

在仓库根目录运行：

```sh
pnpm backend
```

保持终端打开。访问 `http://127.0.0.1:8787/api/status`，看到 `configured: true` 表示配置格式正确；小程序自动加载成员资料后才表示接口可用。`pnpm dev` 与此命令相同。

### 3. 打开小程序

在微信开发者工具中导入仓库根目录，使用自己可用的 AppID。在本地设置中关闭合法域名校验（`project.private.config.json` 的 `setting.urlCheck: false`），让模拟器能访问本机后端；不要上传这份配置。主包 `pages/index/index` 是调试入口，点击「进入 Demo」打开子包 `packages/rebate/pages/index/index`。小程序请求地址由 `miniprogram/packages/rebate/pages/index/index.js` 顶部的 `BACKEND_BASE` 控制，默认 `http://127.0.0.1:8787`，修改后重新编译即可生效。小程序里不提供服务地址设置。

打开页面后会自动加载当前成员，无需点击连接。随后粘贴[商品样例链接](skills/huigou-saas-skills/references/test-materials.md)，选择解析结果并生成推广链接。订单和钱包页展示当前成员的实际数据，没有记录时显示空列表。

### 真机 HTTP 调试（可信局域网）

手机与电脑连接同一个隔离的可信 Wi-Fi，不使用公网或共享网络。此模式没有独立的访问密钥：**同网段设备可以通过公开的登录接口使用 Demo 配置的固定成员身份；只能使用测试成员、无真实资金权限的凭证**。先确定电脑在该网络的私网 IPv4 地址（例如 `192.168.1.10`），在本机 `.env` 中填写：

```sh
DEMO_LAN_HOST=192.168.1.10
```

将 `miniprogram/packages/rebate/pages/index/index.js` 顶部的 `BACKEND_BASE` 改成 `http://192.168.1.10:8787` 并重新编译小程序；重新运行 `pnpm backend`，确认监听地址也是 `http://192.168.1.10:8787`。无需在手机端输入地址或密钥。若此前在 `.env` 填过 `DEMO_LAN_TOKEN`，须删除该旧配置才能启动新后端。结束调试后删除 `.env` 中的 `DEMO_LAN_HOST`、把 `BACKEND_BASE` 恢复为 `http://127.0.0.1:8787` 并重新编译。

改变量不能绕过微信对 HTTP 请求的校验：真机若拦截 HTTP，仍需通过微信允许的调试模式验证；正式版应使用已配置的 HTTPS 合法 request 域名、有实际用户认证及传输保护的后端，不能将此固定 OpenID 的 Demo 后端直接上公网。手机访问 `127.0.0.1` 指向手机自己，不是电脑。若提示连接失败，先确认手机能到达电脑 IP、系统防火墙允许端口及两端配置的端口相同。

## 使用时注意

- 登录后，管理收款账号和申请提现即可使用，会改动当前成员的实际资料和余额；提交前核对成员、账号和金额。
- 默认后端仅监听 `127.0.0.1`。真机调试必须显式启用上述隔离局域网模式；**禁止公网端口转发或共享部署，不得使用有真实资金权限的配置**。固定 OpenID 只用于 Demo；正式接入应认证实际用户。应用密钥和成员 Token 保留在后端。
- 改配置或更新后端后，在原终端按 `Ctrl+C` 停止，再启动并重新打开小程序；若页面仍报错，点击「重试加载」。退出 Demo 时也用 `Ctrl+C`。

## 遇到问题

| 现象 | 怎么处理 |
| --- | --- |
| 提示后端未启动 | 确认终端仍在运行，点击「重试加载」。改过 `DEMO_PORT` 时，同步修改 `BACKEND_BASE` 中的端口并重新编译；真机还需使用电脑私网 IP。 |
| 更新后仍是旧行为 | 停止占用 8787 端口的旧后端，再启动。状态响应应有 `supportsAccountManagement: true`。 |
| 登录或收益统计调用失败 | 确认目标 SaaS 已启用 `/api/graphql/partner`，更新并重启本机后端；旧 `/api/graphql/application` 不再提供服务。`DEMO_API_BASE_URL` 仍填写站点根地址。 |

登录、商品或资金接口报错时，按[接口错误处理](skills/huigou-saas-skills/references/errors.md)排查。

## 开发与文档维护

`pnpm test` 运行离线模拟测试，不请求正式服务。真实联调按已授权范围验证并记录结果；离线通过不代表接口已联通。

文档分工：本文件维护 Demo 启动和排障；[README.md](README.md) 维护接入说明；[capabilities.md](skills/huigou-saas-skills/references/capabilities.md) 维护功能与接口导航；[SKILL.md](skills/huigou-saas-skills/SKILL.md) 给 AI 阅读入口和执行要求。签名与接口错误各自只在引用文件中维护。

复用小程序时，复制整个 `miniprogram/packages/rebate/` 到目标小程序同名目录，在目标 `app.json` 的 `subPackages` 中添加 `{ "root": "packages/rebate", "pages": ["pages/index/index"] }`，从主包用 `wx.navigateTo({ url: "/packages/rebate/pages/index/index" })` 打开。子包内包含业务页、图标和页面样式，不依赖 Demo 主包或全局会话；默认请求本机 Demo 后端，正式集成需改为你自己的后端地址、实际用户认证和生产 HTTPS 合法域名。不要将应用密钥放在小程序端。
