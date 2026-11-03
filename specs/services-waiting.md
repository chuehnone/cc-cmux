# 列出在等使用者的 Claude session

在 Services 面板加「等你」區，列出卡在問題上的 session，以及跑完但還沒看的 session。每一列寫出 workspace 與分頁名稱，按一下就切到那個分頁。

## Why（為什麼要做）

使用者同時開十幾個 Claude session，一個 workspace 常有多個分頁。cmux 左側欄只顯示每個 workspace 的未讀數，例如「Raphael 有 2 則未讀」，看不出是 5 個分頁中的哪一個。要一個個切過去，才知道哪個 session 在問問題、哪個跑完了。

## How（現在怎麼做）

- sidebar 的 `workspaces[i].agents` 依 session 列出 coding agent。同一個 workspace 有多個 Claude 時，每個 session 都會出現，並綁到所在分頁。綁定的分頁不在時，排除這筆 session。沒有分頁綁定的 session，改用存下的 workspace id 判斷歸屬。每個 workspace 最多 24 筆，超過時丟掉最舊的（cmux 原始碼 `Sources/Workspace+CustomSidebarSnapshot.swift`）。
- `agents[j]` 一定有 `id`、`kind`、`name`、`status`、`lastActivityAt`。`panelId`、`surfaceId`、`sinceEpoch`、`title` 只有在 cmux 知道時才有（`cmux docs sidebars`）。
- 文件寫 agent 的 `surfaceId` 等於分頁的 `tabs[k].surfaceId`，實際不是。2026-11-03 用暫時的探查 sidebar 讀 cmux 0.65.2 的真實資料：agent 的 `panelId` 等於分頁的 `id`，也等於分頁的 `surfaceId`；agent 的 `surfaceId` 是另一個值，對不到任何分頁。
- `status` 的變化（cmux 原始碼 `Sources/Mobile/AgentChat/AgentChatSessionRegistry+Lifecycle.swift`）：
  - `needs_input`：Claude 呼叫 AskUserQuestion、ExitPlanMode，要求權限，或送出一般通知。
  - 閒置提醒不改變狀態。
  - `idle`：SessionStart 或 Stop。
  - `working`：送出 prompt 或執行工具。
- 回合結束時，cmux 收到一則「Completed in …」通知；約 60 秒後，再收到一則閒置提醒「Claude is waiting for your input」。兩則都綁在同一個分頁，狀態是 unread（`cmux list-notifications`）。
- 分頁的 `hasUnread` 代表該分頁有沒有未讀通知，不分通知種類（`cmux docs sidebars`）。
- 實測（2026-11-03，測試 window，cmux 在前景）：用 `cmux notify` 對一個分頁送通知，狀態是 `unread`；切到那個 workspace 後，立刻變成 `read`。
- sidebar 只看得到所在 window 的 workspace（claude-rate-limit 規劃時查到）。
- port 列的跳轉按鈕用 `cmux("surface.focus", { surface_id, workspace_id })`；沒有分頁時改用 `workspace.select`（`sidebars/services.js`）。
- 7d 列的剩餘時間用 `formatLeft`，格式是「N 天 M 小時」（`sidebars/services.js`）。
- 實測（2026-11-03）：閒置提醒送到時，agent 的 `lastActivityAt` 會更新成提醒的時間，`status` 仍是 `idle`。所以 `跑完` 的等待時間從閒置提醒起算，比實際跑完的時間少約 1 分鐘。
- 以上 cmux 原始碼依 GitHub main。本機版本 0.65.2，兩者是否一致，未查證。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 顯示哪些狀態 | `needs_input` 標 `問題`；`idle` 且分頁 `hasUnread` 標 `跑完` | 前者卡住要先處理，後者是結果還沒看。兩種使用者都要。 |
| 位置 | 7d 列下面、port 列上面，小標題 `等你` | 要立刻處理的事放上面才不會漏看。 |
| 每一列 | 圓點、`<workspace> · <分頁>`、標籤、等待時間 | 痛點是不知道哪個分頁。 |
| 點擊 | 整列可按，送 `surface.focus`；不另加按鈕 | 找到分頁就是目的。 |
| 顏色 | `問題` 用 `#FF9F0A`，`跑完` 用 `#0A84FF` | 沿用面板現有的兩種點色，兩區有標題分開。 |
| 排序 | `問題` 在前；同一種依等待時間由長到短 | 卡住的先處理，等最久的先處理。 |
| 等待時間的來源 | `問題` 用 `sinceEpoch`，缺值時用 `lastActivityAt`；`跑完` 用 `lastActivityAt` | `idle` 沒有 `sinceEpoch`。 |
| 時間格式 | `剛剛`、`N 分`、`N 小時`、`N 天`，無條件捨去；另寫函式，不改 `formatLeft` | 和 7d 列格式不同，不動已驗證的行為。 |
| 對應分頁的方式 | agent 的 `panelId` 對 `tabs[k].id`；點擊送該分頁的 `surfaceId` | 實作時用探查 sidebar 實測，agent 的 `surfaceId` 對不到分頁。原本的寫法照文件，分頁名稱會永遠是 `分頁不明`。 |
| 缺分頁 | 分頁名稱寫 `分頁不明`，點擊送 `workspace.select` | 卡住的 session 寧可多顯示，不要漏掉。 |
| 其他 agent | 一起顯示，不標種類 | 使用者目前只用 Claude。 |
| 列數上限 | 最多 10 列，超過時加一行 `還有 N 個` | 16 個 session 全部在等時，會把 port 列推出畫面。 |
| 閒置提醒讓「跑完」再出現 | 接受，寫進已知限制 | sidebar 分不出通知種類。只有 60 秒內就去看時才會發生，最多再出現一次。用 hook 擋要多裝一支 hook。 |

