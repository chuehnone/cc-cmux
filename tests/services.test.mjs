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
    workspaces: [ws("w1", "api", [tab("p1", "claude", "p1", [8080])], [{ panelId: "p1", surfaceId: "x1" }])],
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

const T = 1793700000;
const agent = (status, panelId, extra = {}) => ({ id: "a-" + panelId + "-" + status, kind: "claude", name: "Claude", status, panelId, surfaceId: "X-" + panelId, lastActivityAt: T - 60, ...extra });
const waitWs = (agents, tabs, id = "W1", title = "Raphael") => ({ id, title, tabs, agents });
const wtab = (panelId, title, hasUnread = false) => ({ id: panelId, title, surfaceId: panelId, hasUnread });

test("needs_input 的 agent 顯示成問題列，橘點，從 sinceEpoch 算等待時間", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs([agent("needs_input", "S1", { sinceEpoch: T - 180 })], [wtab("S1", "Raphael-PR")])],
    clock: { epoch: T },
  });
  const w = s.waiting();
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].texts, ["Raphael · Raphael-PR", "問題", "3 分"]);
  assert.equal(w[0].dot, "#FF9F0A");
  assert.ok(s.texts().includes("等你"));
});

test("idle 且分頁有未讀時顯示成跑完列，藍點，從 lastActivityAt 算等待時間", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs([agent("idle", "P2", { lastActivityAt: T - 720 })], [wtab("P2", "Raphael-PB", true)])],
    clock: { epoch: T },
  });
  const w = s.waiting();
  assert.equal(w.length, 1);
  assert.deepEqual(w[0].texts, ["Raphael · Raphael-PB", "跑完", "12 分"]);
  assert.equal(w[0].dot, "#0A84FF");
});

test("working、已讀的 idle、ended 都不顯示", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs(
      [agent("working", "P1", { sinceEpoch: T - 60 }), agent("idle", "P2"), agent("ended", "P3")],
      [wtab("P1", "a", true), wtab("P2", "b", false), wtab("P3", "c", true)],
    )],
    clock: { epoch: T },
  });
  assert.deepEqual(s.waiting(), []);
});

test("等待時間：剛剛、N 分、N 小時、N 天，時間在未來時顯示剛剛", () => {
  const waitFor = (since) => loadSidebar("services", {
    workspaces: [waitWs([agent("needs_input", "P1", { sinceEpoch: since })], [wtab("P1", "a")])],
    clock: { epoch: T },
  }).waiting()[0]?.texts[2];
  assert.equal(waitFor(T - 59), "剛剛");
  assert.equal(waitFor(T - 3599), "59 分");
  assert.equal(waitFor(T - 3600), "1 小時");
  assert.equal(waitFor(T - 86400), "1 天");
  assert.equal(waitFor(T + 30), "剛剛");
});

test("問題排在跑完前面，同一種依等待時間由長到短", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs(
      [agent("idle", "P1", { lastActivityAt: T - 1200 }), agent("needs_input", "P2", { sinceEpoch: T - 60 }), agent("needs_input", "P3", { sinceEpoch: T - 300 })],
      [wtab("P1", "done", true), wtab("P2", "q1"), wtab("P3", "q5")],
    )],
    clock: { epoch: T },
  });
  assert.deepEqual(s.waiting().map((w) => w.texts.slice(1).join(" ")), ["問題 5 分", "問題 1 分", "跑完 20 分"]);
});

test("點一下等你列，用對應分頁的 surfaceId 送 surface.focus", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs([agent("needs_input", "P1", { sinceEpoch: T - 60 })], [wtab("P1", "Raphael-PR")])],
    clock: { epoch: T },
  });
  const calls = s.waiting()[0].tap();
  assert.deepEqual(calls.at(-1), { fn: "cmux", method: "surface.focus", params: { surface_id: "P1", workspace_id: "W1" } });
});

test("找不到對應分頁時顯示分頁不明，點一下送 workspace.select", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs(
      [agent("needs_input", "P9", { sinceEpoch: T - 60 }), { id: "a-none", kind: "claude", name: "Claude", status: "needs_input", sinceEpoch: T - 30, lastActivityAt: T - 30 }],
      [wtab("P1", "Raphael-PR")],
    )],
    clock: { epoch: T },
  });
  const w = s.waiting();
  assert.deepEqual(w.map((r) => r.texts[0]), ["Raphael · 分頁不明", "Raphael · 分頁不明"]);
  assert.deepEqual(w[0].tap().at(-1), { fn: "cmux", method: "workspace.select", params: { workspace_id: "W1" } });
});

