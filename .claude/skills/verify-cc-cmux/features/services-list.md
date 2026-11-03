# 列出監聽中的 port

面板依 port 由小到大列出 cmux 分頁裡正在監聽的 port。每一列顯示 `:<port>`，以及「workspace 名稱 · 分頁名稱」。標題列右邊顯示總數。

## Sub-features

- `list-row`：分頁前景啟動的服務，在面板出現一列 `:<port>`。
- `list-subtitle`：這一列的副標是「workspace 名稱 · 分頁名稱」。
- `list-count`：標題列右邊的數字等於列數。
- `list-agent-dot`：分頁有 agent 時，圓點是橘色，停止按鈕換成鎖頭。
- `list-empty`：沒有 port 時，顯示「沒有偵測到監聽中的 port」。

## How to get to it (user POV)

- 打開右側欄的 Services 面板。
- 在 cmux 分頁的前景啟動一個服務，例如 `python3 -m http.server`。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`。
- `ccv doctor` 全部 `OK`。

- **出現一列。** launch 的就緒條件包含面板 AX 樹有 `:<port>`。執行 `ccv capture list`。`list.txt` 的 `panel row :<port>` 是 `present`。
- **副標與總數。** 看 `list.png`。這一列的副標以 `verify-svc-<run>` 開頭，標題列的數字至少是 1。
- **agent 圓點與鎖頭。** ccv 還沒有對應的指令。2026-11-03 手動實跑一次，結果是 **FAIL**（run `20261103T151820-0cg0`）：
  - 做法：在本次 run 的 window 開一個 workspace，指令是先用 `&` 在背景啟動 `python3 -I -m http.server <port>`，再在同一個分頁啟動 `claude`。
  - 結果：`:<port>` 那一列的副標是那個分頁的名稱，但圓點是綠色，按鈕是紅色的停止，不是橘點和鎖頭。
  - 原因：`ccv probe` 顯示 agent 的 `panelId` 等於分頁的 `id`，agent 的 `surfaceId` 是另一個值。`sidebars/services.js` 用 agent 的 `surfaceId` 比對分頁，永遠對不上。
  - 注意：用 `&` 啟動的 server 不在 ccv 的紀錄裡，`ccv cleanup` 關掉 window 後它還會留著，要另外停掉。
- **空狀態。** 先 `ccv click stop`，再看 `ccv check-stop` 的 `PANEL_UPDATE`。PASS 時，本次 run 的 window 沒有其他 port，面板應顯示空狀態。

## Gotchas

- 面板只列出分頁 tty 上的行程。Claude 背景 Bash 啟動的服務沒有 tty，不會出現在面板上。cmux 仍會在 workspace 層的 ports 偵測到它。
- 面板列出的 port 可能包含使用者其他 window 的服務。這一點沒有驗證過。只操作 `:<測試 port>` 那一列。
- 副標太長時會從中間截斷。比對時只看開頭，不要比對全文。
- `list-agent-dot` 與 `list-empty` 都沒有驗證過。
