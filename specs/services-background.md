# 列出背景服務

Services 面板也列出 coding agent 用背景 shell 啟動、而且有開 port 的服務，並標成「背景」。

## Why（為什麼要做）

coding agent（例如 Claude Code）用背景 Bash 啟動的服務，沒有自己的分頁 tty。現在的面板只列出分頁層的 port，所以這類服務不會出現。使用者看不到它在跑，也無法從面板開啟它或跳到相關分頁，只能自己查 port。

## How（現在怎麼做）

- 面板只讀分頁層的 port：`for (const t of w.tabs ?? []) for (const p of t.ports ?? [])`（`sidebars/services.js:5-6`）。
- 分頁層的 `ports` 只包含行程的 controlling tty 等於分頁 tty 的行程。agent 背景啟動的行程沒有 tty，不在這一層（cmux 原始碼 `PortScanner+Process.swift`）。
- workspace 層的 `ports` 是「所有分頁的 port」與「agent 子孫行程的 port」的聯集（cmux 原始碼 `Workspace+PanelLifecycle.swift` 的 `recomputeListeningPorts`）。只有被 cmux 記錄成 agent 的行程，它的子孫才算進這一層。
- cmux docs sidebars 的「Live data」一節：
  - workspace 的 `ports` 是 Always present。
  - 分頁的 `ports` 是 When available。
  - `agents` 在沒有 agent 時整個欄位不存在。
  - `agents[j].surfaceId` 是 when available。
- custom sidebar 不能啟動子行程，執行環境沒有 filesystem、network、timers（cmux docs sidebars）。所以面板拿不到行程清單，也不能執行 kill。
- 現有按鈕：
  - 開啟：`openURL("http://localhost:" + port)`（`sidebars/services.js:49`）。
  - 跳轉：`cmux("surface.focus", …)`（`sidebars/services.js:50-51`）。
  - 停止：對分頁送 Ctrl+C（`sidebars/services.js:60`）。
  - 分頁有 agent 時，停止按鈕換成鎖頭，點了只寫 log（`sidebars/services.js:52-58`）。
- 面板最多 50 列（`sidebars/services.js:19`）。列的 key 是 `w.id + ":" + t.id + ":" + p`（`sidebars/services.js:8`）。
- 面板底部說明與 README 的已知限制都寫「只列出在 cmux 分頁中啟動的服務」（`sidebars/services.js:71`、`README.md`）。
- cmux 有時不移除已結束服務的 port（issue #1）。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 要偵測什麼 | 只偵測有開 port 的背景服務 | sidebar 拿不到行程清單；只有 workspace 層的 `ports` 能間接看到 agent 子孫行程 |
| 呈現方式 | 和分頁列混排，依 port 排序；副標「workspace 名稱 · 背景」；藍色圓點；總數包含背景列 | 使用者用 port 找服務；顏色和副標足以區分；背景服務通常只有一兩個，不另外分區 |
| 開啟 | 保留，同現有做法 | 只需要 port |
| 跳轉 | workspace 只有一個帶 `surfaceId` 的 agent 時，`surface.focus` 到那個 agent 的分頁；否則 `workspace.select` | 只有一個 agent 時，背景服務幾乎一定是它啟動的；cmux 不提供 port 與 agent 的對應 |
| 停止 | 灰色鎖頭，點了不送 `cmux()`，只寫一筆 `log` | 送 Ctrl+C 會打斷 agent，停不掉背景行程；sidebar 不能 kill；與現有 agent 分頁做法一致 |
| 背景 port 的算法 | `w.ports` 減掉該 workspace 所有 `t.ports` 的聯集，同一 workspace 內去重 | `w.ports` 是分頁 port 與 agent port 的聯集 |
| 缺值 | `w.ports`、`t.ports`、`w.agents` 缺值都當成空陣列 | 欄位不保證存在 |
| key | 背景列用 `w.id + ":bg:" + p` | 背景列沒有分頁 id，要避免和分頁列衝突 |
| 上限 | 背景列和分頁列一起排序後，取前 50 列 | 維持現有上限 |
| 兩個 workspace 有同一個背景 port | 各出一列，不合併 | cmux 資料可能不準，合併會藏住資訊 |
| 藍色色碼 | `#0A84FF` | 使用者決定用藍色；色碼由 Claude 決定，用 macOS 系統藍，和現有的 `#34C759`、`#FF9F0A`、`#FF453A` 同一組系統色 |
| 驗證背景服務的方式 | ccv 在測試 workspace 執行 `claude -p`，請它用背景 Bash 啟動測試 server | 走使用者的真實路徑 |

## 成功條件

單元測試（harness 提供 `workspaces` 假資料）：

