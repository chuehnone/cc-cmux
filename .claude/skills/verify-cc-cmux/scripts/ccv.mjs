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

function log(state, line) {
  appendFileSync(join(state.evidenceDir, "actions.log"), now() + " " + line + "\n");
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

function targetPort(state, target) {
  if (!target) return state.port;
  if (target === "bg") {
    if (!state.bg?.port) fail("這個 run 沒有背景服務。先執行 ccv.mjs bg-start");
    return state.bg.port;
  }
  fail("目標只能省略或寫 bg");
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

async function bgStart() {
  const state = loadState();
  if (!windowExists(state.windowId)) fail("這個 run 的 window 不在了");
  if (state.bg) fail("這個 run 已經有背景服務：port " + state.bg.port);
  let port = null;
  for (let p = 18750; p <= PORT_RANGE[1]; p++) {
    if (await portFree(p)) { port = p; break; }
  }
  if (!port) fail("18750-18799 沒有空的 port");
  const prompt = "Use the Bash tool with run_in_background set to true to run exactly: python3 -I -m http.server " + port + " --bind 127.0.0.1 --directory " + state.dataDir + " . Then reply DONE.";
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
  for (const [name, pid] of [["agent", state.bg?.agentPid], ["bg server", state.bg?.serverPid]]) {
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
const commands = { launch, doctor: () => doctor(rest[0]), click: () => click(rest[0], rest[1]), "bg-start": bgStart, capture: () => capture(rest[0]), "wait-row": () => waitRow(rest[0]), "check-stop": checkStop, cleanup: () => cleanup(rest[0]) };
if (!commands[cmd]) {
  console.error("用法：ccv.mjs <launch|doctor [run]|click <open|focus|stop> [bg]|bg-start|capture <label>|wait-row <present|absent>|check-stop|cleanup [run]>");
  process.exit(2);
}
try {
  await commands[cmd]();
} catch (e) {
  fail(e.message);
}
