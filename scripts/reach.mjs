#!/usr/bin/env node
// 可達性檢查:從起點出發,照遊戲機的規則(collision、人物與床的格子不能走、傳送點會跳到另一張地圖)
// 一格一格走遍,回報每個人物 / 床 / 道具 / 傳送點 / 遇敵區 / 倒下後醒來的地方「走不走得到」。
// 用法:node scripts/reach.mjs games/<卡帶>   走不到的列 🔴 並退出碼 1;全部走得到印 ✅
// 條件(showIf / hideIf)一律當作看得見,只標「有條件」;傳送點當作可以穿過去。
// 純邏輯零相依;checkReach() 匯出給測試用。
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGameDir } from './lib/load-fs.mjs';
import { validateGame } from '../engine/schema.js';
import { tileBlocked, inBounds } from '../engine/map.js';

const TYPE_LABEL = { npc: '人物', heal: '休息點', item: '道具', portal: '傳送點', zone: '遇敵區' };
const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// data = loadGameDir 的結果(要先過 validateGame);maps = validateGame 回的 maps
export function checkReach(data, maps) {
  const g = data.game;
  const solid = {}, reached = {};
  for (const [id, m] of Object.entries(maps)) {
    const s = new Uint8Array(m.w * m.h);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (tileBlocked(m, x, y)) s[y * m.w + x] = 1;
    for (const o of m.objects) if (o.type === 'npc' || o.type === 'heal') for (let y = o.ty; y < o.ty + o.h; y++) for (let x = o.tx; x < o.tx + o.w; x++) if (inBounds(m, x, y)) s[y * m.w + x] = 1;
    solid[id] = s; reached[id] = new Uint8Array(m.w * m.h);
  }
  const walkable = (id, x, y) => maps[id] && inBounds(maps[id], x, y) && !solid[id][y * maps[id].w + x];
  // BFS(傳送點 = 跨地圖的邊)
  const queue = [];
  const push = (id, x, y) => { if (!walkable(id, x, y) || reached[id][y * maps[id].w + x]) return; reached[id][y * maps[id].w + x] = 1; queue.push([id, x, y]); };
  push(g.start.map, g.start.x, g.start.y);
  while (queue.length) {
    const [id, x, y] = queue.shift();
    const m = maps[id];
    for (const o of m.objects) if (o.type === 'portal' && x >= o.tx && x < o.tx + o.w && y >= o.ty && y < o.ty + o.h) push(o.props.map, o.props.x | 0, o.props.y | 0);
    for (const [dx, dy] of NEAR) push(id, x + dx, y + dy);
  }
  const hit = (id, x, y) => !!(maps[id] && inBounds(maps[id], x, y) && reached[id][y * maps[id].w + x]);
  const out = { start: { ...g.start }, maps: {}, objects: [], defeat: null, ok: true };
  for (const [id, m] of Object.entries(maps)) {
    let walk = 0, got = 0;
    for (let i = 0; i < m.w * m.h; i++) { if (!solid[id][i]) walk++; if (reached[id][i]) got++; }
    out.maps[id] = { name: m.name, walkable: walk, reached: got };
    for (const o of m.objects) {
      const cells = [];
      for (let y = o.ty; y < o.ty + o.h; y++) for (let x = o.tx; x < o.tx + o.w; x++) cells.push([x, y]);
      let ok, detail = '';
      if (o.type === 'npc' || o.type === 'heal') {
        ok = cells.some(([x, y]) => NEAR.some(([dx, dy]) => hit(id, x + dx, y + dy)));
        if (!ok) detail = '四周沒有一格走得到(被 collision、樹、牆或別的人擋住了)';
      } else if (o.type === 'zone') {
        const n = cells.filter(([x, y]) => hit(id, x, y)).length;
        ok = n > 0; detail = ok ? `${n}/${cells.length} 格走得到` : '整塊都走不到,永遠不會遇敵';
      } else {
        ok = cells.some(([x, y]) => hit(id, x, y));
        if (!ok) detail = o.type === 'portal' ? '走不到這一格,後面那張地圖也就進不去' : '走不到這一格,撿不到';
      }
      const cond = ['showIf', 'hideIf'].filter((k) => o.props[k] != null);
      out.objects.push({ map: id, mapName: m.name, type: o.type, name: o.name || o.props.name || (o.type === 'item' ? String(o.props.item || '') : o.type), tx: o.tx, ty: o.ty, w: o.w, h: o.h, ok, cond, detail });
      if (!ok) out.ok = false;
    }
  }
  if (g.defeat) {
    const ok = hit(g.defeat.map, g.defeat.x, g.defeat.y);
    out.defeat = { map: g.defeat.map, x: g.defeat.x, y: g.defeat.y, ok };
    if (!ok) out.ok = false;
  }
  return out;
}

export function formatReach(r, data) {
  const L = [];
  const title = data && data.game ? `《${data.game.title}》` : '';
  L.push(`🧭 走不走得到:${title}從 ${(r.maps[r.start.map] || {}).name || r.start.map} (${r.start.x},${r.start.y}) 出發`);
  for (const [id, m] of Object.entries(r.maps)) {
    const pct = m.walkable ? Math.round((m.reached / m.walkable) * 100) : 0;
    L.push(`   地圖 ${m.name}(${id}):能走的 ${m.walkable} 格裡走得到 ${m.reached} 格(${pct}%)${m.reached === 0 ? ' 🔴 整張地圖進不去' : ''}`);
    if (m.reached === 0) r.ok = false;
  }
  for (const o of r.objects) {
    const where = `${TYPE_LABEL[o.type] || o.type}「${o.name}」${o.mapName} (${o.tx},${o.ty})${o.w > 1 || o.h > 1 ? ` ${o.w}×${o.h}` : ''}`;
    const cond = o.cond.length ? `(有條件:${o.cond.join('、')})` : '';
    L.push(`   ${o.ok ? '✅' : '🔴'} ${where}${cond}${o.detail ? `:${o.detail}` : ''}`);
  }
  if (r.defeat) L.push(`   ${r.defeat.ok ? '✅' : '🔴'} 倒下後醒來的地方 ${(r.maps[r.defeat.map] || {}).name || r.defeat.map} (${r.defeat.x},${r.defeat.y})${r.defeat.ok ? '' : ':走不到(玩家倒下後會被關在那裡)'}`);
  const bad = r.objects.filter((o) => !o.ok).length + (r.defeat && !r.defeat.ok ? 1 : 0);
  L.push(r.ok ? '✅ 全部走得到' : `🔴 有 ${bad} 個地方走不到,玩家會卡關`);
  return L.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (!arg) { console.error('用法:node scripts/reach.mjs games/<卡帶名>'); process.exit(2); }
  const dir = resolve(arg);
  if (!existsSync(dir)) { console.error(`找不到卡帶資料夾 ${arg}`); process.exit(2); }
  const data = loadGameDir(dir);
  const v = data.loadErrors.length ? { errors: data.loadErrors } : validateGame(data);
  if (v.errors.length) {
    console.error(`❌ 卡帶有 ${v.errors.length} 個錯誤,先修好再檢查:`);
    v.errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    process.exit(1);
  }
  const r = checkReach(data, v.maps);
  console.log(formatReach(r, data));
  process.exitCode = r.ok ? 0 : 1;
}
