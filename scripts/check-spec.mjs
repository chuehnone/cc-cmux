import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const TEMPLATE = join(ROOT, ".claude/skills/plan-cc-cmux/spec-template.md");
const MUST_BE_EMPTY = "未決問題";
const DATA_FLOW = "資料流範例";
const NUMBER_SOURCE = "數字的來源";

const sections = (src) => {
  const out = new Map();
  let current = null;
  for (const line of src.split("\n")) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) {
      current = m[1];
      out.set(current, []);
    } else if (current) {
      out.get(current).push(line);
    }
  }
  return out;
};

export function checkSpec(src, template) {
  const placeholders = new Set(template.split("\n").map((l) => l.trim()).filter((l) => /<[^<>]+>/.test(l)));
  const required = [...sections(template).keys()];
  const got = sections(src);
  const errors = [];
  for (const name of required) {
    if (!got.has(name)) {
      errors.push("缺少「## " + name + "」");
      continue;
    }
    const body = got.get(name).join("\n").trim();
    if (name === MUST_BE_EMPTY && body) errors.push("「## " + name + "」要是空的");
    if (name !== MUST_BE_EMPTY && !body) errors.push("「## " + name + "」是空的");
    if (got.get(name).some((l) => placeholders.has(l.trim()))) errors.push("「## " + name + "」還有沒改過的模板文字");
    if (name === DATA_FLOW && !body.startsWith("不適用")) {
      const lines = got.get(name);
      const at = lines.findIndex((l) => l.trim() === "### " + NUMBER_SOURCE);
      if (at < 0) errors.push("「## " + name + "」缺少「### " + NUMBER_SOURCE + "」");
      else if (!lines.slice(at + 1).some((l) => l.trim().startsWith("```"))) errors.push("「### " + NUMBER_SOURCE + "」沒有程式碼區塊，寫出算出數字的指令");
    }
  }
  return errors;
}

const staged = process.argv.includes("--staged");
const files = (staged
  ? execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], { encoding: "utf8", cwd: ROOT })
  : execFileSync("git", ["ls-files", "specs"], { encoding: "utf8", cwd: ROOT })
).split("\n").filter((f) => /^specs\/[^/]+\.md$/.test(f));

if (import.meta.url === "file://" + process.argv[1]) {
  const template = readFileSync(TEMPLATE, "utf8");
  let failed = false;
  for (const f of files) {
    const src = staged ? execFileSync("git", ["show", ":" + f], { encoding: "utf8", cwd: ROOT }) : readFileSync(join(ROOT, f), "utf8");
    for (const e of checkSpec(src, template)) {
      console.error(f + "：" + e);
      failed = true;
    }
  }
  if (failed) {
    console.error("spec 要照 .claude/skills/plan-cc-cmux/spec-template.md 的每一節填寫。");
    process.exit(1);
  }
}
