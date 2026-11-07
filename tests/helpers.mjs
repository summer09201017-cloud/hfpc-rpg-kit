import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameDir } from '../scripts/lib/load-fs.mjs';
import { makeRng } from '../engine/rng.js';
import { Inventory } from '../engine/inventory.js';
import { QuestLog } from '../engine/quest.js';
import { makeHero } from '../engine/battle.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const loadDemo = () => loadGameDir(resolve(ROOT, 'games', 'demo'));
export const clone = (o) => JSON.parse(JSON.stringify(o));

// 一組假的遊戲狀態(給任務 / 條件 / 對話測試用)
export function fakeCtx(data = loadDemo(), over = {}) {
  const hero = makeHero(data.game.hero);
  const inventory = new Inventory(data.game.hero.items, data.game.hero.gold);
  const questLog = new QuestLog(data.quests);
  return { hero, inventory, questLog, flags: {}, kills: {}, rng: makeRng(1), data, ...over };
}

// 假的 localStorage
export function fakeStorage(opts = {}) {
  const m = new Map();
  return {
    getItem: (k) => { if (opts.throwOnRead) throw new Error('nope'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (opts.throwOnWrite) throw new Error('QuotaExceeded'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}
