import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { listenAddress, writeMiniappConfig } from "../backend/address.mjs";

function loadConfig(source) {
    const context = { module: { exports: {} } };
    runInNewContext(source, context);
    return context.module.exports;
}

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), "demo-address-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

test("address defaults, private LAN and custom port share one validated configuration", () => {
    assert.deepEqual(listenAddress({}), { host: "127.0.0.1", port: 8787, baseUrl: "http://127.0.0.1:8787" });
    assert.deepEqual(listenAddress({ DEMO_LAN_HOST: " 192.168.31.31 ", DEMO_PORT: "9988" }), {
        host: "192.168.31.31", port: 9988, baseUrl: "http://192.168.31.31:9988",
    });
    assert.equal(listenAddress({ DEMO_LAN_HOST: " ", DEMO_PORT: "9988" }).baseUrl, "http://127.0.0.1:9988");
    for (const host of ["0.0.0.0", "8.8.8.8", "192.168.1.999", "localhost"]) {
        assert.throws(() => listenAddress({ DEMO_LAN_HOST: host }), /private IPv4/);
    }
    for (const port of ["0", "-1", "65536", "NaN", "8787.5", " "]) {
        assert.throws(() => listenAddress({ DEMO_PORT: port }), /valid port/);
    }
    assert.throws(() => listenAddress({ DEMO_LAN_TOKEN: "obsolete" }), /no longer supported/);
});

test("generated module updates LAN to loopback and contains only the public address", async (t) => {
    const directory = await fixture(t);
    const destination = join(directory, "config", "backend.js");
    const env = { DEMO_LAN_HOST: "192.168.31.31", DEMO_PORT: "9988", DEMO_APP_SECRET: "never-export-me", DEMO_OPENID: "private-member" };
    await writeMiniappConfig(listenAddress(env), destination);
    const source = await readFile(destination, "utf8");
    const config = loadConfig(source);
    assert.deepEqual(Object.keys(config), ["BACKEND_BASE"]);
    assert.equal(config.BACKEND_BASE, "http://192.168.31.31:9988");
    assert.doesNotMatch(source, /never-export-me|private-member|DEMO_APP_SECRET|DEMO_OPENID/);

    // Execute the real page with the real generated CommonJS exports.
    let page;
    let requested;
    runInNewContext(await readFile(new URL("../miniprogram/packages/rebate/pages/index/index.js", import.meta.url), "utf8"), {
        require: (path) => { assert.equal(path, "../../config/backend"); return config; },
        Page: (value) => { page = value; },
        wx: { request: (options) => { requested = options.url; } },
    });
    page.setData = (patch) => Object.assign(page.data, patch);
    page.checkBackend();
    assert.equal(requested, "http://192.168.31.31:9988/api/status");

    await writeMiniappConfig(listenAddress({ DEMO_LAN_HOST: "", DEMO_PORT: "9988" }), destination);
    assert.equal(loadConfig(await readFile(destination, "utf8")).BACKEND_BASE, "http://127.0.0.1:9988");
    assert.deepEqual(await readdir(join(directory, "config")), ["backend.js"]);
});

async function backendFixture(t) {
    const directory = await fixture(t);
    await cp(new URL("../backend/", import.meta.url), join(directory, "backend"), { recursive: true });
    return { directory, destination: join(directory, "miniprogram", "packages", "rebate", "config", "backend.js") };
}

function startBackend(t, directory) {
    const child = spawn(process.execPath, ["--env-file=.env", "backend/server.mjs"], {
        cwd: directory, env: {}, stdio: ["ignore", "pipe", "pipe"],
    });
    const closed = once(child, "close");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    t.after(async () => { if (child.exitCode === null) child.kill("SIGTERM"); await closed; });
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Backend startup timed out")); }, 10000);
        child.stdout.on("data", () => {
            if (stdout.includes("Miniapp address generated")) { clearTimeout(timer); resolve(); }
        });
        child.once("close", () => { clearTimeout(timer); reject(new Error(`Backend exited before readiness: ${stderr}`)); });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    // Failure tests inspect the exit instead of waiting for readiness.
    ready.catch(() => {});
    return { child, closed, ready, output: () => ({ stdout, stderr }) };
}

async function bindPort(t) {
    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    t.after(() => listener.listening ? new Promise((resolve) => listener.close(resolve)) : undefined);
    return listener;
}

test("actual startup reads .env and generates the address served by the backend", async (t) => {
    const { directory, destination } = await backendFixture(t);
    const listener = await bindPort(t);
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    await writeFile(join(directory, ".env"), `DEMO_PORT=${port}\nDEMO_LAN_HOST=\n`);
    const backend = startBackend(t, directory);
    await backend.ready;
    const baseUrl = loadConfig(await readFile(destination, "utf8")).BACKEND_BASE;
    assert.equal(baseUrl, `http://127.0.0.1:${port}`);
    const response = await fetch(`${baseUrl}/api/status`);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.demo, true);
    assert.equal(status.configured, false);
    assert.match(backend.output().stdout, new RegExp(`127\\.0\\.0\\.1:${port}`));
    backend.child.kill("SIGTERM");
    await backend.closed;
});

test("occupied port exits unsuccessfully without replacing an existing miniapp config", async (t) => {
    const { directory, destination } = await backendFixture(t);
    const listener = await bindPort(t);
    await mkdir(join(destination, ".."), { recursive: true });
    const previous = 'module.exports = { BACKEND_BASE: "http://192.168.1.10:8787" };\n';
    await writeFile(destination, previous);
    await writeFile(join(directory, ".env"), `DEMO_PORT=${listener.address().port}\n`);
    const backend = startBackend(t, directory);
    assert.equal((await backend.closed)[0], 1);
    assert.match(backend.output().stderr, /EADDRINUSE/);
    assert.equal(backend.output().stdout, "");
    assert.equal(await readFile(destination, "utf8"), previous);
});

test("config write failure closes the new listener and reports failure instead of readiness", async (t) => {
    const { directory, destination } = await backendFixture(t);
    await mkdir(destination, { recursive: true });
    const listener = await bindPort(t);
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    await writeFile(join(directory, ".env"), `DEMO_PORT=${port}\n`);
    const backend = startBackend(t, directory);
    assert.equal((await backend.closed)[0], 1);
    assert.match(backend.output().stderr, /startup failed/);
    assert.equal(backend.output().stdout, "");
    assert.deepEqual(await readdir(join(destination, "..")), ["backend.js"]);
    await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(port, "127.0.0.1", resolve); });
});
