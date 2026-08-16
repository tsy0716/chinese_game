/**
 * 纯逻辑测试 —— 零依赖，直接跑：
 *   node --test test.js
 */
const test = require('node:test');
const assert = require('node:assert');

const L = require('./logic.js');

// 测试用词池：20 个词，够铺 4x5，不够铺 5x6
const POOL = [
  { hanzi: '苹果', pinyin: 'píngguǒ' },
  { hanzi: '香蕉', pinyin: 'xiāngjiāo' },
  { hanzi: '西瓜', pinyin: 'xīguā' },
  { hanzi: '橘子', pinyin: 'júzi' },
  { hanzi: '葡萄', pinyin: 'pútáo' },
  { hanzi: '草莓', pinyin: 'cǎoméi' },
  { hanzi: '桃子', pinyin: 'táozi' },
  { hanzi: '梨', pinyin: 'lí' },
  { hanzi: '面包', pinyin: 'miànbāo' },
  { hanzi: '米饭', pinyin: 'mǐfàn' },
  { hanzi: '面条', pinyin: 'miàntiáo' },
  { hanzi: '饺子', pinyin: 'jiǎozi' },
  { hanzi: '包子', pinyin: 'bāozi' },
  { hanzi: '鸡蛋', pinyin: 'jīdàn' },
  { hanzi: '牛奶', pinyin: 'niúnǎi' },
  { hanzi: '果汁', pinyin: 'guǒzhī' },
  { hanzi: '蛋糕', pinyin: 'dàngāo' },
  { hanzi: '糖', pinyin: 'táng' },
  { hanzi: '汤', pinyin: 'tāng' },
  { hanzi: '茶', pinyin: 'chá' },
];

// ---------- makeRng：带种子的随机数 ----------

test('makeRng: 同一个种子产生同一串随机数', () => {
  const a = L.makeRng('abc');
  const b = L.makeRng('abc');
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepStrictEqual(seqA, seqB);
});

test('makeRng: 不同种子产生不同随机数', () => {
  const a = L.makeRng('abc');
  const b = L.makeRng('abd');
  assert.notDeepStrictEqual([a(), a(), a()], [b(), b(), b()]);
});

test('makeRng: 输出都落在 [0, 1) 区间', () => {
  const rng = L.makeRng('区间检查');
  for (let i = 0; i < 500; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `越界: ${v}`);
  }
});

// ---------- shuffle：洗牌 ----------

test('shuffle: 结果是原数组的一个排列，不多不少', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = L.shuffle(src, L.makeRng('s1'));
  assert.deepStrictEqual([...out].sort(), [...src].sort());
});

test('shuffle: 不改动原数组', () => {
  const src = [1, 2, 3, 4, 5];
  const copy = [...src];
  L.shuffle(src, L.makeRng('s2'));
  assert.deepStrictEqual(src, copy);
});

test('shuffle: 同种子结果一致，异种子结果不同', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepStrictEqual(L.shuffle(src, L.makeRng('x')), L.shuffle(src, L.makeRng('x')));
  assert.notDeepStrictEqual(L.shuffle(src, L.makeRng('x')), L.shuffle(src, L.makeRng('y')));
});

// ---------- pickN：抽词 ----------

test('pickN: 抽出指定个数，且互不重复', () => {
  const got = L.pickN(POOL, 8, L.makeRng('p1'));
  assert.strictEqual(got.length, 8);
  assert.strictEqual(new Set(got.map((w) => w.hanzi)).size, 8);
});

test('pickN: 抽出的词都来自词池', () => {
  const inPool = new Set(POOL.map((w) => w.hanzi));
  for (const w of L.pickN(POOL, 12, L.makeRng('p2'))) {
    assert.ok(inPool.has(w.hanzi), `${w.hanzi} 不在词池里`);
  }
});

test('pickN: 词不够时报错，而不是静默出空格', () => {
  assert.throws(() => L.pickN(POOL, 30, L.makeRng('p3')), /词.*不够|not enough/i);
});

// ---------- buildCard：单张卡 ----------

test('buildCard: 格子数 = 列 x 行，且词不重复', () => {
  const card = L.buildCard({ pool: POOL, cols: 4, rows: 5, seed: 'c1' });
  assert.strictEqual(card.cells.length, 20);
  assert.strictEqual(new Set(card.cells.map((w) => w.hanzi)).size, 20);
});

test('buildCard: 同一个种子必出同一张卡（丢卡可原样重印）', () => {
  const a = L.buildCard({ pool: POOL, cols: 4, rows: 4, seed: 'k3m9' });
  const b = L.buildCard({ pool: POOL, cols: 4, rows: 4, seed: 'k3m9' });
  assert.deepStrictEqual(a.cells, b.cells);
  assert.strictEqual(a.seed, 'k3m9');
});

