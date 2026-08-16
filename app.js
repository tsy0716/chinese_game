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

  const NEED = 4;          // 连几个算赢
  const PAGE_INNER_MM = 190; // A4 竖版扣掉 10mm 页边距后的可用宽度

  const $ = (id) => document.getElementById(id);

  const el = {
    packs: $('packs'), custom: $('custom'), grid: $('grid'), count: $('count'),
    title: $('title'), seed: $('seed'), sameWords: $('sameWords'),
    generate: $('generate'), printCards: $('printCards'), printSheet: $('printSheet'),
    status: $('status'), tabs: $('tabs'), cards: $('cards'),
    callerStage: $('callerStage'), callNext: $('callNext'), callReset: $('callReset'),
    callerMeta: $('callerMeta'), calledList: $('calledList'),
    sheetTitle: $('sheetTitle'), sheetMeta: $('sheetMeta'), sheetGrid: $('sheetGrid'),
  };

  /** 本次生成的结果 */
  let state = { pool: [], deck: [], cols: 0, rows: 0, seed: '' };
  /** 喊词器状态 */
  let round = { queue: [], called: [] };

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
    const map = new Map();
    for (const pack of selectedPacks()) {
      for (const w of pack.words) map.set(w.hanzi, w);
    }
    for (const w of L.parseWordList(el.custom.value)) map.set(w.hanzi, w);
    return [...map.values()];
  }

  function gridSize() {
    const [cols, rows] = el.grid.value.split('x').map(Number);
    return { cols, rows };
  }

  function say(message, isError) {
    el.status.textContent = message;
    el.status.classList.toggle('err', !!isError);
  }

  function reportPool() {
    let pool;
    try {
      pool = buildPool();
    } catch (err) {
      say('自定义词表有问题 —— ' + err.message, true);
      return;
    }
    const { cols, rows } = gridSize();
    const cells = cols * rows;
    if (pool.length < cells) {
      say(`词池 ${pool.length} 个词，铺不满 ${cols}x${rows} = ${cells} 格，再多选一个主题。`, true);
    } else if (pool.length === cells) {
      say(`词池 ${pool.length} 个词，正好铺满 —— 每张卡词语相同，只有位置不同。`);
    } else {
      say(`词池 ${pool.length} 个词，每张卡从中随机抽 ${cells} 个。`);
    }
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
      pool = buildPool();
    } catch (err) {
      say('自定义词表有问题 —— ' + err.message, true);
      return;
    }

    const { cols, rows } = gridSize();
    const count = Math.max(1, Math.min(200, Number(el.count.value) || 1));
    const seed = el.seed.value.trim() || randomSeed();

    let deck;
    try {
      deck = L.buildDeck({
        pool, cols, rows, count, seed, sameWords: el.sameWords.checked,
      });
    } catch (err) {
      say(err.message, true);
      return;
    }

    el.seed.value = seed;
    state = { pool, deck, cols, rows, seed };

    renderCards();
    renderSheet();
    resetRound();

    el.printCards.disabled = false;
    el.printSheet.disabled = false;
    el.callNext.disabled = false;
    el.callReset.disabled = false;

    say(`已生成 ${deck.length} 张卡（种子 ${seed}）。词池 ${pool.length} 词，` +
        `每张 ${cols * rows} 格，连 ${NEED} 个获胜。`);
  });

  // ---------- 渲染一个词（拼音逐字对齐汉字） ----------

  function renderWord(word, big) {
    const wrap = document.createElement('div');
    wrap.className = big ? 'word word--big' : 'word';

    const pairs = L.alignPinyin(word.hanzi, word.pinyin);
    const chars = Array.from(word.hanzi);
    wrap.style.setProperty('--n', chars.length);

    if (pairs) {
      for (const { char, syllable } of pairs) {
        const col = document.createElement('div');
        col.className = 'ch';
        const py = document.createElement('div');
        py.className = 'py';
        py.textContent = syllable;
        const hz = document.createElement('div');
        hz.className = 'hz';
        hz.textContent = char;
        col.append(py, hz);
        wrap.appendChild(col);
      }
    } else {
      // 音节对不上（多半是自定义词表里写了连写拼音）—— 整串居中，不硬凑
      wrap.classList.add('word--loose');
      const py = document.createElement('div');
      py.className = 'py';
      py.textContent = word.pinyin;
      const hz = document.createElement('div');
      hz.className = 'hz';
      hz.textContent = word.hanzi;
      wrap.append(py, hz);
    }
    return wrap;
  }

  // ---------- 卡片 ----------

  function renderCards() {
    const { deck, cols, rows } = state;
    const title = el.title.value.trim() || '拼音宾果';
    el.cards.textContent = '';

    for (const card of deck) {
      const slot = document.createElement('div');
      slot.className = 'card-slot';

      const box = document.createElement('div');
      box.className = 'card';

      const head = document.createElement('div');
      head.className = 'card__head';
      const left = document.createElement('div');
      const h = document.createElement('div');
      h.className = 'card__title';
      h.textContent = title;
      const name = document.createElement('div');
      name.className = 'card__name';
      name.append('姓名 ', Object.assign(document.createElement('u'), { textContent: ' ' }));
      left.append(h, name);
      const id = document.createElement('div');
      id.className = 'card__id';
      id.textContent = `#${String(card.index).padStart(2, '0')} · ${card.seed}`;
      head.append(left, id);

      const grid = document.createElement('div');
      grid.className = 'card__grid';
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
      grid.style.setProperty('--cw', (PAGE_INNER_MM / cols) + 'mm');

      for (const word of card.cells) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.appendChild(renderWord(word));
        grid.appendChild(cell);
      }

      box.append(head, grid);
      slot.appendChild(box);
      el.cards.appendChild(slot);
    }
  }

  // ---------- 喊词器 ----------

  function resetRound() {
    // 每一轮的顺序都重新随机，同一批卡可以连着玩好几局
    round = { queue: L.shuffle(state.pool, Math.random), called: [] };
    el.callerStage.textContent = '';
    const p = document.createElement('p');
    p.className = 'caller__empty';
    p.textContent = '点「喊下一个词」开始。';
    el.callerStage.appendChild(p);
    el.calledList.textContent = '';
    el.callerMeta.textContent = `词池 ${state.pool.length} 个词，还没开始喊。`;
    el.callNext.disabled = state.pool.length === 0;
  }

  el.callReset.addEventListener('click', resetRound);

  el.callNext.addEventListener('click', () => {
    const word = round.queue.shift();
    if (!word) {
      el.callerMeta.textContent = '词池里的词全喊完了。点「重新开始」换一轮。';
      el.callNext.disabled = true;
      return;
    }
    round.called.push(word);

    el.callerStage.textContent = '';
    el.callerStage.appendChild(renderWord(word, true));

    const li = document.createElement('li');
    li.textContent = word.hanzi;
    const py = document.createElement('span');
    py.className = 'py';
    py.textContent = word.pinyin;
    li.appendChild(py);
    el.calledList.appendChild(li);

    el.callerMeta.textContent =
      `已喊 ${round.called.length} 个，还剩 ${round.queue.length} 个。`;
  });

  // ---------- 喊词单 ----------

  function renderSheet() {
    el.sheetTitle.textContent = (el.title.value.trim() || '拼音宾果') + ' · 喊词单';
    el.sheetMeta.textContent =
      `词池 ${state.pool.length} 词 · 卡片种子 ${state.seed} · ` +
      `${state.cols}x${state.rows} 格 · 连 ${NEED} 个获胜 —— 喊过的词打勾`;

    el.sheetGrid.textContent = '';
    for (const word of state.pool) {
      const item = document.createElement('div');
      item.className = 'sheet__item';
      const box = document.createElement('span');
      box.className = 'sheet__box';
      const hz = document.createElement('span');
      hz.textContent = word.hanzi;
      const py = document.createElement('span');
      py.className = 'py';
      py.textContent = word.pinyin;
      item.append(box, hz, py);
      el.sheetGrid.appendChild(item);
    }
  }

  // ---------- 视图切换 ----------

  el.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    for (const b of el.tabs.querySelectorAll('button')) {
      const on = b === btn;
      b.setAttribute('aria-selected', String(on));
      $('view-' + b.dataset.view).hidden = !on;
    }
  });

  // ---------- 打印 ----------

  function printWith(className) {
    document.body.classList.add(className);
    const clear = () => {
      document.body.classList.remove(className);
      window.removeEventListener('afterprint', clear);
    };
    window.addEventListener('afterprint', clear);
    window.print();
  }

  el.printCards.addEventListener('click', () => printWith('print-cards'));
  el.printSheet.addEventListener('click', () => printWith('print-sheet'));

  reportPool();
})();
