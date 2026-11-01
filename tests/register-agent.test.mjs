import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPayload } from "../hooks/register-agent.mjs";

const HOOK = new URL("../hooks/register-agent.mjs", import.meta.url).pathname;

function runHook(env) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - t0 }));
    child.stdin.end("{}");
  });
}

const cmuxEnv = { CMUX_SOCKET_PATH: "/tmp/cmux.sock", CMUX_SURFACE_ID: "S1", CMUX_TAB_ID: "T1" };

test("沒有 CMUX_SOCKET_PATH 時不送", () => {
  const { CMUX_SOCKET_PATH, ...env } = cmuxEnv;
  assert.equal(buildPayload(env, 4242), null);
});

test("條件齊全時，用父行程 PID 登記成 cc-cmux.claude.<PID>", () => {
  assert.equal(buildPayload(cmuxEnv, 4242), "set_agent_pid cc-cmux.claude.4242 4242 --tab=T1");
});

test("沒有 CMUX_SURFACE_ID 時不送", () => {
  const { CMUX_SURFACE_ID, ...env } = cmuxEnv;
  assert.equal(buildPayload(env, 4242), null);
});

test("CMUX_CLAUDE_HOOKS_DISABLED=1 時不送", () => {
  assert.equal(buildPayload({ ...cmuxEnv, CMUX_CLAUDE_HOOKS_DISABLED: "1" }, 4242), null);
});

test("沒有 CMUX_TAB_ID 時不送", () => {
  const { CMUX_TAB_ID, ...env } = cmuxEnv;
  assert.equal(buildPayload(env, 4242), null);
});

test("有 CMUX_CLAUDE_PID 時，key 與 PID 都用它", () => {
  assert.equal(buildPayload({ ...cmuxEnv, CMUX_CLAUDE_PID: "777" }, 4242), "set_agent_pid cc-cmux.claude.777 777 --tab=T1");
});

test("有 CMUX_SOCKET_CAPABILITY 時，前面加上 _cmux_capability_v1", () => {
  assert.equal(buildPayload({ ...cmuxEnv, CMUX_SOCKET_CAPABILITY: "cap" }, 4242), "_cmux_capability_v1 cap set_agent_pid cc-cmux.claude.4242 4242 --tab=T1");
});

test("直接執行時，把指令送到 cmux socket，stdout 是空的", async () => {
  const sock = join(mkdtempSync(join(tmpdir(), "cc-cmux-hook-")), "s.sock");
  const received = [];
  const server = createServer((c) => {
    let buf = "";
    c.on("data", (d) => { buf += d; });
    c.on("end", () => { received.push(buf); c.end("OK\n"); });
  });
  await new Promise((r) => server.listen(sock, r));
  const result = await runHook({ ...cmuxEnv, CMUX_SOCKET_PATH: sock, CMUX_CLAUDE_PID: "777" });
  server.close();
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.deepEqual(received, ["set_agent_pid cc-cmux.claude.777 777 --tab=T1\n"]);
});
