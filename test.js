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

// ---------- cellFontSizes：格子里的字号 ----------
//
// 字号计算放在这里而不是 CSS，就是为了能对「每个真实词 x 每种网格」跑穷举验证：
// 印出来才发现字被切掉或者小到看不清，就太晚了。

const CELL = { cellW: 38, cellH: 35 }; // 5x6 网格的一格，单位 mm

test('cellFontSizes: 纯汉字模式不出拼音', () => {
  const got = L.cellFontSizes({ mode: 'hanzi', ...CELL, hanzi: '苹果', pinyin: 'píng guǒ' });
  assert.ok(got.hanzi > 0);
  assert.strictEqual(got.pinyin, 0);
});

test('cellFontSizes: 纯拼音模式不出汉字', () => {
  const got = L.cellFontSizes({ mode: 'pinyin', ...CELL, hanzi: '苹果', pinyin: 'píng guǒ' });
  assert.strictEqual(got.hanzi, 0);
  assert.ok(got.pinyin > 0);
});

test('cellFontSizes: 汉字加拼音模式两样都出', () => {
  const got = L.cellFontSizes({ mode: 'both', ...CELL, hanzi: '苹果', pinyin: 'píng guǒ' });
  assert.ok(got.hanzi > 0 && got.pinyin > 0);
});

test('cellFontSizes: 未知模式报错，不静默出空格', () => {
  assert.throws(
    () => L.cellFontSizes({ mode: 'nope', ...CELL, hanzi: '苹果', pinyin: 'píng guǒ' }),
    /模式/
  );
});

test('cellFontSizes: 纯汉字模式下字越多字号越小', () => {
  const one = L.cellFontSizes({ mode: 'hanzi', ...CELL, hanzi: '鱼', pinyin: 'yú' });
  const four = L.cellFontSizes({ mode: 'hanzi', ...CELL, hanzi: '公共汽车', pinyin: 'gōng gòng qì chē' });
  assert.ok(four.hanzi < one.hanzi, `四字 ${four.hanzi} 应当小于单字 ${one.hanzi}`);
});

test('cellFontSizes: 纯拼音模式下拼音越长字号越小', () => {
  const short = L.cellFontSizes({ mode: 'pinyin', ...CELL, hanzi: '鱼', pinyin: 'yú' });
  const long = L.cellFontSizes({ mode: 'pinyin', ...CELL, hanzi: '公共汽车', pinyin: 'gōng gòng qì chē' });
  assert.ok(long.pinyin < short.pinyin, `长拼音 ${long.pinyin} 应当小于短拼音 ${short.pinyin}`);
});

test('cellFontSizes: 格子矮下来时字号跟着缩，不硬撑', () => {
  const tall = L.cellFontSizes({ mode: 'hanzi', cellW: 38, cellH: 35, hanzi: '苹果', pinyin: 'píng guǒ' });
  const short = L.cellFontSizes({ mode: 'hanzi', cellW: 38, cellH: 12, hanzi: '苹果', pinyin: 'píng guǒ' });
  assert.ok(short.hanzi < tall.hanzi, `矮格 ${short.hanzi} 应当小于高格 ${tall.hanzi}`);
});

test('cellFontSizes: 汉字加拼音模式下，宽高都不吃紧时拼音是汉字的四成', () => {
  const got = L.cellFontSizes({ mode: 'both', cellW: 80, cellH: 80, hanzi: '苹果', pinyin: 'píng guǒ' });
  assert.ok(
    Math.abs(got.pinyin / got.hanzi - 0.4) < 0.02,
    `拼音汉字比例是 ${(got.pinyin / got.hanzi).toFixed(3)}，应当接近 0.40`
  );
});

