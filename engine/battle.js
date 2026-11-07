// 回合制戰鬥 + 升等。純邏輯、不碰 DOM,node 測得動。
// 規則(刻意簡單,讓設計者調數字就有感):
//   傷害 = max(1, 攻擊×倍率 − 防禦×0.5) × 0.85~1.15 隨機;8% 會心一擊 ×1.5
//   每回合玩家先動,再輪到每隻活著的怪攻擊;spd 只影響逃跑成功率
//   逃跑成功率 = 0.5 + (主角 spd − 最快的怪 spd)/100,夾在 0.2~0.9;fixed(頭目戰)不能逃
//   升下一級要的經驗 = base × 等級^1.5(四捨五入);升級時依 growth 加數值並補回加的那些體力魔力

export function xpToNext(level, base) { return Math.round(base * Math.pow(level, 1.5)); }

export function makeHero(def) {
  const h = {
    name: def.name, level: def.level || 1, xp: 0,
    hp: def.hp, maxHp: def.hp, mp: def.mp, maxMp: def.mp,
    atk: def.atk, def: def.def, spd: def.spd,
    skills: (def.skills || []).map((s) => ({ ...s })),
  };
  return h;
}

export function heroFromSave(saved, def) {
  const h = makeHero(def);
  for (const k of ['name', 'level', 'xp', 'hp', 'maxHp', 'mp', 'maxMp', 'atk', 'def', 'spd']) if (saved && Number.isFinite(saved[k])) h[k] = saved[k]; else if (saved && k === 'name' && typeof saved[k] === 'string') h[k] = saved[k];
  h.hp = Math.max(1, Math.min(h.hp, h.maxHp)); h.mp = Math.max(0, Math.min(h.mp, h.maxMp));
  return h;
}

// 加經驗;回傳升了哪些級 [{ level, gains }]
export function gainXp(hero, amount, levels) {
  const ups = [];
  hero.xp += Math.max(0, amount | 0);
  const g = (levels && levels.growth) || {};
  const max = (levels && levels.max) || 99, base = (levels && levels.base) || 10;
  while (hero.level < max && hero.xp >= xpToNext(hero.level, base)) {
    hero.xp -= xpToNext(hero.level, base);
    hero.level++;
    const gains = { hp: g.hp | 0, mp: g.mp | 0, atk: g.atk | 0, def: g.def | 0, spd: g.spd | 0 };
    hero.maxHp += gains.hp; hero.hp = Math.min(hero.maxHp, hero.hp + gains.hp);
    hero.maxMp += gains.mp; hero.mp = Math.min(hero.maxMp, hero.mp + gains.mp);
    hero.atk += gains.atk; hero.def += gains.def; hero.spd += gains.spd;
    ups.push({ level: hero.level, gains });
  }
  if (hero.level >= max) hero.xp = 0;
  return ups;
}

export function damage(rng, atk, def, mult = 1) {
  const base = Math.max(1, atk * mult - def * 0.5);
  const crit = rng() < 0.08;
  const v = Math.round(base * rng.range(0.85, 1.15) * (crit ? 1.5 : 1));
  return { dmg: Math.max(1, v), crit };
}

export function spawnEnemies(ids, enemyDefs) {
  const seen = {};
  return ids.map((id, i) => {
    const d = enemyDefs[id];
    seen[id] = (seen[id] || 0) + 1;
    const label = ids.filter((x) => x === id).length > 1 ? `${d.name} ${String.fromCharCode(64 + seen[id])}` : d.name;
    return { idx: i, id, name: d.name, label, hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, spd: d.spd, xp: d.xp, gold: d.gold, drops: d.drops || [], sprite: d.sprite, boss: !!d.boss };
  });
}

export class Battle {
  // opts: { hero, enemyIds, enemyDefs, itemDefs, inventory, rng, fixed }
  constructor(opts) {
    this.hero = opts.hero; this.inventory = opts.inventory; this.itemDefs = opts.itemDefs || {}; this.rng = opts.rng;
    this.fixed = !!opts.fixed;
    this.enemies = spawnEnemies(opts.enemyIds, opts.enemyDefs);
    this.phase = 'player'; // player | won | lost | fled
    this.round = 1;
    this.log = [];
    this.events = [];
  }
  alive() { return this.enemies.filter((e) => e.hp > 0); }
  firstAlive() { const a = this.alive(); return a.length ? a[0].idx : -1; }
  push(ev) { this.events.push(ev); if (ev.msg) this.log.push(ev.msg); }

