# 顯示電腦的 CPU 與記憶體

在 Services 面板的標題列下面，顯示整機 CPU 使用率與記憶體已用量，例如 `CPU 42% · 記憶體 33.7 / 48 GB`。任一項 85% 以上時變紅。資料由專用的「系統」workspace 裡的監控程式寫入。

## Why（為什麼要做）

使用者同時開多個 Claude session 與 dev server，要判斷電腦是不是快撐不住。現在要另外開活動監視器或 `top` 才看得到。面板平常就開著，放在面板上一眼就看得到，高用量時也會被提醒。

找出哪個行程吃資源不是這次的目的。那件事用活動監視器比較適合。

## How（現在怎麼做）

- sidebar 讀得到的資料沒有 CPU 或記憶體欄位（`cmux docs sidebars` 的「Live data you can bind to」）。
- sidebar 沒有檔案系統、網路與計時器（`cmux docs sidebars` 的「Containment」）。面板自己算不出 CPU 與記憶體。
- sidebar 讀得到、外部又寫得進去的 workspace 欄位：`progress`、`description`、`color`、`title`。`cmux set-status` 寫的值不在 sidebar 的資料裡（`specs/claude-rate-limit.md` 的 How）。
- 每個 workspace 只有一個 `progress`。7d 額度功能把 `progress` 寫成 `cc-cmux:7d:...`，寫在有 Claude 的 workspace（`statusline/report-rate-limit.mjs`）。
- 7d 寫入程式只在 statusline 執行時跑，不是持續執行的程式。
- sidebar 的 `workspaces` 只含面板所在的 window（`specs/claude-rate-limit.md` 的 How）。
- `progress` 會在左側欄畫一條進度條（`specs/claude-rate-limit.md` 的決策表）。
- `cmux set-progress` 寫入的值會留著，直到 `cmux clear-progress`（`cmux --help`）。
- `cmux new-workspace` 有 `--name` 與 `--command` 參數（`cmux --help`）。實際行為未實測。
- 本機 `top -l 2 -n 0` 印出 `CPU usage: 30.63% user, 11.98% sys, 57.37% idle`。這是所有核心合計的比例。
- 本機 `sysctl hw.memsize` 是 51539607552（48 GiB）。
- `top` 的 `PhysMem: 46G used` 包含檔案快取（`vm_stat` 的 File-backed 12.5 GiB），不能當已用量。
- `vm_stat` 算出：Anonymous − purgeable 24.6 GiB、wired 3.7 GiB、壓縮 5.3 GiB，合計 33.64 GiB。活動監視器「Memory Used」的算法 Apple 沒有公開，未查證。2026-11-09 實測，它比活動監視器自己的 App Memory + Wired Memory + Compressed 多約 1 GB。
- Node 的 `os.cpus()` 回傳每顆核心的累計時間（user、nice、sys、idle、irq）。兩次取樣相減可算 CPU 使用率。和 `top` 是否一致，未實測。
- 面板標題列與 7d 列在 `sidebars/services.js:131-141`。7d 的紅色是 `#FF453A`，門檻 85%，用四捨五入後的整數判斷（`sidebars/services.js:72-77`）。
- `tests/harness.mjs` 模擬 `data.workspaces` 與 `data.clock`（`tests/harness.mjs:54`）。
- 寫入程式的測試在 `PATH` 前面放一支假的 `cmux`（`tests/report-rate-limit.test.mjs:10-16`）。
- `ccv usage-rows` 只抓 `/^(個人 |公司 )?7d /` 開頭的 AX 文字（`.claude/skills/verify-cc-cmux/scripts/ccv.mjs:127`）。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 顯示什麼 | 整機 CPU % 與記憶體已用／總量 | 要判斷電腦是不是快撐不住。找行程用活動監視器。 |
| 位置 | 標題列下面、7d 列上面，一行文字，字級 11 | 和 7d 額度都是全域狀態，放一起好掃。右側欄一次只顯示一個面板，另開面板要切換才看得到。 |
| 格式 | `CPU <N>% · 記憶體 <U> / <T> GB`。`N` 四捨五入成整數，`U` 取小數一位，`T` 取整數 | 一行看得完。 |
| 提醒 | CPU 或記憶體已用比例，四捨五入後 ≥ 85 時整列 `#FF453A`，否則 `secondary` | 沿用 7d 的門檻與顏色。 |
| CPU 的值 | 兩次取樣之間的瞬間值，不取平均 | 先用最簡單的做法。用了覺得太吵再改。 |
| 更新頻率 | 每 10 秒寫一次 | 夠反映狀況，又不會一直叫 `cmux`。 |
| 管道 | 專用的「系統」workspace 跑 `monitor/system-stats.mjs`，寫自己 workspace 的 `progress` | 不和 7d 額度搶欄位，不蓋掉使用者的 workspace 說明，不改 repo 外的檔案。代價：左側欄多一個 workspace。 |
| label 格式 | `cc-cmux:sys:<寫入時間>:<CPU%>:<已用 GiB>:<總量 GiB>`，`progress` 的值是已用／總量，夾在 0–1 | 面板只讀 label。進度條剛好顯示記憶體用量。 |
| 記憶體算法 | (Anonymous − purgeable + wired + 壓縮) × page size，單位 GiB | 最可能和活動監視器一致。`top` 的 used 包含快取，幾乎永遠滿載。實跑時對照，差超過 1 GB 就回來討論（實作時已討論，見「驗收的比較對象」）。 |
| CPU 算法 | `os.cpus()` 兩次取樣相減，(總時間 − idle) ÷ 總時間 | 不用每 10 秒另外跑 `top`。 |
| 停止後 | 收到 SIGINT、SIGTERM、SIGHUP 時先 `cmux clear-progress` 再結束；寫入時間超過 30 秒時顯示 `系統狀況 已停止更新` | 最危險的是程式停了、畫面還顯示舊數字。 |
| 沒資料時 | 不顯示這一行 | 沒開「系統」workspace 就是不想看。 |
| 啟動方式 | README 寫一行 `cmux new-workspace --name 系統 --command ...` | 使用者自己決定要不要開。 |
| 修正範例值（實作時） | 資料流範例的已用量由 33.69 改成 33.64，`progress` 存的值改成兩位小數 | 規劃時沒有從 `vm_stat` 頁數重算，實作第 8 條測試時發現。`sidebar-state` 的兩位小數是 `ccv sys-set` 實跑看到的。 |
| 驗收的比較對象（實作時） | 和活動監視器的 App Memory + Wired Memory + Compressed 比，不和「Memory Used」比。算法維持 A | 2026-11-09 同時讀三次，A 和「Memory Used」差 0.99–1.55 GB。活動監視器自己的三項和也比「Memory Used」少約 1 GB，「Memory Used」的算法未查證。另一個算法（總量 − free − 檔案快取 − purgeable − speculative）差 0.16–0.84 GB，但那是用三個樣本湊出來的。使用者選保留 A。代價：面板的數字一直比「Memory Used」少約 1 GB。 |

