# 登記每一個 Claude Code session

用 Claude Code hook 把 cmux 裡每一個 Claude Code session 都登記成 agent，讓它們用背景 shell 啟動的服務都出現在 Services 面板上。

## Why（為什麼要做）

同一個 workspace 有多個 Claude Code session 時，cmux 只記錄最後送出 hook 的那一個。其他 session 用背景 shell 啟動的服務，不會被算進 workspace 的 `ports`，Services 面板就不顯示，而且會隨著哪個 session 最後送出 hook 而時有時無。2026-11-01 在一個有 4 個 Claude 的 workspace 遇到：服務一直在 LISTEN，面板卻不顯示。

## How（現在怎麼做）

- cmux 用字典記錄 agent PID：`agentPIDs[key] = pid`，同一個 key 後寫入的會蓋掉前一個（cmux 原始碼 `Workspace+PanelLifecycle.swift` 的 `recordAgentPID`）。
- Claude Code 的 hook 固定用 key `claude_code` 登記（cmux 測試中的 `set_agent_pid claude_code <pid>`）。omp 等 agent 的 key 帶 session id（例如 `omp.<sessionId>`），可以並存。
- cmux 對 Claude 的特殊處理寫在 key `claude_code` 上（`recordAgentPID` 中的 `key == "claude_code"`）。
- 登記指令是 socket 的 `set_agent_pid <key> <pid> [--tab=<id>] [--panel=<id>]`（cmux 原始碼 `ControlCommandCoordinator+SidebarMetadataV1.swift`）。`cmux --help` 沒有列出這個指令，屬於沒有公開文件的內部指令。
- cmux 自己注入的 Claude hook：
  - 用 `CMUX_CLAUDE_PID=${CMUX_CLAUDE_PID:-$PPID}` 取 Claude 的 PID。
  - 沒有 `CMUX_SURFACE_ID`，或 `CMUX_CLAUDE_HOOKS_DISABLED=1` 時，直接結束。
  - 透過 cmux 啟動 Claude 時的 `--settings` 帶入，不寫在使用者的設定檔。
- cmux 的 shell integration 送 socket 指令時，有 `CMUX_SOCKET_CAPABILITY` 就在前面加 `_cmux_capability_v1 <capability> `，並用 `nc -w 1` 最多等 1 秒（`cmux-zsh-integration.zsh` 的 `_cmux_write_socket_payload`、`_cmux_send`）。
- cmux 掃描 agent 時會比對行程身分，PID 被重用不會誤認（`PortScanner+Process.swift` 的 `validateAgentRoots`）。PID 不存在時會清掉登記（`clearStaleAgentPIDs`）。
- 2026-11-01 的實驗（測試 window，用自己起的 `sh` 當 agent）：
  - `set_agent_pid exp.one <pid> --tab=<workspace>` 回 `OK`，1 秒內它底下的背景 port 出現在 `sidebar-state` 的 `ports=`。
  - 再登記 `exp.two`，兩個背景 port 同時存在。
  - `sidebar-state` 的 `status_count` 是 0。`cmux top` 多出兩個 tag。
  - 行程結束後，port 從 `ports=` 消失。
- 依 Claude Code 文件，`SessionStart` hook 的 stdout 會加進 Claude 的 context。未在本機查證。
- `sidebars/services.js` 已經會列出 workspace `ports` 裡、分頁沒有的 port（背景服務）。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 目標 | cmux 裡每個 Claude Code session 都被登記；自動完成；不改 `services.js` | 面板已會讀 workspace 的 `ports`，缺的是 cmux 的登記 |
| 安裝方式 | repo 提供 `hooks/register-agent.mjs`；使用者手動在 `~/.claude/settings.json` 的 `hooks` 加一筆；不寫自動安裝 script | 要改全域設定，手動加比較好審查與移除 |
| 帳號 | 先只裝個人帳號 | 先觀察，再決定公司帳號 |
| key | `cc-cmux.claude.<Claude PID>` | PID 一定拿得到；同時存在的行程 PID 不重複；不以 `claude_code` 開頭，避開 cmux 的特殊處理 |
| 登記事件 | `SessionStart`、`UserPromptSubmit` | 新 session 立刻登記；cmux 重開後在下一次送出 prompt 時補回；`PreToolUse` 太頻繁 |
| 不在 cmux 時 | 沒有 `CMUX_SOCKET_PATH`、沒有 `CMUX_SURFACE_ID`，或 `CMUX_CLAUDE_HOOKS_DISABLED=1` 時不送 | 與 cmux 自己的 hook 條件一致 |
| Claude PID | 有 `CMUX_CLAUDE_PID` 用它，否則用父行程 PID | 與 cmux 自己的 hook 一致 |
| 取消登記 | 不做 | cmux 會清掉不存在的 PID |
| socket 沒回應 | 最多等 1 秒，放棄後 exit 0 | 不能擋住 Claude |
| 輸出 | stdout 不印任何東西；只有 `CC_CMUX_HOOK_DEBUG=1` 時把錯誤寫到 stderr | 避免被加進 Claude 的 context |
| 驗證時的 hook 設定 | 用 `claude -p` 工作目錄裡的專案層 `.claude/settings.json` | 不改使用者的全域設定 |

