#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, appendFileSync, lstatSync, readlinkSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const EVIDENCE_ROOT = process.env.CCV_EVIDENCE_DIR || join(homedir(), ".cache", "cc-cmux-verify");
const CUA = process.env.CMUX_CUA_CLIENT_PATH;
const BUTTON_OFFSET_FROM_RIGHT = { stop: 34, focus: 63, open: 92 };
const PORT_RANGE = [18700, 18799];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

function sh(cmd, args, { allowFail = false } = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", env: { ...process.env, CMUX_QUIET: "1" }, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(cmd + " " + args.join(" ") + " 失敗：" + (e.stderr || e.message).trim());
  }
}
const cmux = (...args) => sh("cmux", args);
const cmuxTry = (...args) => sh("cmux", args, { allowFail: true });

function cua(tool, params) {
  if (!CUA || !existsSync(CUA)) throw new Error("找不到 cmux-cua。請在 cmux 終端機裡執行，讓 CMUX_CUA_CLIENT_PATH 有值。");
  const out = sh(CUA, ["call", tool, JSON.stringify(params)]);
  try {
    const d = JSON.parse(out);
    return d.structuredContent ?? d;
  } catch {
    throw new Error("cmux-cua " + tool + " 回傳非 JSON：" + out.slice(0, 300));
  }
}

function fail(msg) {
  console.error("FAIL " + msg);
  process.exit(1);
}

function runDir(runId) {
  return join(EVIDENCE_ROOT, runId);
}

function loadState(runId) {
  const id = runId || (existsSync(join(EVIDENCE_ROOT, "latest")) ? readFileSync(join(EVIDENCE_ROOT, "latest"), "utf8").trim() : "");
  if (!id) fail("沒有 run。先執行 ccv.mjs launch。");
  const file = join(runDir(id), "state.json");
  if (!existsSync(file)) fail("找不到 " + file);
  return JSON.parse(readFileSync(file, "utf8"));
}

