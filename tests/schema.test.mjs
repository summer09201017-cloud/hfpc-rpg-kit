import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDemo, clone } from './helpers.mjs';
import { validateGame } from '../engine/schema.js';

const demo = loadDemo();
const mutate = (fn) => { const d = clone(demo); fn(d); return validateGame(d); };
const hasErr = (v, re) => v.errors.some((e) => re.test(e));

test('示範卡帶零錯誤', () => {
  const v = validateGame(demo);
  assert.deepEqual(v.errors, []);
  assert.equal(Object.keys(v.maps).length, 2);
});

test('突變:每種常見填錯都要被抓到,而且訊息講得出是哪裡', () => {
  let v = mutate((d) => { delete d.items.potion; });
  assert.ok(hasErr(v, /hero\.items 的道具 potion 不在 items\.json/), v.errors.join('\n'));
  assert.ok(hasErr(v, /任務 q_slime 的獎勵道具 potion/));

  v = mutate((d) => { d.dialogues.elder[6].choices[0].next = 'elder_yesss'; });
  assert.ok(hasErr(v, /對話 elder 第 7 句 的選項 1 的 next「elder_yesss」/), v.errors.join('\n'));

  v = mutate((d) => { d.game.start.x = 0; });
  assert.ok(hasErr(v, /起點.*不能走的格子/), v.errors.join('\n'));

  v = mutate((d) => { d.game.start.x = 99; });
  assert.ok(hasErr(v, /起點.*超出地圖/));

  v = mutate((d) => { d.maps.village.layers[3].objects.find((o) => o.type === 'portal').properties.find((p) => p.name === 'map').value = 'dungeon'; });
  assert.ok(hasErr(v, /物件「洞口」.*目標地圖 dungeon 不在/), v.errors.join('\n'));

  v = mutate((d) => { d.encounters.field.groups[0].enemies = ['dragon']; });
  assert.ok(hasErr(v, /遭遇表 field 第 1 組的怪物 dragon 不在 enemies\.json/));

  v = mutate((d) => { d.maps.cave.layers[0].data.pop(); });
  assert.ok(hasErr(v, /地圖 cave:圖層「ground」的格子數 191 不等於 16×12=192/), v.errors.join('\n'));

  v = mutate((d) => { d.dialogues.guard[0].if = 'quest:q_boss==active'; });
  assert.ok(hasErr(v, /對話 guard 第 1 句 的 if:條件「quest:q_boss==active」看不懂/), v.errors.join('\n'));

  v = mutate((d) => { d.dialogues.elder[5].texts = 'typo'; });
  assert.ok(hasErr(v, /對話 elder 第 6 句 有不認得的欄位:texts/));

  v = mutate((d) => { d.maps.village.layers[0].data[6 * 24 + 4] = 999; });   // 999 不在任何圖片圖塊集、tiles.json 也沒有
  assert.ok(hasErr(v, /地圖 village 用了圖塊 gid 999,但 tiles\.json 沒有這一號、也沒有圖片圖塊集涵蓋它/), v.errors.join('\n'));
  v = mutate((d) => { d.maps.village.layers[0].data[6 * 24 + 4] = 99; });    // 99 在 Tiny Town 圖裡 ⇒ 不用寫 tiles.json
  assert.ok(!hasErr(v, /gid 99/), v.errors.join('\n'));

  v = mutate((d) => { d.maps.village.tilesets[0].source = 'x.tsx'; delete d.maps.village.tilesets[0].name; });
  assert.ok(hasErr(v, /圖塊集 x\.tsx 是外部檔案/));

  v = mutate((d) => { d.maps.village.layers[0].encoding = 'base64'; });
  assert.ok(hasErr(v, /壓縮格式;Tiled 的 Tile Layer Format 請設成 CSV/));

  v = mutate((d) => { d.maps.village.layers[3].objects.find((o) => o.name === '村長').type = 'villager'; });
  assert.ok(hasErr(v, /物件「村長」.*Type\/Class「villager」不認得/));

  v = mutate((d) => { d.enemies.blob.sprite.shape = 'dragon'; });
  assert.ok(hasErr(v, /怪物 blob 的 sprite\.shape 只能是/));

  v = mutate((d) => { d.quests.q_slime.objective.type = 'escort'; });
  assert.ok(hasErr(v, /任務 q_slime 的 objective\.type 只能是 kill \/ collect \/ flag/));

  v = mutate((d) => { d.game.levels.growth.hp = -1; });
  assert.ok(hasErr(v, /levels\.growth\.hp 要是 0 以上的整數/));
});

test('提醒(不擋):沒人會 start 的任務、沒人指到的對話、拿不到的道具', () => {
  let v = mutate((d) => { d.dialogues.elder_yes.shift(); });
  assert.equal(v.errors.length, 0);
  assert.ok(v.warnings.some((w) => /任務 q_slime 沒有任何對話會 start 它/.test(w)), v.warnings.join('\n'));

  v = mutate((d) => { d.dialogues.orphan = [{ text: 'hi' }]; });
  assert.ok(v.warnings.some((w) => /對話 orphan 沒有 NPC 或其他對話指到它/.test(w)));

  v = mutate((d) => { d.items.gem = { name: '寶石', type: 'key', desc: '' }; });
  assert.ok(v.warnings.some((w) => /道具 gem 沒有任何地方拿得到/.test(w)));
});

