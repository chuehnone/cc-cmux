# 用 cmux 事件判斷「跳轉」有沒有切換

issue #2 記錄「跳轉按鈕點了常常沒有切換」。實測發現按鈕本身正常，是驗證方法讀到落後的選取狀態。這次把 ccv 的判斷改成看 cmux 的 `workspace.selected` 事件，並重新驗證跳轉。

## Why（為什麼要做）

`services-focus`、`services-background` 的 `bg-focus`、`services-agent-tab` 的 `agent-bg-focus` 都判定「跳轉」FAIL 或不穩定。2026-11-01 記錄 9 次點擊只切換 2 次。這些結論讓使用者以為按鈕壞了，也讓三個 sub-feature 一直無法驗證通過。

## How（現在怎麼做）

- ccv 判斷有沒有切換的方法，是讀 `cmux tree` 或 `ccv capture` 的 `tree`，看哪個 workspace 標著 `[selected]`（`features/services-focus.md`、`features/services-background.md`）。
- 2026-11-03 實測（cmux 0.65.2，cmux 在前景）：
  - 先用 `select-workspace` 切回原 workspace、等 1 秒再點：server 列 3 次、背景列 6 次，`cmux tree` 都在 3.5 秒內顯示切換。
  - launch、`bg-start` 之後直接點（run `20261103T155923-eim6`、`20261103T160254-p0vh`）：`cmux tree` 在點擊後至少 14 秒內仍回報原 workspace，判讀成 3 次都沒切換。
  - 同一次（run `20261103T160254-p0vh`），`cmux events` 在第 1 次點擊時記錄到 `workspace.selected`，`payload.workspace_id` 是目標 workspace。第 2 次點擊前的截圖顯示，畫面已經選取目標 workspace。約 1 分鐘後，`cmux tree` 才顯示切換。
  - 同樣的失敗狀態下，用 CLI 送 `cmux rpc surface.focus`，`cmux tree` 立刻顯示切換。
- `cmux tree` 在哪些情況會落後、為什麼落後，未查證。
- `cmux events --name workspace.selected` 可以只串流這種事件；`--timeout <秒>` 讓它在期限內沒有事件時結束（`cmux events --help`）。
- `workspace.selected` 的 payload 有 `workspace_id`、`previous_workspace_id`、`title`（實測輸出）。
- ccv 沒有單元測試。ccv 的改動用實跑證明。

## 決策

| 決策 | 選擇 | Why |
|------|------|-----|
| 要修什麼 | 只修 ccv 的判讀方法，不改 `sidebars/services.js` | 實測證明按鈕正常，畫面與事件都有切換。（自動採用建議） |
| 判斷依據 | 點擊後 5 秒內，`cmux events` 出現 `workspace.selected`，而且 `payload.workspace_id` 是目標 workspace 的 id | 事件和畫面一致，`cmux tree` 會落後。（自動採用建議） |
| 怎麼收事件 | `ccv click focus` 點擊前，在背景啟動 `cmux events --name workspace.selected --no-ack --no-heartbeat --timeout 8`，輸出寫進證據資料夾；新指令 `ccv check-focus` 讀這個檔案判斷 | 點擊前就要開始收，才不會漏掉事件。（自動採用建議） |
| 目標 workspace | server 列是 server 的 workspace；`bg` 是 `bg-start` 的 workspace；`agent` 是 `agent-tab-start` 的 workspace | 和 `ccv click` 的目標一致。（自動採用建議） |
| 點擊前已經選取目標時 | `check-focus` 回報 FAIL，原因寫「點擊前已經選取目標，無法判斷」 | 不會有 `workspace.selected` 事件，不能當成通過。（自動採用建議） |
| `capture` 的 tree | 保留，另外在 `capture` 加記 JSON tree 的 `selected_workspace_ref`，並註明可能落後 | tree 仍有用，只是不能拿來判斷切換。（自動採用建議） |
| issue #2 | 實跑通過後，在 issue 留言說明原因與結果，再關閉 | 這是對外的動作，ship 的授權只涵蓋 commit 與 push，所以先問使用者。（自動採用建議） |

## 成功條件

1. `ccv click focus [bg|agent]` 點擊前，在背景收 `workspace.selected` 事件，寫進 `<證據資料夾>/focus-events-<時間>.jsonl`。
2. `ccv check-focus` 在點擊後 5 秒內，讀到 `payload.workspace_id` 等於目標 workspace id 的事件時，印出 `FOCUS PASS`，exit 0。
3. 5 秒內沒有讀到時，印出 `FOCUS FAIL`，附上收到的事件，exit 1。
4. 點擊前目標已經被選取時，`check-focus` 印出 `FOCUS FAIL`，原因寫「點擊前已經選取目標」。
5. 實跑：launch 後直接點 server 列跳轉，`check-focus` PASS。
6. 實跑：launch、`bg-start` 後直接點背景列跳轉，`check-focus` PASS。這是先前判讀失敗的情況。
7. 實跑：先選取 server 的 workspace，再點 server 列跳轉，`check-focus` FAIL。證明判斷不是永遠通過。

