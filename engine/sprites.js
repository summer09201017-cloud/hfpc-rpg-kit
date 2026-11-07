// 畫圖:圖塊、人物、怪物、道具、戰鬥背景。v1 全部用程式畫(零圖檔);地圖若帶圖片圖塊集就用圖片。
// 設計者換美術:① tiles.json 改顏色與 kind ② 之後在 Tiled 用真的圖塊集圖片(引擎會優先用圖片)。
import { imageTileFor } from './map.js';

export const TILE_KINDS = ['flat', 'grass', 'tallgrass', 'water', 'tree', 'wall', 'roof', 'floor', 'path', 'rock', 'cavefloor', 'cavewall', 'bed', 'door', 'cave', 'flower', 'fence', 'table'];

const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const shade = (hex, k) => { // k>0 變亮、<0 變暗
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16); const f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

export function loadTilesetImages(maps, base) {
  const out = {}; const jobs = [];
  for (const m of Object.values(maps)) for (const ts of m.tilesets) if (ts.image && !out[ts.image]) {
    jobs.push(new Promise((res) => { const im = new Image(); im.onload = () => { out[ts.image] = im; res(); }; im.onerror = () => res(); im.src = base + ts.image; }));
  }
  return Promise.all(jobs).then(() => out);
}

export function drawTile(ctx, entry, x, y, s, t, gx, gy, noBg = false) {
  if (!noBg) { ctx.fillStyle = entry.color; ctx.fillRect(x, y, s, s); }
  const dark = shade(entry.color, -0.25), light = shade(entry.color, 0.25);
  const k = entry.kind || 'flat';
  ctx.save();
  switch (k) {
    case 'grass': ctx.fillStyle = dark; for (let i = 0; i < 4; i++) { const r = hash(gx * 7 + i, gy * 13 + i); ctx.fillRect(x + r * s * 0.9, y + hash(gy + i, gx) * s * 0.9, s * 0.08, s * 0.08); } break;
    case 'tallgrass': ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, s * 0.06); for (let i = 0; i < 5; i++) { const bx = x + (0.1 + 0.2 * i) * s, sway = Math.sin(t * 2 + gx + i) * s * 0.05; ctx.beginPath(); ctx.moveTo(bx, y + s); ctx.lineTo(bx + sway, y + s * 0.35); ctx.stroke(); } break;
    case 'water': ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, s * 0.05); for (let i = 0; i < 2; i++) { const wy = y + s * (0.3 + 0.4 * i) + Math.sin(t * 1.5 + gx + i) * s * 0.06; ctx.beginPath(); ctx.moveTo(x + s * 0.15, wy); ctx.quadraticCurveTo(x + s * 0.5, wy - s * 0.12, x + s * 0.85, wy); ctx.stroke(); } break;
    case 'tree': ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + s * 0.42, y + s * 0.55, s * 0.16, s * 0.4); ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.42, s * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x + s * 0.4, y + s * 0.33, s * 0.16, 0, Math.PI * 2); ctx.fill(); break;
    case 'wall': ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, s * 0.05); for (let i = 0; i < 3; i++) { const wy = y + s * (0.33 * i + 0.165); ctx.beginPath(); ctx.moveTo(x, wy); ctx.lineTo(x + s, wy); ctx.stroke(); const off = i % 2 ? s * 0.5 : 0; ctx.beginPath(); ctx.moveTo(x + off, wy); ctx.lineTo(x + off, wy + s * 0.33); ctx.stroke(); } break;
    case 'cavewall': ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath(); ctx.moveTo(x + s * 0.2, y); ctx.lineTo(x + s * 0.45, y + s * 0.5); ctx.lineTo(x + s * 0.3, y + s); ctx.stroke(); ctx.fillStyle = light; ctx.fillRect(x + s * 0.6, y + s * 0.2, s * 0.15, s * 0.15); break;
    case 'roof': ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, s * 0.06); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y + s * (0.2 + 0.3 * i)); ctx.lineTo(x + s, y + s * (0.2 + 0.3 * i)); ctx.stroke(); } break;
    case 'floor': ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, s * 0.04); for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y + s * i / 3); ctx.lineTo(x + s, y + s * i / 3); ctx.stroke(); } break;
    case 'path': ctx.fillStyle = light; for (let i = 0; i < 3; i++) ctx.fillRect(x + hash(gx + i, gy * 3) * s * 0.85, y + hash(gy * 5 + i, gx) * s * 0.85, s * 0.12, s * 0.08); break;
    case 'rock': ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(x + s * 0.15, y + s * 0.85); ctx.lineTo(x + s * 0.3, y + s * 0.3); ctx.lineTo(x + s * 0.6, y + s * 0.2); ctx.lineTo(x + s * 0.88, y + s * 0.6); ctx.lineTo(x + s * 0.8, y + s * 0.88); ctx.closePath(); ctx.fill(); ctx.fillStyle = light; ctx.fillRect(x + s * 0.4, y + s * 0.35, s * 0.15, s * 0.1); break;
    case 'cavefloor': ctx.fillStyle = dark; for (let i = 0; i < 3; i++) ctx.fillRect(x + hash(gx * 3 + i, gy) * s * 0.9, y + hash(gy * 7, gx + i) * s * 0.9, s * 0.1, s * 0.06); break;
    case 'bed': ctx.fillStyle = '#e9e4d6'; rr(ctx, x + s * 0.12, y + s * 0.1, s * 0.76, s * 0.8, s * 0.1); ctx.fill(); ctx.fillStyle = '#d9534f'; rr(ctx, x + s * 0.12, y + s * 0.4, s * 0.76, s * 0.5, s * 0.08); ctx.fill(); ctx.fillStyle = '#fff'; rr(ctx, x + s * 0.22, y + s * 0.16, s * 0.56, s * 0.18, s * 0.06); ctx.fill(); break;
    case 'door': ctx.fillStyle = '#6b4a2b'; rr(ctx, x + s * 0.25, y + s * 0.15, s * 0.5, s * 0.85, s * 0.12); ctx.fill(); ctx.fillStyle = '#f0c040'; ctx.fillRect(x + s * 0.6, y + s * 0.55, s * 0.08, s * 0.08); break;
    case 'cave': ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + s * 0.5, y + s * 0.6, s * 0.38, Math.PI, 0); ctx.lineTo(x + s * 0.88, y + s); ctx.lineTo(x + s * 0.12, y + s); ctx.closePath(); ctx.fill(); break;
    case 'flower': for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#f06292', '#ffd54f', '#fff'][i]; ctx.beginPath(); ctx.arc(x + s * (0.25 + 0.25 * i), y + s * (0.3 + 0.2 * (i % 2)), s * 0.08, 0, Math.PI * 2); ctx.fill(); } break;
    case 'fence': ctx.fillStyle = '#8d6e4c'; ctx.fillRect(x, y + s * 0.4, s, s * 0.1); ctx.fillRect(x, y + s * 0.65, s, s * 0.1); ctx.fillRect(x + s * 0.2, y + s * 0.25, s * 0.12, s * 0.6); ctx.fillRect(x + s * 0.68, y + s * 0.25, s * 0.12, s * 0.6); break;
    case 'table': ctx.fillStyle = '#8d6e4c'; rr(ctx, x + s * 0.1, y + s * 0.25, s * 0.8, s * 0.5, s * 0.08); ctx.fill(); break;
    default: break;
  }
  ctx.restore();
}

