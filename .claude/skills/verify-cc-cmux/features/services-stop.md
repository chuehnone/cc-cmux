# 停止服務

使用者點一列的「停止」按鈕（紅色 `stop.circle` 圖示），面板對那個分頁送 Ctrl+C。服務結束後，那一列從面板消失。分頁有 agent 時，按鈕換成鎖頭，點了也不送 Ctrl+C。

## Sub-features

- `stop-effect`：點擊後，服務收到 Ctrl+C 並結束：port 釋放、server 行程結束、分頁畫面有 `^C`。
- `stop-panel`：點擊後 15 秒內，那一列從面板消失。
- `stop-agent-lock`：分頁有 agent 時，不送 Ctrl+C。

## How to get to it (user POV)

- 在 Services 面板上，點那一列最右邊的紅色按鈕。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`。
- `ccv doctor` 全部 `OK`。

- **記錄操作前。** 執行 `ccv capture before-stop`。`before-stop.txt` 的 port 在 LISTEN，`panel row` 是 `present`。
- **點停止。** 執行 `ccv click stop`。輸出 `CLICKED stop scale=<倍率> px=<x>,<y>`。`actions.log` 記錄當下的 `shotWidth`、`boundsWidth` 與倍率。
- **檢查兩項結果。** 執行 `ccv check-stop`。這個指令從點擊的時間點開始計時，最多 15 秒，分別回報兩項：
  - `STOP_EFFECT PASS`：port 沒有 LISTEN、server 行程不存在、分頁畫面有 `^C`。
  - `PANEL_UPDATE PASS`：面板的 `:<port>` 已消失。
- **判定。** 兩項都 PASS，exit 0，才算通過。任一項 FAIL，就照實回報失敗。不要延長 15 秒，也不要改用 `sidebar-state` 或畫面截圖代替。`check-stop` 會另外存一份 `check-stop.txt` 與 capture。
- **清理。** 執行 `ccv cleanup`。

## Gotchas

- **已知問題：cmux 有時不更新 port。** `STOP_EFFECT` 通過，但 `PANEL_UPDATE` 可能失敗：port 已經釋放，cmux 的 `sidebar-state` 仍回報這個 port，面板那一列也還在。2026-11-01 的紀錄：
  - `check-stop` 跑 22 次：`STOP_EFFECT` 22 次 PASS；`PANEL_UPDATE` 16 次 PASS、6 次 FAIL。
  - 6 次 FAIL 中，5 次在點擊前跑了 `ccv capture before-stop`，1 次在 launch 後等 4 秒再點。
  - 點擊前不跑 capture、立刻點擊的 2 次都 PASS（約 6 秒）。單獨在點擊前執行 `cmux shot`、`sidebar-state`、`list-windows`、`tree`、`read-screen` 的各 1 次也都 PASS。
  - 依點擊時間排列（以 workspace 建立為起點）：9.1 秒、10.8 秒、12.9 秒、13.0 秒 PASS；12.0 秒一次 PASS、一次 FAIL。
  - FAIL 之後，對 server 分頁按 Enter，cmux 3 秒內就移除了 port。
- **推測，未證實。** cmux 只在 shell 送 `ports_kick` 時掃描，每次 kick 會在 0.5、1.5、3、5、7.5、10 秒各掃一次。port 要連續 3 次掃不到才移除。zsh 回到 prompt 時會送 kick。推測：Ctrl+C 剛好落在指令啟動時那一輪掃描的尾段時，新的 kick 沒有觸發足夠的掃描。cmux 原始碼的註解說，這種情況會補跑一輪，但實測沒有。追蹤 issue：https://github.com/chuehnone/cc-cmux/issues/1
- 不要在 `check-stop` 前後對 server 分頁按 Enter 來「修正」。那會繞過要驗證的使用者路徑。
- 停止按鈕距離 window 右緣 34 pt，是從截圖量出來的。面板版面改了，就要重量。
- 倍率每次點擊前重算：`cmux shot` 的寬度除以 cmux-cua 回報的 window 寬度。倍率不在 1 到 3 之間，或 window 高度小於 200 pt 時，`ccv click` 拒絕點擊。2026-11-01 修正後的 32 次點擊，都在 1 倍螢幕上（倍率 1）。2 倍螢幕在修正後還沒有重測。
- `stop-agent-lock` 沒有驗證過。ccv 不會在本次 run 的分頁裡啟動 agent。
