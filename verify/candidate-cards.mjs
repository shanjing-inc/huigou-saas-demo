import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const project = resolve(fileURLToPath(new URL("..", import.meta.url)));
const material = process.env.DEMO_TEST_MATERIAL;
assert.ok(material, "Set DEMO_TEST_MATERIAL to an authorized test product URL before running.");

async function ide(tool, ...args) {
    const { stdout } = await exec("wechatide", ["-c", "Codex", tool, "--project", project, ...args], {
        timeout: 120000, maxBuffer: 1024 * 1024,
    });
    const response = JSON.parse(stdout.slice(stdout.indexOf("{")));
    assert.equal(response.ok, true, `${tool}: ${response.errorType || "failed"}`);
    return response.result;
}

async function data(path) {
    const result = await ide("automation_page_action", "--action", "getData", "--data-path", path);
    return result.data;
}

const status = await (await fetch("http://127.0.0.1:8787/api/status")).json();
assert.equal(status.configured, true, "Start the configured local backend first.");
const currentPage = await ide("automation_runtime_info", "--action", "currentPage");
if (currentPage.currentPage?.path !== "pages/index/index") {
    await ide("simulator_open_page", "--page", "pages/index/index");
}
if (!(await data("connected"))) {
    await ide("automation_element_action", "--selector", "button.primary", "--action", "tap", "--wait-for-selector", "button.primary");
    assert.equal(await data("connected"), true, "Isolated test login failed.");
}
await ide("automation_element_action", "--selector", '.tab[data-mode="promote"]', "--action", "tap", "--wait-for-selector", ".tabs-inner");
await ide("automation_element_action", "--selector", ".material-input", "--action", "input", "--value", material, "--wait-for-selector", ".material-input");
await ide("automation_element_action", "--selector", "button.primary", "--action", "tap");

let candidates;
for (let attempt = 0; attempt < 10; attempt++) {
    candidates = await data("candidates");
    if (candidates?.length && candidates.every((item) => item.previewState !== "loading")) break;
}
assert.ok(candidates?.length, "Parse returned no candidates.");
assert.ok(candidates.some((item) => item.previewState === "ready" && item.preview.imageUrl && item.preview.price),
    "No card received a real product photo and price.");
await ide("simulator_screenshot", "--path", `${project}/verify/candidate-cards.jpg`, "--wait-for-selector", ".candidate");
console.log(`Simulator: ${candidates.length} candidate cards; at least one real photo and price verified.`);
