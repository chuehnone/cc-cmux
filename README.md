# cc-cmux

cmux 的自訂設定。

## sidebars/services.js

右側欄面板「Services」。面板列出所有 workspace 中監聽的 port。每列有三個按鈕：

- 開啟：用瀏覽器開 `http://localhost:<port>`。
- 跳轉：切到執行這個服務的分頁。
- 停止：對這個分頁送 Ctrl+C。

分頁裡有 coding agent 時，面板不送 Ctrl+C。理由：Ctrl+C 會中斷 agent，不一定會停掉服務。這種列的圓點是橘色。

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

### 已知限制

- 面板只列出有開 port 的服務。背景執行但沒有開 port 的 shell（例如 build、test）不會出現。
- 背景服務只有在 cmux 把啟動它的程式記錄成 agent 時才會出現。
- 同一個 workspace 有多個 Claude Code session 時，沒裝上面的 hook，背景服務會時有時無。
- 這個 hook 用的是 cmux 沒有公開文件的 socket 指令 `set_agent_pid`。cmux 改版後可能失效。
- cmux 不是前景 app 時，背景服務不會更新：新的背景服務不出現，或結束的不消失。切回 cmux 後約 2–3 秒內更新。原因是 cmux 在背景時會暫停定期的 agent 掃描。cmux 放在第二個螢幕、但正在用別的 app 時，也是如此。
- 面板看不出背景服務是哪個 agent 啟動的。
- 服務結束後，cmux 有時不移除 port，那一列會留著（issue #1）。
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

要說明程式的用途或理由時，寫進 README。

執行單元測試：

```sh
node --test tests/*.test.mjs
```

`tests/harness.mjs` 用 Node 的 vm 模擬 cmux 的 sidebar 執行環境。單元測試通過，不代表在 cmux 裡能跑，要再用 `.claude/skills/verify-cc-cmux` 實跑。

開發流程用三個 skill：`plan-cc-cmux` 規劃並產出 `specs/<功能>.md`，`implement-cc-cmux` 照 spec 用 TDD 實作，`verify-cc-cmux` 實際操作面板驗證。

手動檢查全部檔案沒有註解：

```sh
node scripts/check-no-comments.mjs
```
