import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

test("item lookup uses parsed product ID while conversion keeps the candidate URL", async () => {
    let definition;
    const requests = [];
    runInNewContext(readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8"), {
        Page: (value) => { definition = value; },
        getApp: () => ({ globalData: { session: "local-test-session" } }),
        wx: {
            request(options) {
                requests.push({ url: options.url, material: options.data.material });
                options.success({ statusCode: 200, data: { data: options.url.endsWith("/item") ? { itemId: "full_product_id" } : { url: "https://test.example/ref" } } });
            },
        },
    });
    const itemUrl = "https://jingfen.jd.com/detail/example.html";
    const page = {
        ...definition,
        data: { ...definition.data, selected: { platform: "jd", detail: { itemId: " full_product_id ", itemUrl } }, selectedType: "goods" },
        setData(patch) { Object.assign(this.data, patch); },
    };

    page.getItem();
    await new Promise(setImmediate);
    assert.deepEqual(requests[0], { url: "http://127.0.0.1:8787/api/item", material: "full_product_id" });
    assert.equal(page.data.item.itemId, "full_product_id");

    page.createLink();
    await new Promise(setImmediate);
    assert.deepEqual(requests[1], { url: "http://127.0.0.1:8787/api/link", material: itemUrl });
    assert.equal(page.data.link.url, "https://test.example/ref");

    page.data.selected.detail.itemId = null;
    assert.equal(page.selection(true).material, itemUrl);
});
