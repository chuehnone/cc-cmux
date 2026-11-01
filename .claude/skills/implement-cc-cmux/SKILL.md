---
name: implement-cc-cmux
description: 依 plan-cc-cmux 產出的 spec（specs/<功能>.md）實作 cc-cmux 的功能。先寫測試再寫程式（TDD），只做最小改動，做完用單元測試與 verify-cc-cmux 檢驗一次實作結果。使用者說「實作 spec」「照 spec 做」「implement-cc-cmux」「開始實作 <功能>」時使用。沒有 spec 時，先改用 plan-cc-cmux。
---

# 實作 cc-cmux 的功能

依 `specs/<功能>.md` 實作。每個行為都照「先寫測試、看到失敗、最小改動、看到通過」的順序做。全部做完後，檢驗一次實作結果。

相關檔案：

- spec：`specs/<功能>.md`，由 plan-cc-cmux 產出。
- 驗證標準：`.claude/skills/verify-cc-cmux/features/<功能>.md`。
- 單元測試：`tests/*.test.mjs`。`tests/harness.mjs` 用 Node 的 vm 載入 `sidebars/<名稱>.js`，模擬 cmux 的 `sidebar`、`Text`、`VStack`、`data`、`cmux()`、`openURL()`、`log()`。
- 執行測試：`node --test tests/*.test.mjs`。不要寫成 `node --test tests/`，那樣會找不到測試檔。

## 1. 開始前檢查

照順序檢查。任一項不成立，就停下來回報，不要開始寫程式。

1. `specs/<功能>.md` 存在，而且已經 commit：`git log --oneline -- specs/<功能>.md` 有結果。
2. 驗證標準的功能檔存在，而且已經 commit。
3. spec 的「未決問題」是空的。
4. `node --test tests/*.test.mjs` 全部通過。開始前就失敗時，先回報，不要一起修。

不成立時，請使用者先用 plan-cc-cmux 補齊。理由：先有程式再寫標準，標準容易照著程式寫，驗證就證明不了什麼。

## 2. 先補 ccv

spec 的「ccv 需要的擴充」不是「無」時，先擴充 `.claude/skills/verify-cc-cmux/scripts/ccv.mjs`，並實跑一次證明能用，再開始寫功能。做法照 verify-cc-cmux 的「新功能」第 2 步。

## 3. TDD：一個行為一輪

照 spec「測試清單」的順序，一次做一條：

1. **寫測試。** 在 `tests/` 加一個 `test()`，只測這一條行為。測試名稱用中文寫出行為，例如「分頁有 agent 時不送 Ctrl+C」。
2. **看到失敗。** 執行 `node --test tests/*.test.mjs`。確認新測試失敗，而且失敗原因是「功能還沒做」，不是測試寫錯或 harness 不支援。harness 不支援某個 DSL 函式時，先擴充 `tests/harness.mjs`，讓舊測試仍然全過。
3. **最小改動。** 只改到讓這個測試通過為止。
4. **看到通過。** 再跑一次全部測試，全部通過。執行 `node scripts/check-no-comments.mjs`，沒有註解。
5. **驗證畫面。** 這一輪改到面板上看得到的行為時，跑 verify-cc-cmux 功能檔裡對應 sub-feature 的 Drive 和 Evidence。結束後跑 `ccv cleanup`。
6. **commit 這一輪。** 依 repo 規則在 main commit。一輪一個 commit，commit message 寫這一輪的行為。

失敗時先修，不要跳到下一條。驗證失敗時，先跑 `ccv cleanup`，再修。

## 最小改動的規則

- 只改 spec「改動範圍」列出的檔案。需要改其他檔案時，停下來告訴使用者原因，先更新 spec 並 commit，再繼續。
- 不順手重構、不改名、不調整格式。和這一輪測試無關的改動，一律不做。
- 不加新的依賴。Node 標準庫和 cmux DSL 不夠用時，先問使用者。
- 程式不放註解，pre-commit 會擋。要說明用途或理由時，寫進 README 或 spec。
- 測試只測行為，不測實作細節。例如測「送出了哪個 cmux 呼叫」，不測「呼叫了哪個內部函式」。

## 4. 檢驗實作結果

所有行為都做完後，檢驗一次：

1. `node --test tests/*.test.mjs` 全部通過。
2. `node scripts/check-no-comments.mjs` 通過。
3. 對照 spec 的「改動範圍」，用 `git diff --stat <開始前的 commit>..HEAD` 確認沒有改到範圍外的檔案。
4. 用 verify-cc-cmux 跑新功能的完整 Drive 與 Evidence：`ccv launch`、`ccv doctor`、功能檔的每一步、`ccv cleanup`。
5. 回歸：跑既有功能 install、list、stop。stop 用 `ccv check-stop` 判定。
6. 確認 cleanup 後證據還在 `~/.cache/cc-cmux-verify/<run>/`。
7. 更新 `features/README.md` 的實跑狀態。

## 5. 回報

用表格回報：

| 項目 | 結果 |
|------|------|
| 單元測試 | 通過數 / 總數，以及新增的測試名稱 |
| 每個 sub-feature | PASS、FAIL 或未驗證，附原因 |
| 回歸（install、list、stop） | PASS 或 FAIL |
| 改動範圍 | 實際改的檔案，與 spec 的差異 |
| 證據 | `~/.cache/cc-cmux-verify/<run>/` |
| commit | 每一輪的 hash |

驗證不了的部分寫「未驗證」，不算通過。例如 2 倍螢幕、`services-focus`、`services-open`。已知問題（例如 issue #1 的 cmux 沒更新 port）照實寫出，不要延長等待時間來湊出通過。

## 注意

- `~/.config/cmux/sidebars/services.js` 是 symlink，指向這個 repo 的檔案。改 `sidebars/` 會影響使用者正在用的面板。cmux 何時重新載入改過的檔案，還沒驗證過。實作中途的半成品可能出現在使用者的面板上，開始前先告訴使用者。
- `tests/harness.mjs` 是模擬環境，不是 cmux。單元測試通過，不代表在 cmux 裡能跑。所以第 4 步一定要用 verify-cc-cmux 實跑。
- harness 只認得 `tests/harness.mjs` 的 `VIEW_TYPES` 列出的 view。modifier（例如 `.font()`）都會被接受，但只記錄 `fill` 和 `color` 的值。用到新的 view，或要檢查其他 modifier 的值時，要擴充 harness，並確認舊測試全過。
