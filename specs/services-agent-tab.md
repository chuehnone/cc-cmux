# 修正 agent 分頁的橘點、鎖頭與背景列跳轉

讓有 Claude 的分頁，port 列照 README 顯示橘點與鎖頭，按下不送 Ctrl+C。背景列的跳轉，切到 agent 真正所在的分頁。

## Why（為什麼要做）

README 承諾「分頁裡有 coding agent 時，面板不送 Ctrl+C」，因為 Ctrl+C 會中斷 agent。2026-11-03 實跑發現這個保護沒有生效：在同一個分頁啟動 server 與 Claude，那一列是綠點加紅色停止按鈕。使用者按下停止，可能中斷正在工作的 Claude。

背景列的跳轉也用了同一個錯的值，可能切不到 agent 的分頁。

## How（現在怎麼做）

- `sidebars/services.js:4` 用 agent 的 `surfaceId` 判斷分頁有沒有 agent，決定橘點、鎖頭與是否送 Ctrl+C。
- `sidebars/services.js:19` 在 workspace 只有一個 agent 時，背景列的跳轉送 `surface.focus`，`surface_id` 是 agent 的 `surfaceId`。
- cmux 文件寫 agent 的 `surfaceId` 等於分頁的 `tabs[k].surfaceId`（`cmux docs sidebars`）。
- 2026-11-03 用 `ccv probe` 讀 cmux 0.65.2 的真實資料：agent 的 `panelId` 等於分頁的 `id`，也等於分頁的 `surfaceId`；agent 的 `surfaceId` 是另一個值，對不到任何分頁。
- 2026-11-03 實跑（run `20261103T151820-0cg0`）：同一個分頁先用 `&` 在背景啟動 server，再啟動 Claude。port 列的副標是那個分頁，但圓點是綠色、按鈕是 `stop.circle`。
- 現有測試的假資料讓 agent 與分頁的 `surfaceId` 相同（`tests/services.test.mjs` 的「分頁有 agent 時顯示橘點與鎖頭，點了不送 Ctrl+C」等），所以測不出這個錯。
- 背景列本身的鎖頭不受影響：程式把背景列的 `hasAgent` 直接設成 true（`sidebars/services.js` 的 `rows`）。
- 「跳轉」按鈕另有既有問題：2026-11-01 實跑 9 次點擊只切換 2 次，用 CLI 送相同的 `surface.focus` 會切換，原因未查出（issue #2，`features/services-background.md`）。
- 「等你」區用 `panelId` 對應分頁，已實跑通過（`specs/services-waiting.md`）。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 修哪裡 | `services.js` 第 4 行與第 19 行一起修 | 同一個錯誤。只修一處，另一處要再規劃一次。 |
| 鎖頭的比對 | agent 的 `panelId` 等於分頁 `id`，或 agent 的 `surfaceId` 等於分頁 `surfaceId`，任一個成立就算有 agent | 鎖頭是安全保護。多鎖只是不能從面板停止，少鎖可能中斷 Claude。cmux 改版後也比較不容易再壞。 |
| 背景列跳轉的比對 | 先用 `panelId` 找分頁，再用 `surfaceId` 找；送找到的分頁的 `surfaceId`；都找不到就送 `workspace.select` | agent 的 `surfaceId` 對不到分頁，不能直接送。 |
| `ended` 的 session | 仍然算 agent，維持上鎖 | 現在的程式不看 `status`。這次只改比對欄位，不改語意。 |
| 「等你」區 | 不改 | 已實跑通過；對不到分頁時顯示 `分頁不明`，不會誤操作。 |
| issue #2 | 不處理 | 和這次的錯誤無關。實跑 `agent-bg-focus` 最多點 3 次。 |
| 共用函式 | 不抽 | 只改這兩處，避免動到已驗證的「等你」區。 |

## 成功條件

