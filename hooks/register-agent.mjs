export function buildPayload(env, ppid) {
  if (!env.CMUX_SOCKET_PATH || !env.CMUX_SURFACE_ID || env.CMUX_CLAUDE_HOOKS_DISABLED === "1") return null;
  return "set_agent_pid cc-cmux.claude." + ppid + " " + ppid + " --tab=" + env.CMUX_TAB_ID;
}
