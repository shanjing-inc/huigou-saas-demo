import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const project = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function ide(tool, ...args) {
    const { stdout } = await exec("wechatide", ["-c", "Codex", tool, "--project", project, ...args], {
        timeout: 120000, maxBuffer: 1024 * 1024,
    });
    const response = JSON.parse(stdout.slice(stdout.indexOf("{")));
    assert.equal(response.ok, true, `${tool}: ${response.errorType || "failed"}`);
    return response.result;
}

await ide("simulator_open_page", "--page", "pages/index/index");
await ide("automation_page_action", "--action", "getData", "--data-path", "mode", "--wait-for-selector", ".shell");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    connected: true, mode: "orders", loaded: true, notice: "离线布局样例 · 非接口订单", error: "",
}));
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    records: [
        {
            id: 1, platformLabel: "京东", orderSn: "TEST-JD-1001", statusLabel: "已付款",
            settleLabel: "预计返", hasRebate: true, paidAmount: "141.00", rebateMoney: "4.9400",
            refundMoney: "0.00", hasRefund: false, orderedAt: "2026-09-05 09:00:00",
            paidAt: "2026-09-05 09:02:00", expectedSettleAt: "2026-10-26 00:00:00", settleStatus: 1,
            detail: { payPrice: "149.00" }, goods: [{ itemTitle: "无线蓝牙办公鼠标", itemPrice: "149.00", itemNum: "1", imageFailed: true }],
        },
        {
            id: 2, platformLabel: "淘宝", orderSn: "TEST-TB-1002", statusLabel: "已关闭",
            settleLabel: "返利无效", hasRebate: false, paidAmount: "0.00", rebateMoney: "0.0000",
            refundMoney: "0.00", hasRefund: false, orderedAt: "2026-09-06 10:00:00",
            settleStatus: -1, detail: null, goods: [],
        },
    ],
}));
const page = await ide("automation_page_action", "--action", "getData");
assert.equal(page.data.notice, "离线布局样例 · 非接口订单");
assert.equal(page.data.records.length, 2);
await ide("simulator_screenshot", "--path", `${project}/verify/order-list.jpg`, "--wait-for-selector", ".order-head");
console.log("Offline order layout: two labeled fixtures rendered; no real API data asserted.");