test('cellFontSizes: 拼音对不齐时（连写），整串拼音也不会撑破格子', () => {
  // 自定义词表里粘连写拼音、或者音节数和汉字数对不上时，走的是「整串居中」这条路。
  // 它横跨整格，所以未必比逐字对齐时小 —— 要保证的是不溢出。
  const cases = [
    ['对不起', 'duìbùqǐ'],
    ['没关系', 'méiguānxi'],
    ['苹果', 'píng guǒ zi'],          // 音节比汉字多
    ['公共汽车', 'gōnggòngqìchē'],
    ['长方形', 'chángfāngxíng'],
  ];
  for (const grid of ['4x6', '5x8']) {
    const [cols, rows] = grid.split('x').map(Number);
    const cell = { cellW: 190 / cols, cellH: 210 / rows };
    const availW = cell.cellW - L.METRICS.cellPadMm;
    for (const [hanzi, pinyin] of cases) {
      const got = L.cellFontSizes({ mode: 'both', ...cell, hanzi, pinyin, aligned: false });
      assert.ok(got.pinyin > 0, `${grid} 的「${hanzi}」拼音字号成了 0`);
      assert.ok(
        got.pinyin * L.pinyinEms(pinyin) <= availW + 1e-6,
        `${grid} 的「${hanzi}」整串拼音溢出：` +
          `${(got.pinyin * L.pinyinEms(pinyin)).toFixed(1)} > ${availW.toFixed(1)}mm`
      );
    }
  }
});

// ---------- 穷举：每个真实词 x 每种网格 x 每种模式 ----------

const { packs } = require('./words.js');
const ALL_WORDS = packs.flatMap((p) => p.words);
const GRID_W = 190, GRID_H = 210; // 卡片上网格区域的尺寸（mm），与 index.html 一致
const M = L.METRICS;

/** 把 '4x6' 这样的写法换算成一个格子的宽高 */
function cellOf(grid) {
  const [cols, rows] = grid.split('x').map(Number);
  return { cellW: GRID_W / cols, cellH: GRID_H / rows };
}

/** 一个格子里真正能放东西的宽高（扣掉内边距和格线） */
function availOf(cell) {
  const gone = M.cellPadMm + M.cellBorderMm;
  return { w: cell.cellW - gone, h: cell.cellH - gone };
}

/** 按算出来的字号，推算这个词实际占多大 */
function contentBox(mode, size, hanzi, pinyin) {
  const chars = Array.from(hanzi).length;
  const syllables = pinyin.split(/\s+/).filter(Boolean);
  const widest = Math.max(...syllables.map(L.pinyinEms));
  const pyLine = size.pinyin * M.pinyinLineHeight;
  const hzLine = size.hanzi * M.hanziLineHeight;

  if (mode === 'hanzi') return { w: size.hanzi * chars, h: hzLine };
  if (mode === 'pinyin') {
    // 长拼音会折成两行，宽高都得按实际折出来的行算
    const widestLine = Math.max(...size.pinyinLines.map(L.pinyinEms));
    return {
      w: size.pinyin * widestLine,
      h: pyLine * size.pinyinLines.length,
    };
  }
  // both：每个汉字一列，列宽取「汉字」和「该音节」中较宽的那个，列之间还有间隙
  const colW = Math.max(size.hanzi, widest * size.pinyin);
  return { w: colW * chars + M.colGapMm * (chars - 1), h: pyLine + hzLine };
}

for (const mode of ['both', 'hanzi', 'pinyin']) {
  test(`cellFontSizes 穷举[${mode}]：${ALL_WORDS.length} 个词在每种网格里都不溢出`, () => {
    for (const grid of L.GRIDS[mode]) {
      const cell = cellOf(grid);
      const { w: availW, h: availH } = availOf(cell);
      for (const word of ALL_WORDS) {
        const size = L.cellFontSizes({ mode, ...cell, hanzi: word.hanzi, pinyin: word.pinyin });
        const box = contentBox(mode, size, word.hanzi, word.pinyin);
        assert.ok(
          box.w <= availW + 1e-6,
          `${grid} 的格子里「${word.hanzi}」横向溢出：${box.w.toFixed(1)} > ${availW.toFixed(1)}mm`
        );
        assert.ok(
          box.h <= availH + 1e-6,
          `${grid} 的格子里「${word.hanzi}」纵向溢出：${box.h.toFixed(1)} > ${availH.toFixed(1)}mm`
        );
      }
    }
  });

  test(`cellFontSizes 穷举[${mode}]：每种网格下都没有小到看不清的字`, () => {
    // 下限按模式分开定：汉字笔画密，6mm（约 17pt）以下小学生扫读就吃力；
    // 拼音是拉丁小写字母，笔画稀疏，5.5mm（约 15.6pt）仍然清楚。
    const FLOOR = mode === 'pinyin' ? 5.5 : 6;
    for (const grid of L.GRIDS[mode]) {
      const cell = cellOf(grid);
      for (const word of ALL_WORDS) {
        const size = L.cellFontSizes({ mode, ...cell, hanzi: word.hanzi, pinyin: word.pinyin });
        const main = mode === 'pinyin' ? size.pinyin : size.hanzi;
        assert.ok(
          main >= FLOOR,
          `${grid} 的格子里「${word.hanzi}」主字号只有 ${main.toFixed(1)}mm，低于 ${FLOOR}mm`
        );
      }
    }
  });
}

