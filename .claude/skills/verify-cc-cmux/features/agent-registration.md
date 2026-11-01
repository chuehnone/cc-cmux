# 登記每一個 Claude Code session

裝了 `hooks/register-agent.mjs` 之後，同一個 workspace 裡的每一個 Claude Code session 都會被 cmux 登記成 agent。它們用背景 shell 啟動的服務，都會出現在 Services 面板上，不會因為別的 session 最後送出 hook 而消失。

## Sub-features

- `reg-both`：同一個 workspace 的兩個 Claude 各起一個背景 server，兩個 port 都持續出現在 `ports=` 與面板上。
- `reg-control`：對照組不帶 hook，同樣條件下只有一個背景 port 出現在 `ports=`。
- `reg-no-status`：帶 hook 時，`status_count` 與對照組相同。
- `reg-cleanup`：Claude 與它的背景 server 結束後，15 秒內 port 從 `ports=` 消失。

## How to get to it (user POV)

- 照 README 在 `~/.claude/settings.json` 加上 hook，之後在 cmux 的同一個 workspace 開多個 Claude Code session，讓它們用背景 shell 啟動服務，再打開 Services 面板。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- ccv 已擴充 `bg-start --with-hook`、`--count 2`。這個能力目前還沒有，實作時才會加。
- 不改使用者的 `~/.claude/settings.json`。hook 只透過測試資料夾的專案層 `.claude/settings.json` 生效。

- **對照組（`reg-control`）。** 執行 `ccv bg-start --count 2`。兩個背景 server 都在 LISTEN 後，執行 `ccv capture reg-control`。`sidebar-state` 的 `ports=` 只有其中一個背景 port。記下 `status_count`。執行 `ccv cleanup`。
- **兩個都在（`reg-both`）。** 重新 `ccv launch`，執行 `ccv bg-start --with-hook --count 2`。`cmux top` 的 tag 有兩個 `cc-cmux.claude.<PID>`。之後 30 秒內每 5 秒執行一次 `ccv capture`：每一次 `ports=` 都有兩個背景 port，面板 AX 樹也都有兩列 `:<port>`。
- **沒有多出狀態列（`reg-no-status`）。** `reg-both` 的 capture 中，`status_count` 等於對照組記下的值。
- **結束後清掉（`reg-cleanup`）。** 結束其中一個測試 Claude 與它的背景 server（只結束 ccv 記錄的 PID）。15 秒內，它的 port 從 `ports=` 消失；另一個 port 仍在。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md`、`services-background.md` 各跑一次。

## Gotchas

- 這個功能依賴 cmux 沒有公開文件的 `set_agent_pid`。cmux 改版後若失效，`reg-both` 會失敗，不要放寬條件。
- 對照組的結果可能隨「哪個 Claude 最後送出 hook」而變，但任何時刻都不會兩個背景 port 同時在 `ports=`。
- `claude -p` 每次執行都會用到 token，`--count 2` 會用兩倍。
- 這個功能還沒實跑過。
