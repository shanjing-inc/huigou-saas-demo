import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const project = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function ide(tool, ...args) {
    const { stdout } = await exec("wechatide", ["-c", "Codex", tool, "--project", project, ...args], {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
    });
    const response = JSON.parse(stdout.slice(stdout.indexOf("{")));
    assert.equal(response.ok, true, `${tool}: ${response.errorType || "failed"}`);
    return response.result;
}

await ide("simulator_refresh");
await ide("simulator_open_page", "--page", "pages/index/index");
const hint = await ide("automation_element_action", "--action", "text", "--selector", ".hint", "--wait-for-selector", ".hint");
assert.match(hint, /本机后端/);
assert.doesNotMatch(hint, /BFF/i);
const page = await ide("automation_page_action", "--action", "getData", "--wait-for-selector", ".shell");
assert.equal(page.data?.demo ?? page.demo, true);
await ide("simulator_screenshot", "--path", `${project}/verify/backend-label.jpg`, "--wait-for-selector", ".hint");
console.log("Simulator: backend label and demo page verified.");