function saveState(state) {
  writeFileSync(join(state.evidenceDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

function frontApp() {
  const asn = sh("lsappinfo", ["front"], { allowFail: true });
  if (!asn) return "unknown";
  const info = sh("lsappinfo", ["info", "-only", "name", asn], { allowFail: true }) || "";
  const m = info.match(/="(.*)"/);
  return m ? m[1] : "unknown";
}

function log(state, line) {
  appendFileSync(join(state.evidenceDir, "actions.log"), now() + " " + line + " front=" + frontApp() + "\n");
}

function portFree(port) {
  return new Promise((res) => {
    const s = createServer();
    s.once("error", () => res(false));
    s.listen(port, "127.0.0.1", () => s.close(() => res(true)));
  });
}

function listenerPid(port) {
  const out = sh("lsof", ["-nP", "-tiTCP:" + port, "-sTCP:LISTEN"], { allowFail: true });
  return out ? Number(out.split("\n")[0]) : null;
}

function cmuxAppPid() {
  const bundle = process.env.CMUX_BUNDLE_ID || "com.cmuxterm.app";
  const app = (cua("list_apps", {}).apps || []).find((a) => a.bundle_id === bundle && a.running);
  if (!app) throw new Error("cmux-cua 找不到執行中的 " + bundle);
  return app.pid;
}

function windowExists(windowId) {
  return (cmuxTry("list-windows") || "").includes(windowId);
}

function workspaceTree(state) {
  return cmuxTry("tree", "--window", state.windowId) || "";
}

function serverSurface(state) {
  const lines = workspaceTree(state).split("\n");
  const start = lines.findIndex((l) => l.includes(state.serverWorkspace + " "));
  for (const l of lines.slice(start + 1)) {
    if (/workspace workspace:/.test(l)) break;
    const m = l.match(/surface (surface:\d+)/);
    if (m) return { ref: m[1], tty: (l.match(/tty=(\S+)/) || [])[1] || null };
  }
  return null;
}

function cuaWindow(state) {
  const wins = cua("list_windows", { pid: state.appPid }).windows || [];
  return wins.find((w) => w.window_id === state.cuaWindowId) || null;
}

function findRow(state, port = state.port) {
  const ws = cua("get_window_state", { pid: state.appPid, window_id: state.cuaWindowId, include_screenshot: false });
  const els = ws.elements || [];
  const i = els.findIndex((e) => e.role === "AXStaticText" && e.label === ":" + port);
  const row = i >= 0 ? els[i] : null;
  const subtitle = i >= 0 ? els.slice(i + 1).find((e) => e.role === "AXStaticText") || null : null;
  const title = els.find((e) => e.role === "AXStaticText" && e.label === "Services");
  return { row, title, subtitle };
}

const USAGE_TEXT = /^(個人 |公司 )?7d /;

function usageRows(state) {
  const ws = cua("get_window_state", { pid: state.appPid, window_id: state.cuaWindowId, include_screenshot: false });
  return (ws.elements || []).filter((e) => e.role === "AXStaticText" && USAGE_TEXT.test(e.label || "")).sort((a, b) => (a.frame?.y ?? 0) - (b.frame?.y ?? 0)).map((e) => e.label);
}

function usageRowsSafe(state) {
  try {
    return usageRows(state);
  } catch (e) {
    return ["(讀取失敗：" + e.message + ")"];
  }
}

function usageWorkspaces(state) {
  return [["server", state.serverWorkspace], ...Object.entries(state.usage?.workspaces || {})];
}

function progressLine(workspace) {
  return ((cmuxTry("sidebar-state", "--workspace", workspace) || "").match(/^progress=.*$/m) || ["(無 progress 行)"])[0];
}

function usageWorkspace(state, key) {
  state.usage = state.usage || { workspaces: {} };
  if (key === "personal") return state.serverWorkspace;
  if (state.usage.workspaces[key]) return state.usage.workspaces[key];
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-usage-" + key + "-" + state.runId).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  state.usage.workspaces[key] = ws[1];
  saveState(state);
  log(state, "new-workspace " + ws[1] + " for usage " + key);
  return ws[1];
}

function accountEnv(account) {
  const env = { ...process.env };
  delete env.CLAUDE_CONFIG_DIR;
  if (account === "work") env.CLAUDE_CONFIG_DIR = join(homedir(), ".claude-work");
  return env;
}

function usageSet(account, pct, secs) {
  const state = loadState();
  if (account !== "personal" && account !== "work") fail("用法：ccv.mjs usage-set <personal|work> <已用%> <距重置秒數>");
  if (!Number.isFinite(Number(pct)) || !Number.isInteger(Number(secs))) fail("已用% 要是數字，距重置秒數要是整數");
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  const workspace = usageWorkspace(state, account);
  const resetsAt = Math.floor(Date.now() / 1000) + Number(secs);
  const input = JSON.stringify({ rate_limits: { seven_day: { used_percentage: Number(pct), resets_at: resetsAt } } });
  const writer = join(REPO, "statusline", "report-rate-limit.mjs");
  if (!existsSync(writer)) fail("找不到 " + writer);
  execFileSync("node", [writer], { input, env: { ...accountEnv(account), CMUX_WORKSPACE_ID: workspace }, stdio: ["pipe", "ignore", "ignore"], timeout: 5000 });
  const line = progressLine(workspace);
  log(state, "usage-set " + account + " pct=" + pct + " resets_at=" + resetsAt + " workspace=" + workspace + " " + line);
  if (!line.includes("cc-cmux:7d:" + account + ":" + resetsAt + ":")) fail("寫入後 " + workspace + " 的 sidebar-state 沒有預期的 label：" + line);
  console.log("USAGE SET " + account + " workspace=" + workspace + " " + line);
}

function usageRowsCmd() {
  const state = loadState();
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  const rows = usageRows(state);
  log(state, "usage-rows " + JSON.stringify(rows));
  console.log(rows.length ? rows.join("\n") : "(面板沒有 7d 列)");
}

async function usageLive(account = "personal") {
  const state = loadState();
  if (account !== "personal" && account !== "work") fail("用法：ccv.mjs usage-live [work]");
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  const key = "live-" + account;
  if (state.usage?.workspaces?.[key]) fail("這個 run 已經有 " + key);
  const prefix = account === "work" ? "CLAUDE_CONFIG_DIR=$HOME/.claude-work " : "env -u CLAUDE_CONFIG_DIR ";
  const command = "cd " + JSON.stringify(REPO) + " && " + prefix + "claude --model haiku 'Reply with exactly OK and nothing else.'";
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-usage-" + key + "-" + state.runId, "--command", command).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  state.usage = state.usage || { workspaces: {} };
  state.usage.workspaces[key] = ws[1];
  saveState(state);
  log(state, "usage-live " + account + " workspace=" + ws[1] + " command=" + command);
  const t0 = Date.now();
  let line = "";
  let trusted = false;
  while (Date.now() - t0 < 120000) {
    const screen = cmuxTry("read-screen", "--workspace", ws[1], "--lines", "40") || "";
    if (!trusted && /❯ No, exit/.test(screen) && /Yes, I trust this folder/.test(screen)) {
      cmux("send-key", "--workspace", ws[1], "down");
      await sleep(300);
      const picked = cmuxTry("read-screen", "--workspace", ws[1], "--lines", "40") || "";
      if (!/❯ Yes, I trust this folder/.test(picked)) fail("信任對話框沒有選到 Yes, I trust this folder，不送 Enter");
      cmux("send-key", "--workspace", ws[1], "enter");
      trusted = true;
      log(state, "usage-live " + account + " 信任對話框，選 Yes, I trust this folder 後送 Enter");
    }
    line = progressLine(ws[1]);
    if (line.includes("cc-cmux:7d:")) {
      log(state, "usage-live ready " + account + " after=" + (Date.now() - t0) + "ms " + line);
      console.log("USAGE LIVE " + account + " workspace=" + ws[1] + " " + line);
      return;
    }
    await sleep(2000);
  }
  writeFileSync(join(state.evidenceDir, "usage-live-" + account + "-timeout.txt"), now() + "\n" + line + "\n\n" + (cmuxTry("read-screen", "--workspace", ws[1], "--lines", "40") || "(read-screen 失敗)") + "\n");
  log(state, "usage-live timeout " + account + " " + line);
  fail("120 秒內 " + ws[1] + " 的 sidebar-state 沒有 cc-cmux:7d: 開頭的 progress。畫面存在 usage-live-" + account + "-timeout.txt");
}

const WAIT_PROMPTS = {
  question: "Use the AskUserQuestion tool exactly once to ask me whether I prefer Red or Blue, with the two options Red and Blue. Do nothing else.",
  done: "Reply with exactly OK and nothing else.",
};

function workspaceInfo(state, ref) {
  const tree = JSON.parse(cmux("--json", "tree", "--window", state.windowId));
  for (const w of tree.windows || []) {
    for (const ws of w.workspaces || []) {
      if (ws.ref !== ref) continue;
      const surface = (ws.panes || []).flatMap((p) => p.surfaces || [])[0] || null;
      return { id: ws.id, title: ws.title, surface: surface?.ref || null, tty: surface?.tty || null, tabTitle: surface?.title || null };
    }
  }
  return null;
}

function notifications() {
  return (cmuxTry("list-notifications") || "").split("\n").filter(Boolean).map((l) => {
    const f = l.replace(/^\d+:/, "").split("|");
    return { id: f[0], workspaceId: f[1], surfaceId: f[2], state: f[3], title: f[5], body: f[6], at: f[7] };
  });
}

function runNotifications(state) {
  const ids = Object.values(state.wait || {}).map((w) => w.workspaceId).filter(Boolean);
  return notifications().filter((n) => ids.includes(n.workspaceId));
}

function claudeOnTty(tty) {
  if (!tty) return null;
  const out = sh("ps", ["-t", tty.replace(/^\/dev\//, ""), "-o", "pid=,comm="], { allowFail: true }) || "";
  const row = out.split("\n").map((l) => l.trim().split(/\s+/)).find((r) => /(^|\/)claude$/.test(r[1] || ""));
  return row ? Number(row[0]) : null;
}

async function waitStart(mode) {
  const state = loadState();
  if (!WAIT_PROMPTS[mode]) fail("用法：ccv.mjs wait-start <question|done>");
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  state.wait = state.wait || {};
  if (state.wait[mode]) fail("這個 run 已經有 wait-start " + mode);
  const command = "cd " + JSON.stringify(REPO) + " && env -u CLAUDE_CONFIG_DIR claude --model haiku '" + WAIT_PROMPTS[mode] + "'";
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-wait-" + mode + "-" + state.runId, "--focus", "false", "--command", command).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  const info = workspaceInfo(state, ws[1]);
  state.wait[mode] = { workspace: ws[1], workspaceId: info?.id, surface: info?.surface, tty: info?.tty, startedAt: Date.now() };
  saveState(state);
  log(state, "wait-start " + mode + " workspace=" + ws[1] + " command=" + command);
  const t0 = Date.now();
  let screen = "";
  while (Date.now() - t0 < 120000) {
    screen = cmuxTry("read-screen", "--workspace", ws[1], "--lines", "40") || "";
    if (!state.wait[mode].workspaceId || !state.wait[mode].tty) {
      const found = workspaceInfo(state, ws[1]);
      if (found) Object.assign(state.wait[mode], { workspaceId: found.id, surface: found.surface, tty: found.tty });
    }
    const pid = claudeOnTty(state.wait[mode].tty);
    if (pid) state.wait[mode].claudePid = pid;
    const unread = notifications().filter((n) => n.workspaceId === state.wait[mode].workspaceId && n.state === "unread");
    const ready = mode === "question" ? /❯\s*1\.\s*Red/.test(screen) && /2\.\s*Blue/.test(screen) : unread.some((n) => /^Completed/.test(n.title || ""));
    if (ready) {
      state.wait[mode].readyAt = Date.now();
      saveState(state);
      const tab = workspaceInfo(state, ws[1]);
      log(state, "wait-start " + mode + " ready after=" + (Date.now() - t0) + "ms id=" + state.wait[mode].workspaceId + " tty=" + state.wait[mode].tty + " pid=" + state.wait[mode].claudePid + " unread=" + unread.length);
      console.log("WAIT READY " + mode + " workspace=" + ws[1] + " title=" + (tab?.title || "") + " tab=" + (tab?.tabTitle || "") + " pid=" + state.wait[mode].claudePid + " unread=" + unread.length);
      return;
    }
    await sleep(2000);
  }
  saveState(state);
  writeFileSync(join(state.evidenceDir, "wait-start-" + mode + "-timeout.txt"), now() + "\n" + JSON.stringify(notifications().filter((n) => n.workspaceId === state.wait[mode].workspaceId)) + "\n\n" + screen + "\n");
  log(state, "wait-start " + mode + " timeout");
  fail("120 秒內 wait-start " + mode + " 沒有就緒。畫面存在 wait-start-" + mode + "-timeout.txt");
}

function waitRows(state) {
  const ws = cua("get_window_state", { pid: state.appPid, window_id: state.cuaWindowId, include_screenshot: false });
  const els = (ws.elements || []).filter((e) => e.role === "AXStaticText" && e.frame);
  const header = els.find((e) => e.label === "等你");
  if (!header) return [];
  const end = els.filter((e) => e.frame.x >= header.frame.x - 20).filter((e) => /^:\d+$/.test(e.label || "") || e.label === "沒有偵測到監聽中的 port").map((e) => e.frame.y).filter((y) => y > header.frame.y);
  const limit = end.length ? Math.min(...end) : Infinity;
  const below = els.filter((e) => e.frame.x >= header.frame.x - 20 && e.frame.y > header.frame.y + header.frame.h / 2 && e.frame.y < limit).sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
  const rows = [];
  for (const e of below) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - e.frame.y) < Math.max(4, e.frame.h / 2)) last.els.push(e);
    else rows.push({ y: e.frame.y, els: [e] });
  }
  return rows.map((r) => {
    const els = [...r.els].sort((a, b) => a.frame.x - b.frame.x);
    return { text: els.map((e) => e.label).join(" "), frame: els[0].frame };
  });
}

function waitRowsSafe(state) {
  try {
    return waitRows(state).map((r) => r.text);
  } catch (e) {
    return ["(讀取失敗：" + e.message + ")"];
  }
}

function waitRowsCmd() {
  const state = loadState();
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  const rows = waitRows(state).map((r) => r.text);
  log(state, "wait-rows " + JSON.stringify(rows));
  console.log(rows.length ? rows.join("\n") : "(沒有等你區)");
}

function clickRow(text) {
  const state = loadState();
  if (!text) fail("用法：ccv.mjs click-row <文字>");
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了，拒絕操作其他 window");
  cmux("focus-window", "--window", state.windowId);
  const shotFile = join(state.evidenceDir, "click-row-" + Date.now() + ".png");
  const shotWidth = Number(cmux("shot", "--window", state.windowId, "--out", shotFile).split("x")[0]);
  const w = cuaWindow(state);
  const matches = waitRows(state).filter((r) => r.text.includes(text));
  if (!w || matches.length === 0) fail("等你區沒有包含「" + text + "」的列");
  if (matches.length > 1) fail("等你區有 " + matches.length + " 列包含「" + text + "」，請給更明確的文字");
  const scale = shotWidth / w.bounds.width;
  if (!(scale >= 1 && scale <= 3) || w.bounds.height < 200) {
    log(state, "click-row refused shotWidth=" + shotWidth + " bounds=" + JSON.stringify(w.bounds));
    fail("window 大小不合理，拒絕點擊：shotWidth=" + shotWidth + " bounds=" + JSON.stringify(w.bounds));
  }
  const f = matches[0].frame;
  const x = Math.round((f.x + f.w / 2 - w.bounds.x) * scale);
  const y = Math.round((f.y + f.h / 2 - w.bounds.y) * scale);
  const result = cua("click", { pid: state.appPid, window_id: state.cuaWindowId, x, y, delivery_mode: "foreground" });
  state.lastRowClick = { text: matches[0].text, at: Date.now() };
  saveState(state);
  const selected = (cmuxTry("tree", "--window", state.windowId) || "").split("\n").filter((l) => /workspace .*\[selected\]/.test(l)).join(" ");
  log(state, "click-row " + JSON.stringify(matches[0].text) + " scale=" + scale + " frame=" + JSON.stringify(f) + " px=" + x + "," + y + " result=" + JSON.stringify(result) + " selected=" + selected + " preshot=" + shotFile);
  console.log("CLICKED ROW " + JSON.stringify(matches[0].text) + " px=" + x + "," + y + "\nSELECTED " + selected.trim());
}

const PROBE_SIDEBAR = `sidebar(() =>
  VStack({ spacing: 2 }, [
    ForEach(
      { items: () => (data.workspaces() ?? []).filter((w) => (w.agents ?? []).length).flatMap((w) => [
          { k: w.id, t: "PROBE WS " + JSON.stringify({ id: w.id, title: w.title }) },
          ...(w.agents ?? []).map((a, i) => ({ k: w.id + "a" + i, t: "PROBE AGENT " + JSON.stringify({ id: a.id, kind: a.kind, status: a.status, panelId: a.panelId, surfaceId: a.surfaceId, sinceEpoch: a.sinceEpoch, lastActivityAt: a.lastActivityAt }) })),
          ...(w.tabs ?? []).map((t, i) => ({ k: w.id + "t" + i, t: "PROBE TAB " + JSON.stringify({ id: t.id, surfaceId: t.surfaceId, title: t.title, hasUnread: t.hasUnread, focused: t.focused }) })),
        ]), key: (x) => x.k },
      (x) => Text(() => x().t).font(9)
    ),
  ])
)
`;

async function probe() {
  const state = loadState();
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  const file = join(homedir(), ".config", "cmux", "sidebars", "cc-cmux-probe.js");
  if (existsSync(file)) fail(file + " 已經存在，先確認它不是使用者的檔案");
  writeFileSync(file, PROBE_SIDEBAR);
  const lines = [];
  try {
    cmux("right-sidebar", "set", "custom", "cc-cmux-probe", "--window", state.windowId, "--no-focus");
    await sleep(2500);
    const ws = cua("get_window_state", { pid: state.appPid, window_id: state.cuaWindowId, include_screenshot: false });
    for (const e of ws.elements || []) if (/^PROBE /.test(e.label || "")) lines.push(e.label.replace(/^PROBE /, ""));
  } finally {
    cmux("right-sidebar", "set", "custom", "services", "--window", state.windowId, "--no-focus");
    rmSync(file);
  }
  writeFileSync(join(state.evidenceDir, "probe-" + Date.now() + ".txt"), now() + "\n" + lines.join("\n") + "\n");
  log(state, "probe " + lines.length + " 行");
  console.log(lines.length ? lines.join("\n") : "(沒有任何有 agent 的 workspace)");
}

function waitKill() {
  const state = loadState();
  const pid = state.wait?.question?.claudePid || state.wait?.done?.claudePid;
  if (!pid) fail("這個 run 沒有 wait-start 記錄的 Claude PID");
  const comm = sh("ps", ["-o", "comm=", "-p", String(pid)], { allowFail: true });
  if (!comm || !/(^|\/)claude$/.test(comm)) fail("PID " + pid + " 不是 claude 或已結束：" + comm);
  process.kill(pid, "SIGKILL");
  state.waitKilled = { pid, at: Date.now() };
  saveState(state);
  log(state, "wait-kill SIGKILL " + pid);
  console.log("WAIT KILLED " + pid);
}

function targetPort(state, target) {
  if (!target) return state.port;
  if (target === "bg") {
    if (!state.bg?.port) fail("這個 run 沒有背景服務。先執行 ccv.mjs bg-start");
    return state.bg.port;
  }
  if (target === "agent") {
    if (!state.agentTab?.port) fail("這個 run 沒有 agent 分頁。先執行 ccv.mjs agent-tab-start");
    return state.agentTab.port;
  }
  fail("目標只能省略，或寫 bg、agent");
}

async function agentTabStart() {
  const state = loadState();
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  if (state.agentTab) fail("這個 run 已經有 agent 分頁：port " + state.agentTab.port);
  let port = null;
  for (let p = 18750; p <= PORT_RANGE[1]; p++) {
    if (await portFree(p)) { port = p; break; }
  }
  if (!port) fail("18750-18799 沒有空的 port");
  const command = "python3 -I -m http.server " + port + " --bind 127.0.0.1 --directory " + JSON.stringify(state.dataDir) + " >/dev/null 2>&1 & cd " + JSON.stringify(REPO) + " && env -u CLAUDE_CONFIG_DIR claude --model haiku 'Reply with exactly OK and nothing else.'";
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-agenttab-" + state.runId, "--focus", "false", "--command", command).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  state.agentTab = { workspace: ws[1], port, startedAt: Date.now() };
  saveState(state);
  log(state, "agent-tab-start workspace=" + ws[1] + " port=" + port + " command=" + command);
  const t0 = Date.now();
  let missing = [];
  while (Date.now() - t0 < 120000) {
    const info = workspaceInfo(state, ws[1]);
    const serverPid = listenerPid(port);
    const claudePid = claudeOnTty(info?.tty);
    const serverTty = serverPid ? sh("ps", ["-o", "tty=", "-p", String(serverPid)], { allowFail: true }) : null;
    const ports = cmuxTry("sidebar-state", "--workspace", ws[1]) || "";
    const detected = new RegExp("^ports=.*\\b" + port + "\\b", "m").test(ports);
    const unread = info?.id ? notifications().some((n) => n.workspaceId === info.id && /^Completed/.test(n.title || "")) : false;
    missing = [!serverPid && "port LISTEN", serverPid && info?.tty && serverTty !== info.tty.replace(/^ttys/, "s") && serverTty !== info.tty && "server 在分頁的 tty 上", !claudePid && "分頁上的 claude", !detected && "sidebar-state 偵測到 port", !unread && "Claude 回合結束"].filter(Boolean);
    if (missing.length === 0) {
      Object.assign(state.agentTab, { workspaceId: info.id, surface: info.surface, tty: info.tty, serverPid, claudePid });
      saveState(state);
      log(state, "agent-tab ready port=" + port + " serverPid=" + serverPid + " claudePid=" + claudePid + " tty=" + info.tty + " after=" + (Date.now() - t0) + "ms");
      console.log("AGENT TAB READY port=" + port + " workspace=" + ws[1] + " serverPid=" + serverPid + " claudePid=" + claudePid + " tty=" + info.tty);
      return;
    }
    Object.assign(state.agentTab, { serverPid, claudePid, tty: info?.tty });
    saveState(state);
    await sleep(2000);
  }
  writeFileSync(join(state.evidenceDir, "agent-tab-start-timeout.txt"), now() + "\nmissing=" + missing.join(",") + "\n\n" + (cmuxTry("read-screen", "--workspace", ws[1], "--lines", "40") || "(read-screen 失敗)") + "\n");
  log(state, "agent-tab-start timeout missing=" + missing.join(","));
  fail("120 秒內 agent 分頁沒有就緒，缺：" + missing.join("、") + "。請執行 cleanup 後再試。");
}

async function checkLock() {
  const state = loadState();
  const at = state.agentTab;
  if (!at?.claudePid) fail("先執行 ccv.mjs agent-tab-start");
  if (!state.lastClick || state.lastClick.target !== "agent" || state.lastClick.button !== "stop") fail("先執行 ccv.mjs click stop agent");
  while (Date.now() - state.lastClick.at < 5000) await sleep(500);
  const screen = cmuxTry("read-screen", "--workspace", at.workspace, "--lines", "40") || "";
  const claudeAlive = sh("ps", ["-o", "comm=", "-p", String(at.claudePid)], { allowFail: true });
  const listening = listenerPid(at.port) === at.serverPid;
  const checks = [
    ["NO_CTRL_C", !screen.includes("^C"), "畫面" + (screen.includes("^C") ? "有" : "沒有") + " ^C"],
    ["CLAUDE_ALIVE", !!claudeAlive && /(^|\/)claude$/.test(claudeAlive), "pid " + at.claudePid + " " + (claudeAlive || "已結束")],
    ["PORT_LISTEN", listening, "port " + at.port + " listener=" + listenerPid(at.port)],
  ];
  const lines = checks.map(([n, ok, d]) => n + " " + (ok ? "PASS" : "FAIL") + " " + d);
  writeFileSync(join(state.evidenceDir, "check-lock.txt"), now() + "\n" + lines.join("\n") + "\n\n" + screen + "\n");
  log(state, "check-lock " + lines.join(" / "));
  capture("check-lock");
  console.log(lines.join("\n"));
  process.exit(checks.every((c) => c[1]) ? 0 : 1);
}

function ancestors(pid) {
  const out = [];
  let p = pid;
  for (let i = 0; i < 20 && p && p > 1; i++) {
    out.push(p);
    p = Number(sh("ps", ["-o", "ppid=", "-p", String(p)], { allowFail: true }) || 0);
  }
  return out;
}

function agentPidsInWorkspace(workspaceRef) {
  const rows = (cmuxTry("top", "--all", "--processes", "--flat", "--format", "tsv") || "").split("\n").map((l) => l.split("\t"));
  const tags = rows.filter((r) => r[3] === "tag" && r[5] === workspaceRef && /:tag:claude_code$/.test(r[4])).map((r) => r[4]);
  return rows.filter((r) => r[3] === "process" && tags.includes(r[5])).map((r) => Number(r[4]));
}

async function launch() {
  const ping = cmuxTry("ping");
  if (ping === null) fail("連不到 cmux socket。這個 skill 只能在 cmux 終端機裡執行。");
  const validate = cmuxTry("sidebar", "validate", "services");
  if (!validate || !/1 valid/.test(validate)) fail("cmux sidebar validate services 沒通過：" + validate);

  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "") + "-" + Math.random().toString(36).slice(2, 6);
  const evidenceDir = runDir(runId);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(EVIDENCE_ROOT, "latest"), runId + "\n");

  let port = null;
  for (let p = PORT_RANGE[0]; p <= PORT_RANGE[1]; p++) {
    if (await portFree(p)) { port = p; break; }
  }
  if (!port) fail("18700-18799 沒有空的 port");

  const dataDir = mkdtempSync(join(tmpdir(), "cc-cmux-verify-"));
  writeFileSync(join(dataDir, "index.html"), "cc-cmux verify " + runId + "\n");
  const windowName = "verify-cc-cmux-" + runId;
  const state = { runId, evidenceDir, dataDir, port, windowName, startedAt: now() };
  saveState(state);

  const win = cmux("new-window", "--name", windowName).match(/OK (\S+)/);
  if (!win) fail("new-window 沒回傳 window id");
  state.windowId = win[1];
  saveState(state);
  log(state, "new-window " + state.windowId);

  const serverCmd = "python3 -I -m http.server " + port + " --bind 127.0.0.1 --directory " + dataDir;
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-svc-" + runId, "--command", serverCmd).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  state.serverWorkspace = ws[1];
  saveState(state);
  log(state, "new-workspace " + state.serverWorkspace + " command=" + serverCmd);

  cmux("right-sidebar", "set", "custom", "services", "--window", state.windowId, "--no-focus");
  log(state, "right-sidebar set custom services --window " + state.windowId);

  state.appPid = cmuxAppPid();
  const wins = cua("list_windows", { pid: state.appPid }).windows || [];
  const w = wins.find((x) => x.title === windowName);
  if (!w) fail("cmux-cua 找不到標題為 " + windowName + " 的 window");
  state.cuaWindowId = w.window_id;
  saveState(state);

  let missing = [];
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < 60000; i++) {
    const surface = serverSurface(state);
    const pid = listenerPid(port);
    const ports = cmuxTry("sidebar-state", "--workspace", state.serverWorkspace) || "";
    const { row } = window_row_safe(state);
    const detected = new RegExp("^ports=.*\\b" + port + "\\b", "m").test(ports);
    missing = [!surface && "server 分頁", !pid && "port LISTEN", !detected && "cmux 偵測到 port", !row && "面板的 :" + port + " 列"].filter(Boolean);
    if (missing.length === 0) {
      state.serverSurface = surface.ref;
      state.serverTty = sh("ps", ["-o", "tty=", "-p", String(pid)], { allowFail: true });
      state.serverPid = pid;
      cmux("shot", "--window", state.windowId, "--out", join(evidenceDir, "launch.png"));
      saveState(state);
      log(state, "ready port=" + port + " pid=" + pid + " surface=" + surface.ref + " after=" + (Date.now() - t0) + "ms");
      console.log("READY run=" + runId + " port=" + port + " window=" + state.windowId + " evidence=" + evidenceDir);
      return;
    }
    if (i % 10 === 9) log(state, "waiting missing=" + missing.join(","));
    await sleep(500);
  }
  log(state, "launch timeout missing=" + missing.join(","));
  fail("60 秒內沒有就緒，缺：" + missing.join("、") + "。請執行 cleanup 後再試。run=" + runId);
}