// cam = { x, y, w, h }(畫面座標,已乘 zoom)
export function drawMap(ctx, map, palette, images, cam, zoom, t) {
  const s = map.tw * zoom;
  const x0 = Math.max(0, Math.floor(cam.x / s)), y0 = Math.max(0, Math.floor(cam.y / s));
  const x1 = Math.min(map.w - 1, Math.ceil((cam.x + cam.w) / s)), y1 = Math.min(map.h - 1, Math.ceil((cam.y + cam.h) / s));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * map.w + x, px = Math.round(x * s - cam.x), py = Math.round(y * s - cam.y);
    for (const layer of [map.ground, map.deco]) {
      if (!layer) continue;
      const gid = layer[i]; if (!gid) continue;
      const img = imageTileFor(map, gid);
      if (img && images[img.tileset.image]) {
        const ts = img.tileset, cols = ts.columns || Math.max(1, Math.floor(images[ts.image].width / ts.tilewidth));
        ctx.drawImage(images[ts.image], (img.local % cols) * ts.tilewidth, Math.floor(img.local / cols) * ts.tileheight, ts.tilewidth, ts.tileheight, px, py, s + 0.5, s + 0.5);
      } else {
        const entry = palette[gid] || { color: '#f0f', kind: 'flat' };
        if (layer === map.deco && (entry.kind === 'flat')) { ctx.fillStyle = entry.color; ctx.fillRect(px, py, s + 0.5, s + 0.5); }
        else if (layer === map.deco) { drawDecoOnly(ctx, entry, px, py, s + 0.5, t, x, y); }
        else drawTile(ctx, entry, px, py, s + 0.5, t, x, y);
      }
    }
  }
}
// deco 圖層不鋪底色(讓地面透出來),只畫上面的東西;純色塊類(牆、屋頂、水…)才連底色一起畫
function drawDecoOnly(ctx, entry, x, y, s, t, gx, gy) {
  const overlay = ['tree', 'rock', 'flower', 'fence', 'bed', 'door', 'cave', 'table'].includes(entry.kind);
  drawTile(ctx, entry, x, y, s, t, gx, gy, overlay);
}

