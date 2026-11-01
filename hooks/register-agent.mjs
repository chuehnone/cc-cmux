export function buildPayload(env, ppid) {
  if (!env.CMUX_SOCKET_PATH || !env.CMUX_SURFACE_ID || !env.CMUX_TAB_ID || env.CMUX_CLAUDE_HOOKS_DISABLED === "1") return null;
  const pid = env.CMUX_CLAUDE_PID || ppid;
  const command = "set_agent_pid cc-cmux.claude." + pid + " " + pid + " --tab=" + env.CMUX_TAB_ID;
  return env.CMUX_SOCKET_CAPABILITY ? "_cmux_capability_v1 " + env.CMUX_SOCKET_CAPABILITY + " " + command : command;
}
