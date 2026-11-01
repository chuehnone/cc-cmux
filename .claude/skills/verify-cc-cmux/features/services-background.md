# 列出背景服務

coding agent 用背景 shell 啟動、有開 port 的服務，在 Services 面板出現一列，副標標成「背景」，圓點是藍色。這一列可以開啟、跳轉，但不能從面板停止。

## Sub-features

- `bg-row`：agent 背景啟動的服務出現一列 `:<port>`，副標是「`<workspace 名稱>` · 背景」，圓點是藍色。
- `bg-open`：點「開啟」，瀏覽器連到這個服務。
- `bg-focus`：點「跳轉」，workspace 只有一個 agent 時跳到它的分頁，否則切到該 workspace。
- `bg-lock`：停止按鈕是鎖頭，點了不送 Ctrl+C。

## How to get to it (user POV)

- 在 cmux 分頁裡讓 coding agent（例如 Claude Code）用背景 shell 啟動一個服務，再打開 Services 面板。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- 執行 `ccv bg-start`，看到 `BG READY port=<bg port> agentPid=<pid> serverPid=<pid>`。這代表 `claude -p` 已被 cmux 記錄成 agent，背景 server 沒有 tty，`sidebar-state` 有這個 port。逾時就回報失敗，不要改用其他方式。

- **出現一列（`bg-row`）。** `BG READY` 後 15 秒內，執行 `ccv capture bg-row`。`bg-row.txt` 要符合四點：`bg panel row` 是 `present`；`bg panel subtitle` 含「背景」；`bg sidebar-state ports` 有這個 port；`bg listener tty` 是 `??`（沒有分頁持有它）。
- **開啟（`bg-open`）。** 先問使用者是否同意在瀏覽器開分頁。執行 `ccv click open bg`。`ccv capture after-bg-open` 的 `bg agent surface screen` 或背景 server 的 request log 有 `"GET / HTTP/1.1" 200`。
- **跳轉（`bg-focus`）。** 執行 `ccv click focus bg`。`ccv capture after-bg-focus` 的 `tree` 裡，`verify-bg-<run>` workspace 標著 `[selected]`，它的分頁（`claude -p` 所在）也標著 `[selected]`。
- **鎖頭（`bg-lock`）。** 執行 `ccv click stop bg`。等 5 秒後執行 `ccv capture after-bg-lock`：`bg lsof port` 仍在 LISTEN；`bg agent pid` 仍存在；`bg agent surface screen` 沒有 `^C`。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md` 各跑一次。

## Gotchas

- 圖示按鈕不在 AX 樹裡。鎖頭是否顯示只能從截圖看，所以 `bg-lock` 用「點了之後服務沒停、agent 沒被打斷」來判定。
- cmux 有時不移除已結束服務的 port（issue #1）。背景服務結束後，那一列可能留著。
- `claude -p` 每次執行都會用到 token，大約要幾十秒。
- `claude -p` 回覆後不會結束，會一直等背景 server（2026-11-01 實測 151 秒後仍在）。`ccv cleanup` 關閉 window 時，它和背景 server 會一起結束；cleanup 也會確認這兩個 PID。
- `bg-open` 用到 `services-open` 的做法，那個功能目前未驗證。
- 這個功能還沒實跑過。
