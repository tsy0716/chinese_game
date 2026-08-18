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
   * 把一批词打乱位置，排成一张卡。
   * @param {object[]} words  这张卡上的词，元素形如 { hanzi, pinyin }
   * @param {string}   seed   种子；同种子必出同一个摆法
   */
  function buildCard({ words, seed }) {
    return { seed: String(seed), cells: shuffle(words, makeRng(seed)) };
  }

  /**
   * 生成一整批卡。
   *
   * 全班永远用同一批词，只有摆放位置不同 —— 这样复习覆盖最均匀，而且**任何一张卡
   * 本身就是完整词表**，裁判多印一张就能照着喊，不需要另做喊词单。
   *
   * 词池比格数大时，先随机抽定这一局要用的词，之后每张卡都用这批词。
   */
  function buildDeck({ pool, cols, rows, count, seed }) {
    const cellCount = cols * rows;
    const words = pickN(pool, cellCount, makeRng(`${seed}:words`));

    const deck = [];
    const seen = new Set();

    for (let i = 1; i <= count; i++) {
      let card = null;
      // 摆法撞车了就换个种子重排，保证没有两张一模一样的卡
      for (let attempt = 0; attempt < 200; attempt++) {
        const cardSeed = attempt === 0 ? `${seed}-${i}` : `${seed}-${i}#${attempt}`;
        const candidate = buildCard({ words, seed: cardSeed });
        const fingerprint = candidate.cells.map((w) => w.hanzi).join('|');
        if (!seen.has(fingerprint)) {
          seen.add(fingerprint);
          card = candidate;
          break;
        }
      }
      if (!card) {
        throw new Error(`格子太少，凑不出 ${count} 张摆法互不相同的卡，请减少张数或换更大的网格`);
      }
      deck.push({ index: i, seed: card.seed, cells: card.cells });
    }
    return deck;
  }

  // ---------- 自定义词表 ----------

  const CJK = /[㐀-䶿一-鿿豈-﫿]/;

  /**
   * 解析老师粘进来的词表。
   *
   * 一行写一个词，或者用逗号（, ，、）隔开一串词。每个词有两种写法：
   *
   *   苹果             —— 只写汉字。这种词**只能用在「只印汉字」模式**
   *   苹果 píng guǒ    —— 汉字后面空一格写拼音，三种模式都能用
   *
   * 页面不会替老师推拼音 —— 多音字（长、行、了、还、干）猜错了比没有更糟，
   * 而只印汉字的时候本来就用不着拼音。
   *
   * 空行和 # 开头的注释行会跳过；重复的词只留一个。
   */
  function parseWordList(text) {
    const out = [];
    const seen = new Set();

    String(text).split(/\r?\n/).forEach((rawLine, i) => {
      const lineNo = i + 1;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return;

      for (const rawEntry of line.split(/[,，、]/)) {
        const entry = rawEntry.trim();
        if (!entry) continue; // 「苹果,,香蕉」和结尾多打的那个逗号，都不算词

        const parts = entry.split(/[\s　]+/);
        const hanzi = parts[0];
        const pinyin = parts.slice(1).join(' ');

        if (!CJK.test(hanzi)) {
          throw new Error(
            `第 ${lineNo} 行的「${entry}」开头不是汉字，写成「苹果」或「苹果 píng guǒ」都行`
          );
        }
        if (CJK.test(pinyin)) {
          throw new Error(
            `第 ${lineNo} 行的「${entry}」拼音里混进了汉字 —— 词和词之间要用逗号或换行隔开`
          );
        }

        if (seen.has(hanzi)) continue;
        seen.add(hanzi);
        out.push({ hanzi, pinyin });
      }
    });

    return out;
  }

  /**
   * 内置词库 + 自定义词表，按汉字去重，返回新数组。
   *
   * 自定义的覆盖内置的（老师要改拼音就靠这个），但**只写了汉字的自定义词不会把内置
   * 的拼音抹掉** —— 否则老师随手把「苹果」抄进新词表，这个词反而在「汉字+拼音」模式
   * 下用不了了。
   */
  function mergeWords(base, extra) {
    const map = new Map();
    for (const w of base) map.set(w.hanzi, w);
    for (const w of extra) {
      const known = map.get(w.hanzi);
      if (!String(w.pinyin || '').trim() && known) continue;
      map.set(w.hanzi, w);
    }
    return [...map.values()];
  }

  /**
   * 给只写了汉字的词补上拼音。
   *
   * 转换器由调用方注入 —— 浏览器里是 pinyin-pro（vendor/pinyin-pro.js），logic.js
   * 本身不依赖任何库，node 里才能用假转换器测。
   *
   * 两条规矩：
   *   1. 老师自己写了拼音的，一律不动 —— 人写的永远压过机器标的
   *   2. 机器标出来的打上 auto 标记，页面据此提醒老师核对
   *
   * 转换器认不出、返回空、或者干脆抛错，都保持这个词没拼音的原样 ——
   * 后面 usableWords 会把它挡在带拼音的模式外，不至于印出个空格子。
   */
  function fillPinyin(words, toPinyin) {
    return words.map((w) => {
      if (String(w.pinyin || '').trim() || typeof toPinyin !== 'function') return w;
      let got = '';
      try {
        got = String(toPinyin(w.hanzi) || '').trim();
      } catch (err) {
        got = ''; // 转换器炸了不该把整页拖垮，退回「这个词没拼音」
      }
      return got ? { hanzi: w.hanzi, pinyin: got, auto: true } : w;
    });
  }

  /**
   * 校园高频词里真正会踩的多音字。
   *
   * 为什么是一份手挑的清单，而不是「凡是有多个读音的字都算」：后者会把 657 个
   * 内置词里的 244 个（37%）都标成可疑 —— 连「六」「万」「个」都在内（它们确实
   * 有生僻的第二读音）。老师看到 37% 全是黄的，等于什么都没看。这份清单只命中
   * 48 个（7%），才是真的能一个个核对完的量。
   */
  const POLYPHONES = new Set(Array.from('长行还干了为和觉发乐重教种数地着得少好空相差便中会大转背朝散卷系'));

  /**
   * 自动标的拼音里，哪些得让老师亲自核对 —— 含多音字的那些。
   *
   * 实测 pinyin-pro 在校园高频词上很准，但「还给」会标成 hái gěi、「教书」会标成
   * jiào shū。这类错必须让老师看见，而不是悄悄印在卡片上。老师自己写了拼音的词
   * 不在此列 —— 人写的不需要机器复核。
   */
  function needsReview(words) {
    return words.filter(
      (w) => w.auto && Array.from(String(w.hanzi)).some((ch) => POLYPHONES.has(ch))
    );
  }

  /**
   * 把词表写回输入框的格式：一行一个「汉字 拼音」，没拼音的只写汉字。
   * parseWordList 能原样读回去（test.js 里对这个来回转换有测试）。
   */
  function formatWordList(words) {
    return words
      .map((w) => (String(w.pinyin || '').trim() ? `${w.hanzi} ${w.pinyin}` : w.hanzi))
      .join('\n');
  }

  /**
   * 按显示模式筛词池：只写了汉字、没拼音的词只能用在「只印汉字」模式，
   * 另外两个模式渲染不出来，得先滤掉再抽词。
   */
  function usableWords(pool, mode) {
    if (mode === 'hanzi') return pool.slice();
    return pool.filter((w) => String(w.pinyin || '').trim() !== '');
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

  // ---------- 格子里的字号 ----------

  /**
   * 排版常数。CSS 里不再重复写这些数值 —— app.js 直接把它们设成行内样式，
   * 免得改了一处忘了另一处，算出来的字号和实际渲染对不上。
   */
  const METRICS = {
    hanziLineHeight: 1.1,
    pinyinLineHeight: 1.25,
    /**
     * 拼音每个字母的字宽（单位 em），浏览器里用实际字体量出来的，不是估的。
     *
     * 一开始用「平均字宽 0.55」这一个常数，结果 m 实际有 0.855、l 只有 0.235，
     * 含 m 的词（máng guǒ / gǎn mào / bāng máng）全都撑破格子。平均值在这里没有意义。
     *
     * 带调元音与基本元音等宽（声调符号不占额外宽度），所以查表前先去调号。
     * 数值量自 PingFang SC；换个系统换个字体会有出入，靠 safety 兜底。
     */
    pinyinCharWidths: {
      a: 0.559, b: 0.586, c: 0.547, d: 0.586, e: 0.555, f: 0.343, g: 0.591,
      h: 0.556, i: 0.256, j: 0.267, k: 0.529, l: 0.235, m: 0.855, n: 0.559,
      o: 0.586, p: 0.586, q: 0.586, r: 0.365, s: 0.505, t: 0.355, u: 0.560,
      v: 0.482, w: 0.755, x: 0.509, y: 0.496, z: 0.487, ' ': 0.333,
    },
    /** 表里没有的字符按最宽的常见字母算，宁可保守 */
    pinyinDefaultWidth: 0.59,
    /** 格子的内边距，上下左右各 1mm */
    cellPadMm: 2,
    /** 格线粗细。格子的可用宽高要把它扣掉 —— 漏算这 0.4mm，密网格下会整片溢出 */
    cellBorderMm: 0.4,
    /** 汉字加拼音模式下，相邻两个字之间的间隙 */
    colGapMm: 0.8,
    /**
     * 安全系数：算出来的尺寸只占可用空间的这个比例。
     * 字宽表和字体度量都是在一台机器上量的，换个系统、换个中文字体
     * 都会有出入。留 4% 余量，好过为最后 0.1mm 去搏。
     */
    safety: 0.96,
    /** 汉字加拼音模式下，拼音相对汉字的比例 */
    bothPinyinRatio: 0.40,
    /** 折成两行至少要换来这么多字号增益，否则不值得折 —— 免得「hǎo chī」也被拆开 */
    wrapGain: 1.15,
    /**
     * 字号已经到这个尺寸就算舒服了，此时才讲究「增益够不够大」；
     * 还没到就有一点改善也要折 —— 否则密网格下会宁可用 5.2mm 也不肯折成 5.8mm，
     * 恰好在最需要折行的时候挡住折行。
     */
    wrapComfortMm: 7,
    /** 字号上限：太大反而难扫读，也挤掉了放棋子的地方 */
    caps: { both: 14, hanzi: 20, pinyin: 10 },
  };

  /**
   * 每种显示模式下允许的网格。
   *
   * 字号下限（6mm）由 test.js 的穷举验证兜底。但真正卡住上限的往往不是字号，
   * 而是**格子还够不够孩子放棋子 / 画圈**：
   *
   *   - 纯汉字：字号极宽松（7 列 16 行排 112 词，字号还有 6.3mm）。这里停在
   *     6x12 = 72 词，格子 32x18mm —— 再密下去格子就矮到没法标记了。
   *   - 纯拼音：卡在宽度上。cháng fāng xíng 这类长拼音就算折成两行，5 列到
   *     12 行（格子 38x18mm）字号已是 6.2mm，5x14 会掉到 5.2mm。所以 5x12 = 60 词
   *     就是上限，6 列则完全放不下。
   *   - 汉字+拼音：内容最高，保守停在 5x8。
   */
  const GRIDS = {
    // both 保守停在 5x8 = 40 词 —— 这是单个主题（最小 41 词）还能独立铺满的上限，
    // 而且三种模式里它的内容最高，格子不宜再密
    both:   ['4x6', '4x8', '5x6', '5x7', '5x8'],
    hanzi:  ['4x6', '5x6', '4x8', '5x8', '4x10', '5x10', '6x10', '5x12', '6x12'],
    pinyin: ['4x6', '5x6', '4x8', '5x8', '4x10', '5x10', '4x12', '5x12'],
  };

  /** 带调元音 -> 基本元音。声调符号不占宽度，查字宽表前先去掉 */
  const TONE_BASE = (() => {
    const map = { 'ü': 'u' };
    const groups = [
      ['a', 'āáǎà'], ['e', 'ēéěè'], ['i', 'īíǐì'], ['o', 'ōóǒò'],
      ['u', 'ūúǔù'], ['u', 'ǖǘǚǜ'], ['n', 'ńňǹ'],
    ];
    for (const [base, marked] of groups) {
      for (const ch of marked) map[ch] = base;
    }
    return map;
  })();

  /** 一段拼音有多宽，单位 em（乘上字号就是实际宽度） */
  function pinyinEms(text) {
    const W = METRICS.pinyinCharWidths;
    let sum = 0;
    for (const ch of String(text).toLowerCase()) {
      const base = TONE_BASE[ch] || ch;
      sum += W[base] !== undefined ? W[base] : METRICS.pinyinDefaultWidth;
    }
    return sum;
  }

  /**
   * 把拼音按音节折成最多 maxLines 行，尽量让最宽的一行窄一点。
   * 只在纯拼音模式下用 —— 汉字加拼音模式里拼音是压在每个字头上的，不能折。
   *
   * @returns {string[]} 折不出这么多行时，返回的行数会少于 maxLines
   */
  function splitPinyinLines(pinyin, maxLines) {
    const syllables = String(pinyin).trim().split(/\s+/).filter(Boolean);
    if (maxLines <= 1 || syllables.length <= 1) return [syllables.join(' ')];

    let best = null;
    for (let i = 1; i < syllables.length; i++) {
      const lines = [syllables.slice(0, i).join(' '), syllables.slice(i).join(' ')];
      const widest = Math.max(...lines.map(pinyinEms));
      if (!best || widest < best.widest) best = { lines, widest };
    }
    return best.lines;
  }

  /**
   * 算一个格子里该用多大的字。
   *
   * 三个约束取最小：字号上限、格子高度、格子宽度。放在这里而不是 CSS，
   * 是为了能对「每个真实词 x 每种网格」跑穷举验证。
   *
   * @param {'both'|'hanzi'|'pinyin'} mode
   * @param {number} cellW, cellH  格子宽高，单位 mm
   * @returns {{hanzi:number, pinyin:number}} 单位 mm，0 表示这一项不显示
   */
  function cellFontSizes({ mode, cellW, cellH, hanzi, pinyin, aligned = true }) {
    const M = METRICS;
    // 可用空间要同时扣掉内边距和格线，再乘安全系数
    const gone = M.cellPadMm + M.cellBorderMm;
    const w = (cellW - gone) * M.safety;
    const h = (cellH - gone) * M.safety;
    const chars = Array.from(String(hanzi)).length || 1;
    const syllables = String(pinyin).trim().split(/\s+/).filter(Boolean);
    const widestEms = syllables.length ? Math.max(...syllables.map(pinyinEms)) : 1;

    if (mode === 'hanzi') {
      return {
        hanzi: Math.min(M.caps.hanzi, h / M.hanziLineHeight, w / chars),
        pinyin: 0,
      };
    }

    if (mode === 'pinyin') {
      // 纯拼音模式竖向空间富余、横向吃紧，所以允许长拼音折成两行 ——
      // 不折的话 cháng fāng xíng 这种只能缩到 5.5mm，折了能到 8mm 以上
      const fit = (lines) => Math.min(
        M.caps.pinyin,
        h / (lines.length * M.pinyinLineHeight),
        w / Math.max(...lines.map(pinyinEms))
      );

      const one = splitPinyinLines(pinyin, 1);
      const two = splitPinyinLines(pinyin, 2);
      const fit1 = fit(one);
      if (two.length !== 2) return { hanzi: 0, pinyin: fit1, pinyinLines: one };

      const fit2 = fit(two);
      // 字号已经舒服了，就得换来明显更大的字才值得折（免得 hǎo chī 被无谓拆开）；
      // 字号本来就紧，有一点改善就折
      const worthIt = fit1 >= M.wrapComfortMm
        ? fit2 > fit1 * M.wrapGain
        : fit2 > fit1;

      return worthIt
        ? { hanzi: 0, pinyin: fit2, pinyinLines: two }
        : { hanzi: 0, pinyin: fit1, pinyinLines: one };
    }

    if (mode === 'both') {
      // 上下叠放，所以高度按「拼音行 + 汉字行」一起算
      const stack = M.pinyinLineHeight * M.bothPinyinRatio + M.hanziLineHeight;
      // aligned 时每个汉字各占一列，列与列之间还有间隙，得从可用宽度里先扣掉
      const colW = aligned ? (w - M.colGapMm * (chars - 1)) / chars : w / chars;
      const hz = Math.min(M.caps.both, h / stack, colW);
      // aligned：列宽取汉字和该音节中较宽的 —— 拼音不能把列撑得比汉字还宽
      // 不 aligned：音节数和汉字数对不上（自定义词表里的连写拼音），整串压在整词上方，
      //            这时约束是整串拼音的总宽，不是单个音节
      const py = aligned
        ? Math.min(hz * M.bothPinyinRatio, colW / widestEms)
        : Math.min(hz * M.bothPinyinRatio, w / pinyinEms(pinyin));
      return { hanzi: hz, pinyin: py };
    }

    throw new Error(`不认识的显示模式：${mode}`);
  }

  return {
    makeRng, shuffle, pickN, buildCard, buildDeck,
    parseWordList, mergeWords, usableWords, fillPinyin, formatWordList, needsReview,
    alignPinyin, cellFontSizes, splitPinyinLines, pinyinEms,
    METRICS, GRIDS,
  };
});
