import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

export function buildPayload(env, ppid) {
  if (!env.CMUX_SOCKET_PATH || !env.CMUX_SURFACE_ID || !env.CMUX_TAB_ID || env.CMUX_CLAUDE_HOOKS_DISABLED === "1") return null;
  const pid = env.CMUX_CLAUDE_PID || ppid;
  const command = "set_agent_pid cc-cmux.claude." + pid + " " + pid + " --tab=" + env.CMUX_TAB_ID;
  return env.CMUX_SOCKET_CAPABILITY ? "_cmux_capability_v1 " + env.CMUX_SOCKET_CAPABILITY + " " + command : command;
}

function send(path, payload) {
  const finish = () => process.exit(0);
  setTimeout(finish, 1000);
  const socket = createConnection(path);
  socket.on("connect", () => socket.end(payload + "\n"));
  socket.on("error", finish);
  socket.on("close", finish);
  socket.resume();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdin.resume();
  process.stdin.on("end", () => {
    const payload = buildPayload(process.env, process.ppid);
    if (!payload) process.exit(0);
    send(process.env.CMUX_SOCKET_PATH, payload);
  });
}
