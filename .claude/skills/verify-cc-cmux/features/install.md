# 安裝面板

使用者 clone repo 後建立 symlink，cmux 就能讀到 Services 面板，並在右側欄顯示。

## Sub-features

- `install-link`：`~/.config/cmux/sidebars/services.js` 是 symlink，指向 repo 的 `sidebars/services.js`。
- `install-validate`：`cmux sidebar validate services` 通過。
- `install-show`：`cmux right-sidebar set custom services` 會在右側欄顯示面板。

## How to get to it (user POV)

- 照 README「安裝」一節做：clone、建立 symlink、validate、`cmux right-sidebar set custom services`。
- 在 cmux 右側欄按右鍵，選 `services`。

## Driving it with ccv

Preconditions:

- symlink 已建立。ccv 不會建立或修改 symlink，因為那是使用者的設定。
- 在 cmux 終端機裡執行。

- **檢查 symlink 與 validate。** 執行 `ccv doctor`。`services.js symlink 指向這個 repo` 這一項是 `OK`。
- **顯示面板。** 執行 `ccv launch`。launch 會執行 `cmux sidebar validate services`，再對本次 run 的 window 執行 `cmux right-sidebar set custom services --window <window> --no-focus`。看到 `READY`。
- **確認畫面。** 執行 `ccv capture install`。`install.png` 的右側欄標題是 `Services`；`install.txt` 的 `panel row` 是 `present`。

## Gotchas

- `cmux sidebar validate` 也要連到執行中的 cmux app。沒有 cmux socket 時，validate 會回報 `Socket not found`，這不代表 `services.js` 有錯。
- 不要對使用者的 window 執行 `right-sidebar set`。一定要加 `--window`。
- 「右鍵選 services」這個入口沒有驗證過。