## 成功條件

1. 有 `cc-cmux:sys:` 資料且寫入時間在 30 秒內時，面板標題列下面、7d 列上面出現一行 `CPU <N>% · 記憶體 <U> / <T> GB`。
2. `N` 是 CPU% 四捨五入的整數。`U` 是已用 GiB 取小數一位。`T` 是總量 GiB 四捨五入的整數。
3. CPU% 四捨五入 ≥ 85，或 已用 ÷ 總量 × 100 四捨五入 ≥ 85 時，這一行的 `color` 是 `#FF453A`，否則是 `secondary`。
4. 寫入時間比 `data.clock().epoch` 早超過 30 秒時，這一行顯示 `系統狀況 已停止更新`，`color` 是 `tertiary`。
5. 沒有任何 `cc-cmux:sys:` 資料時，不畫這一行。
6. 監控程式在 cmux 裡執行時，10 秒內該 workspace 的 `cmux sidebar-state` 出現 `progress=`，label 以 `cc-cmux:sys:` 開頭，之後每 10 秒寫一次。
7. 監控程式收到 SIGINT 後，該 workspace 的 `sidebar-state` 不再有 `cc-cmux:sys:` 的 progress，面板這一行消失。
8. 記憶體已用量和活動監視器的 App Memory + Wired Memory + Compressed 相差 1 GB 以內。不和「Memory Used」比。
9. 現有的 7d 列、等你區、port 列、按鈕與測試行為不變。

