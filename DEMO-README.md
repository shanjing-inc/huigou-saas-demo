# 惠购 Saas 版 · 小程序 Demo

用微信开发者工具体验商品转链、订单、钱包、收款账号和提现。`miniprogram/` 是小程序，`backend/` 是替小程序调用接口的本机 Node 服务。

接口接入和 AI 开发指令见 [README.md](README.md)。

## 启动 Demo

准备 Node.js ≥ 20.11、pnpm 和微信开发者工具。Demo 默认连接正式服务 `https://saas.tbxzs.cn/`，使用对接人提供的 App Key/Secret、组织 ID、Team ID 和成员 OpenID。

### 1. 填写配置

复制 `.env.example` 为 `.env` 并填写配置；已有配置可直接使用。服务地址填 HTTPS 站点根地址，不带接口路径。`.env` 只留在本机，不提交或分享。

### 2. 启动本机后端

在仓库根目录运行：

```sh
pnpm backend
```

保持终端打开。访问 `http://127.0.0.1:8787/api/status`，看到 `configured: true` 表示配置格式正确；小程序自动加载成员资料后才表示接口可用。`pnpm dev` 与此命令相同。

### 3. 打开小程序

1. 在微信开发者工具中导入仓库根目录，使用自己的 AppID。
2. 在本地设置中关闭合法域名校验（`setting.urlCheck: false`），允许模拟器访问本机后端；不要上传这份本地配置。
3. 点击「进入 Demo」，打开子包 `packages/rebate/pages/index/index`。

请求地址默认是 `http://127.0.0.1:8787`。需要修改时，编辑 `miniprogram/packages/rebate/pages/index/index.js` 顶部的 `BACKEND_BASE`，然后重新编译。

页面自动登录。粘贴[商品样例链接](skills/huigou-saas-skills/references/test-materials.md)，选择解析结果即可转链；订单和钱包页展示当前成员的实际数据。

### 真机 HTTP 调试（可信局域网）

手机和电脑连接同一个可信 Wi-Fi。Demo 使用固定成员身份，局域网内能访问后端的设备也能操作该成员，因此不要在共享网络中启用，也不要映射到公网。

以电脑 IP 为 `192.168.1.10` 为例，在 `.env` 中填写：

```sh
DEMO_LAN_HOST=192.168.1.10
```

将 `BACKEND_BASE` 改为 `http://192.168.1.10:8787`，重新编译小程序并重启后端。确认后端打印的地址与它一致；如使用自定义 `DEMO_PORT`，两处端口也要一致。旧配置 `DEMO_LAN_TOKEN` 如仍存在，需删除。

手机上的 `127.0.0.1` 指向手机自己。连接失败时，检查电脑 IP、防火墙和端口；若微信拦截 HTTP，需使用微信支持的调试模式。

结束后删除 `DEMO_LAN_HOST`，恢复 `BACKEND_BASE` 为本机地址，重启后端并重新编译。

## 使用时注意

- 收款账号和提现操作会改动实际资料和余额，提交前核对成员、账号和金额。
- 改配置或更新后端后，按 `Ctrl+C` 停止后重新启动；页面报错时点击「重试加载」。退出 Demo 也用 `Ctrl+C`。

## 遇到问题

| 现象 | 怎么处理 |
| --- | --- |
| 提示后端未启动或未配置 | 对照后端打印的地址与页面的 `/api/status` 地址，主机和端口必须一致。设置 `DEMO_LAN_HOST` 后只监听该 IP；同步修改 `BACKEND_BASE` 并重新编译。 |
| 更新后仍是旧行为 | 停止占用 8787 端口的旧后端，再启动。状态响应应有 `supportsAccountManagement: true`。 |
| 登录或收益统计调用失败 | 确认目标 SaaS 已启用 `/api/graphql/partner`，更新并重启本机后端；旧 `/api/graphql/application` 不再提供服务。`DEMO_API_BASE_URL` 仍填写站点根地址。 |

登录、商品或资金接口报错时，按[接口错误处理](skills/huigou-saas-skills/references/errors.md)排查。

## 开发与复用

`pnpm test` 运行离线测试；接口是否联通需实际调用确认。

复用到已有小程序：

1. 将整个 `miniprogram/packages/rebate/` 复制到目标小程序的同名目录。
2. 在 `app.json` 的 `subPackages` 中添加 `{ "root": "packages/rebate", "pages": ["pages/index/index"] }`。
3. 从主包调用 `wx.navigateTo({ url: "/packages/rebate/pages/index/index" })` 打开。
4. 将 `BACKEND_BASE` 改为自己的后端地址，接入实际用户认证并配置 HTTPS 合法 request 域名。应用密钥和成员 Token 保留在后端。
