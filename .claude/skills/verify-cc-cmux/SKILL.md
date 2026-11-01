---
name: verify-cc-cmux
description: 像使用者一樣操作 cc-cmux 的 cmux 右側欄面板「Services」，並留下證據。面板是 GUI，在 cmux app 裡執行。改了 sidebars/services.js、要證明面板的列表或按鈕（開啟、跳轉、停止）真的可用、或使用者說「驗證 Services 面板」「實際點點看」時使用。
---

# 驗證 cc-cmux 的 Services 面板

這個 skill 在 cmux 裡開一個本次專用的 window，啟動一個測試 server，再操作 Services 面板並留下證據。

所有指令都在 repo 根目錄執行。helper 是 `.claude/skills/verify-cc-cmux/scripts/ccv.mjs`，以下簡稱 `ccv`。

```sh
ccv() { .claude/skills/verify-cc-cmux/scripts/ccv.mjs "$@"; }
```

## 共用實例的規則

本機只有一個 cmux 實例，使用者正在用它。這個 skill 沒有隔離的實例可用。

- 只操作 `ccv launch` 開的 window，以及這個 window 裡的 workspace。不要操作使用者的 window、workspace、分頁或 agent。
- 不要對使用者的 window 執行 `cmux right-sidebar`。每個 `right-sidebar` 指令都要加 `--window <這個 run 的 window>`。
- 不要停止不是這個 run 啟動的服務。面板列出的 port 可能包含使用者的服務。`ccv click` 只點 `:<測試 port>` 那一列，不要改成點其他列。
- `ccv` 每個指令都從 `state.json` 讀 window。window 已經不在時，`ccv click` 會拒絕執行。
- 不在 cmux 終端機裡（沒有 cmux socket 或 `CMUX_CUA_CLIENT_PATH`）時，回報失敗，不要找別的方式操作。

## Launch

```sh
ccv launch
```

這個指令照順序做：

1. 執行 `cmux sidebar validate services`。沒通過就停止。
2. 在 18700–18799 找一個空的 port，並在系統暫存目錄建一個資料夾，裡面放 `index.html`。
3. `cmux new-window --name verify-cc-cmux-<run>`：開本次專用的 window。
4. `cmux new-workspace --window <window> --name verify-svc-<run> --command "python3 -I -m http.server <port> --bind 127.0.0.1 --directory <資料夾>"`：在這個 window 的分頁前景啟動測試 server。
5. `cmux right-sidebar set custom services --window <window> --no-focus`：在這個 window 顯示 Services 面板。
6. 等待就緒，最多 60 秒。

就緒的條件，四項都要成立：

- server 分頁在 `cmux tree` 裡。
- port 在 LISTEN。
- `cmux sidebar-state --workspace <server workspace>` 的 `ports=` 有這個 port。
- 面板的 AX 樹有 `:<port>` 這段文字。

就緒時印出 `READY run=<run> port=<port> window=<id> evidence=<目錄>`。逾時時印出 `FAIL`，並列出還沒成立的條件。逾時後先執行 `ccv cleanup`，再重試。

收掉的方式見 Cleanup。

## Doctor

```sh
ccv doctor [run]
```

這是唯讀檢查。畫面不對、點擊沒效果、或重試之前，先執行它。全部 `OK` 時 exit 0，任何一項 `FAIL` 時 exit 1。

檢查項目：

- cmux socket 可連線，並印出 cmux 版本。
- 這個 run 開的 window 還在。
- server 分頁還在。
- port 由這個 run 的分頁持有：LISTEN 行程的 tty 等於 server 分頁的 tty。
- 這個 window 的右側欄是 custom sidebar，而且看得到。
- `~/.config/cmux/sidebars/services.js` 是 symlink，指向這個 repo 的 `sidebars/services.js`。
- 面板標題 `Services` 和 `:<port>` 這一列都在 AX 樹裡。

## Drive

面板的按鈕是 `Image().onTap()`，cmux 不會把它匯出成 AX 按鈕。所以 `ccv` 先用 AX 樹找到 `:<port>` 這一列，再從 window 右緣往左算出按鈕位置，最後用 cmux-cua 做像素點擊。

```sh
ccv click stop        # 停止：送 Ctrl+C 給 server 分頁
ccv click focus       # 跳轉：切到 server 分頁
ccv click open        # 開啟：用預設瀏覽器開 http://localhost:<port>
ccv check-stop       # 停止後的兩項檢查：停止生效、15 秒內面板更新
ccv wait-row absent   # 等面板的 :<port> 消失，最多約 90 秒
ccv wait-row present  # 等面板的 :<port> 出現
```

