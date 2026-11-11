# cc-cmux

cmux 的自訂設定。

## sidebars/services.js

右側欄面板「Services」。面板列出所有 workspace 中監聽的 port。每列有三個按鈕：

- 開啟：用瀏覽器開 `http://localhost:<port>`。
- 跳轉：切到執行這個服務的分頁。
- 停止：對這個分頁送 Ctrl+C。

分頁裡有 coding agent 時，面板不送 Ctrl+C。理由：Ctrl+C 會中斷 agent，不一定會停掉服務。這種列的圓點是橘色。判斷方式：agent 的 `panelId` 等於分頁的 `id`，或 agent 的 `surfaceId` 等於分頁的 `surfaceId`，任一個成立就算。cmux 文件說 `surfaceId` 對得到分頁，但 2026-11-03 實測 cmux 0.65.2 只有 `panelId` 對得到；兩個都比對，cmux 改版後比較不容易壞。

coding agent 用背景 shell 啟動、有開 port 的服務，也會列出來。這種列的副標是「workspace 名稱 · 背景」，圓點是藍色：

- 開啟：同上。
- 跳轉：workspace 只有一個 agent 時，切到那個 agent 的分頁；否則切到該 workspace。
- 停止：顯示鎖頭，不送 Ctrl+C。理由：背景服務沒有自己的分頁，送 Ctrl+C 會中斷 agent，停不掉背景行程。

### 安裝

cmux 只從 `~/.config/cmux/sidebars/` 讀 sidebar。照這個順序做：

1. Clone 這個 repo。

   ```sh
   git clone git@github.com:chuehnone/cc-cmux.git
   cd cc-cmux
   ```

2. 建立 symlink。

   ```sh
   mkdir -p ~/.config/cmux/sidebars
   ln -s "$PWD/sidebars/services.js" ~/.config/cmux/sidebars/services.js
   ```

3. 確認 cmux 讀得到檔案。

   ```sh
   cmux sidebar validate services
   ```

4. 啟用面板。

   ```sh
   cmux right-sidebar set custom services
   ```

### 讓每個 Claude Code session 都被記錄（選用）

cmux 對 Claude Code 只用一個固定的 key 記錄 agent PID。同一個 workspace 有多個 Claude Code session 時，只有最後送出 hook 的那一個被記錄，其他 session 用背景 shell 啟動的服務就不會出現在面板上。

`hooks/register-agent.mjs` 是一個 Claude Code hook。它用 `cc-cmux.claude.<PID>` 當 key，把每個 session 另外登記給 cmux。