## 成功條件

1. 某個 agent 的 `status` 是 `needs_input` 時，「等你」區出現一列：`<workspace> · <分頁>`，標籤 `問題`，圓點 `#FF9F0A`。
2. 某個 agent 的 `status` 是 `idle`，而且所在分頁的 `hasUnread` 是 true 時，出現一列，標籤 `跑完`，圓點 `#0A84FF`。
3. `working`、`hasUnread` 是 false 的 `idle`、`ended` 都不顯示。
4. 等待時間依 `data.clock().epoch` 計算，無條件捨去：不到 1 分鐘 `剛剛`，不到 1 小時 `N 分`，不到 1 天 `N 小時`，其他 `N 天`。
5. `問題` 在前，`跑完` 在後；同一種依等待時間由長到短。
6. 按一下整列，送出 `cmux("surface.focus", { surface_id: <對應分頁的 surfaceId>, workspace_id: <workspace id> })`。對應分頁是 `id` 等於 agent `panelId` 的那一個。
7. 沒有任何一列時，`等你` 標題與整區都不顯示。
8. 實跑：按下 `跑完` 那一列後，cmux 切到那個分頁，該列在 5 秒內消失。
9. 現有的 7d 列、port 列與按鈕行為不變。

## 邊界情況

| 情況 | 行為 |
|------|------|
| 在等的 session 超過 10 個 | 顯示前 10 列，最後加一行 `還有 N 個`。 |
| 同一個分頁有兩筆非 `ended` 的 session | 只顯示 `lastActivityAt` 較新的一筆。 |
| 使用者正在看的分頁是 `needs_input` | 照樣顯示。 |
| 分頁有非 Claude 的未讀通知，Claude 是 `idle` | 照樣顯示成 `跑完`。寫進已知限制。 |
| 60 秒內就去看，之後閒置提醒才送到 | 那一列消失後會再出現一次。寫進已知限制。實跑記錄兩種時間點。 |
| Claude 行程沒送 Stop 就結束 | 不處理。實跑記錄結果，寫進已知限制。 |
| agent 沒有 `panelId`，或 `tabs` 找不到對應分頁 | 分頁名稱寫 `分頁不明`，點擊送 `workspace.select`。 |
| `needs_input` 沒有 `sinceEpoch` | 改用 `lastActivityAt`。 |
| 時間比 `clock.epoch` 晚 | 顯示 `剛剛`。 |
| workspace 或分頁名稱很長 | 單行，中間截斷。 |
| 別的 window 的 session | 不顯示。寫進已知限制。 |

## 資料流範例

範例的值：面板的 `clock.epoch` 是 1793700000。workspace `Raphael`（id `W1`）有分頁 `Raphael-PR`（`id` 與 `surfaceId` 都是 `P1`）與 `Raphael-PB`（`P2`）。agent 的 `surfaceId` 是另一組值（`X1`、`X2`），對不到分頁。這些值的關係在 2026-11-03 用探查 sidebar 實測過。

