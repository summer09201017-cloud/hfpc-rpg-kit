#!/usr/bin/env node
// 戰鬥平衡模擬:讓機器人代替玩家,在每個等級把遭遇表的每一組怪各打 n 場,算勝率、回合數、剩餘體力、經驗值,
// 然後告訴設計者「這一區幾等去打才安全」「從 Lv1 練到那個等級大概要打幾場」。
// 用法:node scripts/balance.mjs games/<卡帶> [--n 200] [--levels 1-10] [--seed 1] [--potions 0] [--json]
//   --n        每一格(等級 × 怪物組)打幾場(預設 200)
//   --levels   要試的等級範圍(預設 1-10;超過 game.json 的等級上限會自動截掉)
//   --seed     亂數種子(同一個種子 ⇒ 同一份結果;每一場用 seed×100000+場次)
//   --potions  背包先放幾瓶 items.json 第一個 heal 型道具,體力低於 35% 就喝(預設 0)
//   --json     印機器可讀的 JSON(給其他工具吃)
// 機器人的打法:有技能、魔力夠、倍率大於普攻就用倍率最高的技能,否則普攻;目標挑血最少的活怪。
// 純邏輯、零相依;核心函式 simulate() 匯出給測試用。
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGameDir } from './lib/load-fs.mjs';
import { validateGame } from '../engine/schema.js';
import { makeRng } from '../engine/rng.js';
import { Inventory } from '../engine/inventory.js';
import { Battle, makeHero, gainXp, xpToNext } from '../engine/battle.js';

const WIN_NORMAL = 0.9;   // 一般組:勝率到這裡才算「安全」
const WIN_BOSS = 0.75;    // 頭目(fixed):勝率到這裡就算可以挑戰
const MAX_ROUNDS = 500;   // 保險絲:超過這麼多回合還沒打完就當輸(照規則每回合都至少掉 1 點血,正常不會碰到)

/* ── 小工具 ── */
const names = (data, ids) => {
  const seen = [], count = {};
  for (const id of ids) { if (!count[id]) seen.push(id); count[id] = (count[id] || 0) + 1; }
  return seen.map((id) => `${(data.enemies[id] && data.enemies[id].name) || id}${count[id] > 1 ? `×${count[id]}` : ''}`).join('+');
};
const groupXp = (data, ids) => ids.reduce((s, id) => s + ((data.enemies[id] && data.enemies[id].xp) | 0), 0);

// 把主角練到某個等級(跟 engine/main.js 的 debug.setLevel 同一個做法),體力魔力全滿
export function heroAtLevel(game, level) {
  const h = makeHero(game.hero);
  const max = (game.levels && game.levels.max) || 99;
  while (h.level < Math.min(level, max)) gainXp(h, xpToNext(h.level, game.levels.base), game.levels);
  h.xp = 0; h.hp = h.maxHp; h.mp = h.maxMp;
  return h;
}

// 打一場:回 { won, rounds, hpLeft(0~1), xp }
export function fightOnce(data, hero, enemyIds, { rng, fixed = false, potion = null, potions = 0 }) {
  const h = { ...hero, skills: hero.skills.map((s) => ({ ...s })) };
  const inv = new Inventory(potion && potions > 0 ? { [potion]: potions } : {}, 0);
  const b = new Battle({ hero: h, enemyIds, enemyDefs: data.enemies, itemDefs: data.items, inventory: inv, rng, fixed });
  let guard = 0;
  while (b.phase === 'player' && guard++ < MAX_ROUNDS) {
    if (potion && h.hp < h.maxHp * 0.35 && inv.has(potion)) { b.act({ type: 'item', id: potion }); continue; }
    const alive = b.alive();
    const target = alive.reduce((best, e) => (e.hp < best.hp ? e : best), alive[0]);
    const sk = h.skills.filter((s) => s.mp <= h.mp && s.mult > 1).sort((a, c) => c.mult - a.mult)[0];
    b.act(sk ? { type: 'skill', id: sk.id, target: target.idx } : { type: 'attack', target: target.idx });
  }
  const won = b.phase === 'won';
  return { won, rounds: b.round, hpLeft: won ? h.hp / h.maxHp : 0, xp: won ? b.rewards().xp : 0 };
}

