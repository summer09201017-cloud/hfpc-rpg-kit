// 戰鬥平衡模擬(scripts/balance.mjs):結果可重現、方向對、結構齊
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo } from './helpers.mjs';
import { simulate, parseLevels, heroAtLevel, formatReport } from '../scripts/balance.mjs';

const demo = loadDemo();
const run = (over = {}) => simulate(demo, { n: 30, levels: '1-7', seed: 3, ...over });

test('同一個種子跑兩次,結果逐字相同', () => {
  assert.deepEqual(JSON.stringify(run()), JSON.stringify(run()));
  assert.notEqual(JSON.stringify(run()), JSON.stringify(run({ seed: 4 })), '換種子應該有差');
});

test('回傳結構:encounters / levels / 每組 byLevel / 建議等級 / 練功場數', () => {
  const r = run();
  assert.deepEqual(r.levels, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(r.n, 30);
  assert.deepEqual(Object.keys(r.encounters).sort(), ['boss_spider', 'cave', 'field']);
  const f = r.encounters.field;
  assert.equal(f.kind, 'groups'); assert.equal(f.groups.length, 3);
  assert.deepEqual(f.groups.map((g) => g.label), ['綠團子', '綠團子×2', '野狼']);
  for (const g of f.groups) for (const lv of r.levels) {
    const c = g.byLevel[lv];
    for (const k of ['winRate', 'avgRounds', 'avgHpLeft', 'avgXp']) assert.ok(typeof c[k] === 'number' && c[k] >= 0, `${g.label} Lv${lv} 的 ${k}`);
    assert.ok(c.winRate <= 1 && c.avgHpLeft <= 1);
  }
  assert.ok('suggestLevel' in f && 'grind' in f);
  const b = r.encounters.boss_spider;
  assert.equal(b.kind, 'fixed'); assert.equal(b.groups[0].label, '洞窟巨蛛'); assert.equal(b.groups[0].weight, null); assert.equal(b.groups[0].need, 0.75);
  assert.ok(Number.isInteger(b.suggestLevel) && b.suggestLevel >= 2, `頭目建議等級 ${b.suggestLevel}`);
  assert.ok(b.grind && b.grind.field && b.grind.field.fights > 0, '頭目要列「在 field 練幾場」');
});

test('方向對:巨蛛 Lv1 勝率 < Lv7;綠團子 Lv3 勝率 ≥ 90%', () => {
  const r = run();
  const spider = r.encounters.boss_spider.groups[0].byLevel;
  assert.ok(spider[1].winRate < spider[7].winRate, `巨蛛 Lv1 ${spider[1].winRate} vs Lv7 ${spider[7].winRate}`);
  const blob = r.encounters.field.groups[0].byLevel;
  assert.ok(blob[3].winRate >= 0.9, `綠團子 Lv3 勝率 ${blob[3].winRate}`);
  assert.equal(r.encounters.field.groups[0].suggestLevel, 1);
});

test('帶藥水勝率不會變低;等級範圍超過上限會截掉並提醒', () => {
  const a = run({ levels: '3-3' }), b = run({ levels: '3-3', potions: 3 });
  assert.equal(b.potion.item, 'potion');
  assert.ok(b.encounters.boss_spider.groups[0].byLevel[3].winRate >= a.encounters.boss_spider.groups[0].byLevel[3].winRate);
  const c = run({ levels: '19-25' });
  assert.deepEqual(c.levels, [19, 20]);
  assert.ok(c.notes.some((n) => /上限/.test(n)));
});

test('parseLevels / heroAtLevel / 文字報告', () => {
  assert.deepEqual(parseLevels('2-4'), [2, 3, 4]); assert.deepEqual(parseLevels('5'), [5]); assert.equal(parseLevels('x'), null); assert.equal(parseLevels('5-2'), null);
  const h = heroAtLevel(demo.game, 4);
  assert.equal(h.level, 4); assert.equal(h.hp, h.maxHp); assert.equal(h.maxHp, 30 + 6 * 3); assert.equal(h.xp, 0);
  const txt = formatReport(run());
  assert.match(txt, /遭遇表 field/); assert.match(txt, /建議等級 Lv\d+/); assert.match(txt, /洞窟巨蛛/);
});