  // action: {type:'attack', target} | {type:'skill', id, target} | {type:'item', id} | {type:'run'}
  act(action) {
    this.events = [];
    if (this.phase !== 'player') return this.events;
    const hero = this.hero;
    let endTurn = true;
    if (action.type === 'attack' || action.type === 'skill') {
      let mult = 1, label = '攻擊';
      if (action.type === 'skill') {
        const sk = hero.skills.find((s) => s.id === action.id);
        if (!sk) { this.push({ t: 'fail', msg: '沒有這個技能' }); return this.events; }
        if (hero.mp < sk.mp) { this.push({ t: 'fail', msg: `魔力不夠,${sk.name} 需要 ${sk.mp} 點` }); return this.events; }
        hero.mp -= sk.mp; mult = sk.mult; label = sk.name;
      }
      const target = this.enemies[action.target] && this.enemies[action.target].hp > 0 ? this.enemies[action.target] : this.enemies[this.firstAlive()];
      if (!target) return this.events;
      const { dmg, crit } = damage(this.rng, hero.atk, target.def, mult);
      target.hp = Math.max(0, target.hp - dmg);
      this.push({ t: 'hit', who: 'hero', target: target.idx, dmg, crit, msg: `${hero.name} 的${label}${crit ? '會心一擊!' : ''}對 ${target.label} 造成 ${dmg} 點傷害` });
      if (target.hp <= 0) this.push({ t: 'down', target: target.idx, msg: `${target.label} 倒下了` });
    } else if (action.type === 'item') {
      const r = this.inventory.use(action.id, hero, this.itemDefs);
      this.push({ t: r.ok ? 'item' : 'fail', msg: r.msg });
      if (!r.ok) return this.events;
    } else if (action.type === 'run') {
      if (this.fixed) { this.push({ t: 'fail', msg: '這場戰鬥逃不掉!' }); return this.events; }
      const fastest = Math.max(...this.alive().map((e) => e.spd));
      const p = Math.min(0.9, Math.max(0.2, 0.5 + (hero.spd - fastest) / 100));
      if (this.rng() < p) { this.phase = 'fled'; this.push({ t: 'fled', msg: '成功逃走了' }); return this.events; }
      this.push({ t: 'runfail', msg: '逃不掉!' });
    } else {
      this.push({ t: 'fail', msg: '不認得的動作' }); return this.events;
    }
    if (!this.alive().length) { this.phase = 'won'; this.push({ t: 'won', msg: '戰鬥勝利!' }); return this.events; }
    if (endTurn) this.enemyTurn();
    return this.events;
  }

  enemyTurn() {
    const hero = this.hero;
    for (const e of this.alive()) {
      const { dmg, crit } = damage(this.rng, e.atk, hero.def, 1);
      hero.hp = Math.max(0, hero.hp - dmg);
      this.push({ t: 'hit', who: 'enemy', source: e.idx, dmg, crit, msg: `${e.label} 的攻擊${crit ? '會心一擊!' : ''}對 ${hero.name} 造成 ${dmg} 點傷害` });
      if (hero.hp <= 0) { this.phase = 'lost'; this.push({ t: 'lost', msg: `${hero.name} 倒下了……` }); return; }
    }
    this.round++;
  }

  // 勝利結算(只算倒下的怪):經驗、金幣、掉落
  rewards() {
    const r = { xp: 0, gold: 0, drops: [], kills: {} };
    for (const e of this.enemies) {
      if (e.hp > 0) continue;
      r.xp += e.xp; r.gold += e.gold; r.kills[e.id] = (r.kills[e.id] || 0) + 1;
      for (const d of e.drops) if (this.rng() < d.chance) r.drops.push({ item: d.item, qty: d.qty || 1 });
    }
    return r;
  }
}