// 把 "1-10" / "3" / [1,2,3] 變成等級陣列
export function parseLevels(spec) {
  if (Array.isArray(spec)) return spec.map((n) => n | 0).filter((n) => n >= 1);
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(spec || '1-10').trim());
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  if (a < 1 || b < a || b - a > 98) return null;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/* ── 主模擬 ── */
// opts: { n, levels('1-10' 或陣列), seed, potions }
// 回傳 { game, n, seed, levels, potion, encounters: { id: { kind, rate, groups: [...], suggestLevel, grind } }, notes }
export function simulate(data, opts = {}) {
  const n = Math.max(1, opts.n | 0 || 200), seed = opts.seed == null ? 1 : opts.seed | 0, potions = Math.max(0, opts.potions | 0);
  const game = data.game, lvMax = (game.levels && game.levels.max) || 99, lvStart = game.hero.level || 1;
  const wanted = parseLevels(opts.levels == null ? '1-10' : opts.levels) || parseLevels('1-10');
  const levels = wanted.filter((L) => L >= lvStart && L <= lvMax);
  const notes = [];
  if (!levels.length) notes.push(`主角從 Lv${lvStart} 開始、等級上限 Lv${lvMax},你要試的等級都不在這個範圍裡`);
  if (wanted.some((L) => L > lvMax)) notes.push(`等級上限是 Lv${lvMax}(game.json 的 levels.max),超過的等級沒有算`);
  const potionId = potions > 0 ? Object.keys(data.items).find((id) => data.items[id] && data.items[id].type === 'heal') : null;
  if (potions > 0 && !potionId) notes.push('items.json 裡沒有 heal 型道具,--potions 沒有作用');
  const heroes = Object.fromEntries(levels.map((L) => [L, heroAtLevel(game, L)]));
  const out = { game: { id: game.id, title: game.title }, n, seed, levels, potion: potionId ? { item: potionId, name: data.items[potionId].name, qty: potions } : null, encounters: {}, notes };

  for (const [encId, enc] of Object.entries(data.encounters)) {
    const fixed = Array.isArray(enc.fixed);
    const defs = fixed ? [{ enemies: enc.fixed, weight: 1 }] : enc.groups;
    const groups = defs.map((gp, gi) => {
      const byLevel = {};
      for (const L of levels) {
        let wins = 0, rounds = 0, hpLeft = 0, xp = 0;
        for (let i = 0; i < n; i++) {
          const r = fightOnce(data, heroes[L], gp.enemies, { rng: makeRng(((seed * 100000 + i) >>> 0) || 1), fixed, potion: potionId, potions });
          if (r.won) { wins++; hpLeft += r.hpLeft; }
          rounds += r.rounds; xp += r.xp;
        }
        byLevel[L] = { winRate: wins / n, avgRounds: rounds / n, avgHpLeft: wins ? hpLeft / wins : 0, avgXp: xp / n };
      }
      const need = fixed ? WIN_BOSS : WIN_NORMAL;
      const suggestLevel = levels.find((L) => byLevel[L].winRate >= need) ?? null;
      return { index: gi, label: names(data, gp.enemies), enemies: gp.enemies.slice(), weight: fixed ? null : (gp.weight == null ? 1 : gp.weight), xp: groupXp(data, gp.enemies), byLevel, suggestLevel, need };
    });
    const suggestLevel = groups.every((g) => g.suggestLevel != null) ? Math.max(...groups.map((g) => g.suggestLevel)) : null;
    out.encounters[encId] = { kind: fixed ? 'fixed' : 'groups', rate: fixed ? null : enc.rate, groups, suggestLevel, grind: null };
  }

  // 「從 Lv1 練到建議等級要打幾場」:在某張(有 groups 的)表練,每一級的平均經驗 = 各組依 weight 加權的 avgXp
  const grindOn = (tableId, target) => {
    const t = out.encounters[tableId];
    if (!t || t.kind !== 'groups' || target == null) return null;
    const totalW = t.groups.reduce((s, g) => s + g.weight, 0);
    let fights = 0;
    for (let L = lvStart; L < target; L++) {
      if (!levels.includes(L)) return { fights: null, reason: `Lv${L} 沒有模擬到(--levels 範圍要涵蓋 Lv${lvStart}~Lv${target - 1})` };
      const xpPerFight = t.groups.reduce((s, g) => s + g.weight * g.byLevel[L].avgXp, 0) / totalW;
      if (xpPerFight <= 0) return { fights: null, reason: `Lv${L} 在這裡一場都打不贏,練不上去` };
      fights += xpToNext(L, game.levels.base) / xpPerFight;
    }
    return { fights: Math.ceil(fights), reason: null };
  };
  const grindTables = Object.keys(out.encounters).filter((id) => out.encounters[id].kind === 'groups');
  for (const [encId, t] of Object.entries(out.encounters)) {
    if (t.suggestLevel == null) continue;
    if (t.kind === 'groups') t.grind = { [encId]: grindOn(encId, t.suggestLevel) };
    else t.grind = Object.fromEntries(grindTables.map((id) => [id, grindOn(id, t.suggestLevel)]));
  }
  return out;
}

