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
    const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
    assert.equal(result.ok, true, `${tool}: ${result.message || "failed"}`);
    return result.result;
}

await ide("compile_wxml", "--file-path", "packages/rebate/pages/index/index.wxml");
await ide("compile_wxss", "--file-path", "packages/rebate/pages/index/index.wxss");
await ide("simulator_open_page", "--page", "packages/rebate/pages/index/index");
await ide("simulator_screenshot", "--path", `${project}/verify/backend-url.jpg`, "--wait-for-selector", ".app-nav");
console.log("Backend URL screen compiled and captured; no phone-side settings are present.");