1. workspace 的 `ports` 有、所有分頁的 `ports` 都沒有的 port，出現一列 `:<port>`。
2. 這一列的副標是「`<workspace 名稱>` · 背景」，圓點是藍色 `#0A84FF`。
3. 同時在分頁層出現的 port 只出現一次，照分頁列顯示。
4. 背景列與分頁列一起依 port 排序；標題列的數字包含背景列。
5. 點「開啟」送出 `openURL("http://localhost:<port>")`。
6. workspace 只有一個帶 `surfaceId` 的 agent 時，點「跳轉」送出 `cmux("surface.focus", { surface_id: <agent 的 surfaceId>, workspace_id: <w.id> })`。
7. 有多個 agent、沒有 agent，或唯一的 agent 沒有 `surfaceId` 時，點「跳轉」送出 `cmux("workspace.select", { workspace_id: <w.id> })`。
8. 背景列的第三個按鈕是 `lock`；點了沒有任何 `cmux()` 呼叫，只有一筆 `log`。
9. 底部說明文字提到藍色圓點代表背景服務。

實跑（verify-cc-cmux）：

10. 測試 workspace 裡的 `claude -p` 用背景 Bash 啟動測試 server 後，15 秒內：面板 AX 樹有 `:<port>`；同一列的副標含「背景」；`sidebar-state` 的 `ports=` 有這個 port。
11. 回歸：install、list、stop 照舊通過（stop 用 `ccv check-stop`）。

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `sidebars/services.js` | 算出背景 port；加背景列；背景列的三個按鈕；更新底部說明 |
| `tests/services.test.mjs` | 新增成功條件 1–9 的測試 |
| `README.md` | 更新 Services 的功能說明與已知限制 |
| `.claude/skills/verify-cc-cmux/scripts/ccv.mjs` | 新增在測試 workspace 產生 agent 背景服務的能力 |
| `.claude/skills/verify-cc-cmux/features/services-background.md`、`features/README.md` | 規劃時已寫好；實作時只更新實跑狀態與 Gotchas |

不改的檔案與理由：

- `tests/harness.mjs`：現在就支援 `HStack`、`Circle`、`Text`、`Image`、`fill`、按鈕與 `cmux()`、`openURL()`、`log()` 呼叫。實作時發現不夠，先更新這份 spec 再改。
- `scripts/check-no-comments.mjs`、`.githooks/`：與這個功能無關。

## 測試清單

單元測試（`tests/`，實作時先寫、先看到失敗）：

1. 背景 port 出現一列：`w.ports = [8080, 9000]`，分頁 `ports = [8080]` → 有 `:9000` 這一列。
2. 背景列的副標與顏色：同上 → `:9000` 的副標是「`<workspace>` · 背景」，圓點 `#0A84FF`。
3. 不重複：`w.ports = [8080]`，分頁 `ports = [8080]` → 只有一列 `:8080`，圓點不是藍色。
4. 排序與總數：分頁 `[5000]`、背景 `[3000, 9000]` → 列順序 3000、5000、9000；標題數字是 `3`。
5. 開啟：點 `:9000` 的 `safari` → `openURL("http://localhost:9000")`。
6. 跳轉到唯一 agent：`agents = [{ surfaceId: "s9" }]` → 點 `arrow.right.square` → `surface.focus`，`surface_id: "s9"`。
7. 跳轉退回 workspace：`agents` 有兩個／沒有／唯一的沒有 `surfaceId` → `workspace.select`。三種情況各一個測試。
8. 背景列停止：點 `lock` → 沒有 `cmux()`，有一筆 `log`。
9. 底部說明：文字含「藍」與「背景」。
10. 缺值：`w.ports` 不存在 → 不出錯，沒有背景列。
11. 去重：`w.ports = [9000, 9000]` → 只有一列 `:9000`。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/services-background.md`
- sub-feature：`bg-row`、`bg-open`、`bg-focus`、`bg-lock`
- 回歸：install、list、stop

## ccv 需要的擴充

- 在測試 workspace 啟動 `claude -p`，用固定的 prompt 請它用背景 Bash 啟動測試 server，並記錄 port。
- 先驗證：在 cmux 分頁裡執行的 `claude -p`，會不會被 cmux 記錄成 agent（`cmux top --all --processes` 的 claude_code tag 底下有它的 PID），而且它背景 Bash 啟動的 port 會出現在 `sidebar-state` 的 `ports=`。這一點目前未查證。驗證不通過時，停下來回報使用者，不要改用其他方式。
- `claude -p` 做完 prompt 就會結束。結束後，背景 server 可能被一起結束，或變成孤兒行程而不再是 agent 的子孫，port 就會從 workspace 層的 `ports` 消失。所以 prompt 要請它啟動 server 後先等待一段固定時間再結束，讓驗證在它還活著時完成。這一點也要在實作第 2 步先驗證。
- cleanup 要能結束這個 run 啟動的 `claude -p` 與它的背景 server。不依名稱 kill，只結束記錄下來的 PID。
- capture 要記錄背景列的副標文字。

## 不做的事

- 沒有開 port 的背景 shell：sidebar 沒有行程資料。
- 從面板停止背景服務：sidebar 不能 kill，送 Ctrl+C 會打斷 agent。
- 判斷背景服務是哪個 agent 啟動的：cmux 只提供 workspace 層的 port 清單。
- 修 issue #1（cmux 有時不移除 port）：屬於 cmux 的行為，另外追蹤。

## 未決問題
