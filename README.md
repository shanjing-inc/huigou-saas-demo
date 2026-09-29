# 惠购 Saas 版 · 小程序 Demo

用微信开发者工具体验商品转链、订单、钱包、收款账号和提现。`miniprogram/` 是小程序，`backend/` 是替小程序调用接口的本机 Node 服务。

- **了解接入方式、让 AI 帮忙开发**：在本地打开 [使用说明.html](使用说明.html)。
- **先把 Demo 跑起来**：按下面三步操作。

## 启动 Demo

准备 Node.js ≥ 20.11、pnpm 和微信开发者工具。Demo 使用正式服务域名和应用凭证；向对接人取得 App Key/Secret、组织 ID、Team ID 和获授权的成员 OpenID。

### 1. 填写配置

首次使用时复制 `.env.example` 为 `.env`，填写对接人提供的配置；已有 `.env` 则继续使用。服务地址填 HTTPS 站点根地址，不带接口路径。`.env` 只留在本机，不提交或发到聊天中。

### 2. 启动本机后端

在仓库根目录运行：

```sh
pnpm backend
```

保持终端打开。访问 `http://127.0.0.1:8787/api/status`，看到 `configured: true` 表示配置格式正确；小程序自动加载成员资料后才表示接口可用。`pnpm dev` 与此命令相同。

### 3. 打开小程序

在微信开发者工具中导入仓库根目录，使用自己可用的 AppID。在本地设置中关闭合法域名校验（`project.private.config.json` 的 `setting.urlCheck: false`），让模拟器能访问本机后端；不要上传这份配置。

打开页面后会自动加载当前成员，无需点击连接。随后粘贴[商品样例链接](skills/huigou-saas-skills/references/test-materials.md)，选择候选并生成推广链接。订单和钱包页展示当前成员的实际数据，没有记录时显示空列表。

## 使用时注意

- 登录后，管理收款账号和申请提现即可使用，会改动当前成员的实际资料和余额；提交前核对成员、账号和金额。
- 本机后端仅监听 `127.0.0.1`，不支持真机、公网或共享部署。固定 OpenID 只用于 Demo；正式接入应认证实际用户。密钥和成员 Token 保留在后端。
- 改配置或更新后端后，在原终端按 `Ctrl+C` 停止，再启动并重新打开小程序；若页面仍报错，点击「重试加载」。退出 Demo 时也用 `Ctrl+C`。

## 遇到问题

| 现象 | 怎么处理 |
| --- | --- |
| 提示后端未启动 | 确认终端仍在运行，点击「重试加载」。改过 `DEMO_PORT` 时，同步修改 `miniprogram/pages/index/index.js` 的 `BASE`。 |
| 更新后仍是旧行为 | 停止占用 8787 端口的旧后端，再启动。状态响应应有 `supportsAccountManagement: true`。 |

登录、商品或资金接口报错时，按[接口错误处理](skills/huigou-saas-skills/references/errors.md)排查。

## 开发与文档维护

`pnpm test` 运行离线模拟测试，不请求正式服务。真实联调按已授权范围验证并记录结果；离线通过不代表接口已联通。

文档分工：本 README 维护 Demo 启动和排障；[guide.md](skills/huigou-saas-skills/references/guide.md) 维护接入说明；[capabilities.md](skills/huigou-saas-skills/references/capabilities.md) 维护功能与接口导航；[SKILL.md](skills/huigou-saas-skills/SKILL.md) 给 AI 阅读入口和执行要求。签名与接口错误各自只在引用文件中维护。

修改 `guide.md` 或 `capabilities.md` 后运行 `pnpm install && pnpm docs:build`，提交生成的 `使用说明.html`，不要手改 HTML。`pnpm docs:check`（CI 同样执行）检查是否一致。HTML 可单独离线打开；访问其中的仓库链接需要 GitHub 权限。