## 邊界情況

| 情況 | 行為 |
|------|------|
| 沒開「系統」workspace | 不畫這一行。 |
| 正常結束（Ctrl+C、關掉 workspace） | 程式先 `cmux clear-progress`，再結束。這一行消失。 |
| 程式被 SIGKILL 或當掉 | 舊值留著。超過 30 秒後顯示 `系統狀況 已停止更新`，`tertiary`。 |
| 開了兩個「系統」workspace | 取寫入時間最新的一筆。 |
| label 不是 `cc-cmux:sys:` 開頭，或欄位不是數字 | 略過這一筆。 |
| `cmux` 卡住 | 每次呼叫最多等 1 秒，這一輪跳過，下一輪再寫。 |
| 不在 cmux 裡（沒有 `CMUX_WORKSPACE_ID`） | 程式印一行說明到 stderr，exit 1，不呼叫 `cmux`。 |
| `vm_stat` 失敗或輸出解析不出來 | 這一輪不寫，下一輪再試。 |
| 第一次取樣 | CPU 要兩次取樣才算得出來。程式啟動時先取一次，1 秒後算第一筆並寫入，之後每 10 秒一次。 |
| 已用比例超出 0–1 | `progress` 的值夾在 0–1，label 與畫面用原始值。 |
| 在「系統」workspace 開 Claude | 不處理。兩支程式互相覆蓋 `progress`。README 寫明不要這樣做。 |
| 面板和「系統」workspace 在不同 window | 看不到。寫進 README 已知限制。 |

## 資料流範例

範例的值：寫入時間 1793630000，面板的 `clock.epoch` 是 1793630005。`W` 代表任意的寫入時間。「cmux 存的值」照 2026-11-09 `ccv sys-set` 實跑的 `sidebar-state` 輸出：cmux 把 `progress` 的值存成兩位小數，label 照原樣保存。