function doctor(runId) {
  const state = loadState(runId);
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  add("cmux socket", cmuxTry("ping") !== null, cmuxTry("version") || "");
  add("window 是這個 run 開的且還在", windowExists(state.windowId), state.windowId);
  const surface = serverSurface(state);
  add("server 分頁還在", !!surface, surface ? surface.ref + " tty=" + surface.tty : "");
  const pid = listenerPid(state.port);
  const tty = pid ? sh("ps", ["-o", "tty=", "-p", String(pid)], { allowFail: true }) : null;
  add("port 由這個 run 的分頁持有", !!pid && !!tty && tty === (surface?.tty || state.serverTty), "port=" + state.port + " pid=" + pid + " tty=" + tty + " 分頁 tty=" + (surface?.tty || state.serverTty));
  const mode = cmuxTry("right-sidebar", "mode", "--window", state.windowId) || "";
  add("右側欄是 custom sidebar", /"mode":"custom-sidebar"/.test(mode) && /"visible":true/.test(mode), mode);
  const link = join(homedir(), ".config", "cmux", "sidebars", "services.js");
  const linked = existsSync(link) && lstatSync(link).isSymbolicLink() && realpathSync(link) === realpathSync(join(REPO, "sidebars", "services.js"));
  add("services.js symlink 指向這個 repo", linked, existsSync(link) && lstatSync(link).isSymbolicLink() ? readlinkSync(link) : "不是 symlink");
  const { row, title } = window_row_safe(state);
  add("面板標題 Services 可見", !!title, "");
  add("面板有 :" + state.port + " 這一列", !!row, row ? JSON.stringify(row.frame) : "");
  for (const c of checks) console.log((c.ok ? "OK   " : "FAIL ") + c.name + (c.detail ? "  " + c.detail : ""));
  console.log("INFO 前景 app  " + frontApp() + "（cmux 不在前景時，定期 agent 掃描會暫停）");
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

function window_row_safe(state, port) {
  try {
    return findRow(state, port);
  } catch {
    return { row: null, title: null };
  }
}

function click(button, target) {
  const state = loadState();
  if (!(button in BUTTON_OFFSET_FROM_RIGHT)) fail("按鈕只能是 open、focus、stop");
  const port = targetPort(state, target);
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了，拒絕操作其他 window");
  cmux("focus-window", "--window", state.windowId);
  const shotFile = join(state.evidenceDir, "click-" + button + "-" + Date.now() + ".png");
  const shotWidth = Number(cmux("shot", "--window", state.windowId, "--out", shotFile).split("x")[0]);
  const w = cuaWindow(state);
  const { row } = findRow(state, port);
  if (!w || !row) fail("面板沒有 :" + port + " 這一列");
  const scale = shotWidth / w.bounds.width;
  if (!(scale >= 1 && scale <= 3) || w.bounds.height < 200) {
    log(state, "click " + button + " refused shotWidth=" + shotWidth + " bounds=" + JSON.stringify(w.bounds));
    fail("window 大小不合理，拒絕點擊：shotWidth=" + shotWidth + " bounds=" + JSON.stringify(w.bounds));
  }
  const xPt = w.bounds.x + w.bounds.width - BUTTON_OFFSET_FROM_RIGHT[button];
  const yPt = row.frame.y + row.frame.h;
  const x = Math.round((xPt - w.bounds.x) * scale);
  const y = Math.round((yPt - w.bounds.y) * scale);
  const result = cua("click", { pid: state.appPid, window_id: state.cuaWindowId, x, y, delivery_mode: "foreground" });
  state.lastClick = { button, target: target || "server", port, at: Date.now() };
  saveState(state);
  log(state, "click " + button + " port=" + port + " shotWidth=" + shotWidth + " boundsWidth=" + w.bounds.width + " scale=" + scale + " bounds=" + JSON.stringify(w.bounds) + " row=" + JSON.stringify(row.frame) + " px=" + x + "," + y + " result=" + JSON.stringify(result) + " preshot=" + shotFile);
  console.log("CLICKED " + button + " scale=" + scale + " px=" + x + "," + y + " " + JSON.stringify(result));
}

function capture(label) {
  const state = loadState();
  if (!label) fail("用法：ccv.mjs capture <label>");
  const parts = [];
  const sec = (name, body) => parts.push("## " + name + "\n" + (body ?? "(無輸出)") + "\n");
  sec("time", now());
  sec("front app", frontApp());
  if (windowExists(state.windowId)) {
    cmux("shot", "--window", state.windowId, "--out", join(state.evidenceDir, label + ".png"));
    sec("screenshot", label + ".png");
  } else {
    sec("screenshot", "window 已關閉，沒有截圖");
  }
  sec("lsof port " + state.port, sh("lsof", ["-nP", "-iTCP:" + state.port, "-sTCP:LISTEN"], { allowFail: true }));
  sec("server pid " + state.serverPid, sh("ps", ["-o", "pid=,tty=,command=", "-p", String(state.serverPid)], { allowFail: true }));
  const sidebarState = cmuxTry("sidebar-state", "--workspace", state.serverWorkspace);
  sec("sidebar-state ports", sidebarState === null ? "(cmux sidebar-state 查詢失敗)" : sidebarState.split("\n").filter((l) => l.startsWith("ports=")).join("\n") || "(沒有 ports 欄位)");
  const { row } = window_row_safe(state);
  sec("panel row :" + state.port, row ? "present " + JSON.stringify(row.frame) : "absent");
  sec("status_count", ((cmuxTry("sidebar-state", "--workspace", state.serverWorkspace) || "").match(/^status_count=.*$/m) || ["(無)"])[0]);
  sec("usage rows", usageRowsSafe(state).join("\n") || "(面板沒有 7d 列)");
  sec("wait rows", waitRowsSafe(state).join("\n") || "(沒有等你區)");
  sec("wait notifications", runNotifications(state).map((n) => n.workspaceId + " " + n.state + " " + n.title + " " + n.at).join("\n") || "(無)");
  sec("usage progress", usageWorkspaces(state).map(([k, ws]) => k + " " + ws + " " + progressLine(ws)).join("\n"));
  if (state.bg?.ports) {
    const bgState = cmuxTry("sidebar-state", "--workspace", state.bg.workspace) || "";
    const portsLine = (bgState.match(/^ports=.*$/m) || ["(無)"])[0];
    sec("bg workspace ports", portsLine);
    sec("bg workspace status_count", (bgState.match(/^status_count=.*$/m) || ["(無)"])[0]);
    sec("bg each port", state.bg.ports.map((p) => {
      const listen = listenerPid(p);
      const inPorts = new RegExp("\\b" + p + "\\b").test(portsLine.replace(/^ports=/, ""));
      const row = window_row_safe(state, p).row;
      return ":" + p + " listen=" + (listen || "none") + " inSidebarStatePorts=" + inPorts + " panelRow=" + (row ? "present" : "absent");
    }).join("\n"));
    const top = (cmuxTry("top", "--all", "--processes", "--flat", "--format", "tsv") || "").split("\n").map((l) => l.split("\t"));
    sec("bg workspace agent tags", top.filter((r) => r[3] === "tag" && r[5] === state.bg.workspace).map((r) => r[4].replace(/^.*:tag:/, "") + " pids=" + top.filter((x) => x[5] === r[4]).map((x) => x[4]).join(",")).join("\n"));
  }
  if (state.bg?.port) {
    const bgPid = listenerPid(state.bg.port);
    sec("bg lsof port " + state.bg.port, sh("lsof", ["-nP", "-iTCP:" + state.bg.port, "-sTCP:LISTEN"], { allowFail: true }));
    sec("bg listener tty", bgPid ? sh("ps", ["-o", "pid=,ppid=,tty=", "-p", String(bgPid)], { allowFail: true }) : null);
    sec("bg agent pid " + state.bg.agentPid, sh("ps", ["-o", "pid=,tty=,comm=", "-p", String(state.bg.agentPid)], { allowFail: true }));
    const bgState = cmuxTry("sidebar-state", "--workspace", state.bg.workspace);
    sec("bg sidebar-state ports", bgState === null ? "(cmux sidebar-state 查詢失敗)" : bgState.split("\n").filter((l) => l.startsWith("ports=")).join("\n") || "(沒有 ports 欄位)");
    const bgRow = window_row_safe(state, state.bg.port);
    sec("bg panel row :" + state.bg.port, bgRow.row ? "present " + JSON.stringify(bgRow.row.frame) : "absent");
    sec("bg panel subtitle", bgRow.subtitle ? bgRow.subtitle.label : "(無)");
    sec("bg agent surface screen", state.bg.surface ? cmuxTry("read-screen", "--workspace", state.bg.workspace, "--surface", state.bg.surface, "--lines", "15") : null);
  }
  sec("list-windows", cmuxTry("list-windows"));
  sec("tree (this run's window)", workspaceTree(state));
  sec("server surface screen", state.serverSurface ? cmuxTry("read-screen", "--workspace", state.serverWorkspace, "--surface", state.serverSurface, "--lines", "15") : null);
  writeFileSync(join(state.evidenceDir, label + ".txt"), parts.join("\n"));
  log(state, "capture " + label);
  console.log("CAPTURED " + join(state.evidenceDir, label + ".txt"));
}

async function waitRow(want) {
  const state = loadState();
  if (want !== "present" && want !== "absent") fail("用法：ccv.mjs wait-row <present|absent>");
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  cmux("focus-window", "--window", state.windowId);
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < 90000; i++) {
    const { row } = window_row_safe(state);
    if ((want === "present") === !!row) {
      log(state, "wait-row " + want + " ok after " + (Date.now() - t0) + "ms");
      console.log("ROW " + want + " :" + state.port);
      return;
    }
    await sleep(500);
  }
  log(state, "wait-row " + want + " timeout");
  capture("wait-row-timeout");
  fail("90 秒內面板的 :" + state.port + " 沒有變成 " + want);
}

