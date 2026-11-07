// 畫面上的文字層(DOM):開場、對話框、選單、戰鬥指令、提示、結局、錯誤清單。
// 全部是真的按鈕,手機點得到、自動驗收也點得到。地圖與怪物畫在 canvas(sprites.js),這裡不畫圖。
export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

export class UI {
  constructor(root) {
    this.root = root;
    this.hud = h('div', { class: 'hud hidden', id: 'hud' });
    this.dlg = h('div', { class: 'dlg hidden', id: 'dlg' });
    this.panel = h('div', { class: 'panel hidden', id: 'panel' });
    this.bt = h('div', { class: 'battle hidden', id: 'battle' });
    this.toastEl = h('div', { class: 'toast hidden', id: 'toast' });
    this.screen = h('div', { class: 'screen hidden', id: 'screen' });
    root.append(this.hud, this.dlg, this.panel, this.bt, this.toastEl, this.screen);
    this._dlg = null; this._hudSig = ''; this._toastTimer = 0; this._menu = null;
  }

  /* ── 抬頭顯示 ── */
  showHud(on) { this.hud.classList.toggle('hidden', !on); }
  setHud({ hero, gold, mapName }) {
    const sig = [hero.level, hero.hp, hero.maxHp, hero.mp, hero.maxMp, gold, mapName].join('|');
    if (sig === this._hudSig) return; this._hudSig = sig;
    const bar = (cls, v, m) => h('div', { class: `bar ${cls}` }, h('i', { style: `width:${Math.max(0, Math.min(100, (v / Math.max(1, m)) * 100))}%` }), h('b', { text: `${v}/${m}` }));
    this.hud.replaceChildren(
      h('div', { class: 'hud-name', text: `${hero.name} Lv${hero.level}` }),
      h('div', { class: 'hud-row' }, h('span', { text: '體力' }), bar('hp', hero.hp, hero.maxHp)),
      h('div', { class: 'hud-row' }, h('span', { text: '魔力' }), bar('mp', hero.mp, hero.maxMp)),
      h('div', { class: 'hud-gold', text: `💰 ${gold}　📍 ${mapName}` }),
    );
  }

  /* ── 整頁畫面(開場 / 結局 / 錯誤)── */
  showScreen(...kids) { this.screen.replaceChildren(...kids); this.screen.classList.remove('hidden'); }
  hideScreen() { this.screen.classList.add('hidden'); }
  title({ title, subtitle, intro, howto, hasSave, saveInfo, onNew, onContinue }) {
    this.showScreen(h('div', { class: 'card title-card' },
      h('h1', { text: title }),
      subtitle && h('p', { class: 'sub', text: subtitle }),
      intro && h('p', { class: 'intro', text: intro }),
      h('div', { class: 'btns' },
        hasSave && h('button', { id: 'btn-continue', class: 'primary', onclick: onContinue }, '▶ 繼續冒險', saveInfo ? h('small', { text: saveInfo }) : null),
        h('button', { id: 'btn-new', class: hasSave ? '' : 'primary', onclick: () => { if (hasSave && !confirm('開始新遊戲會蓋掉現在的存檔,確定嗎?')) return; onNew(); } }, '✨ 開始新遊戲'),
      ),
      howto && howto.length && h('details', { class: 'howto', open: '' }, h('summary', { text: '使用說明' }), h('ul', {}, howto.map((s) => h('li', { text: s })))),
    ));
  }
  ending({ title, text, onRestart }) {
    this.showScreen(h('div', { class: 'card ending-card' }, h('h1', { text: title }), h('p', { class: 'intro', text: text }), h('div', { class: 'btns' }, h('button', { id: 'btn-ending-title', class: 'primary', onclick: onRestart }, '回到標題'))));
  }
  errors(errors, warnings = []) {
    this.showScreen(h('div', { class: 'card err-card' },
      h('h1', { text: '這張卡帶還不能玩' }),
      h('p', { text: `有 ${errors.length} 個地方要修。修好、存檔、重新整理就好:` }),
      h('ol', { id: 'err-list' }, errors.map((e) => h('li', { text: e }))),
      warnings.length ? h('details', {}, h('summary', { text: `另有 ${warnings.length} 個提醒(不擋)` }), h('ul', {}, warnings.map((w) => h('li', { text: w })))) : null,
    ));
  }

