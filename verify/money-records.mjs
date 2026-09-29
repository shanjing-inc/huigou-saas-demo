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
    assert.equal(response.ok, true, `${tool}: ${response.message || "failed"}`);
    return response.result;
}

async function show(mode, records, file) {
    await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
        connected: true, mode, busy: false, error: "", notice: "", loaded: true, hasMore: false,
        records,
    }), "--wait-for-selector", ".shell");
    const result = await ide("automation_page_action", "--action", "getData");
    assert.equal(result.data.mode, mode);
    assert.equal(result.data.records.length, records.length);
    await ide("simulator_screenshot", "--path", `${project}/verify/${file}.jpg`, "--wait-for-selector", ".money-record");
}

await ide("simulator_open_page", "--page", "pages/index/index");
await show("bills", [
    { id: 1, title: "网购返利", displayAmount: "+18.44", decrease: false, createdAt: "2026-09-25 13:29", memo: "京东订单：3577447017489129" },
    { id: 2, title: "邀请奖励", displayAmount: "+0.1", decrease: false, createdAt: "2026-09-26 18:11", memo: "推荐奖金" },
    { id: 3, title: "提现", displayAmount: "-1.2", decrease: true, createdAt: "2026-09-27 08:35", memo: "" },
], "money-bills");
await show("withdrawals", [
    { id: 4, displayAmount: "5", statusTone: "success", statusLabel: "打款成功", accountLabel: "支付宝", withdrawalAccountId: "7", createdAt: "2026-09-28 14:59:37", failureReason: "" },
    { id: 5, displayAmount: "1.2", statusTone: "failed", statusLabel: "打款失败", accountLabel: "银行卡", withdrawalAccountId: "8", createdAt: "2026-09-27 16:06:41", failureReason: "收款账号不存在或姓名有误，请核对后重试。" },
    { id: 6, displayAmount: "2", statusTone: "pending", statusLabel: "系统审核中", accountLabel: "微信", withdrawalAccountId: "9", createdAt: "2026-09-26 10:43:28", failureReason: "" },
], "money-withdrawals");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    connected: true, mode: "profile", busy: false, error: "", notice: "",
    profile: { memberId: 108, teamId: 23, role: "成员", money: "86.50", pendingMoney: "12.30", withdrawalMoney: "30.00" },
}));
await ide("simulator_screenshot", "--path", `${project}/verify/money-profile.jpg`, "--wait-for-selector", ".member-balance");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({ mode: "promote", content: "", candidates: [] }));
await ide("simulator_screenshot", "--path", `${project}/verify/money-shopping.jpg`, "--wait-for-selector", ".shopping-search");
console.log("Offline money-record layouts checked and captured without financial writes.");