async function checkStop() {
  const state = loadState();
  if (!state.lastClick || state.lastClick.button !== "stop") fail("先執行 ccv.mjs click stop");
  const t0 = state.lastClick.at;
  const sec = () => ((Date.now() - t0) / 1000).toFixed(1);
  let effectAt = null;
  let panelAt = null;
  let last = {};
  while (Date.now() - t0 < 15000 && (effectAt === null || panelAt === null)) {
    const listening = listenerPid(state.port) !== null;
    const alive = sh("ps", ["-o", "pid=", "-p", String(state.serverPid)], { allowFail: true }) !== null;
    const screen = cmuxTry("read-screen", "--workspace", state.serverWorkspace, "--surface", state.serverSurface, "--lines", "15") || "";
    const { row } = window_row_safe(state);
    last = { listening, alive, ctrlC: screen.includes("^C"), row: !!row };
    if (effectAt === null && !listening && !alive && last.ctrlC) effectAt = sec();
    if (panelAt === null && !row) panelAt = sec();
    if (effectAt === null || panelAt === null) await sleep(500);
  }
  const lines = [
    "STOP_EFFECT " + (effectAt !== null ? "PASS t=" + effectAt + "s" : "FAIL 15 秒內未成立 listening=" + last.listening + " alive=" + last.alive + " ctrlC=" + last.ctrlC),
    "PANEL_UPDATE " + (panelAt !== null ? "PASS t=" + panelAt + "s" : "FAIL 15 秒內 :" + state.port + " 仍在面板上（已知問題：cmux 沒更新 port，見 features/services-stop.md 的 Gotchas）"),
  ];
  writeFileSync(join(state.evidenceDir, "check-stop.txt"), now() + "\n" + lines.join("\n") + "\n");
  log(state, "check-stop " + lines.join(" / "));
  capture("check-stop");
  console.log(lines.join("\n"));
  process.exit(effectAt !== null && panelAt !== null ? 0 : 1);
}

