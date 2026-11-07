// 對話:一個對話 id = 一串句子(節點)。節點種類(一句可以同時有好幾種):
//   { "speaker":"村長", "text":"你好!" }                      講一句;speaker 省略就沿用上一句的
//   { "text":"要幫忙嗎?", "choices":[{"label":"好","next":"d_yes"},{"label":"不","next":"d_no"}] }   選項 ⇒ 跳到別的對話
//   { "if":"quest:q1=done", "then":"d_after", "else":"d_before" }   條件跳轉(else 可省略=不跳,繼續下一句)
//   { "set":{"flag":"met_elder"} }                              設旗標
//   { "quest":"q1", "action":"start" | "complete" }             接任務 / 完成任務(目標沒達成時 complete 會跳過)
//   { "give":{"item":"potion","qty":1} }   { "gold": 20 }       給道具 / 給金幣(負數=扣)
//   { "battle":"boss_spider" }                                  打一場;沒打贏對話就結束
//   { "heal": true }   { "ending": true }   { "end": true }     全回復 / 進結局 / 提早結束
// 文字裡可用 {hero}=主角名、{gold}=金幣、{progress:q1}=任務進度(例如「綠團子 2/3」)
import { evalCond } from './cond.js';

export class DialogueRunner {
  // hooks: { ctx(), say({speaker,text,choices}) → Promise<選項索引|null>, hide(), battle(id) → Promise<'won'|'lost'|'fled'>,
  //          onSet(flag), onQuest(id, action), onGive(item, qty), onGold(n), heal(), ending(), progressText(questId) }
  constructor(defs, hooks) { this.defs = defs || {}; this.hooks = hooks; this.active = false; }

  fill(text) {
    const ctx = this.hooks.ctx();
    return String(text)
      .replace(/\{hero\}/g, ctx.hero.name)
      .replace(/\{gold\}/g, String(ctx.inventory.gold))
      .replace(/\{progress:([\w-]+)\}/g, (_, q) => this.hooks.progressText(q));
  }

  async start(id) {
    if (this.active) return;
    this.active = true; this.cur = id; this.i = 0; this.speaker = '';
    try { await this.run(); } finally { this.active = false; this.hooks.hide(); }
  }
  goto(id) { this.cur = id; this.i = 0; }
  cancel() { this.active = false; }

  async run() {
    let guard = 0;
    while (this.active) {
      if (++guard > 500) return;                       // 對話互相跳來跳去的保險絲
      const nodes = this.defs[this.cur] || [];
      if (this.i >= nodes.length) return;
      const n = nodes[this.i++];
      if (n.end) return;
      if (n.if != null) {
        if (evalCond(this.hooks.ctx(), n.if)) { this.goto(n.then); continue; }
        if (n.else != null) { this.goto(n.else); continue; }
        continue;
      }
      if (n.set && n.set.flag) this.hooks.onSet(n.set.flag);
      if (n.quest) this.hooks.onQuest(n.quest, n.action);
      if (n.give) this.hooks.onGive(n.give.item, n.give.qty || 1);
      if (n.gold != null) this.hooks.onGold(n.gold | 0);
      if (n.heal) this.hooks.heal();
      if (n.speaker != null) this.speaker = n.speaker;
      if (n.text != null) {
        const choices = Array.isArray(n.choices) && n.choices.length ? n.choices.map((c) => c.label) : null;
        const idx = await this.hooks.say({ speaker: this.speaker, text: this.fill(n.text), choices });
        if (!this.active) return;
        if (choices) { const c = n.choices[idx] || n.choices[0]; this.goto(c.next); continue; }
      }
      if (n.battle) {
        this.hooks.hide();
        const res = await this.hooks.battle(n.battle);
        if (res !== 'won') return;
      }
      if (n.ending) { this.hooks.ending(); return; }
    }
  }
}
