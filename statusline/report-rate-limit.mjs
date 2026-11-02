import { execFile } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", () => {
  const seven = JSON.parse(input).rate_limits?.seven_day;
  if (!seven || !process.env.CMUX_WORKSPACE_ID) process.exit(0);
  const account = (process.env.CLAUDE_CONFIG_DIR || "").replace(/\/+$/, "").endsWith(".claude-work") ? "work" : "personal";
  const label = ["cc-cmux", "7d", account, seven.resets_at, Math.floor(Date.now() / 1000)].join(":");
  execFile("cmux", ["set-progress", String(seven.used_percentage / 100), "--label", label, "--workspace", process.env.CMUX_WORKSPACE_ID], () => process.exit(0));
});