`ccv click` 照順序做：

1. `cmux focus-window --window <這個 run 的 window>`。
2. 用 `cmux shot` 存一張點擊前的截圖，檔名是 `click-<button>-<epoch>.png`。這張截圖的寬度也用來算倍率。
3. 用 cmux-cua `click` 點擊，`delivery_mode` 設成 `foreground`。

按鈕位置（point，從 window 右緣往左算）：停止 34、跳轉 63、開啟 92。y 座標是 `:<port>` 文字框的下緣。像素座標是 point 乘上倍率。每次點擊前都重新算倍率：截圖寬度除以 cmux-cua 當下回報的 window 寬度。兩個值和倍率都寫進 `actions.log`。倍率不在 1 到 3 之間，或 window 高度小於 200 pt 時，`ccv click` 拒絕點擊。

cmux-cua 回傳 `verified:false` 是正常的。要用 `ccv check-stop`、`ccv wait-row` 或 `ccv capture` 確認點擊的效果。

「停止」用 `ccv check-stop` 判定，拆成兩項，兩項都 PASS 才算通過：

- `STOP_EFFECT`：port 釋放、server 行程結束、分頁畫面有 `^C`。
- `PANEL_UPDATE`：從點擊算起 15 秒內，面板的 `:<port>` 消失。15 秒是使用者定的上限，不要延長。

`PANEL_UPDATE` 有已知的失敗：cmux 有時不更新 port。細節見 `features/services-stop.md` 的 Gotchas。

各功能的完整操作見 `features/README.md`。

## Evidence

證據放在 `~/.cache/cc-cmux-verify/<run>/`。設定 `CCV_EVIDENCE_DIR` 可以改位置。`~/.cache/cc-cmux-verify/latest` 記錄最近一次的 run id。

不要把證據放進 repo。截圖和終端機內容含本機路徑與帳號名稱，而這個 repo 是 public。

```sh
ccv capture <label>
```

這個指令寫出 `<label>.png` 和 `<label>.txt`。`.txt` 包含：

- `lsof` 看到的 port LISTEN 狀態。
- server 行程的 pid、tty 和指令。
- `sidebar-state` 的 `ports=`。
- 面板的 `:<port>` 這一列是 present 還是 absent。
- `list-windows`，以及這個 run 的 window 的 `tree`。
- server 分頁最後 15 行畫面。

其他檔案：

- `actions.log`：每個操作的時間、指令和 cmux-cua 的回傳值。
- `launch.png`：就緒時的畫面。
- `click-<button>-<epoch>.png`：點擊前的畫面。
- `check-stop.txt`、`check-stop.png`：`ccv check-stop` 的結果與當下狀態。
- 每份 `<label>.txt` 記錄 server workspace 的 `status_count`。用 `--count` 或 `--with-hook` 時，另外記錄 bg workspace 的 `ports=`、`status_count`、每個 port 的 LISTEN 狀態／是否在 `ports=`／面板列，以及 agent tag 與 PID。
- 執行過 `ccv bg-start` 後，每份 `<label>.txt` 另外記錄背景服務：port 的 LISTEN 狀態、listener 的 tty、agent PID、`sidebar-state` 的 ports、面板列與副標、agent 分頁的畫面。
- `cleanup.txt`：清理了什麼，以及 port 是否已釋放。

證據標準：

- 走使用者的路徑：點面板上的按鈕。不要直接呼叫 `cmux surface.send_key` 或 `surface.focus` 來代替點擊。
- 記錄操作前後的狀態。每次點擊都要有 before 和 after 兩次 `capture`。
- 檢查副作用，不能只看畫面。例如「停止」要確認 port 釋放、server 行程結束、分頁畫面有 `^C`。「開啟」要確認 server 分頁的 log 有 `GET /`。
- 不要用 mock。

## Cleanup

```sh
ccv cleanup [run]
```

這個指令照順序做：

1. 用 `cmux close-window --window <這個 run 的 window> --force` 關掉這個 run 開的 window。window 裡的 server 會跟著結束。
2. server 的 pid 還在 LISTEN 這個 port 時，只對這個 pid 送 SIGTERM。
3. 刪除 launch 建立的暫存資料夾。
4. 寫出 `cleanup.txt`。

cleanup 不關其他 window，不依行程名稱 kill，也不刪證據目錄。

