---
name: plan-cc-cmux
description: 用一次一題的拷問式訪談，規劃 cc-cmux 的新功能或改動。每一題都寫出 How（現在怎麼做）與 Why（為什麼要這麼做），最後產出 spec 和驗證標準，交給 implement-cc-cmux 實作。使用者說「規劃功能」「討論新功能」「我想在 Services 面板加…」「這個要怎麼改」「plan-cc-cmux」時使用。只討論、不寫程式。
---

# 規劃 cc-cmux 的功能

這個 skill 的訪談方式參考 grill-me：一次問一題，每一題都附上建議答案，事實自己查，決策交給使用者。和 grill-me 不同的地方是：每一題都要寫出 How 和 Why。

- **How（現在怎麼做）**：程式、cmux 或使用者的流程目前怎麼運作。這是事實，要自己查，並附上出處。
- **Why（為什麼要這麼做）**：這個決策要解決什麼問題，不做會怎樣。這是理由，要讓使用者確認。

產出兩個檔案，都在實作前 commit：

- `specs/<功能>.md`：設計。照 `spec-template.md` 寫。
- `.claude/skills/verify-cc-cmux/features/<功能>.md`：驗證標準。照 `features/_TEMPLATE.md` 寫。

這個 skill 不寫程式，也不改 `sidebars/`、`tests/`、`scripts/`。

## 1. 先查事實

開始訪談前，先讀這些資料。訪談中寫 How 時，要引用這裡查到的內容。

- `sidebars/` 底下的程式，例如 `sidebars/services.js`。
- `README.md` 的功能說明與已知限制。
- `.claude/skills/verify-cc-cmux/features/`：現有功能與「未驗證」清單。
- `tests/`：現有的單元測試，看已經保護了哪些行為。
- cmux custom sidebar 的文件：`cmux docs sidebars` 會印出網址。查資料欄位時，看「Live data you can bind to」一節。例如 workspace 層的 `ports` 包含 agent 背景行程的 port，分頁層的 `ports` 只有分頁 tty 上的行程。
- 跟 cmux 行為有關的事實，用 `cmux --help`、`cmux <指令> --help` 或實際執行查。不要憑記憶寫。

查不到的事實，寫「未查證」。不要用推測補。

## 2. 訪談

### 規則

1. 一次只問一題。等使用者回答，再問下一題。
2. 每一題用這個格式：

   ```
   ### 問題 N：<問題>

   **How（現在怎麼做）**：<現況。附出處，例如 sidebars/services.js:6、cmux docs sidebars、指令輸出。查不到就寫「未查證」。>

   **Why（為什麼要這麼做）**：<這個決策要解決什麼問題、不做會怎樣、會影響哪些後面的決策。自己的推測要標明「推測」。>

   **我的建議**：<具體答案與理由。>
   ```

3. 事實自己查，不要問使用者。決策一定要問使用者，不要自己決定。
4. 照決策的依賴順序問。前面的答案會改變後面要問什麼。
5. 不客套。發現沒有根據的假設，直接指出。
6. 使用者回答「不知道」或「你決定」時，照建議寫入，並在 spec 的決策表標明「使用者交給 Claude 決定」。

### 要問到的決策

照這個順序走。不適用的題目，在總結裡寫「不適用」與理由，不要直接略過。

1. **問題與動機**：使用者遇到什麼狀況？現在怎麼處理？為什麼不夠？
2. **使用者路徑**：從哪裡進入？點什麼？看到什麼？
3. **成功條件**：怎樣算做好？每一條都要寫成能觀察的狀態，例如 port、`sidebar-state` 的值、AX 列、畫面文字、`cmux()` 送出的呼叫。不接受「看起來正常」。
4. **資料來源**：用 cmux 的哪個欄位？欄位缺值時怎麼辦？
5. **範圍**：這次做什麼、不做什麼。
6. **邊界情況**：空資料、很多筆、agent 分頁、資料延遲（例如 cmux 有時不更新 port，見 issue #1）。
7. **改動範圍**：要改哪些檔案。目標是最小改動，列出不改的理由。
8. **測試清單**：哪些行為用單元測試（`tests/`，用 `tests/harness.mjs` 模擬 cmux），哪些行為只能用 verify-cc-cmux 實跑驗證。
9. **ccv 是否夠用**：對照 verify-cc-cmux 的 helper，列出驗證這個功能還缺的能力。缺的部分要先擴充 ccv，才能開始實作。

## 3. 共同理解總結

決策都問完後：

1. 條列每個決策、選擇與 Why。
2. 問使用者：「以上是我們達成的共同理解，確認無誤嗎？」
3. 使用者確認前，不要寫檔。

## 4. 寫 spec 與驗證標準

使用者確認後：

1. 複製 `spec-template.md`，寫成 `specs/<功能>.md`。檔名用小寫英文加連字號，例如 `specs/services-agent-ports.md`。
2. 複製 `.claude/skills/verify-cc-cmux/features/_TEMPLATE.md`，寫成 `.claude/skills/verify-cc-cmux/features/<功能>.md`。在 `features/README.md` 的功能表加一列，實跑狀態寫「未實跑」。
3. 兩個檔案互相對應：spec 的「驗收」寫 features 檔的 sub-feature ID；features 檔的 Drive 對應 spec 的成功條件。
4. 檢查 spec 的「未決問題」是空的。不是空的，就回到訪談。
5. 給使用者看兩個檔案的重點，確認後依 repo 規則 commit。這個 repo 直接在 main commit。

## 5. 交接

告訴使用者下一步：用 implement-cc-cmux 實作 `specs/<功能>.md`。

## 注意

- repo 是 public。spec 裡不要寫本機絕對路徑、帳號名稱、公司名稱、截圖或終端機內容。
- 成功條件寫不出可觀察的狀態時，代表需求還不清楚。繼續問，不要用模糊的字眼帶過。
- 這個 skill 只負責規劃。使用者在訪談中要求直接改程式時，先問是否要結束規劃。
