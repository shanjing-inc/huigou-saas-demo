# 签名与请求示例

先按[接入说明](guide.md)确认目标环境、接口字段和授权范围。

## 应用签名

仅签最终发送的 `variables`，不签 query、时间戳或路径。标量（字符串、数字等）变量的规则：

1. 去掉 `null`、`undefined` 和空字符串，保留 `0`、`false`。
2. 按字段名升序排列，以 `&` 连接 `key=value`，末尾直接追加 Secret。
3. 对 UTF-8 字符串算 MD5，取 32 位小写十六进制作为 `x-signature`。

请求头还需 `x-app-key` 和 `x-timestamp`（当前 Unix 秒，有效窗口 ±300 秒，无 nonce）。Secret 不发送。变量含对象或数组时，需向对接人确认复杂变量的规范化规则，不能直接套用下面的标量示例。

## 登录并读取资料

将下例保存为本机临时 `.mjs` 文件，使用 Node.js ≥ 20.11 执行 `node --env-file=.env <脚本.mjs>`。配置项见 Demo 的 `.env.example`；使用已配置的正式服务及授权身份，不打印凭证或完整响应。

```js
import { createHash } from "node:crypto";

const base = new URL(process.env.DEMO_API_BASE_URL);
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
    throw new Error("Only an approved HTTPS endpoint or local loopback is allowed");
}
if (base.pathname !== "/" || base.search || base.hash || base.username || base.password) {
    throw new Error("Use the site root URL without credentials, query or fragment");
}
const variables = {
    openid: process.env.DEMO_OPENID,
    organizationId: Number(process.env.DEMO_ORGANIZATION_ID),
    teamId: Number(process.env.DEMO_TEAM_ID),
};
if (!variables.openid || !Number.isSafeInteger(variables.organizationId) || !Number.isSafeInteger(variables.teamId) || variables.organizationId <= 0 || variables.teamId <= 0 || !process.env.DEMO_APP_KEY || !process.env.DEMO_APP_SECRET) {
    throw new Error("Authorized member and application configuration is required");
}
const canonical = Object.keys(variables).sort().map((key) => `${key}=${variables[key]}`).join("&");
const signature = createHash("md5").update(canonical + process.env.DEMO_APP_SECRET, "utf8").digest("hex");

async function post(endpoint, query, vars, headers) {
    const response = await fetch(new URL(`/api/graphql/${endpoint}`, base), {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ query, variables: vars }),
        signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok || result.errors?.length) {
        // Report only status and stable error codes, not the raw body or credentials.
        throw new Error(`GraphQL ${endpoint} failed: HTTP ${response.status}; codes=${(result.errors ?? []).map(({ extensions }) => extensions?.code ?? "UNKNOWN").join(",")}`);
    }
    return result.data;
}

const login = await post("application", `mutation Login($openid: String!, $organizationId: Int!, $teamId: Int!) {
    login(openid: $openid, organizationId: $organizationId, teamId: $teamId) { token memberId }
}`, variables, {
    "x-app-key": process.env.DEMO_APP_KEY,
    "x-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-signature": signature,
});
const profile = await post("member", "query Profile { getProfile { memberId teamId } }", {}, {
    authorization: `Bearer ${login.login.token}`,
});
if (login.login.memberId !== profile.getProfile.memberId) throw new Error("Member identity mismatch");
console.log({ memberId: profile.getProfile.memberId, teamId: profile.getProfile.teamId });
```

其他接口沿用同一鉴权方式，参数和返回字段按目标环境文档选择。
