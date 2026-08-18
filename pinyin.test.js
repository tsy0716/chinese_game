/**
 * 拼音质量把关 —— 跑：node --test pinyin.test.js
 *
 * 词库里只有汉字，拼音是 vendor/pinyin-pro.js 在运行时标的。所以「拼音对不对」
 * 不再是数据问题，而是这个库的问题 —— 这组测试就是拿整个词库去考它。
 *
 * 升级 vendor/pinyin-pro.js 之后必须重跑：它管着 657 个词会怎么印在卡片上。
 *
 * 卡得最死的两条：
 *   - 音节数必须等于汉字数（卡片上拼音是逐字标在汉字正上方的）
 *   - 常见多音字不许标错（长大 / 银行 / 重新 / 会计 这些一个都不能松）
 *
 * 已知标不对、因此不许进词库的词：
 *   系（本义 jì「系鞋带」，库里给 xì）—— 已从词库移除，换成「鞋带」
 *   还给 → hái gěi（应为 huán）    还书 → hái shū（应为 huán）
 *   教书 → jiào shū（应为 jiāo）    种花 → zhǒng huā（应为 zhòng）
 *   数数 → shuò shuò（应为 shǔ shù）
 * 老师在页面上自己加这类词时，状态栏会点名让他核对（logic.js 的 needsReview）。
 */
const test = require('node:test');
const assert = require('node:assert');

const P = require('./vendor/pinyin-pro.js');
const { packs } = require('./words.js');

/** 页面里用的就是这个调用方式：按音节拆开，一个音节对一个汉字 */
const toPinyin = (hanzi) => P.pinyin(hanzi, { type: 'array' });

const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]/;
/** 拼音允许出现的字符：小写字母、带调元音、ü */
const PINYIN_OK = /^[a-zü āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]+$/;

const ALL = packs.flatMap((pack) => pack.words.map((w) => [pack.name, w.hanzi]));

test('词库里的每个词，音节数都等于汉字数', () => {
  const bad = ALL
    .filter(([, hz]) => toPinyin(hz).length !== Array.from(hz).length)
    .map(([pack, hz]) => `${pack}「${hz}」-> ${toPinyin(hz).join(' ')}`);
  assert.deepStrictEqual(bad, [], '这些词标出来的音节数和汉字数对不上，卡片上会逐字对不齐');
});

test('每个词都标出了拼音，没有空的', () => {
  const empty = ALL.filter(([, hz]) => !toPinyin(hz).join(' ').trim());
  assert.deepStrictEqual(empty.map(([, hz]) => hz), []);
});

test('拼音里没有汉字、数字声调或大写字母', () => {
  const bad = ALL
    .map(([pack, hz]) => [pack, hz, toPinyin(hz).join(' ')])
    .filter(([, , py]) => !PINYIN_OK.test(py));
  assert.deepStrictEqual(bad.map(([pack, hz, py]) => `${pack}「${hz}」-> ${py}`), []);
});

test('每个词至少标了一个声调', () => {
  const bad = ALL
    .map(([pack, hz]) => [pack, hz, toPinyin(hz).join(' ')])
    .filter(([, , py]) => !TONE_MARK.test(py));
  assert.deepStrictEqual(bad.map(([pack, hz, py]) => `${pack}「${hz}」-> ${py}`), []);
});

test('轻声不至于泛滥 —— 一个词里带调的音节不少于一半', () => {
  const bad = ALL
    .map(([pack, hz]) => [pack, hz, toPinyin(hz)])
    .filter(([, , syl]) => syl.filter((s) => TONE_MARK.test(s)).length * 2 < syl.length);
  assert.deepStrictEqual(
    bad.map(([pack, hz, syl]) => `${pack}「${hz}」-> ${syl.join(' ')}`), [],
    '一个词大半是轻声，多半是这个库把声调丢了'
  );
});

test('常见多音字要按词义选对读音', () => {
  // 这些是实测能标对的，锁住不许退
  const cases = [
    ['长大', 'zhǎng dà'], ['长短', 'cháng duǎn'],
    ['银行', 'yín háng'], ['行人', 'xíng rén'],
    ['重新', 'chóng xīn'], ['重要', 'zhòng yào'],
    ['会计', 'kuài jì'], ['开会', 'kāi huì'],
    ['音乐', 'yīn yuè'], ['快乐', 'kuài lè'],
    ['觉得', 'jué de'], ['睡觉', 'shuì jiào'],
    ['头发', 'tóu fa'], ['发现', 'fā xiàn'],
    ['还有', 'hái yǒu'], ['干净', 'gān jìng'],
    ['干活', 'gàn huó'], ['教室', 'jiào shì'],
    ['数学', 'shù xué'], ['种子', 'zhǒng zi'],
  ];
  for (const [hanzi, want] of cases) {
    assert.strictEqual(toPinyin(hanzi).join(' '), want, `${hanzi} 的读音标错了`);
  }
});

test('「一 / 不」要按实际变调标', () => {
  const cases = [
    ['一共', 'yí gòng'], ['一起', 'yì qǐ'], ['一样', 'yí yàng'],
    ['不客气', 'bú kè qì'], ['不要', 'bú yào'],
  ];
  for (const [hanzi, want] of cases) {
    assert.strictEqual(toPinyin(hanzi).join(' '), want, `${hanzi} 的变调标错了`);
  }
});

test('词库里几个当初特意标过的读音，库也得标对', () => {
  // 这些词原先是人工标注的，删掉人工拼音时逐个核对过 —— 别在升级库时悄悄退化
  const cases = [
    ['校长', 'xiào zhǎng'], ['头发', 'tóu fa'], ['发烧', 'fā shāo'],
    ['大衣', 'dà yī'], ['背心', 'bèi xīn'], ['长颈鹿', 'cháng jǐng lù'],
    ['长方形', 'cháng fāng xíng'], ['可乐', 'kě lè'], ['大象', 'dà xiàng'],
    ['饼干', 'bǐng gān'], ['好吃', 'hǎo chī'], ['鞋带', 'xié dài'],
  ];
  for (const [hanzi, want] of cases) {
    assert.strictEqual(toPinyin(hanzi).join(' '), want, `${hanzi} 的读音标错了`);
  }
});

test('浏览器里挂的是 window.pinyinPro，导出的函数名对得上', () => {
  assert.strictEqual(typeof P.pinyin, 'function');
});
