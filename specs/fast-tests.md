# 單元測試在 2 秒內跑完，pre-commit 跑測試

`node --test tests/*.test.mjs` 全部在 2 秒內跑完，pre-commit 每次 commit 都跑全部測試，測試失敗就擋下 commit。

## Why（為什麼要做）

跑測試和 commit 串在同一個指令時，測試失敗也可能 commit 成功。`node --test … | grep … && git commit` 這種寫法出現過 2 次：grep 找到 `# fail N` 也回傳成功，`&&` 擋不住。文字規則擋不住這種寫法，要由 pre-commit 擋。

pre-commit 每次 commit 都會跑，測試太慢會拖慢每一次 commit。2026-11-11 實測全部測試要約 16.8 秒，所以要先把測試壓到 2 秒以內，才加進 pre-commit。

## How（現在怎麼做）

- `.githooks/pre-commit` 只跑 `scripts/check-no-comments.mjs --staged` 與 `scripts/check-spec.mjs --staged`，不跑測試。
- 2026-11-11 分檔實測：`system-stats.test.mjs` 16.5 秒、`report-rate-limit.test.mjs` 2.3 秒、`register-agent.test.mjs` 1.2 秒、`services.test.mjs` 0.09 秒。`node --test` 讓不同檔並行，所以總時間由最慢的檔決定。
- 同一個檔裡的測試依序執行。`system-stats.test.mjs` 的 9 個測試各等監控程式 1.6～4.2 秒，加起來 16.45 秒。
- `monitor/system-stats.mjs:56` 把第一次寫入寫死在 1000 ms。`CC_CMUX_SYS_INTERVAL_MS`（`:10`）只改之後的間隔。所以每個測試至少要等 1 秒。
- `monitor/system-stats.mjs:15` 把 `execFile` 的 timeout 寫死在 1000 ms。「cmux 卡住」的測試假 cmux 會 `sleep 30`，每次呼叫都等滿 1 秒，所以這個測試要 4.2 秒。
- 「1 秒內結束」的測試有兩個：`tests/report-rate-limit.test.mjs:80`（`statusline/report-rate-limit.mjs:17` 的 1000 ms）與 `tests/register-agent.test.mjs:82`（`hooks/register-agent.mjs:13` 的 1000 ms）。兩個各約 1.02 秒。
- `report-rate-limit.test.mjs` 其他測試各約 0.33～0.39 秒，依序加起來約 2.3 秒。
- 一個測試的時間拆開量（2026-11-11）：
  - node 啟動：`/usr/bin/time -p node -e 0` 三次都是 `real 0.01`。
  - 新建的腳本第一次執行：建一個 `#!/bin/sh` 腳本後連跑三次，`real` 是 0.32、0.00、0.00。4 個新腳本同時執行是 0.41。
  - report-rate-limit 的寫入程式：每次新建假 cmux 時是 210、124、135 ms；重複用同一個假 cmux 時是 48、41、27 ms。量測腳本用 `spawnSync` 執行 `statusline/report-rate-limit.mjs`，假 cmux 只有 `exit 0`。
- 所以每個測試的額外時間，主要是新建的假 `cmux`、`vm_stat` 第一次執行。每個測試都呼叫 `fakeBin()` 或 `fakeCmux()` 新建腳本。並行時這段等待會疊在一起：system-stats 改成並行後，子行程第一次輸出在 712～1244 ms，設了 `CC_CMUX_SYS_FIRST_MS=50` 也一樣，11 個測試有 10 個失敗。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 監控程式的第一次延遲 | 新增 `CC_CMUX_SYS_FIRST_MS`，預設 1000 | 照 `CC_CMUX_SYS_INTERVAL_MS` 的寫法 `Number(...) \|\| 預設值`，預設行為不變。（自動採用建議） |
| 監控程式的指令逾時 | 新增 `CC_CMUX_SYS_TIMEOUT_MS`，預設 1000 | 同上。「cmux 卡住」的測試才能用短的逾時。（自動採用建議） |
| 預設 1 秒的第一次延遲要不要保留測試 | 保留一個測試不設 `CC_CMUX_SYS_FIRST_MS`，確認第一次寫入在 0.9 秒之後、2 秒之前 | 其他測試都改用短的值後，沒有測試保護預設值。（自動採用建議） |
| 兩個「1 秒內結束」的測試 | 照舊測真的 1 秒，不加環境變數 | 1 秒上限是使用者看得到的保證：statusline 與 hook 不能拖住 Claude。測試要保護真的值。（自動採用建議） |
| 測試的時間怎麼壓 | 每個測試檔的假腳本只在載入時建一次，各測試用環境變數指定記錄檔與行為（例如卡住幾秒、`vm_stat` 失敗）。`system-stats.test.mjs` 另外包進 `describe(..., { concurrency: true })` 並行 | 重複用同一個腳本，就不必每次等第一次執行。system-stats 有一個測預設 1 秒延遲的測試，依序跑會超過 2 秒，所以要並行。report-rate-limit 依序跑約 1.4 秒，不必並行。（自動採用建議） |
| 修正：原本的「測試的時間怎麼壓」 | 原本選「兩個檔都並行」，改成上一列 | 原本只量了總時間，以為時間都花在等待。拆開量後發現主要是新建的假腳本第一次執行。並行時 11 個測試有 10 個失敗。（自動採用建議） |
| pre-commit 跑什麼 | 在 `check-no-comments` 之後、`check-spec` 之前跑 `node --test tests/*.test.mjs`，失敗就 exit 1 | 跑全部測試最簡單。測試只要 2 秒以內，就不必挑檔。（自動採用建議） |
| 要不要新增功能檔 | 不新增。驗收用 `system-stats.md` 的 `sys-row` 與 `sys-stop` 做回歸 | 使用者看得到的行為不變，沒有新的 sub-feature。（自動採用建議） |

