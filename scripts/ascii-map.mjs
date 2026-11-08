#!/usr/bin/env node
// 用鍵盤半形字畫地圖 ⇄ Tiled JSON(不用開 Tiled 也能做地圖)。
//   node scripts/ascii-map.mjs 地圖.txt [-o games/<卡帶>/maps/<名>.json]   文字 → Tiled JSON(沒 -o 就印到螢幕)
//   node scripts/ascii-map.mjs --dump games/demo/maps/village.json [-o 地圖.txt]   Tiled JSON → 文字(從示範村子改起)
// 文字格式(完整說明在 docs/設計手冊.md「五之二」;活範例 docs/範例-文字地圖.txt):
//   name: 晨光村
//   tile: 16
//   tileset: tiny-town ../assets/tiny-town.png 12x11      名字、相對 maps/ 的圖片路徑、欄x列
//   tileset: vector - 10                                  沒有圖(程式畫、tiles.json 用的 gid)、幾格
//   . = tiny-town:0                                       地形:符號 = 圖塊集:格號 [裝飾 圖塊集:格號] [x]   x = 不能走
//   = = auto tiny-town:12                                 auto = 九宮格自動邊角(給左上角格號)
//   E = npc dialogue=elder name=村長 face=left on=.       物件:符號 = 類型 ["名字"] 屬性=值 … on=底下的地形符號
//   z = zone encounter=field on=,                         遇敵區:同列連續格子一塊,相鄰列同起點同寬合併
//   map:                                                  接著一列一列畫
//   zones:                                                (選填)遇敵區另外畫一張同大小的圖,. 或空白 = 沒有;可以蓋在任何地形與物件上
// 純函式零相依;textToTiled / tiledToText 匯出給測試用。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBJECT_TYPES } from '../engine/map.js';