## 成功條件

單元測試：

1. 沒有 `CMUX_SOCKET_PATH` → 不送。
2. 沒有 `CMUX_SURFACE_ID` → 不送。
3. `CMUX_CLAUDE_HOOKS_DISABLED=1` → 不送。
4. 沒有 `CMUX_TAB_ID` → 不送。
5. 條件齊全 → 指令是 `set_agent_pid cc-cmux.claude.<PID> <PID> --tab=<CMUX_TAB_ID>`。
6. 有 `CMUX_CLAUDE_PID` 時用它；沒有時用父行程 PID。
7. 有 `CMUX_SOCKET_CAPABILITY` 時，送出的內容是 `_cmux_capability_v1 <capability> <指令>`。
8. 直接執行 hook，`CMUX_SOCKET_PATH` 指向不存在的路徑：1 秒內 exit 0，stdout 是空的。

實跑（verify-cc-cmux）：

9. cmux 在前景時，同一個測試 workspace 啟動兩個帶 hook 的 `claude -p`，各用背景 Bash 啟動一個 server。兩個 port 在 30 秒內一直出現在 `sidebar-state` 的 `ports=`，面板上也各有一列 `:<port>`。對照組（不帶 hook）同樣條件下，兩個背景 port 不會同時出現在 `ports=`。
10. 帶 hook 時，`sidebar-state` 的 `status_count` 與對照組相同。
11. 測試 Claude 與它的背景 server 結束後，15 秒內 port 從 `ports=` 消失。
12. 回歸：install、list、stop、services-background 照舊通過。

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `hooks/register-agent.mjs`（新增） | export 判斷函式：輸入環境變數與父行程 PID，輸出要送的內容或「不送」。直接執行時讀完 stdin、送 socket、不印 stdout |
| `tests/register-agent.test.mjs`（新增） | 成功條件 1–8 |
| `README.md` | hook 的安裝與移除步驟、`settings.json` 片段、已知限制 |
| `.claude/skills/verify-cc-cmux/scripts/ccv.mjs` | `bg-start` 新增 `--with-hook`、`--count 2` |
| `.claude/skills/verify-cc-cmux/SKILL.md` | 記錄 `bg-start` 的新選項 |
| `.claude/skills/verify-cc-cmux/features/agent-registration.md`、`features/README.md` | 規劃時已寫好；實作時更新實跑狀態、Gotchas 與 Drive 的指令 |

不改的檔案與理由：

- `sidebars/services.js`：已經讀 workspace 的 `ports`。
- `tests/harness.mjs`：hook 不是 sidebar。
- `~/.claude/settings.json`：在 repo 外。implement 不改，由使用者照 README 安裝。

## 測試清單

單元測試（`tests/register-agent.test.mjs`，實作時先寫、先看到失敗）：