function claudeAncestor(pid) {
  return ancestors(pid).slice(1).find((a) => /(^|\/)claude$/.test(sh("ps", ["-o", "comm=", "-p", String(a)], { allowFail: true }) || "")) || null;
}

async function bgStartMulti(state, { withHook, count }) {
  const ports = [];
  for (let p = 18750; p <= PORT_RANGE[1] && ports.length < count; p++) {
    if (await portFree(p)) ports.push(p);
  }
  if (ports.length < count) fail("18750-18799 沒有足夠的空 port");
  if (withHook) {
    mkdirSync(join(state.dataDir, ".claude"), { recursive: true });
    const hook = { type: "command", command: "node " + JSON.stringify(join(REPO, "hooks", "register-agent.mjs")) };
    writeFileSync(join(state.dataDir, ".claude", "settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [hook] }], UserPromptSubmit: [{ hooks: [hook] }] } }, null, 2) + "\n");
  }
  const claudeCmd = (port) => "claude -p \"Use the Bash tool with run_in_background set to true to run exactly this command, with nothing added: 'python3 -I -m http.server " + port + " --bind 127.0.0.1 --directory " + state.dataDir + "' and then reply DONE\" --model haiku --allowedTools 'Bash(python3 -I -m http.server:*)'";
  const command = "cd " + state.dataDir + " && " + ports.slice(0, -1).map((p) => "{ " + claudeCmd(p) + " & } ; ").join("") + claudeCmd(ports[ports.length - 1]);
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-bg-" + state.runId, "--command", command).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  state.bg = { workspace: ws[1], port: ports[0], ports, withHook, startedAt: Date.now() };
  saveState(state);
  log(state, "bg-start multi workspace=" + ws[1] + " ports=" + ports.join(",") + " withHook=" + withHook + " command=" + command);
  const t0 = Date.now();
  let missing = [];
  while (Date.now() - t0 < 150000) {
    const found = ports.map((port) => {
      const pid = listenerPid(port);
      const tty = pid ? sh("ps", ["-o", "tty=", "-p", String(pid)], { allowFail: true }) : null;
      return { port, pid, tty, claude: pid ? claudeAncestor(pid) : null };
    });
    missing = found.flatMap((f) => [!f.pid && "port " + f.port + " LISTEN", f.pid && !f.claude && "port " + f.port + " 的 server 是 claude 的子孫", f.pid && f.tty !== "??" && "port " + f.port + " 的 server 沒有 tty"]).filter(Boolean);
    if (missing.length === 0) {
      const lines = workspaceTree(state).split("\n");
      const start = lines.findIndex((l) => l.includes(state.bg.workspace + " "));
      const surf = lines.slice(start + 1).map((l) => l.match(/surface (surface:\d+)/)).find(Boolean);
      state.bg = { ...state.bg, agentPid: found[0].claude, serverPid: found[0].pid, agentPids: found.map((f) => f.claude), serverPids: found.map((f) => f.pid), surface: surf ? surf[1] : null };
      saveState(state);
      const desc = found.map((f) => f.port + ":claude=" + f.claude + ",server=" + f.pid).join(" ");
      log(state, "bg ready multi " + desc + " after=" + (Date.now() - t0) + "ms");
      console.log("BG READY " + desc);
      return;
    }
    await sleep(2000);
  }
  log(state, "bg-start timeout missing=" + missing.join(","));
  writeFileSync(join(state.evidenceDir, "bg-start-timeout.txt"), now() + "\nmissing=" + missing.join(",") + "\n\n" + (cmuxTry("read-screen", "--workspace", state.bg.workspace, "--lines", "40") || "(read-screen 失敗)") + "\n");
  fail("150 秒內背景服務沒有就緒，缺：" + missing.join("、") + "。請執行 cleanup 後再試。");
}

async function bgKill(index) {
  const state = loadState();
  const i = Number(index) - 1;
  const agent = state.bg?.agentPids?.[i];
  const server = state.bg?.serverPids?.[i];
  if (!agent || !server) fail("用法：ccv.mjs bg-kill <編號>，編號對應 bg-start 的 port 順序，從 1 開始");
  for (const pid of [server, agent]) {
    if (sh("ps", ["-o", "pid=", "-p", String(pid)], { allowFail: true })) process.kill(pid, "SIGTERM");
  }
  state.bg.killed = [...(state.bg.killed || []), { index: i + 1, port: state.bg.ports[i], agent, server, at: Date.now() }];
  saveState(state);
  log(state, "bg-kill " + (i + 1) + " port=" + state.bg.ports[i] + " agent=" + agent + " server=" + server);
  console.log("BG KILLED port=" + state.bg.ports[i] + " agent=" + agent + " server=" + server);
}

async function bgStart(args = []) {
  const state = loadState();
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  if (state.bg) fail("這個 run 已經有背景服務：port " + state.bg.port);
  const withHook = args.includes("--with-hook");
  const ci = args.indexOf("--count");
  const count = ci >= 0 ? Number(args[ci + 1]) : 1;
  if (!(count >= 1 && count <= 4)) fail("--count 要是 1 到 4");
  if (withHook || count > 1) return bgStartMulti(state, { withHook, count });
  let port = null;
  for (let p = 18750; p <= PORT_RANGE[1]; p++) {
    if (await portFree(p)) { port = p; break; }
  }
  if (!port) fail("18750-18799 沒有空的 port");
  const prompt = "Use the Bash tool with run_in_background set to true to run exactly this command, with nothing added: 'python3 -I -m http.server " + port + " --bind 127.0.0.1 --directory " + state.dataDir + "' and then reply DONE";
  const command = "claude -p \"" + prompt + "\" --model haiku --allowedTools 'Bash(python3 -I -m http.server:*)'";
  const ws = cmux("new-workspace", "--window", state.windowId, "--name", "verify-bg-" + state.runId, "--command", command).match(/OK (workspace:\d+)/);
  if (!ws) fail("new-workspace 沒回傳 workspace ref");
  state.bg = { workspace: ws[1], port, startedAt: Date.now() };
  saveState(state);
  log(state, "bg-start workspace=" + ws[1] + " port=" + port + " command=" + command);
  const t0 = Date.now();
  let missing = [];
  while (Date.now() - t0 < 120000) {
    const agents = agentPidsInWorkspace(state.bg.workspace);
    const pid = listenerPid(port);
    const chain = pid ? ancestors(pid) : [];
    const agentPid = agents.find((a) => chain.includes(a)) || null;
    const tty = pid ? sh("ps", ["-o", "tty=", "-p", String(pid)], { allowFail: true }) : null;
    const ports = cmuxTry("sidebar-state", "--workspace", state.bg.workspace) || "";
    const detected = new RegExp("^ports=.*\\b" + port + "\\b", "m").test(ports);
    missing = [agents.length === 0 && "cmux 記錄的 agent", !pid && "port LISTEN", pid && !agentPid && "server 是 agent 的子孫", pid && tty !== "??" && "server 沒有 tty", !detected && "sidebar-state 偵測到 port"].filter(Boolean);
    if (missing.length === 0) {
      const lines = workspaceTree(state).split("\n");
      const start = lines.findIndex((l) => l.includes(state.bg.workspace + " "));
      const surf = lines.slice(start + 1).map((l) => l.match(/surface (surface:\d+)/)).find(Boolean);
      state.bg = { ...state.bg, agentPid, serverPid: pid, surface: surf ? surf[1] : null };
      saveState(state);
      log(state, "bg ready port=" + port + " agentPid=" + agentPid + " serverPid=" + pid + " after=" + (Date.now() - t0) + "ms");
      console.log("BG READY port=" + port + " agentPid=" + agentPid + " serverPid=" + pid);
      return;
    }
    await sleep(2000);
  }
  log(state, "bg-start timeout missing=" + missing.join(","));
  writeFileSync(join(state.evidenceDir, "bg-start-timeout.txt"), now() + "\nmissing=" + missing.join(",") + "\n\n" + (cmuxTry("read-screen", "--workspace", state.bg.workspace, "--lines", "40") || "(read-screen 失敗)") + "\n");
  fail("120 秒內背景服務沒有就緒，缺：" + missing.join("、") + "。請執行 cleanup 後再試。");
}

async function cleanup(runId) {
  const state = loadState(runId);
  const lines = [];
  if (state.windowId && windowExists(state.windowId)) {
    cmux("close-window", "--window", state.windowId, "--force");
    lines.push("close-window --force " + state.windowId + "（這個 run 開的 window）");
  } else {
    lines.push("window 已不在，沒有關閉任何 window");
  }
  for (let i = 0; i < 20 && listenerPid(state.port) === state.serverPid && state.serverPid; i++) await sleep(250);
  if (state.serverPid && listenerPid(state.port) === state.serverPid) {
    process.kill(state.serverPid, "SIGTERM");
    lines.push("SIGTERM " + state.serverPid + "（這個 run 啟動的 server）");
  }
  for (const [name, pid] of [["agent 分頁的 server", state.agentTab?.serverPid], ["agent 分頁的 claude", state.agentTab?.claudePid]]) {
    if (!pid) continue;
    for (let i = 0; i < 20 && sh("ps", ["-o", "pid=", "-p", String(pid)], { allowFail: true }); i++) await sleep(250);
    if (sh("ps", ["-o", "pid=", "-p", String(pid)], { allowFail: true })) {
      process.kill(pid, "SIGTERM");
      lines.push("SIGTERM " + pid + "（這個 run 啟動的 " + name + "）");
    } else {
      lines.push(name + " " + pid + " 已結束");
    }
  }
  const bgPids = [...(state.bg?.serverPids || [state.bg?.serverPid]).map((p) => ["bg server", p]), ...(state.bg?.agentPids || [state.bg?.agentPid]).map((p) => ["agent", p])];
  for (const [name, pid] of bgPids) {
    if (!pid) continue;
    for (let i = 0; i < 20 && sh("ps", ["-o", "pid=", "-p", String(pid)], { allowFail: true }); i++) await sleep(250);
    if (sh("ps", ["-o", "pid=", "-p", String(pid)], { allowFail: true })) {
      process.kill(pid, "SIGTERM");
      lines.push("SIGTERM " + pid + "（這個 run 啟動的 " + name + "）");
    } else {
      lines.push(name + " " + pid + " 已結束");
    }
  }
  if (state.dataDir && state.dataDir.startsWith(tmpdir()) && existsSync(state.dataDir)) {
    rmSync(state.dataDir, { recursive: true });
    lines.push("rm " + state.dataDir);
  }
  lines.push("port " + state.port + (listenerPid(state.port) ? " 仍被佔用 pid=" + listenerPid(state.port) : " 已釋放"));
  lines.push("evidence 保留在 " + state.evidenceDir);
  writeFileSync(join(state.evidenceDir, "cleanup.txt"), now() + "\n" + lines.join("\n") + "\n");
  log(state, "cleanup");
  console.log(lines.join("\n"));
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = { launch, doctor: () => doctor(rest[0]), click: () => click(rest[0], rest[1]), "bg-start": () => bgStart(rest), "bg-kill": () => bgKill(rest[0]), capture: () => capture(rest[0]), "wait-row": () => waitRow(rest[0]), "check-stop": checkStop, "usage-set": () => usageSet(rest[0], rest[1], rest[2]), "usage-rows": usageRowsCmd, "wait-start": () => waitStart(rest[0]), "wait-rows": waitRowsCmd, "click-row": () => clickRow(rest.join(" ")), "wait-kill": waitKill, probe, "agent-tab-start": agentTabStart, "check-lock": checkLock, "usage-live": () => usageLive(rest[0] === "work" ? "work" : rest[0] === undefined ? "personal" : rest[0]), cleanup: () => cleanup(rest[0]) };
if (!commands[cmd]) {
  console.error("用法：ccv.mjs <launch|doctor [run]|click <open|focus|stop> [bg|agent]|bg-start [--with-hook] [--count N]|bg-kill <編號>|capture <label>|wait-row <present|absent>|check-stop|usage-set <personal|work> <已用%> <距重置秒數>|usage-rows|usage-live [work]|wait-start <question|done>|wait-rows|click-row <文字>|wait-kill|probe|agent-tab-start|check-lock|cleanup [run]>");
  process.exit(2);
}
try {
  await commands[cmd]();
} catch (e) {
  fail(e.message);
}
