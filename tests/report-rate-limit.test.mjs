import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WRITER = new URL("../statusline/report-rate-limit.mjs", import.meta.url).pathname;

function fakeCmux(body = "") {
  const dir = mkdtempSync(join(tmpdir(), "cc-cmux-fake-"));
  const log = join(dir, "calls.txt");
  writeFileSync(join(dir, "cmux"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> " + JSON.stringify(log) + "\n" + body);
  chmodSync(join(dir, "cmux"), 0o755);
  return { dir, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []) };
}

function runWriter(input, env, fake) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [WRITER], { env: { PATH: fake.dir + ":" + process.env.PATH, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    const killer = setTimeout(() => child.kill("SIGKILL"), 4000);
    child.on("close", (code) => { clearTimeout(killer); resolve({ code, stdout, ms: Date.now() - t0 }); });
    child.stdin.end(typeof input === "string" ? input : JSON.stringify(input));
  });
}

const sevenDay = (pct, resetsAt = 1900000000) => ({ rate_limits: { seven_day: { used_percentage: pct, resets_at: resetsAt } } });

test("有 7 天資料且在 cmux 裡時，用 set-progress 寫入個人帳號的 label", { timeout: 5000 }, async () => {
  const fake = fakeCmux();
  const before = Math.floor(Date.now() / 1000);
  const r = await runWriter(sevenDay(78), { CMUX_WORKSPACE_ID: "W1" }, fake);
  const after = Math.floor(Date.now() / 1000);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  const calls = fake.calls();
  assert.equal(calls.length, 1);
  const m = calls[0].match(/^set-progress 0\.78 --label cc-cmux:7d:personal:1900000000:(\d+) --workspace W1$/);
  assert.ok(m, "實際呼叫：" + calls[0]);
  assert.ok(Number(m[1]) >= before && Number(m[1]) <= after);
});
