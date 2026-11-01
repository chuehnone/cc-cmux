# <功能名稱>

<一段話：使用者看得到的行為。寫使用者做什麼、面板有什麼反應。不寫實作方式。>

## Sub-features

- `<短 ID>`：<一個子功能一行。每一行都要能單獨驗證。>

## How to get to it (user POV)

- <使用者從哪裡進入這個功能，例如面板上哪一列、哪個按鈕。有幾個入口就列幾個。>

## Driving it with ccv

Preconditions:

- <開始前要成立的狀態，例如 `ccv launch` 回報 `READY`、`ccv doctor` 全部 `OK`。>

- **<步驟名稱>。** <使用者做的事>。執行 `<ccv 指令>`。<成功時能觀察到的狀態，例如 port、`sidebar-state` 的值、AX 列、畫面文字。不要寫「看起來正常」。>

## Gotchas

- <會浪費時間或讓驗證結果失效的陷阱、已知問題、還沒驗證的部分。>
