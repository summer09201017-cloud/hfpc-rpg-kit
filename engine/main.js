// 遊戲機本體:把地圖、對話、任務、背包、戰鬥、存檔接在一起。
// 卡帶(games/<id>/)只提供資料;這支不認得任何一張卡帶的內容。
import { loadGame } from './loader.js';
import { validateGame } from './schema.js';
import { makeRng } from './rng.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Inventory } from './inventory.js';
import { QuestLog } from './quest.js';
import { DialogueRunner } from './dialogue.js';
import { Battle, makeHero, heroFromSave, gainXp, xpToNext } from './battle.js';
import { createSaveStore } from './save.js';
import { evalCond } from './cond.js';
import { tileBlocked, objectsAt } from './map.js';
import { drawMap, drawChar, drawEnemy, drawItem, drawBattleScene, drawSheet, drawEnemyImage, loadImages } from './sprites.js';
import { APP_VERSION } from './version.js';

const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const STEP_SEC = 0.14;

export async function boot(opts) {
  const ui = new UI(opts.uiRoot);
  const data = await loadGame(opts.gameId);
  const v = data.loadErrors.length ? { errors: data.loadErrors, warnings: [], maps: {} } : validateGame(data);
  if (v.errors.length) { ui.errors(v.errors, v.warnings); return { ok: false, errors: v.errors, warnings: v.warnings, mode: 'error' }; }
  const game = new Game({ ...opts, ui, data, maps: v.maps, imageKeys: v.imageKeys, warnings: v.warnings });
  await game.init();
  game.showTitle();
  return game;
}

export class Game {
  constructor(o) {
    this.ok = true;
    this.data = o.data; this.g = o.data.game; this.maps = o.maps; this.imageKeys = o.imageKeys || []; this.warnings = o.warnings || [];
    this.defs = { items: o.data.items, enemies: o.data.enemies, encounters: o.data.encounters, quests: o.data.quests, dialogues: o.data.dialogues };
    this.palette = o.data.tiles;
    this.ui = o.ui; this.canvas = o.canvas; this.win = o.win || window;
    this.seed = o.seed; this.rng = makeRng(o.seed);
    this.input = new Input(this.win); this.input.bindPad(o.padRoot);
    this.store = createSaveStore(o.storage || this.win.localStorage, `rpgkit:${this.g.id}:save`);
    this.mode = 'title'; this.t = 0; this.images = {}; this.lastDir = null; this.battle = null; this.hurtIdx = -1; this.hurtT = 0;
    this.onEvent = o.onEvent || (() => {});
    if (o.debug) this.debug = {
      setLevel: (n) => { while (this.hero.level < n) gainXp(this.hero, xpToNext(this.hero.level, this.g.levels.base), this.g.levels); this.hero.xp = 0; },
      give: (item, q = 1) => this.inventory.add(item, q),
      setHp: (n) => { this.hero.hp = Math.max(1, Math.min(this.hero.maxHp, n)); },
    };
  }
  async init() {
    this.images = await loadImages(this.imageKeys, this.data.base);   // 圖塊集 + 走路圖 + 怪物圖一起預載;抓不到的鍵不會在裡面
    this.resize(); this.win.addEventListener('resize', () => this.resize());
    this._last = performance.now();
    const tick = (now) => { const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now; this.update(dt); this.draw(); this.win.requestAnimationFrame(tick); };
    this.win.requestAnimationFrame(tick);
  }
  names() {
    if (!this._names) this._names = { enemies: Object.fromEntries(Object.entries(this.defs.enemies).map(([k, v]) => [k, v.name])), items: Object.fromEntries(Object.entries(this.defs.items).map(([k, v]) => [k, v.name])) };
    return this._names;
  }
  ctx() { return { hero: this.hero, flags: this.flags, questLog: this.questLog, inventory: this.inventory, kills: this.kills }; }
  get map() { return this.maps[this.pos.map]; }
  itemName(id) { return (this.defs.items[id] && this.defs.items[id].name) || id; }

