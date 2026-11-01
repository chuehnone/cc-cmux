export function buildPayload(env, ppid) {
  if (!env.CMUX_SOCKET_PATH || !env.CMUX_SURFACE_ID) return null;
  return "set_agent_pid cc-cmux.claude." + ppid + " " + ppid + " --tab=" + env.CMUX_TAB_ID;
}
