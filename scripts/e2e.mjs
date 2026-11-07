#!/usr/bin/env node
// 端對端:真瀏覽器從開場玩到結局(真鍵盤、真點擊、真手機按鍵)。
// 只有「瞬間移動到某一格」用測試掛鉤 __rpg.teleport(省走路時間),其他全部走玩家會走的路。
// 用法:npm run e2e(需要 devDependency playwright;瀏覽器用本機已下載的 chromium)
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'tests', '.out'); mkdirSync(OUT, { recursive: true });
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await startServer(ROOT, 0);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
const page = await ctx.newPage();
const pageErrors = [];
let expect404 = false;   // 「不存在的卡帶」那段本來就會 404,不算錯
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !(expect404 && /404/.test(m.text()))) pageErrors.push(m.text()); });
const S = (fn, arg) => page.evaluate(fn, arg);
const pos = () => S(() => [window.__rpg.pos.map, window.__rpg.pos.x, window.__rpg.pos.y].join(','));
const mode = () => S(() => window.__rpg.mode);
const waitMode = (m, t = 8000) => page.waitForFunction((m) => window.__rpg && window.__rpg.mode === m, m, { timeout: t });
const teleport = (map, x, y, dir) => S(([m, x, y, d]) => window.__rpg.teleport(m, x, y, d), [map, x, y, dir]);
const dlgText = () => page.textContent('#dlg-text').catch(() => '');
const dlgOpen = () => page.locator('#dlg:not(.hidden)').count();
const pressEnter = async () => { await page.keyboard.press('Enter'); await sleep(80); };
const waitDlg = () => page.waitForSelector('#dlg:not(.hidden)', { timeout: 5000 });

// 真鍵盤走一格:按住方向鍵直到座標改變(或進入戰鬥),放開,等走完
async function step(dir) {
  const before = await pos();
  await page.keyboard.down(KEY[dir]);
  const moved = await page.waitForFunction((b) => [window.__rpg.pos.map, window.__rpg.pos.x, window.__rpg.pos.y].join(',') !== b || window.__rpg.mode !== 'explore', before, { timeout: 1500 }).then(() => true).catch(() => false);
  await page.keyboard.up(KEY[dir]);
  await page.waitForFunction(() => !window.__rpg.move, null, { timeout: 2500 }).catch(() => {});
  return moved;
}
// 把對話按到關閉(最多 n 句);遇到選項就停,交給呼叫端點。回傳看過的句子
async function talkThrough(max = 8) {
  const seen = [];
  for (let i = 0; i < max; i++) {
    if (!(await dlgOpen())) break;
    seen.push(await dlgText());
    if (await page.locator('.dlg-choice').count()) break;
    await page.click('#dlg-next');
    await sleep(80);
  }
  return seen;
}
// 打一場到結束:血低喝水、(可選)魔力夠就重擊、不然普攻。回傳結果標題
async function fightOut(useSkill = false) {
  for (let turn = 0; turn < 80; turn++) {
    if (await page.locator('#battle-continue').count()) break;
    const st = await S(() => ({ hp: window.__rpg.hero.hp, maxHp: window.__rpg.hero.maxHp, mp: window.__rpg.hero.mp, heal: window.__rpg.inventory.count('potion') + window.__rpg.inventory.count('hipotion') }));
    if (st.hp < st.maxHp * 0.35 && st.heal) { await page.click('#battle-cmd-item'); await page.locator('.battle-item').first().click(); }
    else if (useSkill && st.mp >= 3) { await page.click('#battle-cmd-skill'); await page.locator('.battle-skill').first().click(); }
    else await page.click('#battle-cmd-attack');
    await sleep(40);
  }
  const title = await page.textContent('.bt-result h2').catch(() => '');
  await page.click('#battle-continue');
  await page.waitForFunction(() => window.__rpg.mode !== 'battle', null, { timeout: 5000 });
  return title;
}

