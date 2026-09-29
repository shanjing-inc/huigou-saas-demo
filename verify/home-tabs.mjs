import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const project = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = readFileSync(`${project}/miniprogram/pages/index/index.js`, "utf8");
assert.match(source, /const BASE = "http:\/\/127\.0\.0\.1:18787";/, "Only run this offline preview against the isolated port");

async function ide(tool, ...args) {
    const { stdout } = await exec("wechatide", ["-c", "Codex", tool, "--project", project, ...args], {
        timeout: 120000, maxBuffer: 1024 * 1024,
    });
    const response = JSON.parse(stdout.slice(stdout.indexOf("{")));
    assert.equal(response.ok, true, `${tool}: ${response.message || "failed"}`);
    return response.result;
}

async function pageData() {
    const result = await ide("automation_page_action", "--action", "getData", "--wait-for-selector", ".shell");
    return result.data;
}

async function preview(mode, screenshot) {
    assert.equal((await pageData()).mode, mode);
    await ide("simulator_screenshot", "--path", `${project}/verify/${screenshot}.jpg`, "--wait-for-selector", ".bottom-nav");
}

await ide("simulator_open_page", "--page", "pages/index/index");
assert.equal((await pageData()).connected, false);
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    connected: true, busy: false, error: "", notice: "离线布局样例 · 非接口数据",
    profile: { memberId: 108, teamId: 23, role: "成员", money: "86.5", pendingMoney: "12.3", withdrawalMoney: "30" },
}));
await preview("promote", "home-shopping");

await ide("automation_element_action", "--selector", '.bottom-tab[data-mode="orders"]', "--action", "tap", "--wait-for-selector", ".bottom-nav");
assert.equal((await pageData()).mode, "orders");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    error: "", notice: "离线布局样例 · 非接口订单", busy: false, loaded: true,
    records: [{ id: 1, platformMark: "京", platformLabel: "京东", orderSn: "TEST-1001", status: 2, statusLabel: "已付款", settleStatus: 1, hasRebate: true, displayRebate: "4.9", orderDate: "2026-09-28", displayPrice: "86.5", goods: [{ itemTitle: "离线示例商品", displayItemPrice: "86.5", imageFailed: true }] }],
}));
await preview("orders", "home-orders");

await ide("automation_element_action", "--selector", '.bottom-tab[data-mode="profile"]', "--action", "tap", "--wait-for-selector", ".bottom-nav");
assert.equal((await pageData()).mode, "profile");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({ error: "", notice: "离线布局样例 · 非接口数据" }));
await preview("profile", "home-profile");
console.log("Offline layout: shopping, orders and profile navigated and captured without live API access.");
