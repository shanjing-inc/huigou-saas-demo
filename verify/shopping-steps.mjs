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

await ide("simulator_open_page", "--page", "packages/rebate/pages/index/index");
await ide("automation_page_action", "--action", "setData", "--patch", JSON.stringify({
    connected: true, mode: "promote", busy: false, error: "", notice: "", content: "", candidates: [],
}), "--wait-for-selector", ".shell");
const page = await ide("automation_page_action", "--action", "getData");
assert.equal(page.data.mode, "promote");
const steps = await ide("automation_page_action", "--action", "querySelectorAll", "--selector", ".shopping-step");
assert.equal(steps.elements.length, 3);
await ide("simulator_screenshot", "--path", `${project}/verify/shopping-steps.jpg`, "--wait-for-selector", ".shopping-step");
console.log("Offline shopping steps: three rendered, screenshot captured.");
