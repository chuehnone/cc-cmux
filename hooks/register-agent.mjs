export function buildPayload(env, ppid) {
  if (!env.CMUX_SOCKET_PATH || !env.CMUX_SURFACE_ID || !env.CMUX_TAB_ID || env.CMUX_CLAUDE_HOOKS_DISABLED === "1") return null;
  const pid = env.CMUX_CLAUDE_PID || ppid;
  return "set_agent_pid cc-cmux.claude." + pid + " " + pid + " --tab=" + env.CMUX_TAB_ID;
}
