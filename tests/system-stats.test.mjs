import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir, totalmem } from "node:os";
import { join } from "node:path";

const MONITOR = new URL("../monitor/system-stats.mjs", import.meta.url).pathname;

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                    59100.
Pages active:                                1217296.
Pages inactive:                              1212239.
Pages wired down:                             260475.
Pages purgeable:                                9515.
File-backed pages:                            817307.
Anonymous pages:                             1614155.
Pages stored in compressor:                   827249.
Pages occupied by compressor:                 339368.
`;

function fakeBin({ cmuxBody = "", vmStat = "printf '%s' " + JSON.stringify(VM_STAT) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cc-cmux-sys-"));
  const log = join(dir, "calls.txt");
  writeFileSync(join(dir, "cmux"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> " + JSON.stringify(log) + "\n" + cmuxBody);
  writeFileSync(join(dir, "vm_stat"), "#!/bin/sh\n" + vmStat + "\n");
  chmodSync(join(dir, "cmux"), 0o755);
  chmodSync(join(dir, "vm_stat"), 0o755);
  return { dir, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : []) };
}

function run(fake, env, { stopAfter = 1600, signal = "SIGINT" } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MONITOR], { env: { PATH: fake.dir + ":/usr/bin:/bin", CC_CMUX_SYS_INTERVAL_MS: "400", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const stopper = stopAfter === null ? null : setTimeout(() => child.kill(signal), stopAfter);
    const killer = setTimeout(() => child.kill("SIGKILL"), stopAfter === null ? 4000 : stopAfter + 4000);
    child.on("close", (code) => { clearTimeout(stopper); clearTimeout(killer); resolve({ code, stdout, stderr }); });
  });
}

const GiB = 1024 ** 3;
const setCalls = (calls) => calls.filter((c) => c.startsWith("set-progress "));

test("監控程式從 vm_stat 算出已用記憶體，寫進自己 workspace 的 progress", { timeout: 8000 }, async () => {
  const fake = fakeBin();
  const before = Math.floor(Date.now() / 1000);
  await run(fake, { CMUX_WORKSPACE_ID: "W1" });
  const sets = setCalls(fake.calls());
  assert.ok(sets.length >= 1, "沒有呼叫 set-progress：" + fake.calls().join(" | "));
  const m = sets[0].match(/^set-progress (\S+) --label cc-cmux:sys:(\d+):([\d.]+):([\d.]+):([\d.]+) --workspace W1$/);
  assert.ok(m, "格式不對：" + sets[0]);
  const [, value, writtenAt, cpu, used, total] = m;
  assert.ok(Number(writtenAt) >= before && Number(writtenAt) <= before + 5);
  assert.ok(Number(cpu) >= 0 && Number(cpu) <= 100);
  assert.equal(used, "33.64");
  assert.equal(total, (totalmem() / GiB).toFixed(2));
  assert.ok(Number(value) >= 0 && Number(value) <= 1);
  assert.ok(Math.abs(Number(value) - Number(used) / Number(total)) < 0.001);
});

test("第一次寫入在啟動後約 1 秒內，之後照間隔繼續寫", { timeout: 8000 }, async () => {
  const fake = fakeBin();
  await run(fake, { CMUX_WORKSPACE_ID: "W1" }, { stopAfter: 2200 });
  assert.ok(setCalls(fake.calls()).length >= 2, "只寫了 " + setCalls(fake.calls()).length + " 次");
});

test("沒有 CMUX_WORKSPACE_ID 時不呼叫 cmux，exit 1", { timeout: 8000 }, async () => {
  const fake = fakeBin();
  const r = await run(fake, {}, { stopAfter: null });
  assert.equal(r.code, 1);
  assert.notEqual(r.stderr, "");
  assert.deepEqual(fake.calls(), []);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  test("收到 " + signal + " 時先 clear-progress 再結束", { timeout: 8000 }, async () => {
    const fake = fakeBin();
    const r = await run(fake, { CMUX_WORKSPACE_ID: "W1" }, { signal });
    const calls = fake.calls();
    assert.equal(calls.at(-1), "clear-progress --workspace W1");
    assert.equal(r.code, 0);
  });
}

test("cmux 卡住時不會卡住監控程式，下一輪還會再呼叫", { timeout: 10000 }, async () => {
  const fake = fakeBin({ cmuxBody: "sleep 30" });
  await run(fake, { CMUX_WORKSPACE_ID: "W1" }, { stopAfter: 3200 });
  assert.ok(setCalls(fake.calls()).length >= 2, "只呼叫了 " + setCalls(fake.calls()).length + " 次");
});

test("vm_stat 失敗時這一輪不寫，程式不結束", { timeout: 8000 }, async () => {
  const fake = fakeBin({ vmStat: "exit 1" });
  const r = await run(fake, { CMUX_WORKSPACE_ID: "W1" });
  assert.deepEqual(setCalls(fake.calls()), []);
  assert.equal(fake.calls().at(-1), "clear-progress --workspace W1");
  assert.equal(r.code, 0);
});

test("每次寫入後在 stdout 印一行目前的數字", { timeout: 8000 }, async () => {
  const fake = fakeBin();
  const r = await run(fake, { CMUX_WORKSPACE_ID: "W1" });
  assert.match(r.stdout, /CPU \d+% · 記憶體 33\.6 \/ \d+ GB/);
});

test("設 CC_CMUX_SYS_FIRST_MS=50 時，啟動後 0.5 秒內第一次寫入", { timeout: 8000 }, async () => {
  const fake = fakeBin();
  await run(fake, { CMUX_WORKSPACE_ID: "W1", CC_CMUX_SYS_FIRST_MS: "50" }, { stopAfter: 500 });
  assert.ok(setCalls(fake.calls()).length >= 1, "0.5 秒內沒有寫入：" + fake.calls().join(" | "));
});
