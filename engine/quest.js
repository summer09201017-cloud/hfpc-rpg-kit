// 任務狀態機:inactive(沒接)→ active(進行中)→ done(完成)。
// 「ready」不是存起來的狀態,是 active 而且目標已達成,算出來的。
// 目標三種:kill(打倒 N 隻某怪;從接任務那一刻起算)/ collect(背包裡有 N 個某道具;完成時交出去)/ flag(某旗標被設)。
export class QuestLog {
  constructor(defs, saved) {
    this.defs = defs || {};
    this.state = {};   // id → 'active' | 'done'
    this.base = {};    // kill 型:接任務時已經打倒幾隻(之後只算新增的)
    if (saved && typeof saved === 'object') { Object.assign(this.state, saved.state || {}); Object.assign(this.base, saved.base || {}); }
  }
  rawState(id) { return this.state[id] || 'inactive'; }
  stateOf(id, ctx) {
    const s = this.rawState(id);
    return s === 'active' && this.objectiveMet(id, ctx) ? 'ready' : s;
  }
  start(id, ctx) {
    if (!this.defs[id] || this.rawState(id) !== 'inactive') return false;
    this.state[id] = 'active';
    const o = this.defs[id].objective;
    if (o && o.type === 'kill') this.base[id] = (ctx.kills[o.enemy] || 0);
    return true;
  }
  progress(id, ctx) {
    const o = this.defs[id] && this.defs[id].objective;
    if (!o) return { cur: 1, need: 1 };
    if (o.type === 'kill') return { cur: Math.max(0, Math.min(o.count, (ctx.kills[o.enemy] || 0) - (this.base[id] || 0))), need: o.count };
    if (o.type === 'collect') return { cur: Math.min(o.count, ctx.inventory.count(o.item)), need: o.count };
    if (o.type === 'flag') return { cur: ctx.flags[o.flag] ? 1 : 0, need: 1 };
    return { cur: 0, need: 1 };
  }
  // 給畫面看的進度字:「綠團子 2/3」「藥草 1/2」「進行中」
  progressText(id, ctx, names = {}) {
    const d = this.defs[id]; if (!d) return '';
    const o = d.objective, p = this.progress(id, ctx);
    if (!o) return '進行中';
    if (o.type === 'kill') return `${(names.enemies && names.enemies[o.enemy]) || o.enemy} ${p.cur}/${p.need}`;
    if (o.type === 'collect') return `${(names.items && names.items[o.item]) || o.item} ${p.cur}/${p.need}`;
    return p.cur >= p.need ? '可以回報了' : '進行中';
  }
  objectiveMet(id, ctx) { const p = this.progress(id, ctx); return p.cur >= p.need; }
  // 完成:交出收集物、發金幣與道具;經驗值交給呼叫端加(升等邏輯在 battle.js)
  complete(id, ctx) {
    if (this.rawState(id) !== 'active' || !this.objectiveMet(id, ctx)) return null;
    const d = this.defs[id], o = d.objective;
    if (o && o.type === 'collect' && o.consume !== false) ctx.inventory.remove(o.item, o.count);
    this.state[id] = 'done';
    const r = d.reward || {};
    const got = { xp: r.xp | 0, gold: r.gold | 0, items: { ...(r.items || {}) } };
    ctx.inventory.gold += got.gold;
    for (const [it, q] of Object.entries(got.items)) ctx.inventory.add(it, q);
    return got;
  }
  list() { return Object.keys(this.state).map((id) => ({ id, state: this.state[id], def: this.defs[id] })); }
  toJSON() { return { state: { ...this.state }, base: { ...this.base } }; }
}
