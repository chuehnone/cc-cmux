const rows = () => {
  const out = [];
  for (const w of data.workspaces() ?? []) {
    const agentSurfaces = new Set((w.agents ?? []).map((a) => a.surfaceId).filter(Boolean));
    for (const t of w.tabs ?? []) {
      for (const p of t.ports ?? []) {
        out.push({
          key: w.id + ":" + t.id + ":" + p,
          port: p,
          workspaceId: w.id,
          workspaceTitle: w.title,
          tabTitle: t.title,
          surfaceId: t.surfaceId,
          hasAgent: agentSurfaces.has(t.surfaceId),
        });
      }
    }
    const tabPorts = new Set((w.tabs ?? []).flatMap((t) => t.ports ?? []));
    const agents = w.agents ?? [];
    const soleAgentSurface = agents.length === 1 ? agents[0].surfaceId : undefined;
    for (const p of new Set(w.ports ?? [])) {
      if (tabPorts.has(p)) continue;
      out.push({
        key: w.id + ":bg:" + p,
        port: p,
        workspaceId: w.id,
        workspaceTitle: w.title,
        tabTitle: "背景",
        surfaceId: soleAgentSurface,
        hasAgent: true,
        background: true,
      });
    }
  }
  return out.sort((a, b) => a.port - b.port).slice(0, 50);
};

const ACCOUNT_NAMES = { personal: "個人", work: "公司" };

const formatLeft = (left) => {
  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  if (days >= 1) return days + " 天 " + hours + " 小時";
  if (hours >= 1) return hours + " 小時 " + minutes + " 分";
  return minutes + " 分";
};

const usageRows = () => {
  const latest = {};
  for (const w of data.workspaces() ?? []) {
    const parts = (w.progress?.label ?? "").split(":");
    if (parts.length !== 6 || parts[0] !== "cc-cmux" || parts[1] !== "7d") continue;
    const [, , account, resetsAt, writtenAt, pct] = parts;
    if (![resetsAt, writtenAt, pct].every((n) => n !== "" && Number.isFinite(Number(n)))) continue;
    if (latest[account] && latest[account].writtenAt >= Number(writtenAt)) continue;
    latest[account] = { account, resetsAt: Number(resetsAt), writtenAt: Number(writtenAt), pct: Number(pct) };
  }
  const now = data.clock()?.epoch ?? 0;
  const found = Object.keys(ACCOUNT_NAMES).filter((a) => latest[a]).map((a) => latest[a]);
  if (found.length === 0) return [{ account: "none", text: "7d 無資料", color: "tertiary" }];
  return found.map((u) => {
    if (u.resetsAt <= now) return { account: u.account, text: ACCOUNT_NAMES[u.account] + " 7d 已重置，等待更新", color: "secondary" };
    const pct = Math.round(u.pct);
    return {
      account: u.account,
      text: ACCOUNT_NAMES[u.account] + " 7d 剩 " + formatLeft(u.resetsAt - now) + " · 已用 " + pct + "%",
      color: pct >= 85 ? "#FF453A" : "secondary",
    };
  });
};

const formatWait = (sec) => {
  if (!(sec >= 60)) return "剛剛";
  if (sec < 3600) return Math.floor(sec / 60) + " 分";
  if (sec < 86400) return Math.floor(sec / 3600) + " 小時";
  return Math.floor(sec / 86400) + " 天";
};

const waitingItems = () => {
  const now = data.clock()?.epoch ?? 0;
  const out = [];
  for (const w of data.workspaces() ?? []) {
    const tabs = {};
    for (const t of w.tabs ?? []) tabs[t.id] = t;
    const latest = {};
    for (const a of w.agents ?? []) {
      if (a.status === "ended") continue;
      const k = a.panelId ?? "id:" + a.id;
      if (!latest[k] || latest[k].lastActivityAt < a.lastActivityAt) latest[k] = a;
    }
    for (const a of Object.values(latest)) {
      const tab = tabs[a.panelId];
      const question = a.status === "needs_input";
      const done = a.status === "idle" && tab?.hasUnread === true;
      if (!question && !done) continue;
      const since = question ? a.sinceEpoch ?? a.lastActivityAt : a.lastActivityAt;
      out.push({
        key: "row:" + a.id,
        kind: "row",
        rank: question ? 0 : 1,
        workspaceId: w.id,
        surfaceId: tab?.surfaceId,
        since,
        text: w.title + " · " + (tab ? tab.title : "分頁不明"),
        label: question ? "問題" : "跑完",
        dot: question ? "#FF9F0A" : "#0A84FF",
        wait: formatWait(now - since),
      });
    }
  }
  out.sort((x, y) => x.rank - y.rank || x.since - y.since);
  if (out.length === 0) return out;
  const shown = out.slice(0, 10);
  const more = out.length > 10 ? [{ key: "more", kind: "more", text: "還有 " + (out.length - 10) + " 個" }] : [];
  return [{ key: "header", kind: "header" }, ...shown, ...more];
};

