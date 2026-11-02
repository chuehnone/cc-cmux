# 顯示 Claude 7 天額度的剩餘時間

在 Services 面板的標題列下面，顯示 Claude 訂閱 7 天視窗還剩多久重置，以及已用百分比。個人帳號與公司帳號各一列。已用 85% 以上時變紅。

## Why（為什麼要做）

使用者要判斷剩下的 7 天額度撐不撐得到重置，也要在額度快用完時被提醒。7 天視窗用完後要等很久才重置。

現在的 statusline 只顯示 `7d: N%`，沒有重置時間。要看到這個值，必須切到某個 Claude Code 分頁看底部。額度快用完時，沒有任何提醒。

## How（現在怎麼做）

- Claude Code 傳給 statusline 的 JSON 有 `rate_limits.seven_day.used_percentage`（0–100）與 `rate_limits.seven_day.resets_at`（Unix epoch 秒）（code.claude.com/docs/en/statusline）。
- `rate_limits` 只出現在訂閱帳號，而且在 session 第一個 API 回應之後才出現。視窗過了 `resets_at` 後，Claude Code 會拿掉這個視窗（同一份文件）。
- `claude --help` 沒有查用量的子指令。官方文件索引（code.claude.com/docs/llms.txt）只有 statusline 提供訂閱額度。
- sidebar 的執行環境沒有檔案系統、網路與計時器（`cmux docs sidebars`）。sidebar 有 `data.clock().epoch`，大約每秒更新。
- sidebar 讀得到、外部又寫得進去的 workspace 欄位：`progress`（`value`、`label`，用 `cmux set-progress` 寫入）、`description`、`color`、`title`（用 `cmux workspace-action` 寫入）。`cmux set-status` 寫入的值不在 sidebar 的資料裡（cmux 原始碼 `CustomSidebarDataContextBuilder.swift`）。
- sidebar 的 `workspaces` 只含面板所在的 window（cmux 原始碼 `Sources/ContentView+RightSidebarCommandPalette.swift` 的 `rightSidebarCustomSidebarDataContext` 取自該 window 的 `tabManager.tabs`）。
- `cmux sidebar-state` 的輸出有 `progress=` 這一行（實際執行結果）。
- 右側欄一次只顯示一個模式（`cmux right-sidebar --help`）。
- 個人帳號與公司帳號用同一份 Claude Code 設定與同一支 statusline 腳本。公司帳號啟動時帶 `CLAUDE_CONFIG_DIR=$HOME/.claude-work`，個人帳號不帶。statusline 子行程會不會繼承 `CLAUDE_CONFIG_DIR`，未實測。
- `hooks/register-agent.mjs` 的行為：不印 stdout，最多等 cmux 1 秒，一律 exit 0（README「讓每個 Claude Code session 都被記錄」）。
- `tests/harness.mjs` 只模擬 `data.workspaces`，沒有 `data.clock`（`tests/harness.mjs:54`）。
- 面板標題列在 `sidebars/services.js:47-51`。停止按鈕的紅色是 `#FF453A`（`sidebars/services.js:63`）。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 顯示哪個值 | 7 天視窗的剩餘時間與已用百分比 | 7 天視窗用完後要等很久。只看時間無法判斷額度撐不撐得到重置。 |
| 提醒 | 已用 ≥ 85% 時文字變紅 | 額度快用完時要被提醒。 |
| 位置 | Services 面板標題列下面加列 | 右側欄一次只顯示一個面板。另開面板要切換才看得到，提醒就沒效。 |
| 資料來源 | statusline 輸入的 `rate_limits.seven_day` | 官方只有 statusline 提供訂閱額度。不碰登入憑證。 |
| 管道 | 寫入程式執行 `cmux set-progress`，label 為 `cc-cmux:7d:<帳號>:<resets_at>:<寫入時間>:<已用%>` | sidebar 讀不到檔案。`progress` 不會蓋掉使用者寫的 workspace 說明。代價：左側欄多一條進度條。 |
| 呼叫 cmux 的方式 | 用 `cmux set-progress` CLI，不直接連 socket | CLI 有文件，socket 指令沒有，改版較不容易壞。 |
| 帳號 | 個人、公司各一列；`CLAUDE_CONFIG_DIR` 以 `.claude-work` 結尾時記成 `work`，否則記成 `personal` | 兩個帳號的額度分開算。混在一列會跳動，也看不出是誰。 |
| 寫入程式的位置 | `statusline/report-rate-limit.mjs` | 它不是 Claude Code hook。放 `hooks/` 會讓人以為要加進 `settings.json` 的 `hooks`。 |
| statusline 怎麼呼叫 | statusline 腳本用 `&` 在背景執行寫入程式 | 寫入程式最多等 1 秒，不能拖慢 statusline。 |
| 節流 | 不節流，每次都寫 | 寫入時間要更新，面板才挑得出最新一筆。 |
| 百分比的來源 | 面板一律讀 label 裡的已用%。`progress.value` 只用來畫左側欄的進度條 | 進度值會夾在 0–1，超過 100% 的原始值只留在 label。實作第 5 輪時發現原本的 label 沒有百分比，與「label 用原始值」矛盾，使用者同意改格式。 |
| 紅色門檻的判斷 | 用四捨五入後的整數判斷 | 文字和顏色才一致。 |
| 改使用者的 statusline 腳本 | 實作時改，改前先問使用者 | 使用者指定。 |

