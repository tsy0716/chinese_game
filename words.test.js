/**
 * 词库数据体检 —— 跑：node --test
 *
 * 这个文件只管「有哪些词」。拼音标得对不对是 pinyin.test.js 的事 ——
 * 词库里已经不存拼音了，是 vendor/pinyin-pro.js 在运行时标出来的。
 *
 * 这些不变量都是「印出来才发现就晚了」的那类错：某个主题词数不够铺满
 * 最大网格、同一包里词重复、汉字栏里混进了拼音或标点。
 */
const test = require('node:test');
const assert = require('node:assert');

const { packs } = require('./words.js');

const CJK = /[㐀-䶿一-鿿]/;
// 汉字栏只许出现汉字：混进空格、拉丁字母、标点，多半是把拼音或者两个词写进了一格
const HANZI_ONLY = /^[㐀-䶿一-鿿豈-﫿]+$/;

// 页面提供的最大网格是 5 列 x 8 行 = 40 格，单个主题必须能独立铺满
const MAX_CELLS = 40;

const ALL = packs.flatMap((pack) => pack.words.map((w) => [pack.name, w]));

test('至少有 10 个主题包', () => {
  assert.ok(packs.length >= 10, `只有 ${packs.length} 个主题包`);
});

test('主题 id 不重复', () => {
  const ids = packs.map((p) => p.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('每个主题都能单独铺满最大网格（40 格）', () => {
  for (const pack of packs) {
    assert.ok(
      pack.words.length >= MAX_CELLS,
      `主题「${pack.name}」只有 ${pack.words.length} 个词，铺不满 ${MAX_CELLS} 格`
    );
  }
});

test('每个主题内部没有重复的词', () => {
  for (const pack of packs) {
    const seen = new Set();
    for (const w of pack.words) {
      assert.ok(!seen.has(w.hanzi), `主题「${pack.name}」里「${w.hanzi}」重复了`);
      seen.add(w.hanzi);
    }
  }
});

test('每个词都是非空汉字', () => {
  for (const [packName, w] of ALL) {
    assert.ok(w.hanzi && w.hanzi.length > 0, `主题「${packName}」有空词`);
    assert.ok(CJK.test(w.hanzi), `主题「${packName}」的「${w.hanzi}」不是汉字`);
  }
});

test('汉字栏里没有混进拼音、空格或标点', () => {
  // 词库改成只写汉字之后，手滑写成 '苹果 píng guǒ' 不会报错，
  // 只会变成一个印不出来的怪词 —— 所以这里卡死格式
  for (const [packName, w] of ALL) {
    assert.match(
      w.hanzi, HANZI_ONLY,
      `主题「${packName}」的「${w.hanzi}」不是纯汉字 —— 词库只写汉字，拼音由程序标`
    );
  }
});

test('词库里不存拼音 —— 拼音一律运行时生成', () => {
  for (const [packName, w] of ALL) {
    assert.strictEqual(
      w.pinyin, '',
      `主题「${packName}」的「${w.hanzi}」硬写了拼音「${w.pinyin}」；` +
        `词库只写汉字，需要订正读音就换个词，或在 pinyin.test.js 里锁住它`
    );
  }
});

test('一个词最多 4 个字 —— 再长的词一格里塞不下', () => {
  for (const [packName, w] of ALL) {
    assert.ok(
      Array.from(w.hanzi).length <= 4,
      `主题「${packName}」的「${w.hanzi}」有 ${Array.from(w.hanzi).length} 个字，太长了`
    );
  }
});
