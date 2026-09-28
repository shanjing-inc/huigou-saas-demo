import { createHash, randomBytes } from "node:crypto";
import { operations } from "./queries.mjs";

const validPlatforms = new Set([
    "alibaba", "canyin", "dangdang", "didi", "douyin", "eleme", "jd", "kuaishou",
    "meituan", "meituanCoupon", "pdd", "suning", "taobao", "taopiaopiao", "tongcheng",
    "vip", "xianyu", "xiaomiyoupin", "xingbake", "yanxuan",
]);
const types = new Set(["goods", "activity", "live", "life"]);

export class DemoError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

export function loadConfig(env) {
    const base = env.DEMO_API_BASE_URL;
    let url;
    try {
        url = new URL(base);
    } catch {
        throw new DemoError("CONFIG", "请在本机后端的私有配置中设置测试服务地址。", 503);
    }
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        throw new DemoError("CONFIG", "测试服务地址须为 HTTPS 站点根地址，或本机回环地址的 HTTP 开发服务。", 503);
    }
    const keys = ["DEMO_APP_KEY", "DEMO_APP_SECRET", "DEMO_OPENID"];
    if (keys.some((key) => !env[key] || env[key].startsWith("replace-with-"))) {
        throw new DemoError("CONFIG", "请配置隔离测试身份及应用凭证。", 503);
    }
    const organizationId = Number(env.DEMO_ORGANIZATION_ID);
    const teamId = Number(env.DEMO_TEAM_ID);
    if (![organizationId, teamId].every((n) => Number.isSafeInteger(n) && n > 0)) {
        throw new DemoError("CONFIG", "请配置正整数的测试组织与 Team ID。", 503);
    }
    return {
        base: url.origin,
        appKey: env.DEMO_APP_KEY,
        secret: env.DEMO_APP_SECRET,
        openid: env.DEMO_OPENID,
        organizationId,
        teamId,
    };
}

export function sign(variables, secret) {
    const canonical = Object.keys(variables).sort().filter((key) => variables[key] !== null && variables[key] !== undefined && variables[key] !== "")
        .map((key) => `${key}=${variables[key]}`).join("&");
    return createHash("md5").update(`${canonical}${secret}`, "utf8").digest("hex");
}

function fields(input, allowed) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
        throw new DemoError("INPUT", "请求参数不符合演示接口要求。");
    }
}

function variablesFor(action, input) {
    if (action === "profile") {
        fields(input, []);
        return {};
    }
    if (action === "parse") {
        fields(input, ["content"]);
        if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 4096) {
            throw new DemoError("INPUT", "请输入 1-4096 字符的分享内容。");
        }
        return { content: input.content.trim() };
    }
    if (action === "item" || action === "link") {
        fields(input, ["material", "platform", "materialType"]);
        if (typeof input.material !== "string" || !input.material.trim() || input.material.length > 2048 || !validPlatforms.has(input.platform) || (input.materialType !== undefined && !types.has(input.materialType))) {
            throw new DemoError("INPUT", "请选择有效候选物料，或检查物料类型和长度。");
        }
        return { material: input.material.trim(), platform: input.platform, ...(input.materialType ? { materialType: input.materialType } : {}) };
    }
    if (["orders", "bills", "withdrawals"].includes(action)) {
        fields(input, ["page"]);
        const page = input.page ?? 1;
        if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new DemoError("INPUT", "页码无效。");
        return { page, limit: 20 };
    }
    throw new DemoError("INPUT", "不支持该操作。", 404);
}

function upstreamError(errors, isLogin) {
    const codes = errors.map((item) => item?.extensions?.code).filter((code) => typeof code === "string");
    const expired = codes.some((code) => /AUTH|TOKEN|UNAUTH|FORBIDDEN|JWT/i.test(code));
    if (expired && !isLogin) return new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
    if (isLogin) return new DemoError("LOGIN_FAILED", "测试身份或应用凭证无效，请检查本机后端的私有配置与测试环境授权。", 401);
    const reason = errors.find((item) => typeof item?.extensions?.reasonCode === "string")?.extensions?.reasonCode;
    if (typeof reason === "string" && /^[A-Z_]{2,48}$/.test(reason)) {
        return new DemoError("UPSTREAM", `上游暂不可用（${reason}）。`, 502);
    }
    return new DemoError("UPSTREAM", "接口调用失败，请核对目标环境的 SDL 与服务配置。", 502);
}

export function createDemo(config, fetchImpl = fetch) {
    const sessions = new Map();

    async function call(action, variables, token) {
        const operation = operations[action];
        const headers = { "content-type": "application/json" };
        if (action === "login") {
            headers["x-app-key"] = config.appKey;
            headers["x-timestamp"] = String(Math.floor(Date.now() / 1000));
            headers["x-signature"] = sign(variables, config.secret);
        } else {
            headers.authorization = `Bearer ${token}`;
        }
        let response;
        try {
            response = await fetchImpl(`${config.base}/api/graphql/${operation.endpoint}`, {
                method: "POST", headers, body: JSON.stringify({ query: operation.query, variables }),
                signal: AbortSignal.timeout(12000),
            });
        } catch {
            throw new DemoError("NETWORK", "无法连接测试服务，请检查地址或网络。", 502);
        }
        let result;
        try {
            result = await response.json();
        } catch {
            throw new DemoError("UPSTREAM", "测试服务返回了非 JSON 内容。", 502);
        }
        if (Array.isArray(result.errors) && result.errors.length) throw upstreamError(result.errors, action === "login");
        if (!response.ok) {
            if (action !== "login" && [401, 403].includes(response.status)) {
                throw new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
            }
            throw upstreamError([], action === "login" && [401, 403].includes(response.status));
        }
        const data = result?.data?.[action === "login" ? "login" : operation.field];
        if (data === undefined || data === null) throw new DemoError("UPSTREAM", "测试服务响应缺少所需字段。", 502);
        return data;
    }

    async function login(previous) {
        if (previous) sessions.delete(previous);
        // Production must obtain an OpenID from the partner's trusted login service.
        // This fixed isolated test OpenID must never be used for real users.
        const variables = { openid: config.openid, organizationId: config.organizationId, teamId: config.teamId };
        const result = await call("login", variables);
        if (typeof result.token !== "string" || !result.token || !Number.isSafeInteger(result.memberId)) {
            throw new DemoError("UPSTREAM", "登录响应无效。", 502);
        }
        const session = randomBytes(32).toString("hex");
        sessions.set(session, result.token);
        try {
            const profile = await call("profile", {}, result.token);
            return { session, profile };
        } catch (error) {
            sessions.delete(session);
            throw error;
        }
    }

    async function request(action, input, session) {
        const variables = variablesFor(action, input);
        const token = sessions.get(session);
        if (!token) throw new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
        try {
            const result = await call(action, variables, token);
            if (["orders", "bills", "withdrawals"].includes(action) && (!Array.isArray(result.items) || typeof result.hasMore !== "boolean" && result.hasMore !== null)) {
                throw new DemoError("UPSTREAM", "列表响应结构无效。", 502);
            }
            return result;
        } catch (error) {
            if (error.code === "SESSION_EXPIRED") sessions.delete(session);
            throw error;
        }
    }

    return { login, request, logout: (session) => sessions.delete(session) };
}
