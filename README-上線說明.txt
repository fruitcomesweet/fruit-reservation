果來好甜｜正式版網頁

一、先直接預覽
1. 把整個資料夾拖到 Netlify Drop：https://app.netlify.com/drop
2. 上傳完成後，Netlify 會立刻給你一個網址。
3. 這時可以操作，但還是「單機預覽」，不同手機不會同步。

二、開啟正式雲端同步
1. 到 https://supabase.com 建立免費專案。
2. 進入 SQL Editor，把 schema.sql 全部貼上並執行。
3. 到 Project Settings → API，複製 Project URL 與 anon public key。
4. 打開 config.js，填入：
   SUPABASE_URL: "你的 Project URL"
   SUPABASE_ANON_KEY: "你的 anon key"
5. 再把整個資料夾重新拖到 Netlify Drop。
6. 網頁上方顯示「雲端同步」，代表成功。

三、管理後台
預設密碼：fruit123
請在 config.js 裡修改 ADMIN_PASSWORD。

四、重要安全提醒
此版本為能快速上線的正式架構版，但後台使用簡易密碼，資料庫政策也為方便測試而較寬鬆。
正式長期營運前，建議再升級為 Supabase Auth 店家登入與更嚴格的 RLS 權限。