1. 分頁的 `id` 等於某個 agent 的 `panelId` 時，該分頁的 port 列圓點是 `#FF9F0A`，按鈕是 `lock`。
2. 按下這個鎖頭，不送任何 `cmux()` 呼叫，只寫一則 `log()`。
3. 沒有 agent 的分頁照舊：圓點 `#34C759`、按鈕 `stop.circle`，按下送 `surface.send_key`，`key` 是 `ctrl+c`，`surface_id` 是該分頁的 `surfaceId`。
4. workspace 只有一個 agent 時，背景列的跳轉送 `surface.focus`，`surface_id` 是 agent 對到的那個分頁的 `surfaceId`。對不到分頁時，送 `workspace.select`。
5. 實跑：同一個分頁啟動 server 與 Claude，那一列是橘點加鎖頭。按下鎖頭後，Claude 的分頁畫面沒有 `^C`，Claude 行程還在，port 還在 LISTEN。
6. 實跑：背景列按跳轉，`cmux tree` 的選取分頁變成 agent 所在的分頁。

## 邊界情況

| 情況 | 行為 |
|------|------|
| 分頁上的 session 是 `ended` | 仍然上鎖。 |
| agent 有 `panelId`，但對應的分頁已經關掉 | 不影響任何 port 列。背景列跳轉送 `workspace.select`。 |
| agent 沒有 `panelId`，`surfaceId` 等於某個分頁的 `surfaceId` | 該分頁上鎖；背景列跳轉送那個分頁的 `surfaceId`。 |
| agent 的 `panelId` 和 `surfaceId` 都對不到分頁 | 所有分頁照舊可停止；背景列跳轉送 `workspace.select`。 |
| workspace 有多個 agent | 背景列跳轉照舊送 `workspace.select`。 |
| 按下跳轉沒有反應（issue #2） | 不處理。實跑最多點 3 次，3 次都沒切換就回報 FAIL 並附 issue #2。 |

## 資料流範例

範例的值：workspace `api`（id `W1`）有分頁 `server`（`id` 與 `surfaceId` 都是 `P1`，`ports: [8080]`）。agent 的 `panelId` 與 `surfaceId` 的關係，照 2026-11-03 用 `ccv probe` 讀到的 cmux 0.65.2 真實資料：`panelId` 等於分頁 `id`，`surfaceId` 是另一個值 `X1`。

| 情況 | 來源（cmux 的值） | 面板怎麼比對 | 畫面 | 按下送出的呼叫 |
|------|-------------------|--------------|------|----------------|
| 正常：分頁有 agent | `tabs: [{id: "P1", surfaceId: "P1", ports: [8080]}]`，`agents: [{panelId: "P1", surfaceId: "X1", status: "idle"}]` | `panelId` `P1` 等於分頁 `id` `P1` | `:8080` 橘點，`lock` | 鎖頭：沒有 `cmux()`，一則 `log()` |
| 正常：分頁沒有 agent | `tabs: [{id: "P1", surfaceId: "P1", ports: [8080]}]`，沒有 `agents` | 沒有 agent | `:8080` 綠點，`stop.circle` | `surface.send_key { surface_id: "P1", key: "ctrl+c" }` |
| 修正前的行為（對照） | 同「分頁有 agent」 | 舊程式用 `surfaceId` `X1` 比對分頁 `surfaceId` `P1`，對不到 | 綠點，`stop.circle`（2026-11-03 實跑） | `surface.send_key { surface_id: "P1", key: "ctrl+c" }`，會送到 Claude 的分頁 |
| `ended` | `agents: [{panelId: "P1", surfaceId: "X1", status: "ended"}]` | `panelId` 對到 | 橘點，`lock` | 沒有 `cmux()` |
| 分頁已關 | `agents: [{panelId: "P7", surfaceId: "X7"}]`，`tabs` 沒有 `P7` | 兩個都對不到 | 其他分頁照舊 | 背景列跳轉：`workspace.select { workspace_id: "W1" }` |
| 只有 surfaceId 對到 | `agents: [{surfaceId: "P1"}]`，沒有 `panelId` | `surfaceId` `P1` 等於分頁 `surfaceId` `P1` | 橘點，`lock` | 沒有 `cmux()` |
| 兩個都對不到 | `agents: [{panelId: "P9", surfaceId: "X9"}]` | 對不到 | `:8080` 綠點，`stop.circle` | `surface.send_key { surface_id: "P1", key: "ctrl+c" }` |
| 背景列，唯一 agent | workspace `ports: [9000]`，分頁沒有 9000；`agents: [{panelId: "P1", surfaceId: "X1"}]` | `panelId` 找到分頁 `P1` | `:9000` 藍點，`lock` | 跳轉：`surface.focus { surface_id: "P1", workspace_id: "W1" }`，不是 `X1` |
| 背景列，多個 agent | `agents` 有兩筆 | 不比對 | `:9000` 藍點，`lock` | 跳轉：`workspace.select { workspace_id: "W1" }` |
| 跳轉沒反應（issue #2） | 同「背景列，唯一 agent」 | 同上 | 同上 | 呼叫正確，但 cmux 有時沒切換；實跑最多點 3 次 |

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `sidebars/services.js` | 第 4 行改成 `panelId` 或 `surfaceId` 任一個對到；第 19 行改成先 `panelId`、再 `surfaceId` 找分頁，送該分頁的 `surfaceId`。 |
| `tests/services.test.mjs` | 現有 agent 相關測試的假資料改成實測的 id 關係，補這次的行為。 |
| `README.md` | 移除「修好前不要對有 Claude 的分頁按停止」那一條已知限制。 |
| `.claude/skills/verify-cc-cmux/features/services-list.md`、`services-background.md` | 寫入實跑結果，`list-agent-dot` 改指向新的功能檔。 |
| `.claude/skills/verify-cc-cmux/SKILL.md` | 未驗證清單拿掉「分頁有 agent 時的鎖頭與橘點」；指令表加新指令。 |
| `.claude/skills/verify-cc-cmux/scripts/ccv.mjs` | `agent-tab-start`、`click <按鈕> agent`、`check-lock`。 |

