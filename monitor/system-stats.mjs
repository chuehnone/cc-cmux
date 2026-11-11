import { execFile } from "node:child_process";
import { cpus, totalmem } from "node:os";

const workspace = process.env.CMUX_WORKSPACE_ID;
if (!workspace) {
  console.error("system-stats：沒有 CMUX_WORKSPACE_ID。請在 cmux 的分頁裡執行。");
  process.exit(1);
}

const INTERVAL_MS = Number(process.env.CC_CMUX_SYS_INTERVAL_MS) || 10000;
const FIRST_MS = Number(process.env.CC_CMUX_SYS_FIRST_MS) || 1000;
const TIMEOUT_MS = Number(process.env.CC_CMUX_SYS_TIMEOUT_MS) || 1000;
const GiB = 1024 ** 3;

const run = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, encoding: "utf8" }, (err, stdout) => resolve(err ? null : stdout));
  });

const cpuTimes = () => {
  let idle = 0;
  let total = 0;
  for (const c of cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
};

const usedGiB = (out) => {
  const page = Number((out.match(/page size of (\d+) bytes/) || [])[1]);
  const pages = (name) => Number((out.match(new RegExp(name + ":\\s+(\\d+)")) || [])[1]);
  const n = pages("Anonymous pages") - pages("Pages purgeable") + pages("Pages wired down") + pages("Pages occupied by compressor");
  return Number.isFinite(page * n) ? (page * n) / GiB : null;
};

let last = cpuTimes();
let stopping = false;

const tick = async () => {
  const now = cpuTimes();
  const dTotal = now.total - last.total;
  const cpu = dTotal > 0 ? ((dTotal - (now.idle - last.idle)) / dTotal) * 100 : 0;
  last = now;
  const out = await run("vm_stat", []);
  const used = out === null ? null : usedGiB(out);
  if (used === null || stopping) return;
  const total = totalmem() / GiB;
  const label = ["cc-cmux", "sys", Math.floor(Date.now() / 1000), cpu.toFixed(1), used.toFixed(2), total.toFixed(2)].join(":");
  const value = Math.min(1, Math.max(0, used / total)).toFixed(4);
  await run("cmux", ["set-progress", value, "--label", label, "--workspace", workspace]);
  console.log("CPU " + Math.round(cpu) + "% · 記憶體 " + used.toFixed(1) + " / " + Math.round(total) + " GB");
};

let timer = setTimeout(async function loop() {
  await tick();
  if (!stopping) timer = setTimeout(loop, INTERVAL_MS);
}, FIRST_MS);

const stop = async () => {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  await run("cmux", ["clear-progress", "--workspace", workspace]);
  process.exit(0);
};

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, stop);
