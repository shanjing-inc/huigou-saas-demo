# 签名与登录

正式域名为 `https://saas.tbxzs.cn/`。合作方请求发到 `/api/graphql/partner`；成员请求发到 `/api/graphql/member`，只需 Bearer Token，不签名。

## 应用签名

仅签最终发送的原始 JSON `variables`（GraphQL 类型转换前），不签 query、时间戳、App Key 或路径：

1. 顶层去掉 `null`、`undefined`、全空白字符串和空数组；保留 `0`、`false`、空对象。
2. 顶层字段按 JavaScript `Object.keys(variables).sort()` 排序。标量用 `String(value)`；非空字符串原样保留，包括首尾空格。
3. 对象 / 数组转成紧凑 JSON：递归移除 **仅 null / undefined** 的项，对象键排序，数组保留其余项的顺序。嵌套空字符串、空数组、空对象都保留。Unicode 不转成 ASCII 转义；整数形式对象键遵循 JavaScript JSON 序列化顺序。
4. 用 `&` 连接 `key=value`，不做 URL 编码，末尾直接追加 Secret。
5. 对 UTF-8 字符串算 MD5，取 32 位小写十六进制作为 `x-signature`。

请求头还需 `x-app-key` 和 `x-timestamp`（当前 Unix 秒，有效窗口 ±300 秒，无 nonce）。Secret 不发送。签名不提供业务幂等保证。

使用 [signature.mjs](../scripts/signature.mjs) 的 `signApplicationInput(variables, secret)`，不要为复杂变量拼另一套签名。输入使用普通 JSON 值，不传 BigInt、Date、NaN 等 JavaScript 特有值；先序列化再解析得到最终 variables，签名后不再修改。

合作方字段的参数全部使用 GraphQL 变量，不内联写常量；组织 / Team 等范围参数的变量名与参数名保持一致，不用变量默认值隐藏漏传。请求为一个 JSON 对象（不支持批量数组），带 `Content-Type: application/json`，请求体不超过 64 KiB。不要记录 Secret、Token 或追加 Secret 后的签名原文。

### 固定校验样例

以下 Secret 均为虚构的 `example-secret`，只用于校验算法：

| variables | 签名原文（未追加 Secret） | MD5 |
| --- | --- | --- |
| `{"teamId":2,"openid":"demo-openid","organizationId":1}` | `openid=demo-openid&organizationId=1&teamId=2` | `b3de98e49d0fd88aac1616d19c7fd473` |
| `{"where":{"name":{"eq":"中文"},"id":{"eq":7}},"organizationId":1}` | `organizationId=1&where={"id":{"eq":7},"name":{"eq":"中文"}}` | `6f6e267aa90224024a6852c4526579fd` |

边界样例：`{"name":" A ","zero":0,"enabled":false,"emptyObject":{},"blank":"  ","empty":[],"nil":null,"list":[null,"",{},[],{"z":"中文","a":0,"n":null}]}`。

原文为 `emptyObject={}&enabled=false&list=["",{},[],{"a":0,"z":"中文"}]&name= A &zero=0`，签名为 `0367266803c9a053f7737053f0c05d02`。

## 登录并读取资料

将下例保存为 Demo 根目录的临时 `.mjs` 文件，使用 Node.js ≥ 20.11 执行 `node --env-file=.env <脚本.mjs>`。只安装 skill 时，调整 import 指向随附的 scripts 目录。配置项见 Demo 的 `.env.example`；使用已配置的正式服务及授权身份，不打印凭证或完整响应。

```js
import { signApplicationInput } from "./skills/huigou-saas-skills/scripts/signature.mjs";

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
const signature = signApplicationInput(variables, process.env.DEMO_APP_SECRET);

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

const login = await post("partner", `mutation Login($openid: String!, $organizationId: Int!, $teamId: Int!) {
    login(openid: $openid, organizationId: $organizationId, teamId: $teamId) { token memberId expiresIn }
}`, variables, {
    "x-app-key": process.env.DEMO_APP_KEY,
    "x-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-signature": signature,
});
const profile = await post("member", "query Profile { getProfile { memberId teamId } }", {}, {
    authorization: `Bearer ${login.login.token}`,
});
if (login.login.memberId !== profile.getProfile.memberId) throw new Error("Member identity mismatch");
// Store token and Date.now() + expiresIn * 1000 in the trusted backend session.
console.log({ memberId: profile.getProfile.memberId, teamId: profile.getProfile.teamId });
```

后端按返回的 `expiresIn` 管理会话。其他请求沿用 `post`，合作方每次用本次 variables 重新签名并更新时间戳；见 [业务调用示例](examples.md)。
