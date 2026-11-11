# Services 面板的驗證地圖

這個目錄記錄 cc-cmux 的使用者功能，以及各功能的驗證方式。驅動面板前先讀這份索引，再照對應的功能檔操作。

## 基本前置條件

- 在 cmux 的終端機分頁裡執行，讓 cmux socket 和 `CMUX_CUA_CLIENT_PATH` 可用。
- `~/.config/cmux/sidebars/services.js` 是 symlink，指向這個 repo 的 `sidebars/services.js`。
- 執行 `ccv launch`，看到 `READY`。
- 執行 `ccv doctor`，每一項都要 `OK`。
- 只操作 `ccv launch` 開的 window。

`ccv` 是 `.claude/skills/verify-cc-cmux/scripts/ccv.mjs`，寫法見 `../SKILL.md`。

## 操作慣例

- 每個功能都從 launch 後的狀態開始。
- 用 AX 文字 `:<port>` 找到要操作的那一列。按鈕沒有 AX 名稱，只能用 `ccv click <open|focus|stop>`。
- 指令照字面執行，不要改參數。
- 每次操作前後各跑一次 `ccv capture <label>`。
- 會改變狀態的操作（停止、跳轉）做完後，先 `ccv cleanup`，再驗下一個功能。

## 證據與略過的回報

- 證據放在 `~/.cache/cc-cmux-verify/<run>/`，不放進 repo。
- 每次操作都要有操作前、操作後兩份 capture。
- 除了畫面，也要檢查副作用：port、行程、分頁畫面、瀏覽器 request log。
- 前置條件不足時，回報失敗，寫出執行的指令與缺的條件。不要換一條路徑來湊出通過。
- 沒驗到的入口，不要寫成已驗證。

## 功能檔的格式

新功能從 `_TEMPLATE.md` 複製。每個功能檔開頭是 H1 標題，加一段使用者看得到的行為說明，接著依序放四個 H2：

1. `Sub-features`：每個子功能一行，附短 ID。
2. `How to get to it (user POV)`：使用者從哪裡進入。
3. `Driving it with ccv`：先寫 `Preconditions:`，再逐步寫操作、指令和看得到的結果。
4. `Gotchas`：會浪費時間或讓驗證結果失效的陷阱。

## 功能

| 功能 | 檔案 | 實跑狀態 |
|------|------|----------|
| 安裝面板 | [install.md](./install.md) | launch 與 doctor 涵蓋，已實跑（2026-11-01） |
| 列出監聽中的 port | [services-list.md](./services-list.md) | launch 的就緒條件涵蓋，已實跑（2026-11-01） |
| 停止服務 | [services-stop.md](./services-stop.md) | 已實跑（2026-11-01），結果見該檔 |
| 跳到服務的分頁 | [services-focus.md](./services-focus.md) | 已實跑（2026-11-03）：focus-switch PASS |
| 用瀏覽器開啟服務 | [services-open.md](./services-open.md) | 未實跑 |
| 列出背景服務 | [services-background.md](./services-background.md) | 已實跑（2026-11-01、2026-11-03）：bg-row、bg-lock、bg-focus PASS；bg-open 未驗證 |
| 登記每一個 Claude Code session | [agent-registration.md](./agent-registration.md) | 已實跑（2026-11-02，cmux 在前景）：reg-both、reg-control、reg-no-status、reg-cleanup PASS |
| 顯示 Claude 7 天額度的剩餘時間 | [claude-rate-limit.md](./claude-rate-limit.md) | 已實跑（2026-11-02）：usage-row、usage-red、usage-accounts、usage-live、usage-cleanup PASS |
| 列出在等使用者的 Claude session | [services-waiting.md](./services-waiting.md) | 已實跑（2026-11-03，cmux 在前景）：wait-question、wait-done、wait-focus PASS；wait-crash 已記錄 |
| agent 分頁的橘點、鎖頭與背景列跳轉 | [services-agent-tab.md](./services-agent-tab.md) | 已實跑（2026-11-03，cmux 在前景）：agent-dot、agent-lock、agent-bg-focus PASS |
| 用 cmux 事件判斷跳轉 | [focus-check.md](./focus-check.md) | 已實跑（2026-11-03，cmux 在前景）：focus-tab、focus-bg PASS；focus-negative 如預期 FAIL |
| 顯示電腦的 CPU 與記憶體 | [system-stats.md](./system-stats.md) | 已實跑（2026-11-09，cmux 在前景）：sys-row、sys-compare、sys-stop、sys-stale、sys-red PASS；2026-11-11 改 monitor 的環境變數後重跑，sys-row、sys-stop PASS |

## 未驗證

未驗證不算通過。這一節是未驗證項目的唯一清單，其他 skill 都指向這裡。驗證完一項，就從這裡刪掉，並更新上面功能表那一列。

| 項目 | 原因 | 細節 |
|------|------|------|
| 2 倍螢幕上的點擊 | 倍率修正後的點擊都在 1 倍螢幕上 | [services-stop.md](./services-stop.md) 的 Gotchas |
| 空狀態（`list-empty`） | 還沒實跑 | [services-list.md](./services-list.md) 的 Driving it with ccv 與 Gotchas |
| `services-open` | 會在使用者的預設瀏覽器開分頁，要先取得同意，還沒實跑 | [services-open.md](./services-open.md) |
| `bg-open` | 用到 `services-open` 的做法 | [services-background.md](./services-background.md) 的 Gotchas |
| 開啟 `localhost` 時，瀏覽器先解析成 IPv6 `::1` 會不會連不上 | 還沒實跑 | [services-open.md](./services-open.md) 的 Gotchas |
| 從「右鍵選 services」安裝面板 | 還沒實跑 | [install.md](./install.md) 的 Gotchas |
| 面板會不會列出使用者其他 window 的服務 | 還沒實跑 | [services-list.md](./services-list.md) 的 Gotchas |
| `stop-agent-lock` | ccv 不會在本次 run 的分頁裡啟動 agent | [services-stop.md](./services-stop.md) 的 Gotchas |
| cmux 在背景、agent 活著、只有 server 結束時，port 會不會一直留著 | 還沒實跑 | [agent-registration.md](./agent-registration.md) 的 Gotchas |
| 看過跑完列後 60 秒內切到別的分頁，閒置提醒送到時那一列會不會再出現 | 還沒實跑 | [services-waiting.md](./services-waiting.md) 的 Gotchas |
