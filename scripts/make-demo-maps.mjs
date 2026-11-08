#!/usr/bin/env node
// 產生示範卡帶的兩張地圖(games/demo/maps/*.json),格式 = Tiled 匯出的 JSON(帶圖片圖塊集的 Embed 寫法活範例)。
// 只在建示範卡帶時跑;以後要改地圖請直接用 Tiled 開 json 改。
//
// 美術 = Kenney「Tiny Town」與「Tiny Dungeon」(CC0,games/demo/assets/,16×16 一格、12 欄無間距)。
// 鐵則:地圖大小、每一格能不能走(collision)、物件的格子座標與屬性都不能動(scripts/e2e.mjs 用格子座標走劇情)。
// 這支改的只有「每一格畫哪張圖」;路加寬、花草、牆面都只是視覺。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('../games/demo/maps', import.meta.url)));
const T = 16;

/* ── 圖塊集(gid = firstgid + 圖裡的格號;格號從 0 數、一列 12 格)── */
const SHEET = { imagewidth: 192, imageheight: 176, tilewidth: T, tileheight: T, tilecount: 132, columns: 12, margin: 0, spacing: 0 };
const TILESETS = [
  { firstgid: 1, name: 'tiny-town', image: '../assets/tiny-town.png', ...SHEET },      // gid 1..132
  { firstgid: 133, name: 'tiny-dungeon', image: '../assets/tiny-dungeon.png', ...SHEET }, // gid 133..264
  { firstgid: 265, name: 'water', image: '../assets/water.png', imagewidth: 48, imageheight: 48, tilewidth: T, tileheight: T, tilecount: 9, columns: 3, margin: 0, spacing: 0 }, // gid 265..273 池塘九宮格(自繪)
  { firstgid: 274, name: 'vector', tilecount: 1, columns: 0, tilewidth: T, tileheight: T, margin: 0, spacing: 0 }, // 沒有圖、由 tiles.json 用程式畫
];
const TT = (n) => 1 + n;     // Tiny Town 第 n 格
const TD = (n) => 133 + n;   // Tiny Dungeon 第 n 格
const TW = (n) => 265 + n;   // 池塘九宮格第 n 格(0 1 2 / 3 4 5 / 6 7 8)
const V_BED = 274;           // 三張圖都沒有的:床(tiles.json 向量畫)
const water = { tl: TW(0), t: TW(1), tr: TW(2), l: TW(3), c: TW(4), r: TW(5), bl: TW(6), b: TW(7), br: TW(8) };

// Tiny Town 用到的格
const town = {
  grass: TT(0), grassTuft: TT(1), grassFlower: TT(2), sprout: TT(17), mushroom: TT(29),
  treeYellow: TT(27), treeGreen: TT(28), canopy: TT(19),
  dirt: { tl: TT(12), t: TT(13), tr: TT(14), l: TT(24), c: TT(25), r: TT(26), bl: TT(36), b: TT(37), br: TT(38) },
  dirtWorn: [TT(39), TT(40), TT(41), TT(42)],
  fenceTop: TT(47), fenceMid: TT(59), fenceBottom: TT(71),
  wood: { l: TT(72), m: TT(73), r: TT(75), window: TT(84) },
  stone: { l: TT(76), m: TT(77), r: TT(79), window: TT(88) },
  floor: { tl: TT(96), t: TT(97), tr: TT(98), l: TT(108), c: TT(109), r: TT(110), bl: TT(120), b: TT(121), br: TT(122) },
  brick: TT(126),
};
// Tiny Dungeon 用到的格
const dun = {
  floor: [TD(0), TD(1), TD(12), TD(24)], wall: TD(40), wallSlit: TD(28), doorway: TD(10),
  stubL: TD(57), stubR: TD(59), block: TD(55), anvil: TD(74),
};
// 這些 gid 不能走(其餘都能走)
const BLOCK = new Set([
  town.canopy, town.treeYellow, town.treeGreen, town.fenceTop, town.fenceMid, town.fenceBottom,
  town.wood.l, town.wood.m, town.wood.r, town.wood.window, town.stone.l, town.stone.m, town.stone.r, town.stone.window, town.brick,
  dun.wall, dun.wallSlit, dun.stubL, dun.stubR, dun.block, dun.anvil, V_BED, ...Object.values(water),
]);

const prop = (name, value) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value });
let oid = 1;
const obj = (name, type, tx, ty, props = {}, w = 1, h = 1) => ({ id: oid++, name, type, x: tx * T, y: ty * T, width: w * T, height: h * T, rotation: 0, visible: true, point: false, properties: Object.entries(props).map(([k, v]) => prop(k, v)) });

