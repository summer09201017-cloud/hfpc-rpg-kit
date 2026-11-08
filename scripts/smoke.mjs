#!/usr/bin/env node
// 任何卡帶的無頭冒煙測試(不靠劇情座標,所以兒子的第二張卡帶也能用):
//   開場畫面出得來 → 按「開始新遊戲」→ 真鍵盤往右、往左各走一步 → Esc 開選單再關 → 全程沒有頁面錯誤 → 截圖
// 用法:node scripts/smoke.mjs <卡帶名> [--url https://…]   不帶 --url 就用本機伺服器(scripts/serve.mjs)開 repo
// 卡帶開場列出錯誤清單就原樣印出來並退出 1。截圖在 tests/.out/smoke-<卡帶名>.png。需要 devDependency playwright。
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
let url = null; const rest = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--url') url = argv[++i]; else if (argv[i].startsWith('--url=')) url = argv[i].slice(6); else rest.push(argv[i]); }
const id = rest[0];
if (!id || !/^[\w-]+$/.test(id)) { console.error('用法:node scripts/smoke.mjs <卡帶名> [--url https://…]'); process.exit(2); }
if (!url && !existsSync(resolve(ROOT, 'games', id, 'game.json'))) { console.error(`找不到 games/${id}/game.json(本機沒有這張卡帶;要打線上請加 --url)`); process.exit(2); }

const OUT = resolve(ROOT, 'tests', '.out'); mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = url ? null : await startServer(ROOT, 0);
const base = url ? url.replace(/[?#].*$/, '').replace(/\/?$/, '/') : srv.url;
const target = `${base}?game=${id}&seed=1`;
console.log(`🔥 冒煙:${target}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
const S = (fn, arg) => page.evaluate(fn, arg);
const pos = () => S(() => window.__rpg && window.__rpg.pos ? [window.__rpg.pos.map, window.__rpg.pos.x, window.__rpg.pos.y].join(',') : '');
const waitMode = (m, t = 10000) => page.waitForFunction((m) => window.__rpg && window.__rpg.mode === m, m, { timeout: t });
async function step(key) {
  const before = await pos();
  await page.keyboard.down(key);
  const moved = await page.waitForFunction((b) => [window.__rpg.pos.map, window.__rpg.pos.x, window.__rpg.pos.y].join(',') !== b || window.__rpg.mode !== 'explore', before, { timeout: 1500 }).then(() => true).catch(() => false);
  await page.keyboard.up(key);
  await page.waitForFunction(() => !window.__rpg.move, null, { timeout: 2500 }).catch(() => {});
  return moved;
}

try {
  const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  check('網頁打得開(HTTP 200)', !!resp && resp.ok(), resp ? `HTTP ${resp.status()}` : '沒有回應');
  await page.waitForSelector('#btn-new, #err-list', { timeout: 20000 });
  if (await page.locator('#err-list').count()) {
    const items = await page.locator('#err-list li').allTextContents();
    check('卡帶資料沒有錯誤', false, `${items.length} 個錯誤`);
    items.forEach((t, i) => console.log(`   ${i + 1}. ${t}`));
    await page.screenshot({ path: resolve(OUT, `smoke-${id}.png`) });
    throw new Error('卡帶資料有錯,開場畫面列出來了;修好再跑一次');
  }
  const title = ((await page.textContent('#screen h1').catch(() => '')) || '').trim();
  check('開場畫面有標題與「開始新遊戲」', !!title && (await page.locator('#btn-new').count()) === 1, title);
  await page.click('#btn-new');
  await waitMode('explore');
  const p0 = await pos();
  check('按「開始新遊戲」後進入探索畫面', p0 !== '', `起點 ${p0}`);
  const r = await step('ArrowRight');
  const l = await step('ArrowLeft');
  const mode1 = await S(() => window.__rpg.mode);
  check('真鍵盤往右、往左各按一下,遊戲還在探索(或遇敵)畫面', ['explore', 'battle', 'dialogue'].includes(mode1), `右${r ? '走了' : '沒動'}、左${l ? '走了' : '沒動'}、現在是 ${mode1}${r || l ? '' : '(起點左右都被擋住?)'}`);
  if (mode1 !== 'explore') console.log('   (第一步就遇敵或進對話,跳過選單測試)');
  else {
    await page.keyboard.press('Escape');
    const opened = await waitMode('menu', 5000).then(() => true).catch(() => false);
    check('Esc 開得了選單', opened);
    await page.keyboard.press('Escape');
    const closed = await waitMode('explore', 5000).then(() => true).catch(() => false);
    check('再按 Esc 關得掉選單、回到探索', closed);
  }
  await sleep(200);
  await page.screenshot({ path: resolve(OUT, `smoke-${id}.png`) });
  console.log(`   截圖:tests/.out/smoke-${id}.png`);
} catch (e) {
  check('流程跑到底', false, e.message.split('\n')[0]);
  await page.screenshot({ path: resolve(OUT, `smoke-${id}-fail.png`) }).catch(() => {});
}
check('全程沒有頁面錯誤(pageerror / console error)', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (srv) await srv.close();
console.log(`\n${fail ? '❌' : '✅'} 冒煙 ${id}:${pass} 過 / ${fail} 失敗`);
process.exitCode = fail ? 1 : 0;
