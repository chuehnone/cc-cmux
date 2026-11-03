# 用 cmux 事件判斷跳轉

驗證「跳轉」按鈕時，ccv 改看 cmux 的 `workspace.selected` 事件，不看 `cmux tree`。`cmux tree` 的選取狀態有時會落後實際畫面十幾秒，會把成功的跳轉判讀成失敗（issue #2）。

## Sub-features

- `focus-tab`：launch 後直接點 server 列的跳轉，`ccv check-focus` 回報 `FOCUS PASS`。
- `focus-bg`：launch、`bg-start` 後直接點背景列的跳轉，`ccv check-focus` 回報 `FOCUS PASS`。
- `focus-negative`：先選取 server 的 workspace，再點 server 列的跳轉，`ccv check-focus` 回報 `FOCUS FAIL`，原因寫「點擊前已經選取目標」。

## How to get to it (user POV)

- 在 Services 面板按任一列的「跳轉」，cmux 切到那個服務的 workspace。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- `scripts/ccv.mjs` 已有 `check-focus`，`click focus` 會收事件（spec `specs/focus-check.md`）。
- cmux 是前景 app。`actions.log` 每行的 `front=` 要是 `cmux`。不是時，結果不算數。

- **server 列（`focus-tab`）。** launch 後直接執行 `ccv click focus`，再執行 `ccv check-focus`，回報 `FOCUS PASS`。
- **背景列（`focus-bg`）。** `ccv cleanup` 後重新 `ccv launch`，執行 `ccv bg-start`。不切換任何 workspace，直接執行 `ccv click focus bg`，再執行 `ccv check-focus`，回報 `FOCUS PASS`。
- **已經選取目標（`focus-negative`）。** 執行 `cmux select-workspace --workspace <server 的 workspace> --window <run 的 window>`，等 1 秒。執行 `ccv click focus`，再執行 `ccv check-focus`，回報 `FOCUS FAIL`，原因寫「點擊前已經選取目標」。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md` 各跑一次，再照 `services-focus.md`、`services-background.md` 的 `bg-focus`、`services-agent-tab.md` 的 `agent-bg-focus` 各跑一次。

## Gotchas

- 不要用 `cmux tree` 或 `ccv capture` 的 `tree` 判斷跳轉成功與否。2026-11-03 實測，`cmux tree` 在點擊後至少 14 秒仍回報舊的選取，畫面與事件卻已經切換（run `20261103T160254-p0vh`）。2026-11-04 追查：`ccv launch` 後直接點跳轉，3 次都會落後，不需要 Claude；`current-workspace`、`list-workspaces`、`identify` 也一樣讀到舊值，約 1 分鐘後才更新。根本原因未查出，細節見 `specs/focus-check.md` 的 How。
- `check-focus` 只看點擊後 5 秒內的事件。
- `bg-start` 會用到 token。
- `check-focus` 要從點擊**之前**起算。cmux-cua 的點擊呼叫回傳前後差約 2 秒，從回傳後起算會漏掉事件。第一版就是這樣錯的（run `20261103T160701-eb2s`）。
- 2026-11-03 實跑結果（cmux 在前景）：
  - `focus-tab` PASS：0.1 秒收到切換事件（run `20261103T160828-kmqv`）。
  - `focus-negative` 如預期 FAIL：「點擊前已經選取目標」（同一個 run）。
  - `focus-bg` PASS：launch、`bg-start` 後直接點，0.1 秒收到切換事件；同一次 capture 的 `tree` 在 10 秒後仍回報原 workspace（run `20261103T160904-qz0k`）。
  - 回歸 install、list、stop PASS（run `20261103T160828-kmqv`）。
