// 讀一張卡帶(games/<id>/ 底下的 JSON)。讀不到或 JSON 壞掉都收進 loadErrors,開場畫面會用白話列出來。
import { DATA_FILES, mapFileOf } from './schema.js';

export async function loadGame(gameId, base = `games/${gameId}/`) {
  const get = async (p) => {
    const r = await fetch(base + p, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`讀不到 ${base + p}(HTTP ${r.status})`);
    try { return await r.json(); } catch { throw new Error(`${base + p} 不是正確的 JSON(是不是少了逗號或引號?可以把整份貼到 jsonlint.com 檢查)`); }
  };
  const data = { id: gameId, base, maps: {}, loadErrors: [] };
  for (const f of DATA_FILES) {
    try { data[f.replace('.json', '')] = await get(f); } catch (e) { data.loadErrors.push(e.message); }
  }
  const maps = data.game && data.game.maps;
  if (maps && typeof maps === 'object') {
    for (const [id, m] of Object.entries(maps)) {
      const file = mapFileOf(m);
      if (!file) continue;
      try { data.maps[id] = await get(file); } catch (e) { data.loadErrors.push(e.message); }
    }
  }
  return data;
}
