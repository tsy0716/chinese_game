/**
 * 词库数据体检 —— 跑：node --test
 *
 * 这些不变量都是「印出来才发现就晚了」的那类错：拼音漏标声调、
 * 拼音里混进汉字、某个主题词数不够铺满最大网格、同一包里词重复。
 */
const test = require('node:test');
const assert = require('node:assert');

const { packs } = require('./words.js');

const CJK = /[㐀-䶿一-鿿]/;
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]/;
// 拼音允许出现的字符：小写字母、带调元音、ü、隔音号、音节间空格
const PINYIN_OK = /^[a-zü āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ']+$/;

// 页面提供的最大网格是 5 列 x 8 行 = 40 格，单个主题必须能独立铺满
const MAX_CELLS = 40;

test('至少有 10 个主题包', () => {
  assert.ok(packs.length >= 10, `只有 ${packs.length} 个主题包`);
});

test('主题 id 不重复', () => {
  const ids = packs.map((p) => p.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('每个主题都能单独铺满最大网格（35 格）', () => {
  for (const pack of packs) {
    assert.ok(
      pack.words.length >= MAX_CELLS,
      `主题「${pack.name}」只有 ${pack.words.length} 个词，铺不满 ${MAX_CELLS} 格`
    );
  }
});

test('每个主题内部没有重复的词', () => {
  for (const pack of packs) {
    const seen = new Map();
    for (const w of pack.words) {
      assert.ok(!seen.has(w.hanzi), `主题「${pack.name}」里「${w.hanzi}」重复了`);
      seen.set(w.hanzi, true);
    }
  }
});

test('每个词的汉字栏都是汉字', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      assert.ok(w.hanzi && w.hanzi.length > 0, `主题「${pack.name}」有空汉字`);
      assert.ok(CJK.test(w.hanzi), `主题「${pack.name}」的「${w.hanzi}」不是汉字`);
    }
  }
});

test('拼音栏里没有混进汉字', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      assert.ok(
        !CJK.test(w.pinyin),
        `主题「${pack.name}」的「${w.hanzi}」拼音里有汉字：${w.pinyin}`
      );
    }
  }
});

test('每个词的拼音都标了声调', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      assert.ok(
        TONE_MARK.test(w.pinyin),
        `主题「${pack.name}」的「${w.hanzi}」拼音没标声调：${w.pinyin}`
      );
    }
  }
});

test('拼音只用小写字母、带调元音和隔音号（没有数字声调、没有大写）', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      assert.ok(
        PINYIN_OK.test(w.pinyin),
        `主题「${pack.name}」的「${w.hanzi}」拼音有非法字符：${w.pinyin}`
      );
    }
  }
});

test('拼音按音节用空格分开，不用隔音号（音节已分开，隔音号是多余的）', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      assert.ok(
        !w.pinyin.includes("'"),
        `主题「${pack.name}」的「${w.hanzi}」用了隔音号：${w.pinyin}，改成空格分音节`
      );
    }
  }
});

test('音节数必须等于汉字数 —— 卡片要逐字对齐，多一个少一个都对不上', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      const syllables = w.pinyin.split(/\s+/).filter(Boolean);
      assert.strictEqual(
        syllables.length,
        [...w.hanzi].length,
        `主题「${pack.name}」的「${w.hanzi}」有 ${[...w.hanzi].length} 个字，` +
          `但拼音「${w.pinyin}」是 ${syllables.length} 个音节`
      );
    }
  }
});

test('每个音节都各自标了声调（轻声除外）', () => {
  for (const pack of packs) {
    for (const w of pack.words) {
      const syllables = w.pinyin.split(/\s+/).filter(Boolean);
      const toned = syllables.filter((s) => TONE_MARK.test(s)).length;
      assert.ok(
        toned >= 1,
        `主题「${pack.name}」的「${w.hanzi}」一个声调都没标：${w.pinyin}`
      );
      // 一个词里轻声最多占一半还多一点，全是轻声基本就是漏标了
      assert.ok(
        toned * 2 >= syllables.length,
        `主题「${pack.name}」的「${w.hanzi}」轻声太多，八成漏标了：${w.pinyin}`
      );
    }
  }
});