  /* ── 對話框:say() 回傳 Promise,等玩家按下一句或選了選項 ── */
  say({ speaker, text, choices }) {
    return new Promise((resolve) => {
      this._dlg = { choices, sel: 0, resolve };
      const body = [
        speaker ? h('div', { class: 'dlg-name', text: speaker }) : null,
        h('div', { class: 'dlg-text', id: 'dlg-text', text: text }),
      ];
      if (choices) body.push(h('div', { class: 'dlg-choices' }, choices.map((c, i) => h('button', { class: 'dlg-choice' + (i === 0 ? ' sel' : ''), onclick: () => this._pick(i) }, c))));
      else body.push(h('button', { class: 'dlg-next', id: 'dlg-next', onclick: () => this._pick(null) }, '▼ 下一句'));
      this.dlg.replaceChildren(...body);
      this.dlg.classList.remove('hidden');
    });
  }
  _pick(i) { const d = this._dlg; if (!d) return; this._dlg = null; d.resolve(i); }
  dialogueNext() { const d = this._dlg; if (!d) return; this._pick(d.choices ? d.sel : null); }
  dialogueMove(dir) {
    const d = this._dlg; if (!d || !d.choices) return;
    d.sel = (d.sel + (dir === 'up' ? -1 : 1) + d.choices.length) % d.choices.length;
    this.dlg.querySelectorAll('.dlg-choice').forEach((b, i) => b.classList.toggle('sel', i === d.sel));
  }
  hideDialogue() { this.dlg.classList.add('hidden'); this.dlg.replaceChildren(); if (this._dlg) { const d = this._dlg; this._dlg = null; d.resolve(null); } }
  get dialogueOpen() { return !!this._dlg; }

  /* ── 選單(狀態 / 道具 / 任務 / 系統)── */
  openMenu(o) { this._menu = { ...o, tab: 'status' }; this.renderMenu(); this.panel.classList.remove('hidden'); }
  closeMenu() { this._menu = null; this.panel.classList.add('hidden'); this.panel.replaceChildren(); }
  get menuOpen() { return !!this._menu; }
  refreshMenu() { if (this._menu) this.renderMenu(); }
  renderMenu() {
    const m = this._menu; if (!m) return;
    const { hero, inventory, itemDefs, questLog, ctx, names } = m;
    const tabs = [['status', '狀態'], ['items', '道具'], ['quests', '任務'], ['system', '系統']];
    let body;
    if (m.tab === 'status') {
      body = h('table', { class: 'stats' }, [['名字', hero.name], ['等級', hero.level], ['經驗值', `${hero.xp} / 升級還差 ${Math.max(0, m.xpNext - hero.xp)}`], ['體力', `${hero.hp} / ${hero.maxHp}`], ['魔力', `${hero.mp} / ${hero.maxMp}`], ['攻擊', hero.atk], ['防禦', hero.def], ['速度', hero.spd], ['金幣', inventory.gold], ['走過的步數', m.steps]].map(([k, v]) => h('tr', {}, h('th', { text: k }), h('td', { text: String(v) }))));
    } else if (m.tab === 'items') {
      const list = inventory.list(itemDefs);
      body = list.length ? h('ul', { class: 'items' }, list.map((it) => h('li', {}, h('b', { text: `${it.def.name} ×${it.qty}` }), h('span', { text: it.def.desc || '' }), it.def.type === 'heal' ? h('button', { class: 'use', onclick: () => m.onUse(it.id) }, '使用') : null))) : h('p', { class: 'empty', text: '背包是空的' });
    } else if (m.tab === 'quests') {
      const all = questLog.list();
      const active = all.filter((q) => q.state === 'active'), done = all.filter((q) => q.state === 'done');
      body = h('div', {},
        h('h3', { text: '進行中' }), active.length ? h('ul', { class: 'quests' }, active.map((q) => h('li', {}, h('b', { text: q.def.title }), h('span', { text: q.def.desc }), h('em', { text: questLog.progressText(q.id, ctx, names) })))) : h('p', { class: 'empty', text: '目前沒有任務,去找村裡的人聊聊吧' }),
        done.length ? h('h3', { text: '已完成' }) : null, done.length ? h('ul', { class: 'quests done' }, done.map((q) => h('li', {}, h('b', { text: `✔ ${q.def.title}` })))) : null);
    } else {
      body = h('div', { class: 'btns col' },
        h('button', { id: 'btn-save', class: 'primary', onclick: m.onSave }, '💾 存檔(單一存檔槽)'),
        h('button', { id: 'btn-title', onclick: () => { if (confirm('回到標題畫面?沒存的進度會不見。')) m.onTitle(); } }, '回到標題畫面'),
        h('p', { class: 'hint', text: '床邊按確認也會存檔。存檔只存在這台裝置的瀏覽器裡。' }));
    }
    this.panel.replaceChildren(
      h('div', { class: 'tabs' }, tabs.map(([id, label]) => h('button', { id: `menu-tab-${id}`, class: m.tab === id ? 'on' : '', onclick: () => { m.tab = id; this.renderMenu(); } }, label))),
      h('div', { class: 'panel-body' }, body),
      h('button', { class: 'close', id: 'menu-close', onclick: m.onClose }, '✕ 關閉'),
    );
  }

