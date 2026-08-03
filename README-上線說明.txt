果來好甜｜Supabase 賣家登入正式版

已完成：
- 後台改用 Supabase Email＋密碼登入
- 移除寫死的 fruit123
- 登入狀態可保留，並提供登出
- 未登入者不能讀取訂單或修改商品、庫存、設定
- 客人仍可免登入瀏覽商品及送出預約

上線前必做：
1. 在 Supabase 打開 SQL Editor。
2. 建立 New query。
3. 將本資料夾 schema.sql 全部貼入並按 Run。
4. 確認 Authentication → Users 已有你的賣家 Email 帳號。
5. 將整個資料夾重新壓縮，拖曳到 Netlify 的 Deploys 頁面重新部署。
6. 打開網站，按「店家後台」，使用 Supabase Email 與密碼登入。

重要：
- 不要把 Supabase Secret key 放進 config.js。
- config.js 內只有 Project URL 與 Publishable key，這是瀏覽器前端使用的金鑰。
- 真正的資料保護由 schema.sql 裡的 RLS 權限負責。