| 情況 | 來源（Claude 的事件與 cmux 通知） | cmux 存的值 | 面板讀哪些欄位 | 畫面文字 | 點擊送出的呼叫 |
|------|-----------------------------------|-------------|----------------|----------|----------------|
| 正常：問題 | `P1` 的 Claude 呼叫 AskUserQuestion，時間 1793699820 | `agents: [{status: "needs_input", panelId: "P1", surfaceId: "X1", sinceEpoch: 1793699820}]` | `status`、`panelId` 對到 `tabs` 的 `Raphael-PR`、`sinceEpoch` | `● Raphael · Raphael-PR　問題　3 分`，橘點 | `surface.focus { surface_id: "P1", workspace_id: "W1" }` |
| 正常：跑完 | `P2` 的 Claude 回合結束（Stop），時間 1793699280；「Completed」通知未讀 | `agents: [{status: "idle", panelId: "P2", surfaceId: "X2", lastActivityAt: 1793699280}]`，`tabs[P2].hasUnread: true` | `status`、`hasUnread`、`lastActivityAt` | `● Raphael · Raphael-PB　跑完　12 分`，藍點 | `surface.focus { surface_id: "P2", workspace_id: "W1" }` |
| 按下跑完之後 | 切到 `P2`，通知變成已讀 | `tabs[P2].hasUnread: false` | `hasUnread` | 這一列消失 | 不經過 |
| 60 秒內看完，閒置提醒才到 | 第 60 秒送到閒置提醒，未讀；`status` 仍是 `idle` | `tabs[P2].hasUnread: true` | `hasUnread` | 這一列再出現一次 | 同正常：跑完 |
| working | `P1` 的 Claude 執行工具 | `status: "working"` | `status` | 不顯示 | 不經過 |
| ended | `P1` 的 Claude 結束 | `status: "ended"` | `status` | 不顯示 | 不經過 |
| 超過 10 個 | 12 個 session 都是 `needs_input` | 12 筆 agent | 排序後取前 10 | 10 列，加一行 `還有 2 個` | 每列各自的 `surface.focus` |
| 同一個分頁兩筆 | `P1` 先後啟動兩次 Claude，都不是 `ended` | 兩筆 `panelId: "P1"`，`lastActivityAt` 分別是 1793699000、1793699500 | 取 `lastActivityAt` 較大的一筆 | 只有一列，依 1793699500 那筆的狀態 | 同該筆 |
| 正在看的分頁是問題 | 使用者停在 `P1`；通知被標成已讀 | `status: "needs_input"`，`hasUnread: false` | `status` | 照樣顯示 `問題` | 同正常：問題 |
| 非 Claude 的未讀 | `cmux notify --surface P2` 送出其他通知；Claude 是 `idle` | `status: "idle"`，`hasUnread: true` | `status`、`hasUnread` | 顯示成 `跑完` | 同正常：跑完 |
| Claude 沒送 Stop 就結束 | `P1` 的 Claude 被 SIGKILL | 未查證，實跑記錄 | 依實際的值 | 依實際的值 | 依實際的值 |
| 缺分頁 | agent 沒有 `panelId`，或 `P9` 不在 `tabs` | `agents: [{status: "needs_input", panelId: "P9"}]` | `tabs` 找不到 `P9` | `● Raphael · 分頁不明　問題　3 分` | `workspace.select { workspace_id: "W1" }` |
| 缺 sinceEpoch | `needs_input`，沒有 `sinceEpoch`，`lastActivityAt` 1793699820 | `agents: [{status: "needs_input", lastActivityAt: 1793699820}]` | `lastActivityAt` | `問題　3 分` | 同正常：問題 |
| 時間在未來 | `sinceEpoch` 1793700030 | `sinceEpoch: 1793700030` | `sinceEpoch` 大於 `clock.epoch` | `問題　剛剛` | 同正常：問題 |
| 名稱很長 | 分頁名稱 `這是一個超過面板寬度的很長的分頁名稱` | `tabs[k].title` | `title` | 單行，中間截斷 | 同正常 |
| 別的 window | 另一個 window 的 Claude 是 `needs_input` | 該 window 的 `agents` | 這個面板拿不到 | 不顯示 | 不經過 |

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `sidebars/services.js` | 加「等你」區：整理 agent 與分頁、時間格式、列的畫面與點擊。時間格式另寫函式，不改 `formatLeft`。 |
| `tests/harness.mjs` | 加 `waiting()`：找出含 `問題` 或 `跑完` 的列，回傳文字、圓點顏色與點擊動作；另回傳 `還有 N 個` 這一行。 |
| `tests/services.test.mjs` | 加「等你」區的測試。 |
| `README.md` | 功能說明與已知限制。 |
| `.claude/skills/verify-cc-cmux/scripts/ccv.mjs` | `wait-start`、`wait-rows`、`click-row`、`wait-kill`、`probe`；`capture` 加記「等你」區與未讀通知。 |
| `.claude/skills/plan-cc-cmux/spec-template.md` | 資料流範例的說明加一條：「cmux 存的值」要先用 `ccv probe` 讀真實資料再填。 |

不改的檔案與理由：

