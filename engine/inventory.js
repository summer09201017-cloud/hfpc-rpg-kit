// 背包與金幣。純邏輯、不碰 DOM。
export class Inventory {
  constructor(items = {}, gold = 0) { this.items = { ...items }; this.gold = gold | 0; }
  count(id) { return this.items[id] || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  add(id, n = 1) { if (!(n > 0)) return; this.items[id] = this.count(id) + n; }
  remove(id, n = 1) {
    const c = this.count(id);
    if (c < n) return false;
    if (c - n <= 0) delete this.items[id]; else this.items[id] = c - n;
    return true;
  }
  list(defs) { return Object.keys(this.items).map((id) => ({ id, qty: this.items[id], def: defs[id] || { name: id, type: 'material', desc: '' } })); }
  // 用道具:回 { ok, msg }。只有 heal 型能用;滿血滿魔時不消耗。
  use(id, hero, defs) {
    const def = defs[id];
    if (!def || !this.has(id)) return { ok: false, msg: '沒有這個道具' };
    if (def.type !== 'heal') return { ok: false, msg: `${def.name} 不能直接使用` };
    const hp0 = hero.hp, mp0 = hero.mp;
    if (def.hp) hero.hp = Math.min(hero.maxHp, hero.hp + def.hp);
    if (def.mp) hero.mp = Math.min(hero.maxMp, hero.mp + def.mp);
    if (hero.hp === hp0 && hero.mp === mp0) return { ok: false, msg: '現在用了也沒效果' };
    this.remove(id, 1);
    const parts = [];
    if (hero.hp > hp0) parts.push(`體力 +${hero.hp - hp0}`);
    if (hero.mp > mp0) parts.push(`魔力 +${hero.mp - mp0}`);
    return { ok: true, msg: `用了 ${def.name}:${parts.join('、')}` };
  }
  toJSON() { return { items: { ...this.items }, gold: this.gold }; }
}
