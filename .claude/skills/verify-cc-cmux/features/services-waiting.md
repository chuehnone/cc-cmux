# 列出在等使用者的 Claude session

Services 面板的 7d 列下面有「等你」區。Claude 問問題時，出現一列 `<workspace> · <分頁>　問題　<等待時間>`，圓點是橘色。Claude 跑完、使用者還沒看時，出現一列 `跑完`，圓點是藍色。按一下整列，cmux 切到那個分頁。沒有任何 session 在等時，整區不顯示。

## Sub-features

- `wait-question`：真的 Claude 呼叫 AskUserQuestion 後，「等你」區出現 `問題` 列，文字含該分頁的 workspace 名稱。
- `wait-done`：真的 Claude 跑完一個回合、通知未讀時，出現 `跑完` 列。
- `wait-focus`：按下 `跑完` 列後，`cmux tree` 的選取分頁變成那個分頁，該列在 5 秒內消失。30 秒內按與 70 秒後按各做一次，記錄閒置提醒送到後那一列有沒有再出現。
- `wait-crash`：用 SIGKILL 結束 `問題` 列的 Claude，記錄那一列 30 秒內的變化。只記錄，不算通過條件。

## How to get to it (user POV)

- 在 cmux 裡開多個 Claude session。某個 session 問問題或跑完時，看右側欄 Services 面板的「等你」區，按那一列切過去。面板和 Claude 要在同一個 window。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- `scripts/ccv.mjs` 已有 `wait-start`、`wait-rows`、`click-row`、`wait-kill`（spec `specs/services-waiting.md` 的「ccv 需要的擴充」）。
- cmux 是前景 app。`actions.log` 每行的 `front=` 與 capture 的 `## front app` 要是 `cmux`。不是時，結果不算數。

- **沒有在等的 session。** 執行 `ccv wait-rows`。輸出沒有任何列，`ccv capture wait-empty` 的「等你」區是空的。
- **問題（`wait-question`）。** 執行 `ccv wait-start question`，等到回報就緒。執行 `ccv wait-rows`：有一列含 `問題`，以及 `wait-start` 回報的 workspace 名稱。執行 `ccv capture wait-question`，截圖上該列圓點是橘色。
- **跑完（`wait-done`）。** 執行 `ccv wait-start done`，等到回報就緒。執行 `ccv wait-rows`：有一列含 `跑完`。執行 `ccv capture wait-done`，截圖上該列圓點是藍色，未讀通知一節有該分頁。
- **按下跑完，30 秒內（`wait-focus`）。** 在回合結束後 30 秒內，執行 `ccv click-row 跑完`。`click-row` 回報的選取分頁是 `wait-start done` 開的分頁。5 秒內，`ccv wait-rows` 沒有這一列。等到回合結束滿 70 秒，再執行一次 `ccv wait-rows`，記錄這一列有沒有再出現。
- **按下跑完，70 秒後（`wait-focus`）。** `ccv cleanup` 後重新 `ccv launch`，執行 `ccv wait-start done`。等到回合結束滿 70 秒，執行 `ccv click-row 跑完`。5 秒內那一列消失；之後 30 秒內沒有再出現。
- **Claude 當掉（`wait-crash`）。** `ccv cleanup` 後重新 `ccv launch`，執行 `ccv wait-start question`。執行 `ccv wait-kill`。之後 30 秒內每 10 秒執行一次 `ccv wait-rows` 與 `ccv capture wait-crash-<秒數>`，記錄那一列是否消失、狀態是否改變。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md` 各跑一次，再跑 `claude-rate-limit.md` 的 `usage-row`。

## Gotchas

- `ccv wait-start` 的 workspace 要用 `--focus false` 開。切過去的話，通知會直接變成已讀，`跑完` 列不會出現。
- 回合結束約 60 秒後，Claude 會送出閒置提醒。60 秒內按下去的話，提醒送到後那一列會再出現一次。判定 `wait-focus` 時，只看按下後 5 秒內是否消失。
- 「等你」區只看得到同一個 window 的 session。使用者自己 window 裡的 Claude 不會出現在測試 window。
- `wait-start` 會用到 token。
- 本機權限模式是 `auto`，不容易觸發權限詢問。所以 `question` 改用 AskUserQuestion 觸發 `needs_input`。