test('壞掉的 JSON / 讀不到的檔會變成白話錯誤,不會炸', () => {
  const v = validateGame({ game: null });
  assert.ok(hasErr(v, /game\.json 不是 JSON 物件/));
  const v2 = validateGame({ game: { id: 'x', title: 't', maps: { a: 'maps/a.json' } }, maps: {} });
  assert.ok(hasErr(v2, /地圖 a 的檔案讀不到/));
  assert.ok(hasErr(v2, /tiles\.json 要是 JSON 物件/));
  assert.deepEqual(v2.imageKeys, []);
});

const elderOf = (d) => d.maps.village.layers[3].objects.find((o) => o.name === '村長');

test('突變:走路圖 / 怪物圖的路徑填錯要被抓到(主角 sheet、NPC sheet / image、怪物 sprite.image)', () => {
  let v = mutate((d) => { d.game.hero.look.sheet = 123; });
  assert.ok(hasErr(v, /game\.json 的 hero\.look\.sheet 要是相對卡帶資料夾的圖片路徑/), v.errors.join('\n'));
  v = mutate((d) => { d.game.hero.look.sheet = '../secret/hero.png'; });
  assert.ok(hasErr(v, /hero\.look\.sheet .*不能有 \.\./), v.errors.join('\n'));
  v = mutate((d) => { d.game.hero.look.sheet = '/assets/actors/hero.png'; });
  assert.ok(hasErr(v, /hero\.look\.sheet .*不能用 \/ 開頭/), v.errors.join('\n'));
  v = mutate((d) => { d.game.hero.look.sheet = '   '; });
  assert.ok(hasErr(v, /hero\.look\.sheet/));
  v = mutate((d) => { d.game.hero.look = 'blue'; });
  assert.ok(hasErr(v, /game\.json 的 hero\.look 要是物件/), v.errors.join('\n'));
  v = mutate((d) => { delete d.game.hero.look; });
  assert.deepEqual(v.errors, [], 'look 整個不填也可以(程式畫)');

  v = mutate((d) => { elderOf(d).properties.find((p) => p.name === 'sheet').value = 'assets\\actors\\elder.png'; });
  assert.ok(hasErr(v, /物件「村長」.*的 sheet 要是相對卡帶資料夾的圖片路徑/), v.errors.join('\n'));
  v = mutate((d) => { elderOf(d).properties.find((p) => p.name === 'sheet').value = 7; });
  assert.ok(hasErr(v, /物件「村長」.*的 sheet /));
  v = mutate((d) => { elderOf(d).properties.push({ name: 'image', type: 'string', value: '' }); });
  assert.ok(hasErr(v, /物件「村長」.*的 image 要是相對卡帶資料夾的圖片路徑/), v.errors.join('\n'));
  v = mutate((d) => { elderOf(d).properties.find((p) => p.name === 'face').value = 'north'; });
  assert.ok(hasErr(v, /物件「村長」.*的 face 只能是/), v.errors.join('\n'));

  v = mutate((d) => { d.enemies.blob.sprite.image = ''; });
  assert.ok(hasErr(v, /怪物 blob 的 sprite\.image 要是相對卡帶資料夾的圖片路徑/), v.errors.join('\n'));
  v = mutate((d) => { d.enemies.blob.sprite.image = 'assets/../x.png'; });
  assert.ok(hasErr(v, /怪物 blob 的 sprite\.image/));
  v = mutate((d) => { d.enemies.blob.sprite = { image: 'assets/monsters/blob.png' }; });
  assert.ok(hasErr(v, /怪物 blob 的 sprite\.shape 只能是.*有 image 也要填/), v.errors.join('\n'));
});

test('imageKeys:圖塊集 + 主角走路圖 + NPC 走路圖 + 怪物圖,去重;填對的不報錯,同時有 sheet 與 image 只提醒', () => {
  const v = validateGame(demo);
  assert.deepEqual(v.errors, []);
  assert.deepEqual([...v.imageKeys].sort(), ['assets/actors/elder.png', 'assets/actors/hero.png', 'assets/tiny-dungeon.png', 'assets/tiny-town.png', 'assets/water.png']);
  assert.equal(new Set(v.imageKeys).size, v.imageKeys.length);

  const v2 = mutate((d) => {
    d.enemies.blob.sprite.image = 'assets/monsters/blob.png';
    d.enemies.wolf.sprite.image = 'assets/monsters/blob.png';   // 兩隻怪共用一張圖 ⇒ 只收一次
    elderOf(d).properties.push({ name: 'image', type: 'string', value: 'assets/monsters/boss.png' });
  });
  assert.deepEqual(v2.errors, [], v2.errors.join('\n'));
  assert.ok(v2.warnings.some((w) => /物件「村長」.*同時有 sheet(.*)與 image/.test(w)), v2.warnings.join('\n'));
  assert.equal(v2.imageKeys.filter((k) => k === 'assets/monsters/blob.png').length, 1);
  assert.ok(v2.imageKeys.includes('assets/monsters/boss.png'));
});
