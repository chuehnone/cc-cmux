---
name: ship-cc-cmux
description: 自動完成 cc-cmux 一個功能的全部流程：用 plan-cc-cmux 的自動模式規劃並 commit，用 implement-cc-cmux 實作與驗證，全部通過後 commit 並 push。過程發現錯誤時，用 retro-cc-cmux 檢討並改進 skill，再回到 plan 修正。輸入是問題而不是功能時（例如「為什麼…」「查…」），只調查並回報，不規劃也不寫 spec。使用者說「ship」「自動做完」「規劃到 push 一次做完」「ship-cc-cmux」時使用。
---

# 自動完成 cc-cmux 的一個功能

這個 skill 把三個 skill 串起來，中途不停下來問使用者，除非遇到「停下來問使用者」一節的情況。

```
plan-cc-cmux（自動模式）→ commit → implement-cc-cmux（TDD、驗證、每輪 commit）→ push
                ↑                                   │
                └──── plan 修正 ← retro-cc-cmux ←── 發現錯誤
```

## 授權

使用者啟動這個 skill，就代表授權這一次流程中的 commit 與 push：

- commit 直接在 main 上做，照 repo 規則。
- 全部通過後，push 到 origin/main。
- retro-cc-cmux 以自動模式修改 skill，不先問使用者。改動照常 commit。retro 改到 `scripts/`、`.githooks/`、模板或任何 SKILL.md 時，push 前停下來給使用者看，見「停下來問使用者」。
- 這個授權不包含 commit 與 push 以外的對外動作，例如 issue 留言、開 issue、關閉 issue。

這是全域 CLAUDE.md「commit 與 push 要使用者明示要求」與「檢討後先和使用者確認做法」的例外，只限這個 repo、只限這個 skill 啟動的流程。

## 0. 判斷輸入

輸入是問題而不是功能時（例如「為什麼…」「查…」），照這個順序做：

1. 只調查。不進入 plan，不寫 spec，不改程式。
2. 回報調查結果：問題、查到的事實與證據、原因、還沒查明的部分。
3. 調查結果需要改程式時，寫出建議的改法。使用者決定要不要另開一次 ship。

調查結果照這個方式記錄：

- 和既有功能有關時，寫進那個功能檔的 Gotchas，附日期與 run id。
- 有對應的 issue 時，先給使用者看留言草稿，確認後才送出。
- 不新增調查專用的檔案或目錄。

輸入是功能時，從第 1 節開始。

## 1. 開始

1. 記下開始時的 commit：`git rev-parse HEAD`。回報時用它列出這次的所有 commit。
2. 確認工作區是乾淨的：`git status --short` 沒有輸出。不乾淨時，停下來問使用者。
3. 確認 `node --test tests/*.test.mjs` 全部通過。開始前就失敗時，停下來回報。
4. 告訴使用者：實作途中會改到使用者正在用的面板；驗證時 cmux 要在前景，不要操作測試 window。

## 2. 規劃

用 plan-cc-cmux 的「自動模式」規劃。完成後 commit spec 與功能檔。pre-commit 的 `check-spec` 必須通過。

## 3. 實作與驗證

用 implement-cc-cmux 實作。它照 TDD 一輪一個 commit，最後做完整的驗證與回歸。

驗證前，確認前景 app 是 cmux：`lsappinfo info -only name $(lsappinfo front)`。不是時，先請使用者把 cmux 切到前景。前景不是 cmux 時跑出的結果不算數，要重跑。

## 4. 發現錯誤時

下列情況算「發現錯誤」：

- spec 自相矛盾，或和實測的事實不符。例如 `ccv probe` 讀到的值和 spec 寫的不同。
- 照 spec 寫的測試通過了，實跑卻不符合成功條件。
- verify 的 sub-feature FAIL，而且不是已知問題。
- ccv 的判斷回報了錯的 PASS 或 FAIL。例如實跑時發現 `ccv check-focus` 把成功的跳轉判成 FAIL。當場修好 ccv 也一樣要檢討。

不算「發現錯誤」：

- 已知問題造成的 FAIL。照實記錄 FAIL，繼續流程。
- 前景不是 cmux、螢幕被鎖定。這是環境問題，照第 3 節處理。

已知問題只指一種情況：功能檔的 Gotchas 寫了 issue 編號，而且 `gh issue view <N>` 回報 OPEN。兩項都成立才算已知問題。其他 FAIL 一律算「發現錯誤」。

發現錯誤時，照這個順序做：

1. 停止實作。已經 commit 的輪次保留，不要 revert。
2. 用 retro-cc-cmux 的自動模式檢討。它會改進 skill、模板或 ccv，每項改動各一個 commit。
3. 用 plan-cc-cmux 的自動模式修正 spec：在原本的 spec 上改，決策表加一列寫出這次的修正與原因。commit。
4. 回到第 3 節，從受影響的那一輪繼續。

同一個功能最多回頭 2 次。第 3 次發現錯誤時，停下來問使用者。

## 5. 完成

1. `node --test tests/*.test.mjs` 全部通過，`node scripts/check-no-comments.mjs` 通過。
2. `git status --short` 沒有輸出。
3. push：`git push origin main`。push 後用 `git log origin/main..HEAD` 確認沒有剩下沒 push 的 commit。
4. 回報，用表格：

| 項目 | 結果 |
|------|------|
| 自動採用的決策 | spec 決策表中標「自動採用建議」的每一列，一句話寫選擇 |
| 單元測試 | 通過數 / 總數 |
| 每個 sub-feature | PASS、FAIL 或未驗證，附原因 |
| 回歸 | install、list、stop 與其他功能的結果 |
| retro 的改動 | 每項改動的 commit、改了什麼、為什麼 |
| 證據 | `~/.cache/cc-cmux-verify/<run>/` |
| commit 與 push | 開始的 commit 到最後的 commit，push 的結果 |

## 停下來問使用者

遇到下列情況，停下來問使用者，不要自動做：

- 要改 repo 外的檔案，例如使用者的 statusline 腳本或 `~/.claude/settings.json`。
- 要用公司帳號，或要花明顯比較多的 token。例如一次啟動多個 Claude、或要跑很久的實跑。
- 驗證需要使用者配合：cmux 不在前景、螢幕被鎖定、測試 window 被操作。
- 規劃時，某一題沒有明確的建議可選，或兩個選項各有明顯代價。
- 同一個功能回頭修了 2 次，還是發現錯誤。
- 發現範圍外的問題，例如既有功能的錯誤。先記錄，問使用者要不要另開一次 ship。
- 開始前工作區不乾淨，或測試已經失敗。
- 這次流程中，retro 改到 `scripts/`、`.githooks/`、模板或任何 SKILL.md。push 前停下來，列出 retro 的每個 commit 與 diff 摘要。使用者確認後才 push。理由：retro 能改到擋住這個流程的檢查。
- 要做 commit 與 push 以外的對外動作，例如 issue 留言、開 issue、關閉 issue。先給使用者看要送出的內容，確認後才送出。理由：2026-11-03 第 1 次 ship 直接在 issue #2 留言並關閉，沒有先給草稿。

## 注意

- 跑測試和 commit 分開下指令。先看測試結果，再 commit。理由：2026-11-02 把兩者串在一起，測試失敗時仍然 commit 了。
- 數字從資料計算，不憑印象寫。例如回報 commit 數量前，先執行 `git log <開始>..HEAD --oneline | wc -l`。
