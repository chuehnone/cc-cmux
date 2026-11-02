import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEW_TYPES = ["Text", "Image", "VStack", "HStack", "ZStack", "Spacer", "Divider", "Circle", "Rectangle", "ForEach", "Group"];

function makeView(type, args) {
  const node = { type, args, mods: [], action: null };
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "symbol") return undefined;
      return (...modArgs) => {
        if (prop === "onTap") target.action = modArgs[0];
        else target.mods.push({ name: prop, args: modArgs });
        return proxy;
      };
    },
  };
  const proxy = new Proxy(node, handler);
  return proxy;
}

const resolve = (v) => (typeof v === "function" ? v() : v);

function render(node) {
  if (node === null || node === undefined) return null;
  if (node.type === "ForEach") {
    const [opts, build] = node.args;
    const items = resolve(opts.items) ?? [];
    return items.map((item) => render(build(() => item)));
  }
  const out = { type: node.type, action: node.action };
  if (node.type === "Text" || node.type === "Image") out.value = resolve(node.args[0]);
  const children = node.args.find((a) => Array.isArray(a));
  if (children) out.children = children.flatMap((c) => {
    const r = render(c);
    return Array.isArray(r) ? r : [r];
  });
  for (const m of node.mods) {
    if (["fill", "color"].includes(m.name)) out[m.name] = resolve(m.args[0]);
  }
  return out;
}

function walk(tree, visit) {
  visit(tree);
  for (const c of tree.children ?? []) walk(c, visit);
}

export function loadSidebar(name, { workspaces = [], clock = { epoch: 0 } } = {}) {
  const calls = [];
  let builder = null;
  const context = {
    data: { workspaces: () => workspaces, clock: () => clock },
    sidebar: (b) => { builder = b; },
    cmux: (method, params) => { calls.push({ fn: "cmux", method, params: JSON.parse(JSON.stringify(params)) }); },
    openURL: (url) => { calls.push({ fn: "openURL", url }); },
    log: (message) => { calls.push({ fn: "log", message }); },
  };
  for (const t of VIEW_TYPES) context[t] = (...args) => makeView(t, args);
  vm.createContext(context);
  vm.runInContext(readFileSync(join(ROOT, "sidebars", name + ".js"), "utf8"), context, { filename: name + ".js" });
  if (!builder) throw new Error(name + ".js 沒有呼叫 sidebar()");

  const view = () => render(builder());
  const texts = () => {
    const out = [];
    walk(view(), (n) => { if (n.type === "Text") out.push(n.value); });
    return out;
  };
  const rows = () => {
    const out = [];
    walk(view(), (n) => {
      if (n.type !== "HStack") return;
      const label = [];
      walk(n, (c) => { if (c.type === "Text" && /^:\d+$/.test(c.value)) label.push(c.value); });
      if (label.length !== 1) return;
      const all = [];
      walk(n, (c) => all.push(c));
      out.push({
        port: Number(label[0].slice(1)),
        dot: all.find((c) => c.type === "Circle")?.fill,
        texts: all.filter((c) => c.type === "Text").map((c) => c.value),
        buttons: all.filter((c) => c.type === "Image" && c.action).map((c) => ({ symbol: c.value, color: c.color, tap: c.action })),
      });
    });
    return out;
  };
  const usage = () => {
    const out = [];
    walk(view(), (n) => { if (n.type === "Text" && /^(個人 |公司 )?7d /.test(n.value ?? "")) out.push({ text: n.value, color: n.color }); });
    return out;
  };
  const tap = (port, symbol) => {
    const row = rows().find((r) => r.port === port);
    if (!row) throw new Error("面板沒有 :" + port + " 這一列");
    const button = row.buttons.find((b) => b.symbol === symbol);
    if (!button) throw new Error(":" + port + " 這一列沒有 " + symbol + " 按鈕，現有：" + row.buttons.map((b) => b.symbol).join(", "));
    button.tap();
    return calls;
  };
  return { view, texts, rows, usage, tap, calls };
}