test("needs_input 沒有 sinceEpoch 時，用 lastActivityAt 算等待時間", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs([agent("needs_input", "P1", { lastActivityAt: T - 180 })], [wtab("P1", "a")])],
    clock: { epoch: T },
  });
  assert.equal(s.waiting()[0]?.texts[2], "3 分");
});

test("同一個分頁有兩筆 session 時，只顯示 lastActivityAt 較新的一筆", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs(
      [
        { ...agent("needs_input", "P1", { sinceEpoch: T - 900, lastActivityAt: T - 900 }), id: "old" },
        { ...agent("idle", "P1", { lastActivityAt: T - 500 }), id: "new" },
      ],
      [wtab("P1", "a", true)],
    )],
    clock: { epoch: T },
  });
  assert.deepEqual(s.waiting().map((w) => w.texts.slice(1).join(" ")), ["跑完 8 分"]);
});

test("超過 10 個在等時顯示 10 列，加一行還有 N 個", () => {
  const agents = [];
  const tabs = [];
  for (let k = 1; k <= 12; k++) {
    agents.push(agent("needs_input", "P" + k, { sinceEpoch: T - k * 60 }));
    tabs.push(wtab("P" + k, "t" + k));
  }
  const s = loadSidebar("services", { workspaces: [waitWs(agents, tabs)], clock: { epoch: T } });
  assert.equal(s.waiting().length, 10);
  assert.ok(s.texts().includes("還有 2 個"));
});

test("沒有在等的 session 時，不顯示等你標題", () => {
  const s = loadSidebar("services", {
    workspaces: [waitWs([agent("working", "P1", { sinceEpoch: T - 60 })], [wtab("P1", "a")])],
    clock: { epoch: T },
  });
  assert.ok(!s.texts().includes("等你"));
});

test("agent 沒有 panelId，但 surfaceId 等於分頁的 surfaceId 時，仍顯示鎖頭", () => {
  const s = loadSidebar("services", {
    workspaces: [ws("w1", "api", [tab("p1", "claude", "p1", [8080])], [{ surfaceId: "p1" }])],
  });
  const row = s.rows()[0];
  assert.equal(row.dot, "#FF9F0A");
  assert.ok(row.buttons.some((b) => b.symbol === "lock"));
});

test("agent 的 panelId 與 surfaceId 都對不到分頁時，照舊可以停止", () => {
  const s = loadSidebar("services", {
    workspaces: [ws("w1", "api", [tab("p1", "server", "p1", [8080])], [{ panelId: "p9", surfaceId: "x9" }])],
  });
  const row = s.rows()[0];
  assert.equal(row.dot, "#34C759");
  assert.deepEqual(s.tap(8080, "stop.circle").at(-1), { fn: "cmux", method: "surface.send_key", params: { surface_id: "p1", key: "ctrl+c" } });
});

test("ended 的 agent 綁在分頁上時仍上鎖", () => {
  const s = loadSidebar("services", {
    workspaces: [ws("w1", "api", [tab("p1", "claude", "p1", [8080])], [{ panelId: "p1", surfaceId: "x1", status: "ended" }])],
  });
  assert.ok(s.rows()[0].buttons.some((b) => b.symbol === "lock"));
});

test("背景列跳轉用 agent 的 panelId 找分頁，送分頁的 surfaceId", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [tab("p9", "claude", "p9", [])], [{ panelId: "p9", surfaceId: "x9" }])] });
  assert.deepEqual(s.tap(9000, "arrow.right.square").at(-1), { fn: "cmux", method: "surface.focus", params: { surface_id: "p9", workspace_id: "w1" } });
});

test("背景列跳轉：panelId 對不到、surfaceId 對到時，送該分頁的 surfaceId", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [tab("p9", "claude", "p9", [])], [{ panelId: "p7", surfaceId: "p9" }])] });
  assert.deepEqual(s.tap(9000, "arrow.right.square").at(-1), { fn: "cmux", method: "surface.focus", params: { surface_id: "p9", workspace_id: "w1" } });
});

test("背景列跳轉：唯一 agent 對不到任何分頁時，改切 workspace", () => {
  const s = loadSidebar("services", { workspaces: [bgWs([9000], [tab("p1", "server", "p1", [])], [{ panelId: "p7", surfaceId: "x7" }])] });
  assert.deepEqual(s.tap(9000, "arrow.right.square").at(-1), { fn: "cmux", method: "workspace.select", params: { workspace_id: "w1" } });
});

