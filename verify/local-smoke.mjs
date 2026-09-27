import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer } from "../bff/http.mjs";

const exec = promisify(execFile);
const project = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function ide(tool, ...args) {
    let stdout;
    try {
        ({ stdout } = await exec("wechatide", ["-c", "Codex", tool, "--project", project, ...args], {
            timeout: 120000,
            maxBuffer: 1024 * 1024,
        }));
    } catch (error) {
        throw new Error(`${tool} failed (${error.signal ?? error.code ?? "unknown"})`);
    }
    const start = stdout.indexOf("{");
    assert.ok(start >= 0, `${tool}: missing tool response`);
    const response = JSON.parse(stdout.slice(start));
    assert.equal(response.ok, true, `${tool}: tool failed`);
    return response.result;
}

async function pageData(...args) {
    const result = await ide("automation_page_action", "--action", "getData", ...args);
    return result?.data ?? result;
}

const html = await (await fetch("http://127.0.0.1:4322/test/service-graphiql")).text();
const attribute = html.match(/<astro-island\b[^>]+\bprops="([^"]*)"/)?.[1];
assert.ok(attribute, "local saas development prefill is unavailable");
const props = JSON.parse(attribute.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&"));
const values = Object.fromEntries(Object.entries(props.initialConfig?.[1] ?? {}).map(([key, value]) => [key, value?.[1]]));
for (const key of ["appKey", "appSecret", "organizationId", "teamId"]) {
    assert.ok(values[key], `local saas development prefill lacks ${key}`);
}

const server = createServer({
    DEMO_API_BASE_URL: "http://127.0.0.1:4322",
    DEMO_APP_KEY: values.appKey,
    DEMO_APP_SECRET: values.appSecret,
    DEMO_ORGANIZATION_ID: values.organizationId,
    DEMO_TEAM_ID: values.teamId,
    DEMO_OPENID: `demo_feature_682_${randomBytes(12).toString("hex")}`,
});
await new Promise((resolve, reject) => server.once("error", reject).listen(8787, "127.0.0.1", resolve));
try {
    const status = await (await fetch("http://127.0.0.1:8787/api/status")).json();
    assert.equal(status.configured, true);
    await ide("simulator_open_page", "--page", "pages/index/index");
    let page = await pageData("--wait-for-selector", ".shell");
    assert.equal(page.demo, true);
    assert.equal(page.configured, true);
    await ide("automation_element_action", "--selector", "button.primary", "--action", "tap");
    page = await pageData("--wait-for-selector", ".tabs-inner");
    assert.equal(page.connected, true);
    assert.equal(page.profile?.teamId, Number(values.teamId));
    await ide("simulator_screenshot", "--path", `${project}/verify/local-connected.jpg`);
    for (const mode of ["orders", "bills", "withdrawals"]) {
        await ide("automation_page_action", "--action", "callMethod", "--method", "changeTab", "--args", JSON.stringify([{ currentTarget: { dataset: { mode } } }]));
        page = await pageData("--wait", "1");
        assert.equal(page.mode, mode);
        assert.equal(page.loaded, true);
        assert.deepEqual(page.records, []);
        console.log(`${mode}: loaded empty list`);
    }
    console.log("Local simulator: login, profile and three lists passed with a synthetic member.");
} finally {
    await new Promise((resolve) => server.close(resolve));
}
