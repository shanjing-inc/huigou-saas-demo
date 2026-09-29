import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function mountPage(request, setClipboardData = () => {}, showModal = () => {}, navigateToMiniProgram, source = readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8")) {
    let definition;
    const app = { globalData: { session: "local-test-session" } };
    runInNewContext(source, {
        Page: (value) => { definition = value; },
        getApp: () => app,
        wx: { request, setClipboardData, showModal, ...(navigateToMiniProgram ? { navigateToMiniProgram } : {}) },
    });
    return {
        ...definition,
        app,
        data: { ...definition.data, connected: true },
        setData(patch) { Object.assign(this.data, patch); },
    };
}

const flush = () => new Promise(setImmediate);
const candidate = (itemId, itemUrl = `https://example.test/${itemId}`) => ({
    platform: "jd", type: "goods", keyContent: "same share text", detail: { itemId, itemUrl, itemTitle: `商品 ${itemId}` },
});

test("order and wallet views display only supported source metrics", () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../miniprogram/pages/index/index.wxss", import.meta.url), "utf8");
    assert.doesNotMatch(markup, /分享订单|自购预估|带货预估|邀请预估|任务预估|待申请补贴/);
    assert.match(markup, /stat\.orderCount/);
    assert.match(markup, /stat\.displayEstimateMemberOrderCommission/);
    assert.match(markup, /stat\.displaySettledMemberOrderCommission/);
    assert.match(markup, /good\.displayItemPrice/);
    assert.match(markup, /item\.displayRebate/);
    assert.doesNotMatch(markup, /toggleOrderDetail|order-details|order-detail-toggle|item\.expanded/);
    assert.match(markup, /<view class="copy-order [^\"]+" role="button"[^>]+aria-disabled="{{!item\.orderSn}}"[^>]+bindtap="copyOrderSn"><text class="copy-order-text">复制单号<\/text><\/view>/);
    assert.match(styles, /\.copy-order \{[^}]+align-items: center;[^}]+justify-content: center;/);
});

test("all monetary page labels use display fields without changing raw values", () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    for (const field of ["displayMoney", "displayPendingMoney", "displayWithdrawalMoney", "displayEstimateMemberOrderCommission", "displaySettledMemberOrderCommission"]) {
        assert.match(markup, new RegExp(`\\b(?:profile|stat)\\.${field}\\b`));
    }
    assert.doesNotMatch(markup, /\{\{stat\.(?:estimateMemberOrderCommission|settledMemberOrderCommission)\}\}/);
    assert.doesNotMatch(markup, /\{\{profile\.(?:money|pendingMoney|withdrawalMoney)\}\}/);
});

test("shopping instructions render as evenly spaced rounded steps", () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../miniprogram/pages/index/index.wxss", import.meta.url), "utf8");
    assert.match(markup, /<view class="shopping-steps">\s*<view class="shopping-step"><text class="step-number">1<\/text><text>复制商品链接<\/text><\/view>/);
    assert.equal((markup.match(/<view class="shopping-step">/g) || []).length, 3);
    assert.match(styles, /\.shopping-step \{[^}]*flex: 1;[^}]*align-items: center;[^}]*border-radius: 20rpx;/);
    assert.doesNotMatch(styles, /\.shopping-steps > text/);
});

test("parse screens and prompts describe results without changing candidate data", async () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    assert.match(markup, /解析结果 · {{candidates.length}}/);
    assert.doesNotMatch(markup, /已选解析结果|推广结果|刷新商品详情|bindtap="setType"|bindtap="retryCopyMiniProgramLink"/);
    assert.doesNotMatch(markup, /候选/);

    const page = mountPage((options) => options.success({ statusCode: 200, data: { data: [] } }));
    page.data.content = "share";
    page.parse();
    await flush();
    assert.equal(page.data.notice, "未解析出可用结果，请换一条有效的分享内容。");
    page.createLink();
    await flush();
    assert.match(page.data.error, /选择一条有效的解析结果/);
});

test("opening the page automatically logs in when the backend starts, without a manual connection", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.connected = false;
    assert.equal(page.data.backendChecked, false);
    page.onShow();
    page.onShow();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/status");
    assert.equal(page.data.checkingBackend, true);
    requests[0].fail();
    requests[0].complete();
    assert.equal(page.data.backendReachable, false);
    assert.match(page.data.error, /无法访问后端/);
    assert.equal(requests.length, 1);

    page.checkBackend();
    requests[1].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[1].complete();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/login");
    requests[2].success({ statusCode: 200, data: { session: "new-session", profile: { memberId: 7, money: "0.0000", pendingMoney: "8.9400", withdrawalMoney: "1.10" } } });
    await flush();
    assert.equal(page.data.backendReachable, true);
    assert.equal(page.data.configured, true);
    assert.equal(page.data.backendSupportsAccounts, true);
    assert.equal(page.data.checkingBackend, false);
    assert.equal(page.data.backendChecked, true);
    assert.equal(page.data.error, "");
    assert.equal(page.data.connected, true);
    assert.equal(page.data.profile.memberId, 7);
    assert.equal(page.data.profile.money, "0.0000");
    assert.deepEqual([page.data.profile.displayMoney, page.data.profile.displayPendingMoney, page.data.profile.displayWithdrawalMoney], ["0", "8.94", "1.1"]);
    assert.equal(page.app.globalData.session, "new-session");
    page.onShow();
    requests[3].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[3].complete();
    assert.equal(requests.length, 4);
});

