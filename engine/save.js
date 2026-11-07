// 存檔:單一存檔槽,localStorage,帶 schema 版號。
// 所有讀寫都包 try/catch(Safari 私密模式、被停用的儲存空間都不會炸),讀壞了就當沒存檔。
export const SAVE_SCHEMA = 1;

export function migrateSave(o) {
  if (!o || typeof o !== 'object') return null;
  const s = o.schema | 0;
  if (s > SAVE_SCHEMA) return null;           // 比引擎新的存檔不猜,當沒存檔
  // 以後 schema 升級在這裡逐版補欄位(schema 1 → 2 → …),舊存檔才不會壞
  if (!o.pos || !o.hero) return null;
  return { ...o, schema: SAVE_SCHEMA };
}

export function createSaveStore(storage, key) {
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  return {
    key,
    has() { return safe(() => !!storage.getItem(key), false); },
    load() {
      return safe(() => {
        const raw = storage.getItem(key);
        if (!raw) return null;
        return migrateSave(JSON.parse(raw));
      }, null);
    },
    save(data) {
      return safe(() => { storage.setItem(key, JSON.stringify({ ...data, schema: SAVE_SCHEMA, savedAt: new Date().toISOString() })); return true; }, false);
    },
    clear() { safe(() => storage.removeItem(key), null); },
  };
}