test('buildCard: 不同种子出不同的卡', () => {
  const a = L.buildCard({ pool: POOL, cols: 4, rows: 4, seed: 'aaa' });
  const b = L.buildCard({ pool: POOL, cols: 4, rows: 4, seed: 'bbb' });
  assert.notDeepStrictEqual(a.cells, b.cells);
});

test('buildCard: 词池不够铺满时报错', () => {
  assert.throws(() => L.buildCard({ pool: POOL, cols: 5, rows: 6, seed: 'c2' }), /词.*不够|not enough/i);
});

// ---------- buildDeck：一整批卡 ----------

test('buildDeck: 生成指定张数，每张带独立可重印的种子', () => {
  const deck = L.buildDeck({ pool: POOL, cols: 4, rows: 5, count: 6, seed: 'deck1' });
  assert.strictEqual(deck.length, 6);
  deck.forEach((card, i) => {
    assert.strictEqual(card.index, i + 1);
    const reprint = L.buildCard({ pool: POOL, cols: 4, rows: 5, seed: card.seed });
    assert.deepStrictEqual(reprint.cells, card.cells, `第 ${i + 1} 张按种子重印对不上`);
  });
});

test('buildDeck: 同一批里没有两张一模一样的卡', () => {
  const deck = L.buildDeck({ pool: POOL, cols: 4, rows: 5, count: 12, seed: 'deck2' });
  const fingerprints = deck.map((c) => c.cells.map((w) => w.hanzi).join('|'));
  assert.strictEqual(new Set(fingerprints).size, deck.length);
});

test('buildDeck: 同种子重跑，整批卡完全一致', () => {
  const a = L.buildDeck({ pool: POOL, cols: 4, rows: 4, count: 5, seed: 'same' });
  const b = L.buildDeck({ pool: POOL, cols: 4, rows: 4, count: 5, seed: 'same' });
  assert.deepStrictEqual(a, b);
});

test('buildDeck: sameWords 模式下每张卡词语相同，只有位置不同', () => {
  const deck = L.buildDeck({
    pool: POOL, cols: 4, rows: 4, count: 8, seed: 'sw', sameWords: true,
  });
  const sorted = deck.map((c) => c.cells.map((w) => w.hanzi).sort().join('|'));
  assert.strictEqual(new Set(sorted).size, 1, '各张卡的词语集合应当完全相同');

  const ordered = deck.map((c) => c.cells.map((w) => w.hanzi).join('|'));
  assert.strictEqual(new Set(ordered).size, deck.length, '各张卡的摆放顺序应当各不相同');
});

test('buildDeck: 默认模式下大词池会抽出不同的词，不只是换位置', () => {
  const deck = L.buildDeck({ pool: POOL, cols: 4, rows: 4, count: 10, seed: 'diff' });
  const sorted = deck.map((c) => c.cells.map((w) => w.hanzi).sort().join('|'));
  assert.ok(new Set(sorted).size > 1, '20 选 16 应当抽出不同的词语组合');
});

// ---------- lines：所有可能的连线 ----------

test('lines: 5列x6行 连4 共 39 条线（横12 + 竖15 + 撇6 + 捺6）', () => {
  assert.strictEqual(L.lines(5, 6, 4).length, 39);
});

test('lines: 4列x6行 连4 共 24 条线', () => {
  assert.strictEqual(L.lines(4, 6, 4).length, 24);
});

test('lines: 每条线都是 need 个格子，且格子号不越界', () => {
  const all = L.lines(5, 6, 4);
  for (const line of all) {
    assert.strictEqual(line.length, 4);
    for (const idx of line) {
      assert.ok(idx >= 0 && idx < 30, `格子号越界: ${idx}`);
    }
  }
});

test('lines: 网格放不下 need 时返回空', () => {
  assert.deepStrictEqual(L.lines(3, 3, 4), []);
});

// ---------- findWin：判定获胜 ----------
// 5列x6行的格子编号：第 r 行第 c 列 = r * 5 + c

test('findWin: 认出横排连4', () => {
  const win = L.findWin([5, 6, 7, 8], 5, 6, 4);
  assert.deepStrictEqual(win, [5, 6, 7, 8]);
});

test('findWin: 不把跨行的连续编号当成横排', () => {
  // 3,4 在第0行末尾，5,6 在第1行开头 —— 编号连续但不同行，不算赢
  assert.strictEqual(L.findWin([3, 4, 5, 6], 5, 6, 4), null);
});

test('findWin: 认出竖排连4', () => {
  const win = L.findWin([2, 7, 12, 17], 5, 6, 4);
  assert.deepStrictEqual(win, [2, 7, 12, 17]);
});

test('findWin: 认出右下斜连4', () => {
  const win = L.findWin([0, 6, 12, 18], 5, 6, 4);
  assert.deepStrictEqual(win, [0, 6, 12, 18]);
});

test('findWin: 认出左下斜连4', () => {
  const win = L.findWin([3, 7, 11, 15], 5, 6, 4);
  assert.deepStrictEqual(win, [3, 7, 11, 15]);
});

