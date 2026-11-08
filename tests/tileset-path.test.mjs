// 圖片圖塊集的 image 路徑:Tiled 寫的是「相對於地圖檔」,引擎要換算成「相對於卡帶資料夾」再抓圖
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDemo, clone } from './helpers.mjs';
import { resolveMapPath } from '../engine/map.js';
import { validateGame } from '../engine/schema.js';
import { tilesetKey } from '../engine/sprites.js';

test('resolveMapPath:相對地圖檔解析、.. 正規化、反斜線容忍、網址照舊', () => {
  assert.equal(resolveMapPath('maps/village.json', '../assets/tiny-town.png'), 'assets/tiny-town.png');
  assert.equal(resolveMapPath('maps/village.json', 'tiles.png'), 'maps/tiles.png');
  assert.equal(resolveMapPath('maps/village.json', './tiles.png'), 'maps/tiles.png');
  assert.equal(resolveMapPath('maps\\sub\\cave.json', '..\\..\\assets\\x.png'), 'assets/x.png');
  assert.equal(resolveMapPath('village.json', 'assets/x.png'), 'assets/x.png');
  assert.equal(resolveMapPath('maps/a.json', '../../../x.png'), 'x.png', '多餘的 .. 不會跑出卡帶資料夾');
  assert.equal(resolveMapPath('maps/a.json', 'https://example.com/x.png'), 'https://example.com/x.png');
  assert.equal(resolveMapPath('maps/a.json', '/abs/x.png'), '/abs/x.png');
});

test('validateGame 把地圖檔名記進 map.file,圖塊集算出 src,而且那張圖真的存在', () => {
  const demo = loadDemo();
  const v = validateGame(demo);
  assert.deepEqual(v.errors, []);
  for (const [id, m] of Object.entries(v.maps)) {
    assert.equal(m.file, `maps/${id}.json`);
    const withImage = m.tilesets.filter((ts) => ts.image);
    assert.ok(withImage.length >= 1, `地圖 ${id} 至少要有一個圖片圖塊集`);
    for (const ts of withImage) {
      assert.match(ts.image, /^\.\.\/assets\//, `地圖 ${id} 的圖塊集 ${ts.name} 的 image 要寫成相對地圖檔的 ../assets/...`);
      assert.equal(ts.src, ts.image.replace(/^\.\.\//, ''));
      assert.equal(tilesetKey(ts), ts.src, '畫圖與抓圖都用 src 當鍵');
      assert.ok(fs.existsSync(path.join(ROOT, 'games', 'demo', ts.src)), `圖 ${ts.src} 不存在`);
      assert.ok(ts.columns > 0 && ts.tilecount > 0 && ts.tilewidth === m.tw, `圖塊集 ${ts.name} 的 columns / tilecount / tilewidth 要填`);
    }
  }
});

test('地圖搬到子資料夾、image 用反斜線,src 一樣算得對', () => {
  const d = clone(loadDemo());
  d.game.maps.village = { file: 'maps\\deep\\village.json', name: '晨光村' };
  d.maps.village.tilesets[0].image = '..\\..\\assets\\tiny-town.png';
  const v = validateGame(d);
  assert.deepEqual(v.errors, []);
  assert.equal(v.maps.village.file, 'maps\\deep\\village.json');
  assert.equal(v.maps.village.tilesets[0].src, 'assets/tiny-town.png');
});