## 邊界情況

| 情況 | 行為 |
|------|------|
| 點擊前已經選取目標 | FAIL，原因寫「點擊前已經選取目標」。 |
| 點擊後切到別的 workspace | FAIL，附上收到的 `workspace_id`。 |
| `cmux events` 啟動失敗 | `ccv click` 照樣點擊，`check-focus` 回報 FAIL，原因寫「沒有事件檔」。 |
| 點擊後切換超過 5 秒 | FAIL。 |
| cmux 不在前景 | 照 verify 的規則，結果不算數。 |
| `cmux tree` 落後 | 不影響判斷。`capture` 照樣記錄，並註明可能落後。 |

## 資料流範例

範例的值取自 2026-11-03 實跑（run `20261103T160254-p0vh`）：原 workspace id `997293B3-…`，`bg-start` 的 workspace id `12C02A9B-…`。

| 情況 | 點擊前的狀態 | cmux 發出的事件 | `cmux tree` 回報 | `check-focus` 的結果 |
|------|--------------|-----------------|------------------|----------------------|
| 正常：背景列 | 選取 `997293B3` | `workspace.selected`，`workspace_id: "12C02A9B-…"`，`previous_workspace_id: "997293B3-…"` | 點擊後至少 14 秒仍是 `997293B3`（實測） | `FOCUS PASS` |
| 正常：server 列 | 選取原 workspace | `workspace.selected`，`workspace_id` 是 server 的 workspace | 3.5 秒內顯示切換（實測） | `FOCUS PASS` |
| 點擊前已經選取目標 | 選取 server 的 workspace | 沒有 `workspace.selected` | server 的 workspace | `FOCUS FAIL`（點擊前已經選取目標） |
| 切到別的 workspace | 選取原 workspace | `workspace.selected`，`workspace_id` 不是目標 | 未實測 | `FOCUS FAIL`，附上收到的 id |
| 事件檔不存在 | 任一 | 不經過 | 不經過 | `FOCUS FAIL`（沒有事件檔） |
| 切換超過 5 秒 | 選取原 workspace | 第 6 秒才有 `workspace.selected` | 未實測 | `FOCUS FAIL` |
| cmux 不在前景 | 任一 | 未實測 | 未實測 | 結果不算數 |

## 改動範圍

| 檔案 | 改什麼 |
|------|--------|
| `.claude/skills/verify-cc-cmux/scripts/ccv.mjs` | `click focus` 點擊前收事件；新增 `check-focus`；`capture` 加記 JSON tree 的 `selected_workspace_ref`。 |
| `.claude/skills/verify-cc-cmux/SKILL.md` | 指令表加 `check-focus`；寫明 `cmux tree` 的選取可能落後，判斷跳轉要用 `check-focus`。 |
| `.claude/skills/verify-cc-cmux/features/services-focus.md`、`services-background.md`、`services-agent-tab.md` | 跳轉的 Drive 改用 `check-focus`，寫入實跑結果。 |
| `.claude/skills/verify-cc-cmux/features/README.md` | 更新實跑狀態。 |

不改的檔案與理由：

- `sidebars/services.js`：按鈕正常。
- `tests/`：ccv 沒有單元測試，面板也沒有改。
- `README.md`：使用者看得到的行為沒有改變。

## 測試清單

單元測試：無。理由：這次只改 ccv，ccv 沒有單元測試；面板沒有改。現有測試照舊全部通過。

驗收（verify-cc-cmux）：

- 功能檔：`.claude/skills/verify-cc-cmux/features/focus-check.md`
- sub-feature：`focus-tab`、`focus-bg`、`focus-negative`
- 回歸：install、list、stop，以及 `services-focus`、`services-background` 的 `bg-focus`、`services-agent-tab` 的 `agent-bg-focus`

## ccv 需要的擴充

1. `ccv click focus [bg|agent]`：點擊前在背景啟動 `cmux events --name workspace.selected --no-ack --no-heartbeat --timeout 8`，輸出寫進證據資料夾，並記錄點擊前選取的 workspace 與目標 workspace id。
2. `ccv check-focus`：讀事件檔判斷，規則見「成功條件」2–4。
3. `ccv capture`：加記 JSON tree 的 `selected_workspace_ref`。

## 不做的事

- 查 `cmux tree` 為什麼會落後：屬於 cmux 本身，記錄在功能檔的 Gotchas。
- 改 `sidebars/services.js`：按鈕正常。
- 複查 2026-11-01 的舊截圖：結論已由這次實跑確認。

## 未決問題
