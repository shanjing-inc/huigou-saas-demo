# 隔离环境请求示例

仅在获得目标环境及测试身份授权后执行。通过 Demo 根目录的本机 `.env` 管理 `DEMO_API_BASE_URL`、`DEMO_APP_KEY`、`DEMO_APP_SECRET`、`DEMO_OPENID`、`DEMO_ORGANIZATION_ID`、`DEMO_TEAM_ID`；`.env` 已忽略，不要写入仓库。实际惠购 Saas 版 Schema 以目标环境 GraphiQL 为准：浏览器打开 `<目标站点>/api/graphql/application` 和 `<目标站点>/api/graphql/member`，查看 Docs/Explorer；生产调试页 `/test/service-graphiql` 不开放。对两个端点只发送 `__schema` / `__type` 的自省查询可不带凭证，但业务调用必须签名或带 JWT。

下例只演示 `login` 和 `getProfile` 的**标量**变量签名。在可信本机后端执行；示例代码不打印 Token、Secret 或完整响应。可将其保存为本机临时脚本，使用 Node.js 20+ 的 `node --env-file=.env <脚本>` 执行。**不要**把 Secret 放在浏览器、小程序或已提交脚本中。

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
    throw new Error("Authorized isolated test configuration is required");
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

发送其他业务请求之前先查该环境 Schema，按当前字段签名与授权范围构造请求。**如果 variables 含数组/对象**，使用惠购 Saas 版 `src/rebate/application-signature.ts` 的规范化规则（对象键递归排序、空值过滤并稳定 JSON 序列化），不要将上面的标量示例或 Demo 的 `sign` 直接扩展到复杂变量。正式对接不能使用 Demo 的固定 OpenID 获取真实用户 Token。
