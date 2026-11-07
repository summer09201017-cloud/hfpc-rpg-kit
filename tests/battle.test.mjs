import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo, fakeCtx } from './helpers.mjs';
import { makeRng } from '../engine/rng.js';
import { Battle, xpToNext, gainXp, damage, makeHero, heroFromSave } from '../engine/battle.js';

const demo = loadDemo();
const mk = (ids, seed = 1, over = {}) => {
  const c = fakeCtx(demo, over);
  const b = new Battle({ hero: c.hero, enemyIds: ids, enemyDefs: demo.enemies, itemDefs: demo.items, inventory: c.inventory, rng: makeRng(seed), fixed: over.fixed });
  return { ...c, b };
};

test('升級門檻:base × 等級^1.5', () => {
  assert.equal(xpToNext(1, 10), 10); assert.equal(xpToNext(2, 10), 28); assert.equal(xpToNext(3, 10), 52); assert.equal(xpToNext(4, 10), 80);
});

test('加經驗會升級、數值照 growth 長、補回加的體力;到上限後不再升', () => {
  const h = makeHero(demo.game.hero); h.hp = 10;
  const ups = gainXp(h, 10, demo.game.levels);
  assert.equal(ups.length, 1); assert.equal(h.level, 2); assert.equal(h.maxHp, 36); assert.equal(h.hp, 16); assert.equal(h.atk, 9); assert.equal(h.xp, 0);
  gainXp(h, 28 + 52 + 5, demo.game.levels);
  assert.equal(h.level, 4); assert.equal(h.xp, 5);
  gainXp(h, 1e9, { ...demo.game.levels, max: 6 });
  assert.equal(h.level, 6); assert.equal(h.xp, 0);
});

test('傷害公式:永遠 ≥1、在 0.85~1.15(會心 ×1.5)範圍內', () => {
  const rng = makeRng(42);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 2000; i++) { const { dmg } = damage(rng, 7, 1, 1); min = Math.min(min, dmg); max = Math.max(max, dmg); }
  assert.ok(min >= Math.floor(6.5 * 0.85) && min >= 1, `min ${min}`);
  assert.ok(max <= Math.ceil(6.5 * 1.15 * 1.5), `max ${max}`);
  assert.equal(damage(rng, 1, 100, 1).dmg, 1, '防禦再高也至少 1 點');
});

test('打一隻綠團子:攻擊到贏,結算經驗金幣擊殺數;同種子兩次結果逐字相同', () => {
  const run = () => { const { b } = mk(['blob'], 7); let n = 0; while (b.phase === 'player' && n++ < 20) b.act({ type: 'attack', target: 0 }); return b; };
  const b1 = run(), b2 = run();
  assert.equal(b1.phase, 'won');
  assert.deepEqual(b1.log, b2.log);
  assert.ok(b1.log.some((l) => /綠團子 倒下了/.test(l)));
  const r = b1.rewards();
  assert.deepEqual({ xp: r.xp, gold: r.gold, kills: r.kills }, { xp: 7, gold: 4, kills: { blob: 1 } });
});

test('兩隻同種怪會標 A / B;打死 A 之後攻擊目標自動改成活的那隻', () => {
  const { b } = mk(['blob', 'blob'], 3);
  assert.deepEqual(b.enemies.map((e) => e.label), ['綠團子 A', '綠團子 B']);
  b.enemies[0].hp = 1;
  const evs = b.act({ type: 'attack', target: 0 });
  assert.ok(evs.some((e) => e.t === 'down' && e.target === 0));
  const evs2 = b.act({ type: 'attack', target: 0 });
  assert.ok(evs2.some((e) => e.t === 'hit' && e.who === 'hero' && e.target === 1), '目標應改成 B');
});

test('技能:魔力不夠不算一回合;夠的話扣魔力、傷害倍率生效', () => {
  const { b, hero } = mk(['spider'], 5);
  hero.mp = 2;
  const evs = b.act({ type: 'skill', id: 'smash', target: 0 });
  assert.ok(evs.some((e) => e.t === 'fail') && !evs.some((e) => e.t === 'hit'), '魔力不夠:要回 fail 事件、不能有任何 hit');
  assert.equal(hero.hp, hero.maxHp, '失敗不該被怪打');
  assert.equal(hero.mp, 2, '失敗不扣魔力');
  hero.mp = 8;
  const hp0 = b.enemies[0].hp;
  b.act({ type: 'skill', id: 'smash', target: 0 });
  assert.equal(hero.mp, 5);
  assert.ok(hp0 - b.enemies[0].hp >= Math.floor((7 * 1.8 - 2.5) * 0.85), '重擊傷害太低');
});

test('道具:戰鬥中喝藥水回血並消耗;滿血時不消耗也不算回合', () => {
  const { b, hero, inventory } = mk(['blob'], 9);
  const evs0 = b.act({ type: 'item', id: 'potion' });
  assert.ok(evs0.some((e) => e.t === 'fail'));
  assert.equal(inventory.count('potion'), 2);
  hero.hp = 5;
  b.act({ type: 'item', id: 'potion' });
  assert.equal(inventory.count('potion'), 1);
  assert.ok(hero.hp > 5 && hero.hp <= 25, `hp ${hero.hp}(喝 20 之後再被打一下)`);
});

test('逃跑:頭目戰逃不掉;普通戰鬥有機率成功', () => {
  const { b } = mk(['spider'], 1, { fixed: true });
  const evs = b.act({ type: 'run' });
  assert.ok(evs.some((e) => e.t === 'fail') && !evs.some((e) => e.t === 'fled' || e.t === 'hit'), '頭目戰逃跑:回 fail、不會 fled、也不被打');
  assert.equal(b.phase, 'player');
  let fled = 0;
  for (let s = 1; s <= 30; s++) { const { b: b2 } = mk(['blob'], s); for (let i = 0; i < 5 && b2.phase === 'player'; i++) b2.act({ type: 'run' }); if (b2.phase === 'fled') fled++; }
  assert.ok(fled > 10, `30 場只逃掉 ${fled} 場`);
});

test('被打到 0 就輸', () => {
  const { b, hero } = mk(['spider'], 2);
  hero.hp = 1; hero.def = 0;
  b.act({ type: 'attack', target: 0 });
  assert.equal(b.phase, 'lost');
  assert.ok(b.log.some((l) => /倒下了……/.test(l)));
});

test('存檔讀回來的主角:數值沿用、技能從卡帶拿、體力夾在範圍內', () => {
  const h = heroFromSave({ name: '小明', level: 3, hp: 999, maxHp: 42, mp: -5, maxMp: 12, atk: 11, def: 5, spd: 7, xp: 3 }, demo.game.hero);
  assert.equal(h.name, '小明'); assert.equal(h.hp, 42); assert.equal(h.mp, 0); assert.equal(h.skills[0].id, 'smash'); assert.equal(h.level, 3);
});