function build({ w, h, ground, deco, objects, name }) {
  const collision = ground.map((g, i) => (BLOCK.has(g) || BLOCK.has(deco[i]) ? (deco[i] || g) : 0));
  const layer = (id, lname, data) => ({ id, name: lname, type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: w, height: h, data });
  return {
    compressionlevel: -1, height: h, infinite: false, orientation: 'orthogonal', renderorder: 'right-down', tiledversion: '1.11.0', type: 'map', version: '1.10', width: w, tilewidth: T, tileheight: T,
    nextlayerid: 5, nextobjectid: oid,
    properties: [prop('name', name)],
    tilesets: TILESETS,
    layers: [layer(1, 'ground', ground), layer(2, 'deco', deco), layer(3, 'collision', collision), { id: 4, name: 'objects', type: 'objectgroup', visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown', objects }],
  };
}
const grid = (w, h, v) => Array(w * h).fill(v);
const fillRect = (arr, w, x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arr[y * w + x] = v; };
const set = (arr, w, x, y, v) => { arr[y * w + x] = v; };
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// 9 宮格鋪一塊矩形(x0..x1, y0..y1):四角、四邊、中間
function nine(arr, w, x0, y0, x1, y1, k) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const L = x === x0, R = x === x1, Tp = y === y0, B = y === y1;
    set(arr, w, x, y, Tp && L ? k.tl : Tp && R ? k.tr : B && L ? k.bl : B && R ? k.br : Tp ? k.t : B ? k.b : L ? k.l : R ? k.r : k.c);
  }
}

/* ── 晨光村 24×16 ── */
{
  const w = 24, h = 16;
  const G = grid(w, h, town.grass), D = grid(w, h, 0);
  // 四周一圈密林(不能走)
  for (let x = 0; x < w; x++) { set(D, w, x, 0, town.canopy); set(D, w, x, h - 1, town.canopy); }
  for (let y = 0; y < h; y++) { set(D, w, 0, y, town.canopy); set(D, w, w - 1, y, town.canopy); }
  // 村長家(石屋,剖面圖:後牆 y=1 x=2..6、側牆 x=6 y=2..3、石地板 x=2..5 y=2..3、床在 (2,2))
  set(G, w, 2, 1, town.stone.l); set(G, w, 3, 1, town.stone.window); set(G, w, 4, 1, town.stone.m); set(G, w, 5, 1, town.stone.window); set(G, w, 6, 1, town.stone.r);
  fillRect(G, w, 6, 2, 6, 3, town.stone.r);
  nine(G, w, 2, 2, 5, 3, town.floor); set(D, w, 2, 2, V_BED);
  // 池塘 x=8..10 y=2..3(自繪水岸 9 宮格:3×2 只用到四角與上下邊)
  nine(G, w, 8, 2, 10, 3, water);
  // 艾拉的小屋(木屋:後牆 y=2 x=11..14、側牆 x=14 y=3..4、地板 x=11..13 y=3..4);門口兩格花
  set(G, w, 11, 2, town.wood.l); set(G, w, 12, 2, town.wood.window); set(G, w, 13, 2, town.wood.m); set(G, w, 14, 2, town.wood.r);
  fillRect(G, w, 14, 3, 14, 4, town.wood.r);
  nine(G, w, 11, 3, 13, 4, town.floor); set(G, w, 10, 4, town.grassFlower); set(G, w, 10, 5, town.grassFlower);
  // 鐵匠的鐵砧(原本的「桌子」格,不能走)
  set(D, w, 10, 9, dun.anvil);
  // 土路(有邊的 9 宮格):大路 y=7..8 x=2..13;往村長家 x=3..4 y=4..6;往艾拉家 x=11..12 y=5..6;往南 x=12..13 y=9..10;穿過柵欄缺口的小徑 y=10 x=14..16
  nine(G, w, 2, 7, 13, 8, town.dirt);
  nine(G, w, 3, 4, 4, 6, town.dirt); set(G, w, 3, 7, town.dirt.c); set(G, w, 4, 7, town.dirt.c);
  nine(G, w, 11, 5, 12, 6, town.dirt); set(G, w, 11, 7, town.dirt.c); set(G, w, 12, 7, town.dirt.c);
  set(G, w, 12, 8, town.dirt.c); set(G, w, 13, 8, town.dirt.r); set(G, w, 12, 9, town.dirt.l); set(G, w, 13, 9, town.dirt.r); set(G, w, 12, 10, town.dirt.bl); set(G, w, 13, 10, town.dirt.b);
  set(G, w, 14, 10, town.dirtWorn[2]); set(G, w, 15, 10, town.dirtWorn[3]); set(G, w, 16, 10, town.dirtWorn[1]);
  // 柵欄 x=14,y=5..14,缺口在 y=10(直向柵欄:上端、中段、下端)
  for (let y = 5; y <= 14; y++) if (y !== 10) set(D, w, 14, y, y === 5 || y === 11 ? town.fenceTop : y === 9 || y === 14 ? town.fenceBottom : town.fenceMid);
  // 草原 x=15..22,y=4..14:深草叢(規律留幾塊短草)+ 零星小草、蘑菇;幾棵樹;兩叢花
  for (let y = 4; y <= 14; y++) for (let x = 15; x <= 22; x++) {
    if (G[y * w + x] !== town.grass) continue;
    if ((x + y) % 3 !== 0) { set(G, w, x, y, town.grassTuft); if (hash(x, y) < 0.4) set(D, w, x, y, town.sprout); }
  }
  for (const [x, y] of [[17, 8], [16, 13], [21, 13], [18, 5]]) set(D, w, x, y, town.treeGreen);
  for (const [x, y] of [[19, 11], [22, 9]]) set(D, w, x, y, town.treeYellow);
  for (const [x, y] of [[16, 6], [20, 12]]) { set(G, w, x, y, town.grassFlower); set(D, w, x, y, 0); }
  // 村子裡的草地:偶爾一塊長草、一叢蘑菇(純裝飾,都能走)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (G[y * w + x] !== town.grass || D[y * w + x] || x >= 15) continue;
    const r = hash(x * 3, y * 7);
    if (r < 0.12) set(G, w, x, y, town.grassTuft); else if (r > 0.97) set(D, w, x, y, town.mushroom);
  }
  // 東北角洞口:石牆圍著 (21,2),洞口本身是暗門
  for (const [x, y] of [[19, 1], [20, 1], [21, 1], [22, 1], [20, 2], [22, 2], [19, 2]]) set(D, w, x, y, town.brick);
  set(G, w, 21, 2, dun.doorway); set(D, w, 21, 2, 0);
  const objects = [
    obj('床', 'heal', 2, 2),
    obj('村長', 'npc', 6, 6, { dialogue: 'elder', name: '村長', color: '#8d6e4c', hair: '#dddddd', face: 'left' }),
    obj('艾拉', 'npc', 12, 4, { dialogue: 'herbalist', name: '艾拉', color: '#6cb86a', hair: '#c0392b', face: 'down' }),
    obj('鐵匠', 'npc', 9, 9, { dialogue: 'smith', name: '鐵匠', color: '#555555', hair: '#222222', face: 'right' }),
    obj('守衛', 'npc', 20, 3, { dialogue: 'guard', name: '守衛', color: '#4a6fa5', hair: '#4a3020', face: 'right' }),
    obj('藥草', 'item', 18, 12, { item: 'herb', qty: 1 }),
    obj('藥草', 'item', 21, 7, { item: 'herb', qty: 1 }),
    obj('草原', 'zone', 15, 5, { encounter: 'field' }, 8, 10),
    obj('洞口', 'portal', 21, 2, { map: 'cave', x: 2, y: 9, dir: 'up', showIf: 'quest:q_boss=active,done' }),
  ];
  write('village.json', build({ w, h, ground: G, deco: D, objects, name: '晨光村' }));
}