// 人物:圓頭圓身、有臉。look = { color(衣服), hair, skin }
export function drawChar(ctx, look, px, py, s, dir = 'down', frame = 0) {
  const shirt = look.color || '#3f7fd6', hair = look.hair || '#4a3020', skin = look.skin || '#f6d3b3';
  const cx = px + s / 2, bob = frame ? Math.sin(frame * Math.PI) * s * 0.03 : 0;
  ctx.save();
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, py + s * 0.93, s * 0.26, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  // 腳
  ctx.fillStyle = shade(shirt, -0.4);
  const legOff = frame ? Math.sin(frame * Math.PI * 2) * s * 0.06 : 0;
  ctx.fillRect(cx - s * 0.2, py + s * 0.72 + legOff, s * 0.14, s * 0.18); ctx.fillRect(cx + s * 0.06, py + s * 0.72 - legOff, s * 0.14, s * 0.18);
  // 身體
  ctx.fillStyle = shirt; rr(ctx, cx - s * 0.26, py + s * 0.42 - bob, s * 0.52, s * 0.38, s * 0.12); ctx.fill();
  // 頭
  const hy = py + s * 0.3 - bob;
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(cx, hy, s * 0.26, 0, Math.PI * 2); ctx.fill();
  // 頭髮(帽狀)
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(cx, hy - s * 0.04, s * 0.27, Math.PI, 0); ctx.fill();
  if (dir === 'up') { ctx.beginPath(); ctx.arc(cx, hy, s * 0.26, 0, Math.PI); ctx.fill(); }
  // 臉(背面沒有臉)
  if (dir !== 'up') {
    const ex = dir === 'left' ? -s * 0.1 : dir === 'right' ? s * 0.1 : 0;
    ctx.fillStyle = '#222';
    if (dir === 'down') { ctx.beginPath(); ctx.arc(cx - s * 0.09, hy + s * 0.02, s * 0.035, 0, Math.PI * 2); ctx.arc(cx + s * 0.09, hy + s * 0.02, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(cx + ex, hy + s * 0.02, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#a0522d'; ctx.lineWidth = Math.max(1, s * 0.025); ctx.beginPath(); ctx.arc(cx + ex * 0.6, hy + s * 0.08, s * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,120,0.35)'; ctx.beginPath(); ctx.arc(cx - s * 0.15 + ex, hy + s * 0.08, s * 0.04, 0, Math.PI * 2); ctx.arc(cx + s * 0.15 + ex, hy + s * 0.08, s * 0.04, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// 怪物:都有臉(眼睛、嘴)。sprite = { shape, color }
export function drawEnemy(ctx, sprite, cx, cy, size, t, hurt = false) {
  const c = sprite.color || '#888', dark = shade(c, -0.3), light = shade(c, 0.3);
  const bob = Math.sin(t * 3) * size * 0.03;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + size * 0.48, size * 0.42, size * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  const eye = (x, y, r = size * 0.06) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const mouth = (x, y, w, angry) => { ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, size * 0.03); ctx.beginPath(); if (angry) { ctx.moveTo(x - w, y + w * 0.3); ctx.lineTo(x, y); ctx.lineTo(x + w, y + w * 0.3); } else ctx.arc(x, y, w, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); };
  switch (sprite.shape) {
    case 'wolf': {
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx + size * 0.05, cy + size * 0.15 + bob, size * 0.42, size * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; for (const lx of [-0.25, -0.05, 0.2, 0.38]) ctx.fillRect(cx + lx * size, cy + size * 0.28, size * 0.09, size * 0.2);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx - size * 0.3, cy - size * 0.05 + bob, size * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - size * 0.45, cy - size * 0.18 + bob); ctx.lineTo(cx - size * 0.4, cy - size * 0.4 + bob); ctx.lineTo(cx - size * 0.28, cy - size * 0.22 + bob); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - size * 0.22, cy - size * 0.2 + bob); ctx.lineTo(cx - size * 0.12, cy - size * 0.4 + bob); ctx.lineTo(cx - size * 0.1, cy - size * 0.18 + bob); ctx.fill();
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(cx - size * 0.42, cy + size * 0.04 + bob, size * 0.12, size * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx - size * 0.5, cy + size * 0.02 + bob, size * 0.035, 0, Math.PI * 2); ctx.fill();
      eye(cx - size * 0.3, cy - size * 0.1 + bob, size * 0.04); mouth(cx - size * 0.36, cy + size * 0.1 + bob, size * 0.06, true);
      break;
    }
    case 'skeleton': {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy - size * 0.22 + bob, size * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - size * 0.12, cy - size * 0.06 + bob, size * 0.24, size * 0.12);
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.beginPath(); ctx.moveTo(cx, cy + bob); ctx.lineTo(cx, cy + size * 0.3 + bob); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - size * 0.18, cy + size * (0.06 + i * 0.09) + bob); ctx.lineTo(cx + size * 0.18, cy + size * (0.06 + i * 0.09) + bob); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - size * 0.2, cy + size * 0.05 + bob); ctx.lineTo(cx - size * 0.4, cy + size * 0.25 + bob); ctx.moveTo(cx + size * 0.2, cy + size * 0.05 + bob); ctx.lineTo(cx + size * 0.4, cy - size * 0.1 + bob); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - size * 0.08, cy + size * 0.3); ctx.lineTo(cx - size * 0.12, cy + size * 0.48); ctx.moveTo(cx + size * 0.08, cy + size * 0.3); ctx.lineTo(cx + size * 0.12, cy + size * 0.48); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx - size * 0.07, cy - size * 0.25 + bob, size * 0.05, 0, Math.PI * 2); ctx.arc(cx + size * 0.07, cy - size * 0.25 + bob, size * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.arc(cx - size * 0.07, cy - size * 0.25 + bob, size * 0.02, 0, Math.PI * 2); ctx.arc(cx + size * 0.07, cy - size * 0.25 + bob, size * 0.02, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - size * 0.08, cy - size * 0.1 + bob); ctx.lineTo(cx + size * 0.08, cy - size * 0.1 + bob); ctx.stroke();
      break;
    }
    case 'spider': {
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, size * 0.04);
      for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.45, wig = Math.sin(t * 6 + i) * size * 0.03; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sgn * size * 0.15, cy + bob); ctx.lineTo(cx + sgn * (size * 0.42 + wig), cy - size * 0.1 + a * size * 0.3 + bob); ctx.lineTo(cx + sgn * (size * 0.5), cy + size * 0.25 + a * size * 0.25); ctx.stroke(); } }
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx + size * 0.12, cy + size * 0.05 + bob, size * 0.3, size * 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(cx + size * 0.12, cy + size * 0.05 + bob, size * 0.12, size * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx - size * 0.22, cy + size * 0.02 + bob, size * 0.17, 0, Math.PI * 2); ctx.fill();
      for (const [ex, ey, r] of [[-0.3, -0.04, 0.045], [-0.17, -0.04, 0.045], [-0.33, 0.06, 0.03], [-0.13, 0.06, 0.03]]) { ctx.fillStyle = '#f33'; ctx.beginPath(); ctx.arc(cx + ex * size, cy + ey * size + bob, r * size, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx + ex * size, cy + ey * size + bob, r * size * 0.5, 0, Math.PI * 2); ctx.fill(); }
      mouth(cx - size * 0.22, cy + size * 0.12 + bob, size * 0.05, true);
      break;
    }
    case 'bat': {
      const flap = Math.sin(t * 10) * size * 0.15;
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx - size * 0.1, cy + bob); ctx.lineTo(cx - size * 0.48, cy - size * 0.2 + flap + bob); ctx.lineTo(cx - size * 0.3, cy + size * 0.12 + bob); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + size * 0.1, cy + bob); ctx.lineTo(cx + size * 0.48, cy - size * 0.2 + flap + bob); ctx.lineTo(cx + size * 0.3, cy + size * 0.12 + bob); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy + bob, size * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - size * 0.15, cy - size * 0.1 + bob); ctx.lineTo(cx - size * 0.12, cy - size * 0.28 + bob); ctx.lineTo(cx - size * 0.03, cy - size * 0.14 + bob); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + size * 0.15, cy - size * 0.1 + bob); ctx.lineTo(cx + size * 0.12, cy - size * 0.28 + bob); ctx.lineTo(cx + size * 0.03, cy - size * 0.14 + bob); ctx.fill();
      eye(cx - size * 0.07, cy - size * 0.02 + bob, size * 0.035); eye(cx + size * 0.07, cy - size * 0.02 + bob, size * 0.035); mouth(cx, cy + size * 0.07 + bob, size * 0.05, true);
      break;
    }
    case 'ghost': {
      ctx.fillStyle = c; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(cx, cy - size * 0.1 + bob, size * 0.28, Math.PI, 0); ctx.lineTo(cx + size * 0.28, cy + size * 0.3 + bob);
      for (let i = 0; i < 4; i++) ctx.lineTo(cx + size * 0.28 - size * 0.14 * (i + 0.5), cy + size * (0.3 + (i % 2 ? 0 : 0.08)) + bob);
      ctx.lineTo(cx - size * 0.28, cy + size * 0.3 + bob); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      eye(cx - size * 0.1, cy - size * 0.08 + bob, size * 0.045); eye(cx + size * 0.1, cy - size * 0.08 + bob, size * 0.045); mouth(cx, cy + size * 0.06 + bob, size * 0.06, false);
      break;
    }
    default: { // blob
      const sq = 1 + Math.sin(t * 3) * 0.04;
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy + size * 0.1, size * 0.4 * sq, size * 0.34 / sq, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(cx - size * 0.15, cy - size * 0.08, size * 0.1, size * 0.06, -0.5, 0, Math.PI * 2); ctx.fill();
      eye(cx - size * 0.13, cy + size * 0.02, size * 0.05); eye(cx + size * 0.13, cy + size * 0.02, size * 0.05); mouth(cx, cy + size * 0.14, size * 0.08, false);
      ctx.fillStyle = 'rgba(255,120,120,0.4)'; ctx.beginPath(); ctx.arc(cx - size * 0.24, cy + size * 0.12, size * 0.05, 0, Math.PI * 2); ctx.arc(cx + size * 0.24, cy + size * 0.12, size * 0.05, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (hurt) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(cx - size * 0.6, cy - size * 0.6, size * 1.2, size * 1.2); }
  ctx.restore();
}

