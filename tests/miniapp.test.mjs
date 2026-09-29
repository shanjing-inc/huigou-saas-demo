import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function mountPage(request, setClipboardData = () => {}, showModal = () => {}) {
    let definition;
    const app = { globalData: { session: "local-test-session" } };
    runInNewContext(readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8"), {
        Page: (value) => { definition = value; },
        getApp: () => app,
        wx: { request, setClipboardData, showModal },
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
    assert.match(markup, /stat\.estimateMemberOrderCommission/);
    assert.match(markup, /stat\.settledMemberOrderCommission/);
    assert.match(markup, /good\.displayItemPrice/);
    assert.match(markup, /item\.displayRebate/);
    assert.doesNotMatch(markup, /toggleOrderDetail|order-details|order-detail-toggle|item\.expanded/);
    assert.match(markup, /<view class="copy-order [^\"]+" role="button"[^>]+aria-disabled="{{!item\.orderSn}}"[^>]+bindtap="copyOrderSn"><text class="copy-order-text">复制单号<\/text><\/view>/);
    assert.match(styles, /\.copy-order \{[^}]+align-items: center;[^}]+justify-content: center;/);
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
    assert.match(page.data.error, /无法访问本机后端/);
    assert.equal(requests.length, 1);

    page.checkBackend();
    requests[1].success({ statusCode: 200, data: { demo: true, configured: true, supportsAccountManagement: true } });
    requests[1].complete();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/login");
    requests[2].success({ statusCode: 200, data: { session: "new-session", profile: { memberId: 7 } } });
    await flush();
    assert.equal(page.data.backendReachable, true);
    assert.equal(page.data.configured, true);
    assert.equal(page.data.backendSupportsAccounts, true);
    assert.equal(page.data.checkingBackend, false);
    assert.equal(page.data.backendChecked, true);
    assert.equal(page.data.error, "");
    assert.equal(page.data.connected, true);
    assert.equal(page.data.profile.memberId, 7);
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
    page.openAccounts();
    assert.equal(requests[2].url, "http://127.0.0.1:8787/api/accounts");
    requests[2].success({ statusCode: 200, data: { data: [] } });
    await flush();
});

test("missing account route suggests restarting the local backend", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.backendSupportsAccounts = true;
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

test("candidate cards load at most two details at once and keep failed items selectable", async () => {
    const pending = [];
    const page = mountPage((options) => {
        if (options.url.endsWith("/parse")) {
            options.success({ statusCode: 200, data: { data: [candidate("1"), candidate("2"), candidate("3"), candidate("4")] } });
        } else pending.push(options);
    });
    page.data.content = "share";
    page.parse();
    await flush();
    assert.equal(pending.length, 2);
    assert.equal(page.data.candidates[0].previewState, "loading");
    page.selectCandidate({ currentTarget: { dataset: { index: 1 } } });
    assert.equal(page.data.selectedIndex, 1);
    assert.equal(page.data.candidates[0].keyContent, page.data.selected.keyContent);

    pending[1].success({ statusCode: 200, data: { data: {
        title: "真实商品", imageUrl: "https://img.example/2.jpg", price: "1654.00", shopName: "旗舰店",
        couponInfo: { amount: "100" }, rebateInfo: { rebate: "0", status: -1 },
    } } });
    await flush();
    assert.equal(page.data.selected.preview.title, "真实商品");
    assert.equal(page.data.selected.preview.price, "1654.00");
    assert.equal(page.data.selected.preview.coupon, "100");
    assert.equal(page.data.selected.preview.rebate, "");
    assert.equal(pending.length, 3);

    pending[0].fail();
    await flush();
    assert.equal(page.data.candidates[0].previewState, "unavailable");
    assert.equal(pending.length, 4);
    page.selectCandidate({ currentTarget: { dataset: { index: 0 } } });
    assert.equal(page.selection().material, "https://example.test/1");

    pending[2].success({ statusCode: 200, data: { data: null } });
    pending[3].success({ statusCode: 200, data: { data: { title: "可查", rebateInfo: { rebate: "8.50", status: 1 } } } });
    await flush();
    assert.equal(page.data.candidates[2].previewState, "unavailable");
    assert.equal(page.data.candidates[3].preview.rebate, "8.50");
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

test("wallet switches periods, paginates only real buckets, and opens withdrawal history", async () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.profile = { memberId: 99, money: "1.00", pendingMoney: "2.00", withdrawalMoney: "3.00" };
    page.changeTab({ currentTarget: { dataset: { mode: "wallet" } } });
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/wallet");
    assert.equal(requests[0].data.period, "day");
    requests[0].success({ statusCode: 200, data: { data: { profile: { memberId: 99, money: "5.00", pendingMoney: "2.00", withdrawalMoney: "3.00" }, items: [{ date: "2026-09-28", orderCount: 1, estimateMemberOrderCommission: "2.5000", settledMemberOrderCommission: "0.0000" }], hasMore: true } } });
    await flush();
    assert.equal(page.data.profile.money, "5.00");
    assert.equal(page.data.walletStats.length, 1);
    assert.equal(page.data.walletStats[0].estimateMemberOrderCommission, "2.5000");
    page.loadMore();
    assert.equal(requests[1].data.page, 2);
    requests[1].success({ statusCode: 200, data: { data: { profile: page.data.profile, items: [{ date: "2026-09-27", orderCount: 2, estimateMemberOrderCommission: "1.0000", settledMemberOrderCommission: "1.0000" }], hasMore: false } } });
    await flush();
    assert.equal(page.data.walletStats.length, 2);
    page.changeWalletPeriod({ currentTarget: { dataset: { period: "month" } } });
    assert.equal(requests[2].data.period, "month");
    assert.equal(page.data.walletStats.length, 0);
    requests[2].success({ statusCode: 200, data: { data: { profile: page.data.profile, items: [], hasMore: false } } });
    await flush();
    assert.equal(page.data.walletLoaded, true);
    assert.equal(page.data.walletStats.length, 0);
    page.changeTab({ currentTarget: { dataset: { mode: "withdrawals" } } });
    assert.equal(requests[3].url, "http://127.0.0.1:8787/api/withdrawals");
    requests[3].success({ statusCode: 200, data: { data: { items: [], hasMore: false } } });
    await flush();
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
    page.data.mode = "wallet";
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
