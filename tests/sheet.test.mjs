// 走路圖 / 怪物圖的版面慣例:4 欄 = 方向(下、上、左、右)× N 列 = 幀,格寬 = 圖寬 ÷ 4,只用前 4 列。
// sheetFrame 是純函式(不碰 canvas),這裡用假的 {width,height} 就能測;loadImages 用假的 Image 測去重與退路。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDemo } from './helpers.mjs';
import { sheetFrame, loadImages } from '../engine/sprites.js';
import { validateGame } from '../engine/schema.js';

const img = (width, height) => ({ width, height });
const pngSize = (p) => { const b = fs.readFileSync(p); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; };

test('64×112 的人物走路圖:16px 一格、4 幀;dir=left 第 2 幀在 (32,16)', () => {
  assert.deepEqual(sheetFrame(img(64, 112), 'left', 1), { sx: 32, sy: 16, fw: 16, fh: 16, frames: 4 });
  assert.deepEqual(sheetFrame(img(64, 112), 'down', 0), { sx: 0, sy: 0, fw: 16, fh: 16, frames: 4 });
  assert.equal(sheetFrame(img(64, 112), 'up', 0).sx, 16);
  assert.equal(sheetFrame(img(64, 112), 'right', 3).sx, 48);
  assert.equal(sheetFrame(img(64, 112), 'right', 3).sy, 48);
  assert.equal(sheetFrame(img(64, 112), 'left', 5).sy, 16, '幀數超過就輪回');
  assert.equal(sheetFrame(img(64, 112), 'left', 4).sy, 0);
  assert.equal(sheetFrame(img(64, 112), 'left', 2.9).sy, 32, '小數幀取整');
});

test('64×64 的怪物圖 4 幀;列 4~6(攻擊、跳、倒下)不會被當走路幀;列數不到 4 就有幾列用幾列', () => {
  assert.equal(sheetFrame(img(64, 64), 'down', 0).frames, 4);
  assert.equal(sheetFrame(img(64, 112), 'down', 9).sy, 16, '只在前 4 列輪');
  assert.equal(sheetFrame(img(64, 48), 'down', 2).frames, 3);
  assert.equal(sheetFrame(img(64, 48), 'down', 3).sy, 0);
  assert.equal(sheetFrame(img(64, 16), 'down', 7).sy, 0, '只有一列就永遠列 0');
});

test('128×128 的 32px 走路圖也對:格寬 32、dir=right 第 4 幀在 (96,96)', () => {
  assert.deepEqual(sheetFrame(img(128, 128), 'right', 3), { sx: 96, sy: 96, fw: 32, fh: 32, frames: 4 });
});

test('不認得的方向、沒給方向都當 down', () => {
  assert.equal(sheetFrame(img(64, 64), 'north', 0).sx, 0);
  assert.equal(sheetFrame(img(64, 64)).sx, 0);
});

test('示範卡帶用到的圖都存在;主角與村長的走路圖 16px 一格、4 幀、高是格寬的倍數', () => {
  const v = validateGame(loadDemo());
  assert.deepEqual(v.errors, []);
  for (const key of v.imageKeys) assert.ok(fs.existsSync(path.join(ROOT, 'games', 'demo', key)), `圖 ${key} 不存在`);
  for (const key of ['assets/actors/hero.png', 'assets/actors/elder.png']) {
    assert.ok(v.imageKeys.includes(key), `${key} 沒被收進 imageKeys`);
    const im = pngSize(path.join(ROOT, 'games', 'demo', key));
    assert.equal(im.width % 4, 0, `${key} 的寬要是 4 的倍數`);
    const f = sheetFrame(im, 'down', 0);
    assert.equal(f.fw, 16, `${key} 要 16px 一格(跟地圖一樣)`);
    assert.equal(f.frames, 4);
    assert.equal(im.height % f.fh, 0, `${key} 的高要是格寬的倍數`);
  }
});

test('loadImages:同一張只抓一次、空鍵略過、抓不到的鍵不留在清單裡(畫圖時退回程式畫)', async () => {
  const seen = [];
  const FakeImage = class { set src(v) { seen.push(v); const bad = /bad/.test(v); setTimeout(() => (bad ? this.onerror() : this.onload()), 0); } };
  const prev = globalThis.Image; globalThis.Image = FakeImage;
  try {
    const out = await loadImages(['a.png', 'a.png', 'bad.png', '', null], 'games/x/');
    assert.deepEqual(seen, ['games/x/a.png', 'games/x/bad.png']);
    assert.ok(out['a.png'] instanceof FakeImage);
    assert.ok(!('bad.png' in out));
    assert.deepEqual(Object.keys(out), ['a.png']);
    assert.deepEqual(await loadImages([], 'games/x/'), {});
    assert.deepEqual(await loadImages(undefined, 'games/x/'), {});
  } finally { if (prev) globalThis.Image = prev; else delete globalThis.Image; }
});
