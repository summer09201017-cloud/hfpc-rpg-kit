import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeStorage } from './helpers.mjs';
import { createSaveStore, migrateSave, SAVE_SCHEMA } from '../engine/save.js';

const sample = { gameId: 'demo', pos: { map: 'village', x: 4, y: 6, dir: 'right' }, hero: { level: 2, hp: 10 }, inventory: { items: { potion: 1 }, gold: 5 }, quests: { state: {}, base: {} }, flags: { a: true }, kills: { blob: 1 }, steps: 12 };

test('存了再讀回來一模一樣,並帶 schema 與時間', () => {
  const st = createSaveStore(fakeStorage(), 'k');
  assert.equal(st.has(), false);
  assert.equal(st.save(sample), true);
  assert.equal(st.has(), true);
  const back = st.load();
  assert.equal(back.schema, SAVE_SCHEMA);
  assert.match(back.savedAt, /^\d{4}-\d{2}-\d{2}T/);
  delete back.schema; delete back.savedAt;
  assert.deepEqual(back, sample);
  st.clear(); assert.equal(st.has(), false);
});

test('壞掉的存檔、太新的 schema、缺關鍵欄位 ⇒ 當沒存檔,不炸', () => {
  const s = fakeStorage();
  s.setItem('k', '{not json');
  assert.equal(createSaveStore(s, 'k').load(), null);
  assert.equal(migrateSave({ schema: SAVE_SCHEMA + 1, pos: {}, hero: {} }), null);
  assert.equal(migrateSave({ schema: 1, hero: {} }), null);
  assert.equal(migrateSave('x'), null);
});

test('儲存空間丟例外(私密模式 / 滿了)⇒ 回 false / null,不炸', () => {
  const st = createSaveStore(fakeStorage({ throwOnWrite: true, throwOnRead: true }), 'k');
  assert.equal(st.save(sample), false);
  assert.equal(st.load(), null);
  assert.equal(st.has(), false);
  assert.doesNotThrow(() => st.clear());
});