try {
  /* 1 開場 */
  await page.goto(`${srv.url}?game=demo&seed=7&debug=1`);
  await page.waitForSelector('#btn-new', { timeout: 15000 });
  await page.screenshot({ path: resolve(OUT, '1-title.png') });
  check('開場:標題', (await page.textContent('#screen h1')).trim() === '晨光村的勇者');
  check('開場:簡介 + 使用說明', (await page.locator('.howto li').count()) >= 3 && (await page.locator('.intro').count()) === 1);
  check('頁尾:版本 vN(日期)· 更新紀錄', /^版本 v\d+\(\d{4}-\d{2}-\d{2}\)$/.test((await page.textContent('#verText')).trim()) && (await page.locator('#changelog li').count()) >= 1);
  check('還沒存檔就沒有「繼續」', (await page.locator('#btn-continue').count()) === 0);
  await page.click('#btn-new'); await waitMode('explore');
  check('新遊戲從起點開始', (await pos()) === 'village,4,6');

  /* 2 走路、撞 NPC、對話 */
  check('真鍵盤往右走一格', (await step('right')) && (await pos()) === 'village,5,6');
  check('撞到 NPC 不會走進去', !(await step('right')) && (await pos()) === 'village,5,6');
  await page.screenshot({ path: resolve(OUT, '2-explore.png') });
  await pressEnter(); await waitDlg();
  check('面對村長按 Enter 開對話', /你來得正好/.test(await dlgText()));
  await pressEnter(); await sleep(80);
  check('第二句出現兩個選項', (await page.locator('.dlg-choice').count()) === 2);
  await page.locator('.dlg-choice').first().click(); await sleep(80);
  const after = await talkThrough();
  await waitMode('explore');
  check('選「交給我吧」接到任務', (await S(() => window.__rpg.questLog.rawState('q_slime'))) === 'active' && after.some((t) => /太好了/.test(t)));

  /* 3 選單 */
  await page.keyboard.press('Escape'); await waitMode('menu');
  await page.click('#menu-tab-quests');
  const qtext = await page.textContent('.panel-body');
  check('選單任務頁看得到任務與進度 0/3', /清除綠團子/.test(qtext) && /綠團子 0\/3/.test(qtext));
  await page.click('#menu-tab-items');
  check('選單道具頁有藥水可用', (await page.locator('.items .use').count()) >= 1);
  await page.click('#menu-close'); await waitMode('explore');

  /* 4 深草叢遇敵、打到 3 隻綠團子 */
  await teleport('village', 16, 9, 'right');   // y=9 這一排 x=16..21 沒有樹,可以來回走
  let battles = 0, steps = 0, dir = 'right', shot = false;
  while ((await S(() => window.__rpg.kills.blob || 0)) < 3 && steps < 250) {
    if ((await mode()) === 'battle') {
      battles++;
      if (!shot) { await page.screenshot({ path: resolve(OUT, '3-battle.png') }); shot = true; }
      const t = await fightOut();
      if (!/勝利/.test(t)) console.log(`   (第 ${battles} 場:${t})`);
      continue;
    }
    const p = await S(() => ({ map: window.__rpg.pos.map, x: window.__rpg.pos.x, y: window.__rpg.pos.y }));
    if (p.map !== 'village' || p.y !== 9) { await teleport('village', 16, 9, 'right'); continue; }
    if (p.x >= 21) dir = 'left'; if (p.x <= 16) dir = 'right';
    await step(dir); steps++;
  }
  check(`深草叢遇敵並打倒 3 隻綠團子(${battles} 場、${steps} 步)`, (await S(() => window.__rpg.kills.blob)) >= 3);
  check('打怪有經驗值或已升級', await S(() => window.__rpg.hero.xp > 0 || window.__rpg.hero.level > 1));
  const gold0 = await S(() => window.__rpg.inventory.gold);

  /* 5 回報 */
  await teleport('village', 5, 6, 'right'); await pressEnter(); await waitDlg();
  check('回報:村長說做到了', /你真的做到了/.test(await dlgText()));
  await talkThrough(); await waitMode('explore');
  check('任務完成、金幣 +30', (await S(() => window.__rpg.questLog.rawState('q_slime'))) === 'done' && (await S(() => window.__rpg.inventory.gold)) === gold0 + 30);

  /* 6 存檔 → 重新整理 → 繼續 */
  await page.keyboard.press('Escape'); await waitMode('menu'); await page.click('#menu-tab-system'); await page.click('#btn-save'); await sleep(120);
  check('存檔有提示', /已存檔/.test(await page.textContent('#toast')));
  await page.reload(); await page.waitForSelector('#btn-continue', { timeout: 15000 });
  check('重新整理後有「繼續冒險」', true);
  await page.click('#btn-continue'); await waitMode('explore');
  check('讀檔還原任務與位置', (await S(() => window.__rpg.questLog.rawState('q_slime'))) === 'done' && (await pos()) === 'village,5,6');

  /* 7 採藥 */
  await teleport('village', 12, 5, 'up'); await pressEnter(); await page.waitForSelector('.dlg-choice', { timeout: 5000 });
  check('艾拉請求採藥(條件分支:綠團子任務完成後才問)', /能幫我採/.test(await dlgText()));
  await page.locator('.dlg-choice').first().click(); await talkThrough(); await waitMode('explore');
  const herbs0 = await S(() => window.__rpg.inventory.count('herb'));
  for (const [x, y] of [[18, 11], [21, 6]]) { await teleport('village', x, y, 'down'); await step('down'); if ((await mode()) === 'battle') await fightOut(); }
  check('走到藥草上自動撿起', (await S(() => window.__rpg.inventory.count('herb'))) >= herbs0 + 2);
  check('撿過的藥草不再出現', await S(() => window.__rpg.map.objects.filter((o) => o.type === 'item').every((o) => !window.__rpg.visible(o))));
  await teleport('village', 12, 5, 'up'); await pressEnter(); await waitDlg(); await talkThrough(); await waitMode('explore');
  check('採藥任務完成、拿到高級藥水', (await S(() => window.__rpg.questLog.rawState('q_herb'))) === 'done' && (await S(() => window.__rpg.inventory.count('hipotion'))) >= 2);

  /* 8 頭目 */
  await teleport('village', 5, 6, 'right'); await pressEnter(); await waitDlg();
  const bossAsk = await talkThrough();   // 第一句講來由、第二句才有選項
  check('村長派洞窟任務', bossAsk.some((t) => /洞窟/.test(t)) && (await page.locator('.dlg-choice').count()) === 2);
  await page.locator('.dlg-choice').first().click(); await talkThrough(); await waitMode('explore');
  check('洞窟任務進行中', (await S(() => window.__rpg.questLog.rawState('q_boss'))) === 'active');
  await teleport('village', 20, 4, 'up'); await pressEnter(); await waitDlg();
  check('守衛放行(條件對話)', /請進/.test(await dlgText()));
  await talkThrough(); await waitMode('explore');
  await teleport('village', 21, 3, 'up'); await step('up');
  check('走進洞口傳送到洞窟', (await pos()) === 'cave,2,9');
  await S(() => { window.__rpg.debug.setLevel(7); window.__rpg.hero.hp = window.__rpg.hero.maxHp; window.__rpg.hero.mp = window.__rpg.hero.maxMp; });
  await teleport('cave', 12, 4, 'up'); await pressEnter(); await waitDlg();
  check('巨蛛開場白', /誰敢闖進/.test(await dlgText()));
  await page.click('#dlg-next'); await waitMode('battle');
  await page.click('#battle-cmd-run'); await sleep(80);
  check('頭目戰逃不掉', (await mode()) === 'battle' && /逃不掉/.test(await page.textContent('#battle-log')));
  await page.screenshot({ path: resolve(OUT, '4-boss.png') });
  const bossResult = await fightOut(true);
  check('打倒巨蛛', /勝利/.test(bossResult), bossResult);
  await waitDlg(); const tail = await talkThrough(); await waitMode('explore');
  check('打贏後對話接著講、旗標設了、巨蛛消失', tail.some((s) => /倒下了/.test(s)) && (await S(() => window.__rpg.flags.boss_down === true && window.__rpg.map.objects.filter((o) => o.type === 'npc').every((o) => !window.__rpg.visible(o)))));

  /* 9 回村 → 結局 */
  await teleport('cave', 2, 8, 'down'); await step('down');
  check('洞窟出口回到村子', (await pos()) === 'village,21,3');
  await teleport('village', 5, 6, 'right'); await pressEnter(); await waitDlg(); await talkThrough();
  await page.waitForSelector('#btn-ending-title', { timeout: 8000 });
  check('結局畫面', /晨光村恢復了平靜/.test(await page.textContent('#screen h1')));
  await page.screenshot({ path: resolve(OUT, '5-ending.png') });
  await page.click('#btn-ending-title'); await page.waitForSelector('#btn-new');

  /* 10 壞卡帶 */
  expect404 = true;
  await page.goto(`${srv.url}?game=nope`); await page.waitForSelector('#err-list', { timeout: 10000 });
  check('不存在的卡帶顯示白話錯誤', /讀不到/.test(await page.textContent('#err-list')));
  expect404 = false;

  /* 11 手機虛擬按鍵(真的 pointer 事件)*/
  const mp = await ctx.newPage();
  mp.on('dialog', (d) => d.accept());   // 已有存檔時「開始新遊戲」會跳確認框
  mp.on('pageerror', (e) => pageErrors.push('mobile: ' + e.message));
  await mp.goto(`${srv.url}?game=demo&pad=1`); await mp.waitForSelector('#btn-new'); await mp.click('#btn-new');
  await mp.waitForFunction(() => window.__rpg && window.__rpg.mode === 'explore');
  const b = await mp.locator('[data-dir="right"]').boundingBox();
  await mp.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await mp.mouse.down();
  await mp.waitForFunction(() => window.__rpg.pos.x !== 4, null, { timeout: 3000 }).catch(() => {});
  await mp.mouse.up(); await mp.waitForFunction(() => !window.__rpg.move, null, { timeout: 2500 }).catch(() => {});
  check('手機虛擬方向鍵按住能走', (await mp.evaluate(() => window.__rpg.pos.x)) === 5);
  const lb = await mp.locator('[data-dir="left"]').boundingBox();
  await mp.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);   // 點一下(比一幀還快)
  await mp.waitForFunction(() => window.__rpg.pos.x === 4 && !window.__rpg.move, null, { timeout: 3000 }).catch(() => {});
  check('手機虛擬方向鍵點一下也走一格', (await mp.evaluate(() => window.__rpg.pos.x)) === 4);
  await mp.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await mp.waitForFunction(() => window.__rpg.pos.x === 5 && !window.__rpg.move, null, { timeout: 3000 }).catch(() => {});
  const ab = await mp.locator('[data-btn="confirm"]').boundingBox();
  await mp.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await mp.waitForSelector('#dlg:not(.hidden)', { timeout: 3000 }).catch(() => {});
  check('手機 A 鈕能開對話', (await mp.locator('#dlg:not(.hidden)').count()) === 1);
  await mp.screenshot({ path: resolve(OUT, '6-mobile.png') });
} catch (e) {
  check('劇本跑到底', false, e.message.split('\n')[0]);
  await page.screenshot({ path: resolve(OUT, 'fail.png') }).catch(() => {});
}
check('整段沒有頁面錯誤', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close(); await srv.close();
console.log(`\n${fail ? '❌' : '✅'} e2e:${pass} 過 / ${fail} 失敗(截圖在 tests/.out/)`);
process.exitCode = fail ? 1 : 0;