test('findWin: 只连3不算赢', () => {
  assert.strictEqual(L.findWin([5, 6, 7], 5, 6, 4), null);
});

test('findWin: 散落4个不算赢', () => {
  assert.strictEqual(L.findWin([0, 7, 19, 26], 5, 6, 4), null);
});

test('findWin: 一个格子都没标不算赢', () => {
  assert.strictEqual(L.findWin([], 5, 6, 4), null);
});

test('findWin: 多标了无关格子也照样认出获胜线', () => {
  const win = L.findWin([5, 6, 7, 8, 0, 29], 5, 6, 4);
  assert.deepStrictEqual(win, [5, 6, 7, 8]);
});

// ---------- parseWordList：自定义词表 ----------

test('parseWordList: 解析「汉字 拼音」每行一个', () => {
  const got = L.parseWordList('苹果 píngguǒ\n香蕉 xiāngjiāo');
  assert.deepStrictEqual(got, [
    { hanzi: '苹果', pinyin: 'píngguǒ' },
    { hanzi: '香蕉', pinyin: 'xiāngjiāo' },
  ]);
});

test('parseWordList: 容忍多个空格、制表符和全角空格', () => {
  const got = L.parseWordList('苹果   píngguǒ\n香蕉\txiāngjiāo\n西瓜　xīguā');
  assert.deepStrictEqual(got.map((w) => w.pinyin), ['píngguǒ', 'xiāngjiāo', 'xīguā']);
});

test('parseWordList: 跳过空行和 # 注释行', () => {
  const got = L.parseWordList('# 这周新词\n\n苹果 píngguǒ\n\n  \n香蕉 xiāngjiāo\n');
  assert.strictEqual(got.length, 2);
});

test('parseWordList: 拼音带多个音节时整体保留', () => {
  const got = L.parseWordList('对不起 duì bu qǐ');
  assert.deepStrictEqual(got, [{ hanzi: '对不起', pinyin: 'duì bu qǐ' }]);
});

test('parseWordList: 只写汉字没写拼音时报错并指出行号', () => {
  assert.throws(() => L.parseWordList('苹果 píngguǒ\n香蕉'), /第 2 行/);
});

test('parseWordList: 拼音位置混进汉字时报错（多半是一行粘了两个词）', () => {
  assert.throws(() => L.parseWordList('苹果 píngguǒ 香蕉 xiāngjiāo'), /第 1 行/);
});

test('parseWordList: 汉字位置没有汉字时报错', () => {
  assert.throws(() => L.parseWordList('apple píngguǒ'), /第 1 行/);
});

test('parseWordList: 同一个词重复出现时只留一个', () => {
  const got = L.parseWordList('苹果 píngguǒ\n苹果 píngguǒ\n香蕉 xiāngjiāo');
  assert.strictEqual(got.length, 2);
});

test('parseWordList: 空文本得到空列表', () => {
  assert.deepStrictEqual(L.parseWordList('   \n\n'), []);
});

// ---------- alignPinyin：拼音逐字对齐汉字 ----------

test('alignPinyin: 一个音节配一个汉字', () => {
  assert.deepStrictEqual(L.alignPinyin('苹果', 'píng guǒ'), [
    { char: '苹', syllable: 'píng' },
    { char: '果', syllable: 'guǒ' },
  ]);
});

test('alignPinyin: 单字词也照样对齐', () => {
  assert.deepStrictEqual(L.alignPinyin('梨', 'lí'), [{ char: '梨', syllable: 'lí' }]);
});

test('alignPinyin: 三字词对齐', () => {
  const got = L.alignPinyin('对不起', 'duì bu qǐ');
  assert.deepStrictEqual(got.map((p) => p.char), ['对', '不', '起']);
  assert.deepStrictEqual(got.map((p) => p.syllable), ['duì', 'bu', 'qǐ']);
});

test('alignPinyin: 容忍多余空格', () => {
  assert.strictEqual(L.alignPinyin('苹果', '  píng   guǒ  ').length, 2);
});

test('alignPinyin: 音节数对不上时返回 null，交给调用方降级处理', () => {
  assert.strictEqual(L.alignPinyin('苹果', 'píngguǒ'), null, '连写的拼音无法逐字对齐');
  assert.strictEqual(L.alignPinyin('苹果', 'píng guǒ zi'), null, '音节多了');
  assert.strictEqual(L.alignPinyin('苹果', ''), null, '没有拼音');
});

test('alignPinyin: 汉字超出基本平面时按字符算，不按码元算', () => {
  // 𠀋 是一个 4 字节汉字，naive 的 .length 会算成 2 个字符
  const got = L.alignPinyin('𠀋田', 'zhàng tián');
  assert.deepStrictEqual(got, [
    { char: '𠀋', syllable: 'zhàng' },
    { char: '田', syllable: 'tián' },
  ]);
});