  /* ── 戰鬥指令區 ── */
  showBattle({ hero, battle, itemDefs, onAction }) {
    this._battle = { hero, battle, itemDefs, onAction, target: battle.firstAlive(), sub: null, log: [] };
    this.bt.classList.remove('hidden');
    this.renderBattle();
  }
  hideBattle() { this._battle = null; this.bt.classList.add('hidden'); this.bt.replaceChildren(); }
  updateBattle(battle, hero) { const b = this._battle; if (!b) return; b.battle = battle; b.hero = hero; if (!battle.enemies[b.target] || battle.enemies[b.target].hp <= 0) b.target = battle.firstAlive(); this.renderBattle(); }
  logBattle(lines) { const b = this._battle; if (!b) return; b.log.push(...lines); b.log = b.log.slice(-4); this.renderBattle(); }
  renderBattle() {
    const b = this._battle; if (!b) return;
    const { hero, battle } = b;
    const targets = h('div', { class: 'targets' }, battle.enemies.map((e) => h('button', { class: 'battle-target' + (e.idx === b.target ? ' sel' : '') + (e.hp <= 0 ? ' dead' : ''), disabled: e.hp <= 0 ? '' : null, onclick: () => { b.target = e.idx; b.sub = null; this.renderBattle(); } }, `${e.label} ${e.hp}/${e.maxHp}`)));
    let cmds;
    const back = h('button', { class: 'back', onclick: () => { b.sub = null; this.renderBattle(); } }, '← 返回');
    if (b.sub === 'skill') cmds = h('div', { class: 'cmds' }, hero.skills.map((s) => h('button', { class: 'battle-skill', disabled: hero.mp < s.mp ? '' : null, onclick: () => { b.sub = null; b.onAction({ type: 'skill', id: s.id, target: b.target }); } }, `${s.name}(魔力 ${s.mp})`)), back);
    else if (b.sub === 'item') { const list = b.hero && b.battle.inventory.list(b.itemDefs).filter((it) => it.def.type === 'heal'); cmds = h('div', { class: 'cmds' }, list.length ? list.map((it) => h('button', { class: 'battle-item', onclick: () => { b.sub = null; b.onAction({ type: 'item', id: it.id }); } }, `${it.def.name} ×${it.qty}`)) : h('span', { class: 'empty', text: '沒有能用的道具' }), back); }
    else cmds = h('div', { class: 'cmds' },
      h('button', { id: 'battle-cmd-attack', class: 'primary', onclick: () => b.onAction({ type: 'attack', target: b.target }) }, '⚔ 攻擊'),
      h('button', { id: 'battle-cmd-skill', onclick: () => { b.sub = 'skill'; this.renderBattle(); } }, '✨ 技能'),
      h('button', { id: 'battle-cmd-item', onclick: () => { b.sub = 'item'; this.renderBattle(); } }, '🎒 道具'),
      h('button', { id: 'battle-cmd-run', onclick: () => b.onAction({ type: 'run' }) }, '🏃 逃跑'));
    this.bt.replaceChildren(
      h('div', { class: 'bt-hero', id: 'bt-hero', text: `${hero.name} Lv${hero.level}　體力 ${hero.hp}/${hero.maxHp}　魔力 ${hero.mp}/${hero.maxMp}` }),
      targets,
      h('div', { class: 'bt-log', id: 'battle-log' }, b.log.map((l) => h('div', { text: l }))),
      cmds,
    );
  }
  battleResult({ title, lines }) {
    return new Promise((resolve) => {
      this.bt.replaceChildren(
        h('div', { class: 'bt-result' }, h('h2', { text: title }), h('div', { class: 'bt-log' }, lines.map((l) => h('div', { text: l }))), h('button', { id: 'battle-continue', class: 'primary', onclick: () => resolve() }, '繼續')),
      );
    });
  }

  toast(msg, ms = 2200) {
    this.toastEl.textContent = msg; this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }
}