const TILE_RE = /^([\w-]+):(\d+)$/;
const SYMBOL_POOL_TERRAIN = [...". , : ; ' ~ - _ = + * ^ % & @ $ ! ? | < > ( ) [ ] { } 0 1 2 3 4 5 6 7 8 9 a b c d e f g h i j k l m n o p q r s t u v w x y z".split(' ')];
const SYMBOL_POOL_OBJECT = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/* ── 小工具 ── */
// 把一行定義切成 token:雙引號裡的空白不切;回 [{ text, quoted, key, value }]
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    let text = '', quoted = false, eq = -1;
    while (i < s.length && !/\s/.test(s[i])) {
      if (s[i] === '"') {
        const j = s.indexOf('"', i + 1);
        if (j < 0) return { error: '雙引號沒有成對' };
        text += s.slice(i + 1, j); quoted = true; i = j + 1;
      } else { if (s[i] === '=' && eq < 0) eq = text.length; text += s[i++]; }
    }
    if (eq > 0) out.push({ text, quoted, key: text.slice(0, eq), value: text.slice(eq + 1) });
    else out.push({ text, quoted, key: null, value: null });
  }
  return out;
}
// 屬性值:沒加引號而且長得像數字 ⇒ 數字;true/false ⇒ 布林;其餘文字
function propValue(tok) {
  const v = tok.value;
  if (tok.quoted) return { type: 'string', value: v };
  if (/^-?\d+$/.test(v)) return { type: 'int', value: +v };
  if (/^-?\d+\.\d+$/.test(v)) return { type: 'float', value: +v };
  if (v === 'true' || v === 'false') return { type: 'bool', value: v === 'true' };
  return { type: 'string', value: v };
}
const quoteIfNeeded = (v) => (/[\s"]/.test(v) || v === '' || /^-?\d+(\.\d+)?$/.test(v) || v === 'true' || v === 'false') ? `"${String(v).replace(/"/g, '')}"` : v;
const defaultName = (type, props) => (type === 'npc' && typeof props.name === 'string' && props.name) ? props.name : type;

/* ── 文字 → Tiled ── */
export function textToTiled(text, opts = {}) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m);
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let name = '', tile = 16;
  const tilesets = [];     // { name, image, columns, rows, tilecount, firstgid }
  const symbols = {};      // 符號 → 定義
  const order = [];        // 定義順序(第一個地形當物件預設的 on)
  const rows = [], zoneRows = [];
  let section = 'head';
  lines.forEach((raw, idx) => {
    const ln = idx + 1, line = raw.replace(/\s+$/, '');
    if (section === 'head') {
      if (!line.trim()) return;
      let m;
      if ((m = /^(\S) = (.*)$/.exec(line))) {
        const sym = m[1];
        if (symbols[sym]) { E(`第 ${ln} 行:符號「${sym}」已經定義過了`); return; }
        const toks = tokenize(m[2]);
        if (toks.error) { E(`第 ${ln} 行:${toks.error}`); return; }
        if (!toks.length) { E(`第 ${ln} 行:符號「${sym}」後面沒寫東西`); return; }
        const head = toks[0].text;
        if (OBJECT_TYPES.includes(head)) {
          const def = { kind: 'object', type: head, sym, line: ln, name: null, props: {}, on: null };
          for (const t of toks.slice(1)) {
            if (t.key === 'on') def.on = t.value;
            else if (t.key != null) def.props[t.key] = propValue(t);
            else if (t.quoted && def.name == null) def.name = t.text;
            else E(`第 ${ln} 行:「${t.text}」看不懂;物件的寫法是 類型 ["名字"] 屬性=值 … on=地形符號`);
          }
          symbols[sym] = def; order.push(sym);
        } else {
          const auto = head === 'auto';
          const rest = auto ? toks.slice(1) : toks;
          const def = { kind: auto ? 'auto' : 'terrain', sym, line: ln, ground: null, deco: null, blocked: false };
          let n = 0;
          for (const t of rest) {
            if (t.text === 'x') def.blocked = true;
            else if (TILE_RE.test(t.text) || (t.text === '-' && !auto && n === 0)) { if (n === 0) def.ground = t.text; else if (n === 1) def.deco = t.text; else E(`第 ${ln} 行:地形最多兩個圖塊(地面、裝飾)`); n++; }
            else E(`第 ${ln} 行:「${t.text}」看不懂;地形的寫法是 圖塊集:格號 [圖塊集:格號] [x],或 auto 圖塊集:格號 [x]`);
          }
          if (!def.ground) E(`第 ${ln} 行:符號「${sym}」要先寫地面是哪個圖塊,例如 tiny-town:0`);
          symbols[sym] = def; order.push(sym);
        }
      } else if ((m = /^\s*(\/\/|#)/.exec(line))) return;
      else if ((m = /^name:\s*(.*)$/.exec(line))) name = m[1].trim();
      else if ((m = /^tile:\s*(\d+)\s*$/.exec(line))) tile = +m[1];
      else if ((m = /^tileset:\s*(\S+)\s+(\S+)\s+(\S+)\s*$/.exec(line))) {
        const [, tname, image, spec] = m;
        if (tilesets.some((t) => t.name === tname)) { E(`第 ${ln} 行:圖塊集「${tname}」重複了`); return; }
        let cols = 0, rws = 0, count = 0, mm;
        if (image === '-') { if (!/^\d+$/.test(spec)) { E(`第 ${ln} 行:沒有圖的圖塊集要寫幾格,例如 tileset: vector - 10`); return; } count = +spec; }
        else if ((mm = /^(\d+)x(\d+)$/i.exec(spec))) { cols = +mm[1]; rws = +mm[2]; count = cols * rws; }
        else { E(`第 ${ln} 行:圖塊集最後要寫 欄x列(例如 12x11),表示圖片一列幾格、共幾列`); return; }
        if (count < 1) { E(`第 ${ln} 行:圖塊集「${tname}」至少要 1 格`); return; }
        tilesets.push({ name: tname, image: image === '-' ? null : image, columns: cols, rows: rws, tilecount: count });
      } else if (/^tileset:/.test(line)) E(`第 ${ln} 行:tileset 的寫法是 tileset: 名字 ../assets/圖.png 欄x列(沒圖就寫 tileset: 名字 - 幾格)`);
      else if (/^map:\s*$/.test(line)) section = 'map';
      else if (/^zones:\s*$/.test(line)) section = 'zones';
      else E(`第 ${ln} 行看不懂:「${line}」(這裡只能寫 name: / tile: / tileset: / 符號 = 定義 / map: / zones:)`);
    } else {
      if (/^zones:\s*$/.test(line)) { section = 'zones'; return; }
      if (/^map:\s*$/.test(line)) { section = 'map'; return; }
      if (/^\s*\/\//.test(line) || !line.length) return;
      (section === 'map' ? rows : zoneRows).push({ ln, text: line });
    }
  });

  // ── 檢查定義 ──
  let fg = 1;
  for (const ts of tilesets) { ts.firstgid = fg; fg += ts.tilecount; }
  const tsByName = Object.fromEntries(tilesets.map((t) => [t.name, t]));
  const gidOf = (ref, ln, what) => {
    if (ref === '-') return 0;
    const m = TILE_RE.exec(ref);
    const ts = tsByName[m[1]];
    if (!ts) { E(`第 ${ln} 行:${what}「${ref}」用到的圖塊集「${m[1]}」沒有用 tileset: 宣告`); return 0; }
    if (+m[2] >= ts.tilecount) { E(`第 ${ln} 行:${what}「${ref}」的格號超過了,圖塊集「${ts.name}」只有 0~${ts.tilecount - 1}`); return 0; }
    return ts.firstgid + +m[2];
  };
  if (!tilesets.length) E('至少要宣告一個圖塊集(tileset: 名字 ../assets/圖.png 欄x列)');
  if (!(tile > 0)) E('tile: 要是正整數(一格幾個像素,通常 16 或 32)');
  const terrainSyms = order.filter((s) => symbols[s].kind !== 'object');
  if (!terrainSyms.length) E('至少要定義一種地形,例如「. = tiny-town:0」');
  for (const sym of order) {
    const d = symbols[sym];
    if (d.kind === 'object') {
      if (d.on != null && (!symbols[d.on] || symbols[d.on].kind === 'object')) E(`第 ${d.line} 行:物件「${sym}」的 on=${d.on} 不是地形符號`);
      if (d.on == null) d.on = terrainSyms[0];
      continue;
    }
    d.groundGid = gidOf(d.ground, d.line, '地面'); d.decoGid = d.deco ? gidOf(d.deco, d.line, '裝飾') : 0;
    if (d.kind === 'auto') {
      const m = TILE_RE.exec(d.ground), ts = tsByName[m[1]];
      if (ts && !ts.columns) E(`第 ${d.line} 行:auto 要用有圖片的圖塊集(九宮格要知道一列幾格)`);
      else if (ts && (+m[2] % ts.columns > ts.columns - 3 || +m[2] + 2 * ts.columns + 2 >= ts.tilecount)) E(`第 ${d.line} 行:auto 的左上角格號 ${m[2]} 往右、往下還要各有 2 格(3×3 九宮格),圖塊集「${ts.name}」放不下`);
      d.columns = ts ? ts.columns : 1;
    }
  }
  if (!rows.length) E('沒有 map: 那一段(地圖一列一列畫在 map: 底下)');
  const w = rows.length ? Math.max(...rows.map((r) => r.text.length)) : 0, h = rows.length;
  for (const r of rows) if (r.text.length !== w) E(`第 ${r.ln} 行:這一列有 ${r.text.length} 格,別列是 ${w} 格,每一列要一樣寬`);
  if (zoneRows.length && zoneRows.length !== h) E(`zones: 有 ${zoneRows.length} 列,地圖是 ${h} 列,要一樣大`);
  for (const r of zoneRows) if (r.text.length > w) E(`第 ${r.ln} 行:zones 這一列比地圖寬(${r.text.length} > ${w})`);
  if (errors.length) return { tiled: null, errors, warnings };

  // ── 鋪格子 ──
  const T = tile, N = w * h;
  const eff = new Array(N);   // 每格「有效地形符號」(物件 / 遇敵區用 on 的那個)
  const marks = {};           // 遇敵區符號 → Set(格子索引)
  const objCells = [];        // { sym, x, y }
  rows.forEach((r, y) => {
    for (let x = 0; x < w; x++) {
      const ch = r.text[x], d = symbols[ch];
      if (!d) { E(`第 ${r.ln} 行第 ${x + 1} 格的「${ch}」沒有定義`); continue; }
      if (d.kind === 'object') {
        eff[y * w + x] = d.on;
        if (d.type === 'zone') (marks[ch] = marks[ch] || new Set()).add(y * w + x); else objCells.push({ sym: ch, x, y });
      } else eff[y * w + x] = ch;
    }
  });
  zoneRows.forEach((r, y) => {
    for (let x = 0; x < r.text.length; x++) {
      const ch = r.text[x];
      if (ch === '.' || ch === ' ') continue;
      const d = symbols[ch];
      if (!d || d.kind !== 'object' || d.type !== 'zone') { E(`第 ${r.ln} 行第 ${x + 1} 格:zones 裡只能放遇敵區的符號(「${ch}」不是)`); continue; }
      (marks[ch] = marks[ch] || new Set()).add(y * w + x);
    }
  });
  if (errors.length) return { tiled: null, errors, warnings };
  const ground = new Array(N).fill(0), deco = new Array(N).fill(0), collision = new Array(N).fill(0);
  const same = (x, y, sym) => (x < 0 || y < 0 || x >= w || y >= h) ? true : eff[y * w + x] === sym;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, sym = eff[i], d = symbols[sym];
    let g = d.groundGid;
    if (d.kind === 'auto') {
      const col = !same(x - 1, y, sym) ? 0 : !same(x + 1, y, sym) ? 2 : 1;
      const row = !same(x, y - 1, sym) ? 0 : !same(x, y + 1, sym) ? 2 : 1;
      g = d.groundGid + row * d.columns + col;
    }
    ground[i] = g; deco[i] = d.decoGid;
    if (d.blocked) collision[i] = d.decoGid || g || 1;
  }

  // ── 物件 ──
  const objects = [];
  const prop = (k, pv) => ({ name: k, type: pv.type, value: pv.value });
  const mkObj = (d, tx, ty, ow, oh) => ({ name: d.name != null ? d.name : defaultName(d.type, Object.fromEntries(Object.entries(d.props).map(([k, v]) => [k, v.value]))), type: d.type, x: tx * T, y: ty * T, width: ow * T, height: oh * T, rotation: 0, visible: true, point: false, properties: Object.entries(d.props).map(([k, v]) => prop(k, v)) });
  for (const c of objCells) objects.push(mkObj(symbols[c.sym], c.x, c.y, 1, 1));
  for (const [sym, set] of Object.entries(marks)) {
    let open = [];   // 上一列還沒封起來的矩形 { x0, w, y0, y1 }
    for (let y = 0; y < h; y++) {
      const runs = [];
      for (let x = 0; x < w; x++) {
        if (!set.has(y * w + x)) continue;
        const last = runs[runs.length - 1];
        if (last && last.x0 + last.w === x) last.w++; else runs.push({ x0: x, w: 1 });
      }
      const next = [];
      for (const r of runs) {
        const prev = open.find((o) => o.x0 === r.x0 && o.w === r.w && o.y1 === y - 1);
        if (prev) { prev.y1 = y; next.push(prev); } else { const o = { x0: r.x0, w: r.w, y0: y, y1: y }; objects.push(o.obj = mkObj(symbols[sym], o.x0, o.y0, o.w, 1)); next.push(o); }
      }
      for (const o of next) o.obj.height = (o.y1 - o.y0 + 1) * T;
      open = next;
    }
  }
  objects.sort((a, b) => a.y - b.y || a.x - b.x || a.type.localeCompare(b.type));
  const objsOut = objects.map((o, i) => ({ id: i + 1, ...o }));

  const tsOut = tilesets.map((t) => t.image
    ? { firstgid: t.firstgid, name: t.name, image: t.image, imagewidth: t.columns * T, imageheight: t.rows * T, tilewidth: T, tileheight: T, tilecount: t.tilecount, columns: t.columns, margin: 0, spacing: 0 }
    : { firstgid: t.firstgid, name: t.name, tilecount: t.tilecount, columns: 0, tilewidth: T, tileheight: T, margin: 0, spacing: 0 });
  const layer = (id, lname, data) => ({ id, name: lname, type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: w, height: h, data });
  const tiled = {
    compressionlevel: -1, height: h, infinite: false, orientation: 'orthogonal', renderorder: 'right-down', tiledversion: '1.11.0', type: 'map', version: '1.10', width: w, tilewidth: T, tileheight: T,
    nextlayerid: 5, nextobjectid: objsOut.length + 1,
    ...(name ? { properties: [{ name: 'name', type: 'string', value: name }] } : {}),
    tilesets: tsOut,
    layers: [layer(1, 'ground', ground), layer(2, 'deco', deco), layer(3, 'collision', collision), { id: 4, name: 'objects', type: 'objectgroup', visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown', objects: objsOut }],
  };
  return { tiled, errors, warnings };
}

/* ── Tiled → 文字 ── */
export function tiledToText(tiled, opts = {}) {
  const errors = [], E = (m) => errors.push(m);
  const w = tiled.width | 0, h = tiled.height | 0, T = tiled.tilewidth | 0;
  if (!(w > 0 && h > 0 && T > 0)) { E('這不是 Tiled 地圖(缺 width / height / tilewidth)'); return { text: '', errors }; }
  const layers = {}; const objects = [];
  for (const L of tiled.layers || []) {
    if (L.type === 'tilelayer') { if (L.encoding || L.compression) { E(`圖層「${L.name}」是壓縮格式,Tiled 匯出時 Tile Layer Format 要選 CSV`); continue; } layers[String(L.name).toLowerCase()] = L.data; }
    else if (L.type === 'objectgroup') objects.push(...(L.objects || []));
  }
  if (!layers.ground) E('缺少 ground 圖層');
  const tss = (tiled.tilesets || []).filter((t) => !t.source).map((t) => ({ ...t })).sort((a, b) => a.firstgid - b.firstgid);
  if (!tss.length) E('沒有嵌進地圖的圖塊集(Tiled 請用 Embed Tileset)');
  const seenNames = new Set();
  for (const t of tss) { if (!t.name) E(`firstgid ${t.firstgid} 的圖塊集沒有名字`); if (seenNames.has(t.name)) E(`有兩個圖塊集都叫「${t.name}」,文字版分不出來,請在 Tiled 改名`); seenNames.add(t.name); if (t.image && (t.margin || t.spacing)) E(`圖塊集「${t.name}」有 margin / spacing,文字版只支援無間距的圖`); }
  if (errors.length) return { text: '', errors };
  const refOf = (gid) => {
    const g = (gid & 0x1FFFFFFF) >>> 0;
    const t = tss.find((ts) => g >= ts.firstgid && g < ts.firstgid + ts.tilecount);
    if (!t) { E(`gid ${g} 不在任何圖塊集的範圍裡`); return '?'; }
    return `${t.name}:${g - t.firstgid}`;
  };
  const ground = layers.ground, deco = layers.deco || new Array(w * h).fill(0), col = layers.collision || new Array(w * h).fill(0);
  // 地形:每種(地面, 裝飾, 能不能走)組合一個符號,最常見的用「.」
  const combos = new Map();
  for (let i = 0; i < w * h; i++) { const k = `${ground[i]}|${deco[i]}|${col[i] ? 1 : 0}`; combos.set(k, (combos.get(k) || 0) + 1); }
  const terrainPool = [...SYMBOL_POOL_TERRAIN];
  const terrainSym = new Map();
  for (const [k] of [...combos.entries()].sort((a, b) => b[1] - a[1])) {
    if (!terrainPool.length) { E(`這張地圖有 ${combos.size} 種不同的格子,文字版的符號只有 ${SYMBOL_POOL_TERRAIN.length} 個,放不下`); break; }
    terrainSym.set(k, terrainPool.shift());
  }
  if (errors.length) return { text: '', errors };
  const symAt = (i) => terrainSym.get(`${ground[i]}|${deco[i]}|${col[i] ? 1 : 0}`);
  // 物件:一樣的定義共用一個字母;遇敵區畫在 zones: 那張
  const objPool = [...SYMBOL_POOL_OBJECT, ...terrainPool];
  const objDefs = new Map();   // key → { sym, line }
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => symAt(y * w + x)));
  const zgrid = Array.from({ length: h }, () => new Array(w).fill('.'));
  let hasZone = false;
  for (const o of objects) {
    const type = String(o.type || o.class || '').toLowerCase();
    const tx = Math.floor((o.x || 0) / T), ty = Math.floor(((o.y || 0) - (o.gid ? (o.height || T) : 0)) / T);
    const ow = Math.max(1, Math.round((o.width || 0) / T)), oh = Math.max(1, Math.round((o.height || 0) / T));
    const props = {};
    for (const p of (o.properties || [])) props[p.name] = { type: p.type || 'string', value: p.value };
    const propStr = Object.entries(props).map(([k, v]) => `${k}=${v.type === 'string' ? quoteIfNeeded(String(v.value)) : String(v.value)}`).join(' ');
    const label = o.name && o.name !== defaultName(type, Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.value]))) ? ` "${String(o.name).replace(/"/g, '')}"` : '';
    const key = `${type}${label} ${propStr}`;
    if (!OBJECT_TYPES.includes(type)) { E(`物件「${o.name || o.id}」的類型「${type || '(空白)'}」不認得(只能是 ${OBJECT_TYPES.join(' / ')})`); continue; }
    if (!objDefs.has(key)) {
      if (!objPool.length) { E('物件種類太多,字母用完了'); break; }
      objDefs.set(key, { sym: objPool.shift(), type, label, propStr });
    }
    const sym = objDefs.get(key).sym;
    if (type === 'zone') {
      hasZone = true;
      for (let y = ty; y < ty + oh; y++) for (let x = tx; x < tx + ow; x++) if (y >= 0 && y < h && x >= 0 && x < w) { if (zgrid[y][x] !== '.' && zgrid[y][x] !== sym) E(`格子 (${x},${y}) 有兩個不同的遇敵區疊在一起,文字版一格只能放一個`); zgrid[y][x] = sym; }
    } else {
      if (ow > 1 || oh > 1) E(`物件「${o.name || o.id}」佔了 ${ow}×${oh} 格,文字版的人物 / 道具 / 傳送點只能一格一格放`);
      if (ty < 0 || ty >= h || tx < 0 || tx >= w) { E(`物件「${o.name || o.id}」在地圖外面 (${tx},${ty})`); continue; }
      if (grid[ty][tx] !== symAt(ty * w + tx)) E(`格子 (${tx},${ty}) 有兩個物件疊在一起,文字版一格只能放一個`);
      objDefs.get(key).on = objDefs.get(key).on || new Set();
      objDefs.get(key).on.add(symAt(ty * w + tx));
      grid[ty][tx] = sym;
    }
  }
  if (errors.length) return { text: '', errors };
  // 同一種物件站在不同地形上 ⇒ 要拆成不同符號(on 不一樣)
  const lines = [];
  const src = opts.source ? basename(opts.source) : 'Tiled JSON';
  lines.push(`// 由 node scripts/ascii-map.mjs --dump 從 ${src} 轉出來的(符號是自動配的,可以自己改名)`);
  lines.push('// 改完轉回去:node scripts/ascii-map.mjs 這個檔.txt -o games/<卡帶>/maps/<名>.json');
  const nm = (tiled.properties || []).find((p) => p.name === 'name');
  if (nm) lines.push(`name: ${nm.value}`);
  lines.push(`tile: ${T}`);
  for (const t of tss) lines.push(t.image ? `tileset: ${t.name} ${String(t.image).replace(/\\/g, '/')} ${t.columns}x${Math.max(1, Math.round(t.tilecount / (t.columns || 1)))}` : `tileset: ${t.name} - ${t.tilecount}`);
  lines.push('');
  lines.push('// 地形:符號 = 地面 [裝飾] [x = 不能走](格號從 0 數,圖塊集:格號)');
  for (const [k, sym] of terrainSym) {
    const [g, d, b] = k.split('|').map(Number);
    lines.push(`${sym} = ${g ? refOf(g) : '-'}${d ? ' ' + refOf(d) : ''}${b ? ' x' : ''}`);
  }
  if (errors.length) return { text: '', errors };
  lines.push('');
  lines.push('// 物件:符號 = 類型 ["名字"] 屬性=值 … on=底下的地形符號(遇敵區畫在最下面的 zones:)');
  const extraDefs = [];
  for (const [, d] of objDefs) {
    const ons = d.on ? [...d.on] : [];
    if (ons.length <= 1) lines.push(`${d.sym} = ${d.type}${d.label}${d.propStr ? ' ' + d.propStr : ''}${ons.length ? ` on=${ons[0]}` : ''}`);
    else {
      // 第一種地形用原符號,其餘各配一個新符號並改寫格子
      lines.push(`${d.sym} = ${d.type}${d.label}${d.propStr ? ' ' + d.propStr : ''} on=${ons[0]}`);
      for (const on of ons.slice(1)) {
        if (!objPool.length) { E('物件種類太多,字母用完了'); break; }
        const s2 = objPool.shift();
        extraDefs.push(`${s2} = ${d.type}${d.label}${d.propStr ? ' ' + d.propStr : ''} on=${on}`);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (grid[y][x] === d.sym && symAt(y * w + x) === on) grid[y][x] = s2;
      }
    }
  }
  lines.push(...extraDefs);
  if (errors.length) return { text: '', errors };
  lines.push('');
  lines.push('map:');
  for (const r of grid) lines.push(r.join(''));
  if (hasZone) { lines.push(''); lines.push('zones:'); for (const r of zgrid) lines.push(r.join('')); }
  lines.push('');
  return { text: lines.join('\n'), errors };
}

