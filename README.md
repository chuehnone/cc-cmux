# cc-cmux

cmux 的自訂設定。

## sidebars/services.js

右側欄面板「Services」。面板列出所有 workspace 中監聽的 port。每列有三個按鈕：

- 開啟：用瀏覽器開 `http://localhost:<port>`。
- 跳轉：切到執行這個服務的分頁。
- 停止：對這個分頁送 Ctrl+C。

分頁裡有 coding agent 時，面板不送 Ctrl+C。理由：Ctrl+C 會中斷 agent，不一定會停掉服務。這種列的圓點是橘色。

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

### 已知限制

- 面板只列出在 cmux 分頁中啟動的服務。
- sidebar 不能執行 shell。所以面板不能依 port 直接 kill 程式，只能對分頁送 Ctrl+C。
