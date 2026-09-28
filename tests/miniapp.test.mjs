import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function mountPage(request) {
    let definition;
    runInNewContext(readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8"), {
        Page: (value) => { definition = value; },
        getApp: () => ({ globalData: { session: "local-test-session" } }),
        wx: { request },
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