// 存成 JSON:每個圖層的 data 一列一行,好看也好 diff
export function tiledToJson(tiled) {
  const w = tiled.width;
  return JSON.stringify(tiled, null, 2).replace(/"data": \[\s*([\d,\s]+?)\s*\]/g, (m, body) => {
    const nums = body.replace(/\s+/g, '').split(',');
    const rowsOut = [];
    for (let i = 0; i < nums.length; i += w) rowsOut.push('        ' + nums.slice(i, i + w).join(', '));
    return '"data": [\n' + rowsOut.join(',\n') + '\n      ]';
  }) + '\n';
}

/* ── CLI ── */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let out = null, dump = false; const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--dump') dump = true;
    else rest.push(argv[i]);
  }
  const src = rest[0];
  if (!src) {
    console.error('用法:node scripts/ascii-map.mjs 地圖.txt [-o games/<卡帶>/maps/<名>.json]');
    console.error('      node scripts/ascii-map.mjs --dump games/<卡帶>/maps/<名>.json [-o 地圖.txt]');
    process.exit(2);
  }
  let raw;
  try { raw = readFileSync(resolve(src), 'utf8'); } catch { console.error(`讀不到 ${src}`); process.exit(2); }
  if (dump) {
    let tiled;
    try { tiled = JSON.parse(raw); } catch (e) { console.error(`${src} 不是正確的 JSON(${e.message})`); process.exit(1); }
    const r = tiledToText(tiled, { source: src });
    if (r.errors.length) { console.error(`❌ 轉不出文字版:`); r.errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`)); process.exit(1); }
    if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(resolve(out), r.text); console.log(`✔ 已寫到 ${out}(${tiled.width}×${tiled.height})`); }
    else process.stdout.write(r.text);
  } else {
    const r = textToTiled(raw);
    if (r.errors.length) { console.error(`❌ ${r.errors.length} 個地方要修:`); r.errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`)); process.exit(1); }
    r.warnings.forEach((m) => console.error(`⚠ ${m}`));
    const json = tiledToJson(r.tiled);
    const objs = r.tiled.layers[3].objects.length;
    if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(resolve(out), json); console.log(`✔ 已寫到 ${out}(${r.tiled.width}×${r.tiled.height},${objs} 個物件);接著跑 node scripts/validate-game.mjs games/<卡帶> 檢查整張卡帶`); }
    else process.stdout.write(json);
  }
}
