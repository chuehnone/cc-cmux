import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../hooks/register-agent.mjs";

const cmuxEnv = { CMUX_SOCKET_PATH: "/tmp/cmux.sock", CMUX_SURFACE_ID: "S1", CMUX_TAB_ID: "T1" };

test("沒有 CMUX_SOCKET_PATH 時不送", () => {
  const { CMUX_SOCKET_PATH, ...env } = cmuxEnv;
  assert.equal(buildPayload(env, 4242), null);
});

test("條件齊全時，用父行程 PID 登記成 cc-cmux.claude.<PID>", () => {
  assert.equal(buildPayload(cmuxEnv, 4242), "set_agent_pid cc-cmux.claude.4242 4242 --tab=T1");
});