// 地上的道具:草藥=葉子、藥水=瓶子、鑰匙=金色
export function drawItem(ctx, def, px, py, s, t) {
  const cx = px + s / 2, cy = py + s * 0.55 + Math.sin(t * 2 + px) * s * 0.04;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.26 + Math.sin(t * 4) * s * 0.03, 0, Math.PI * 2); ctx.fill();
  if (def && def.type === 'heal') { ctx.fillStyle = '#d9534f'; rr(ctx, cx - s * 0.1, cy - s * 0.12, s * 0.2, s * 0.26, s * 0.05); ctx.fill(); ctx.fillStyle = '#eee'; ctx.fillRect(cx - s * 0.05, cy - s * 0.2, s * 0.1, s * 0.08); }
  else if (def && def.type === 'key') { ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(cx - s * 0.06, cy - s * 0.04, s * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx, cy - s * 0.02, s * 0.18, s * 0.05); }
  else { ctx.fillStyle = '#3c9d3c'; ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.18, s * 0.1, -0.7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1e5e1e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - s * 0.12, cy + s * 0.1); ctx.lineTo(cx + s * 0.12, cy - s * 0.1); ctx.stroke(); }
  ctx.restore();
}

// 戰鬥畫面:背景 + 一排怪 + 血條
export function drawBattleScene(ctx, W, H, enemies, t, hurtIdx, theme = 'field') {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (theme === 'cave') { sky.addColorStop(0, '#1b1b2a'); sky.addColorStop(1, '#3a3a4a'); }
  else { sky.addColorStop(0, '#79b8ff'); sky.addColorStop(0.45, '#cfe8ff'); sky.addColorStop(0.45, '#5a9e4b'); sky.addColorStop(1, '#3f7a35'); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // 怪物放在畫面上半(下半被指令區蓋住);血條畫在怪物頭上
  const n = enemies.length, size = Math.min(W / (n + 1) * 0.9, H * 0.3);
  enemies.forEach((e, i) => {
    const cx = W * (i + 1) / (n + 1), cy = H * 0.36;
    if (e.hp <= 0) { ctx.save(); ctx.globalAlpha = 0.25; drawEnemy(ctx, e.sprite, cx, cy, size, 0, false); ctx.restore(); return; }
    drawEnemy(ctx, e.sprite, cx, cy, size, t, hurtIdx === i);
    const bw = size * 0.9, bx = cx - bw / 2, by = cy - size * 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, bx - 4, by - 4, bw + 8, 22, 6); ctx.fill();
    ctx.fillStyle = '#444'; ctx.fillRect(bx, by, bw, 8);
    ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#4caf50' : '#ff9800'; ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 8);
    ctx.fillStyle = '#fff'; ctx.font = `${Math.max(12, size * 0.11)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(`${e.label} ${e.hp}/${e.maxHp}`, cx, by + 18 + Math.max(0, size * 0.11 - 12) / 2);
  });
}
