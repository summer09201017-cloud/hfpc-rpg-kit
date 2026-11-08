// 可達性檢查(scripts/reach.mjs):示範卡帶全部走得到;把艾拉圍起來就 🔴 指名她
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo, clone } from './helpers.mjs';
import { validateGame } from '../engine/schema.js';
import { checkReach, formatReach } from '../scripts/reach.mjs';

const demo = loadDemo();

test('示範卡帶:兩張地圖、每個人物 / 床 / 道具 / 傳送點 / 遇敵區、倒下的地方都走得到', () => {
  const v = validateGame(demo);
  assert.deepEqual(v.errors, []);
  const r = checkReach(demo, v.maps);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.maps).sort(), ['cave', 'village']);
  assert.ok(r.maps.village.reached > 0 && r.maps.cave.reached > 0, '洞窟要靠傳送點走得到');
  assert.ok(r.objects.length >= 12);
  assert.ok(r.objects.every((o) => o.ok), r.objects.filter((o) => !o.ok).map((o) => o.name).join('、'));
  const portal = r.objects.find((o) => o.type === 'portal' && o.map === 'village');
  assert.deepEqual(portal.cond, ['showIf'], '有條件的傳送點要標出來');
  assert.equal(r.defeat.ok, true);
  const txt = formatReach(r, demo);
  assert.match(txt, /✅ 全部走得到/); assert.match(txt, /有條件:showIf/); assert.match(txt, /人物「村長」/);
});

test('把艾拉四周用 collision 圍起來(記憶體裡改)⇒ 🔴 指名艾拉,其他照舊', () => {
  const d = clone(demo);
  const m = d.maps.village, col = m.layers.find((L) => L.name === 'collision').data;
  for (const [x, y] of [[11, 4], [13, 4], [12, 3], [12, 5]]) col[y * m.width + x] = 1;
  const v = validateGame(d);
  assert.deepEqual(v.errors, []);
  const r = checkReach(d, v.maps);
  assert.equal(r.ok, false);
  const bad = r.objects.filter((o) => !o.ok);
  assert.deepEqual(bad.map((o) => o.name), ['艾拉']);
  assert.match(formatReach(r, d), /🔴 人物「艾拉」晨光村 \(12,4\)/);
  assert.match(formatReach(r, d), /🔴 有 1 個地方走不到/);
});

test('起點被牆圍住 ⇒ 另一張地圖整張進不去、傳送點也走不到', () => {
  const d = clone(demo);
  const m = d.maps.village, col = m.layers.find((L) => L.name === 'collision').data;
  for (const [x, y] of [[3, 6], [5, 6], [4, 5], [4, 7]]) col[y * m.width + x] = 1;
  const v = validateGame(d);
  assert.deepEqual(v.errors, []);
  const r = checkReach(d, v.maps);
  assert.equal(r.maps.village.reached, 1);
  assert.equal(r.maps.cave.reached, 0);
  assert.ok(r.objects.filter((o) => !o.ok).length >= 10);
  assert.match(formatReach(r, d), /整張地圖進不去/);
});