test("failed automatic login waits for a retry", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.connected = false;
    page.onShow();
    requests[0].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[0].complete();
    requests[1].success({ statusCode: 401, data: { code: "LOGIN_FAILED", message: "身份配置无效" } });
    await flush();
    assert.equal(page.data.connected, false);
    assert.match(page.data.error, /身份配置无效/);
    assert.equal(requests.length, 2);
    page.checkBackend();
    requests[2].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[2].complete();
    requests[3].success({ statusCode: 200, data: { session: "retry-session", profile: { memberId: 42 } } });
    await flush();
    assert.equal(page.data.connected, true);
    assert.equal(page.data.profile.memberId, 42);
});

test("automatic login loads the selected orders tab after an offline navigation", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.connected = false;
    page.changeTab({ currentTarget: { dataset: { mode: "orders" } } });
    assert.equal(page.data.mode, "orders");
    assert.equal(requests.length, 0);
    page.onShow();
    requests[0].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[0].complete();
    requests[1].success({ statusCode: 200, data: { session: "new-session", profile: { memberId: 7 } } });
    await flush();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/orders");
    requests[2].success({ statusCode: 200, data: { data: { items: [], hasMore: false } } });
    await flush();
    assert.equal(page.data.loaded, true);
});

test("old backend status blocks account page and recovers after a restart", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.connected = false;
    page.checkBackend();
    requests[0].success({ statusCode: 200, data: { demo: true, configured: true, mode: "live" } });
    requests[0].complete();
    assert.equal(page.data.backendSupportsAccounts, false);
    assert.match(page.data.error, /旧版 Demo 后端/);
    page.data.connected = true;
    page.openAccounts();
    assert.equal(requests.length, 1);

    page.checkBackend();
    requests[1].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[1].complete();
    assert.equal(page.data.backendSupportsAccounts, true);
    assert.equal(page.data.error, "");
    page.data.mode = "withdraw";
    page.openAccounts();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/accounts");
    requests[2].success({ statusCode: 200, data: { data: [] } });
    await flush();
});

test("missing account route suggests restarting the local backend", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.backendSupportsAccounts = true;
    page.data.mode = "withdraw";
    page.openAccounts();
    requests[0].success({ statusCode: 404, data: { code: "NOT_FOUND", message: "接口不存在。" } });
    await flush();
    assert.equal(page.data.backendSupportsAccounts, false);
    assert.match(page.data.error, /重启后端并重试加载/);
});

test("status check rejects a different local service", () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.connected = false;
    page.onShow();
    page.checkBackend();
    assert.equal(requests.length, 1);
    requests[0].success({ statusCode: 200, data: { configured: true } });
    requests[0].complete();
    assert.equal(page.data.backendReachable, false);
    assert.equal(page.data.configured, false);
    assert.match(page.data.error, /未返回 Demo 后端状态/);
});

test("build-time backend URL serves status and actions without phone settings or an access token", async () => {
    const requests = [];
    const source = readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8");
    const configuredSource = source.replace('const BACKEND_BASE = "http://127.0.0.1:8787";', 'const BACKEND_BASE = "http://192.168.1.10:8787";');
    assert.notEqual(configuredSource, source);
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    assert.doesNotMatch(markup, /服务设置|draftBackendBase|draftBackendToken/);
    assert.doesNotMatch(source, /getStorageSync|setStorageSync|x-demo-access-token|saveServerSettings/);
    const page = mountPage((options) => requests.push(options), undefined, undefined, undefined, configuredSource);
    page.data.connected = false;
    page.onShow();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://192.168.1.10:8787/api/status");
    assert.equal(requests[0].header?.["x-demo-access-token"], undefined);
    requests[0].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[0].complete();
    assert.equal(requests[1].url, "http://192.168.1.10:8787/api/login");
    assert.equal(requests[1].header["x-demo-access-token"], undefined);
    requests[1].success({ statusCode: 200, data: { session: "phone-session", profile: { memberId: 3 } } });
    await flush();
    assert.equal(page.data.connected, true);
    page.api("profile");
    assert.equal(requests[2].url, "http://192.168.1.10:8787/api/profile");
    assert.equal(requests[2].header["x-demo-access-token"], undefined);
    assert.equal(requests[2].header["x-demo-session"], "phone-session");
    requests[2].success({ statusCode: 200, data: { data: {} } });
});

test("item lookup uses parsed product ID while conversion keeps the candidate URL", async () => {
    const requests = [];
    const page = mountPage((options) => {
        requests.push({ url: options.url, material: options.data.material });
        options.success({ statusCode: 200, data: { data: options.url.endsWith("/item") ? { itemId: "full_product_id" } : { url: "https://test.example/ref" } } });
    });
    const itemUrl = "https://jingfen.jd.com/detail/example.html";
    page.data.selected = candidate(" full_product_id ", itemUrl);
    page.data.selectedType = "goods";

    page.getItem();
    await flush();
    assert.deepEqual(requests[0], { url: "http://127.0.0.1:8787/api/item", material: "full_product_id" });
    assert.equal(page.data.item.itemId, "full_product_id");

    page.createLink();
    await flush();
    assert.deepEqual(requests[1], { url: "http://127.0.0.1:8787/api/link", material: itemUrl });
    assert.equal(page.data.link.url, "https://test.example/ref");

    page.data.selected.detail.itemId = null;
    assert.equal(page.selection(true).material, itemUrl);
    page.setType({ currentTarget: { dataset: { type: "life" } } });
    page.getItem();
    await flush();
    assert.equal(page.data.error, "");
});

