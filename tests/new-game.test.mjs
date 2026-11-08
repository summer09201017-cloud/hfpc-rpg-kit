// 開新卡帶(scripts/new-game.mjs):複製出來的卡帶驗證零錯誤、id 與標題改對、名字不合法或已存在會拒絕
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { createGame } from '../scripts/new-game.mjs';
import { loadGameDir } from '../scripts/lib/load-fs.mjs';
import { validateGame } from '../engine/schema.js';

const name = `_tmp-newgame-${process.pid}`;
const dir = path.join(ROOT, 'games', name);

test('建一張暫存卡帶:validate 零錯誤、id / title / subtitle 改好、美術也複製到;做完刪掉', () => {
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    const r = createGame(name, { title: '測試冒險' });
    assert.equal(r.dir, dir); assert.equal(r.id, name); assert.equal(r.title, '測試冒險');
    const data = loadGameDir(dir);
    assert.deepEqual(data.loadErrors, []);
    assert.equal(data.game.id, name); assert.equal(data.game.title, '測試冒險'); assert.equal(data.game.subtitle, '(改我)');
    const v = validateGame(data);
    assert.deepEqual(v.errors, []);
    assert.equal(Object.keys(v.maps).length, 2);
    assert.ok(fs.existsSync(path.join(dir, 'assets', 'tiny-town.png')));
    assert.throws(() => createGame(name), /已經存在/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.ok(!fs.existsSync(dir));
});

test('名字不合法會拒絕;沒給標題就用「名字(改我)」', () => {
  for (const bad of ['', '中文名', 'a b', 'x/y', 'demo!']) assert.throws(() => createGame(bad), /只能用英文字母/, bad);
  const name2 = `${name}-b`, dir2 = path.join(ROOT, 'games', name2);
  try { const r = createGame(name2); assert.equal(r.title, `${name2}(改我)`); } finally { fs.rmSync(dir2, { recursive: true, force: true }); }
});
