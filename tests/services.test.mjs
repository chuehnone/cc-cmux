import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSidebar } from "./harness.mjs";

const ws = (id, title, tabs, agents) => ({ id, title, tabs, agents });
const tab = (id, title, surfaceId, ports) => ({ id, title, surfaceId, ports });

test("依 port 由小到大列出所有 workspace 的分頁 port", () => {
  const s = loadSidebar("services", {
    workspaces: [
      ws("w1", "api", [tab("t1", "server", "s1", [8080])]),
      ws("w2", "web", [tab("t2", "vite", "s2", [5173, 3000])]),
    ],
  });
  assert.deepEqual(s.rows().map((r) => r.port), [3000, 5173, 8080]);
});

test("每一列的副標是 workspace 名稱 · 分頁名稱", () => {
  const s = loadSidebar("services", { workspaces: [ws("w1", "api", [tab("t1", "server", "s1", [8080])])] });
  assert.ok(s.rows()[0].texts.includes("api · server"));
});

test("標題列顯示列數", () => {
  const s = loadSidebar("services", { workspaces: [ws("w1", "api", [tab("t1", "server", "s1", [8080, 8081])])] });
  assert.ok(s.texts().includes("2"));
});

test("沒有 port 時顯示空狀態", () => {
  const s = loadSidebar("services", { workspaces: [] });
  assert.ok(s.texts().includes("沒有偵測到監聽中的 port"));
});

test("開啟按鈕用瀏覽器開 localhost", () => {
  const s = loadSidebar("services", { workspaces: [ws("w1", "api", [tab("t1", "server", "s1", [8080])])] });
  assert.deepEqual(s.tap(8080, "safari"), [{ fn: "openURL", url: "http://localhost:8080" }]);
});

test("跳轉按鈕呼叫 surface.focus", () => {
  const s = loadSidebar("services", { workspaces: [ws("w1", "api", [tab("t1", "server", "s1", [8080])])] });
  assert.deepEqual(s.tap(8080, "arrow.right.square"), [
    { fn: "cmux", method: "surface.focus", params: { surface_id: "s1", workspace_id: "w1" } },
  ]);
});

test("停止按鈕對分頁送 Ctrl+C", () => {
  const s = loadSidebar("services", { workspaces: [ws("w1", "api", [tab("t1", "server", "s1", [8080])])] });
  const row = s.rows()[0];
  assert.equal(row.dot, "#34C759");
  assert.deepEqual(s.tap(8080, "stop.circle"), [
    { fn: "cmux", method: "surface.send_key", params: { surface_id: "s1", key: "ctrl+c" } },
  ]);
});

test("分頁有 agent 時顯示橘點與鎖頭，點了不送 Ctrl+C", () => {
  const s = loadSidebar("services", {
    workspaces: [ws("w1", "api", [tab("t1", "claude", "s1", [8080])], [{ surfaceId: "s1" }])],
  });
  const row = s.rows()[0];
  assert.equal(row.dot, "#FF9F0A");
  assert.ok(row.buttons.some((b) => b.symbol === "lock"));
  const calls = s.tap(8080, "lock");
  assert.equal(calls.filter((c) => c.fn === "cmux").length, 0);
  assert.equal(calls[0].fn, "log");
});

const bgWs = (ports, tabs, agents) => ({ id: "w1", title: "api", ports, tabs, agents });

test("workspace 有、分頁沒有的 port 出現一列", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([8080, 9000], [tab("t1", "server", "s1", [8080])])] });
  assert.deepEqual(s.rows().map((r) => r.port), [8080, 9000]);
});

test("背景列的副標是 workspace 名稱 · 背景，圓點是藍色", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([8080, 9000], [tab("t1", "server", "s1", [8080])])] });
  const row = s.rows().find((r) => r.port === 9000);
  assert.ok(row.texts.includes("api · 背景"));
  assert.equal(row.dot, "#0A84FF");
});

test("分頁也有的 port 只出現一次，照分頁列顯示", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([8080], [tab("t1", "server", "s1", [8080])])] });
  const rows = s.rows();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].dot, "#0A84FF");
  assert.ok(rows[0].texts.includes("api · server"));
});

test("背景列與分頁列一起依 port 排序，總數包含背景列", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([3000, 5000, 9000], [tab("t1", "server", "s1", [5000])])] });
  assert.deepEqual(s.rows().map((r) => r.port), [3000, 5000, 9000]);
  assert.ok(s.texts().includes("3"));
});

test("背景列的開啟按鈕用瀏覽器開 localhost", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [])] });
  assert.deepEqual(s.tap(9000, "safari"), [{ fn: "openURL", url: "http://localhost:9000" }]);
});

test("workspace 沒有 ports 欄位時不出錯，也沒有背景列", () => {
  const s = loadSidebar("services", { workspaces: [{ id: "w1", title: "api", tabs: [tab("t1", "server", "s1", [8080])] }] });
  assert.deepEqual(s.rows().map((r) => r.port), [8080]);
});

test("只有一個帶 surfaceId 的 agent 時，背景列跳轉到它的分頁", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [tab("t9", "claude", "s9", [])], [{ surfaceId: "s9" }])] });
  assert.deepEqual(s.tap(9000, "arrow.right.square"), [
    { fn: "cmux", method: "surface.focus", params: { surface_id: "s9", workspace_id: "w1" } },
  ]);
});
