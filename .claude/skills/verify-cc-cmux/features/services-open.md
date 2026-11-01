# 用瀏覽器開啟服務

使用者點一列的「開啟」按鈕（`safari` 圖示），面板用預設瀏覽器開啟 `http://localhost:<port>`。

## Sub-features

- `open-request`：點擊後，瀏覽器對測試 server 送出 `GET /`。

## How to get to it (user POV)

- 在 Services 面板上，點那一列最左邊的按鈕。

## Driving it with ccv

Preconditions:

- `ccv launch` 回報 `READY`。
- `ccv doctor` 全部 `OK`。
- 使用者同意在預設瀏覽器開一個分頁。這個動作會影響使用者的瀏覽器，執行前先問。

- **記錄操作前。** 執行 `ccv capture before-open`。`before-open.txt` 的 server 分頁畫面沒有 `GET /`。
- **點開啟。** 執行 `ccv click open`。
- **確認副作用。** 執行 `ccv capture after-open`。`after-open.txt` 的 server 分頁畫面有一行 `"GET / HTTP/1.1" 200`。這行是 http.server 的 request log，證明瀏覽器真的連到了測試 server。

## Gotchas

- 這個功能還沒實跑過。
- 開啟的網址是 `localhost`，測試 server 綁的是 `127.0.0.1`。瀏覽器若先把 `localhost` 解析成 IPv6 的 `::1`，可能連不上。這一點沒有驗證過。
- 瀏覽器分頁是使用者的，cleanup 不會關掉它。驗證完請告訴使用者。
- 不要只用截圖證明，因為截圖只截得到 cmux 的 window。要看 server 的 request log。
