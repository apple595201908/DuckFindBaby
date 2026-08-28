# 鴨鴨基因實驗室：美術生成規格

角色、場景與介面均為本專案原創。七張參考圖只用來理解配方、色彩方向與「候選角色升起再落下」的遊玩節奏，沒有直接使用或描摹參考作品的角色、介面、文字、標誌或像素內容。

## 鎖色鴨鴨圖集

鴨鴨不是由影像模型重新畫 14 次。全部 14 色都由同一隻原創黃鴨母版產生：`scripts/generate_gene_palette_sprites.sh` 以鎖定 HEX 提供色相與飽和度，再沿用母版的亮度圖，所以姿勢、輪廓、陰影與高光完全一致。眼睛、腹部、嘴喙、腮紅與腳使用按顏色及幾何範圍建立的獨立遮罩，維持固定原色。

生成程序會額外驗證透明角落，以及嘴喙與嘴巴內三個穩定取樣點。固定五官遮罩先以原始透明度清除隱藏 RGB，再分別處理臉部與橙色腳掌的反鋸齒邊緣；若遮罩再次滲入嘴喙，腳本會直接失敗，不會輸出可發布圖集。

## 深色 2.5D 基因實驗室背景

正式背景是 `public/game/assets/gene-lab-night-bg.webp`，由內建影像生成流程製作，再轉為 1536×1024 WebP。它是一張完全非寫實的深色 2.5D 卡通實驗室場景，包含大型發光 DNA 雙螺旋、兩側圓潤玻璃培養槽、科幻控制台與底部實驗平台；畫面不含鴨子、人物、愛心、文字、標誌或介面。

主色鎖定為深海藍、鈷藍、靛紫與梅紫，使用青色及柔和洋紅作為光源，不加入灰色霧化濾鏡。中央保留低細節安全區，讓親代卡、提示與選項維持清晰。背景以 `object-fit: cover` 適配直向及橫向，30 秒動畫只使用小幅 `transform` 位移與縮放，不加入執行時模糊或多層粒子。

### 最終生成提示詞

```text
Use case: stylized-concept. Create one original 1536×1024 landscape background for a mobile web game titled 鴨鴨基因實驗室, depicting an elegant futuristic genetics laboratory interior. Deep layered laboratory with strong spatial depth, a large graceful luminous DNA double helix across the upper-middle area, rounded glass specimen chambers and streamlined consoles framing only the left and right edges, and a subtle raised floor platform. Premium polished 2.5D cartoon game art with clean silhouettes, translucent glass, glossy enamel and controlled atmospheric glow. Keep the central play area calm and open. Palette: deep saturated navy, cobalt blue, indigo and plum with luminous cyan and soft magenta highlights. Absolutely no gray cast, washed-out neutrals or muddy desaturation. No characters, ducks, hearts, text, logos, watermark or UI mockup. Avoid photorealism, horror, medical gore, clutter and industrial grime.
```