/* ── 北邊洞窟 16×12 ── */
{
  const w = 16, h = 12;
  const G = grid(w, h, dun.floor[0]), D = grid(w, h, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = hash(x * 5, y * 11); if (r < 0.1) set(G, w, x, y, dun.floor[2]); else if (r < 0.2) set(G, w, x, y, dun.floor[3]); else if (r < 0.45) set(G, w, x, y, dun.floor[1]); }
  // 四周石牆;上面那排偶爾一塊有通風縫的牆
  fillRect(G, w, 0, 0, w - 1, 0, dun.wall); fillRect(G, w, 0, h - 1, w - 1, h - 1, dun.wall); fillRect(G, w, 0, 0, 0, h - 1, dun.wall); fillRect(G, w, w - 1, 0, w - 1, h - 1, dun.wall);
  for (const x of [3, 9, 13]) set(G, w, x, 0, dun.wallSlit);
  // 岩石:兩格並排的用一段石牆(左端+右端),單格的用石塊
  for (const [x, y] of [[4, 2], [10, 3], [3, 5], [7, 6], [12, 6], [5, 8], [10, 9]]) { set(D, w, x, y, dun.stubL); set(D, w, x + 1, y, dun.stubR); }
  set(D, w, 8, 3, dun.block);
  // 回村子的暗門
  set(G, w, 2, 9, dun.doorway);
  const objects = [
    obj('洞窟巨蛛', 'npc', 12, 3, { dialogue: 'boss', name: '洞窟巨蛛', shape: 'spider', color: '#5b3a7a', hideIf: 'flag:boss_down' }),
    obj('洞窟', 'zone', 1, 1, { encounter: 'cave' }, 14, 10),
    obj('回村子', 'portal', 2, 9, { map: 'village', x: 21, y: 3, dir: 'down' }),
  ];
  write('cave.json', build({ w, h, ground: G, deco: D, objects, name: '北邊洞窟' }));
}

function write(file, map) {
  mkdirSync(OUT, { recursive: true });
  const json = JSON.stringify(map, null, 2).replace(/"data": \[\s*([\d,\s]+?)\s*\]/g, (m, body) => '"data": [' + body.replace(/\s+/g, '').replace(/,/g, ', ') + ']');
  writeFileSync(join(OUT, file), json + '\n');
  console.log(`✔ ${join(OUT, file)}(${map.width}×${map.height},${map.layers[3].objects.length} 個物件)`);
}
