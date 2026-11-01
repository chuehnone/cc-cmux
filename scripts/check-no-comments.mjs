import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^", ""]);
const REGEX_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

export function findComments(src) {
  const hits = [];
  let i = 0;
  let line = 1;
  let prev = "";
  let word = "";
  const templateDepth = [];
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") line++;
      i++;
    }
  };
  const regexAllowed = () => REGEX_PREV.has(prev) || REGEX_KEYWORDS.has(word);
  const skipString = (q) => {
    advance();
    while (i < src.length && src[i] !== q) {
      if (src[i] === "\\") advance();
      advance();
    }
    advance();
  };
  const skipTemplate = () => {
    while (i < src.length) {
      if (src[i] === "\\") { advance(2); continue; }
      if (src[i] === "`") { advance(); return "end"; }
      if (src[i] === "$" && src[i + 1] === "{") { advance(2); return "expr"; }
      advance();
    }
    return "end";
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (i === 0 && c === "#" && n === "!") {
      while (i < src.length && src[i] !== "\n") advance();
      continue;
    }
    if (/\s/.test(c)) { advance(); continue; }
    if (c === "/" && n === "/") {
      hits.push(line);
      while (i < src.length && src[i] !== "\n") advance();
      continue;
    }
    if (c === "/" && n === "*") {
      hits.push(line);
      advance(2);
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) advance();
      advance(2);
      continue;
    }
    if (c === '"' || c === "'") { skipString(c); prev = "str"; word = ""; continue; }
    if (c === "`") {
      advance();
      if (skipTemplate() === "expr") templateDepth.push(0);
      prev = "str"; word = "";
      continue;
    }
    if (c === "/" && regexAllowed()) {
      advance();
      let inClass = false;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\") { advance(2); continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        advance();
      }
      advance();
      while (/[a-z]/i.test(src[i] ?? "")) advance();
      prev = "re"; word = "";
      continue;
    }
    if (templateDepth.length) {
      if (c === "{") templateDepth[templateDepth.length - 1]++;
      if (c === "}") {
        if (templateDepth[templateDepth.length - 1] === 0) {
          templateDepth.pop();
          advance();
          if (skipTemplate() === "expr") templateDepth.push(0);
          prev = "str"; word = "";
          continue;
        }
        templateDepth[templateDepth.length - 1]--;
      }
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let w = "";
      while (/[A-Za-z0-9_$]/.test(src[i] ?? "")) { w += src[i]; advance(); }
      word = w; prev = "id";
      continue;
    }
    prev = c; word = "";
    advance();
  }
  return [...new Set(hits)];
}

const CODE_FILE = /\.(js|mjs|cjs|ts)$/;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const args = process.argv.slice(2);
const staged = args[0] === "--staged";
const files = (staged
  ? git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0")
  : args.length ? args : git("ls-files", "-z").split("\0")
).filter((f) => CODE_FILE.test(f));

let bad = 0;
for (const f of files) {
  const src = staged ? git("show", ":" + f) : readFileSync(f, "utf8");
  const lines = findComments(src);
  if (lines.length) {
    bad++;
    console.error(f + ": 第 " + lines.join(", ") + " 行有註解。");
  }
}
if (bad) {
  console.error("這個 repo 的程式不放註解。刪掉註解；要說明用途或理由時，寫進 README。");
  process.exit(1);
}
