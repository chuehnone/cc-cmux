# agent 分頁的橘點、鎖頭與背景列跳轉

分頁裡有 Claude 時，那個分頁的 port 列是橘點，停止按鈕換成鎖頭，按下不送 Ctrl+C。workspace 只有一個 Claude 時，背景服務列的「跳轉」切到 Claude 所在的分頁。

## Sub-features

- `agent-dot`：同一個分頁有 server 與 Claude 時，那一列是橘點加鎖頭。
- `agent-lock`：按下那一列的鎖頭後，Claude 分頁畫面沒有 `^C`，Claude 行程還在，port 還在 LISTEN。
- `agent-bg-focus`：背景服務列按跳轉，`cmux tree` 的選取分頁變成 Claude 所在的分頁。

## How to get to it (user POV)

- 在一個分頁先在背景啟動 server，再在同一個分頁啟動 Claude，看 Services 面板那一列，按鎖頭。
- 讓 Claude 用背景 shell 啟動 server，在 Services 面板按背景列的「跳轉」。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- `scripts/ccv.mjs` 已有 `agent-tab-start`、`click <按鈕> agent`、`check-lock`（spec `specs/services-agent-tab.md` 的「ccv 需要的擴充」）。
- cmux 是前景 app。`actions.log` 每行的 `front=` 與 capture 的 `## front app` 要是 `cmux`。不是時，結果不算數。

- **橘點與鎖頭（`agent-dot`）。** 執行 `ccv agent-tab-start`，等到回報就緒。執行 `ccv capture agent-dot`。截圖上那個 port 的列是橘點，最右邊的按鈕是鎖頭。`capture` 的 `tree` 顯示這個 port 屬於 Claude 所在的分頁。
- **按下鎖頭（`agent-lock`）。** 執行 `ccv click stop agent`，再執行 `ccv check-lock`，回報 PASS。
- **背景列跳轉（`agent-bg-focus`）。** `ccv cleanup` 後重新 `ccv launch`，執行 `ccv bg-start`。執行 `ccv click focus bg`，再執行 `ccv capture after-bg-focus`。`tree` 裡 `verify-bg-<run>` workspace 標著 `[selected]`。沒有切換時再點一次，最多 3 次。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md` 各跑一次，再跑 `claude-rate-limit.md` 的 `usage-row` 與 `services-waiting.md` 的 `wait-question`。

## Gotchas

- agent 的 `surfaceId` 對不到分頁，`panelId` 才對得到。用 `ccv probe` 可以看到真實的值。cmux 文件寫的和實際不同。
- 「跳轉」按鈕點了有時沒反應，是既有問題（issue #2）。`agent-bg-focus` 3 次都沒切換時，回報 FAIL 並附 issue #2，不要改用 CLI 湊出通過。
- 用 `&` 啟動的 server 不屬於 window 的終端機行程，關掉 window 後還會留著。`agent-tab-start` 要記錄它的 PID，讓 `ccv cleanup` 結束它。
- `agent-tab-start` 會用到 token。
- 不要對 Claude 的分頁按真正的停止按鈕來證明修正前的錯誤。修正前的行為已記錄在 `services-list.md`（run `20261103T151820-0cg0`）。
- 2026-11-03 實跑結果（cmux 在前景）：
  - `agent-dot` PASS：`:18750` 橘點加鎖頭（run `20261103T153303-1ffx`）。
  - `agent-lock` PASS：`check-lock` 三項 PASS（同一個 run）。
  - `agent-bg-focus` **FAIL**：點 3 次都沒有切換（run `20261103T153100-wx3c`）。單元測試確認送出的 `surface_id` 是 agent 分頁的值，屬於 issue #2。
  - 回歸 install、list、stop、`usage-row`、`wait-question` PASS（run `20261103T153223-vb2h`）。
- 第一次實跑 `agent-dot` 與 `agent-lock` 時前景是 Google Chrome（run `20261103T153026-8e07`），結果不算數，已在 cmux 前景時重跑。
