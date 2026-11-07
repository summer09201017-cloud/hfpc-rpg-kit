// RPG 套件 SW — 網路優先、離線退快取(改版必 bump CACHE;engine/version.js 的 CHANGELOG 最上面一筆要同號,tests/version.test.mjs 會擋)
// v1(2026-11-08):首發
// v2(2026-11-08):手機方向鍵點一下也走一格
const CACHE = 'rpgkit-v2';
const CORE = [
  './', './index.html', './manifest.json', './icon.svg',
  './engine/main.js', './engine/loader.js', './engine/schema.js', './engine/map.js', './engine/cond.js', './engine/rng.js',
  './engine/input.js', './engine/ui.js', './engine/inventory.js', './engine/quest.js', './engine/dialogue.js', './engine/battle.js',
  './engine/save.js', './engine/sprites.js', './engine/version.js',
  './games/demo/game.json', './games/demo/tiles.json', './games/demo/dialogues.json', './games/demo/quests.json',
  './games/demo/items.json', './games/demo/enemies.json', './games/demo/encounters.json',
  './games/demo/maps/village.json', './games/demo/maps/cave.json',
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // 統計、留言 widget 等跨站請求不碰
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request);
      if (r.ok) (await caches.open(CACHE)).put(e.request, r.clone());
      return r;
    } catch {
      return (await caches.match(e.request)) || Response.error();
    }
  })());
});
// 🏷️ 版號回報:頁尾問「實際執行中的版本」,答案=本 SW 的快取名
self.addEventListener('message', (e) => {
  if (e && e.data === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'SW_VERSION', v: CACHE });
});