## 成功條件

1. 有某個帳號的 7 天資料時，面板標題列下面出現該帳號一列，格式是 `<帳號> 7d 剩 <剩餘時間> · 已用 <N>%`。帳號顯示為 `個人` 或 `公司`。`N` 是四捨五入的整數。
2. 剩餘時間的格式，一律無條件捨去，不顯示秒：
   - 1 天以上：`N 天 M 小時`，例如 `2 天 5 小時`。
   - 不到 1 天：`M 小時 K 分`，例如 `5 小時 12 分`。
   - 不到 1 小時：`K 分`，例如 `12 分`。
3. `N` ≥ 85 時，這一列的 `color` 是 `#FF453A`。`N` < 85 時是 `secondary`。
4. 剩餘時間依 `data.clock().epoch` 計算。`clock` 改變時，文字跟著改變，不必等新的寫入。
5. 兩個帳號都沒有資料時，顯示一列 `7d 無資料`，`color` 是 `tertiary`。只有一個帳號沒有資料時，不畫那個帳號的列。
6. 已過 `resets_at` 時，該帳號那一列顯示 `<帳號> 7d 已重置，等待更新`。
7. 兩個帳號都有資料時，個人在上、公司在下。
8. statusline 收到有 `seven_day` 的 JSON，且在 cmux 裡時，該 workspace 的 `cmux sidebar-state` 出現 `progress=`，label 以 `cc-cmux:7d:<帳號>:` 開頭，最後一欄是已用%。
9. 現有的 port 列、按鈕與測試行為不變。

## 邊界情況

| 情況 | 行為 |
|------|------|
| statusline 沒有 `seven_day`（非訂閱帳號、session 還沒回應、已過重置） | 寫入程式不寫，也不清掉舊值。面板依舊值計算。 |
| 已用百分比超出 0–100 | `set-progress` 的值夾在 0–1。label 與面板文字用原始值。 |
| `progress` 的 label 不是 `cc-cmux:7d:` 開頭，或欄位格式錯 | 面板略過這一筆。 |
| 同一個帳號在多個 workspace 有值 | 取寫入時間最新的一筆。 |
| 有值的 workspace 都關掉了 | 該帳號的列消失。 |
| 別的工具覆蓋了 `progress` | 不處理。下次 statusline 執行時寫回來。 |
| 不在 cmux 裡（沒有 `CMUX_WORKSPACE_ID`） | 寫入程式不執行 cmux。 |
| stdin 不是 JSON | 不印 stdout，exit 0。 |
| `cmux` 卡住 | 1 秒內結束，exit 0。 |
| cmux 在背景 | 不處理。實跑記錄結果，寫進 README 已知限制。 |

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `statusline/report-rate-limit.mjs`（新增） | 從 stdin 讀 statusline JSON。有 `seven_day` 且在 cmux 裡時，執行 `cmux set-progress <值> --label <label> --workspace <CMUX_WORKSPACE_ID>`。不印 stdout，最多等 1 秒，一律 exit 0。 |
| `sidebars/services.js` | 標題列下面加帳號列。 |
| `tests/harness.mjs` | `loadSidebar` 加 `clock` 參數，模擬 `data.clock()`。 |
| `tests/services.test.mjs` | 加帳號列的測試。 |
| `tests/report-rate-limit.test.mjs`（新增） | 寫入程式的測試。 |
| `README.md` | 功能說明、安裝、行為、移除、已知限制。 |
| 使用者的 statusline 腳本（repo 外） | 加一行：把 stdin 存成變數，在背景傳給寫入程式。改前先問使用者。 |

不改的檔案與理由：

- `hooks/register-agent.mjs`：功能無關。
- `scripts/check-no-comments.mjs`、`.githooks/`：新檔案已在檢查範圍內。

README 的已知限制要加：

