#!/bin/sh
set -eu

# Offline simulator smoke test; an unconfigured BFF is an expected state here.
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
wechatide -c Codex simulator_open_page --project "$PROJECT" --page pages/index/index
wechatide -c Codex automation_page_action --project "$PROJECT" --action getData --wait-for-selector .shell | node -e '
let text = "";
process.stdin.on("data", (chunk) => text += chunk);
process.stdin.on("end", () => {
    const response = JSON.parse(text.slice(text.indexOf("{")));
    const page = response.result?.data ?? response.result;
    if (!page || page.demo !== true || page.connected !== false || page.configured !== false) {
        console.error("Offline simulator state mismatch", JSON.stringify(page));
        process.exitCode = 1;
        return;
    }
    console.log("Offline simulator: demo marked, no fabricated session or test credentials.");
});'
wechatide -c Codex simulator_screenshot --project "$PROJECT" --path "$PROJECT/verify/offline-screen.jpg" --wait-for-selector .shell
