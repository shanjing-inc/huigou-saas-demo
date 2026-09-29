import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const output = fileURLToPath(new URL(".", import.meta.url));

function tool(name, ...args) {
    const text = execFileSync("wechatide", ["-c", "Codex", name, "--project", project, ...args], {
        encoding: "utf8", timeout: 120000,
    });
    const response = JSON.parse(text.slice(text.indexOf("\n{") + 1));
    assert.equal(response.ok, true, `${name} failed: ${text}`);
    assert.equal(response.result.success, true, `${name} failed: ${text}`);
    return response.result;
}

const read = (field, wait = 0) => tool("automation_page_action", "--action", "getData", "--data-path", field, ...(wait ? ["--wait", String(wait)] : [])).data;
const tap = (selector) => tool("automation_element_action", "--action", "tap", "--selector", selector, "--wait-for-selector", selector);
const screenshot = (name, selector) => tool("simulator_screenshot", "--path", `${output}${name}.jpg`, "--wait-for-selector", selector);

assert.equal(read("connected"), true, "Demo backend login is required for the read-only screen check");
assert.equal(read("backendSupportsAccounts"), true, "Demo backend must support accounts");
while (["accounts", "withdraw"].includes(read("mode"))) tap(".nav-back");
if (read("mode") !== "wallet") tap('view[data-mode="wallet"]');
assert.equal(read("mode"), "wallet");
assert.equal(read("walletLoaded", 1), true);
screenshot("wallet", ".wallet-withdraw");

tap(".wallet-withdraw");
assert.equal(read("mode"), "withdraw");
assert.equal(read("accountsLoaded", 1), true);
screenshot("withdraw", ".withdraw-account-head");
tap(".withdraw-account-head .wallet-refresh");
assert.equal(read("mode"), "accounts");
tap(".nav-back");
assert.equal(read("mode"), "withdraw");
tap(".nav-back");
assert.equal(read("mode"), "wallet");

tap(".nav-back");
tap('view[data-mode="withdrawals"]');
assert.equal(read("mode"), "withdrawals");
assert.equal(read("loaded", 1), true);
screenshot("withdrawals", ".tabs");
console.log("Read-only wallet, withdrawal, accounts and history navigation passed; screenshots in verify/.");