## 成功條件

- `node --test tests/*.test.mjs` 的 `# duration_ms` 小於 2000，連跑 5 次都是。
- 5 次都是 `# fail 0`。
- `node monitor/system-stats.mjs` 不設新的環境變數時，第一次 `cmux set-progress` 在啟動後約 1 秒，cmux 卡住時每次呼叫最多等 1 秒。
- `.githooks/pre-commit` 跑測試。故意讓一條測試失敗時，`git commit` 回傳非 0，`git log -1` 不變。
- 實跑 `system-stats.md` 的 `sys-row` 與 `sys-stop` PASS。

## 邊界情況

| 情況 | 行為 |
|------|------|
| 環境變數不是數字或是 0 | `Number(...) \|\| 預設值` 回到 1000 |
| 測試並行時機器很忙 | 每個測試的等待時間要留餘裕，例如短逾時的測試至少等 3 輪。假腳本在測試開始前先各執行一次 |
| commit 只改文件 | pre-commit 一樣跑全部測試 |
| 工作區有沒 stage 的程式改動 | pre-commit 跑的是工作區的檔案，不是 staged 的版本。記在 README 的「維護」 |

## 資料流範例

不適用：這次只改測試的速度與 pre-commit，沒有新的資料寫進 cmux 或面板。

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `monitor/system-stats.mjs` | 讀 `CC_CMUX_SYS_FIRST_MS` 與 `CC_CMUX_SYS_TIMEOUT_MS`，預設 1000 |
| `tests/system-stats.test.mjs` | 假腳本只建一次；改用短的值；保留一個測預設延遲的測試；測試包進並行的 `describe` |
| `tests/report-rate-limit.test.mjs` | 假 cmux 只建一次，各測試用環境變數指定記錄檔與卡住的秒數 |
| `.githooks/pre-commit` | 跑 `node --test tests/*.test.mjs` |
| `README.md` | 「維護」表加一列；監控程式一節寫出兩個新的環境變數 |
| `.claude/skills/retro-cc-cmux/log.md` | 加一筆紀錄 |

不改的檔案與理由：

- `statusline/report-rate-limit.mjs`、`hooks/register-agent.mjs`：1 秒上限照舊，測試照舊測真的值。
- `tests/register-agent.test.mjs`：依序跑約 1.2 秒，已經在 2 秒以內。
- `sidebars/services.js`：面板不受影響。

## 測試清單

單元測試（`tests/`，實作時先寫、先看到失敗）：

1. 設 `CC_CMUX_SYS_FIRST_MS=50` 時，啟動後 0.5 秒內有第一次 `set-progress`。
2. 設 `CC_CMUX_SYS_TIMEOUT_MS=100`、假 cmux `sleep 30` 時，1 秒內至少呼叫 2 次 `set-progress`。
3. 不設 `CC_CMUX_SYS_FIRST_MS` 時，第一次 `set-progress` 在啟動後 0.9 秒之後、2 秒之前。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/system-stats.md`
- sub-feature：`sys-row`、`sys-stop`
- 回歸：install、list、stop

## ccv 需要的擴充

- 無。

## 不做的事

- 不改 statusline 與 hook 的 1 秒上限。
- pre-commit 不只跑和 staged 檔案有關的測試。

## 未決問題

