import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { createDemo, DemoError, loadConfig, sign } from "../backend/core.mjs";
import { createServer } from "../backend/http.mjs";

const env = {
    DEMO_API_BASE_URL: "https://isolated.example.test",
    DEMO_APP_KEY: "test-key", DEMO_APP_SECRET: "test-secret",
    DEMO_OPENID: "test-only-openid", DEMO_ORGANIZATION_ID: "12", DEMO_TEAM_ID: "34",
};
const config = loadConfig(env);
const calls = [];
let badLogin = false;
let expired = false;

function upstream(url, options) {
    calls.push({ url, options });
    const query = JSON.parse(options.body).query;
    let payload;
    if (query.includes("mutation Login")) {
        payload = badLogin ? { errors: [{ message: "do not expose secrets", extensions: { code: "FORBIDDEN" } }] }
            : { data: { login: { token: "member-jwt-private", memberId: 99 } } };
    } else if (expired) {
        payload = { errors: [{ message: "private upstream message", extensions: { code: "UNAUTHENTICATED" } }] };
    } else if (query.includes("query Profile")) {
        payload = { data: { getProfile: { memberId: 99, teamId: 34, role: "member", money: "1.00", pendingMoney: "0", withdrawalMoney: "0" } } };
    } else if (query.includes("query Parse")) {
        payload = { data: { parsePromotionMaterial: [{ platform: "jd", type: "goods", keyContent: "share", detail: { itemUrl: "https://test.example/item", itemId: "8", itemTitle: "Test" } }] } };
    } else if (query.includes("mutation Link")) {
        payload = { data: { createPromotionLink: { url: "https://test.example/ref" } } };
    } else if (query.includes("query Item")) {
        payload = { data: { getPromotionItem: { itemId: "8", title: "Test", couponInfo: { amount: "20" } } } };
    } else {
        const name = query.includes("query Orders") ? "listOrders" : query.includes("query Bills") ? "listBills" : "listWithdrawals";
        payload = { data: { [name]: { items: [], hasMore: false } } };
    }
    return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }));
}

test("validates isolated configuration and signs sorted GraphQL variables", () => {
    assert.throws(() => loadConfig({ ...env, DEMO_API_BASE_URL: "http://example.com" }), /HTTPS/);
    for (const base of ["http://localhost:4322", "http://127.0.0.1:4322"]) {
        assert.equal(loadConfig({ ...env, DEMO_API_BASE_URL: base }).base, base);
    }
    for (const base of ["http://127.0.0.1.evil.example:4322", "http://[::1]:4322", "http://localhost:4322/other", "http://user:pass@localhost:4322"]) {
        assert.throws(() => loadConfig({ ...env, DEMO_API_BASE_URL: base }), /HTTPS/);
    }
    assert.throws(() => loadConfig({ ...env, DEMO_APP_SECRET: "replace-with-secret" }), /隔离测试/);
    const vars = { teamId: 34, openid: "test-only-openid", organizationId: 12 };
    assert.equal(sign(vars, config.secret), createHash("md5").update("openid=test-only-openid&organizationId=12&teamId=34test-secret").digest("hex"));
});

