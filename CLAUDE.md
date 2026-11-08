# CLAUDE.md — hfpc-rpg-kit(給維護這個 repo 的 AI 的規矩)

**定位**:家庭作品(憫安=兒子要用它設計遊戲),不是聖經遊戲;**遊戲機(engine/)是爸爸+Claude 的,卡帶(games/)是兒子的**。
分工契約:兒子只動 `games/<名>/` 與 `assets/`,不動 `engine/`;他要的新功能開卡片、照 card-tier-rules 分層,做進遊戲機所有卡帶都能用。

## 現況(2026-11-08,喬治機・Fable 5.1:v3 美術第 1 層)

- **做了**:示範卡帶的兩張地圖換成真正的像素圖塊集 —— Kenney「Tiny Town」+「Tiny Dungeon」(CC0,`games/demo/assets/tiny-town.png`、`tiny-dungeon.png`,16×16 一格、12 欄無間距,授權寫在 `assets/CREDITS.txt`)。地圖 16px 一格、三個 embedded 圖塊集(firstgid 1 / 133 / 265 = 自繪池塘九宮格 `assets/water.png`,兩包都沒有水,照 Kenney 配色畫的)+ 一個沒圖的 `vector` 圖塊集(firstgid 274,給 tiles.json 程式畫的床)。**地圖大小、collision、物件格子座標與屬性一格不動**(scripts/e2e.mjs 用格子座標走劇情);土路加寬成 2 格、花草蘑菇都只是視覺。
- **引擎改了三處**:① `schema.js` 把 game.json 的檔名記進 `map.file`,圖塊集的 `image`(Tiled 寫的是相對地圖檔)換算成相對卡帶資料夾的 `ts.src`(`map.js` 的 `resolveMapPath`,容忍 `..` 與反斜線);`sprites.js` 抓圖與畫圖都用 `ts.src` 當鍵(`tests/tileset-path.test.mjs`)。② `main.js` 縮放改成「每格在畫面上 44~112 css px、放大倍率取整數」,16px 圖塊在手機上一格 48px,32px 卡帶觀感大致不變。③ 圖片圖塊畫整數座標與尺寸,不會有接縫。
- **沒做(第 2 層)**:人物走路圖、怪物圖片、戰鬥背景圖 —— 主角、NPC、怪物、地上道具仍是 `sprites.js` 程式畫的向量小人;床還是程式畫(兩包都沒有床)。第 2 層 = 人物與怪物換像素圖(Tiny Dungeon 裡有 24 個人物/怪物可用)+ 上層圖層(樹冠蓋在人物上面)。
- 驗收:`npm test`(驗證器 + 35 單元)、`npm run e2e` 38 項全綠;對照截圖 `tests/.out/before-*.png` vs `tests/.out/*.png`。
- 示範地圖的格號對照表在 `scripts/make-demo-maps.mjs` 最上面;要改地圖直接用 Tiled 開 `games/demo/maps/*.json`。

## 現況(2026-11-08,HFP 機・Fable 5.1・1108-0555-RPG-家裡 場:v1 首發)

- 遊戲機 v1:走格子、NPC 對話(選項 / 條件跳轉 / 旗標)、任務三態(kill / collect / flag)、背包與道具、回合制戰鬥(攻擊 / 技能 / 道具 / 逃跑;頭目戰不能逃)、升等、單槽 localStorage 存檔(schema 版號、try/catch)、休息點、傳送點、遇敵區、手機虛擬按鍵、PWA(sw 網路優先)、頁尾版本與更新紀錄、按讚留言 widget、play-stats 三層打點(`rpgkit-<卡帶>` / `-dwell` / `-done`)。
- 示範卡帶 `games/demo`《晨光村的勇者》:2 張地圖、3 任務、5 種怪、4 種道具;題材=打怪升等的經典 JRPG(原創,不是任何既有遊戲的重製)。
- 線上:https://hfpc-rpg-kit.summer09201017.workers.dev(v2;GitHub summer09201017-cloud/hfpc-rpg-kit,push 不會自動部署,要手動 wrangler)。
- 驗收:`npm test`(驗證器 + 32 單元)、`npm run e2e`(真瀏覽器 38 項:真鍵盤走路、對話、選單、遇敵打怪、回報、存檔→重整→讀檔、撿道具、條件對話、傳送、頭目戰逃不掉、結局、壞卡帶錯誤畫面、手機虛擬按鍵 pointer 事件)。
- 美術 = 程式畫的佔位(tiles.json 調色 + sprites.js 的 kind / shape);Tiled 帶圖片圖塊集時引擎優先用圖片。`.claude/no-design-needed`:正式美術開工前再出 Claude Design 設計稿。(v3 起地圖已換像素圖,見上一段)
- ⚠ 規格:使用者 1108 說「直接做」,沒走 Codex 產規格(141 號提示詞已存 skills repo `references/spec-prompts/`,輪值仍是 Codex)。
- 📋 待辦:部署後進帳本(sites.json、作品集憫安合輯、play-stats NAMES 登記 `rpgkit-demo`);兒子開第二張卡帶;v2 卡片池見 README「刻意不做」。

## 鐵則

1. **engine/ 不認得任何卡帶**:engine 裡不准出現 `demo`、任何 NPC 名、任務 id。卡帶特有的東西一律資料化(game.json / 物件屬性 / 對話節點)。
2. **資料契約改了,五處一起動**:`engine/schema.js`(驗證 + 白話錯誤)→ 用到它的引擎模組 → `tests/schema.test.mjs` 加突變案例 → `docs/設計手冊.md` 的表 → `games/demo` 示範。少一處 = 值無聲消失(記憶 parsed-not-equals-stored)。
3. **版本頁尾**:改殼層 ⇒ `engine/version.js` CHANGELOG 最上面加一筆白話(給玩的人看,不寫檔名)+ `sw.js` CACHE 同號 +1 + CORE 清單補新檔;`tests/version.test.mjs` 會擋。
4. **部署前 `npm run verify` 全綠**(驗證器 + 單元 + e2e)。e2e 只准用 `__rpg.teleport` 省走路,互動一律真鍵盤 / 真點擊。
5. Playwright 釘 **1.63.0**(本機 ms-playwright 只有到 chromium-1243;升版會要下載新瀏覽器)。
6. 部署 = Cloudflare Workers 靜態站:`npx wrangler deploy --name hfpc-rpg-kit --assets . --compatibility-date 2026-11-08`(repo 沒有 wrangler 設定檔,wrangler 4.114 起不帶 `--compatibility-date` 會被擋;`.assetsignore` 已擋 .git / node_modules / scripts / tests / docs / md / txt)。不回 Netlify。
7. 無頭測試:移動是格子+時間 tween,dt 上限 0.1s;低 fps 也會走完,但等狀態要給大預算(記憶 headless-dt-cap)。

## game-must-haves 六件對照(本 repo 不是聖經遊戲,逐條交代)

| 件 | 狀態 |
|---|---|
| 關卡地圖 | 不適用(RPG 是連續世界,不是關卡制) |
| 年齡三檔 | 刻意不做(16 歲設計者、玩家是同學與會友;難度由卡帶數值決定) |
| 經文朗讀 | 不適用(非聖經題材;卡帶要做聖經題材時走 baked-voice 鐵則,引擎加「對話節點播 mp3」再說) |
| 返回大廳 | 刻意不做(不進聖經遊戲大廳;作品集憫安合輯登記) |
| 統計打點 | 有(index.html 三層;NAMES 待登記) |
| 出廠檢驗 | `npm run verify` |

頁尾版本號:有做。
