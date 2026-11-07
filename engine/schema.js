// 資料契約驗證:瀏覽器開場與 scripts/validate-game.mjs 共用同一支。
// 錯誤訊息一律白話中文,寫給「填卡帶的人」看,不是寫給程式設計師看。
// 回傳 { errors, warnings, maps }:errors 有東西就不准開玩;warnings 只提醒。
import { parseTiled, OBJECT_TYPES, imageTileFor, tileBlocked, inBounds } from './map.js';
import { condError, parseCond } from './cond.js';

export const DATA_FILES = ['game.json', 'tiles.json', 'dialogues.json', 'quests.json', 'items.json', 'enemies.json', 'encounters.json'];
export const DIRS = ['up', 'down', 'left', 'right'];
export const ENEMY_SHAPES = ['blob', 'wolf', 'skeleton', 'spider', 'bat', 'ghost'];
export const ITEM_TYPES = ['heal', 'material', 'key'];
const NODE_KEYS = ['speaker', 'text', 'choices', 'if', 'then', 'else', 'set', 'quest', 'action', 'give', 'gold', 'battle', 'heal', 'ending', 'end', 'note'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function mapFileOf(entry) { return typeof entry === 'string' ? entry : (isObj(entry) ? entry.file : null); }
export function mapNameOf(id, entry) { return (isObj(entry) && entry.name) || id; }

export function validateGame(d) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  const maps = {};
  const g = d.game;
  if (!isObj(g)) { E('game.json 不是 JSON 物件'); return { errors, warnings, maps }; }

  // ── 各檔案要是物件 ──
  const tables = { tiles: 'tiles.json', dialogues: 'dialogues.json', quests: 'quests.json', items: 'items.json', enemies: 'enemies.json', encounters: 'encounters.json' };
  for (const [k, f] of Object.entries(tables)) if (!isObj(d[k])) E(`${f} 要是 JSON 物件(大括號包起來,用 id 當鍵)`);
  const tiles = isObj(d.tiles) ? d.tiles : {}, dialogues = isObj(d.dialogues) ? d.dialogues : {}, quests = isObj(d.quests) ? d.quests : {};
  const items = isObj(d.items) ? d.items : {}, enemies = isObj(d.enemies) ? d.enemies : {}, encounters = isObj(d.encounters) ? d.encounters : {};
  const refs = { quests, items };

  // ── game.json ──
  for (const k of ['id', 'title']) if (!nonEmpty(g[k])) E(`game.json 缺少「${k}」(文字)`);
  if (g.id && !/^[\w-]+$/.test(g.id)) E(`game.json 的 id「${g.id}」只能用英數、底線、連字號(它會變成網址與存檔的鍵)`);
  if (!isObj(g.maps) || !Object.keys(g.maps).length) E('game.json 的 maps 至少要列一張地圖,例如 {"village":"maps/village.json"}');
  const mapIds = isObj(g.maps) ? Object.keys(g.maps) : [];
  for (const id of mapIds) {
    const file = mapFileOf(g.maps[id]);
    if (!nonEmpty(file)) { E(`game.json 的地圖 ${id} 沒寫檔名`); continue; }
    const raw = d.maps && d.maps[id];
    if (!raw) { E(`地圖 ${id} 的檔案讀不到(game.json 寫的是 ${file})`); continue; }
    const r = parseTiled(id, raw);
    r.errors.forEach(E);
    if (r.map) { r.map.name = mapNameOf(id, g.maps[id]); maps[id] = r.map; }
  }
  const posOk = (where, p) => {
    if (!isObj(p)) { E(`${where} 要寫成 {"map":..., "x":..., "y":...}`); return false; }
    if (!mapIds.includes(p.map)) { E(`${where} 的地圖 ${p.map} 不在 game.json 的 maps 清單裡`); return false; }
    if (!isInt(p.x) || !isInt(p.y)) { E(`${where} 的 x、y 要是整數(格子座標,從 0 算起)`); return false; }
    const m = maps[p.map];
    if (m && !inBounds(m, p.x, p.y)) { E(`${where} 的座標 (${p.x},${p.y}) 超出地圖 ${p.map}(${m.w}×${m.h})`); return false; }
    if (m && tileBlocked(m, p.x, p.y)) { E(`${where} 的座標 (${p.x},${p.y}) 在地圖 ${p.map} 是不能走的格子(collision 圖層有東西)`); return false; }
    if (p.dir != null && !DIRS.includes(p.dir)) E(`${where} 的 dir 只能是 ${DIRS.join(' / ')}`);
    return true;
  };
  posOk('game.json 的 start(起點)', g.start);
  if (g.defeat != null) {
    posOk('game.json 的 defeat(倒下後醒來的地方)', g.defeat);
    if (isObj(g.defeat) && g.defeat.goldLossRate != null && !(isNum(g.defeat.goldLossRate) && g.defeat.goldLossRate >= 0 && g.defeat.goldLossRate <= 1)) E('game.json 的 defeat.goldLossRate 要在 0~1 之間(倒下損失的金幣比例)');
  }
  const hero = g.hero;
  if (!isObj(hero)) E('game.json 缺少 hero(主角初始數值)');
  else {
    if (!nonEmpty(hero.name)) E('hero.name 要是文字');
    for (const k of ['hp', 'mp', 'atk', 'def', 'spd']) if (!isInt(hero[k]) || hero[k] < 0) E(`hero.${k} 要是 0 以上的整數`);
    if (isInt(hero.hp) && hero.hp < 1) E('hero.hp 至少要 1,不然一開場就倒下');
    if (hero.level != null && (!isInt(hero.level) || hero.level < 1)) E('hero.level 要是 1 以上的整數');
    if (hero.gold != null && (!isInt(hero.gold) || hero.gold < 0)) E('hero.gold 要是 0 以上的整數');
    if (hero.items != null) {
      if (!isObj(hero.items)) E('hero.items 要寫成 {"道具id": 數量}');
      else for (const [it, q] of Object.entries(hero.items)) { if (!items[it]) E(`hero.items 的道具 ${it} 不在 items.json`); if (!isInt(q) || q < 1) E(`hero.items 的 ${it} 數量要是 1 以上的整數`); }
    }
    if (hero.skills != null) {
      if (!Array.isArray(hero.skills)) E('hero.skills 要是陣列');
      else hero.skills.forEach((s, i) => {
        if (!isObj(s)) { E(`hero.skills 第 ${i + 1} 個不是物件`); return; }
        if (!nonEmpty(s.id) || !nonEmpty(s.name)) E(`hero.skills 第 ${i + 1} 個要有 id 與 name`);
        if (!isInt(s.mp) || s.mp < 0) E(`技能 ${s.id || i + 1} 的 mp(消耗魔力)要是 0 以上的整數`);
        if (!isNum(s.mult) || s.mult <= 0) E(`技能 ${s.id || i + 1} 的 mult(傷害倍率)要大於 0`);
      });
    }
  }
  const lv = g.levels;
  if (!isObj(lv)) E('game.json 缺少 levels(升等設定):{"base":10,"max":20,"growth":{...}}');
  else {
    if (!isNum(lv.base) || lv.base <= 0) E('levels.base 要大於 0(升下一級需要的經驗值 = base × 等級^1.5)');
    if (!isInt(lv.max) || lv.max < 1) E('levels.max(等級上限)要是 1 以上的整數');
    if (!isObj(lv.growth)) E('levels.growth 要寫每升一級加多少:{"hp":6,"mp":2,"atk":2,"def":1,"spd":1}');
    else for (const k of ['hp', 'mp', 'atk', 'def', 'spd']) if (lv.growth[k] != null && (!isInt(lv.growth[k]) || lv.growth[k] < 0)) E(`levels.growth.${k} 要是 0 以上的整數`);
  }
  if (g.ending != null && (!isObj(g.ending) || !nonEmpty(g.ending.title) || !nonEmpty(g.ending.text))) E('game.json 的 ending 要有 title 與 text(結局畫面的字)');
  if (g.howto != null && !(Array.isArray(g.howto) && g.howto.every(nonEmpty))) E('game.json 的 howto(使用說明)要是文字陣列');
  if (g.encounterCooldown != null && (!isInt(g.encounterCooldown) || g.encounterCooldown < 0)) E('game.json 的 encounterCooldown(打完一場後幾步內不再遇敵)要是 0 以上的整數');

  // ── tiles.json(圖塊外觀,用 gid 當鍵)──
  for (const [gid, t] of Object.entries(tiles)) {
    if (!/^\d+$/.test(gid) || +gid < 1) E(`tiles.json 的鍵「${gid}」要是 1 以上的整數(Tiled 的 gid)`);
    if (!isObj(t)) { E(`tiles.json 的 ${gid} 要是物件:{"name":"草地","color":"#5a9e4b","kind":"grass"}`); continue; }
    if (!nonEmpty(t.name)) E(`tiles.json 的 ${gid} 缺 name`);
    if (!nonEmpty(t.color)) E(`tiles.json 的 ${gid}(${t.name || '?'})缺 color(例如 "#5a9e4b")`);
  }

  // ── items / enemies / encounters / quests ──
  for (const [id, it] of Object.entries(items)) {
    if (!isObj(it)) { E(`道具 ${id} 要是物件`); continue; }
    if (!nonEmpty(it.name)) E(`道具 ${id} 缺 name`);
    if (!ITEM_TYPES.includes(it.type)) E(`道具 ${id} 的 type 只能是 ${ITEM_TYPES.join(' / ')}`);
    if (it.type === 'heal' && !((isInt(it.hp) && it.hp > 0) || (isInt(it.mp) && it.mp > 0))) E(`道具 ${id} 是 heal 型,要有 hp 或 mp(回復量,正整數)`);
  }
  for (const [id, en] of Object.entries(enemies)) {
    if (!isObj(en)) { E(`怪物 ${id} 要是物件`); continue; }
    if (!nonEmpty(en.name)) E(`怪物 ${id} 缺 name`);
    if (!isInt(en.hp) || en.hp < 1) E(`怪物 ${id} 的 hp 要是 1 以上的整數`);
    for (const k of ['atk', 'def', 'spd', 'xp', 'gold']) if (!isInt(en[k]) || en[k] < 0) E(`怪物 ${id} 的 ${k} 要是 0 以上的整數`);
    if (en.drops != null) {
      if (!Array.isArray(en.drops)) E(`怪物 ${id} 的 drops 要是陣列`);
      else en.drops.forEach((dr, i) => {
        if (!isObj(dr) || !items[dr.item]) E(`怪物 ${id} 的第 ${i + 1} 個掉落物 ${isObj(dr) ? dr.item : '?'} 不在 items.json`);
        if (!isObj(dr) || !isNum(dr.chance) || dr.chance < 0 || dr.chance > 1) E(`怪物 ${id} 的第 ${i + 1} 個掉落物 chance 要在 0~1 之間`);
      });
    }
    if (!isObj(en.sprite) || !ENEMY_SHAPES.includes(en.sprite.shape)) E(`怪物 ${id} 的 sprite.shape 只能是 ${ENEMY_SHAPES.join(' / ')}`);
    else if (!nonEmpty(en.sprite.color)) E(`怪物 ${id} 的 sprite.color 缺(例如 "#6cc24a")`);
  }
  for (const [id, enc] of Object.entries(encounters)) {
    if (!isObj(enc)) { E(`遭遇表 ${id} 要是物件`); continue; }
    if (Array.isArray(enc.fixed)) {
      if (!enc.fixed.length) E(`遭遇表 ${id} 的 fixed 至少要列一隻怪`);
      enc.fixed.forEach((e) => { if (!enemies[e]) E(`遭遇表 ${id} 的 fixed 裡怪物 ${e} 不在 enemies.json`); });
      continue;
    }
    if (!isNum(enc.rate) || enc.rate <= 0 || enc.rate > 1) E(`遭遇表 ${id} 的 rate(每走一步遇敵機率)要在 0~1 之間,例如 0.12`);
    if (!Array.isArray(enc.groups) || !enc.groups.length) { E(`遭遇表 ${id} 的 groups 至少要有一組`); continue; }
    enc.groups.forEach((gp, i) => {
      if (!isObj(gp) || !Array.isArray(gp.enemies) || !gp.enemies.length) { E(`遭遇表 ${id} 第 ${i + 1} 組要寫 enemies(怪物 id 陣列)`); return; }
      gp.enemies.forEach((e) => { if (!enemies[e]) E(`遭遇表 ${id} 第 ${i + 1} 組的怪物 ${e} 不在 enemies.json`); });
      if (gp.weight != null && (!isNum(gp.weight) || gp.weight <= 0)) E(`遭遇表 ${id} 第 ${i + 1} 組的 weight(出現比重)要大於 0`);
      if (gp.enemies.length > 4) W(`遭遇表 ${id} 第 ${i + 1} 組有 ${gp.enemies.length} 隻怪,畫面可能擠不下(建議 4 隻以內)`);
    });
  }
  for (const [id, q] of Object.entries(quests)) {
    if (!isObj(q)) { E(`任務 ${id} 要是物件`); continue; }
    if (!nonEmpty(q.title)) E(`任務 ${id} 缺 title`);
    if (!nonEmpty(q.desc)) E(`任務 ${id} 缺 desc(任務說明)`);
    const o = q.objective;
    if (!isObj(o)) E(`任務 ${id} 缺 objective(目標)`);
    else if (o.type === 'kill') { if (!enemies[o.enemy]) E(`任務 ${id} 要打的怪物 ${o.enemy} 不在 enemies.json`); if (!isInt(o.count) || o.count < 1) E(`任務 ${id} 的 count 要是 1 以上的整數`); }
    else if (o.type === 'collect') { if (!items[o.item]) E(`任務 ${id} 要收集的道具 ${o.item} 不在 items.json`); if (!isInt(o.count) || o.count < 1) E(`任務 ${id} 的 count 要是 1 以上的整數`); }
    else if (o.type === 'flag') { if (!nonEmpty(o.flag)) E(`任務 ${id} 的 objective.flag 缺旗標名`); }
    else E(`任務 ${id} 的 objective.type 只能是 kill / collect / flag`);
    const r = q.reward;
    if (r != null) {
      if (!isObj(r)) E(`任務 ${id} 的 reward 要是物件`);
      else {
        for (const k of ['xp', 'gold']) if (r[k] != null && (!isInt(r[k]) || r[k] < 0)) E(`任務 ${id} 的獎勵 ${k} 要是 0 以上的整數`);
        if (r.items != null) { if (!isObj(r.items)) E(`任務 ${id} 的獎勵 items 要寫成 {"道具id": 數量}`); else for (const [it, qn] of Object.entries(r.items)) { if (!items[it]) E(`任務 ${id} 的獎勵道具 ${it} 不在 items.json`); if (!isInt(qn) || qn < 1) E(`任務 ${id} 的獎勵道具 ${it} 數量要是 1 以上的整數`); } }
      }
    }
  }

  // ── dialogues.json ──
  const dialogueRefs = new Set();
  const questStarters = new Set();
  for (const [id, nodes] of Object.entries(dialogues)) {
    if (!Array.isArray(nodes)) { E(`對話 ${id} 要是陣列(一句一個物件)`); continue; }
    if (!nodes.length) W(`對話 ${id} 是空的`);
    nodes.forEach((n, i) => {
      const where = `對話 ${id} 第 ${i + 1} 句`;
      if (!isObj(n)) { E(`${where} 不是物件`); return; }
      const unknown = Object.keys(n).filter((k) => !NODE_KEYS.includes(k));
      if (unknown.length) E(`${where} 有不認得的欄位:${unknown.join('、')}(可用:${NODE_KEYS.join('、')})`);
      const hasAny = ['text', 'if', 'set', 'quest', 'give', 'gold', 'battle', 'heal', 'ending', 'end'].some((k) => n[k] != null);
      if (!hasAny) E(`${where} 什麼都沒做(至少要有 text / if / set / quest / give / gold / battle / heal / ending / end 其中一個)`);
      if (n.text != null) {
        if (typeof n.text !== 'string') E(`${where} 的 text 要是文字`);
        else for (const m of n.text.matchAll(/\{progress:([\w-]+)\}/g)) if (!quests[m[1]]) E(`${where} 的 {progress:${m[1]}} 指到不存在的任務`);
      }
      if (n.choices != null) {
        if (!Array.isArray(n.choices) || !n.choices.length) E(`${where} 的 choices 要是非空陣列`);
        else if (n.text == null) E(`${where} 有 choices 就要有 text(先講話再給選項)`);
        else n.choices.forEach((c, j) => {
          if (!isObj(c) || !nonEmpty(c.label)) E(`${where} 的選項 ${j + 1} 缺 label`);
          if (!isObj(c) || !dialogues[c.next]) E(`${where} 的選項 ${j + 1} 的 next「${isObj(c) ? c.next : '?'}」不是存在的對話 id`);
          else dialogueRefs.add(c.next);
        });
      }
      if (n.if != null) {
        const ce = condError(n.if, refs); if (ce) E(`${where} 的 if:${ce}`);
        if (!dialogues[n.then]) E(`${where} 有 if 就要有 then,而且要是存在的對話 id(現在是「${n.then}」)`); else dialogueRefs.add(n.then);
        if (n.else != null) { if (!dialogues[n.else]) E(`${where} 的 else「${n.else}」不是存在的對話 id`); else dialogueRefs.add(n.else); }
      } else if (n.then != null || n.else != null) E(`${where} 有 then / else 卻沒有 if`);
      if (n.set != null) {
        if (!isObj(n.set) || !nonEmpty(n.set.flag)) E(`${where} 的 set 要寫成 {"flag":"旗標名"}`);
      }
      if (n.quest != null) {
        if (!quests[n.quest]) E(`${where} 的任務 ${n.quest} 不在 quests.json`);
        if (!['start', 'complete'].includes(n.action)) E(`${where} 的 action 只能是 start 或 complete`);
        if (n.action === 'start') questStarters.add(n.quest);
      }
      if (n.give != null) {
        if (!isObj(n.give) || !items[n.give.item]) E(`${where} 要給的道具 ${isObj(n.give) ? n.give.item : '?'} 不在 items.json`);
        if (isObj(n.give) && n.give.qty != null && (!isInt(n.give.qty) || n.give.qty < 1)) E(`${where} 的 give.qty 要是 1 以上的整數`);
      }
      if (n.gold != null && !isInt(n.gold)) E(`${where} 的 gold 要是整數(可以是負數=扣錢)`);
      if (n.battle != null && !encounters[n.battle]) E(`${where} 的 battle「${n.battle}」不在 encounters.json`);
    });
  }

  // ── 地圖上的物件 ──
  for (const [mid, m] of Object.entries(maps)) {
    for (const gid of m.usedGids) if (!tiles[gid] && !imageTileFor(m, gid)) E(`地圖 ${mid} 用了圖塊 gid ${gid},但 tiles.json 沒有這一號、也沒有圖片圖塊集涵蓋它`);
    for (const o of m.objects) {
      const label = `地圖 ${mid} 的物件「${o.name || o.type || o.id}」(格子 ${o.tx},${o.ty})`;
      if (!OBJECT_TYPES.includes(o.type)) { E(`${label} 的 Type/Class「${o.type || '(空白)'}」不認得;只能是 ${OBJECT_TYPES.join(' / ')}`); continue; }
      if (!inBounds(m, o.tx, o.ty)) E(`${label} 超出地圖範圍`);
      const p = o.props;
      for (const k of ['showIf', 'hideIf']) if (p[k] != null) { const ce = condError(p[k], refs); if (ce) E(`${label} 的 ${k}:${ce}`); }
      if (o.type === 'npc') {
        if (!dialogues[p.dialogue]) E(`${label} 的 dialogue「${p.dialogue || '(沒填)'}」不是存在的對話 id`); else dialogueRefs.add(p.dialogue);
        if (tileBlocked(m, o.tx, o.ty)) W(`${label} 站在不能走的格子上,玩家可能走不到他面前`);
      } else if (o.type === 'portal') {
        if (!mapIds.includes(p.map)) E(`${label} 的目標地圖 ${p.map || '(沒填)'} 不在 game.json 的 maps`);
        else if (!isInt(p.x) || !isInt(p.y)) E(`${label} 要填目標格子 x、y(整數)`);
        else if (maps[p.map] && !inBounds(maps[p.map], p.x, p.y)) E(`${label} 的目標 (${p.x},${p.y}) 超出地圖 ${p.map}`);
        else if (maps[p.map] && tileBlocked(maps[p.map], p.x, p.y)) E(`${label} 的目標 (${p.x},${p.y}) 在地圖 ${p.map} 是不能走的格子`);
        if (p.dir != null && !DIRS.includes(p.dir)) E(`${label} 的 dir 只能是 ${DIRS.join(' / ')}`);
      } else if (o.type === 'item') {
        if (!items[p.item]) E(`${label} 的道具 ${p.item || '(沒填)'} 不在 items.json`);
        if (p.qty != null && (!isInt(p.qty) || p.qty < 1)) E(`${label} 的 qty 要是 1 以上的整數`);
      } else if (o.type === 'zone') {
        if (!encounters[p.encounter]) E(`${label} 的 encounter「${p.encounter || '(沒填)'}」不在 encounters.json`);
        else if (Array.isArray(encounters[p.encounter].fixed)) E(`${label} 的遭遇表 ${p.encounter} 是 fixed(固定戰鬥),遇敵區要用有 rate 與 groups 的表`);
      }
    }
  }

  // ── 提醒(不擋)──
  for (const id of Object.keys(quests)) if (!questStarters.has(id)) W(`任務 ${id} 沒有任何對話會 start 它,玩家永遠接不到`);
  for (const id of Object.keys(dialogues)) if (!dialogueRefs.has(id)) W(`對話 ${id} 沒有 NPC 或其他對話指到它(可能是多餘的)`);
  const givenItems = new Set(Object.keys(isObj(hero) && isObj(hero.items) ? hero.items : {}));
  for (const nodes of Object.values(dialogues)) if (Array.isArray(nodes)) for (const n of nodes) if (isObj(n) && isObj(n.give)) givenItems.add(n.give.item);
  for (const q of Object.values(quests)) if (isObj(q) && isObj(q.reward) && isObj(q.reward.items)) for (const it of Object.keys(q.reward.items)) givenItems.add(it);
  for (const en of Object.values(enemies)) if (isObj(en) && Array.isArray(en.drops)) for (const dr of en.drops) if (isObj(dr)) givenItems.add(dr.item);
  for (const m of Object.values(maps)) for (const o of m.objects) if (o.type === 'item') givenItems.add(o.props.item);
  for (const id of Object.keys(items)) if (!givenItems.has(id)) W(`道具 ${id} 沒有任何地方拿得到(不在起始道具、對話、任務獎勵、掉落、地圖上)`);
  return { errors, warnings, maps };
}

export { parseCond };
