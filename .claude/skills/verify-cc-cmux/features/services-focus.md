# 跳到服務的分頁

使用者點一列的「跳轉」按鈕（`arrow.right.square` 圖示），cmux 切到執行這個服務的 workspace 與分頁。

## Sub-features

- `focus-switch`：點擊後，這個 window 選取的 workspace 變成 server 所在的 workspace。

## How to get to it (user POV)

- 在 Services 面板上，點那一列中間的按鈕（停止按鈕左邊那個）。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`。
- `ccv doctor` 全部 `OK`。
- 本次 run 的 window 目前選取的是第一個 workspace（`verify-cc-cmux-<run>`），不是 server 所在的 workspace。launch 後就是這個狀態。

- **記錄操作前。** 執行 `ccv capture before-focus`。`before-focus.txt` 的 `tree` 裡，`verify-cc-cmux-<run>` 標著 `[selected]`。
- **點跳轉。** 執行 `ccv click focus`。
- **確認結果。** 執行 `ccv capture after-focus`。`after-focus.txt` 的 `tree` 裡，`verify-svc-<run>` 標著 `[selected]`；`after-focus.png` 的中間區域顯示 server 分頁，畫面有 `Serving HTTP on 127.0.0.1 port <port>`。

## Gotchas

- 這個功能還沒實跑過。
- 跳轉按鈕距離 window 右緣 63 pt，是從截圖量出來的。面板版面改了，就要重量。
- 點擊前 ccv 會把本次 run 的 window 移到最前面。不要把「window 在最前面」當成跳轉成功的證據。
