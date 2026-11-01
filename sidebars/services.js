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
    for (const p of w.ports ?? []) {
      if (tabPorts.has(p)) continue;
      out.push({
        key: w.id + ":bg:" + p,
        port: p,
        workspaceId: w.id,
        workspaceTitle: w.title,
        tabTitle: "背景",
        background: true,
      });
    }
  }
  return out.sort((a, b) => a.port - b.port).slice(0, 50);
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
            cmux("surface.focus", { surface_id: r().surfaceId, workspace_id: r().workspaceId })),
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
    Text("只列出在 cmux 分頁中啟動的服務。橘點 = 分頁有 agent，不能從這裡停止。")
      .font(10).color("tertiary").lineLimit(3).paddingHorizontal(10),
    Spacer(),
  ]).paddingHorizontal(6),
  { surface: "glass" }
);
