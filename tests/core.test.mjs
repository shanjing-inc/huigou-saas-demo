import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { createDemo, DemoError, loadConfig, sign, statisticRange } from "../backend/core.mjs";
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
let badWallet = false;

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
    } else if (query.includes("query Wallet")) {
        payload = badWallet ? { errors: [{ message: "private signing failure", extensions: { code: "FORBIDDEN" } }] }
            : { data: { listRevenueStatistic: { items: [{ date: "2026-09-28", orderCount: 2, estimateMemberOrderCommission: "4.9400", settledMemberOrderCommission: "0.0000" }], hasMore: false } } };
    } else if (query.includes("query Parse")) {
        payload = { data: { parsePromotionMaterial: [{ platform: "jd", type: "goods", keyContent: "share", detail: { itemUrl: "https://test.example/item", itemId: "8", itemTitle: "Test" } }] } };
    } else if (query.includes("mutation Link")) {
        payload = { data: { createPromotionLink: { url: "https://test.example/ref" } } };
    } else if (query.includes("query WithdrawalAccounts")) {
        payload = { data: { listWithdrawalAccounts: [
            { id: 7, type: 1, name: "测试成员", account: "13800123456", isDefault: true, identificationCode: "sensitive" },
            { id: 8, type: 3, name: "银行测试", account: "6222000000001234", isDefault: false },
        ] } };
    } else if (query.includes("mutation CreateWithdrawalAccount")) {
        payload = { data: { createWithdrawalAccount: { id: 9 } } };
    } else if (query.includes("mutation UpdateWithdrawalAccount")) {
        payload = { data: { updateWithdrawalAccount: { id: 7 } } };
    } else if (query.includes("mutation DeleteWithdrawalAccount")) {
        payload = { data: { deleteWithdrawalAccount: 7 } };
    } else if (query.includes("mutation RequestWithdrawal")) {
        payload = { data: { requestWithdrawal: { id: 5, amount: "1.00", status: 1, createdAt: "2026-09-28" } } };
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

test("wallet range uses Shanghai business day and caps yearly views at 366 days", () => {
    assert.deepEqual(statisticRange("day"), {});
    assert.deepEqual(statisticRange("month", new Date("2026-09-27T16:30:00Z")), { from: "2025-09-28", to: "2026-09-28" });
});

test("wallet statistics use the authenticated member ID with signed application credentials", async () => {
    calls.length = 0;
    const demo = createDemo(config, upstream);
    const { session } = await demo.login();
    for (const input of [{ period: "day", memberId: 8 }, { period: "month", organizationId: 1 }, { period: "year", from: "2020-01-01" }, { period: "all" }, { period: "day", page: 0 }]) {
        await assert.rejects(demo.request("wallet", input, session), (error) => error.code === "INPUT");
    }
    assert.equal(calls.length, 2);
    const wallet = await demo.request("wallet", { period: "month", page: 1 }, session);
    assert.equal(wallet.profile.money, "1.00");
    assert.equal(wallet.items[0].estimateMemberOrderCommission, "4.9400");
    const profileCall = calls.at(-2);
    const statisticCall = calls.at(-1);
    assert.match(profileCall.url, /\/api\/graphql\/member$/);
    assert.equal(profileCall.options.headers.authorization, "Bearer member-jwt-private");
    assert.match(statisticCall.url, /\/api\/graphql\/application$/);
    const { query, variables } = JSON.parse(statisticCall.options.body);
    assert.match(query, /listRevenueStatistic\(memberId: \$memberId/);
    assert.equal(variables.memberId, 99);
    assert.equal(variables.period, "month");
    assert.equal(variables.limit, 20);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(variables.from));
    assert.equal(statisticCall.options.headers["x-signature"], sign(variables, config.secret));
    assert.equal(statisticCall.options.headers.authorization, undefined);

    badWallet = true;
    await assert.rejects(demo.request("wallet", { period: "day" }, session), (error) => error.code === "UPSTREAM" && !error.message.includes("private"));
    badWallet = false;
    expired = true;
    const before = calls.length;
    await assert.rejects(demo.request("wallet", { period: "day" }, session), (error) => error.code === "SESSION_EXPIRED");
    assert.equal(calls.length, before + 1);
    expired = false;
    await assert.rejects(demo.request("wallet", { period: "day" }, session), (error) => error.code === "SESSION_EXPIRED");
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

test("accounts are redacted without exposing private fields", async () => {
    const demo = createDemo(config, upstream);
    const { session } = await demo.login();
    const accounts = await demo.request("accounts", {}, session);
    assert.deepEqual(accounts.map((item) => item.account), ["****3456", "****1234"]);
    assert.equal(accounts[0].name, "测***");
    assert.equal(JSON.stringify(accounts).includes("sensitive"), false);
    assert.equal(JSON.stringify(accounts).includes("13800123456"), false);
});

test("financial mutations work by default only with member-scoped validated data", async () => {
    const demo = createDemo(config, upstream);
    const { session } = await demo.login();
    const invalid = [
        ["createAccount", { type: 4, name: "Test", account: "123" }],
        ["createAccount", { type: 1, name: "Test", account: "abc" }],
        ["createAccount", { type: 3, name: "Test", account: "1234" }],
        ["createAccount", { type: 2, name: "Test", account: "oid", ext: "{}" }],
        ["updateAccount", { id: 7, account: "replacement" }],
        ["updateAccount", { id: 7 }],
        ["deleteAccount", { id: "7" }],
        ["withdraw", { amount: "0.99", withdrawalAccountId: 7 }],
        ["withdraw", { amount: "1.001", withdrawalAccountId: 7 }],
        ["withdraw", { amount: "1.00", withdrawalAccountId: 7, memberId: 42 }],
    ];
    const count = calls.length;
    for (const [action, input] of invalid) {
        await assert.rejects(demo.request(action, input, session), (error) => error.code === "INPUT");
    }
    assert.equal(calls.length, count);
    assert.deepEqual(await demo.request("createAccount", { type: 3, name: " Bank ", account: "6222 0000 0000 1234", bankName: "Test bank" }, session), { id: 9 });
    let request = calls.at(-1);
    assert.match(request.url, /\/api\/graphql\/member$/);
    assert.equal(request.options.headers.authorization, "Bearer member-jwt-private");
    assert.deepEqual(JSON.parse(request.options.body).variables, { type: 3, name: "Bank", account: "6222 0000 0000 1234", ext: '{"bankName":"Test bank"}' });
    assert.deepEqual(await demo.request("updateAccount", { id: 7, identificationCode: "new-code" }, session), { id: 7 });
    assert.deepEqual(JSON.parse(calls.at(-1).options.body).variables, { id: 7, identificationCode: "new-code" });
    assert.equal(await demo.request("deleteAccount", { id: 7 }, session), 7);
    assert.equal((await demo.request("withdraw", { amount: "1.00", withdrawalAccountId: 8 }, session)).id, 5);
    request = calls.at(-1);
    assert.deepEqual(JSON.parse(request.options.body).variables, { amount: "1.00", withdrawalAccountId: "8" });
    assert.equal(request.options.headers["x-app-key"], undefined);
    demo.logout(session);
    await assert.rejects(demo.request("withdraw", { amount: "1.00", withdrawalAccountId: 8 }, session), (error) => error.code === "SESSION_EXPIRED");
});

test("unconfirmed withdrawal transport failure is never reported as a definitive failure", async () => {
    const failingUpstream = (url, options) => JSON.parse(options.body).query.includes("mutation RequestWithdrawal")
        ? Promise.reject(new Error("timeout after upstream accepted")) : upstream(url, options);
    const demo = createDemo(config, failingUpstream);
    const { session } = await demo.login();
    await assert.rejects(demo.request("withdraw", { amount: "1.00", withdrawalAccountId: 7 }, session),
        (error) => error.code === "UNCERTAIN" && /勿重复提交/.test(error.message));
});

test("an in-progress duplicate withdrawal is surfaced without leaking upstream details", async () => {
    const conflictingUpstream = (url, options) => JSON.parse(options.body).query.includes("mutation RequestWithdrawal")
        ? Promise.resolve(new Response(JSON.stringify({ errors: [{ message: "private duplicate detail", extensions: { code: "CONFLICT" } }] }), { status: 200 }))
        : upstream(url, options);
    const demo = createDemo(config, conflictingUpstream);
    const { session } = await demo.login();
    await assert.rejects(demo.request("withdraw", { amount: "1.00", withdrawalAccountId: 7 }, session),
        (error) => error.code === "CONFLICT" && !error.message.includes("private") && /核对记录/.test(error.message));
});

test("a processed withdrawal with an incomplete response is treated as uncertain", async () => {
    const incomplete = (url, options) => JSON.parse(options.body).query.includes("mutation RequestWithdrawal")
        ? Promise.resolve(new Response(JSON.stringify({ data: { requestWithdrawal: null } }), { status: 200 }))
        : upstream(url, options);
    const demo = createDemo(config, incomplete);
    const { session } = await demo.login();
    await assert.rejects(demo.request("withdraw", { amount: "1.00", withdrawalAccountId: 7 }, session),
        (error) => error.code === "UNCERTAIN");
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

test("HTTP wallet refuses scope overrides and returns only member-scoped statistics", async () => {
    const login = await post("login");
    assert.equal(login.status, 200);
    const invalid = await post("wallet", { period: "day", memberId: 1 }, login.body.session);
    assert.equal(invalid.status, 400);
    const wallet = await post("wallet", { period: "day" }, login.body.session);
    assert.equal(wallet.status, 200);
    assert.equal(wallet.body.data.profile.memberId, 99);
    assert.equal(wallet.body.data.items.length, 1);
    assert.equal(JSON.stringify(wallet.body).includes("member-jwt-private"), false);
});

test("status does not reveal credentials; invalid host and content type are blocked", async () => {
    const status = await fetch(`${url}/api/status`);
    assert.deepEqual(await status.json(), { demo: true, configured: true, mode: "real-test-only", supportsAccountManagement: true });
    const forbidden = await fetch(`${url}/api/status`, { headers: { origin: "https://evil.example" } });
    assert.equal(forbidden.status, 403);
    const invalid = await fetch(`${url}/api/login`, { method: "POST", body: "{}" });
    assert.equal(invalid.status, 415);
});

test("HTTP financial writes require a valid member session and work without an opt-in", async () => {
    const count = calls.length;
    const unauthenticated = await post("withdraw", { amount: "1.00", withdrawalAccountId: 7 });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.body.code, "SESSION_EXPIRED");
    assert.equal(calls.length, count);
    const login = await post("login");
    const result = await post("withdraw", { amount: "1.00", withdrawalAccountId: 7 }, login.body.session);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.id, 5);
    assert.equal(JSON.parse(calls.at(-1).options.body).variables.withdrawalAccountId, "7");
    await post("logout", {}, login.body.session);
    const expired = await post("createAccount", { type: 1, name: "Test", account: "13800123456" }, login.body.session);
    assert.equal(expired.status, 401);
    assert.equal(expired.body.code, "SESSION_EXPIRED");
});