| 情況 | 來源的值 | 寫入的指令或呼叫 | cmux 存的值 | 面板讀哪個欄位 | 畫面文字或 cmux() 呼叫 |
|------|----------|------------------|-------------|----------------|------------------------|
| 正常 | CPU 42.3%；Anonymous 1614155、purgeable 9515、wired 260475、壓縮 339368 頁，page size 16384；總量 51539607552 | `cmux set-progress 0.7008 --label cc-cmux:sys:1793630000:42.3:33.64:48.00 --workspace <CMUX_WORKSPACE_ID>` | `progress=0.70 cc-cmux:sys:1793630000:42.3:33.64:48.00` | label 第 3–6 欄 | `CPU 42% · 記憶體 33.6 / 48 GB`，`secondary` |
| CPU ≥ 85% | CPU 84.6% | `cmux set-progress 0.7008 --label cc-cmux:sys:W:84.6:33.64:48.00 ...` | `progress=0.70 cc-cmux:sys:W:84.6:33.64:48.00` | 第 4 欄四捨五入成 85 | `CPU 85% · 記憶體 33.6 / 48 GB`，`#FF453A` |
| 記憶體 ≥ 85% | CPU 10%；已用 41 GiB | `cmux set-progress 0.8542 --label cc-cmux:sys:W:10.0:41.00:48.00 ...` | `progress=0.85 cc-cmux:sys:W:10.0:41.00:48.00` | 41 ÷ 48 × 100 = 85.4，四捨五入成 85 | `CPU 10% · 記憶體 41.0 / 48 GB`，`#FF453A` |
| 沒開「系統」workspace | 沒有 | 不經過：沒有監控程式 | 沒有 `cc-cmux:sys:` 的 progress | 找不到任何一筆 | 不畫這一行 |
| 正常結束 | 程式收到 SIGINT | `cmux clear-progress --workspace <CMUX_WORKSPACE_ID>` | 沒有 `progress=` | 找不到任何一筆 | 不畫這一行 |
| 程式被 SIGKILL | 沒有新的寫入 | 不經過：程式已結束 | `progress=0.70 cc-cmux:sys:1793629960:42.3:33.64:48.00` | 第 3 欄 1793629960，比 `clock.epoch` 1793630005 早 45 秒 | `系統狀況 已停止更新`，`tertiary` |
| 兩個「系統」workspace | 兩支程式 | 各自 `set-progress --workspace <各自的 id>`，寫入時間 1793629990 與 1793630000 | 兩個 workspace 各一筆 | 取第 3 欄較大的 1793630000 | 依 1793630000 那一筆的值 |
| label 格式錯 | 別的工具執行 `cmux set-progress 0.5 --label cc-cmux:sys:x:1:2:3` | 不經過監控程式 | `progress=0.5 cc-cmux:sys:x:1:2:3` | 第 3 欄不是數字，略過 | 不畫這一筆 |
| `cmux` 卡住 | 正常的值 | `cmux set-progress ...` 不回應，1 秒後放棄 | 不確定有沒有寫入 | 依實際存的值 | 依實際存的值；超過 30 秒沒寫入就顯示 `系統狀況 已停止更新` |
| 不在 cmux 裡 | 沒有 `CMUX_WORKSPACE_ID` | 不經過：程式 exit 1 | 不變 | 不變 | 不變 |
| `vm_stat` 失敗 | `vm_stat` exit 非 0 | 不經過：這一輪不寫 | 上一輪的值 | 上一輪的值 | 上一輪的值；連續 30 秒失敗就顯示 `系統狀況 已停止更新` |
| 第一次取樣 | 啟動時取一次 `os.cpus()` | 1 秒後第一次 `set-progress` | `progress=... cc-cmux:sys:...` | label 第 3–6 欄 | 約 1 秒後出現這一行 |
| 已用比例超出 0–1 | 已用 50 GiB、總量 48 GiB | `cmux set-progress 1 --label cc-cmux:sys:W:10.0:50.00:48.00 ...` | `progress=1 cc-cmux:sys:W:10.0:50.00:48.00` | 讀 label，不讀 `progress.value` | `CPU 10% · 記憶體 50.0 / 48 GB`，`#FF453A` |
| 在「系統」workspace 開 Claude | statusline 也寫這個 workspace | 兩支程式輪流 `set-progress` | 後寫入的那一筆 | 可能是 `cc-cmux:7d:` 或 `cc-cmux:sys:` | 這一行與那個帳號的 7d 列輪流出現或消失 |
| 不同 window | 監控程式在 window 2 | `set-progress --workspace <window 2 的 workspace>` | window 2 的 workspace 有值 | window 1 的面板拿不到 window 2 的 workspace | window 1 不畫這一行 |

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `monitor/system-stats.mjs`（新增） | 每 10 秒用 `os.cpus()` 算 CPU、用 `vm_stat` 與 `os.totalmem()` 算記憶體，執行 `cmux set-progress`。收到 SIGINT、SIGTERM、SIGHUP 時 `cmux clear-progress` 再結束。每次呼叫 `cmux` 最多等 1 秒。 |
| `sidebars/services.js` | 新增讀 `cc-cmux:sys:` label 的函式，在 7d 列上面畫一行。 |
| `tests/system-stats.test.mjs`（新增） | 用假 `cmux` 與假 `vm_stat` 測監控程式。 |
| `tests/services.test.mjs` | 加面板的測試。 |
| `README.md` | 新增「顯示 CPU 與記憶體（選用）」一節與已知限制。 |
| `.claude/skills/verify-cc-cmux/scripts/ccv.mjs` | 加 `sys-start`、`sys-rows`、`sys-set`、`sys-stop`、`sys-compare`；`cleanup` 收掉「系統」workspace；`capture` 記錄系統列。 |
| `.claude/skills/verify-cc-cmux/SKILL.md` | Helpers 表加上新指令。 |

不改的檔案與理由：