安裝：在 `~/.claude/settings.json` 的 `hooks` 加上兩個事件。`<cc-cmux 的路徑>` 換成這個 repo 的絕對路徑。

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node <cc-cmux 的路徑>/hooks/register-agent.mjs" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node <cc-cmux 的路徑>/hooks/register-agent.mjs" }] }
    ]
  }
}
```

已有其他 hook 時，把這兩筆加進對應事件的陣列，不要覆蓋原有的設定。

行為：

- 不在 cmux 裡（沒有 `CMUX_SOCKET_PATH` 或 `CMUX_SURFACE_ID`），或 `CMUX_CLAUDE_HOOKS_DISABLED=1` 時，什麼都不做。
- 不印任何 stdout，最多等 cmux 1 秒，一律 exit 0。
- 要看錯誤時，設定 `CC_CMUX_HOOK_DEBUG=1`，錯誤會寫到 stderr。

移除：從 `~/.claude/settings.json` 刪掉這兩筆。已登記的 PID 會在 Claude 結束後由 cmux 清掉。

### 等你區：哪個 Claude session 在等你

7d 列下面有「等你」區，列出在等你的 Claude session。每一列寫出 workspace 與分頁名稱，按一下整列就切到那個分頁。

- `問題`（橘點）：Claude 在問問題、要你核准計畫，或要求權限。
- `跑完`（藍點）：Claude 跑完一個回合，那個分頁的通知你還沒看。
- 右邊是等了多久：`剛剛`、`N 分`、`N 小時`、`N 天`。
- `問題` 排在 `跑完` 前面；同一種依等待時間由長到短。
- 最多 10 列，超過時最後加一行 `還有 N 個`。
- 找不到對應的分頁時，分頁名稱寫 `分頁不明`，按下去切到那個 workspace。
- 沒有任何 session 在等時，整區不顯示。

資料來自 cmux 給 sidebar 的 `agents` 與分頁的 `hasUnread`。分頁用 agent 的 `panelId` 對應。理由：cmux 文件說 agent 的 `surfaceId` 等於分頁的 `surfaceId`，但 2026-11-03 實測 cmux 0.65.2，兩者不同，`panelId` 才等於分頁的 `id`。

不需要另外安裝。

### 顯示 Claude 7 天額度的剩餘時間（選用）

面板標題列下面顯示 Claude 訂閱 7 天視窗還剩多久重置，以及已用百分比。個人帳號與公司帳號各一列，例如：

```
個人 7d 剩 2 天 5 小時 · 已用 78%
公司 7d 剩 4 天 2 小時 · 已用 31%
```

- 已用 85% 以上（四捨五入後）時，那一列變紅。
- 剩餘時間不到 1 天時顯示 `M 小時 K 分`，不到 1 小時時顯示 `K 分`。秒數捨去。
- 過了重置時間、還沒有新資料時，顯示 `已重置，等待更新`。
- 兩個帳號都沒有資料時，顯示 `7d 無資料`。

資料來自 Claude Code 傳給 statusline 的 `rate_limits.seven_day`。`statusline/report-rate-limit.mjs` 把它寫成 Claude 所在 workspace 的 `progress`，面板再從所有 workspace 的 `progress` 讀出來。理由：sidebar 不能讀檔案，也不能連網路。官方只有 statusline 提供訂閱額度。

安裝：在 statusline 腳本裡，把 stdin 先存成變數，再在背景傳給寫入程式。`<cc-cmux 的路徑>` 換成這個 repo 的絕對路徑。

```sh
input=$(cat)
printf '%s' "$input" | node <cc-cmux 的路徑>/statusline/report-rate-limit.mjs >/dev/null 2>&1 &
```

行為：

- 沒有 `rate_limits.seven_day`，或不在 cmux 裡（沒有 `CMUX_WORKSPACE_ID`）時，什麼都不做，也不清掉舊值。
- `CLAUDE_CONFIG_DIR` 以 `.claude-work` 結尾時記成公司帳號，否則記成個人帳號。
- 執行 `cmux set-progress <已用/100> --label cc-cmux:7d:<帳號>:<resets_at>:<寫入時間>:<已用%>`。進度值夾在 0 到 1；label 保留原始百分比。
- 不印 stdout，最多等 cmux 1 秒，一律 exit 0。

移除：從 statusline 腳本刪掉那一行。已寫入的 `progress` 可以用 `cmux clear-progress --workspace <workspace>` 清掉。

### 顯示 CPU 與記憶體（選用）

面板標題列下面、7d 列上面顯示整機 CPU 使用率與記憶體已用量，例如：

```
CPU 42% · 記憶體 33.6 / 48 GB
```

- CPU 與記憶體已用比例，任一項四捨五入後 85% 以上時，這一行變紅。
- CPU 是兩次取樣之間的瞬間值，不是平均值。編譯時可能短暫變紅。
- 記憶體已用量 = App（Anonymous − purgeable）+ wired + 壓縮，單位 GiB。檔案快取不算已用。
- 超過 30 秒沒有新資料時，顯示 `系統狀況 已停止更新`。
- 沒開監控程式時，不顯示這一行。

資料來自 `monitor/system-stats.mjs`。它每 10 秒用 `os.cpus()` 算 CPU、用 `vm_stat` 算記憶體，再用 `cmux set-progress` 寫進自己所在 workspace 的 `progress`。理由：sidebar 不能執行程式，也沒有 CPU 與記憶體的欄位。寫在專用的 workspace，才不會和 7d 額度搶同一個 `progress`。

啟動：在 cmux 執行這一行，開一個叫「系統」的 workspace。`<cc-cmux 的路徑>` 換成這個 repo 的絕對路徑。

```sh
cmux new-workspace --name 系統 --command "node <cc-cmux 的路徑>/monitor/system-stats.mjs"
```

停止：在「系統」分頁按 Ctrl+C，或關掉這個 workspace。程式結束前會清掉自己寫的 `progress`，面板那一行跟著消失。

可以用環境變數調整時間，平常不必設，單元測試會用：`CC_CMUX_SYS_INTERVAL_MS` 是寫入的間隔，預設 10000；`CC_CMUX_SYS_FIRST_MS` 是啟動後第一次寫入的時間，預設 1000；`CC_CMUX_SYS_TIMEOUT_MS` 是每次執行 `vm_stat` 與 `cmux` 最多等多久，預設 1000。單位都是毫秒。值是空的、0 或不是數字時，用預設值。

不要在「系統」workspace 開 Claude。理由：7d 額度也寫 `progress`，兩支程式會互相覆蓋。

### 已知限制

- 面板只列出有開 port 的服務。背景執行但沒有開 port 的 shell（例如 build、test）不會出現。
- 背景服務只有在 cmux 把啟動它的程式記錄成 agent 時才會出現。
- 同一個 workspace 有多個 Claude Code session 時，沒裝上面的 hook，背景服務會時有時無。
- 這個 hook 用的是 cmux 沒有公開文件的 socket 指令 `set_agent_pid`。cmux 改版後可能失效。
- cmux 不是前景 app 時，背景服務不會更新：新的背景服務不出現，或結束的不消失。切回 cmux 後約 2–3 秒內更新。原因是 cmux 在背景時會暫停定期的 agent 掃描。cmux 放在第二個螢幕、但正在用別的 app 時，也是如此。
- 面板看不出背景服務是哪個 agent 啟動的。
- 服務結束後，cmux 有時不移除 port，那一列會留著（issue #1）。
- 等你區只看得到同一個 window 的 session。
- 分頁上任何未讀通知，都會讓閒置的 Claude 顯示成 `跑完`，不只 Claude 的通知。
- 回合結束約 1 分鐘後，Claude 會送出閒置提醒。提醒送到前看過、又切到別的分頁的話，提醒送到後那一列可能再出現一次（未驗證）。看過後一直停在那個分頁時，不會再出現（2026-11-03 實跑）。
- 等你區的列要在 cmux 是前景 app 時按下，通知才會變成已讀。cmux 在背景時切到那個分頁，通知仍是未讀，那一列不會消失（2026-11-03 實跑）。
- Claude 行程被強制結束、沒送 Stop 時，cmux 在 10 秒內把它改成 `ended`，那一列消失（2026-11-03 實跑）。
- `跑完` 的等待時間從閒置提醒起算，比實際跑完的時間少約 1 分鐘。原因是閒置提醒會更新 agent 的 `lastActivityAt`。
- 7d 列只看得到同一個 window 的 workspace。Claude 在別的 window 時，這個 window 的面板看不到它的額度。
- 有 Claude 的 workspace，左側欄會多一條進度條，label 是 `cc-cmux:7d:...`。
- 一個 workspace 只有一個 `progress`。其他工具呼叫 `set-progress` 時會互相覆蓋。個人帳號與公司帳號的 Claude 開在同一個 workspace 時也會互相覆蓋，面板只看得到最後寫入的帳號。
- 7d 的已用百分比只在 Claude 有回應時更新。剩餘時間由面板依時鐘計算，不必等新資料。
- cmux 不在前景時，7d 列一樣會更新。2026-11-02 實跑時，前景是別的 app，寫入後 5 秒內面板就更新了。
- CPU 與記憶體那一行只看得到同一個 window 的「系統」workspace。
- 記憶體已用量比活動監視器的「Memory Used」少約 1 GB，和它的 App Memory + Wired Memory + Compressed 相差 1 GB 以內（2026-11-09 實測）。「Memory Used」的算法 Apple 沒有公開。
- 「系統」workspace 在左側欄會有一條記憶體用量的進度條，label 是 `cc-cmux:sys:...`。
- cmux 重開後，要再執行一次啟動指令。cmux 還原 session 時會不會重跑監控程式，未驗證。
- sidebar 不能執行 shell。所以面板不能依 port 直接 kill 程式，只能對分頁送 Ctrl+C。

## 維護

Clone 後安裝 git hook：

```sh
git config core.hooksPath .githooks
```

規則由這些機制檢查：

| 規則 | 由誰檢查 |
|------|----------|
| 程式（`.js` `.mjs` `.cjs` `.ts`）不要有註解 | `.githooks/pre-commit` 執行 `scripts/check-no-comments.mjs --staged` |
| `specs/*.md` 有模板的每一節、沒有留下模板原文、「未決問題」是空的；「資料流範例」不是「不適用」時，要有「### 數字的來源」小節，而且小節裡有程式碼區塊 | `.githooks/pre-commit` 執行 `scripts/check-spec.mjs --staged` |
| 單元測試失敗時不能 commit | `.githooks/pre-commit` 執行 `node --test tests/*.test.mjs`。跑的是工作區的檔案，不是 staged 的版本。全部測試約 1.4 秒（2026-11-11 實測） |

要說明程式的用途或理由時，寫進 README。

執行單元測試：

```sh
node --test tests/*.test.mjs
```

`tests/harness.mjs` 用 Node 的 vm 模擬 cmux 的 sidebar 執行環境。單元測試通過，不代表在 cmux 裡能跑，要再用 `.claude/skills/verify-cc-cmux` 實跑。

開發流程用這些 skill：

- `plan-cc-cmux`：規劃並產出 `specs/<功能>.md`。有手動與自動兩種模式。
- `implement-cc-cmux`：照 spec 用 TDD 實作。
- `verify-cc-cmux`：實際操作面板驗證。
- `retro-cc-cmux`：發現錯誤時檢討，改進 skill、模板或 ccv。紀錄在 `.claude/skills/retro-cc-cmux/log.md`。
- `ship-cc-cmux`：把上面串起來自動跑：規劃、commit、實作、驗證、push。發現錯誤時呼叫 retro，再回到規劃修正。

手動檢查全部檔案沒有註解：

```sh
node scripts/check-no-comments.mjs
```