test("tapping a candidate converts once and opens the mini-program before copying anything", async () => {
    const requests = [];
    const navigation = [];
    const copies = [];
    const page = mountPage((options) => requests.push(options), (options) => copies.push(options), () => {}, (options) => navigation.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("123")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/link");
    assert.equal(requests[0].data.material, "https://example.test/123");
    requests[0].success({ statusCode: 200, data: { data: { miniProgram: { appId: "wx123", path: "pages/goods?id=1" }, code: "￥口令￥", url: "https://example.test/link" } } });
    await flush();
    assert.equal(navigation.length, 1);
    assert.equal(navigation[0].appId, "wx123");
    assert.equal(navigation[0].path, "pages/goods?id=1");
    navigation[0].success();
    assert.equal(copies.length, 0);
    assert.equal(page.data.link.code, "￥口令￥");
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    assert.doesNotMatch(markup, /生成转链/);
    assert.match(markup, /bindtap="selectCandidate"/);
    assert.doesNotMatch(markup, /<block wx:if="{{selected}}">|<view wx:if="{{link}}" class="result"/);
});

test("mini-program navigation failure copies code once and prompts for the correct platform", async () => {
    const requests = [];
    const copied = [];
    const dialogs = [];
    const navigation = [];
    const page = mountPage((options) => requests.push(options), (options) => { copied.push(options.data); options.success(); }, (options) => dialogs.push(options), (options) => navigation.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: { miniProgram: { appId: "wx123", path: "pages/goods" }, code: "京东口令", shortUrl: "https://short.example/1" } } });
    await flush();
    navigation[0].fail();
    navigation[0].fail();
    assert.deepEqual(copied, ["京东口令"]);
    assert.match(dialogs[0].title, /口令复制成功/);
    assert.match(dialogs[0].content, /打开京东/);
    assert.equal(dialogs[0].showCancel, false);
});

test("JD share text opens by shortLink without inventing an appId or page path", async () => {
    const requests = [];
    const navigation = [];
    const copies = [];
    const page = mountPage((options) => requests.push(options), (options) => copies.push(options), () => {}, (options) => navigation.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("123")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: {
        miniProgram: { appId: null, path: null, shortLink: "#小程序://京东购物/verified-token" },
        code: "ordinary-code", shortUrl: "https://u.jd.com/example", url: "https://jd.example/full",
    } } });
    await flush();
    assert.equal(navigation.length, 1);
    assert.equal(navigation[0].shortLink, "#小程序://京东购物/verified-token");
    assert.equal("appId" in navigation[0], false);
    assert.equal("path" in navigation[0], false);
    navigation[0].success();
    assert.equal(copies.length, 0);
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    assert.doesNotMatch(markup, /bindtap="retryCopyMiniProgramLink"|link\.miniProgram\.shortLink/);
});

test("navigation failure copies the mini-program share text before ordinary code or URL", async () => {
    const requests = [];
    const navigation = [];
    const copied = [];
    const dialogs = [];
    const page = mountPage((options) => requests.push(options), (options) => { copied.push(options.data); options.success(); }, (options) => dialogs.push(options), (options) => navigation.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: {
        miniProgram: { appId: "wx123", path: "pages/goods?id=1", shortLink: "#小程序://京东购物/token" },
        code: "ordinary-code", url: "https://jd.example/full",
    } } });
    await flush();
    assert.equal(navigation[0].appId, "wx123");
    assert.equal(navigation[0].path, "pages/goods?id=1");
    navigation[0].fail();
    assert.equal(navigation[1].shortLink, "#小程序://京东购物/token");
    navigation[0].fail();
    assert.equal(navigation.length, 2);
    navigation[1].fail();
    navigation[1].fail();
    assert.deepEqual(copied, ["#小程序://京东购物/token"]);
    assert.match(dialogs[0].content, /微信.*粘贴到聊天中打开/);
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[1].success({ statusCode: 200, data: { data: { miniProgram: { shortLink: "#小程序://京东购物/token" } } } });
    await flush();
    navigation[2].fail();
    assert.deepEqual(copied, ["#小程序://京东购物/token", "#小程序://京东购物/token"]);
});

test("missing navigation API copies mini-program shortLink; an old navigation callback cannot copy", async () => {
    const copied = [];
    const dialogs = [];
    const requests = [];
    const page = mountPage((options) => requests.push(options), (options) => { copied.push(options.data); options.success(); }, (options) => dialogs.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: { miniProgram: { appId: null, path: null, shortLink: "https://wxaurl.cn/example" }, url: "https://jd.example/full" } } });
    await flush();
    assert.deepEqual(copied, ["https://wxaurl.cn/example"]);
    assert.match(dialogs[0].content, /在微信中打开/);

    const navigation = [];
    const oldPage = mountPage((options) => requests.push(options), (options) => copied.push(options.data), () => {}, (options) => navigation.push(options));
    oldPage.candidateVersion = 1;
    oldPage.data.candidates = [candidate("2")];
    oldPage.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[1].success({ statusCode: 200, data: { data: { miniProgram: { appId: null, path: null, shortLink: "#小程序://京东购物/old" } } } });
    await flush();
    oldPage.clearSession();
    navigation[0].fail();
    assert.equal(copied.length, 1);
});

test("failed mini-program share-text copy prompts a new product tap to retry", async () => {
    const requests = [];
    const navigation = [];
    const dialogs = [];
    const copied = [];
    let failCopy = true;
    const page = mountPage((options) => requests.push(options), (options) => {
        copied.push(options.data);
        if (failCopy) options.fail();
        else options.success();
    }, (options) => dialogs.push(options), (options) => navigation.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: { miniProgram: { appId: null, path: null, shortLink: "#小程序://京东购物/token" } } } });
    await flush();
    navigation[0].fail();
    assert.equal(page.data.error, "小程序分享文本复制失败，请重新点击商品重试。");
    assert.equal(dialogs.length, 0);
    failCopy = false;
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[1].success({ statusCode: 200, data: { data: { miniProgram: { shortLink: "#小程序://京东购物/token" } } } });
    await flush();
    navigation[1].fail();
    assert.deepEqual(copied, ["#小程序://京东购物/token", "#小程序://京东购物/token"]);
    assert.equal(page.data.error, "");
    assert.match(dialogs[0].title, /小程序分享文本复制成功/);
});