function iconButton(symbol, color, action) {
  return Image(symbol).font(11).color(color)
    .paddingHorizontal(5).paddingVertical(3)
    .cornerRadius(5)
    .hoverBackground("#7f7f7f33")
    .onTap(action);
}

sidebar(() =>
  VStack({ spacing: 8 }, [
    HStack({ spacing: 6 }, [
      Text("Services").font(15).weight("semibold"),
      Spacer(),
      Text(() => String(rows().length)).font(11).color("tertiary"),
    ]).paddingHorizontal(10).paddingVertical(6),
    ForEach(
      { items: usageRows, key: (u) => u.account },
      (u) => Text(() => u().text).font(11).color(() => u().color).paddingHorizontal(10)
    ),
    ForEach(
      { items: waitingItems, key: (i) => i.key },
      (i) =>
        i().kind === "header"
          ? Text("等你").font(11).weight("semibold").color("secondary").paddingHorizontal(10)
          : i().kind === "more"
          ? Text(() => i().text).font(10).color("tertiary").paddingHorizontal(10)
          : HStack({ spacing: 6 }, [
          Circle({ size: 6 }).fill(() => i().dot),
          Text(() => i().text).font(11).lineLimit(1).truncation("middle"),
          Spacer(),
          Text(() => i().label).font(10).color("secondary").layoutPriority(2),
          Text(() => i().wait).font(10).color("tertiary").layoutPriority(2),
        ]).paddingHorizontal(10)
          .onTap(() =>
            i().surfaceId
              ? cmux("surface.focus", { surface_id: i().surfaceId, workspace_id: i().workspaceId })
              : cmux("workspace.select", { workspace_id: i().workspaceId }))
    ),
    Divider(),
    ForEach(
      { items: rows, key: (r) => r.key },
      (r) =>
        HStack({ spacing: 6 }, [
          Circle({ size: 6 }).fill(() => (r().background ? "#0A84FF" : r().hasAgent ? "#FF9F0A" : "#34C759")),
          VStack({ spacing: 1, alignment: "leading" }, [
            Text(() => ":" + r().port).font(12).monospaced().weight("semibold"),
            Text(() => r().workspaceTitle + " · " + r().tabTitle)
              .font(10).color("tertiary").lineLimit(1).truncation("middle"),
          ]),
          Spacer(),
          iconButton("safari", "secondary", () => openURL("http://localhost:" + r().port)),
          iconButton("arrow.right.square", "secondary", () =>
            r().background && !r().surfaceId
              ? cmux("workspace.select", { workspace_id: r().workspaceId })
              : cmux("surface.focus", { surface_id: r().surfaceId, workspace_id: r().workspaceId })),
          iconButton(
            () => (r().hasAgent ? "lock" : "stop.circle"),
            () => (r().hasAgent ? "tertiary" : "#FF453A"),
            () => {
              if (r().hasAgent) {
                log("services: " + r().port + " 的分頁有 agent，不送 Ctrl+C");
                return;
              }
              cmux("surface.send_key", { surface_id: r().surfaceId, key: "ctrl+c" });
            }
          ),
        ])
          .paddingHorizontal(10).paddingVertical(5)
          .cornerRadius(7)
          .hoverBackground("#7f7f7f1a")
          .frame({ maxWidth: "infinity" })
    ),
    Text(() => (rows().length === 0 ? "沒有偵測到監聽中的 port" : ""))
      .font(11).color("tertiary").paddingHorizontal(10),
    Text("綠點 = 分頁前景的服務。橘點 = 分頁有 agent，不能從這裡停止。藍點 = agent 背景啟動的服務，不能從這裡停止。")
      .font(10).color("tertiary").lineLimit(3).paddingHorizontal(10),
    Spacer(),
  ]).paddingHorizontal(6),
  { surface: "glass" }
);
