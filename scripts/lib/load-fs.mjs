// 從硬碟讀一張卡帶(給驗證器與測試用;瀏覽器用 engine/loader.js,兩邊回傳同一種形狀)
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { DATA_FILES, mapFileOf } from '../../engine/schema.js';

export function loadGameDir(dir) {
  const data = { id: basename(dir), base: dir, maps: {}, loadErrors: [] };
  const read = (p) => {
    const f = join(dir, p);
    if (!existsSync(f)) throw new Error(`讀不到 ${f}`);
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${f} 不是正確的 JSON(${e.message});是不是少了逗號或引號?`); }
  };
  for (const f of DATA_FILES) { try { data[f.replace('.json', '')] = read(f); } catch (e) { data.loadErrors.push(e.message); } }
  const maps = data.game && data.game.maps;
  if (maps && typeof maps === 'object') {
    for (const [id, m] of Object.entries(maps)) {
      const file = mapFileOf(m);
      if (!file) continue;
      try { data.maps[id] = read(file); } catch (e) { data.loadErrors.push(e.message); }
    }
  }
  return data;
}
