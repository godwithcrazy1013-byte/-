# 策定九州・隊伍傷害試算器 — 部署說明

這是一個**純靜態網站**（無後端、無資料庫，計算全部在使用者瀏覽器完成）。
本資料夾內的檔案原樣上傳到任何靜態托管即可。

## 最簡單：Netlify Drop（2 分鐘，不用註冊也能先測）

1. 開啟 https://app.netlify.com/drop
2. 把「public」**資料夾**整個拖進網頁
3. 立刻得到一個公開網址（例如 https://xxx-yyy.netlify.app），直接發給朋友

## GitHub Pages（免費、永久）

1. 在 GitHub 開一個新 repository（公開）
2. 把「public」資料夾裡的**所有檔案**上傳到 repo 根目錄
3. Settings → Pages → Source 選 main branch → Save
4. 幾分鐘後網址為 https://你的帳號.github.io/repo名稱/

## Cloudflare Pages / Vercel

一樣是「上傳此資料夾 → 得到網址」，免費額度遠超所需。

## 朋友在中國大陸？

GitHub Pages 有時連線不穩，建議改用 Gitee Pages、騰訊雲 COS 或阿里雲 OSS 靜態托管，國內速度快。

## 注意事項

- 武將數據在 `data.json`，**上傳即公開**，任何人都能下載你的技能資料庫
- 頭像圖片約 11 MB，首次載入約 2–5 秒，之後瀏覽器會快取
- 更新數據：改完 Excel 重新匯出 `data.json` 後，把新檔上傳覆蓋即可

## 不想上傳數據？改用隧道（資料留在家裡）

在你的電腦跑 `node server.js --host 0.0.0.0 --port 7100`（或雙擊「手機分享.bat」），
然後用 cloudflared 免費隧道對外開一個臨時網址：

```
cloudflared tunnel --url http://localhost:7100
```

視窗會顯示一個 https://xxx.trycloudflare.com 網址，關掉程式網址即失效。
適合臨時給朋友看，缺點是你電腦要開著、隧道關掉就斷線。