每次失敗後，重試前都要先執行 `ccv cleanup`。

## Helpers

| 指令 | 用途 |
|------|------|
| `ccv launch` | 開 window、啟動測試 server、顯示面板，並等待就緒 |
| `ccv doctor [run]` | 唯讀檢查 |
| `ccv click <open\|focus\|stop> [bg]` | 點面板上的按鈕。加 `bg` 時點背景服務那一列 |
| `ccv check-stop` | 停止後的兩項檢查，各自回報 PASS 或 FAIL |
| `ccv bg-start` | 在本次 run 的 window 開一個 workspace，執行 `claude -p --model haiku`，請它用背景 Bash 啟動測試 server（port 18750–18799）。等到三件事成立才回報 `BG READY`：cmux 把它記錄成 agent、server 是它的子孫且沒有 tty、`sidebar-state` 有這個 port。最多等 120 秒，會用到 token |
| `ccv click <open\|focus\|stop> bg` | 點背景服務那一列的按鈕 |
| `ccv bg-start --count N` | 在同一個分頁啟動 N 個 `claude -p`（1–4），各用背景 Bash 啟動一個 server，port 不同。就緒條件：每個 port 都在 LISTEN、server 是某個 claude 的子孫、server 沒有 tty。不要求 cmux 偵測到 port，所以可當對照組 |
| `ccv bg-start --with-hook` | 在暫存資料夾寫專案層 `.claude/settings.json`，`SessionStart` 與 `UserPromptSubmit` 執行 repo 的 `hooks/register-agent.mjs`。不改使用者的 `~/.claude/settings.json`。可與 `--count` 一起用 |
| `ccv bg-kill <編號>` | 只結束 `bg-start` 記錄的第 N 個 claude 與它的 server（編號從 1 開始，依 port 順序） |
| `ccv wait-row <present\|absent>` | 等面板的 `:<port>` 出現或消失 |
| `ccv capture <label>` | 存截圖和狀態 |
| `ccv cleanup [run]` | 收掉這個 run 開的東西，保留證據 |

不帶 `[run]` 時，用 `latest` 記錄的 run。

一次完整的驗證：

```sh
ccv launch && ccv doctor && ccv capture before-stop && ccv click stop && ccv check-stop; ccv cleanup
```

## 新功能

用這個 skill 實作 Services 面板的新功能時，照這五步做。新功能沿用上面的 Launch、Drive、Evidence、Cleanup，不要另外建 skill。

依據：pstack `poteto-mode/playbooks/feature.md` 第 5 步 "Verify on the matching surface. \"Inconclusive\" or wrong-surface is not a pass."，以及第 6 步的 sequence-verifiable-units：每個小單位做完、驗證完、commit 後，才做下一個。

1. **先寫驗證標準，再寫程式。** 用 plan-cc-cmux 規劃，它會同時產出 `specs/<新功能>.md` 和這裡的功能檔。手動寫時，複製 `features/_TEMPLATE.md`，存成 `features/<新功能>.md`，四個 H2 都要寫。寫明使用者怎麼進入、怎麼操作，以及看到什麼結果算成功。成功條件要寫成能觀察的狀態，例如 port、`sidebar-state` 的值、AX 列、畫面文字。不要寫「看起來正常」。需求還模糊時，先用 grill-me 問清楚。這個檔要在寫程式之前 commit，至少要在寫程式之前寫好。理由：先寫程式再寫標準，標準容易照著程式寫，驗證就證明不了什麼。
2. **確認 ccv 能操作新的 UI。** 逐條對照第 1 步的 Drive，確認每個操作和每個成功條件都有 `ccv` 指令可用。不能時，先擴充 `scripts/ccv.mjs`，並實跑一次證明能用，再開始實作。
3. **一小段一小段做。** 用 implement-cc-cmux 實作，它照 TDD 一個行為一輪。每完成一小段，就跑一次這個功能的 Drive 和 Evidence。通過後才 commit 這一段，再做下一段。失敗時，先 `ccv cleanup`，修好再跑。
4. **交件時附上證據，並回歸測試。** 附上新功能的證據路徑 `~/.cache/cc-cmux-verify/<run>/`。再跑一次既有功能（install、list、stop），確認舊功能沒壞。
5. **驗證不了的部分，回報「未驗證」。** 未驗證不算通過。目前未驗證的有：2 倍螢幕上的點擊、`services-focus`、`services-open`、分頁有 agent 時的鎖頭與橘點、空狀態。新功能用到這些地方時，先補上驗證。
