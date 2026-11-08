// 地圖:讀 Tiled 匯出的 JSON(Tile Layer Format 要選 CSV、圖塊集要 Embed),整理成引擎用的格式。
// 純函式、不碰 DOM,所以 scripts/validate-game.mjs 跟瀏覽器用的是同一支。
//
// 圖塊圖層的名字只認三個:ground(地面,必要)/ deco(裝飾,畫在地面上)/ collision(有東西的格子=不能走)。
// 物件圖層(objectgroup)裡每個物件的 Type/Class 決定它是什麼:
//   npc    會講話的人:屬性 dialogue=對話 id(必要)、name=顯示名、color=衣服顏色
//   portal 傳送點:屬性 map=目標地圖、x、y=目標格子、dir=到達面向(選填)
//   item   地上的道具:屬性 item=道具 id、qty=數量(預設 1);撿過一次就不會再出現
//   zone   遇敵區(用矩形畫):屬性 encounter=遭遇表 id
//   heal   休息點(床):走到前面按確認 ⇒ 體力魔力全滿並存檔
//   任何物件都可加 showIf / hideIf(條件字串,見 cond.js),例如 hideIf = flag:boss_down
const GID_MASK = 0x1FFFFFFF; // Tiled 把翻轉旗標塞在 gid 的高位元,要遮掉

export const LAYER_NAMES = ['ground', 'deco', 'collision'];
export const OBJECT_TYPES = ['npc', 'portal', 'item', 'zone', 'heal'];

// Tiled 的 properties 是 [{name,type,value}] 陣列;也容忍直接給物件
export function tiledProps(obj) {
  const out = {};
  const p = obj && obj.properties;
  if (Array.isArray(p)) {
    for (const it of p) if (it && it.name) out[it.name] = it.value;
  } else if (p && typeof p === 'object') {
    Object.assign(out, p);
  }
  return out;
}

// 回傳 { map, errors }:errors 是白話中文,給設計者看;有錯 map 就是 null
export function parseTiled(id, tiled) {
  const errors = [];
  const E = (m) => errors.push(`地圖 ${id}:${m}`);
  if (!tiled || typeof tiled !== 'object' || Array.isArray(tiled)) { E('不是 Tiled 匯出的 JSON 物件'); return { map: null, errors }; }
  const w = tiled.width | 0, h = tiled.height | 0, tw = tiled.tilewidth | 0, th = tiled.tileheight | 0;
  if (!(w > 0 && h > 0)) E('width / height 要是正整數');
  if (!(tw > 0 && th > 0)) E('tilewidth / tileheight 要是正整數');
  const layers = { ground: null, deco: null, collision: null };
  const objects = [];
  for (const L of tiled.layers || []) {
    const lname = String(L.name || '');
    if (L.type === 'tilelayer') {
      if (L.encoding || L.compression) { E(`圖層「${lname}」是壓縮格式;Tiled 的 Tile Layer Format 請設成 CSV 再匯出`); continue; }
      if (!Array.isArray(L.data) || L.data.length !== w * h) { E(`圖層「${lname}」的格子數 ${Array.isArray(L.data) ? L.data.length : 0} 不等於 ${w}×${h}=${w * h}`); continue; }
      const key = lname.toLowerCase();
      if (!LAYER_NAMES.includes(key)) { E(`圖塊圖層「${lname}」不認得;圖塊圖層只能叫 ground / deco / collision`); continue; }
      layers[key] = L.data.map((g) => (g & GID_MASK) >>> 0);
    } else if (L.type === 'objectgroup') {
      for (const o of L.objects || []) {
        const type = String(o.type || o.class || '').toLowerCase();
        const props = tiledProps(o);
        const ow = Math.max(1, Math.round((o.width || 0) / (tw || 1)));
        const oh = Math.max(1, Math.round((o.height || 0) / (th || 1)));
        const tx = Math.floor((o.x || 0) / (tw || 1));
        // 帶 gid 的「圖塊物件」Tiled 以左下角當 y;其他物件以左上角
        const ty = Math.floor(((o.y || 0) - (o.gid ? (o.height || th) : 0)) / (th || 1));
        objects.push({ id: o.id, name: o.name || '', type, tx, ty, w: ow, h: oh, props, layer: lname });
      }
    } else {
      E(`圖層「${lname}」的類型 ${L.type} 不支援(只支援 tilelayer / objectgroup)`);
    }
  }
  if (!layers.ground) E('缺少 ground 圖層(地面)');
  const tilesets = [];
  for (const ts of tiled.tilesets || []) {
    if (ts.source) { E(`圖塊集 ${ts.source} 是外部檔案;Tiled 請用 Embed Tileset 把它嵌進地圖`); continue; }
    tilesets.push({ firstgid: ts.firstgid | 0, name: ts.name || '', image: ts.image || null, tilecount: ts.tilecount | 0, columns: ts.columns | 0, tilewidth: ts.tilewidth | 0, tileheight: ts.tileheight | 0 });
  }
  const used = new Set();
  for (const k of ['ground', 'deco']) if (layers[k]) for (const g of layers[k]) if (g) used.add(g);
  if (errors.length) return { map: null, errors };
  const map = { id, w, h, tw, th, name: tiledProps(tiled).name || id, ground: layers.ground, deco: layers.deco, collision: layers.collision, objects, tilesets, usedGids: used };
  return { map, errors };
}

export function inBounds(map, x, y) { return x >= 0 && y >= 0 && x < map.w && y < map.h; }

export function tileBlocked(map, x, y) {
  if (!inBounds(map, x, y)) return true;
  return !!(map.collision && map.collision[y * map.w + x]);
}

export function objectsAt(map, x, y, filter) {
  return map.objects.filter((o) => x >= o.tx && x < o.tx + o.w && y >= o.ty && y < o.ty + o.h && (!filter || filter(o)));
}

// Tiled 把圖塊集的 image 寫成「相對於地圖檔所在資料夾」的路徑(例如地圖在 maps/village.json、圖在 assets/x.png
// 就寫 ../assets/x.png)。這裡把它換算成相對於卡帶資料夾的路徑;反斜線也容忍。網址(http...)或 / 開頭的照原樣回傳。
export function resolveMapPath(mapFile, rel) {
  const r = String(rel || '').replace(/\\/g, '/');
  if (/^([a-z]+:)?\/\//i.test(r) || r.startsWith('/') || r.startsWith('data:')) return r;
  const parts = String(mapFile || '').replace(/\\/g, '/').split('/').slice(0, -1).filter((p) => p && p !== '.');
  for (const p of r.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') { parts.pop(); continue; }
    parts.push(p);
  }
  return parts.join('/');
}

// 圖片圖塊集有沒有涵蓋這個 gid(有的話回傳 {tileset, local})
export function imageTileFor(map, gid) {
  for (const ts of map.tilesets) {
    if (ts.image && gid >= ts.firstgid && gid < ts.firstgid + ts.tilecount) return { tileset: ts, local: gid - ts.firstgid };
  }
  return null;
}
