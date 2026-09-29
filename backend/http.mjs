import http from "node:http";
import { createDemo, DemoError, loadConfig } from "./core.mjs";

function privateIPv4(value) {
    const parts = value.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return false;
    const [first, second] = parts.map(Number);
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function listenHost(env) {
    const host = env.DEMO_LAN_HOST?.trim();
    if (env.DEMO_LAN_TOKEN) throw new Error("DEMO_LAN_TOKEN is no longer supported; remove it from .env.");
    if (!host) {
        return "127.0.0.1";
    }
    if (!privateIPv4(host)) throw new Error("DEMO_LAN_HOST must be a private IPv4 address on this computer.");
    return host;
}

function authorized(req, host) {
    if (req.headers.origin) return false;
    if (req.headers.host !== `${host}:${req.socket.localPort}`) {
        return host === "127.0.0.1" && req.headers.host === `localhost:${req.socket.localPort}`;
    }
    return host === "127.0.0.1" || privateIPv4(req.socket.remoteAddress ?? "") || req.socket.remoteAddress === "127.0.0.1";
}

function respond(res, status, body) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(body));
}

export function createServer(env, fetchImpl) {
    const host = listenHost(env);
    let demo;
    let configurationError;
    try {
        demo = createDemo(loadConfig(env), fetchImpl);
    } catch (error) {
        configurationError = error;
    }

    return http.createServer(async (req, res) => {
        if (!authorized(req, host)) {
            respond(res, 403, { code: "FORBIDDEN", message: "服务地址无效。" });
            return;
        }
        if (req.url === "/api/status" && req.method === "GET") {
            respond(res, 200, { demo: true, configured: Boolean(demo), mode: "live", supportsAccountManagement: true });
            return;
        }
        if (req.url !== "/api/login" && req.url !== "/api/logout" && !/^\/api\/(profile|parse|item|link|orders|bills|withdrawals|wallet|accounts|createAccount|updateAccount|deleteAccount|withdraw)$/.test(req.url ?? "")) {
            respond(res, 404, { code: "NOT_FOUND", message: "接口不存在。" });
            return;
        }
        if (req.method !== "POST") {
            respond(res, 405, { code: "METHOD", message: "请求方式无效。" });
            return;
        }
        if (!req.headers["content-type"]?.startsWith("application/json")) {
            respond(res, 415, { code: "INPUT", message: "请求必须是 JSON。" });
            return;
        }
        try {
            let raw = "";
            for await (const chunk of req) {
                raw += chunk;
                if (raw.length > 8192) throw new DemoError("INPUT", "请求内容过长。", 413);
            }
            let input;
            try {
                input = JSON.parse(raw);
            } catch {
                throw new DemoError("INPUT", "JSON 格式无效。");
            }
            if (!input || Array.isArray(input) || typeof input !== "object") {
                throw new DemoError("INPUT", "请求参数无效。");
            }
            if (configurationError) throw configurationError;
            const session = req.headers["x-demo-session"];
            if (req.url === "/api/login") {
                if (Object.keys(input).length) throw new DemoError("INPUT", "登录身份由本机后端固定配置，不能由客户端提供。");
                respond(res, 200, await demo.login(typeof session === "string" ? session : undefined));
            } else if (req.url === "/api/logout") {
                if (Object.keys(input).length) throw new DemoError("INPUT", "请求参数无效。");
                if (typeof session === "string") demo.logout(session);
                respond(res, 200, { ok: true });
            } else {
                const action = req.url.slice(5);
                respond(res, 200, { data: await demo.request(action, input, session) });
            }
        } catch (error) {
            const known = error instanceof DemoError;
            respond(res, known ? error.status : 500, {
                code: known ? error.code : "SERVER",
                message: known ? error.message : "演示服务暂时不可用。",
            });
        }
    });
}