- `statusline/report-rate-limit.mjs`、`hooks/`：和這個功能無關。
- `tests/harness.mjs`：已經有 `clock`，夠用。
- 監控程式不放 `statusline/` 或 `hooks/`：它不是 statusline，也不是 Claude Code hook，放那裡會讓人以為要改設定檔。

## 測試清單

單元測試（`tests/`，實作時先寫、先看到失敗）：

1. 面板：一筆 `cc-cmux:sys:1793630000:42.3:33.69:48.00`，clock 1793630005 → 畫出 `CPU 42% · 記憶體 33.7 / 48 GB`，`secondary`，排在 7d 列前面。
2. 面板：CPU 84.6 → `CPU 85%`，`#FF453A`。CPU 84.4、記憶體 40.7 / 48（84.8%）→ `#FF453A`。CPU 84.4、記憶體 40.0 / 48（83.3%）→ `secondary`。
3. 面板：沒有任何 `cc-cmux:sys:` → 沒有 `CPU ` 或 `系統狀況` 開頭的文字，7d 列照舊。
4. 面板：寫入時間比 clock 早 31 秒 → `系統狀況 已停止更新`，`tertiary`。早 30 秒 → 照常顯示數字。
5. 面板：兩個 workspace 各一筆，取寫入時間大的那一筆。
6. 面板：第 3–6 欄有非數字，或欄位數不是 6 → 略過。
7. 面板：同一個 window 同時有 `cc-cmux:sys:` 與 `cc-cmux:7d:` → 兩種列都畫，7d 列的文字不變。
8. 監控程式：假 `vm_stat` 輸出（Anonymous 1614155、purgeable 9515、wired 260475、壓縮 339368，page size 16384）→ 已用 33.64 GiB。
9. 監控程式：有 `CMUX_WORKSPACE_ID` 時，約 1 秒內呼叫 `cmux set-progress <值> --label cc-cmux:sys:<寫入時間>:<CPU%>:<已用>:<總量> --workspace <id>`，值在 0–1，CPU% 在 0–100。
10. 監控程式：沒有 `CMUX_WORKSPACE_ID` → 不呼叫 `cmux`，exit 1。
11. 監控程式：收到 SIGINT → 呼叫 `cmux clear-progress --workspace <id>`，然後結束。
12. 監控程式：假 `cmux` 卡住 → 程式不卡住，下一輪還會再呼叫。
13. 監控程式：假 `vm_stat` exit 1 → 這一輪不呼叫 `set-progress`，程式不結束。
14. 監控程式：每次寫入後，在 stdout 印一行目前的數字。使用者切到「系統」分頁時看得到。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/system-stats.md`
- sub-feature：`sys-row`、`sys-red`、`sys-stop`、`sys-stale`、`sys-compare`
- 回歸：install、list、claude-rate-limit 的 usage-row

## ccv 需要的擴充

- `ccv sys-start`：在本次 run 的 window 用 README 的啟動指令開「系統」workspace，等 `sidebar-state` 出現 `cc-cmux:sys:`，最多 30 秒。記下 workspace 與監控程式的 PID。
- `ccv sys-rows`：列出面板上以 `CPU ` 或 `系統狀況` 開頭的 AX 文字。
- `ccv sys-set <CPU%> <已用GiB> <總量GiB> [距今秒數]`：不跑監控程式，直接用 `cmux set-progress` 寫一筆測試 label 到本次 run 的 server workspace。
- `ccv sys-stop <int|kill>`：`int` 對「系統」分頁送 Ctrl+C；`kill` 對監控程式送 SIGKILL。
- `ccv sys-compare`：讀「系統」workspace 的 label，開活動監視器並截圖，兩者寫進證據。
- `ccv cleanup` 收掉「系統」workspace 與監控程式；`ccv capture` 另外記錄系統列。

## 不做的事

- 行程排行。理由：只看整機。
- 歷史曲線或平均值。理由：先用瞬間值。
- 磁碟、網路、GPU、電池。理由：使用者只要 CPU 與記憶體。
- 開機或 cmux 啟動時自動執行。理由：要用 launchd 或改 repo 外的設定。
- 跨 window 顯示。理由：sidebar 只拿得到自己 window 的 workspace。

## 未決問題