test("without a mini-program, code wins over URL and URL is copied when code is absent", async () => {
    const copied = [];
    const dialogs = [];
    const requests = [];
    const page = mountPage((options) => requests.push(options), (options) => { copied.push(options.data); options.success(); }, (options) => dialogs.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1"), candidate("2")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: { code: "code-1", url: "https://example.test/full" } } });
    await flush();
    assert.deepEqual(copied, ["code-1"]);
    page.selectCandidate({ currentTarget: { dataset: { index: 1 } } });
    requests[1].success({ statusCode: 200, data: { data: { shortUrl: "https://example.test/short", url: "https://example.test/full" } } });
    await flush();
    assert.deepEqual(copied, ["code-1", "https://example.test/short"]);
    assert.match(dialogs[1].title, /网址复制成功/);
    assert.match(dialogs[1].content, /打开京东/);
    assert.equal(page.data.selectedType, "goods");
});

test("clipboard failures show an honest error and let the user retry", async () => {
    const requests = [];
    const dialogs = [];
    let failCopy = true;
    const page = mountPage((options) => requests.push(options), (options) => failCopy ? options.fail() : options.success(), (options) => dialogs.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[0].success({ statusCode: 200, data: { data: { code: "retry-code" } } });
    await flush();
    assert.match(page.data.error, /口令复制失败/);
    assert.equal(dialogs.length, 0);
    failCopy = false;
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[1].success({ statusCode: 200, data: { data: { code: "retry-code" } } });
    await flush();
    assert.match(dialogs[0].content, /打开京东/);
});

test("stale conversion responses and clipboard callbacks cannot guide a new session", async () => {
    const requests = [];
    const clipboard = [];
    const dialogs = [];
    const page = mountPage((options) => requests.push(options), (options) => clipboard.push(options), (options) => dialogs.push(options));
    page.candidateVersion = 1;
    page.data.candidates = [candidate("1")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    page.clearSession();
    requests[0].success({ statusCode: 200, data: { data: { code: "old-code" } } });
    await flush();
    assert.equal(page.data.link, null);
    assert.equal(clipboard.length, 0);

    page.data.connected = true;
    page.data.candidates = [candidate("2")];
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    requests[1].success({ statusCode: 200, data: { data: { code: "second-code" } } });
    await flush();
    assert.equal(clipboard.length, 1);
    page.clearSession();
    clipboard[0].success();
    assert.equal(dialogs.length, 0);
});

test("candidate cards load at most two details at once and keep failed items selectable", async () => {
    const pending = [];
    const page = mountPage((options) => {
        if (options.url.endsWith("/parse")) {
            options.success({ statusCode: 200, data: { data: [candidate("1"), candidate("2"), candidate("3"), candidate("4")] } });
        } else if (options.url.endsWith("/link")) {
            options.success({ statusCode: 200, data: { data: { url: "https://test.example/ref" } } });
        } else pending.push(options);
    });
    page.data.content = "share";
    page.parse();
    await flush();
    assert.equal(page.data.notice, "点击解析结果即可转链。");
    assert.equal(pending.length, 2);
    assert.equal(page.data.candidates[0].previewState, "loading");
    page.selectCandidate({ currentTarget: { dataset: { index: 1 } } });
    await flush();
    assert.equal(page.data.selectedIndex, 1);
    assert.equal(page.data.candidates[0].keyContent, page.data.selected.keyContent);

    pending[1].success({ statusCode: 200, data: { data: {
        title: "真实商品", imageUrl: "https://img.example/2.jpg", price: "1654.00", shopName: "旗舰店",
        couponInfo: { amount: "100" }, rebateInfo: { rebate: "0", status: -1 },
    } } });
    await flush();
    assert.equal(page.data.selected.preview.title, "真实商品");
    assert.equal(page.data.selected.preview.price, "1654");
    assert.equal(page.data.selected.preview.coupon, "100");
    assert.equal(page.data.selected.preview.rebate, "");
    assert.equal(pending.length, 3);

    pending[0].fail();
    await flush();
    assert.equal(page.data.candidates[0].previewState, "unavailable");
    assert.equal(pending.length, 4);
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    await flush();
    assert.equal(page.selection().material, "https://example.test/1");

    pending[2].success({ statusCode: 200, data: { data: null } });
    pending[3].success({ statusCode: 200, data: { data: { title: "可查", rebateInfo: { rebate: "8.50", status: 1 } } } });
    await flush();
    assert.equal(page.data.candidates[2].previewState, "unavailable");
    assert.equal(page.data.candidates[3].preview.rebate, "8.5");
});

test("product previews keep meaningful decimals while trimming trailing zeros", () => {
    const page = mountPage(() => {});
    const preview = page.itemPreview({ price: "0.0010", couponInfo: { amount: "100.00" }, rebateInfo: { status: 1, rebate: "0.0300" } });
    assert.deepEqual({ price: preview.price, coupon: preview.coupon, rebate: preview.rebate }, { price: "0.001", coupon: "100", rebate: "0.03" });
    assert.equal(page.itemPreview({ price: "0.0000", rebateInfo: { status: 1, rebate: "0.0000" } }).rebate, "0");
});

test("stale detail and image responses cannot overwrite a new parse or a disconnected session", async () => {
    const pending = [];
    const page = mountPage((options) => {
        if (options.url.endsWith("/parse")) {
            options.success({ statusCode: 200, data: { data: [candidate(String(pending.length + 1))] } });
        } else if (options.url.endsWith("/logout")) {
            options.success({ statusCode: 200, data: {} });
        } else pending.push(options);
    });
    page.data.content = "share";
    page.parse();
    await flush();
    const oldVersion = page.data.candidates[0].version;
    page.parse();
    await flush();
    assert.equal(pending.length, 2);
    pending[0].success({ statusCode: 200, data: { data: { title: "过期商品" } } });
    await flush();
    assert.equal(page.data.candidates[0].previewState, "loading");
    page.candidateImageError({ currentTarget: { dataset: { index: 0, version: oldVersion, image: "https://old.example/a.jpg" } } });
    assert.equal(page.data.candidates[0].imageFailed, false);
    pending[1].success({ statusCode: 200, data: { data: { title: "最新商品", imageUrl: "https://img.example/new.jpg" } } });
    await flush();
    assert.equal(page.data.candidates[0].preview.title, "最新商品");
    page.candidateImageError({ currentTarget: { dataset: { index: 0, version: page.data.candidates[0].version, image: "https://img.example/new.jpg" } } });
    assert.equal(page.data.candidates[0].imageFailed, true);
    page.clearSession();
    assert.equal(page.data.candidates.length, 0);
});

test("orders show real summary amounts without redundant decimal zeros or expandable details", async () => {
    const copied = [];
    const page = mountPage((options) => options.success({ statusCode: 200, data: { data: { hasMore: false, items: [
        { id: 1, orderSn: "JD-123", platform: "jd", status: 2, settleStatus: 1, paidAmount: "90.00", rebateMoney: "4.9400", refundMoney: "0.00", orderedAt: "2026-09-01", expectedSettleAt: "2026-10-26", detail: { payPrice: "100.00", goods: [ { itemTitle: "商品一", itemPrice: "100.00", itemNum: "1", imageUrl: "https://img.example/a.jpg" } ] } },
        { id: 2, orderSn: "TB-456", platform: "taobao", status: -1, settleStatus: -1, paidAmount: "0.00", rebateMoney: "0.0000", refundMoney: "0.00", detail: null },
        { id: 3, orderSn: "PDD-789", platform: "pdd", status: 4, settleStatus: 3, paidAmount: "8.00", rebateMoney: "1.0000", refundMoney: "0", detail: { goods: [] } },
        { id: 4, orderSn: "1688-001", platform: "alibaba", status: 2, settleStatus: 1, paidAmount: "24.0000", rebateMoney: "0.0300", detail: { goods: [{ itemTitle: "甲", itemPrice: "12.3400" }, { itemTitle: "乙", itemPrice: "0.0010" }] } },
    ] } } }), (value) => copied.push(value.data));
    page.data.mode = "orders";
    page.loadRecords(1);
    await flush();
    assert.equal(page.data.records[0].platformLabel, "京东");
    assert.equal(page.data.records[0].statusLabel, "已付款");
    assert.equal(page.data.records[0].settleLabel, "预计返");
    assert.equal(page.data.records[0].goods[0].itemTitle, "商品一");
    assert.equal(page.data.records[0].displayPrice, "100");
    assert.equal(page.data.records[0].displayRebate, "4.94");
    assert.equal(page.data.records[0].goods[0].displayItemPrice, "100");
    assert.equal(page.data.records[0].detail.payPrice, "100.00");
    assert.equal(page.data.records[0].orderDate, "2026-09-01");
    assert.equal(page.data.records[0].rebateDate, "2026-10-26");
    assert.equal(page.data.records[0].platformMark, "京");
    assert.equal(page.data.records[1].goods.length, 0);
    assert.equal(page.data.records[1].displayPrice, "0");
    assert.equal(page.data.records[1].displayRebate, "0");
    assert.equal(page.data.records[1].rebateDate, "");
    assert.equal(page.data.records[1].hasRebate, false);
    assert.equal(page.data.records[1].statusLabel, "已关闭");
    assert.equal(page.data.records[2].settleLabel, "已结清返利");
    assert.equal(page.data.records[2].displayPrice, "8");
    assert.equal(page.data.records[2].displayRebate, "1");
    assert.equal(page.data.records[3].displayPrice, "24");
    assert.equal(page.data.records[3].displayRebate, "0.03");
    assert.deepEqual(Array.from(page.data.records[3].goods, (good) => good.displayItemPrice), ["12.34", "0.001"]);
    page.copyOrderSn({ currentTarget: { dataset: { id: 1 } } });
    assert.deepEqual(copied, ["JD-123"]);
    page.orderImageError({ currentTarget: { dataset: { id: 1, index: 0, image: "https://img.example/stale.jpg" } } });
    assert.equal(page.data.records[0].goods[0].imageFailed, false);
    page.orderImageError({ currentTarget: { dataset: { id: 1, index: 0, image: "https://img.example/a.jpg" } } });
    assert.equal(page.data.records[0].goods[0].imageFailed, true);
    page.copyOrderSn({ currentTarget: { dataset: { id: 99 } } });
    assert.equal(copied.length, 1);
    assert.equal("toggleOrderDetail" in page, false);
    assert.equal("expanded" in page.data.records[0], false);
    page.backToProfile();
    assert.equal(page.data.mode, "profile");
});

test("wallet switches periods, paginates only real buckets, and history opens from profile", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.profile = { memberId: 99, money: "1.00", pendingMoney: "2.00", withdrawalMoney: "3.00" };
    page.changeTab({ currentTarget: { dataset: { mode: "wallet" } } });
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/wallet");
    assert.equal(requests[0].data.period, "day");
    requests[0].success({ statusCode: 200, data: { data: { profile: { memberId: 99, money: "5.00", pendingMoney: "2.00", withdrawalMoney: "3.00" }, items: [{ date: "2026-09-28", orderCount: 1, estimateMemberOrderCommission: "0.0300", settledMemberOrderCommission: "0.0000" }], hasMore: true } } });
    await flush();
    assert.equal(page.data.profile.money, "5.00");
    assert.deepEqual([page.data.profile.displayMoney, page.data.profile.displayPendingMoney, page.data.profile.displayWithdrawalMoney], ["5", "2", "3"]);
    assert.equal(page.data.walletStats.length, 1);
    assert.equal(page.data.walletStats[0].estimateMemberOrderCommission, "0.0300");
    assert.equal(page.data.walletStats[0].displayEstimateMemberOrderCommission, "0.03");
    assert.equal(page.data.walletStats[0].displaySettledMemberOrderCommission, "0");
    page.loadMore();
    assert.equal(requests[1].data.page, 2);
    requests[1].success({ statusCode: 200, data: { data: { profile: page.data.profile, items: [{ date: "2026-09-27", orderCount: 2, estimateMemberOrderCommission: "1.0000", settledMemberOrderCommission: "1.0000" }], hasMore: false } } });
    await flush();
    assert.equal(page.data.walletStats.length, 2);
    assert.equal(page.data.walletStats[1].estimateMemberOrderCommission, "1.0000");
    assert.equal(page.data.walletStats[1].displayEstimateMemberOrderCommission, "1");
    assert.equal(page.data.walletStats[1].displaySettledMemberOrderCommission, "1");
    page.changeWalletPeriod({ currentTarget: { dataset: { period: "month" } } });
    assert.equal(requests[2].data.period, "month");
    assert.equal(page.data.walletStats.length, 0);
    requests[2].success({ statusCode: 200, data: { data: { profile: page.data.profile, items: [], hasMore: false } } });
    await flush();
    assert.equal(page.data.walletLoaded, true);
    assert.equal(page.data.walletStats.length, 0);
    page.backToProfile();
    assert.equal(page.data.mode, "profile");
    page.changeTab({ currentTarget: { dataset: { mode: "withdrawals" } } });
    assert.equal(requests[3].url, "http://127.0.0.1:8787/api/withdrawals");
    requests[3].success({ statusCode: 200, data: { data: { items: [], hasMore: false } } });
    await flush();
});

test("wallet withdrawal opens account management only through withdrawal and preserves entered amount", async () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    const wallet = markup.split('<view wx:elif="{{mode === \'wallet\'}}"')[1].split('<view wx:elif="{{mode === \'accounts\'}}"')[0];
    assert.match(markup, /data-mode="withdrawals" bindtap="changeTab"[^>]*>.*提现记录<\/text>/);
    assert.match(wallet, /bindtap="openWithdrawal">去提现/);
    assert.doesNotMatch(wallet, /提现记录 ›|bindtap="openAccounts"|<button[^>]*>申请提现<\/button>/);
    const withdrawal = markup.split('<view wx:elif="{{mode === \'withdraw\'}}"')[1].split('<view wx:elif="{{mode === \'promote\'}}"')[0];
    assert.match(withdrawal, /bindtap="openAccounts">管理收款账号/);
    assert.ok(withdrawal.indexOf("管理收款账号") < withdrawal.indexOf("提现金额（元）"));

    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.backendSupportsAccounts = true;
    page.data.mode = "wallet";
    page.openAccounts();
    assert.equal(page.data.mode, "wallet");
    assert.equal(requests.length, 0);
    page.openWithdrawal();
    assert.equal(page.data.mode, "withdraw");
    requests[0].success({ statusCode: 200, data: { data: [{ id: 7, type: 1, isDefault: true }] } });
    await flush();
    requests[1].success({ statusCode: 200, data: { data: { money: "10.00" } } });
    await flush();
    assert.equal(page.data.profile.money, "10.00");
    assert.equal(page.data.profile.displayMoney, "10");
    page.updateWithdrawalAmount({ detail: { value: "3.50" } });
    page.openAccounts();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/accounts");
    requests[2].success({ statusCode: 200, data: { data: [{ id: 8, type: 2, isDefault: true }] } });
    await flush();
    page.backToProfile();
    assert.equal(page.data.mode, "withdraw");
    assert.equal(page.data.withdrawalAmount, "3.50");
    assert.equal(requests[3].url, "http://127.0.0.1:8787/api/accounts");
    requests[3].success({ statusCode: 200, data: { data: [{ id: 8, type: 2, isDefault: true }] } });
    await flush();
    requests[4].success({ statusCode: 200, data: { data: { money: "10.00" } } });
    await flush();
    assert.equal(page.data.profile.displayMoney, "10");
    assert.equal(page.data.withdrawalAccountId, 8);
    assert.equal(requests.every((request) => !["/api/withdraw", "/api/createAccount", "/api/updateAccount"].some((path) => request.url.endsWith(path))), true);
    page.backToProfile();
    assert.equal(page.data.mode, "wallet");
    assert.equal(page.data.withdrawalAmount, "");
});

test("wallet session expiration clears balances and statistics", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.mode = "wallet";
    page.data.profile = { money: "50.00" };
    page.data.walletStats = [{ date: "2026-09-28" }];
    page.data.walletLoaded = true;
    page.refreshWallet();
    assert.equal(page.data.walletLoaded, false);
    assert.equal(page.data.walletStats.length, 0);
    requests[0].success({ statusCode: 401, data: { code: "SESSION_EXPIRED", message: "成员会话已失效" } });
    await flush();
    assert.equal(page.data.connected, false);
    assert.equal(page.data.profile, null);
    assert.equal(page.data.walletStats.length, 0);
    assert.equal(page.app.globalData.session, "");
    assert.match(page.data.error, /会话已失效/);

    page.onShow();
    requests[1].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[1].complete();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/login");
    requests[2].success({ statusCode: 200, data: { session: "restored-session", profile: { memberId: 99, money: "50.00" } } });
    await flush();
    assert.equal(requests[3].url, "http://127.0.0.1:8787/api/wallet");
    requests[3].success({ statusCode: 200, data: { data: { profile: { memberId: 99, money: "50.00" }, items: [], hasMore: false } } });
    await flush();
    assert.equal(page.data.connected, true);
    assert.equal(page.data.walletLoaded, true);
});

