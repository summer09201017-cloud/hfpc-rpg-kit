import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { CHANGELOG, APP_VERSION } from '../engine/version.js';

test('頁尾版本號 = 更新紀錄最上面一筆 = sw.js CACHE 號(改殼層要兩邊一起 +1)', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const cache = /const CACHE = 'rpgkit-v(\d+)'/.exec(sw);
  assert.ok(cache, 'sw.js 找不到 CACHE');
  assert.equal(APP_VERSION, CHANGELOG[0].v);
  assert.equal(CHANGELOG[0].v, cache[1], `更新紀錄最新是 v${CHANGELOG[0].v},sw.js 是 v${cache[1]}`);
});

test('更新紀錄每筆有版號、日期、白話說明,版號由新到舊、日期不在未來', () => {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);   // 本地日期,不是 UTC
  let prev = Infinity;
  for (const c of CHANGELOG) {
    assert.match(c.v, /^\d+$/, `版號 ${c.v} 要是整數`);
    assert.ok(+c.v < prev, `版號 ${c.v} 沒有由新到舊`); prev = +c.v;
    assert.match(c.d, /^\d{4}-\d{2}-\d{2}$/, `日期 ${c.d} 格式`);
    assert.ok(c.d <= today, `日期 ${c.d} 在未來`);
    assert.ok(c.t.length >= 10 && !/\.(js|json|mjs)\b/.test(c.t), `v${c.v} 的說明要白話、不寫檔名`);
  }
});

test('sw.js 的 CORE 清單:列的檔案都存在,引擎與示範卡帶的檔案都有列', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const core = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
  for (const p of core) assert.ok(fs.existsSync(path.join(ROOT, p)), `CORE 列了不存在的檔 ${p}`);
  const want = [
    ...fs.readdirSync(path.join(ROOT, 'engine')).filter((f) => f.endsWith('.js')).map((f) => `./engine/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'games/demo')).filter((f) => f.endsWith('.json')).map((f) => `./games/demo/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'games/demo/maps')).filter((f) => f.endsWith('.json')).map((f) => `./games/demo/maps/${f}`),
    ...(fs.existsSync(path.join(ROOT, 'games/demo/assets')) ? fs.readdirSync(path.join(ROOT, 'games/demo/assets')).filter((f) => f.endsWith('.png')).map((f) => `./games/demo/assets/${f}`) : []),
  ];
  for (const p of want) assert.ok(core.includes(p), `${p} 沒進 sw.js 的 CORE,離線會缺`);
});
