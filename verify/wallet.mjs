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

await ide("simulator_open_page", "--page", "packages/rebate/pages/index/index");
await ide("automation_page_action", "--action", "getData", "--data-path", "mode", "--wait-for-selector", ".shell");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    connected: true, mode: "wallet", loaded: true, walletLoaded: true,
    notice: "离线布局样例 · 非接口金额", error: "",
    profile: { memberId: 99, money: "12.34", pendingMoney: "5.67", withdrawalMoney: "8.90", displayMoney: "12.34", displayPendingMoney: "5.67", displayWithdrawalMoney: "8.9" },
}), "--wait-for-selector", ".shell", "--wait", "1");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    walletStats: [
        { date: "2026-09-28", orderCount: 2, estimateMemberOrderCommission: "1.2400", displayEstimateMemberOrderCommission: "1.24", settledMemberOrderCommission: "0.0000", displaySettledMemberOrderCommission: "0" },
        { date: "2026-09-27", orderCount: 1, estimateMemberOrderCommission: "0.0000", displayEstimateMemberOrderCommission: "0", settledMemberOrderCommission: "0.8800", displaySettledMemberOrderCommission: "0.88" },
    ],
}));
const page = await ide("automation_page_action", "--action", "getData");
assert.equal(page.data.mode, "wallet");
assert.equal(page.data.notice, "离线布局样例 · 非接口金额");
assert.equal(page.data.walletStats.length, 2);
assert.equal(page.data.walletStats[0].displaySettledMemberOrderCommission, "0");
await ide("simulator_screenshot", "--path", `${project}/verify/wallet.jpg`, "--wait-for-selector", ".wallet-stat-row");
console.log("Offline wallet layout: labeled balances and two statistic buckets rendered.");
