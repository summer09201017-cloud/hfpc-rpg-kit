#!/usr/bin/env node
// 開一張新卡帶:把 games/demo 整個複製成 games/<卡帶名>,改好 id 與標題,印出下一步。
// 用法:node scripts/new-game.mjs <卡帶名> [--title "標題"]
//   卡帶名只能用英數、底線、連字號(它會變成網址 ?game=<卡帶名> 與存檔的名字);已經存在就拒絕。
// createGame() 匯出給測試用。
import { resolve, join, dirname } from 'node:path';
import { existsSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 回 { dir, id, title };有問題就 throw Error(白話訊息)
export function createGame(name, { title, gamesDir = join(ROOT, 'games'), from = 'demo' } = {}) {
  if (!name || !/^[\w-]+$/.test(name)) throw new Error(`卡帶名「${name || ''}」只能用英文字母、數字、底線、連字號(例如 my-game、castle_2)`);
  const src = join(gamesDir, from), dir = join(gamesDir, name);
  if (!existsSync(join(src, 'game.json'))) throw new Error(`找不到範本卡帶 ${src}(要從 games/${from} 複製)`);
  if (existsSync(dir)) throw new Error(`games/${name} 已經存在了,換一個名字,或先把舊的刪掉`);
  cpSync(src, dir, { recursive: true });
  const gameFile = join(dir, 'game.json');
  const game = JSON.parse(readFileSync(gameFile, 'utf8'));
  game.id = name;
  game.title = title && title.trim() ? title.trim() : `${name}(改我)`;
  game.subtitle = '(改我)';
  writeFileSync(gameFile, JSON.stringify(game, null, 2) + '\n');
  return { dir, id: name, title: game.title };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let title = null; const rest = [];
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--title') title = argv[++i]; else if (argv[i].startsWith('--title=')) title = argv[i].slice(8); else rest.push(argv[i]); }
  const name = rest[0];
  if (!name) { console.error('用法:node scripts/new-game.mjs <卡帶名> [--title "標題"]\n  卡帶名只能用英數、底線、連字號,例如 node scripts/new-game.mjs my-game --title "我的冒險"'); process.exit(2); }
  try {
    const r = createGame(name, { title });
    console.log(`✔ 已建立 games/${r.id}《${r.title}》(從示範卡帶複製來的,每個檔都可以改)`);
    console.log('下一步:');
    console.log(`  1. 打開 games/${r.id}/game.json 改標題、簡介、主角數值`);
    console.log(`  2. 改劇情與地圖:dialogues.json、quests.json、enemies.json、maps/*.json(用 Tiled,或用文字畫:node scripts/ascii-map.mjs 地圖.txt -o games/${r.id}/maps/village.json)`);
    console.log(`  3. 檢查有沒有填錯:node scripts/validate-game.mjs games/${r.id}`);
    console.log(`  4. 試玩:npm run serve 然後開 http://127.0.0.1:8080/?game=${r.id}`);
    console.log('  5. 看難度與走不走得到:node scripts/balance.mjs games/' + r.id + '、node scripts/reach.mjs games/' + r.id);
    console.log('  欄位說明都在 docs/設計手冊.md');
  } catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }
}
