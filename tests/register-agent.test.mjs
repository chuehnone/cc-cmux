import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../hooks/register-agent.mjs";

const cmuxEnv = { CMUX_SOCKET_PATH: "/tmp/cmux.sock", CMUX_SURFACE_ID: "S1", CMUX_TAB_ID: "T1" };

test("沒有 CMUX_SOCKET_PATH 時不送", () => {
  const { CMUX_SOCKET_PATH, ...env } = cmuxEnv;
  assert.equal(buildPayload(env, 4242), null);
});
