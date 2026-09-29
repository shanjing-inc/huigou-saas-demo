import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");
function ide(tool, ...args) {
    const output = execFileSync("wechatide", ["-c", "Codex", tool, "--project", project, ...args], { encoding: "utf8", timeout: 110_000 });
    const result = JSON.parse(output);
    assert.equal(result.ok, true, `${tool}: ${result.message || output}`);
    return result;
}

ide("compile_wxml", "--file-path", "pages/index/index.wxml");
ide("compile_wxss", "--file-path", "pages/index/index.wxss");
ide("simulator_open_page", "--page", "pages/index/index");
const button = ide("automation_page_action", "--action", "querySelector", "--selector", ".server-entry");
assert.ok(button.result, "service settings entry is missing");
ide("automation_element_action", "--action", "tap", "--selector", ".server-entry");
const open = ide("automation_page_action", "--action", "getData", "--data-path", "serverSettingsOpen");
assert.match(JSON.stringify(open.result), /true/, "settings did not open");
const screenshot = ide("simulator_screenshot", "--path", join(project, "verify", "server-settings.jpg"));
console.log(JSON.stringify({ settingsOpen: true, screenshot: screenshot.result?.path }));
