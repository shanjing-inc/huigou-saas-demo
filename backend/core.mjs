import { createHash, randomBytes } from "node:crypto";
import { operations } from "./queries.mjs";

const validPlatforms = new Set([
    "alibaba", "canyin", "dangdang", "didi", "douyin", "eleme", "jd", "kuaishou",
    "meituan", "meituanCoupon", "pdd", "suning", "taobao", "taopiaopiao", "tongcheng",
    "vip", "xianyu", "xiaomiyoupin", "xingbake", "yanxuan",
]);
const types = new Set(["goods", "activity", "live", "life"]);
const statisticPeriods = new Set(["day", "month", "year"]);

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

export function statisticRange(period, now = new Date()) {
    if (period === "day") return {};
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const to = `${fields.year}-${fields.month}-${fields.day}`;
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
    return { from, to };
}

function fields(input, allowed) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
        throw new DemoError("INPUT", "请求参数不符合演示接口要求。");
    }
}

function variablesFor(action, input) {
    if (action === "wallet") {
        fields(input, ["page", "period"]);
        const page = input.page ?? 1;
        if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !statisticPeriods.has(input.period)) {
            throw new DemoError("INPUT", "钱包统计周期或页码无效。");
        }
        return { page, period: input.period, limit: 20, ...statisticRange(input.period) };
    }
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
        if (operation.endpoint === "application") {
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
        if (Array.isArray(result.errors) && result.errors.length) {
            if (action === "wallet" && result.errors.some((item) => /AUTH|TOKEN|UNAUTH|FORBIDDEN|JWT/i.test(item?.extensions?.code ?? ""))) {
                throw new DemoError("UPSTREAM", "收益统计接口授权失败，请核对本机测试应用配置。", 502);
            }
            throw upstreamError(result.errors, action === "login");
        }
        if (!response.ok) {
            if (operation.endpoint === "member" && [401, 403].includes(response.status)) {
                throw new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
            }
            if (action === "wallet" && [401, 403].includes(response.status)) {
                throw new DemoError("UPSTREAM", "收益统计接口授权失败，请核对本机测试应用配置。", 502);
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
        sessions.set(session, { token: result.token, memberId: result.memberId });
        try {
            const profile = await call("profile", {}, result.token);
            if (profile.memberId !== result.memberId) throw new DemoError("UPSTREAM", "登录成员资料与会话不匹配。", 502);
            return { session, profile };
        } catch (error) {
            sessions.delete(session);
            throw error;
        }
    }

    async function request(action, input, session) {
        const variables = variablesFor(action, input);
        const authenticated = sessions.get(session);
        if (!authenticated) throw new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
        try {
            if (action === "wallet") {
                const profile = await call("profile", {}, authenticated.token);
                if (profile.memberId !== authenticated.memberId) throw new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
                const statistics = await call("wallet", { ...variables, memberId: authenticated.memberId });
                if (!Array.isArray(statistics.items) || typeof statistics.hasMore !== "boolean") {
                    throw new DemoError("UPSTREAM", "统计响应结构无效。", 502);
                }
                return { profile, ...statistics };
            }
            const result = await call(action, variables, authenticated.token);
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