test("startup offers retry, not connect or disconnect controls", () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    assert.match(markup, /正在加载成员资料/);
    assert.match(markup, /bindtap="checkBackend">重试加载/);
    assert.doesNotMatch(markup, /bindtap="connect"|bindtap="disconnect"/);
});

test("account management lists masked accounts and edits via fixed routes", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options), () => {}, (options) => options.success({ confirm: true }));
    page.data.backendSupportsAccounts = true;
    page.data.mode = "withdraw";
    page.openAccounts();
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/accounts");
    requests[0].success({ statusCode: 200, data: { data: [{ id: 7, type: 3, name: "测***", account: "****1234", isDefault: true }] } });
    await flush();
    assert.equal(page.data.accounts[0].typeLabel, "银行卡");
    page.showCreateAccount();
    page.setAccountType({ currentTarget: { dataset: { type: "3" } } });
    for (const [field, value] of [["name", "张测试"], ["account", "6222000000001234"], ["bankName", "测试行"]]) {
        page.updateAccountField({ currentTarget: { dataset: { field } }, detail: { value } });
    }
    page.saveAccount();
    assert.equal(requests[1].url, "http://127.0.0.1:8787/api/createAccount");
    assert.equal(requests[1].data.bankName, "测试行");
    assert.equal(page.data.accountForm.account, "");
    requests[1].success({ statusCode: 200, data: { data: { id: 9 } } });
    await flush();
    requests[2].success({ statusCode: 200, data: { data: [{ id: 9, type: 3, name: "张***", account: "****1234", isDefault: true }] } });
    await flush();
    page.showEditAccount({ currentTarget: { dataset: { id: 9 } } });
    page.updateAccountField({ currentTarget: { dataset: { field: "name" } }, detail: { value: "李测试" } });
    page.saveAccount();
    assert.equal(requests[3].url, "http://127.0.0.1:8787/api/updateAccount");
    assert.equal(requests[3].data.id, 9);
    requests[3].success({ statusCode: 200, data: { data: { id: 9 } } });
    await flush();
    requests[4].success({ statusCode: 200, data: { data: [{ id: 9, type: 3, name: "李***", account: "****1234", isDefault: true }] } });
    await flush();
    page.deleteAccount({ currentTarget: { dataset: { id: 9 } } });
    assert.equal(requests[5].url, "http://127.0.0.1:8787/api/deleteAccount");
    requests[5].success({ statusCode: 200, data: { data: 9 } });
    await flush();
    requests[6].success({ statusCode: 200, data: { data: [] } });
    await flush();
    assert.equal(page.data.accounts.length, 0);
});