test("fixed identity, member JWT confinement, candidate, link and empty lists", async () => {
    calls.length = 0;
    const demo = createDemo(config, upstream);
    const { session, profile } = await demo.login();
    assert.equal(session.length, 64);
    assert.equal(profile.teamId, 34);
    assert.equal(JSON.stringify(profile).includes("member-jwt-private"), false);
    const login = calls[0];
    assert.ok(login.url.endsWith("/api/graphql/application"));
    assert.deepEqual(JSON.parse(login.options.body).variables, { openid: env.DEMO_OPENID, organizationId: 12, teamId: 34 });
    assert.equal(login.options.headers["x-app-key"], config.appKey);
    assert.match(login.options.headers["x-timestamp"], /^\d{10}$/);
    assert.equal(login.options.headers["x-signature"], sign(JSON.parse(login.options.body).variables, config.secret));
    assert.equal(calls[1].options.headers.authorization, "Bearer member-jwt-private");
    assert.equal(calls[1].options.headers["x-app-key"], undefined);
    const candidates = await demo.request("parse", { content: "share" }, session);
    assert.equal(candidates[0].platform, "jd");
    const product = await demo.request("item", { material: "8", platform: "jd", materialType: "goods" }, session);
    assert.equal(product.couponInfo.amount, "20");
    assert.match(JSON.parse(calls.at(-1).options.body).query, /couponInfo\s*\{\s*amount\s*\}/);
    const link = await demo.request("link", { material: candidates[0].detail.itemUrl, platform: "jd", materialType: "goods" }, session);
    assert.equal(link.url, "https://test.example/ref");
    for (const action of ["orders", "bills", "withdrawals"]) {
        assert.deepEqual(await demo.request(action, { page: 1 }, session), { items: [], hasMore: false });
    }
    const orderQuery = JSON.parse(calls.find((call) => JSON.parse(call.options.body).query.includes("query Orders")).options.body).query;
    assert.match(orderQuery, /detail\s*\{\s*payPrice invalidReason goods\s*\{\s*itemId itemTitle imageUrl itemPrice itemNum\s*\}/);
    assert.match(orderQuery, /expectedSettleAt settledAt/);
    assert.equal(demo.logout(session), true);
    await assert.rejects(demo.request("profile", {}, session), (error) => error.code === "SESSION_EXPIRED");
});

test("rejects scope override and refreshes session on revoked token", async () => {
    expired = false;
    const demo = createDemo(config, upstream);
    const { session } = await demo.login();
    const count = calls.length;
    for (const [action, input] of [["profile", { openid: "other" }], ["orders", { organizationId: 2 }], ["parse", { content: "" }], ["link", { material: "test", platform: "nope" }]]) {
        await assert.rejects(demo.request(action, input, session), (error) => error instanceof DemoError && error.code === "INPUT");
    }
    assert.equal(calls.length, count);
    expired = true;
    await assert.rejects(demo.request("orders", {}, session), (error) => error.code === "SESSION_EXPIRED" && !error.message.includes("private"));
    expired = false;
    await assert.rejects(demo.request("profile", {}, session), (error) => error.code === "SESSION_EXPIRED");
});

let server;
let url;
before(async () => {
    server = createServer(env, upstream);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function post(path, input = {}, session) {
    const response = await fetch(`${url}/api/${path}`, {
        method: "POST", headers: { "content-type": "application/json", ...(session ? { "x-demo-session": session } : {}) },
        body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
}

test("HTTP denies client OpenID, reports invalid credentials, then expires stale session", async () => {
    let result = await post("login", { openid: "arbitrary" });
    assert.equal(result.status, 400);
    badLogin = true;
    result = await post("login");
    assert.equal(result.status, 401);
    assert.equal(result.body.code, "LOGIN_FAILED");
    assert.equal(JSON.stringify(result.body).includes("do not expose secrets"), false);
    badLogin = false;
    result = await post("login");
    assert.equal(result.status, 200);
    assert.equal(JSON.stringify(result.body).includes("member-jwt-private"), false);
    expired = true;
    const oldSession = result.body.session;
    result = await post("orders", {}, oldSession);
    assert.equal(result.body.code, "SESSION_EXPIRED");
    expired = false;
    result = await post("profile", {}, oldSession);
    assert.equal(result.status, 401);
    result = await post("profile", {}, "invalid-session");
    assert.equal(result.body.code, "SESSION_EXPIRED");
});

test("status does not reveal credentials; invalid host and content type are blocked", async () => {
    const status = await fetch(`${url}/api/status`);
    assert.deepEqual(await status.json(), { demo: true, configured: true, mode: "real-test-only" });
    const forbidden = await fetch(`${url}/api/status`, { headers: { origin: "https://evil.example" } });
    assert.equal(forbidden.status, 403);
    const invalid = await fetch(`${url}/api/login`, { method: "POST", body: "{}" });
    assert.equal(invalid.status, 415);
});
