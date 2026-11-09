# 顯示電腦的 CPU 與記憶體

使用者照 README 開「系統」workspace 後，Services 面板的標題列下面會出現一行，例如 `CPU 42% · 記憶體 33.7 / 48 GB`。任一項 85% 以上時變紅。按 Ctrl+C 停掉監控程式後，這一行消失。監控程式異常結束時，30 秒後這一行變成 `系統狀況 已停止更新`。

## Sub-features

- `sys-row`：開「系統」workspace 後，面板在 7d 列上面出現 `CPU <N>% · 記憶體 <U> / <T> GB`，`sidebar-state` 的 `progress=` label 以 `cc-cmux:sys:` 開頭。（spec 成功條件 1、2、6、9）
- `sys-red`：寫一筆 CPU 90% 的測試值後，這一行是紅色；寫 CPU 10%、記憶體 50% 時不是紅色。（成功條件 3）
- `sys-stop`：對「系統」分頁送 Ctrl+C 後，`sidebar-state` 沒有 `cc-cmux:sys:`，面板這一行消失。（成功條件 5、7）
- `sys-stale`：用 SIGKILL 結束監控程式，30 秒後這一行顯示 `系統狀況 已停止更新`。（成功條件 4）
- `sys-compare`：label 的已用 GiB 和活動監視器的 App Memory + Wired Memory + Compressed 相差 1 GB 以內。（成功條件 8）

## How to get to it (user POV)

- 照 README 執行一行 `cmux new-workspace --name 系統 --command ...`，再看右側欄的 Services 面板。面板和「系統」workspace 要在同一個 window。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- `scripts/ccv.mjs` 已有 `sys-start`、`sys-rows`、`sys-set`、`sys-stop`、`sys-compare`（spec `specs/system-stats.md` 的「ccv 需要的擴充」）。
- cmux 是前景 app。`actions.log` 每行的 `front=` 與 capture 的 `## front app` 要是 `cmux`。不是時，結果不算數。

- **沒有資料。** 執行 `ccv sys-rows`。輸出是 `(面板沒有系統列)`。
- **顯示一行（`sys-row`）。** 執行 `ccv capture sys-row-before`，再執行 `ccv sys-start`，等到回報 `SYS READY`。執行 `ccv sys-rows`：輸出符合 `^CPU \d+% · 記憶體 \d+\.\d / \d+ GB$`。執行 `ccv capture sys-row-after`：「系統」workspace 的 `progress=` label 以 `cc-cmux:sys:` 開頭；截圖裡這一行在 7d 列上面。等 15 秒再 capture 一次 `sys-row-later`：label 的寫入時間變大。
- **對照活動監視器（`sys-compare`）。** 執行 `ccv sys-compare`。輸出最後一行是 `PASS` 或 `FAIL`，寫出 label 的已用 GiB、活動監視器三項的和與差距。差距 1 GB 以內才算 PASS。看 `sys-compare.png`，確認三項的值和輸出一致。FAIL 時回報，回到規劃。
- **停止（`sys-stop`）。** 執行 `ccv sys-stop int`，等 5 秒。`ccv sys-rows` 輸出 `(面板沒有系統列)`。執行 `ccv capture sys-stop`：「系統」workspace 沒有 `cc-cmux:sys:` 的 `progress=`。
- **異常結束（`sys-stale`）。** 執行 `ccv sys-start`，等 `SYS READY`。執行 `ccv sys-stop kill`，等 35 秒。`ccv sys-rows` 輸出 `系統狀況 已停止更新`。執行 `ccv capture sys-stale`。
- **變紅（`sys-red`）。** 執行 `ccv cleanup`，重新 `ccv launch`。執行 `ccv sys-set 10 24 48`，再執行 `ccv capture sys-red-before`：`ccv sys-rows` 是 `CPU 10% · 記憶體 24.0 / 48 GB`。執行 `ccv sys-set 90 24 48`，再執行 `ccv capture sys-red`：`ccv sys-rows` 是 `CPU 90% · 記憶體 24.0 / 48 GB`。看截圖：`sys-red.png` 的這一行是紅色，`sys-red-before.png` 不是。
- **回歸。** 照 `install.md`、`services-list.md` 各跑一次，再照 `claude-rate-limit.md` 跑 `usage-row`。

## Gotchas

- 面板只看得到同一個 window 的 workspace。使用者自己 window 的「系統」workspace 不會出現在 `ccv launch` 開的 window。
- `sys-set` 寫在 server 的 workspace，會蓋掉那個 workspace 的 `progress`。不要和 `usage-set personal` 同時用。
- 顏色不用 AX 讀，只用截圖判斷。
- CPU 是瞬間值，每一輪都會變。判定只看格式，不看數字。
- 活動監視器的數字也一直在變。`sys-compare` 要在同一秒內讀 label 與截圖。
- 不要和活動監視器的「Memory Used」比。它比 App + Wired + Compressed 多約 1 GB，算法未查證（2026-11-09 實測）。
- 活動監視器要停在 Memory 分頁。AX 的元素數超過預設上限，`sys-compare` 用 `max_elements: 5000` 讀。
- `cmux tree` 會落後，`sys-start` 30 秒內可能還看不到新分頁的 tty。所以 `sys-start` 比對啟動前後的監控程式 PID，不讀 tree。啟動期間使用者自己也開了監控程式時，`sys-start` 會回報失敗。
- 回歸的 `usage-row` 用 `usage-set work`，不用 `personal`。理由：`personal` 寫在 server 的 workspace，會蓋掉 `sys-set` 寫的值。
- `ccv cleanup` 關掉 window 後，監控程式收到 SIGHUP 結束，沒有殘留行程（2026-11-09 實跑）。
- 2026-11-09 實跑結果：sys-row、sys-compare（差 0.01 GB）、sys-stop、sys-stale PASS（run `20261109T081327-4no6`）；sys-red PASS，回歸 install、list、usage-row、stop PASS（run `20261109T081526-txxx`）。兩個 run 的動作前景都是 cmux。run `20261109T080808-euwc`、`20261109T080946-qdfn` 前景是 Google Chrome，不算數。
- 只有單元測試、沒有實跑：兩個「系統」workspace 取最新一筆、label 格式錯時略過、`cmux` 卡住、`vm_stat` 失敗。
