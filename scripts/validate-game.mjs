#!/usr/bin/env node
// 驗證一張卡帶:node scripts/validate-game.mjs games/demo
// 有錯 exit 1(部署閘門可以直接用),錯誤訊息跟瀏覽器開場畫面上的一模一樣。
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadGameDir } from './lib/load-fs.mjs';
import { validateGame } from '../engine/schema.js';

const arg = process.argv[2];
if (!arg) { console.error('用法:node scripts/validate-game.mjs games/<卡帶名>'); process.exit(2); }
const dir = resolve(arg);
if (!existsSync(dir)) { console.error(`找不到資料夾 ${dir}`); process.exit(2); }
const data = loadGameDir(dir);
const v = data.loadErrors.length ? { errors: data.loadErrors, warnings: [] } : validateGame(data);
console.log(`🎮 卡帶:${arg}${data.game && data.game.title ? `《${data.game.title}》` : ''}`);
if (v.errors.length) {
  console.log(`❌ ${v.errors.length} 個錯誤(修好才能玩):`);
  v.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
} else {
  console.log(`✅ 沒有錯誤(${Object.keys(v.maps || {}).length} 張地圖、${Object.keys(data.quests || {}).length} 個任務、${Object.keys(data.enemies || {}).length} 種怪物、${Object.keys(data.items || {}).length} 種道具)`);
}
if (v.warnings.length) {
  console.log(`⚠ ${v.warnings.length} 個提醒(不擋):`);
  v.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
}
process.exitCode = v.errors.length ? 1 : 0;
