# 檢討紀錄

新的紀錄加在最上面。每筆用這個格式：

```
## YYYY-MM-DD 主題

- 錯在哪裡：
- 怎麼發現的：
- 根本原因：
- 擋法：模板／檢查腳本／ccv／hook／文字規則，擇一
- 改了什麼：檔案與 commit
- 證明：怎麼證明有效；證明不了時寫「未證明」與原因
```

## 2026-11-03 agent 的 surfaceId 對不到分頁

- 錯在哪裡：`sidebars/services.js` 用 agent 的 `surfaceId` 比對分頁。橘點、鎖頭與「不送 Ctrl+C」的保護從來沒有生效。services-waiting 的 spec 也照同樣的方式寫。
- 怎麼發現的：實作 services-waiting 時，實跑看到分頁名稱是 `undefined`，用暫時的探查 sidebar 讀真實資料才發現。理想上應該在規劃時就讀真實資料。
- 根本原因：照 cmux 文件寫程式與 spec，沒有用真實資料核對。單元測試的假資料也照文件寫，所以測不出來。
- 擋法：ccv 加模板。
- 改了什麼：加 `ccv probe`（commit `2faa9e2`）；spec 模板的資料流範例規定「cmux 存的值」要先用 `ccv probe` 讀真實資料（commit `b2c5f82`）；修正程式（commit `a785123`、`c67bc6d`）。
- 證明：修正後實跑 agent-dot、agent-lock PASS（run `20261103T153303-1ffx`）。模板規定本身是否擋得住下一次，未證明：要等下一個用到 cmux 欄位的功能。

## 2026-11-02 label 格式與邊界情況矛盾

- 錯在哪裡：claude-rate-limit 的 label 沒有已用百分比，邊界情況卻寫「label 用原始值」。另外漏了「兩個帳號在同一個 workspace 會互相覆蓋」。
- 怎麼發現的：實作第 5 輪寫測試時。理想上應該在規劃寫 spec 時。
- 根本原因：資料流分段討論，沒有拿具體的值從來源走到畫面。
- 擋法：模板加檢查腳本。
- 改了什麼：spec 模板加「邊界情況」與「資料流範例」；加 `scripts/check-spec.mjs`，由 pre-commit 檢查 spec 有沒有每一節（commit `1d43402`）。
- 證明：用修正前的 label 格式試填資料流範例，兩處錯誤都在表上露出來。check-spec 做反向測試：缺節、未決問題不是空的、留下模板原文，三種都被擋下。

## 2026-11-02 測試失敗仍然 commit

- 錯在哪裡：一輪實作把跑測試和 commit 串在同一個指令，測試失敗時仍然 commit 了。
- 怎麼發現的：看指令輸出才發現，事後用 amend 修正（commit `8644b9f`）。
- 根本原因：指令用 `;` 和 `&&` 混著串，測試失敗沒有中斷後面的 commit。
- 擋法：文字規則。git hook 可以在 pre-commit 跑全部測試，但每次 commit 都會多花約 1 秒，還沒決定。
- 改了什麼：ship-cc-cmux 的「注意」寫明跑測試和 commit 分開下指令。
- 證明：未證明。之後同一個 session 又串在一起一次，那次測試剛好全過。文字規則擋不住，下次再發生時，改成 pre-commit 跑測試。