1. 沒有 `CMUX_SOCKET_PATH` → 回傳「不送」。
2. 沒有 `CMUX_SURFACE_ID` → 回傳「不送」。
3. `CMUX_CLAUDE_HOOKS_DISABLED=1` → 回傳「不送」。
4. 沒有 `CMUX_TAB_ID` → 回傳「不送」。
5. 條件齊全、父行程 PID 是 4242、`CMUX_TAB_ID=T1` → `set_agent_pid cc-cmux.claude.4242 4242 --tab=T1`。
6. `CMUX_CLAUDE_PID=777`、父行程 PID 4242 → key 與 PID 都用 777。
7. `CMUX_SOCKET_CAPABILITY=cap` → `_cmux_capability_v1 cap set_agent_pid …`。
8. 以子行程執行 `hooks/register-agent.mjs`，stdin 給 `{}`，`CMUX_SOCKET_PATH` 指向不存在的路徑、其他條件齊全 → exit code 0，1 秒內結束，stdout 為空字串。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/agent-registration.md`
- sub-feature：`reg-both`、`reg-control`、`reg-no-status`、`reg-cleanup`
- 回歸：install、list、stop、services-background

## ccv 需要的擴充

- `ccv bg-start --with-hook`：在暫存資料夾寫專案層 `.claude/settings.json`，`SessionStart` 與 `UserPromptSubmit` 指向 `hooks/register-agent.mjs`，並讓 `claude -p` 在這個資料夾執行。
- `ccv bg-start --count 2`：在同一個分頁啟動兩個 `claude -p`，各用背景 Bash 啟動一個 server，port 不同。
- capture 記錄兩個背景 port 的狀態，以及 `sidebar-state` 的 `status_count`。
- 實作第 2 步先驗證三件事，任一件不成立就停下來回報，不改用其他做法：
  1. 專案層 settings 的 hook 會被執行（`cmux top` 出現 `cc-cmux.claude.<PID>` 的 tag）。
  2. cmux 自己的 hook 仍有效（`claude_code` tag 仍在）。
  3. 兩個 `claude -p` 都屬於同一個 workspace。

## 實作中的更新

2026-11-01 實作第 2 步，用探針 hook（只把環境變數寫進檔案）在測試 workspace 啟動兩個 `claude -p`：

- 專案層 `.claude/settings.json` 的 `SessionStart`、`UserPromptSubmit` hook 都有執行。hook 的 `$PPID` 就是 Claude 的 PID，與 `CMUX_CLAUDE_PID` 相同。
- cmux 自己的 hook 仍有效：`claude_code` tag 仍在。
- 兩個 Claude 的 `CMUX_TAB_ID` 相同，屬於同一個 workspace。
- 對照組：30 秒內 `ports=none`，兩個背景 port 都不在。`claude_code` 記的 PID 底下也有背景 server，但沒有被偵測到。當時沒有記錄前景 app；推測原因是 cmux 在背景（見下方「cmux 在背景時不更新」）。規劃時預期「只有其中一個」，所以對照組的條件改成「兩個背景 port 不會同時出現」。
- 手動用 `set_agent_pid cc-cmux.claude.<PID> <PID> --tab=<workspace>` 登記兩個 Claude 後，2 秒內 `ports=` 出現兩個背景 port，`status_count` 不變（1）。
- 用 `&` 放到背景的那個 `claude -p` 與它的背景 server，在關閉測試 window 後仍存活。所以 ccv 的 cleanup 要記錄每一個 Claude 與 server 的 PID，並逐一結束。

### cmux 在背景時不更新（2026-11-01 至 11-02 的調查）

第一次正式驗證（run `20261101T155855-nkwq`）：hook 有登記兩個 `cc-cmux.claude.<PID>`，但 30 秒內 `ports=none`。調查過程排除了幾個假說，結論如下。

- **原因：cmux 不是前景 app 時，定期 agent 掃描會暫停。** cmux v0.65.2.2 `AppDelegate.swift:2622`（`applicationWillResignActive`）暫停、`:2155`（`applicationDidBecomeActive`）恢復，`TerminalController.swift:1195` 啟動時依 `NSApplication.shared.isActive` 設定。本機 cmux 0.65.2 build 113 的 commit 是 `12023d89f`，即 v0.65.2.2。
- 暫停時，登記改變會觸發一輪短掃描，實測約 5–7 秒。shell 執行指令也會觸發，這是讀原始碼的推論，未實測。server 在這段時間之後才 bind，就偵測不到。單一 key、`sh` 當 agent 的實測：bind 延遲 3、5 秒偵測到；7、9、12 秒偵測不到。那幾次 run 沒有記錄前景 app，事後查到前景是 Chrome。
- 同一個 run 內的因果測試（run `20261101T172324-59y6`，每次讀取都記錄前景 app）：cmux 在背景時 bind，之後 13 次讀取都偵測不到；切到 cmux 後約 2.6 秒出現。
- cmux 在前景時（同一個 run）：兩個帶 hook 的 Claude，30 次讀取都有兩個背景 port，面板兩列都在，`status_count` 與對照組相同。
- 被排除的假說：只有登記當下的掃描有效（cmux 在前景時，定期掃描偵測到延遲 12 秒的 bind，run `20261101T171816-x068`）；本機 binary 與原始碼版本不同；cmux 的 Stop hook 會重新登記（v0.65.2.2 `CLI/cmux.swift:31379` 只在 `session-start` 登記 Claude）；掃描結果不完整被擋下（依另一個 session 讀原始碼的結果：不完整只延後移除，不擋新增；本 session 未核對）；登記順序造成版本號錯開（單一登記、延遲 10 秒也一樣偵測不到）。
- 移除：結束被登記的 Claude 本身時，前景約 6 秒、背景約 4 秒移除 port。背景也很快的原因是推測：登記改變觸發了掃描，或 cmux 的 SessionEnd hook 清掉了 agent PID，都未查證。agent 還活著、只有 server 結束時，前景約 6 秒移除（run `20261101T173842-k16d`）；背景只觀察了約 5 秒，會不會一直留著**未驗證**。

### 決策：不支援 cmux 在背景時即時更新

使用者 2026-11-02 決定：cmux 在背景時不更新，切回 cmux 才更新。所以 hook 不加 `PostToolUse` 或延遲重送。這是使用者決定的已知限制，不是技術上做不到：cmux 放在第二個螢幕、但不是前景 app 時，面板也不會更新。

## 不做的事

- 改 `sidebars/services.js`：已經讀 workspace 的 `ports`。
- 自動安裝 script：會改使用者的全域設定。
- 安裝到公司帳號：先觀察個人帳號。
- 支援 Claude Code 以外的 agent。
- 回報上游 cmux：另外決定。
- 取消登記：cmux 會清掉不存在的 PID。

## 風險

- `set_agent_pid` 是 cmux 沒有公開文件的內部指令。cmux 改版時可能失效，README 要寫明。
- hook 寫進全域設定後，所有 Claude session 都會執行它，包含不在 cmux 裡的。不在 cmux 時要什麼都不做。

## 未決問題
