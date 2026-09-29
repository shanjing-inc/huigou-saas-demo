import { createHash, randomBytes } from "node:crypto";
import { operations } from "./queries.mjs";

const validPlatforms = new Set([
    "alibaba", "canyin", "dangdang", "didi", "douyin", "eleme", "jd", "kuaishou",
    "meituan", "meituanCoupon", "pdd", "suning", "taobao", "taopiaopiao", "tongcheng",
    "vip", "xianyu", "xiaomiyoupin", "xingbake", "yanxuan",
]);
const types = new Set(["goods", "activity", "live", "life"]);
const statisticPeriods = new Set(["day", "month", "year"]);
const accountTypes = new Set([1, 2, 3]);
const accountId = (id) => Number.isSafeInteger(id) && id > 0;

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
        throw new DemoError("CONFIG", "请在本机后端的私有配置中设置服务地址。", 503);
    }
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        throw new DemoError("CONFIG", "服务地址须为 HTTPS 站点根地址，或本机回环地址的 HTTP 开发服务。", 503);
    }
    const keys = ["DEMO_APP_KEY", "DEMO_APP_SECRET", "DEMO_OPENID"];
    if (keys.some((key) => !env[key] || env[key].startsWith("replace-with-"))) {
        throw new DemoError("CONFIG", "请配置获授权的成员身份及应用凭证。", 503);
    }
    const organizationId = Number(env.DEMO_ORGANIZATION_ID);
    const teamId = Number(env.DEMO_TEAM_ID);
    if (![organizationId, teamId].every((n) => Number.isSafeInteger(n) && n > 0)) {
        throw new DemoError("CONFIG", "请配置正整数的组织与 Team ID。", 503);
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
    if (action === "accounts") {
        fields(input, []);
        return {};
    }
    if (action === "createAccount") {
        fields(input, ["type", "name", "account", "identificationCode", "bankName"]);
        const { type, name, account, identificationCode, bankName } = input;
        if (!accountTypes.has(type) || typeof name !== "string" || !name.trim() || name.trim().length > 60 ||
            typeof account !== "string" || !account.trim() || account.trim().length > 255 ||
            (identificationCode !== undefined && (typeof identificationCode !== "string" || identificationCode.trim().length > 30)) ||
            (bankName !== undefined && (type !== 3 || typeof bankName !== "string" || !bankName.trim() || bankName.trim().length > 255))) {
            throw new DemoError("INPUT", "收款账号信息无效。");
        }
        const value = account.trim();
        if (type === 1 && !/^1[3-9]\d{9}$|^[a-z0-9+_-]+(?:\.[a-z0-9+_-]+)*@(?:[a-z0-9-]+\.)+[a-z]{2,6}$|^\d+-\d+$/i.test(value) ||
            type === 3 && !/^\d{16,19}$/.test(value.replace(/[\s-]/g, ""))) {
            throw new DemoError("INPUT", "请检查收款账号格式。");
        }
        return { type, name: name.trim(), account: value,
            ...(identificationCode !== undefined ? { identificationCode: identificationCode.trim() } : {}),
            ...(bankName ? { ext: JSON.stringify({ bankName: bankName.trim() }) } : {}) };
    }
    if (action === "updateAccount") {
        fields(input, ["id", "name", "identificationCode"]);
        if (!accountId(input.id) ||
            (input.name === undefined && input.identificationCode === undefined) ||
            (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 60)) ||
            (input.identificationCode !== undefined && (typeof input.identificationCode !== "string" || input.identificationCode.trim().length > 30))) {
            throw new DemoError("INPUT", "收款账号修改信息无效。");
        }
        return { id: input.id, ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.identificationCode !== undefined ? { identificationCode: input.identificationCode.trim() } : {}) };
    }
    if (action === "deleteAccount") {
        fields(input, ["id"]);
        if (!accountId(input.id)) throw new DemoError("INPUT", "收款账号 ID 无效。");
        return { id: input.id };
    }
    if (action === "withdraw") {
        fields(input, ["amount", "withdrawalAccountId"]);
        if (!accountId(input.withdrawalAccountId) || typeof input.amount !== "string" ||
            !/^(?:[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(input.amount)) {
            throw new DemoError("INPUT", "请输入不低于 1 元且最多两位小数的提现金额及有效收款账号。");
        }
        return { amount: input.amount, withdrawalAccountId: String(input.withdrawalAccountId) };
    }
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
            throw new DemoError("INPUT", "请选择有效的解析结果，或检查物料类型和长度。");
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
    if (isLogin) return new DemoError("LOGIN_FAILED", "成员身份或应用凭证无效，请检查本机后端的私有配置与授权。", 401);
    if (codes.includes("CONFLICT")) return new DemoError("CONFLICT", "账号已登记或相同金额的提现正在处理中，请刷新后核对记录。", 409);
    if (codes.includes("BAD_USER_INPUT")) return new DemoError("INPUT", "请检查金额、余额和收款账号信息。", 400);
    const reason = errors.find((item) => typeof item?.extensions?.reasonCode === "string")?.extensions?.reasonCode;
    if (typeof reason === "string" && /^[A-Z_]{2,48}$/.test(reason)) {
        return new DemoError("UPSTREAM", `上游暂不可用（${reason}）。`, 502);
    }
    return new DemoError("UPSTREAM", "接口调用失败，请核对目标环境的 SDL 与服务配置。", 502);
}

const uncertainWithdrawal = () => new DemoError("UNCERTAIN", "提现请求结果未确认，请先核对提现记录，勿重复提交。", 502);

export function createDemo(config, fetchImpl = fetch) {
    const sessions = new Map();

    async function call(action, variables, token) {
        const operation = operations[action];
        const headers = { "content-type": "application/json" };
        if (operation.endpoint === "partner") {
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
            if (action === "withdraw") throw uncertainWithdrawal();
            throw new DemoError("NETWORK", "无法连接服务，请检查地址或网络。", 502);
        }
        let result;
        try {
            result = await response.json();
        } catch {
            if (action === "withdraw") throw uncertainWithdrawal();
            throw new DemoError("UPSTREAM", "服务返回了非 JSON 内容。", 502);
        }
        if (Array.isArray(result.errors) && result.errors.length) {
            if (action === "wallet" && result.errors.some((item) => /AUTH|TOKEN|UNAUTH|FORBIDDEN|JWT/i.test(item?.extensions?.code ?? ""))) {
                throw new DemoError("UPSTREAM", "收益统计接口授权失败，请核对本机应用配置。", 502);
            }
            const error = upstreamError(result.errors, action === "login");
            throw action === "withdraw" && error.code === "UPSTREAM" ? uncertainWithdrawal() : error;
        }
        if (!response.ok) {
            if (operation.endpoint === "member" && [401, 403].includes(response.status)) {
                throw new DemoError("SESSION_EXPIRED", "成员会话已失效，请重新登录。", 401);
            }
            if (action === "wallet" && [401, 403].includes(response.status)) {
                throw new DemoError("UPSTREAM", "收益统计接口授权失败，请核对本机应用配置。", 502);
            }
            if (action === "withdraw") throw uncertainWithdrawal();
            throw upstreamError([], action === "login" && [401, 403].includes(response.status));
        }
        const data = result?.data?.[action === "login" ? "login" : operation.field];
        if (data === undefined || data === null) {
            if (action === "withdraw") throw uncertainWithdrawal();
            throw new DemoError("UPSTREAM", "服务响应缺少所需字段。", 502);
        }
        return data;
    }

    async function login(previous) {
        if (previous) sessions.delete(previous);
        // This local demo uses the configured member's OpenID.
        // User-facing integrations must obtain each user's OpenID from a trusted login service.
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
            if (action === "accounts") {
                if (!Array.isArray(result) || result.some((item) => !accountId(item?.id) || !accountTypes.has(item.type) || typeof item.account !== "string")) {
                    throw new DemoError("UPSTREAM", "收款账号列表结构无效。", 502);
                }
                return result.map((item) => ({ id: item.id, type: item.type,
                    name: typeof item.name === "string" ? `${Array.from(item.name)[0] ?? ""}***` : "***",
                    account: item.account.length > 4 ? `****${item.account.slice(-4)}` : "****", isDefault: Boolean(item.isDefault) }));
            }
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
