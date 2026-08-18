/**
 * 拼音宾果 —— 页面交互
 *
 * 所有随机和排卡逻辑都在 logic.js（有测试覆盖）；这里只负责读表单、
 * 拼 DOM、控制打印。
 */
(function () {
  'use strict';

  const L = window.BingoLogic;
  const W = window.BingoWords;

  const PAGE_INNER_MM = 190; // A4 竖版扣掉 10mm 页边距后的可用宽度
  const GRID_MM = 210;       // 网格总高；与 index.html 里的 --card-h 配套（24 + 4 + 210 = 238）

  const MODE_LABEL = { both: '汉字+拼音', hanzi: '只印汉字', pinyin: '只印拼音' };

  const $ = (id) => document.getElementById(id);

  const el = {
    packs: $('packs'), custom: $('custom'), mode: $('mode'), grid: $('grid'), count: $('count'),
    title: $('title'), seed: $('seed'), refCard: $('refCard'),
    generate: $('generate'), printCards: $('printCards'),
    status: $('status'), cards: $('cards'),
  };

  // 行高从 logic.js 的 METRICS 来，CSS 通过这两个变量读 —— 保证算尺寸和实际渲染用同一组数
  el.cards.style.setProperty('--lh-hz', L.METRICS.hanziLineHeight);
  el.cards.style.setProperty('--lh-py', L.METRICS.pinyinLineHeight);

  /** 本次生成的结果 */
  let state = { pool: [], deck: [], cols: 0, rows: 0, seed: '', mode: 'both', withRef: false };

  // ---------- 主题勾选 ----------

  W.packs.forEach((pack, i) => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = pack.id;
    box.checked = i < 3; // 默认勾前三个，打开就能直接生成
    const text = document.createElement('span');
    text.textContent = pack.name;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = pack.words.length + ' 词';
    label.append(box, text, count);
    el.packs.appendChild(label);
  });

  el.packs.addEventListener('change', reportPool);

  function selectedPacks() {
    const ids = new Set(
      [...el.packs.querySelectorAll('input:checked')].map((b) => b.value)
    );
    return W.packs.filter((p) => ids.has(p.id));
  }

  /** 选中的主题 + 自定义词表，按汉字去重（自定义的覆盖内置的） */
  function buildPool() {
    const base = [];
    for (const pack of selectedPacks()) base.push(...pack.words);
    return L.mergeWords(base, L.parseWordList(el.custom.value));
  }

  /**
   * 当前模式真正能用的词。
   * 自定义词表里只写了汉字的词没有拼音，另外两个模式渲染不出来，得先滤掉。
   */
  function poolForMode() {
    return L.usableWords(buildPool(), el.mode.value);
  }

  function gridSize() {
    const [cols, rows] = el.grid.value.split('x').map(Number);
    return { cols, rows };
  }

  /**
   * 不同模式能用的网格不一样（纯汉字最密、纯拼音卡在宽度上），
   * 所以换模式时重建下拉。原来选的网格如果新模式也支持就保留。
   */
  function rebuildGridOptions() {
    const mode = el.mode.value;
    const keep = el.grid.value;
    const grids = L.GRIDS[mode];

    el.grid.textContent = '';
    for (const g of grids) {
      const [cols, rows] = g.split('x').map(Number);
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = `${cols} 列 x ${rows} 行（${cols * rows} 词，格子 ` +
        `${Math.round(PAGE_INNER_MM / cols)}x${Math.round(GRID_MM / rows)}mm）`;
      el.grid.appendChild(opt);
    }
    el.grid.value = grids.includes(keep) ? keep : (grids.includes('5x6') ? '5x6' : grids[0]);
  }

  el.mode.addEventListener('change', () => {
    rebuildGridOptions();
    reportPool();
  });

  function say(message, isError) {
    el.status.textContent = message;
    el.status.classList.toggle('err', !!isError);
  }

  function reportPool() {
    let all, pool;
    try {
      all = buildPool();
      pool = L.usableWords(all, el.mode.value);
    } catch (err) {
      say('自定义词表有问题 —— ' + err.message, true);
      return;
    }

    // 跳过的词要说出来。否则老师只写汉字加了 20 个词，却看见词池纹丝不动，
    // 会以为加词框坏了。
    const dropped = all.length - pool.length;
    const note = dropped
      ? `另有 ${dropped} 个词只写了汉字、没写拼音，「${MODE_LABEL[el.mode.value]}」印不出来，已跳过。`
      : '';

    const { cols, rows } = gridSize();
    const cells = cols * rows;

    if (pool.length >= cells) {
      say(`词池 ${pool.length} 个词，这一局随机抽 ${cells} 个，全班共用这批词、只打乱位置。${note}`);
      return;
    }

    // 铺不满时，如果正是被跳过的词拖累的，指路「换个模式」比「再勾一个主题」有用
    const fix = dropped
      ? '把「格子里印什么」换成「只印汉字」就能用上，或者给它们补上拼音。'
      : '再多选一个主题。';
    say(`词池 ${pool.length} 个词，铺不满 ${cols}x${rows} = ${cells} 格。${note}${fix}`, true);
  }

  el.grid.addEventListener('change', reportPool);
  el.custom.addEventListener('input', reportPool);

  // ---------- 生成 ----------

  function randomSeed() {
    return Math.random().toString(36).slice(2, 6);
  }

  el.generate.addEventListener('click', () => {
    let pool;
    try {
      pool = poolForMode();
    } catch (err) {
      say('自定义词表有问题 —— ' + err.message, true);
      return;
    }

    const { cols, rows } = gridSize();
    const count = Math.max(1, Math.min(200, Number(el.count.value) || 1));
    const seed = el.seed.value.trim() || randomSeed();

    let deck;
    try {
      deck = L.buildDeck({ pool, cols, rows, count, seed });
    } catch (err) {
      say(err.message, true);
      return;
    }

    el.seed.value = seed;
    state = { pool, deck, cols, rows, seed, mode: el.mode.value, withRef: el.refCard.checked };

    renderCards();
    el.printCards.disabled = false;

    const pages = deck.length + (state.withRef ? 1 : 0);
    say(`已生成 ${deck.length} 张学生卡${state.withRef ? ' + 1 张裁判页' : ''}，` +
        `共 ${pages} 页（种子 ${seed}）。${MODE_LABEL[state.mode]}，每张 ${cols * rows} 格。` +
        `全班词语相同，只有位置不同。`);
  });

  // ---------- 渲染一个词（拼音逐字对齐汉字） ----------

  function line(cls, text, sizeMm) {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    if (sizeMm) d.style.fontSize = sizeMm + 'mm';
    return d;
  }

  /** 卡片格子里的一个词。字号由 logic.js 按模式和格子尺寸算好 */
  function renderCellWord(word, mode, cellW, cellH) {
    const wrap = document.createElement('div');
    wrap.className = 'word word--' + mode;

    if (mode === 'hanzi') {
      const size = L.cellFontSizes({ mode, cellW, cellH, hanzi: word.hanzi, pinyin: word.pinyin });
      wrap.appendChild(line('hz', word.hanzi, size.hanzi));
      return wrap;
    }

    if (mode === 'pinyin') {
      const size = L.cellFontSizes({ mode, cellW, cellH, hanzi: word.hanzi, pinyin: word.pinyin });
      for (const text of size.pinyinLines) wrap.appendChild(line('py', text, size.pinyin));
      return wrap;
    }

    // 汉字 + 拼音：逐字对齐，一个音节压在一个汉字上方
    const pairs = L.alignPinyin(word.hanzi, word.pinyin);
    const size = L.cellFontSizes({
      mode, cellW, cellH, hanzi: word.hanzi, pinyin: word.pinyin, aligned: !!pairs,
    });

    if (pairs) {
      for (const { char, syllable } of pairs) {
        const col = document.createElement('div');
        col.className = 'ch';
        col.append(line('py', syllable, size.pinyin), line('hz', char, size.hanzi));
        wrap.appendChild(col);
      }
    } else {
      // 音节对不上（多半是自定义词表里写了连写拼音）—— 整串居中，不硬凑
      wrap.classList.add('word--loose');
      wrap.append(line('py', word.pinyin, size.pinyin), line('hz', word.hanzi, size.hanzi));
    }
    return wrap;
  }

  // ---------- 卡片 ----------

  /**
   * 画一张卡。isRef=true 时是裁判那一张 —— 词和学生卡一模一样，
   * 只是抬头换成「裁判用」，照着划掉就是喊词单。
   */
  function renderCard(card, isRef) {
    const { cols, rows, mode } = state;
    const title = el.title.value.trim() || '拼音宾果';
    const cellW = PAGE_INNER_MM / cols;
    const cellH = GRID_MM / rows;

    const slot = document.createElement('div');
    slot.className = 'card-slot';

    const box = document.createElement('div');
    box.className = isRef ? 'card card--ref' : 'card';

    const head = document.createElement('div');
    head.className = 'card__head';

    const left = document.createElement('div');
    const h = document.createElement('div');
    h.className = 'card__title';
    h.textContent = isRef ? title + ' · 裁判用' : title;

    const sub = document.createElement('div');
    if (isRef) {
      sub.className = 'card__note';
      sub.textContent = '喊过的词划掉。全班卡上就是这些词，只是位置不同。';
    } else {
      sub.className = 'card__name';
      sub.append('姓名 ', Object.assign(document.createElement('u'), { textContent: ' ' }));
    }
    left.append(h, sub);

    const id = document.createElement('div');
    id.className = 'card__id';
    id.textContent = isRef
      ? `裁判 · ${state.seed}`
      : `#${String(card.index).padStart(2, '0')} · ${state.seed}`;
    head.append(left, id);

    const grid = document.createElement('div');
    grid.className = 'card__grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    // 行高写死，不用 1fr —— 卡片高度必须确定，否则打印时可能被劈成两页
    grid.style.gridTemplateRows = `repeat(${rows}, ${cellH}mm)`;

    for (const word of card.cells) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.appendChild(renderCellWord(word, mode, cellW, cellH));
      grid.appendChild(cell);
    }

    box.append(head, grid);
    slot.appendChild(box);
    return slot;
  }

  function renderCards() {
    el.cards.textContent = '';
    if (state.withRef) {
      // 裁判那张排在最前面，老师撕走第一页就行。
      // 它用独立的摆法 —— 否则会和某个学生的卡一模一样，那孩子照着老师划掉的位置抄就行了。
      const referee = L.buildCard({
        words: state.deck[0].cells,
        seed: `${state.seed}-ref`,
      });
      el.cards.appendChild(renderCard(referee, true));
    }
    for (const card of state.deck) el.cards.appendChild(renderCard(card, false));
  }

  // ---------- 打印 ----------

  el.printCards.addEventListener('click', () => window.print());

  rebuildGridOptions();
  reportPool();
})();