- 面板只看得到同一個 window 的 workspace。Claude 在別的 window 時，這個 window 的面板看不到它的額度。
- 有 Claude 的 workspace，左側欄會多一條進度條，label 是 `cc-cmux:7d:...`。
- 其他工具呼叫 `set-progress` 時會互相覆蓋。
- 一個 workspace 只有一個 `progress`。個人帳號與公司帳號的 Claude 開在同一個 workspace 時，互相覆蓋，面板只看得到最後寫入的帳號。
- cmux 在背景時的行為，照實跑結果寫。

## 測試清單

單元測試（`tests/`，實作時先寫、先看到失敗）：

面板（`tests/services.test.mjs`）：

1. 個人帳號已用 78%、離重置 2 天 5 小時 → 文字 `個人 7d 剩 2 天 5 小時 · 已用 78%`，`color` 是 `secondary`。
2. 離重置 5 小時 12 分 40 秒 → `5 小時 12 分`。離重置 12 分 59 秒 → `12 分`。
3. 已用 84.6% → 顯示 `85%`，`color` 是 `#FF453A`。已用 84.4% → 顯示 `84%`，`color` 是 `secondary`。
4. 兩個帳號都有值 → 兩列，個人在上、公司在下。
5. 同一個帳號在兩個 workspace 有值 → 取寫入時間較新的一筆。
6. label 開頭不是 `cc-cmux:7d:`，或欄位數量不對、數字不能解析 → 略過。
7. 沒有任何值 → 一列 `7d 無資料`，`color` 是 `tertiary`。
8. `clock.epoch` ≥ `resets_at` → `個人 7d 已重置，等待更新`。
9. 同一份資料，`clock.epoch` 加 3600 → 剩餘時間少 1 小時。
10. 現有的 port 列測試照舊通過。

寫入程式（`tests/report-rate-limit.test.mjs`，用 PATH 上的假 `cmux` 執行檔記錄參數）：

1. 有 `seven_day`（已用 78）且有 `CMUX_WORKSPACE_ID` → 執行 `cmux set-progress 0.78 --label cc-cmux:7d:personal:<resets_at>:<寫入時間>:78 --workspace <CMUX_WORKSPACE_ID>`。
2. `CLAUDE_CONFIG_DIR` 以 `.claude-work` 結尾 → 帳號是 `work`。
3. 沒有 `seven_day` → 不執行 cmux。
4. 沒有 `CMUX_WORKSPACE_ID` → 不執行 cmux。
5. 已用 120 → 進度值 `1`，label 保留 `120`。
6. stdin 不是 JSON → 不印 stdout，exit 0。
7. 假 `cmux` 卡住不結束 → 寫入程式 1 秒內結束，exit 0。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/claude-rate-limit.md`
- sub-feature：`usage-row`、`usage-red`、`usage-accounts`、`usage-live`、`usage-cleanup`
- 回歸：install、list、stop

## ccv 需要的擴充

開始實作前，先擴充 `scripts/ccv.mjs`，並實跑一次證明能用：

1. `ccv usage-set <personal|work> <已用%> <距重置秒數>`：在本次 run 的 workspace，用測試 JSON 執行 `statusline/report-rate-limit.mjs`。帳號用 `CLAUDE_CONFIG_DIR` 模擬。不用到 token。
2. `ccv usage-rows`：列出面板上以 `個人 7d`、`公司 7d`、`7d` 開頭的 AX 文字。`ccv capture` 也加記這些文字，以及本次 run 每個 workspace 的 `progress=` 行。
3. `ccv usage-live [work]`：在本次 run 的 window 開一個分頁，執行互動模式的 `claude`（`work` 時帶 `CLAUDE_CONFIG_DIR=$HOME/.claude-work`），送一句短 prompt，等 `sidebar-state` 出現 `cc-cmux:7d:` 開頭的 progress。會用到 token。前提是使用者的 statusline 腳本已加上呼叫寫入程式的那一行。

顏色不用 AX 讀。`usage-red` 用截圖當證據，由執行驗證的 Claude 看圖判斷。顏色值由單元測試第 3 條保護。

## 不做的事

- 5 小時視窗：使用者選了 7 天視窗。
- `spend_limit`：使用者選了 7 天視窗。
- macOS 通知或聲音：紅色文字已經符合提醒的需求。
- 隱藏左側欄的進度條：cmux 沒有這個選項。
- 預測依目前速度會不會用完：要有歷史資料，面板沒有存資料的地方。
- 呼叫沒有公開文件的用量端點：要用登入憑證，改版就會失效。
- 跨 window 顯示：cmux 只給面板所在 window 的 workspace。

## 未決問題