test("account identity can be cleared explicitly; canceled deletion makes no request", async () => {
    const requests = [];
    let modal;
    const page = mountPage((options) => requests.push(options), () => {}, (options) => { modal = options; });
    page.data.mode = "accounts";
    page.data.accounts = [{ id: 12, type: 1, name: "测***", account: "****3456" }];
    page.showEditAccount({ currentTarget: { dataset: { id: 12 } } });
    page.toggleClearIdentity();
    page.saveAccount();
    assert.equal(requests[0].data.identificationCode, "");
    requests[0].success({ statusCode: 200, data: { data: { id: 12 } } });
    await flush();
    requests[1].success({ statusCode: 200, data: { data: page.data.accounts } });
    await flush();
    page.deleteAccount({ currentTarget: { dataset: { id: 12 } } });
    modal.success({ confirm: false });
    assert.equal(requests.length, 2);
});

test("withdrawal requires account selection and user confirmation without a switch", async () => {
    const requests = [];
    let modal;
    const page = mountPage((options) => requests.push(options), () => {}, (options) => { modal = options; });
    page.data.mode = "wallet";
    page.data.backendSupportsAccounts = true;
    page.openWithdrawal();
    requests[0].success({ statusCode: 200, data: { data: [{ id: 7, type: 1, name: "测***", account: "****3456", isDefault: true }] } });
    await flush();
    requests[1].success({ statusCode: 200, data: { data: { memberId: 99, money: "5.00" } } });
    await flush();
    page.updateWithdrawalAmount({ detail: { value: "1.00" } });
    page.setData({ withdrawalAccountId: null });
    page.submitWithdrawal();
    assert.equal(modal, undefined);
    page.selectWithdrawalAccount({ currentTarget: { dataset: { id: 7 } } });
    page.submitWithdrawal();
    assert.match(modal.content, /\*\*\*\*3456/);
    modal.success({ confirm: false });
    assert.equal(requests.length, 2);
    page.submitWithdrawal();
    modal.success({ confirm: true });
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/withdraw");
    assert.equal(requests[2].data.withdrawalAccountId, 7);
    assert.equal(page.data.withdrawalAmount, "");
    requests[2].success({ statusCode: 200, data: { data: { id: 33 } } });
    await flush();
    assert.match(page.data.notice, /#33/);
    requests[3].fail();
    await flush();
    assert.match(page.data.error, /勿重复提交/);
    assert.equal(requests.length, 4);
});

test("shopping, orders and profile are the only root tabs; profile retains the real record entries", async () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    assert.doesNotMatch(markup, /正式服务|影响实际数据|class="footer"/);
    const nav = markup.split('<view wx:if="{{mode === \'promote\' || mode === \'orders\' || mode === \'profile\'}}" class="bottom-nav">')[1];
    assert.ok(nav);
    assert.match(nav, /data-mode="promote" bindtap="changeTab"/);
    assert.match(nav, /data-mode="orders" bindtap="changeTab"/);
    assert.match(nav, /data-mode="profile" bindtap="changeTab"/);
    assert.doesNotMatch(nav, /data-mode="(?:wallet|bills|withdrawals)"/);
    assert.match(markup, /data-mode="wallet" bindtap="changeTab"/);
    assert.match(markup, /data-mode="bills" bindtap="changeTab"/);
    assert.match(markup, /data-mode="withdrawals" bindtap="changeTab"/);

    const requests = [];
    const page = mountPage((options) => requests.push(options));
    assert.equal(page.data.mode, "promote");
    page.changeTab({ currentTarget: { dataset: { mode: "orders" } } });
    assert.equal(page.data.mode, "orders");
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/orders");
    requests[0].success({ statusCode: 200, data: { data: { items: [], hasMore: false } } });
    await flush();
    page.changeTab({ currentTarget: { dataset: { mode: "profile" } } });
    assert.equal(page.data.mode, "profile");
    page.changeTab({ currentTarget: { dataset: { mode: "withdrawals" } } });
    assert.equal(requests[1].url, "http://127.0.0.1:8787/api/withdrawals");
    requests[1].success({ statusCode: 200, data: { data: { items: [], hasMore: false } } });
    await flush();
    page.backToProfile();
    assert.equal(page.data.mode, "profile");
    page.changeTab({ currentTarget: { dataset: { mode: "bills" } } });
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/bills");
    requests[2].success({ statusCode: 200, data: { data: { items: [], hasMore: false } } });
    await flush();
    page.backToProfile();
    assert.equal(page.data.mode, "profile");
    page.changeTab({ currentTarget: { dataset: { mode: "wallet" } } });
    assert.equal(requests[3].url, "http://127.0.0.1:8787/api/wallet");
    requests[3].success({ statusCode: 200, data: { data: { profile: {}, items: [], hasMore: false } } });
    await flush();
    page.backToProfile();
    assert.equal(page.data.mode, "profile");
});

