# 顯示 Claude 7 天額度的剩餘時間

使用者在 cmux 裡用 Claude Code 時，Services 面板的標題列下面會出現一列，例如 `個人 7d 剩 2 天 5 小時 · 已用 78%`。個人帳號與公司帳號各一列。已用 85% 以上時，那一列變紅。沒有資料時顯示 `7d 無資料`。

## Sub-features

- `usage-row`：寫入一筆個人帳號的資料後，面板出現 `個人 7d 剩 ... · 已用 N%`，`sidebar-state` 的 `progress=` label 以 `cc-cmux:7d:personal:` 開頭。
- `usage-red`：已用 90% 時，那一列是紅色。
- `usage-accounts`：個人與公司各寫一筆後，面板出現兩列，個人在上、公司在下。
- `usage-live`：在真的 Claude Code 互動 session 裡，statusline 觸發寫入，面板出現真實數字。個人帳號與公司帳號各做一次。
- `usage-cleanup`：`ccv cleanup` 關掉 run 的 window 後，重新 `ccv launch`，面板顯示 `7d 無資料`。

## How to get to it (user POV)

- 照 README 在 statusline 腳本加上呼叫 `statusline/report-rate-limit.mjs` 的那一行。在 cmux 裡開 Claude Code，送出一句 prompt，再看右側欄的 Services 面板。面板和 Claude 要在同一個 window。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`，`ccv doctor` 全部 `OK`。
- `scripts/ccv.mjs` 已有 `usage-set`、`usage-rows`、`usage-live`（spec `specs/claude-rate-limit.md` 的「ccv 需要的擴充」）。
- `usage-live` 前，使用者的 statusline 腳本已加上呼叫寫入程式的那一行。
- cmux 是前景 app。`actions.log` 每行的 `front=` 與 capture 的 `## front app` 要是 `cmux`。不是時，結果不算數。

- **沒有資料（`usage-cleanup` 的起點）。** 執行 `ccv usage-rows`。輸出只有一列 `7d 無資料`。
- **顯示一列（`usage-row`）。** 執行 `ccv capture usage-row-before`，再執行 `ccv usage-set personal 78 191100`（2 天 5 小時 5 分）。執行 `ccv usage-rows`：輸出有 `個人 7d 剩 2 天 5 小時 · 已用 78%`，沒有 `7d 無資料`。執行 `ccv capture usage-row-after`：`progress=` 行的 label 以 `cc-cmux:7d:personal:` 開頭。
- **變紅（`usage-red`）。** 執行 `ccv usage-set personal 90 191100`，再執行 `ccv capture usage-red`。`ccv usage-rows` 的輸出有 `已用 90%`。看 `usage-red.png`：那一列的文字是紅色，`usage-row-after.png` 的同一列不是紅色。
- **兩個帳號（`usage-accounts`）。** 執行 `ccv usage-set work 31 353000`，再執行 `ccv usage-rows`。輸出依序是 `個人 7d ...`、`公司 7d 剩 4 天 2 小時 · 已用 31%`。執行 `ccv capture usage-accounts`。
- **真實資料（`usage-live`）。** 執行 `ccv cleanup`，重新 `ccv launch`。執行 `ccv usage-live`，等到回報就緒。`ccv usage-rows` 的輸出有 `個人 7d ...`，`progress=` label 以 `cc-cmux:7d:personal:` 開頭。再執行 `ccv usage-live work`：輸出多一列 `公司 7d ...`，label 以 `cc-cmux:7d:work:` 開頭。各做一次 `ccv capture`。
- **清掉（`usage-cleanup`）。** 執行 `ccv cleanup`，重新 `ccv launch`。`ccv usage-rows` 只有 `7d 無資料`。
- **回歸。** 照 `install.md`、`services-list.md`、`services-stop.md` 各跑一次。

## Gotchas

- 面板只看得到同一個 window 的 workspace。使用者自己 window 裡的 Claude 寫入的值，不會出現在 `ccv launch` 開的 window。反過來，測試寫入的值也不會影響使用者的 window。
- statusline 只在互動模式執行。`ccv bg-start` 用的 `claude -p` 不會觸發寫入，不能拿來驗 `usage-live`。
- `usage-live` 會用到 token。`work` 會用公司帳號的額度。
- `rate_limits` 在 session 第一個 API 回應之後才出現。`usage-live` 要送出 prompt 並等到回應，才會有寫入。
- 公司帳號的 statusline 子行程會不會繼承 `CLAUDE_CONFIG_DIR`，規劃時未實測。`usage-live work` 的 label 是 `personal` 時，回報失敗，回到規劃。
- `usage-set` 的剩餘秒數從執行當下算起。`ccv usage-rows` 若在跨分鐘時執行，分鐘數可能差 1（面板的 clock 約每秒更新一次）；判定只看天與小時。
- 顏色不用 AX 讀。只用截圖判斷。
- `usage-live work` 第一次在這個 repo 目錄啟動公司帳號時，會出現信任對話框，預設選項是「No, exit」。`ccv usage-live` 先送「下」，確認選到「Yes, I trust this folder」才送 Enter。只送 Enter 會讓 Claude 直接結束。
- `cmux shot` 偶爾回報 `OwnWindowFrameCapture.Failure`，capture 會中斷，那一份 `.txt` 也不會產生。重跑同一個 capture 即可。
- 2026-11-02 實跑：cmux 在背景（前景是 Google Chrome）時，`set-progress` 寫入後，面板的 7d 列一樣在 5 秒內更新（run `20261102T144920-uetn`）。
- 2026-11-02 實跑結果：usage-row、usage-red、usage-accounts、usage-cleanup PASS（run `20261102T144819-d7qp`、`20261102T144951-jkcg`）。usage-live 兩個帳號在 cmux 前景時 PASS（run `20261102T145342-6cem`）；先前 run `20261102T144920-uetn` 前景是 Google Chrome，不算數。回歸 install、list、stop PASS（run `20261102T144951-jkcg`）。
- 只有單元測試、沒有實跑：同一個帳號在兩個 workspace 有值時取最新一筆、label 格式錯時略過、clock 前進時剩餘時間跟著變。