test('GRIDS: 每种模式都给出了可选网格，且都是「列x行」格式', () => {
  for (const mode of ['both', 'hanzi', 'pinyin']) {
    assert.ok(L.GRIDS[mode].length > 0, `${mode} 没有可选网格`);
    for (const g of L.GRIDS[mode]) {
      assert.match(g, /^\d+x\d+$/, `${mode} 的网格写法不对：${g}`);
    }
  }
});

test('GRIDS: 默认模式（汉字+拼音）的每种网格，单选一个主题就能铺满', () => {
  const smallest = Math.min(...packs.map((p) => p.words.length));
  for (const g of L.GRIDS.both) {
    const [cols, rows] = g.split('x').map(Number);
    assert.ok(
      cols * rows <= smallest,
      `网格 ${g} 要 ${cols * rows} 格，但最小的主题只有 ${smallest} 个词`
    );
  }
});

test('GRIDS: 最密的网格，全部主题加起来也铺得满（页面会提示多选主题）', () => {
  const total = packs.reduce((sum, p) => sum + p.words.length, 0);
  const all = [...L.GRIDS.both, ...L.GRIDS.hanzi, ...L.GRIDS.pinyin];
  const densest = Math.max(...all.map((g) => {
    const [cols, rows] = g.split('x').map(Number);
    return cols * rows;
  }));
  assert.ok(densest <= total, `最密网格要 ${densest} 格，但全部词加起来只有 ${total} 个`);
});

// ---------- splitPinyinLines：长拼音折行 ----------

test('splitPinyinLines: 单音节折不出两行', () => {
  assert.deepStrictEqual(L.splitPinyinLines('yú', 2), ['yú']);
});

test('splitPinyinLines: 折在音节边界上，不会把音节劈开', () => {
  for (const line of L.splitPinyinLines('cháng fāng xíng', 2)) {
    for (const syl of line.split(' ')) {
      assert.ok(['cháng', 'fāng', 'xíng'].includes(syl), `音节被劈开了：${syl}`);
    }
  }
});

test('splitPinyinLines: 两行尽量等长，最长那行要比不折时短', () => {
  const whole = 'gōng gòng qì chē';
  const lines = L.splitPinyinLines(whole, 2);
  assert.strictEqual(lines.length, 2);
  assert.ok(
    Math.max(...lines.map((l) => l.length)) < whole.length,
    `折完最长行 ${Math.max(...lines.map((l) => l.length))} 不比整串 ${whole.length} 短`
  );
});

test('splitPinyinLines: 折行后不丢音节也不加音节', () => {
  const whole = 'zhōng qiū jié';
  assert.strictEqual(L.splitPinyinLines(whole, 2).join(' '), whole);
});

test('splitPinyinLines: maxLines 为 1 时原样返回', () => {
  assert.deepStrictEqual(L.splitPinyinLines('píng guǒ', 1), ['píng guǒ']);
});

test('cellFontSizes: 纯拼音模式下，长拼音靠折两行换来更大的字号', () => {
  const cell = { cellW: 38, cellH: 26.25 }; // 5x8 的一格
  const got = L.cellFontSizes({ mode: 'pinyin', ...cell, hanzi: '长方形', pinyin: 'cháng fāng xíng' });
  assert.strictEqual(got.pinyinLines.length, 2, '这么长的拼音应当折成两行');
  const oneLine = 38 - L.METRICS.cellPadMm - L.METRICS.cellBorderMm;
  const unwrapped = oneLine / L.pinyinEms('cháng fāng xíng');
  assert.ok(got.pinyin > unwrapped, `折行后 ${got.pinyin.toFixed(1)} 应当大于不折的 ${unwrapped.toFixed(1)}`);
});
