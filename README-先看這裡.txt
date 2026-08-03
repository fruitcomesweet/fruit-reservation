這是修正「員工分頁沒有出現」的正式版本。

原因：GitHub 畫面中 index.html 仍顯示舊日期，代表新版 index.html 沒有成功覆蓋；員工分頁的 HTML 正是在 index.html 裡。

請把這個資料夾裡所有檔案上傳到 GitHub fruit-reservation 專案根目錄，並覆蓋同名檔案。
特別確認：index.html、app.js、styles.css、service-worker.js 都必須顯示最新更新時間。

Commit 訊息可填：修正員工管理分頁與快取

Netlify 自動部署後：
1. 等 1-3 分鐘
2. Safari 強制重新整理：Command + Shift + R
3. 重新登入後台
4. 老闆帳號會看到：訂單｜商品｜員工｜設定

員工新增流程：
1. 先在 Supabase Authentication > Users 建立該員工登入帳號
2. 回網站後台 > 員工
3. 輸入姓名、同一個 Email、選權限並儲存