- `statusline/report-rate-limit.mjs`、`hooks/register-agent.mjs`：功能無關。
- `scripts/check-no-comments.mjs`、`scripts/check-spec.mjs`、`.githooks/`：新檔案已在檢查範圍內。

README 的已知限制要加：

- 「等你」區只看得到同一個 window 的 session。
- 分頁上任何未讀通知，都會讓 `idle` 的 Claude 顯示成 `跑完`。
- 回合結束後 60 秒內就去看時，Claude 的閒置提醒送到後，那一列會再出現一次。
- Claude 沒送 Stop 就結束時的行為，照實跑結果寫。

## 測試清單

單元測試（`tests/`，實作時先寫、先看到失敗）：

1. 一個 `needs_input` 的 agent（`sinceEpoch` 是 `clock.epoch` 減 180）→ 一列，文字含 `Raphael · Raphael-PR`、`問題`、`3 分`，圓點 `#FF9F0A`。
2. `idle` 且分頁 `hasUnread` 是 true（`lastActivityAt` 是 `clock.epoch` 減 720）→ `跑完`、`12 分`，圓點 `#0A84FF`。
3. `working`、`hasUnread` 是 false 的 `idle`、`ended` → 沒有列。
4. 時間格式：差 59 秒 `剛剛`、差 3599 秒 `59 分`、差 3600 秒 `1 小時`、差 86400 秒 `1 天`；時間比 `clock.epoch` 晚 30 秒時 `剛剛`。
5. 排序：一個 `跑完` 等 20 分、一個 `問題` 等 1 分、一個 `問題` 等 5 分 → 依序是 `問題 5 分`、`問題 1 分`、`跑完 20 分`。
6. 點一下 → 送出 `surface.focus`，參數 `{ surface_id: "P1", workspace_id: "W1" }`。分頁用 agent 的 `panelId` 找，agent 的 `surfaceId` 是對不到分頁的另一個值。
7. agent 沒有 `panelId`，或 `panelId` 不在 `tabs` → `分頁不明`，點一下送 `workspace.select { workspace_id: "W1" }`。
8. `needs_input` 沒有 `sinceEpoch` → 用 `lastActivityAt` 算時間。
9. 同一個分頁兩筆非 `ended` 的 session → 只顯示 `lastActivityAt` 較新的一筆。
10. 12 個 `needs_input` → 10 列，加一行 `還有 2 個`。
11. 沒有任何在等的 session → 畫面沒有 `等你` 這段文字。
12. 現有的 7d 列與 port 列測試照舊通過。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/services-waiting.md`
- sub-feature：`wait-question`、`wait-done`、`wait-focus`、`wait-crash`
- 回歸：install、list、stop、claude-rate-limit 的 `usage-row`

## ccv 需要的擴充

開始實作前，先擴充 `scripts/ccv.mjs`，並實跑一次證明能用：

1. `ccv wait-start <question|done>`：在本次 run 的 window 用 `--focus false` 開一個 workspace，執行互動模式的 `claude --model haiku`。`question` 要求它用 AskUserQuestion 問一個二選一的問題，等到畫面出現選項。`done` 要求它只回 `OK`，等到 `cmux list-notifications` 出現該分頁的未讀通知。記錄 workspace、分頁與 Claude 的 PID。會用到少量 token。
2. `ccv wait-rows`：列出「等你」區每一列的文字，由上到下。`ccv capture` 也加記這些列，以及本次 run 各分頁的未讀通知。
3. `ccv click-row <文字>`：用 AX 找到包含這段文字的列，點列的中央。沿用 `ccv click` 的倍率檢查。點完記錄 `cmux tree` 的選取分頁。
4. `ccv wait-kill`：用 SIGKILL 結束 `wait-start` 記錄的 Claude 行程。只結束本次 run 啟動的行程。
5. `ccv probe`：在本次 run 的 window 暫時放一個探查 sidebar，印出有 agent 的 workspace 的 agent 與分頁欄位，讀完就刪掉並切回 services。規劃與驗證時，用它取得 cmux 實際給的值。

## 不做的事

- 預覽 Claude 回了什麼：sidebar 拿不到通知內文。
- 顯示使用者最後送出的 prompt（`latestPrompt`）：每列會變成兩行。
- 不切分頁、直接標成已讀：使用者的需求是找到分頁。
- 子 agent：父 session 的狀態已經足夠判斷。
- 別的 window 的 session：cmux 不提供。
- macOS 通知或聲音：cmux 本身已經會通知。
- 改標題列的數字：維持 port 列數。
- 用 Notification hook 自動把閒置提醒標成已讀：要多裝一支 hook，問題只在 60 秒內去看時發生。

## 未決問題
