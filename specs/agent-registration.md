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

9. 同一個測試 workspace 啟動兩個帶 hook 的 `claude -p`，各用背景 Bash 啟動一個 server。兩個 port 在 30 秒內一直出現在 `sidebar-state` 的 `ports=`，面板上也各有一列 `:<port>`。對照組（不帶 hook）同樣條件下，`ports=` 只有其中一個背景 port。
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
