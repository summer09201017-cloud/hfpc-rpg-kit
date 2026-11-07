// 決定性亂數(mulberry32):同一個種子 ⇒ 同一串結果。
// 測試用 ?seed=7 就能重現「第幾步遇到什麼怪」;正式遊玩不帶 seed 用時間。
export function makeRng(seed) {
  let s = (Number(seed) >>> 0) || ((Date.now() % 2147483647) >>> 0) || 1;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (a, b) => a + Math.floor(rng() * (b - a + 1));          // 含兩端
  rng.range = (a, b) => a + rng() * (b - a);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.weighted = (arr, weightOf) => {                                // 依權重抽一個
    const ws = arr.map((x) => Math.max(0, Number(weightOf(x)) || 0));
    const total = ws.reduce((a, b) => a + b, 0);
    if (!total) return arr[arr.length - 1];
    let r = rng() * total;
    for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r < 0) return arr[i]; }
    return arr[arr.length - 1];
  };
  rng.seed = s;
  return rng;
}
