import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo, fakeCtx } from './helpers.mjs';
import { parseCond, condError, evalCond } from '../engine/cond.js';

const demo = loadDemo();

test('條件字串解析', () => {
  assert.deepEqual(parseCond('flag:x'), { flag: 'x', not: false });
  assert.deepEqual(parseCond('!flag:x'), { flag: 'x', not: true });
  assert.deepEqual(parseCond('quest:q_slime=active,done'), { quest: 'q_slime', state: 'active,done' });
  assert.deepEqual(parseCond('item:herb>=2'), { item: 'herb', qty: 2 });
  assert.deepEqual(parseCond('item:herb'), { item: 'herb', qty: 1 });
  assert.deepEqual(parseCond('level>=5'), { level: 5 });
  assert.equal(parseCond('quest:q=whatever ').invalid, undefined);
  assert.ok(parseCond('gold>=5').invalid);
  assert.deepEqual(parseCond({ flag: 'y' }), { flag: 'y' });
});

test('驗證器用的錯誤訊息', () => {
  const refs = { quests: demo.quests, items: demo.items };
  assert.equal(condError('flag:x', refs), null);
  assert.match(condError('quest:nope=done', refs), /任務 nope 不在/);
  assert.match(condError('quest:q_slime=finished', refs), /任務狀態「finished」不存在/);
  assert.match(condError('item:gem', refs), /道具 gem 不在/);
  assert.match(condError('lvl>3', refs), /看不懂/);
});

test('條件求值', () => {
  const c = fakeCtx(demo);
  assert.equal(evalCond(c, 'flag:x'), false);
  assert.equal(evalCond(c, '!flag:x'), true);
  c.flags.x = true;
  assert.equal(evalCond(c, 'flag:x'), true);
  assert.equal(evalCond(c, 'quest:q_slime=inactive'), true);
  c.questLog.start('q_slime', c);
  assert.equal(evalCond(c, 'quest:q_slime=active,done'), true);
  c.kills.blob = 3;
  assert.equal(evalCond(c, 'quest:q_slime=ready'), true);
  assert.equal(evalCond(c, 'quest:q_slime=active'), true, 'ready 也算 active(進行中);要分辨就先檢查 ready');
  assert.equal(evalCond(c, 'quest:q_slime=done'), false);
  assert.equal(evalCond(c, 'item:potion>=2'), true);
  assert.equal(evalCond(c, 'item:potion>=3'), false);
  assert.equal(evalCond(c, 'level>=1'), true);
  assert.equal(evalCond(c, 'garbage'), false);
});
