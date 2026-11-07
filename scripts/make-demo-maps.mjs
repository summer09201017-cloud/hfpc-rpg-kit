#!/usr/bin/env node
// 產生示範卡帶的兩張地圖(games/demo/maps/*.json),格式 = Tiled 匯出的 JSON。
// 只在建示範卡帶時跑一次;以後要改地圖請直接用 Tiled 開 json 改(這支是「Tiled 格式長什麼樣」的活範例)。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(fileURLToPath(new URL('../games/demo/maps', import.meta.url)));
const T = 32;
const BLOCK = new Set([4, 5, 6, 8, 9, 11, 13, 15, 17]);   // 這些圖塊不能走(水、樹、牆、屋頂、床、岩石、洞窟牆、柵欄、桌子)

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
    tilesets: [{ firstgid: 1, name: 'palette', tilecount: 17, columns: 0, tilewidth: T, tileheight: T, margin: 0, spacing: 0 }],
    layers: [layer(1, 'ground', ground), layer(2, 'deco', deco), layer(3, 'collision', collision), { id: 4, name: 'objects', type: 'objectgroup', visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown', objects }],
  };
}
const grid = (w, h, v) => Array(w * h).fill(v);
const fillRect = (arr, w, x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arr[y * w + x] = v; };
const set = (arr, w, x, y, v) => { arr[y * w + x] = v; };

/* ── 晨光村 24×16 ── */
{
  const w = 24, h = 16;
  const G = grid(w, h, 1), D = grid(w, h, 0);
  for (let x = 0; x < w; x++) { set(D, w, x, 0, 5); set(D, w, x, h - 1, 5); }
  for (let y = 0; y < h; y++) { set(D, w, 0, y, 5); set(D, w, w - 1, y, 5); }
  // 村長家:上牆 y=1、右牆 x=6、木地板、床在 (2,2)
  fillRect(G, w, 2, 1, 6, 1, 6); fillRect(G, w, 6, 2, 6, 3, 6); fillRect(G, w, 2, 2, 5, 3, 7); set(D, w, 2, 2, 9);
  // 池塘
  fillRect(G, w, 8, 2, 10, 3, 4);
  // 艾拉的小屋:上牆 y=2 x=11..14、右牆 x=14 y=3..4、木地板 x=11..13 y=3..4;門口花
  fillRect(G, w, 11, 2, 14, 2, 6); fillRect(G, w, 14, 3, 14, 4, 6); fillRect(G, w, 11, 3, 13, 4, 7); set(D, w, 10, 4, 14); set(D, w, 10, 5, 14);
  // 鐵匠的桌子
  set(D, w, 10, 9, 17);
  // 土路:y=7 從 x=2 到 13、x=13 往下到 y=10、y=10 往東穿過柵欄缺口到 x=16
  fillRect(G, w, 2, 7, 13, 7, 3); fillRect(G, w, 13, 7, 13, 10, 3); fillRect(G, w, 13, 10, 16, 10, 3); fillRect(G, w, 3, 4, 3, 7, 3);
  // 柵欄 x=14,y=5..14,缺口在 y=10
  for (let y = 5; y <= 14; y++) if (y !== 10) set(D, w, 14, y, 15);
  // 草原:x=15..22,y=4..14 深草叢(規律留幾塊短草);幾棵樹
  for (let y = 4; y <= 14; y++) for (let x = 15; x <= 22; x++) if (G[y * w + x] === 1 && (x + y) % 3 !== 0) set(G, w, x, y, 2);
  for (const [x, y] of [[17, 8], [19, 11], [16, 13], [21, 13], [22, 9], [18, 5]]) set(D, w, x, y, 5);
  for (const [x, y] of [[16, 6], [20, 12]]) set(D, w, x, y, 14);
  // 東北角洞口:岩石圍著 (21,2)
  for (const [x, y] of [[19, 1], [20, 1], [21, 1], [22, 1], [20, 2], [22, 2], [19, 2]]) set(D, w, x, y, 11);
  set(G, w, 21, 2, 12); set(D, w, 21, 2, 10);
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
  const G = grid(w, h, 12), D = grid(w, h, 0);
  fillRect(G, w, 0, 0, w - 1, 0, 13); fillRect(G, w, 0, h - 1, w - 1, h - 1, 13); fillRect(G, w, 0, 0, 0, h - 1, 13); fillRect(G, w, w - 1, 0, w - 1, h - 1, 13);
  for (const [x, y] of [[4, 2], [5, 2], [8, 3], [10, 3], [11, 3], [3, 5], [4, 5], [7, 6], [8, 6], [12, 6], [13, 6], [5, 8], [6, 8], [10, 9], [11, 9]]) set(D, w, x, y, 11);
  set(D, w, 2, 9, 10);
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
