import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function mountPage(request, setClipboardData = () => {}) {
    let definition;
    runInNewContext(readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8"), {
        Page: (value) => { definition = value; },
        getApp: () => ({ globalData: { session: "local-test-session" } }),
        wx: { request, setClipboardData },
    });
    return {
        ...definition,
        data: { ...definition.data, connected: true },
        setData(patch) { Object.assign(this.data, patch); },
    };
}

const flush = () => new Promise(setImmediate);
const candidate = (itemId, itemUrl = `https://example.test/${itemId}`) => ({
    platform: "jd", type: "goods", keyContent: "same share text", detail: { itemId, itemUrl, itemTitle: `商品 ${itemId}` },
});

test("status check can recover after the backend starts", () => {
    const requests = [];
    const page = mountPage((options) => requests.push(options));
    page.data.connected = false;
    page.onShow();
    assert.equal(requests[0].url, "http://127.0.0.1:8787/api/status");
    assert.equal(page.data.checkingBackend, true);
    requests[0].fail();
    requests[0].complete();
    assert.equal(page.data.backendReachable, false);
    assert.match(page.data.error, /无法访问本机后端/);

    page.checkBackend();
    requests[1].success({ statusCode: 200, data: { demo: true, configured: true } });
    requests[1].complete();
    assert.equal(page.data.backendReachable, true);
    assert.equal(page.data.configured, true);
    assert.equal(page.data.checkingBackend, false);
    assert.equal(page.data.error, "");
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
    page.disconnect();
    await flush();
    assert.equal(page.data.candidates.length, 0);
});

test("orders display only returned details and distinguish pending from settled rebates", async () => {
    const copied = [];
    const page = mountPage((options) => options.success({ statusCode: 200, data: { data: { hasMore: false, items: [
        { id: 1, orderSn: "JD-123", platform: "jd", status: 2, settleStatus: 1, paidAmount: "90.00", rebateMoney: "4.9400", refundMoney: "0.00", orderedAt: "2026-09-01", expectedSettleAt: "2026-10-26", detail: { payPrice: "100.00", goods: [ { itemTitle: "商品一", itemPrice: "100.00", itemNum: "1", imageUrl: "https://img.example/a.jpg" } ] } },
        { id: 2, orderSn: "TB-456", platform: "taobao", status: -1, settleStatus: -1, paidAmount: "0.00", rebateMoney: "0.0000", refundMoney: "0.00", detail: null },
        { id: 3, orderSn: "PDD-789", platform: "pdd", status: 4, settleStatus: 3, paidAmount: "8.00", rebateMoney: "1.0000", refundMoney: "0", detail: { goods: [] } },
    ] } } }), (value) => copied.push(value.data));
    page.data.mode = "orders";
    page.loadRecords(1);
    await flush();
    assert.equal(page.data.records[0].platformLabel, "京东");
    assert.equal(page.data.records[0].statusLabel, "已付款");
    assert.equal(page.data.records[0].settleLabel, "预计返");
    assert.equal(page.data.records[0].goods[0].itemTitle, "商品一");
    assert.equal(page.data.records[1].goods.length, 0);
    assert.equal(page.data.records[1].hasRebate, false);
    assert.equal(page.data.records[1].statusLabel, "已关闭");
    assert.equal(page.data.records[2].settleLabel, "已结清返利");
    page.copyOrderSn({ currentTarget: { dataset: { id: 1 } } });
    assert.deepEqual(copied, ["JD-123"]);
    page.orderImageError({ currentTarget: { dataset: { id: 1, index: 0, image: "https://img.example/stale.jpg" } } });
    assert.equal(page.data.records[0].goods[0].imageFailed, false);
    page.orderImageError({ currentTarget: { dataset: { id: 1, index: 0, image: "https://img.example/a.jpg" } } });
    assert.equal(page.data.records[0].goods[0].imageFailed, true);
    page.copyOrderSn({ currentTarget: { dataset: { id: 99 } } });
    assert.equal(copied.length, 1);
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
    assert.match(page.data.error, /会话已失效/);
});
