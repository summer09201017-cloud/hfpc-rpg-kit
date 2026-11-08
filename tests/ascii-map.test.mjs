// 文字地圖(scripts/ascii-map.mjs):範例轉得出能用的地圖、示範村子往返不失真、換成唯一地圖的卡帶驗證零錯誤
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, clone } from './helpers.mjs';
import { textToTiled, tiledToText, tiledToJson } from '../scripts/ascii-map.mjs';
import { parseTiled, tiledProps } from '../engine/map.js';
import { validateGame } from '../engine/schema.js';
import { loadGameDir } from '../scripts/lib/load-fs.mjs';

const SAMPLE = fs.readFileSync(path.join(ROOT, 'docs', '範例-文字地圖.txt'), 'utf8');
const TT = (n) => 1 + n, TW = (n) => 265 + n;
const at = (layer, w, x, y) => layer[y * w + x];
const objSummary = (tiled) => tiled.layers.filter((L) => L.type === 'objectgroup').flatMap((L) => L.objects)
  .map((o) => ({ type: o.type, name: o.name, tx: o.x / tiled.tilewidth, ty: o.y / tiled.tileheight, w: o.width / tiled.tilewidth, h: o.height / tiled.tileheight, props: Object.fromEntries(Object.entries(tiledProps(o)).sort()) }))
  .sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.type.localeCompare(b.type));
const layerOf = (tiled, name) => tiled.layers.find((L) => L.name === name).data;

test('範例文字地圖轉出來能過 parseTiled;auto 九宮格角落、遇敵區合併、物件座標都對', () => {
  const r = textToTiled(SAMPLE);
  assert.deepEqual(r.errors, []);
  const t = r.tiled;
  assert.equal(t.width, 12); assert.equal(t.height, 8); assert.equal(t.tilewidth, 16);
  assert.deepEqual(t.tilesets.map((ts) => [ts.name, ts.firstgid, ts.tilecount]), [['tiny-town', 1, 132], ['tiny-dungeon', 133, 132], ['water', 265, 9], ['vector', 274, 1]]);
  const p = parseTiled('sample', t);
  assert.deepEqual(p.errors, []);
  assert.equal(p.map.name, '範例小村');
  const g = layerOf(t, 'ground'), d = layerOf(t, 'deco'), c = layerOf(t, 'collision');
  // 土路 x=5..7,y=2..6:九宮格四角、四邊、中間
  assert.equal(at(g, 12, 5, 2), TT(12)); assert.equal(at(g, 12, 6, 2), TT(13)); assert.equal(at(g, 12, 7, 2), TT(14));
  assert.equal(at(g, 12, 5, 3), TT(24)); assert.equal(at(g, 12, 6, 3), TT(25)); assert.equal(at(g, 12, 7, 3), TT(26));
  assert.equal(at(g, 12, 5, 6), TT(36)); assert.equal(at(g, 12, 6, 6), TT(37)); assert.equal(at(g, 12, 7, 6), TT(38));
  // 池塘 x=8..10,y=1..2:只有上下兩列 ⇒ 上排 0 1 2、下排 6 7 8,而且不能走
  assert.deepEqual([at(g, 12, 8, 1), at(g, 12, 9, 1), at(g, 12, 10, 1)], [TW(0), TW(1), TW(2)]);
  assert.deepEqual([at(g, 12, 8, 2), at(g, 12, 9, 2), at(g, 12, 10, 2)], [TW(6), TW(7), TW(8)]);
  assert.ok(at(c, 12, 9, 1) && !at(c, 12, 4, 3) && at(c, 12, 0, 0), '池塘、樹不能走;草地能走');
  // 樹 = 草地 + 樹冠裝飾;床 = 石地板 + 程式畫的 274
  assert.equal(at(g, 12, 0, 0), TT(0)); assert.equal(at(d, 12, 0, 0), TT(28));
  assert.equal(at(g, 12, 1, 2), TT(109)); assert.equal(at(d, 12, 1, 2), 274); assert.equal(at(c, 12, 1, 2), 274);
  // 遇敵區 x=9..10,y=4..6 合併成一塊;物件底下的地形是 on= 指定的
  const objs = objSummary(t);
  assert.deepEqual(objs.map((o) => [o.type, o.tx, o.ty, o.w, o.h]), [['heal', 1, 2, 1, 1], ['npc', 2, 3, 1, 1], ['zone', 9, 4, 2, 3], ['portal', 2, 5, 1, 1], ['item', 8, 5, 1, 1]]);
  assert.deepEqual(objs.find((o) => o.type === 'npc').props, { color: '#8d6e4c', dialogue: 'elder', face: 'down', name: '村長' });
  assert.deepEqual(objs.find((o) => o.type === 'portal').props, { dir: 'down', map: 'sample', x: 4, y: 3 });
  assert.equal(objs.find((o) => o.type === 'portal').name, '傳回路口');
  assert.equal(objs.find((o) => o.type === 'heal').name, '床');
  assert.equal(at(g, 12, 2, 3), TT(0), 'NPC 底下是草地'); assert.equal(at(g, 12, 9, 5), TT(1), '遇敵區底下是長草');
  assert.equal(at(c, 12, 2, 3), 0, 'NPC 的格子本身不算 collision(遊戲機會自己擋)');
  // 寫成 JSON 再讀回來一樣
  assert.deepEqual(JSON.parse(tiledToJson(t)), t);
});