test("money records use wallet colors and render real bill and withdrawal details", async () => {
    const markup = readFileSync(new URL("../miniprogram/pages/index/index.wxml", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../miniprogram/pages/index/index.wxss", import.meta.url), "utf8");
    assert.match(markup, /金额明细/);
    assert.match(markup, /item\.displayAmount/);
    assert.match(markup, /item\.failureReason/);
    assert.match(markup, /item\.accountLabel/);
    assert.doesNotMatch(styles, /#4a63f4|#465ff1/i);
    for (const icon of ["shop", "orders", "profile"]) {
        assert.match(readFileSync(new URL(`../miniprogram/images/tab-${icon}-active.svg`, import.meta.url), "utf8"), /#ff6247/i);
    }

    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.changeTab({ currentTarget: { dataset: { mode: "bills" } } });
    requests[0].success({ statusCode: 200, data: { data: { hasMore: false, items: [
        { id: 1, event: 1, action: 1, amount: "18.4400", createdAt: "2026-09-25 13:29:00", memo: "京东订单" },
        { id: 2, event: 4, action: 2, amount: "-1.20", createdAt: "2026-09-25 13:30:00", memo: "" },
        { id: 3, event: 7, action: 1, amount: "0.10", createdAt: "2026-09-25 13:31:00", memo: "推荐奖金" },
    ] } } });
    await flush();
    assert.deepEqual(Array.from(page.data.records, ({ title, displayAmount, decrease }) => ({ title, displayAmount, decrease })), [
        { title: "网购返利", displayAmount: "+18.44", decrease: false },
        { title: "提现", displayAmount: "-1.2", decrease: true },
        { title: "邀请奖励", displayAmount: "+0.1", decrease: false },
    ]);

    page.changeTab({ currentTarget: { dataset: { mode: "withdrawals" } } });
    requests[1].success({ statusCode: 200, data: { data: { hasMore: false, items: [
        { id: 9, amount: "2.00", status: 5, withdrawalAccountId: "7", withdrawalAccountType: 1, memo: "", createdAt: "2026-09-25 13:29:00" },
        { id: 10, amount: "1.20", status: 6, withdrawalAccountId: "8", withdrawalAccountType: 3, memo: "收款失败", createdAt: "2026-09-25 13:30:00" },
        { id: 11, amount: "1.00", status: 1, withdrawalAccountId: "7", withdrawalAccountType: 1, memo: "", createdAt: "2026-09-25 13:31:00" },
    ] } } });
    await flush();
    assert.deepEqual(Array.from(page.data.records, ({ displayAmount, statusLabel, statusTone, accountLabel, failureReason }) =>
        ({ displayAmount, statusLabel, statusTone, accountLabel, failureReason })), [
        { displayAmount: "2", statusLabel: "打款成功", statusTone: "success", accountLabel: "支付宝", failureReason: "" },
        { displayAmount: "1.2", statusLabel: "打款失败", statusTone: "failed", accountLabel: "银行卡", failureReason: "收款失败" },
        { displayAmount: "1", statusLabel: "系统审核中", statusTone: "pending", accountLabel: "支付宝", failureReason: "" },
    ]);
});
