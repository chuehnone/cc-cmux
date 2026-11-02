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

const focusCalls = (agents) => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [], agents)] });
  return s.tap(9000, "arrow.right.square");
};
const selectWorkspace = [{ fn: "cmux", method: "workspace.select", params: { workspace_id: "w1" } }];

test("有多個 agent 時，背景列跳轉改切 workspace", () => {
  assert.deepEqual(focusCalls([{ surfaceId: "s8" }, { surfaceId: "s9" }]), selectWorkspace);
});

test("沒有 agent 時，背景列跳轉改切 workspace", () => {
  assert.deepEqual(focusCalls(undefined), selectWorkspace);
});

test("唯一的 agent 沒有 surfaceId 時，背景列跳轉改切 workspace", () => {
  assert.deepEqual(focusCalls([{ id: "a1" }]), selectWorkspace);
});

test("背景列的停止按鈕是鎖頭，點了不送 cmux 呼叫，只寫 log", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [], [{ surfaceId: "s9" }])] });
  const row = s.rows()[0];
  assert.ok(row.buttons.some((b) => b.symbol === "lock"));
  const calls = s.tap(9000, "lock");
  assert.equal(calls.filter((c) => c.fn === "cmux").length, 0);
  assert.equal(calls.filter((c) => c.fn === "log").length, 1);
});

test("底部說明提到藍點代表背景服務", () => {
  const s = loadSidebar("services", { workspaces: [] });
  assert.ok(s.texts().some((t) => typeof t === "string" && t.includes("藍點") && t.includes("背景")));
});

test("同一個 workspace 的 ports 有重複值時，背景列只出現一次", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000, 9000], [])] });
  assert.deepEqual(s.rows().map((r) => r.port), [9000]);
});

const NOW = 1900000000;
const usageWs = (id, account, resetsIn, pct, writtenAt = NOW - 60) => ({
  id, title: id, tabs: [],
  progress: { value: Math.min(1, pct / 100), label: ["cc-cmux", "7d", account, NOW + resetsIn, writtenAt, pct].join(":") },
});
const DAY = 86400;
const HOUR = 3600;

test("個人帳號已用 78%、離重置 2 天 5 小時時，顯示一列灰字", () => {
  const s = loadSidebar("services", { workspaces: [usageWs("w1", "personal", 2 * DAY + 5 * HOUR + 300, 78)], clock: { epoch: NOW } });
  assert.deepEqual(s.usage(), [{ text: "個人 7d 剩 2 天 5 小時 · 已用 78%", color: "secondary" }]);
});

test("不到 1 天顯示小時與分，不到 1 小時只顯示分，秒數捨去", () => {
  const s = loadSidebar("services", { workspaces: [usageWs("w1", "personal", 5 * HOUR + 12 * 60 + 40, 10)], clock: { epoch: NOW } });
  assert.equal(s.usage()[0]?.text, "個人 7d 剩 5 小時 12 分 · 已用 10%");
  const t = loadSidebar("services", { workspaces: [usageWs("w1", "personal", 12 * 60 + 59, 10)], clock: { epoch: NOW } });
  assert.equal(t.usage()[0]?.text, "個人 7d 剩 12 分 · 已用 10%");
});

test("四捨五入後已用 85% 以上變紅，84% 維持灰色", () => {
  const red = loadSidebar("services", { workspaces: [usageWs("w1", "personal", DAY, 84.6)], clock: { epoch: NOW } });
  assert.deepEqual(red.usage(), [{ text: "個人 7d 剩 1 天 0 小時 · 已用 85%", color: "#FF453A" }]);
  const gray = loadSidebar("services", { workspaces: [usageWs("w1", "personal", DAY, 84.4)], clock: { epoch: NOW } });
  assert.deepEqual(gray.usage(), [{ text: "個人 7d 剩 1 天 0 小時 · 已用 84%", color: "secondary" }]);
});

test("兩個帳號都有值時，個人在上、公司在下", () => {
  const s = loadSidebar("services", { workspaces: [usageWs("w1", "work", DAY, 31), usageWs("w2", "personal", DAY, 78)], clock: { epoch: NOW } });
  assert.deepEqual(s.usage().map((u) => u.text.slice(0, 2)), ["個人", "公司"]);
});

test("同一個帳號在兩個 workspace 有值時，取寫入時間較新的一筆", () => {
  const s = loadSidebar("services", {
    workspaces: [usageWs("w1", "personal", DAY, 50, NOW - 10), usageWs("w2", "personal", DAY, 40, NOW - 100)],
    clock: { epoch: NOW },
  });
  assert.deepEqual(s.usage().map((u) => u.text), ["個人 7d 剩 1 天 0 小時 · 已用 50%"]);
});

test("label 不是 cc-cmux:7d: 開頭或格式錯時略過", () => {
  const bad = (id, label) => ({ id, title: id, tabs: [], progress: { value: 0.5, label } });
  const s = loadSidebar("services", {
    workspaces: [
      bad("w1", "Building..."),
      bad("w2", "cc-cmux:7d:personal:" + (NOW + DAY) + ":" + NOW),
      bad("w3", "cc-cmux:7d:personal:abc:" + NOW + ":50"),
      bad("w4", "cc-cmux:7d:someone:" + (NOW + DAY) + ":" + NOW + ":50"),
      { id: "w5", title: "w5", tabs: [] },
      usageWs("w6", "work", DAY, 31),
    ],
    clock: { epoch: NOW },
  });
  assert.deepEqual(s.usage().map((u) => u.text), ["公司 7d 剩 1 天 0 小時 · 已用 31%"]);
});

test("沒有任何 7 天資料時顯示一列 7d 無資料", () => {
  const s = loadSidebar("services", { workspaces: [ws("w1", "api", [tab("t1", "server", "s1", [8080])])], clock: { epoch: NOW } });
  assert.deepEqual(s.usage(), [{ text: "7d 無資料", color: "tertiary" }]);
});

test("已過重置時間時顯示已重置，等待更新", () => {
  const s = loadSidebar("services", { workspaces: [usageWs("w1", "personal", -5, 90)], clock: { epoch: NOW } });
  assert.deepEqual(s.usage().map((u) => u.text), ["個人 7d 已重置，等待更新"]);
  const edge = loadSidebar("services", { workspaces: [usageWs("w1", "personal", 0, 90)], clock: { epoch: NOW } });
  assert.deepEqual(edge.usage().map((u) => u.text), ["個人 7d 已重置，等待更新"]);
});

test("clock 前進 1 小時，剩餘時間少 1 小時", () => {
  const clock = { epoch: NOW };
  const s = loadSidebar("services", { workspaces: [usageWs("w1", "personal", 5 * HOUR + 60, 10)], clock });
  assert.equal(s.usage()[0]?.text, "個人 7d 剩 5 小時 1 分 · 已用 10%");
  clock.epoch = NOW + HOUR;
  assert.equal(s.usage()[0]?.text, "個人 7d 剩 4 小時 1 分 · 已用 10%");
});