test('填錯會用白話指出第幾行:沒定義的符號、列寬不一、auto 用到沒圖的圖塊集', () => {
  let r = textToTiled(SAMPLE.replace('T.E..===...T', 'T.E..===..?T'));
  assert.ok(r.errors.some((e) => /「\?」沒有定義/.test(e)), r.errors.join('\n'));
  r = textToTiled(SAMPLE.replace('T.E..===...T', 'T.E..===..T'));
  assert.ok(r.errors.some((e) => /每一列要一樣寬/.test(e)), r.errors.join('\n'));
  r = textToTiled(SAMPLE.replace('= = auto tiny-town:12', '= = auto vector:0'));
  assert.ok(r.errors.some((e) => /auto 要用有圖片的圖塊集/.test(e)), r.errors.join('\n'));
  r = textToTiled(SAMPLE.replace('tileset: water ../assets/water.png 3x3\n', ''));
  assert.ok(r.errors.some((e) => /圖塊集「water」沒有用 tileset: 宣告/.test(e)), r.errors.join('\n'));
  r = textToTiled('name: x\n');
  assert.ok(r.errors.some((e) => /至少要宣告一個圖塊集/.test(e)) && r.errors.some((e) => /沒有 map:/.test(e)), r.errors.join('\n'));
});

test('示範卡帶兩張地圖 --dump 再轉回去:大小、ground / deco / collision 每一格、每個物件都一樣', () => {
  for (const id of ['village', 'cave']) {
    const orig = JSON.parse(fs.readFileSync(path.join(ROOT, 'games', 'demo', 'maps', `${id}.json`), 'utf8'));
    const dump = tiledToText(orig, { source: `${id}.json` });
    assert.deepEqual(dump.errors, [], id);
    assert.match(dump.text, /^map:$/m);
    const back = textToTiled(dump.text);
    assert.deepEqual(back.errors, [], `${id} 轉回去:` + back.errors.join('\n'));
    const t = back.tiled;
    assert.equal(t.width, orig.width); assert.equal(t.height, orig.height); assert.equal(t.tilewidth, orig.tilewidth);
    for (const name of ['ground', 'deco', 'collision']) assert.deepEqual(layerOf(t, name), layerOf(orig, name), `${id} 的 ${name} 圖層`);
    assert.deepEqual(objSummary(t), objSummary(orig), `${id} 的物件`);
    assert.deepEqual(t.tilesets.map((ts) => [ts.name, ts.firstgid, ts.tilecount, ts.image || null]), orig.tilesets.map((ts) => [ts.name, ts.firstgid, ts.tilecount, ts.image || null]));
    assert.equal(tiledProps(t).name, tiledProps(orig).name);
    // 轉回去的地圖放進示範卡帶也零錯誤
    const data = clone(loadGameDir(path.join(ROOT, 'games', 'demo')));
    data.maps[id] = t;
    assert.deepEqual(validateGame(data).errors, []);
  }
});

test('把示範卡帶複製到暫存資料夾、換成範例地圖當唯一地圖,validateGame 零錯誤', () => {
  const base = path.join(os.tmpdir(), 'claude'); fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'rpgkit-ascii-'));
  try {
    const dir = path.join(tmp, 'sample');
    fs.cpSync(path.join(ROOT, 'games', 'demo'), dir, { recursive: true });
    const r = textToTiled(SAMPLE);
    assert.deepEqual(r.errors, []);
    fs.writeFileSync(path.join(dir, 'maps', 'sample.json'), tiledToJson(r.tiled));
    const game = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
    game.id = 'sample';
    game.maps = { sample: { file: 'maps/sample.json', name: '範例小村' } };
    game.start = { map: 'sample', x: 4, y: 3, dir: 'down' };
    game.defeat = { ...game.defeat, map: 'sample', x: 4, y: 3 };
    fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify(game, null, 2));
    const data = loadGameDir(dir);
    assert.deepEqual(data.loadErrors, []);
    const v = validateGame(data);
    assert.deepEqual(v.errors, [], v.errors.join('\n'));
    assert.equal(Object.keys(v.maps).length, 1);
    assert.ok(v.maps.sample.tilesets.find((ts) => ts.name === 'tiny-town').src === 'assets/tiny-town.png');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
