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
- ccv 已擴充，能在本次 run 的 workspace 啟動 `claude -p`，並讓它用背景 Bash 啟動測試 server。這個能力目前還沒有，實作時才會加，指令名稱也還沒定。
- `claude -p` 被 cmux 記錄成 agent：`cmux top --all --processes` 的 claude_code tag 底下有它的 PID。不成立時，回報失敗，不要改用其他方式。

- **出現一列（`bg-row`）。** 讓 agent 啟動背景 server。15 秒內，`ccv capture bg-row` 的結果符合四點：`panel row :<port>` 是 `present`；這一列的副標含「背景」；`sidebar-state` 的 `ports=` 有這個 port；而且 `tree` 裡沒有任何分頁持有這個 port。
- **開啟（`bg-open`）。** 先問使用者是否同意在瀏覽器開分頁。執行 `ccv click open`。背景 server 的 request log 有 `"GET / HTTP/1.1" 200`。
- **跳轉（`bg-focus`）。** 執行 `ccv click focus`。`ccv capture after-bg-focus` 的 `tree` 裡，`claude -p` 所在的分頁標著 `[selected]`。
- **鎖頭（`bg-lock`）。** 執行 `ccv click stop`。點擊後 5 秒，背景 server 的 port 仍在 LISTEN，`claude -p` 的行程仍在，它所在分頁的畫面沒有 `^C`。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md` 各跑一次。

## Gotchas

- 圖示按鈕不在 AX 樹裡。鎖頭是否顯示只能從截圖看，所以 `bg-lock` 用「點了之後服務沒停、agent 沒被打斷」來判定。
- cmux 有時不移除已結束服務的 port（issue #1）。背景服務結束後，那一列可能留著。
- `claude -p` 每次執行都會用到 token，大約要幾十秒。
- `claude -p` 做完 prompt 就會結束。它結束後，背景 server 不再是 agent 的子孫，這一列會消失。所有檢查都要在它還在等待時做完。
- `bg-open` 用到 `services-open` 的做法，那個功能目前未驗證。
- 這個功能還沒實跑過。
