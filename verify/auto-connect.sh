#!/usr/bin/env bash
set -euo pipefail

project="$(cd "$(dirname "$0")/.." && pwd)"
capture="${CAPTURE_PATH:-$project/verify/.auto-connect.png}"
result="$(mktemp "$project/verify/.auto-connect.XXXXXX")"
cleanup() {
    rm -f "$result"
    if [[ -z "${CAPTURE_PATH:-}" ]]; then rm -f "$capture"; fi
}
trap cleanup EXIT

wechatide -c Codex simulator_open_page --project "$project" --page packages/rebate/pages/index/index > "$result"
jq -e '.ok and .result.success' "$result" > /dev/null

wechatide -c Codex automation_page_action --project "$project" --action getData --data-path connected --wait-for-selector .stat > "$result"
jq -e '.ok and .result.data == true' "$result" > /dev/null

wechatide -c Codex automation_page_action --project "$project" --action getData --data-path profile > "$result"
jq -e '.ok and .result.data.memberId != null and .result.data.money != null' "$result" > /dev/null

wechatide -c Codex simulator_screenshot --project "$project" --path "$capture" --wait-for-selector .stat > "$result"
jq -e '.ok and .result.success' "$result" > /dev/null
printf 'Auto-login and profile rendering verified; simulator screenshot captured.\n'