不改的檔案與理由：

- `tests/harness.mjs`：`rows()`、`tap()` 已經夠用。
- `sidebars/services.js` 的「等你」區：已實跑通過，決策不改。
- `statusline/`、`hooks/`、`scripts/`：功能無關。

## 測試清單

單元測試（`tests/`，實作時先寫、先看到失敗）：

1. 改寫「分頁有 agent 時顯示橘點與鎖頭，點了不送 Ctrl+C」：agent 的 `panelId` 等於分頁 `id`，`surfaceId` 是另一個值 → 橘點、`lock`，按下不送 `cmux()`。
2. agent 沒有 `panelId`，`surfaceId` 等於分頁 `surfaceId` → 橘點、`lock`。
3. agent 的 `panelId` 和 `surfaceId` 都對不到分頁 → 綠點、`stop.circle`，按下送 `surface.send_key`。
4. `status` 是 `ended` 的 agent 綁在分頁上 → 橘點、`lock`。
5. 背景列跳轉：唯一 agent 的 `panelId` 對到分頁 → `surface.focus` 的 `surface_id` 是分頁的 `surfaceId`，不是 agent 的 `surfaceId`。
6. 背景列跳轉：`panelId` 對不到、`surfaceId` 對到 → 送該分頁的 `surfaceId`。
7. 背景列跳轉：兩個都對不到 → `workspace.select`。
8. 現有其他測試照舊通過。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/services-agent-tab.md`
- sub-feature：`agent-dot`、`agent-lock`、`agent-bg-focus`
- 回歸：install、list、stop、claude-rate-limit 的 `usage-row`、services-waiting 的 `wait-question`

## ccv 需要的擴充

開始實作前，先擴充 `scripts/ccv.mjs`，並實跑一次證明能用：

1. `ccv agent-tab-start`：在本次 run 的 window 用 `--focus false` 開一個 workspace。先用 `&` 啟動 `python3 -I -m http.server <port>`，再在同一個分頁啟動互動模式的 `claude --model haiku`，送一句短 prompt。就緒條件：port 在 LISTEN、`sidebar-state` 的 `ports=` 有這個 port、`ccv probe` 看得到這個分頁的 agent。記錄 server 與 Claude 的 PID，`ccv cleanup` 時一起結束。會用到少量 token。
2. `ccv click <open|focus|stop> agent`：點 agent 分頁那一列的按鈕。
3. `ccv check-lock`：按下鎖頭後 5 秒內檢查 Claude 分頁畫面沒有 `^C`、Claude 行程還在、port 還在 LISTEN。三項都成立才 PASS。

## 不做的事

- 「等你」區的比對方式：已實跑通過。
- issue #2（跳轉按鈕點了有時沒反應）：和這次的錯誤無關。
- 抽出共用的「agent 對應分頁」函式：只改兩處，不動已驗證的程式。
- 依 `status` 決定要不要上鎖：這次只改比對欄位，不改語意。

## 未決問題