/* ── 文字報告 ── */
const width = (s) => [...String(s)].reduce((w, ch) => w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - width(s)));
const pct = (x) => `${Math.round(x * 100)}%`;

export function formatReport(res) {
  const L = [];
  L.push(`⚔ 戰鬥平衡模擬:《${res.game.title}》(每格 ${res.n} 場、種子 ${res.seed}${res.potion ? `、背包 ${res.potion.name}×${res.potion.qty}` : '、不帶藥水'})`);
  L.push('   每格 = 勝率 / 平均回合 / 打贏時剩餘體力;一般組勝率 ≥ 90%、頭目 ≥ 75% 的最低等級 = 建議等級');
  for (const note of res.notes) L.push(`   ⚠ ${note}`);
  const lvMaxTried = res.levels.length ? res.levels[res.levels.length - 1] : null;
  for (const [id, t] of Object.entries(res.encounters)) {
    L.push('');
    L.push(t.kind === 'fixed' ? `📋 遭遇表 ${id}(固定戰鬥/頭目)` : `📋 遭遇表 ${id}(每走一步 ${pct(t.rate)} 遇敵)`);
    const heads = t.groups.map((g) => `${g.label}${g.weight != null ? `(比重 ${g.weight})` : ''}`);
    const rows = res.levels.map((lv) => t.groups.map((g) => { const c = g.byLevel[lv]; return `${pct(c.winRate)} / ${c.avgRounds.toFixed(1)}回 / 剩${pct(c.avgHpLeft)}`; }));
    const colW = heads.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i]))) + 2);
    L.push(`   ${pad('等級', 6)}${heads.map((h, i) => pad(h, colW[i])).join('')}`);
    res.levels.forEach((lv, ri) => L.push(`   ${pad(`Lv${lv}`, 6)}${rows[ri].map((c, i) => pad(c, colW[i])).join('')}`));
    for (const g of t.groups) {
      L.push(g.suggestLevel != null
        ? `   → ${g.label}:Lv${g.suggestLevel} 起勝率 ≥ ${pct(g.need)}`
        : `   → ${g.label}:Lv${lvMaxTried} 以內打不贏(勝率沒到 ${pct(g.need)}),怪太強或主角太弱`);
    }
    if (t.suggestLevel != null) {
      L.push(`   ★ 建議等級 Lv${t.suggestLevel}`);
      for (const [where, gr] of Object.entries(t.grind || {})) {
        if (!gr) continue;
        L.push(gr.fights == null ? `     在 ${where} 練:${gr.reason}`
          : gr.fights === 0 ? `     主角一開始(Lv${res.levels[0]})就打得過,不用先練`
          : `     從 Lv${res.levels[0]} 在 ${where} 練到 Lv${t.suggestLevel} 大約要打 ${gr.fights} 場(不算任務獎勵的經驗)`);
      }
      if (t.kind === 'fixed' && !Object.keys(t.grind || {}).length) L.push('     (卡帶裡沒有可以練功的遇敵表,算不出要打幾場)');
    } else L.push(`   ★ Lv${lvMaxTried} 以內打不贏,怪太強或主角太弱`);
  }
  return L.join('\n');
}

/* ── CLI ── */
function parseArgs(argv) {
  const o = { json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (/^--(n|levels|seed|potions)$/.test(a)) o[a.slice(2)] = argv[++i];
    else if (/^--(n|levels|seed|potions)=/.test(a)) { const [k, v] = a.slice(2).split('='); o[k] = v; }
    else rest.push(a);
  }
  o.dir = rest[0];
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.dir) { console.error('用法:node scripts/balance.mjs games/<卡帶名> [--n 200] [--levels 1-10] [--seed 1] [--potions 0] [--json]'); process.exit(2); }
  const dir = resolve(o.dir);
  if (!existsSync(dir)) { console.error(`找不到卡帶資料夾 ${o.dir}`); process.exit(2); }
  if (o.levels != null && !parseLevels(o.levels)) { console.error(`--levels 要寫成「1-10」這樣(起始-結束,最多 99 級)`); process.exit(2); }
  const data = loadGameDir(dir);
  const v = data.loadErrors.length ? { errors: data.loadErrors } : validateGame(data);
  if (v.errors.length) {
    console.error(`❌ 卡帶有 ${v.errors.length} 個錯誤,先修好再模擬:`);
    v.errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    process.exit(1);
  }
  const res = simulate(data, { n: o.n == null ? 200 : +o.n, levels: o.levels, seed: o.seed == null ? 1 : +o.seed, potions: o.potions == null ? 0 : +o.potions });
  console.log(o.json ? JSON.stringify(res, null, 2) : formatReport(res));
}

