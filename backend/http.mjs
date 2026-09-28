import http from "node:http";
import { createDemo, DemoError, loadConfig } from "./core.mjs";

function respond(res, status, body) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(body));
}

export function createServer(env, fetchImpl) {
    let demo;
    let configurationError;
    try {
        demo = createDemo(loadConfig(env), fetchImpl);
    } catch (error) {
        configurationError = error;
    }

    return http.createServer(async (req, res) => {
        // This demo is loopback-only and does not accept browser cross-origin requests.
        if (!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(req.headers.host ?? "") || req.headers.origin) {
            respond(res, 403, { code: "FORBIDDEN", message: "仅允许本机模拟器访问。" });
            return;
        }
        if (req.url === "/api/status" && req.method === "GET") {
            respond(res, 200, { demo: true, configured: Boolean(demo), mode: "real-test-only" });
            return;
        }
        if (req.url !== "/api/login" && req.url !== "/api/logout" && !/^\/api\/(profile|parse|item|link|orders|bills|withdrawals)$/.test(req.url ?? "")) {
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
