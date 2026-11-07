// 輸入:鍵盤(方向鍵 / WASD、Enter / 空白 / Z = 確認、Esc / X = 取消或選單)+ 手機虛擬按鍵。
// held = 現在按住的方向(Set,保留按下順序,最後按的優先);queue = 按下一次就算一次的動作。
export class Input {
  constructor(target) {
    this.held = new Set();
    this.queue = [];
    this.target = target;
    this._down = (e) => {
      const k = this.mapKey(e.key);
      if (!k) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault();
      if (k.type === 'dir') { this.held.delete(k.dir); this.held.add(k.dir); }
      else if (!e.repeat) this.queue.push(k.type);
    };
    this._up = (e) => { const k = this.mapKey(e.key); if (k && k.type === 'dir') this.held.delete(k.dir); };
    this._blur = () => this.held.clear();
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    target.addEventListener('blur', this._blur);
  }
  mapKey(key) {
    switch (key) {
      case 'ArrowUp': case 'w': case 'W': return { type: 'dir', dir: 'up' };
      case 'ArrowDown': case 's': case 'S': return { type: 'dir', dir: 'down' };
      case 'ArrowLeft': case 'a': case 'A': return { type: 'dir', dir: 'left' };
      case 'ArrowRight': case 'd': case 'D': return { type: 'dir', dir: 'right' };
      case 'Enter': case ' ': case 'z': case 'Z': return { type: 'confirm' };
      case 'Escape': case 'x': case 'X': return { type: 'cancel' };
      default: return null;
    }
  }
  // 虛擬按鍵:容器裡 [data-dir=up|down|left|right] 與 [data-btn=confirm|cancel]
  bindPad(el) {
    if (!el) return;
    const press = (b, on) => {
      const d = b.dataset.dir, t = b.dataset.btn;
      if (d) { if (on) { this.held.delete(d); this.held.add(d); } else this.held.delete(d); }
      else if (t && on) this.queue.push(t);
      b.classList.toggle('on', on);
    };
    el.querySelectorAll('[data-dir],[data-btn]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} press(b, true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => press(b, false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }
  dir() { let last = null; for (const d of this.held) last = d; return last; }
  poll() { return this.queue.shift() || null; }
  clear() { this.queue.length = 0; }
  destroy() { this.target.removeEventListener('keydown', this._down); this.target.removeEventListener('keyup', this._up); this.target.removeEventListener('blur', this._blur); }
}