  /* ── 開場 / 新遊戲 / 繼續 / 存檔 ── */
  showTitle() {
    this.mode = 'title'; this.ui.showHud(false); this.ui.hideDialogue(); this.ui.closeMenu(); this.ui.hideBattle();
    const s = this.store.load();
    this.ui.title({
      title: this.g.title, subtitle: this.g.subtitle, intro: this.g.intro, howto: this.g.howto,
      hasSave: !!s, saveInfo: s ? `Lv${s.hero.level}・${(this.maps[s.pos.map] || {}).name || s.pos.map}・${String(s.savedAt || '').slice(0, 16).replace('T', ' ')}` : '',
      onNew: () => this.newGame(), onContinue: () => this.continueGame(),
    });
  }
  resetState() { this.flags = {}; this.kills = {}; this.steps = 0; this.move = null; this.cooldown = 0; this.setupRunner(); }
  newGame() {
    this.hero = makeHero(this.g.hero);
    this.inventory = new Inventory(this.g.hero.items || {}, this.g.hero.gold || 0);
    this.questLog = new QuestLog(this.defs.quests);
    this.resetState();
    this.pos = { map: this.g.start.map, x: this.g.start.x, y: this.g.start.y, dir: this.g.start.dir || 'down' };
    this.enterExplore(); this.ui.toast(this.map.name);
    this.onEvent('start');
  }
  continueGame() {
    const s = this.store.load();
    if (!s) return this.newGame();
    this.hero = heroFromSave(s.hero, this.g.hero);
    this.inventory = new Inventory((s.inventory && s.inventory.items) || {}, (s.inventory && s.inventory.gold) || 0);
    this.questLog = new QuestLog(this.defs.quests, s.quests);
    this.resetState();
    this.flags = { ...(s.flags || {}) }; this.kills = { ...(s.kills || {}) }; this.steps = s.steps | 0;
    const p = s.pos && this.maps[s.pos.map] && !tileBlocked(this.maps[s.pos.map], s.pos.x, s.pos.y) ? s.pos : this.g.start;
    this.pos = { map: p.map, x: p.x, y: p.y, dir: p.dir || 'down' };
    this.enterExplore(); this.ui.toast(`歡迎回來,${this.hero.name}`);
  }
  save(silent) {
    const ok = this.store.save({ gameId: this.g.id, version: APP_VERSION, pos: { ...this.pos }, hero: { ...this.hero, skills: undefined }, inventory: this.inventory.toJSON(), quests: this.questLog.toJSON(), flags: { ...this.flags }, kills: { ...this.kills }, steps: this.steps });
    if (!silent) this.ui.toast(ok ? '已存檔' : '存檔失敗(瀏覽器不讓存,可能是私密模式)');
    return ok;
  }

  /* ── 對話與任務的接線 ── */
  setupRunner() {
    this.runner = new DialogueRunner(this.defs.dialogues, {
      ctx: () => this.ctx(),
      say: (o) => this.ui.say(o),
      hide: () => this.ui.hideDialogue(),
      battle: (id) => this.startBattle(id),
      onSet: (f) => { this.flags[f] = true; },
      onQuest: (id, action) => this.questAction(id, action),
      onGive: (it, q) => { this.inventory.add(it, q); this.ui.toast(`獲得 ${this.itemName(it)} ×${q}`); },
      onGold: (n) => { this.inventory.gold = Math.max(0, this.inventory.gold + n); this.ui.toast(n >= 0 ? `獲得 ${n} 金幣` : `付出 ${-n} 金幣`); },
      heal: () => { this.fullHeal(); this.ui.toast('體力、魔力全滿'); },
      ending: () => this.showEnding(),
      progressText: (q) => this.questLog.progressText(q, this.ctx(), this.names()),
    });
  }
  questAction(id, action) {
    const q = this.defs.quests[id]; if (!q) return;
    if (action === 'start') { if (this.questLog.start(id, this.ctx())) this.ui.toast(`接到任務:${q.title}`); return; }
    const r = this.questLog.complete(id, this.ctx());
    if (!r) return;
    const parts = [];
    if (r.xp) parts.push(`${r.xp} 經驗值`); if (r.gold) parts.push(`${r.gold} 金幣`);
    for (const [it, n] of Object.entries(r.items)) parts.push(`${this.itemName(it)} ×${n}`);
    this.ui.toast(`任務完成:${q.title}${parts.length ? '(獲得 ' + parts.join('、') + ')' : ''}`, 3500);
    this.applyXp(r.xp);
  }
  applyXp(n) { const ups = gainXp(this.hero, n, this.g.levels); for (const u of ups) this.ui.toast(`升級!${this.hero.name} 變成 Lv${u.level}`, 3000); return ups; }
  fullHeal() { this.hero.hp = this.hero.maxHp; this.hero.mp = this.hero.maxMp; }

