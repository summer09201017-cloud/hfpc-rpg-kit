import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo, fakeCtx } from './helpers.mjs';
import { QuestLog } from '../engine/quest.js';

const demo = loadDemo();
const names = { enemies: { blob: '綠團子' }, items: { herb: '藥草' } };

test('擊殺型:接任務前打的不算;達標變 ready;完成發獎勵、狀態變 done', () => {
  const c = fakeCtx(demo);
  c.kills.blob = 5;                          // 接任務前就殺過 5 隻
  assert.equal(c.questLog.stateOf('q_slime', c), 'inactive');
  assert.ok(c.questLog.start('q_slime', c));
  assert.equal(c.questLog.stateOf('q_slime', c), 'active');
  assert.deepEqual(c.questLog.progress('q_slime', c), { cur: 0, need: 3 });
  c.kills.blob = 7;
  assert.equal(c.questLog.progressText('q_slime', c, names), '綠團子 2/3');
  assert.equal(c.questLog.complete('q_slime', c), null, '沒達標不能完成');
  c.kills.blob = 8;
  assert.equal(c.questLog.stateOf('q_slime', c), 'ready');
  const gold0 = c.inventory.gold;
  const r = c.questLog.complete('q_slime', c);
  assert.deepEqual(r, { xp: 15, gold: 30, items: { potion: 1 } });
  assert.equal(c.inventory.gold, gold0 + 30);
  assert.equal(c.inventory.count('potion'), 3);
  assert.equal(c.questLog.stateOf('q_slime', c), 'done');
  assert.equal(c.questLog.start('q_slime', c), false, '完成的任務不能再接');
});

test('收集型:背包夠了才 ready,完成時交出去', () => {
  const c = fakeCtx(demo);
  c.questLog.start('q_herb', c);
  c.inventory.add('herb', 1);
  assert.equal(c.questLog.stateOf('q_herb', c), 'active');
  c.inventory.add('herb', 2);
  assert.equal(c.questLog.progressText('q_herb', c, names), '藥草 2/2');
  const r = c.questLog.complete('q_herb', c);
  assert.equal(r.items.hipotion, 2);
  assert.equal(c.inventory.count('herb'), 1, '交出 2 株,多的留著');
});

test('旗標型任務 + 存檔還原', () => {
  const c = fakeCtx(demo);
  c.questLog.defs.q_flag = { title: 't', desc: 'd', objective: { type: 'flag', flag: 'met' } };
  c.questLog.start('q_flag', c);
  assert.equal(c.questLog.progressText('q_flag', c, names), '進行中');
  c.flags.met = true;
  assert.equal(c.questLog.stateOf('q_flag', c), 'ready');
  c.kills.blob = 2; c.questLog.start('q_slime', c); c.kills.blob = 3;
  const saved = JSON.parse(JSON.stringify(c.questLog.toJSON()));
  const back = new QuestLog(demo.quests, saved);
  assert.equal(back.stateOf('q_slime', c), 'active');
  assert.deepEqual(back.progress('q_slime', c), { cur: 1, need: 3 }, '基準值要跟著存檔走');
});