const sysWs = (id, writtenAt, cpu, used, total) => ({
  id, title: "系統", tabs: [],
  progress: { value: Math.min(1, used / total), label: ["cc-cmux", "sys", writtenAt, cpu, used, total].join(":") },
});
const sysLines = (s) => {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.type === "Text" && /^(CPU |系統狀況)/.test(n.value ?? "")) out.push({ text: n.value, color: n.color });
    for (const c of n.children ?? []) walk(c);
  };
  walk(s.view());
  return out;
};

test("有系統資料時，在 7d 列上面顯示 CPU 與記憶體", () => {
  const s = loadSidebar("services", { workspaces: [sysWs("w1", NOW, "42.3", "33.69", "48.00"), usageWs("w2", "personal", DAY, 50)], clock: { epoch: NOW + 5 } });
  assert.deepEqual(sysLines(s), [{ text: "CPU 42% · 記憶體 33.7 / 48 GB", color: "secondary" }]);
  const texts = s.texts();
  assert.ok(texts.indexOf("CPU 42% · 記憶體 33.7 / 48 GB") < texts.findIndex((t) => /^個人 7d /.test(t ?? "")));
});

test("CPU 或記憶體四捨五入後 85% 以上時變紅，都低於 85% 時維持灰色", () => {
  const color = (cpu, used) => sysLines(loadSidebar("services", { workspaces: [sysWs("w1", NOW, cpu, used, "48.00")], clock: { epoch: NOW } }))[0];
  assert.deepEqual(color("84.6", "24.00"), { text: "CPU 85% · 記憶體 24.0 / 48 GB", color: "#FF453A" });
  assert.equal(color("84.4", "40.70").color, "#FF453A");
  assert.equal(color("84.4", "40.00").color, "secondary");
});

test("沒有系統資料時不畫系統列，7d 列照舊", () => {
  const s = loadSidebar("services", { workspaces: [usageWs("w2", "personal", DAY, 50)], clock: { epoch: NOW } });
  assert.deepEqual(sysLines(s), []);
  assert.deepEqual(s.usage().map((u) => u.text), ["個人 7d 剩 1 天 0 小時 · 已用 50%"]);
});

test("寫入時間超過 30 秒時顯示已停止更新，剛好 30 秒時照常顯示數字", () => {
  const at = (age) => sysLines(loadSidebar("services", { workspaces: [sysWs("w1", NOW - age, "42.3", "33.69", "48.00")], clock: { epoch: NOW } }));
  assert.deepEqual(at(31), [{ text: "系統狀況 已停止更新", color: "tertiary" }]);
  assert.deepEqual(at(30), [{ text: "CPU 42% · 記憶體 33.7 / 48 GB", color: "secondary" }]);
});

test("兩個 workspace 都有系統資料時，取寫入時間較新的一筆", () => {
  const s = loadSidebar("services", { workspaces: [sysWs("w1", NOW - 10, "10.0", "20.00", "48.00"), sysWs("w2", NOW, "42.3", "33.69", "48.00"), sysWs("w3", NOW - 5, "50.0", "30.00", "48.00")], clock: { epoch: NOW } });
  assert.deepEqual(sysLines(s).map((l) => l.text), ["CPU 42% · 記憶體 33.7 / 48 GB"]);
});

test("系統 label 欄位數不對或有非數字時略過", () => {
  const bad = (id, label) => ({ id, title: id, tabs: [], progress: { value: 0.5, label } });
  const s = loadSidebar("services", {
    workspaces: [
      bad("w1", "cc-cmux:sys:x:1:2:3"),
      bad("w2", "cc-cmux:sys:" + NOW + ":1:2"),
      bad("w3", "cc-cmux:sys:" + NOW + ":1::48"),
      bad("w4", "cc-cmux:sys:" + (NOW + 100) + ":abc:2:48"),
      sysWs("w5", NOW - 1, "12.0", "20.00", "48.00"),
    ],
    clock: { epoch: NOW },
  });
  assert.deepEqual(sysLines(s).map((l) => l.text), ["CPU 12% · 記憶體 20.0 / 48 GB"]);
});

test("同時有系統資料與 7d 資料時，兩種列都畫，7d 列文字不變", () => {
  const s = loadSidebar("services", { workspaces: [sysWs("w1", NOW, "42.3", "33.69", "48.00"), usageWs("w2", "personal", DAY, 50), usageWs("w3", "work", DAY, 31)], clock: { epoch: NOW } });
  assert.equal(sysLines(s).length, 1);
  assert.deepEqual(s.usage().map((u) => u.text), ["個人 7d 剩 1 天 0 小時 · 已用 50%", "公司 7d 剩 1 天 0 小時 · 已用 31%"]);
});
