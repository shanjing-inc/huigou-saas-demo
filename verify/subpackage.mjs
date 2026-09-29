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
    const start = stdout.indexOf("{");
    assert.ok(start >= 0, `${tool}: missing response`);
    const response = JSON.parse(stdout.slice(start));
    assert.equal(response.ok, true, `${tool}: ${response.message || "failed"}`);
    return response.result;
}

await ide("open_project_window");
for (const path of ["pages/index/index", "packages/rebate/pages/index/index"]) {
    await ide("compile_wxml", "--file-path", `${path}.wxml`);
    await ide("compile_wxss", "--file-path", `${path}.wxss`);
}
await ide("simulator_open_page", "--page", "pages/index/index");
await ide("simulator_screenshot", "--path", `${project}/verify/subpackage-launcher.jpg`, "--wait-for-selector", ".open");
await ide("automation_element_action", "--action", "tap", "--selector", ".open", "--wait-for-selector", ".open");
await ide("simulator_screenshot", "--path", `${project}/verify/subpackage.jpg`, "--wait-for-selector", ".app-nav");
const current = await ide("automation_runtime_info", "--action", "currentPage");
assert.equal(current.currentPage?.path, "packages/rebate/pages/index/index");
console.log("Main-package launcher navigated into the compiled rebate subpackage.");