  /* ── 探索 ── */
  enterExplore() { this.mode = 'explore'; this.ui.hideScreen(); this.ui.hideBattle(); this.ui.showHud(true); this.input.clear(); this.lastDir = this.input.dir(); }
  visible(o) {
    const p = o.props;
    if (p.showIf != null && !evalCond(this.ctx(), p.showIf)) return false;
    if (p.hideIf != null && evalCond(this.ctx(), p.hideIf)) return false;
    if (o.type === 'item' && this.flags[`picked:${this.pos.map}:${o.id}`]) return false;
    return true;
  }
  solidAt(x, y) {
    if (tileBlocked(this.map, x, y)) return true;
    return objectsAt(this.map, x, y, (o) => (o.type === 'npc' || o.type === 'heal') && this.visible(o)).length > 0;
  }
  edgeDir() { const d = this.input.dir(); const r = d !== this.lastDir ? d : null; this.lastDir = d; return r; }
  update(dt) {
    this.t += dt;
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) this.hurtIdx = -1; }
    if (this.mode === 'explore') {
      if (this.move) {
        this.move.t += dt / STEP_SEC;
        if (this.move.t >= 1) { this.pos.x = this.move.tx; this.pos.y = this.move.ty; this.move = null; this.onArrive(); }
      } else {
        const act = this.input.poll();
        if (act === 'confirm') this.interact();
        else if (act === 'cancel') this.openMenu();
        else {
          const d = this.input.dir() || this.input.takeTap();
          if (d) {
            this.pos.dir = d;
            const [dx, dy] = DELTA[d], tx = this.pos.x + dx, ty = this.pos.y + dy;
            if (!this.solidAt(tx, ty)) this.move = { fx: this.pos.x, fy: this.pos.y, tx, ty, t: 0 };
          }
        }
      }
      if (this.hero) this.ui.setHud({ hero: this.hero, gold: this.inventory.gold, mapName: this.map.name });
    } else if (this.mode === 'dialogue') {
      const act = this.input.poll();
      if (act === 'confirm') this.ui.dialogueNext();
      else { const d = this.edgeDir(); if (d === 'up' || d === 'down') this.ui.dialogueMove(d); }
    } else if (this.mode === 'menu') {
      const act = this.input.poll();
      if (act === 'cancel') this.closeMenu();
    } else this.input.clear();
  }
  onArrive() {
    this.steps++;
    if (this.cooldown > 0) this.cooldown--;
    const map = this.map;
    for (const o of objectsAt(map, this.pos.x, this.pos.y, (o) => this.visible(o))) {
      if (o.type === 'item') { const q = o.props.qty || 1; this.inventory.add(o.props.item, q); this.flags[`picked:${map.id}:${o.id}`] = true; this.ui.toast(`撿到 ${this.itemName(o.props.item)} ×${q}`); }
      else if (o.type === 'portal') { this.teleport(o.props.map, o.props.x, o.props.y, o.props.dir || this.pos.dir); this.save(true); return; }
    }
    const zone = objectsAt(map, this.pos.x, this.pos.y, (o) => o.type === 'zone' && this.visible(o))[0];
    if (zone && this.cooldown <= 0) {
      const table = this.defs.encounters[zone.props.encounter];
      if (table && table.groups && this.rng() < table.rate) {
        const grp = this.rng.weighted(table.groups, (x) => (x.weight == null ? 1 : x.weight));
        this.startBattle(zone.props.encounter, grp.enemies);
      }
    }
  }
  teleport(mapId, x, y, dir) {
    if (!this.maps[mapId]) return;
    this.pos = { map: mapId, x, y, dir: dir || this.pos.dir }; this.move = null;
    this.ui.toast(this.maps[mapId].name);
  }
  interact() {
    const [dx, dy] = DELTA[this.pos.dir], tx = this.pos.x + dx, ty = this.pos.y + dy;
    const objs = objectsAt(this.map, tx, ty, (o) => this.visible(o));
    const npc = objs.find((o) => o.type === 'npc');
    if (npc) { this.startDialogue(npc.props.dialogue, npc); return; }
    const bed = objs.find((o) => o.type === 'heal');
    if (bed) this.restAt(bed);
  }
  async startDialogue(id, npc) {
    if (this.mode !== 'explore') return;
    this.mode = 'dialogue'; this.input.clear();
    if (npc) this.flags[`talked:${npc.props.name || npc.name || npc.id}`] = true;
    await this.runner.start(id);
    if (this.mode === 'dialogue') this.enterExplore();
  }
  async restAt() {
    this.mode = 'dialogue'; this.input.clear();
    const i = await this.ui.say({ speaker: '', text: '要在這裡休息嗎?(體力、魔力全滿,並且存檔)', choices: ['休息', '不用'] });
    this.ui.hideDialogue();
    if (i === 0) { this.fullHeal(); this.save(true); this.ui.toast('休息好了,體力魔力全滿。已存檔。', 3000); }
    if (this.mode === 'dialogue') this.enterExplore();
  }

  /* ── 戰鬥 ── */
  startBattle(encId, enemyIds) {
    const table = this.defs.encounters[encId] || {};
    const ids = enemyIds || table.fixed || (table.groups ? this.rng.weighted(table.groups, (x) => (x.weight == null ? 1 : x.weight)).enemies : []);
    const fixed = Array.isArray(table.fixed);
    const prevMode = this.mode;
    this.mode = 'battle'; this.move = null; this.input.clear(); this.ui.hideDialogue(); this.ui.showHud(false);
    const battle = new Battle({ hero: this.hero, enemyIds: ids, enemyDefs: this.defs.enemies, itemDefs: this.defs.items, inventory: this.inventory, rng: this.rng, fixed });
    this.battle = battle; this.battleTheme = (this.map.name || '').includes('洞') ? 'cave' : 'field';
    this.onEvent('battle', { enemies: ids });
    return new Promise((resolve) => {
      const finish = async () => {
        const result = battle.phase, lines = [];
        if (result === 'won') {
          const r = battle.rewards();
          for (const [k, n] of Object.entries(r.kills)) this.kills[k] = (this.kills[k] || 0) + n;
          this.inventory.gold += r.gold;
          lines.push(`獲得 ${r.xp} 經驗值、${r.gold} 金幣`);
          for (const d of r.drops) { this.inventory.add(d.item, d.qty); lines.push(`撿到 ${this.itemName(d.item)} ×${d.qty}`); }
          for (const u of gainXp(this.hero, r.xp, this.g.levels)) lines.push(`升級!${this.hero.name} 變成 Lv${u.level}(體力 +${u.gains.hp}、攻擊 +${u.gains.atk}、防禦 +${u.gains.def})`);
          this.cooldown = this.g.encounterCooldown == null ? 3 : this.g.encounterCooldown;
        } else if (result === 'lost') lines.push((this.g.defeat && this.g.defeat.text) || '你倒下了……');
        else lines.push('下次小心一點。');
        await this.ui.battleResult({ title: result === 'won' ? '戰鬥勝利!' : result === 'lost' ? '你倒下了' : '逃走了', lines });
        this.ui.hideBattle(); this.battle = null;
        if (result === 'lost') { this.defeat(); resolve('lost'); return; }
        if (prevMode === 'dialogue' && this.runner.active) this.mode = 'dialogue'; else this.enterExplore();
        resolve(result);
      };
      this.ui.showBattle({
        hero: this.hero, battle, itemDefs: this.defs.items,
        onAction: (a) => {
          if (battle.phase !== 'player') return;
          const evs = battle.act(a);
          for (const e of evs) if (e.t === 'hit' && e.who === 'hero') { this.hurtIdx = e.target; this.hurtT = 0.25; }
          this.ui.logBattle(evs.map((e) => e.msg).filter(Boolean));
          this.ui.updateBattle(battle, this.hero);
          if (battle.phase !== 'player') finish();
        },
      });
    });
  }
  defeat() {
    const d = this.g.defeat || this.g.start;
    const rate = (this.g.defeat && this.g.defeat.goldLossRate) || 0;
    this.inventory.gold = Math.floor(this.inventory.gold * (1 - rate));
    this.fullHeal();
    this.runner.cancel();
    this.pos = { map: d.map, x: d.x, y: d.y, dir: 'down' };
    this.enterExplore();
  }

  /* ── 選單 / 結局 ── */
  openMenu() {
    this.mode = 'menu'; this.input.clear();
    this.ui.openMenu({
      hero: this.hero, inventory: this.inventory, itemDefs: this.defs.items, questLog: this.questLog, ctx: this.ctx(), names: this.names(), steps: this.steps,
      xpNext: xpToNext(this.hero.level, this.g.levels.base),
      onUse: (id) => { const r = this.inventory.use(id, this.hero, this.defs.items); this.ui.toast(r.msg); this.ui.refreshMenu(); },
      onSave: () => this.save(),
      onTitle: () => this.showTitle(),
      onClose: () => this.closeMenu(),
    });
  }
  closeMenu() { this.ui.closeMenu(); this.enterExplore(); }
  showEnding() {
    this.mode = 'ending'; this.flags.ending = true; this.runner.cancel();
    this.save(true);
    this.ui.hideDialogue(); this.ui.showHud(false);
    const e = this.g.ending || { title: '全劇終', text: '感謝遊玩!' };
    this.ui.ending({ title: e.title, text: e.text, onRestart: () => this.showTitle() });
    this.onEvent('ending');
  }

  /* ── 畫面 ── */
  resize() {
    const dpr = Math.min(2, this.win.devicePixelRatio || 1);
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cssW * dpr); this.canvas.height = Math.round(this.cssH * dpr);
    this.dpr = dpr;
  }
  draw() {
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    if (this.mode === 'title' || this.mode === 'ending' || !this.hero) { ctx.fillStyle = '#1b2838'; ctx.fillRect(0, 0, W, H); return; }
    if (this.mode === 'battle' && this.battle) { drawBattleScene(ctx, W, H, this.battle.enemies, this.t, this.hurtIdx, this.battleTheme, this.images); return; }
    const map = this.map, tw = map.tw;
    // 每格在畫面上至少 MIN_CELL、最多 MAX_CELL css 像素(不管卡帶的圖塊是 16 還是 32px),畫面寬約放 13 格;
    // 放大倍率取整數,像素圖塊才不會糊、不會有接縫
    const MIN_CELL = 44, MAX_CELL = 112;
    const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, this.cssW / 13));
    let zoom = Math.max(1, Math.round(cell * this.dpr / tw));
    if (tw * zoom / this.dpr < MIN_CELL) zoom += 1;
    const s = tw * zoom;
    let hx = this.pos.x, hy = this.pos.y;
    if (this.move) { const k = Math.min(1, this.move.t); hx = this.move.fx + (this.move.tx - this.move.fx) * k; hy = this.move.fy + (this.move.ty - this.move.fy) * k; }
    const cam = { x: hx * s + s / 2 - W / 2, y: hy * s + s / 2 - H / 2, w: W, h: H };
    cam.x = Math.max(0, Math.min(map.w * s - W, cam.x)); cam.y = Math.max(0, Math.min(map.h * s - H, cam.y));
    if (map.w * s < W) cam.x = (map.w * s - W) / 2; if (map.h * s < H) cam.y = (map.h * s - H) / 2;
    ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, W, H);
    drawMap(ctx, map, this.palette, this.images, cam, zoom, this.t);
    for (const o of map.objects) {
      if (!this.visible(o)) continue;
      const px = o.tx * s - cam.x, py = o.ty * s - cam.y;
      if (px < -s || py < -s || px > W || py > H) continue;
      if (o.type === 'item') drawItem(ctx, this.defs.items[o.props.item], px, py, s, this.t);
      else if (o.type === 'npc') this.drawNpc(ctx, o, px, py, s);
    }
    // 主角:有走路圖就畫圖(走路時一格 4 幀輪、站著列 0),沒有(或抓不到)就程式畫
    const look = this.g.hero.look || { color: '#3f7fd6' }, heroSheet = look.sheet && this.images[look.sheet];
    const hpx = hx * s - cam.x, hpy = hy * s - cam.y;
    if (heroSheet) drawSheet(ctx, heroSheet, this.pos.dir, this.move ? Math.floor(this.move.t * 4) : 0, hpx, hpy, s);
    else drawChar(ctx, look, hpx, hpy, s, this.pos.dir, this.move ? this.move.t : 0);
    // 面前的 NPC 給一個小提示
    const [dx, dy] = DELTA[this.pos.dir];
    const front = objectsAt(map, this.pos.x + dx, this.pos.y + dy, (o) => (o.type === 'npc' || o.type === 'heal') && this.visible(o))[0];
    if (front && !this.move) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `${Math.round(s * 0.4)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', front.tx * s - cam.x + s / 2, front.ty * s - cam.y - s * 0.1 + Math.sin(this.t * 4) * s * 0.05); }
  }
  // NPC 的畫法,優先序:image(怪物圖,欄照 face、幀用時間輪)→ sheet(走路圖,站著用列 0)→ shape(程式畫的怪)→ 程式畫的小人;
  // 圖抓不到(images 裡沒有)就往下一個退
  drawNpc(ctx, o, px, py, s) {
    const p = o.props, im = p.image && this.images[p.image], sh = p.sheet && this.images[p.sheet];
    if (im) drawEnemyImage(ctx, im, px + s / 2, py + s / 2, s, this.t, false, p.face || 'down');
    else if (sh) drawSheet(ctx, sh, p.face || 'down', 0, px, py, s);
    else if (p.shape) drawEnemy(ctx, { shape: p.shape, color: p.color || '#888' }, px + s / 2, py + s / 2, s, this.t, false);
    else drawChar(ctx, { color: p.color || '#8d6e4c', hair: p.hair, skin: p.skin }, px, py, s, p.face || 'down', 0);
  }
}
