import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo, fakeCtx } from './helpers.mjs';
import { DialogueRunner } from '../engine/dialogue.js';

const demo = loadDemo();

// 假的畫面:say() 照 script 回答(選項索引或 null),並把看到的字記下來
function makeRunner(c, answers = [], battleResult = 'won') {
  const seen = [], calls = { quests: [], gives: [], battles: [], ending: 0, hidden: 0, flags: [] };
  const hooks = {
    ctx: () => c,
    say: async ({ speaker, text, choices }) => { seen.push({ speaker, text, choices }); return choices ? (answers.shift() ?? 0) : null; },
    hide: () => { calls.hidden++; },
    battle: async (id) => { calls.battles.push(id); return battleResult; },
    onSet: (f) => { c.flags[f] = true; calls.flags.push(f); },
    onQuest: (id, action) => { calls.quests.push(`${id}:${action}`); if (action === 'start') c.questLog.start(id, c); else c.questLog.complete(id, c); },
    onGive: (it, q) => { c.inventory.add(it, q); calls.gives.push(`${it}×${q}`); },
    onGold: (n) => { c.inventory.gold += n; },
    heal: () => { c.hero.hp = c.hero.maxHp; },
    ending: () => { calls.ending++; },
    progressText: (q) => c.questLog.progressText(q, c, { enemies: { blob: '綠團子' }, items: { herb: '藥草' } }),
  };
  return { runner: new DialogueRunner(demo.dialogues, hooks), seen, calls };
}

test('村長第一次對話:選「交給我吧」就接到任務;再談一次走 active 分支並代入進度', async () => {
  const c = fakeCtx(demo);
  const { runner, seen, calls } = makeRunner(c, [0]);
  await runner.start('elder');
  assert.ok(seen[0].text.startsWith('勇者,你來得正好'), '{hero} 要代成主角名');
  assert.deepEqual(seen[1].choices, ['交給我吧!', '我再想想']);
  assert.deepEqual(calls.quests, ['q_slime:start']);
  assert.equal(c.questLog.stateOf('q_slime', c), 'active');
  assert.equal(runner.active, false); assert.equal(calls.hidden, 1, '結束要收對話框');

  c.kills.blob = 2;
  const r2 = makeRunner(c);
  await r2.runner.start('elder');
  assert.equal(r2.seen.length, 1);
  assert.match(r2.seen[0].text, /綠團子 2\/3/);
});

test('選「我再想想」不接任務;達標後回報 ⇒ 完成、拿獎勵、接著講下一句', async () => {
  const c = fakeCtx(demo);
  const r1 = makeRunner(c, [1]);
  await r1.runner.start('elder');
  assert.deepEqual(r1.calls.quests, []);
  c.questLog.start('q_slime', c); c.kills.blob = 3;
  const gold0 = c.inventory.gold;
  const r2 = makeRunner(c);
  await r2.runner.start('elder');
  assert.deepEqual(r2.calls.quests, ['q_slime:complete']);
  assert.equal(c.inventory.gold, gold0 + 30);
  assert.equal(r2.seen.length, 2, '完成後還有一句提示艾拉');
});

test('鐵匠送藥水只送一次(旗標)', async () => {
  const c = fakeCtx(demo);
  await makeRunner(c).runner.start('smith');
  await makeRunner(c).runner.start('smith');
  assert.equal(c.inventory.count('potion'), 3);
  assert.deepEqual(c.flags, { smith_gift: true });
});

test('頭目對話:打贏才設旗標、講結尾;打輸就結束對話', async () => {
  const c = fakeCtx(demo);
  const win = makeRunner(c, [], 'won');
  await win.runner.start('boss');
  assert.deepEqual(win.calls.battles, ['boss_spider']);
  assert.equal(c.flags.boss_down, true);
  assert.equal(win.seen.length, 2);

  const c2 = fakeCtx(demo);
  const lose = makeRunner(c2, [], 'lost');
  await lose.runner.start('boss');
  assert.equal(c2.flags.boss_down, undefined);
  assert.equal(lose.seen.length, 1);
});

test('結局節點會呼叫 ending 並停止', async () => {
  const c = fakeCtx(demo);
  c.questLog.start('q_boss', c); c.kills.spider = 1;
  const r = makeRunner(c);
  await r.runner.start('elder');
  assert.deepEqual(r.calls.quests, ['q_boss:complete']);
  assert.equal(r.calls.ending, 1);
});

test('對話互相跳來跳去有保險絲,不會卡死', async () => {
  const c = fakeCtx(demo);
  const r = makeRunner(c);
  r.runner.defs = { a: [{ if: '!flag:never', then: 'b' }], b: [{ if: '!flag:never', then: 'a' }] };
  await r.runner.start('a');
  assert.equal(r.runner.active, false);
});
