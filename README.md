# hfpc-rpg-kit —— 俯視回合制 RPG 套件

**遊戲機 + 卡帶**:`engine/` 是做好的遊戲機(走路、對話、任務、背包、回合制戰鬥、升等、存檔、手機按鍵、PWA),
`games/<卡帶名>/` 是卡帶——只有資料檔(JSON)與地圖,**不碰程式**就能做出一款新遊戲。

示範卡帶《晨光村的勇者》:幫村長清除綠團子 → 幫藥草師採藥 → 進洞窟打倒巨蛛,約 20~30 分鐘。

## 玩 / 開發

```bash
npm install            # 只為了跑端對端測試(playwright);純玩不需要
npm run serve          # http://127.0.0.1:8080/?game=demo
npm run validate       # 檢查示範卡帶的資料有沒有填錯(白話中文)
npm test               # 驗證器 + 49 項單元測試
npm run e2e            # 真瀏覽器從開場玩到結局(38 項;截圖在 tests/.out/)
npm run verify         # test + e2e
npm run balance        # 戰鬥平衡模擬:每個等級把每一組怪各打 200 場 → 勝率表 + 建議等級(node scripts/balance.mjs games/<卡帶>)
npm run reach          # 走不走得到:從起點走遍所有地圖,每個人物 / 道具 / 傳送點是否到得了(node scripts/reach.mjs games/<卡帶>)
npm run smoke          # 任何卡帶的無頭冒煙:開場 → 新遊戲 → 走兩步 → 開關選單 → 零錯誤 → 截圖(node scripts/smoke.mjs <卡帶名> [--url …])
npm run new -- <卡帶名>  # 開新卡帶:複製示範卡帶成 games/<卡帶名>(node scripts/new-game.mjs <卡帶名> --title "標題")
npm run map -- 地圖.txt -o games/<卡帶名>/maps/x.json   # 用鍵盤畫的文字地圖 → Tiled JSON;--dump 反向(範例 docs/範例-文字地圖.txt)
```

後五支是「卡帶工具」:給做卡帶的人在電腦上用,不進線上殼層;怎麼讀結果看設計手冊「五之二」(文字地圖)與「十之二」(難度、可達性、冒煙)。

網址參數:`?game=<卡帶名>`(預設 demo)、`&seed=7`(固定亂數,重現遇敵)、`&debug=1`(開 `window.__rpg.debug`)、`&pad=1`(桌機也顯示虛擬按鍵)。

## 做一張新卡帶

1. `node scripts/new-game.mjs <你的卡帶名> --title "標題"`(名字只能英數、底線、連字號;它會把 `games/demo` 複製過去並改好 id)。
2. 改 `game.json`(標題、起點、主角數值、升等)、`dialogues.json`、`quests.json`、`items.json`、`enemies.json`、`encounters.json`、`tiles.json`。
3. 地圖用 [Tiled](https://www.mapeditor.org/) 開 `maps/*.json` 改(圖層只認 `ground` / `deco` / `collision`;物件的 Type 是 `npc` / `portal` / `item` / `zone` / `heal`;匯出時 Tile Layer Format 選 **CSV**、圖塊集要 **Embed**),或不開 Tiled、用鍵盤在記事本畫:`node scripts/ascii-map.mjs 地圖.txt -o games/<卡帶名>/maps/x.json`(範例 `docs/範例-文字地圖.txt`;`--dump` 可把示範村子變成文字版從它改起)。美術圖放 `assets/`(示範卡帶用 Kenney 的 CC0 像素圖塊集,見 `assets/CREDITS.txt`);沒有圖的 gid 才寫 `tiles.json`。
4. `node scripts/validate-game.mjs games/<卡帶名>` —— 有錯會用白話告訴你是哪個檔哪一句。再跑 `node scripts/reach.mjs games/<卡帶名>`(走不走得到)與 `node scripts/balance.mjs games/<卡帶名>`(怪會不會太強)。
5. 開 `?game=<卡帶名>` 玩。開場畫面如果列出錯誤,照著修就好。`node scripts/smoke.mjs <卡帶名>` 可以不開瀏覽器自動開場走兩步確認沒炸。

完整的欄位說明、對話語法、條件語法在 **`docs/設計手冊.md`**。

## 目錄

```
engine/          遊戲機(改這裡 = 改所有卡帶)
  main.js        把一切接起來:探索、對話、戰鬥、選單、存檔
  schema.js      資料契約驗證(瀏覽器與 CLI 共用,錯誤訊息白話中文)
  map.js         讀 Tiled JSON;dialogue.js 對話;quest.js 任務;battle.js 戰鬥與升等
  inventory.js   背包;save.js 存檔;cond.js 條件;sprites.js 畫圖;ui.js 文字層;input.js 鍵盤與虛擬按鍵
  version.js     版本與更新紀錄(頁尾顯示)
games/demo/      示範卡帶(資料 + maps/ 地圖 + assets/ 圖塊集 PNG 與 CREDITS.txt)
scripts/         validate-game(驗證器)、serve(本機伺服器)、e2e(端對端)、make-demo-maps(示範地圖產生器,Tiled 格式活範例)
                 卡帶工具:balance(戰鬥平衡模擬)、ascii-map(文字地圖 ⇄ Tiled JSON)、reach(可達性)、new-game(開新卡帶)、smoke(任何卡帶的無頭冒煙)
tests/           單元測試(node --test;.out/ 放截圖,不進 git)
docs/            設計手冊(給填卡帶的人)、範例-文字地圖.txt(用鍵盤畫地圖的活範例)
```

## 版本與更新紀錄

頁尾顯示「版本 vN(日期)· 更新紀錄」。改殼層時 `engine/version.js` 的 CHANGELOG 最上面加一筆、`sw.js` 的 CACHE 同號 +1;`tests/version.test.mjs` 會擋不一致。

## 刻意不做(v1)

即時動作戰鬥、商店、裝備欄、多重結局、隊伍、狀態異常、雲端存檔、音樂音效。這些進卡片池,照需求再加進遊戲機。
