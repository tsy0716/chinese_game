/**
 * 拼音宾果 —— 纯逻辑层
 *
 * 这个文件不碰 DOM，所以浏览器和 node 都能加载：
 *   浏览器：<script src="logic.js"></script>  →  window.BingoLogic
 *   node  ：require('./logic.js')             →  跑测试用
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BingoLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 带种子的随机数 ----------

  /** 把任意字符串搓成一个 32 位整数（FNV-1a） */
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * 造一个可复现的随机数发生器（mulberry32）。
   * 同一个种子永远吐出同一串数 —— 卡片能按种子原样重印全靠这个。
   */
  function makeRng(seed) {
    let a = (hashSeed(String(seed)) + 0x6d2b79f5) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 洗牌与抽词 ----------

  /** Fisher-Yates 洗牌，返回新数组，不动原数组 */
  function shuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** 从词池里随机抽 n 个不重复的词 */
  function pickN(pool, n, rng) {
    if (n > pool.length) {
      throw new Error(`词池只有 ${pool.length} 个词，不够抽 ${n} 个`);
    }
    return shuffle(pool, rng).slice(0, n);
  }

  // ---------- 卡片 ----------

  /**
   * 生成一张卡。
   * @param {object[]} pool       词池，元素形如 { hanzi, pinyin }
   * @param {number}   cols/rows  网格列数、行数
   * @param {string}   seed       种子；同种子必出同一张卡
   * @param {object[]} [fixedWords] 指定用这批词（「全班同词」模式下由 buildDeck 传入）
   */
  function buildCard({ pool, cols, rows, seed, fixedWords }) {
    const cells = cols * rows;
    const rng = makeRng(seed);
    const words = fixedWords ? shuffle(fixedWords, rng) : pickN(pool, cells, rng);
    if (words.length !== cells) {
      throw new Error(`词池只有 ${words.length} 个词，不够铺满 ${cols}x${rows} = ${cells} 格`);
    }
    return { seed: String(seed), cells: words };
  }

  /**
   * 生成一整批卡，保证两两不同。
   * sameWords=true 时全班用同一批词，只打乱位置。
   */
  function buildDeck({ pool, cols, rows, count, seed, sameWords }) {
    const cellCount = cols * rows;
    const fixedWords = sameWords
      ? pickN(pool, cellCount, makeRng(`${seed}:words`))
      : undefined;

    const deck = [];
    const seen = new Set();

    for (let i = 1; i <= count; i++) {
      let card = null;
      // 撞车了就换个种子重抽，保证没有两张一模一样的卡
      for (let attempt = 0; attempt < 200; attempt++) {
        const cardSeed = attempt === 0 ? `${seed}-${i}` : `${seed}-${i}#${attempt}`;
        const candidate = buildCard({ pool, cols, rows, seed: cardSeed, fixedWords });
        const fingerprint = candidate.cells.map((w) => w.hanzi).join('|');
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          card = candidate;
          break;
        }
      }
      if (!card) {
        throw new Error(`词池太小，凑不出 ${count} 张互不相同的卡，请多选几个主题或减少张数`);
      }
      deck.push({ index: i, seed: card.seed, cells: card.cells });
    }
    return deck;
  }

  // ---------- 连线判定 ----------

  /**
   * 列出网格上所有「连续 need 格」的线：横、竖、右下斜、左下斜。
   * 格子按从左到右、从上到下编号：第 r 行第 c 列 = r * cols + c
   */
  function lines(cols, rows, need) {
    const out = [];
    const at = (r, c) => r * cols + c;
    const run = (r, c, dr, dc) =>
      Array.from({ length: need }, (_, k) => at(r + dr * k, c + dc * k));

    for (let r = 0; r < rows; r++)
      for (let c = 0; c + need <= cols; c++) out.push(run(r, c, 0, 1)); // 横

    for (let c = 0; c < cols; c++)
      for (let r = 0; r + need <= rows; r++) out.push(run(r, c, 1, 0)); // 竖

    for (let r = 0; r + need <= rows; r++)
      for (let c = 0; c + need <= cols; c++) out.push(run(r, c, 1, 1)); // 捺 ↘

    for (let r = 0; r + need <= rows; r++)
      for (let c = need - 1; c < cols; c++) out.push(run(r, c, 1, -1)); // 撇 ↙

    return out;
  }

  /**
   * 判断已标记的格子里有没有连成 need 格的线。
   * @returns {number[]|null} 获胜那条线的格子号；没赢则 null
   */
  function findWin(marked, cols, rows, need) {
    const set = marked instanceof Set ? marked : new Set(marked);
    for (const line of lines(cols, rows, need)) {
      if (line.every((idx) => set.has(idx))) return line;
    }
    return null;
  }

  // ---------- 自定义词表 ----------

  const CJK = /[㐀-䶿一-鿿豈-﫿]/;

  /**
   * 解析老师粘进来的词表，每行一个「汉字 拼音」。
   * 空行和 # 开头的注释行会跳过；重复的词只留一个。
   */
  function parseWordList(text) {
    const out = [];
    const seen = new Set();

    String(text).split(/\r?\n/).forEach((rawLine, i) => {
      const lineNo = i + 1;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;

      const parts = line.split(/[\s　]+/);
      if (parts.length < 2) {
        throw new Error(`第 ${lineNo} 行只有汉字没有拼音：「${line}」，正确写法是「苹果 píngguǒ」`);
      }

      const hanzi = parts[0];
      const pinyin = parts.slice(1).join(' ');

      if (!CJK.test(hanzi)) {
        throw new Error(`第 ${lineNo} 行开头不是汉字：「${line}」，正确写法是「苹果 píngguǒ」`);
      }
      if (CJK.test(pinyin)) {
        throw new Error(`第 ${lineNo} 行的拼音里混进了汉字：「${line}」，一行只能写一个词`);
      }

      if (seen.has(hanzi)) return;
      seen.add(hanzi);
      out.push({ hanzi, pinyin });
    });

    return out;
  }

  // ---------- 拼音逐字对齐 ----------

  /**
   * 把拼音按音节拆开，一个音节配一个汉字，供卡片上「拼音标在汉字正上方」的排版用。
   *
   * 音节数和汉字数对不上时返回 null —— 调用方据此降级成「整串拼音居中」，
   * 老师粘的自定义词表写成连写形式（píngguǒ）时就走这条路，不至于错位。
   *
   * @returns {{char: string, syllable: string}[] | null}
   */
  function alignPinyin(hanzi, pinyin) {
    const chars = Array.from(String(hanzi)); // 用 Array.from 才能正确处理 4 字节汉字
    const syllables = String(pinyin).trim().split(/[\s　]+/).filter(Boolean);
    if (!chars.length || chars.length !== syllables.length) return null;
    return chars.map((char, i) => ({ char, syllable: syllables[i] }));
  }

  return {
    makeRng, shuffle, pickN, buildCard, buildDeck,
    lines, findWin, parseWordList, alignPinyin,
  };
});
