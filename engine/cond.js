// 條件:對話的 if、物件的 showIf / hideIf 都用同一套。
// 字串寫法(給設計者,好打):
//   flag:boss_down          旗標已設   /   !flag:boss_down  旗標沒設
//   quest:q_slime=active    任務狀態(inactive / active / ready / done;逗號可列多個,例如 =active,done)
//   item:herb>=2            背包裡至少 2 個藥草(省略 >= 就是至少 1 個)
//   level>=5                等級至少 5
// 物件寫法也可以:{ "flag": "x" }、{ "quest": "q", "state": "done" }、{ "item": "herb", "qty": 2 }、{ "level": 5 }
export function parseCond(c) {
  if (c == null) return null;
  if (typeof c === 'object') return c;
  const s = String(c).trim();
  let m;
  if ((m = /^(!?)flag:([\w-]+)$/.exec(s))) return { flag: m[2], not: m[1] === '!' };
  if ((m = /^quest:([\w-]+)=([\w,]+)$/.exec(s))) return { quest: m[1], state: m[2] };
  if ((m = /^item:([\w-]+)(?:>=(\d+))?$/.exec(s))) return { item: m[1], qty: m[2] ? +m[2] : 1 };
  if ((m = /^level>=(\d+)$/.exec(s))) return { level: +m[1] };
  return { invalid: s };
}

// 回傳白話錯誤,沒錯回 null(驗證器用)
export function condError(c, refs) {
  const k = parseCond(c);
  if (!k) return '條件是空的';
  if (k.invalid != null) return `條件「${k.invalid}」看不懂;可用 flag:名字、!flag:名字、quest:任務=狀態、item:道具>=數量、level>=等級`;
  if (k.quest) {
    if (refs && !refs.quests[k.quest]) return `條件裡的任務 ${k.quest} 不在 quests.json`;
    const bad = String(k.state).split(',').filter((st) => !['inactive', 'active', 'ready', 'done'].includes(st));
    if (bad.length) return `任務狀態「${bad.join(',')}」不存在;只有 inactive / active / ready / done`;
  }
  if (k.item && refs && !refs.items[k.item]) return `條件裡的道具 ${k.item} 不在 items.json`;
  return null;
}

// ctx = { flags, questLog, inventory, hero, kills }
export function evalCond(ctx, c) {
  const k = parseCond(c);
  if (!k || k.invalid != null) return false;
  if (k.flag) { const v = !!ctx.flags[k.flag]; return k.not ? !v : v; }
  if (k.quest) {
    // ready(進行中且目標已達成)也算 active;要分辨「可以回報了」就先檢查 ready
    const st = ctx.questLog.stateOf(k.quest, ctx), want = String(k.state).split(',');
    return want.includes(st) || (st === 'ready' && want.includes('active'));
  }
  if (k.item) return ctx.inventory.count(k.item) >= (k.qty || 1);
  if (k.level != null) return ctx.hero.level >= k.level;
  return false;
}
