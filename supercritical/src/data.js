(() => {
  'use strict';
  const SC = window.__SC;
  const D = (SC.D = {});

  // Decimal year from 'YYYY-MM-DD' (30.4-day months) so every time axis shares one convention.
  const dy = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return y + (m - 1 + (d - 1) / 30.4) / 12;
  };
  D.dy = dy;
  D.NOW = 2026.9; // 2026-11-26

  // ---------------------------------------------------------------------------
  // S1 · 输入 — the complete human brief, verbatim.
  // ---------------------------------------------------------------------------
  D.BRIEF =
    '做一份关于AI未来的演示文稿，基本上就是讲智能爆炸。你可以完全不带锚定偏见，就说事情会变得疯狂，因为它们确实会。我希望这份演示文稿成为你见过的最精心制作、惊艳到离谱的演示文稿，各种图形、转场效果，想怎么做就怎么做。我相信你能做得惊艳，因为你有品味，也有能力。祝你好运，';
  D.BRIEF_DATE = '2026.11.26';

  // ---------------------------------------------------------------------------
  // S2 · 对折 — exact arithmetic: thickness(n) = 0.1 mm × 2^n
  // ---------------------------------------------------------------------------
  D.FOLD = {
    base: 0.1,
    n: 42,
    // [fold, name, distance]
    marks: [
      [0, '一张纸', '0.1 毫米'],
      [10, '一本书', '10 厘米'],
      [17, '四层楼', '13 米'],
      [23, '哈利法塔', '839 米'],
      [26.43, '珠穆朗玛峰', '8,849 米'],
      [29.9, '卡门线', '100 公里'],
      [37.56, 'GPS 卫星', '20,200 公里'],
      [41.8, '月球', '384,400 公里'],
    ],
  };

  // ---------------------------------------------------------------------------
  // S3 · 训练算力 — Epoch AI, Notable AI Models (training compute estimates, 2026-11)
  // [date, name, training FLOP, training cost in 2023 USD (null = unknown)]
  // ---------------------------------------------------------------------------
  D.COMPUTE = [
    ['2012-09-30', 'AlexNet', 4.7e17, 16],
    ['2019-02-14', 'GPT-2', 1.92e21, 4348],
    ['2020-05-28', 'GPT-3', 3.14e23, 2.1e6],
    ['2023-03-15', 'GPT-4', 2.1e25, 3.73e7],
    ['2023-12-06', 'Gemini 1.0 Ultra', 5.0e25, 3.07e7],
    ['2025-02-17', 'Grok 3', 3.5e26, 2.18e8],
    ['2025-02-27', 'GPT-4.5', 3.8e26, 3.66e8],
    ['2025-07-09', 'Grok 4', 5.0e26, 3.88e8],
    ['2026-09-03', 'GPT-6 Astra', 9.4e26, null],
  ];
  // Notable 2025–2026 releases that sit far below the compute frontier
  D.COMPUTE_CLOUD = [
    ['2024-12-26', 'DeepSeek V3', 3.3e24],
    ['2025-02-24', 'Claude 3.7 Sonnet', 3.35e25],
    ['2025-04-05', 'Llama 4 Behemoth', 5.18e25],
    ['2025-07-11', 'Kimi K2', 2.98e24],
    ['2025-08-07', 'GPT-5', 6.6e25],
    ['2025-09-05', 'Qwen3-Max', 1.51e25],
    ['2026-02-12', 'GLM-5', 6.84e24],
    ['2026-07-16', 'Kimi K3', 2.0e25],
    ['2026-10-06', 'Mistral Large 4', 1.24e25],
    ['2026-10-15', 'MAI-Base-2', 2.4e25],
  ];

  // ---------------------------------------------------------------------------
  // S4 · 思想的价格 — Epoch AI, "The plunging price of thought" (2026-09-22) & LLM inference price trends (2025-03)
  // ---------------------------------------------------------------------------
  D.PRICE = {
    // cheapest model matching GPT-4 (March 2023) level: [date, $/M tokens, model]
    gpt4: [
      ['2023-03-14', 37.5, 'GPT-4'],
      ['2024-07-18', 0.1, 'Llama 3.1 8B'],
      ['2024-10-24', 0.07, 'Gemini 1.5 Flash-8B'],
    ],
    // one GPQA Diamond question at ~75% accuracy
    gpqa: [
      ['2025-01-31', 0.3, 'o3'],
      ['2026-07-09', 0.0004, 'GPT-5.6 Luna'],
    ],
    perYear: 13,
    nearSotaPerYear: 75,
    perQuarter: 0.47,
    // Epoch: AI's price decline is "4 times faster than DNA sequencing, 6 times faster than compute,
    // 18 times faster than lithium batteries, 54 times faster than electricity (1892–1973)" — ratios of
    // the log decline rate, i.e. how many years the other technology needs to match one AI year.
    // [name, years to match one AI year, implied per-year multiplier = 13^(1/years)]
    tech: [
      ['电力 1892–1973', 54, Math.pow(13, 1 / 54)],
      ['锂电池', 18, Math.pow(13, 1 / 18)],
      ['算力 · 摩尔定律', 6, Math.pow(13, 1 / 6)],
      ['DNA 测序', 4, Math.pow(13, 1 / 4)],
      ['AI 推理', 1, 13],
    ],
  };

  // ---------------------------------------------------------------------------
  // S5 · 时长 — METR time horizons v1.1 (50% success horizon, minutes): [date, model, p50, ciLow, ciHigh]
  // ---------------------------------------------------------------------------
  D.HORIZON = [
    ['2019-02-14', 'GPT-2', 0.1, 0.03, 0.14],
    ['2022-03-15', 'GPT-3.5', 0.6, 0.3, 1.1],
    ['2023-03-14', 'GPT-4', 4.0, 1.9, 8.0],
    ['2024-05-13', 'GPT-4o', 7.0, 4.0, 12.9],
    ['2024-09-12', 'o1-preview', 20.3, 11.7, 33.4],
    ['2024-12-05', 'o1', 38.8, 21.2, 65.0],
    ['2025-02-24', 'Claude 3.7 Sonnet', 60.4, 33.0, 104.2],
    ['2025-04-16', 'o3', 119.7, 74.6, 190.9],
    ['2025-08-07', 'GPT-5', 203.0, 112.6, 405.6],
    ['2025-11-18', 'Gemini 3 Pro', 224.3, 139.6, 379.2],
    ['2025-11-24', 'Claude Opus 4.5', 293.0, 161.7, 623.7],
    ['2025-12-11', 'GPT-5.2', 352.2, 198.1, 815.2],
    ['2026-02-05', 'Claude Opus 4.6', 718.8, 316.7, 3633.8],
    ['2026-02-19', 'Gemini 3.1 Pro', 384.1, 233.5, 694.8],
    ['2026-04-07', 'Claude Mythos Preview', 1044.8, 508.9, 3304.3],
  ];
  D.HORIZON_DOUBLE_MONTHS = 4.2; // since 2023 (all-time: 6.2)

  // Small multiples: state-of-the-art score over time (Epoch benchmark data): [date, score 0–1, model]
  D.BENCH = [
    {
      name: "Humanity's Last Exam",
      note: '各领域专家出的「最后一场考试」',
      rows: [
        ['2024-09-24', 0.046, 'Gemini 1.5 Pro'],
        ['2024-12-17', 0.08, 'o1'],
        ['2025-03-25', 0.182, 'Gemini 2.5 Pro'],
        ['2025-04-16', 0.203, 'o3'],
        ['2025-08-07', 0.253, 'GPT-5'],
        ['2025-11-18', 0.375, 'Gemini 3 Pro'],
        ['2026-02-19', 0.464, 'Gemini 3.1 Pro'],
        ['2026-09-03', 0.548, 'GPT-6 Astra'],
      ],
    },
    {
      name: 'ARC-AGI-2',
      note: '专为「抗大语言模型」而设计的推理题',
      rows: [
        ['2024-07-18', 0.0, 'GPT-4o mini'],
        ['2025-01-31', 0.03, 'o3-mini'],
        ['2025-04-16', 0.065, 'o3'],
        ['2025-07-09', 0.16, 'Grok 4'],
        ['2025-11-24', 0.376, 'Claude Opus 4.5'],
        ['2025-12-11', 0.529, 'GPT-5.2'],
        ['2026-02-05', 0.692, 'Claude Opus 4.6'],
        ['2026-07-09', 0.925, 'GPT-5.6 Sol'],
        ['2026-11-17', 0.958, 'GPT-6.2 Astra'],
      ],
    },
    {
      name: 'GPQA Diamond',
      note: '博士水平的物理 / 化学 / 生物题（博士专家约 65%）',
      rows: [
        ['2024-01-25', 0.423, 'GPT-4'],
        ['2024-12-17', 0.768, 'o1'],
        ['2025-06-17', 0.853, 'Gemini 2.5 Pro'],
        ['2025-11-18', 0.926, 'Gemini 3 Pro'],
        ['2026-11-17', 0.968, 'GPT-6.2 Astra'],
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // S6 · 八个环节 — dated, sourced cases of AI doing the work of AI research
  // ---------------------------------------------------------------------------
  D.LAB = [
    ['读文献', 'The AI Scientist', 'Sakana AI', '2024.08', '从读论文到写出整篇论文，成本约 15 美元'],
    ['写代码', 'Anthropic', 'Anthropic', '2026.05', '合入代码库的代码，超过 80% 由 Claude 写下'],
    ['调实验', '代码优化测试', 'Anthropic', '2026.04', '同一道优化题：一年前 3 倍提速，现在 52 倍'],
    ['写内核', 'GPT-5.6 Sol', 'OpenAI', '2026.07', '重写自家生产内核，推理成本降 20%'],
    ['设计芯片', 'AlphaChip', 'Google DeepMind', '2020 →', '2020 年以来每一代 TPU 的布局'],
    ['发现算法', 'AlphaEvolve', 'Google DeepMind', '2025.05', '4×4 复数矩阵乘法：56 年来第一次被改进'],
    ['做数学', 'Gemini Deep Think', 'Google DeepMind', '2025.07', '国际数学奥林匹克 35 / 42，金牌线，官方评卷'],
    ['做研究', '弱到强泛化', 'Anthropic', '2026.04', '智能体找回 97% 的差距；两位人类研究员一周找回 23%'],
  ];

  // ---------------------------------------------------------------------------
  // S8 · 1965 — exact quotes (translations are ours; originals verbatim)
  // ---------------------------------------------------------------------------
  D.QUOTES = {
    turing: {
      who: '艾伦 · 图灵',
      when: '1951',
      src: 'BBC 广播《智能机器，一种异端理论》',
      zh: '机器的思考方法一旦启动，用不了多久就会超出我们可怜的能力。……它们能彼此交谈，磨砺彼此的才智。因此到了某个阶段，我们只能预期：机器将接管控制。',
      en: '…it seems probable that once the machine thinking method had started, it would not take long to outstrip our feeble powers. … At some stage therefore we should have to expect the machines to take control…',
    },
    good: {
      who: 'I. J. 古德',
      when: '1965',
      src: '《关于第一台超智能机器的推测》',
      zh: '既然设计机器也是这些智力活动中的一种，一台超智能机器就能设计出更好的机器；那么毫无疑问，将会出现一场「智能爆炸」，而人的智能将被远远甩在身后。因此，第一台超智能机器，是人类需要做出的最后一项发明——只要这台机器足够温顺，愿意告诉我们怎样控制它。',
      en: '…an ultraintelligent machine could design even better machines; there would then unquestionably be an "intelligence explosion", and the intelligence of man would be left far behind. Thus the first ultraintelligent machine is the last invention that man need ever make, provided that the machine is docile enough to tell us how to keep it under control.',
    },
    vinge: {
      who: '弗诺 · 文奇',
      when: '1993',
      src: '《即将到来的技术奇点》',
      zh: '三十年之内，我们将拥有创造超人智能的技术手段。此后不久，人类时代将会结束。',
      en: 'Within thirty years, we will have the technological means to create superhuman intelligence. Shortly after, the human era will be ended.',
    },
    wiener: {
      who: '诺伯特 · 维纳',
      when: '1960',
      src: '《自动化的某些道德与技术后果》',
      zh: '如果我们用一种机械手段来实现我们的目的，而一旦启动就无法有效干预它——那么我们最好非常确定：放进机器里的目的，是我们真正想要的目的，而不是它的一个花哨的仿制品。',
      en: '…then we had better be quite sure that the purpose put into the machine is the purpose which we really desire and not merely a colorful imitation of it.',
    },
    minsky: {
      who: '马文 · 明斯基',
      when: '1970',
      src: '《生活》杂志',
      zh: '三到八年之内，我们就会拥有一台具备普通人一般智能的机器。',
      en: 'In from three to eight years we will have a machine with the general intelligence of an average human being.',
    },
    kurzweil: {
      who: '雷 · 库兹韦尔',
      when: '2001',
      src: '《加速回报定律》',
      zh: '二十一世纪不会只经历一百年的进步。我们将目睹的，是按今天的速度算、大约两万年的进步。',
      en: "…it isn't the case that we'll experience 100 years of progress in the 21st century. Rather we'll witness on the order of twenty thousand years of progress — at today's rate of progress.",
    },
    amodei: {
      who: '达里奥 · 阿莫迪',
      when: '2024',
      src: '《优雅机器》',
      zh: '我们可以把这概括为：一个数据中心里的天才国度。',
      en: 'We could summarize this as a "country of geniuses in a datacenter".',
    },
  };

  // AI Impacts survey of 1,580 AI researchers (2024): predicted year of 50% "high-level machine intelligence",
  // by the year the survey was run. The horizon moved ~3.4 years closer per year.
  D.SURVEY = [
    ['2016', 2061],
    ['2022', 2059],
    ['2023', 2047],
    ['2024', 2042],
  ];
  // Named forecasts for "powerful AI / superintelligence": [who, when said, predicted date, quote]
  D.FORECASTS = [
    ['萨姆 · 奥尔特曼', '2024.09', 2033, '有可能就在几千天内'],
    ['达里奥 · 阿莫迪', '2024.10', 2026.5, '最早 2026 年'],
    ['德米斯 · 哈萨比斯', '2025.01', 2030, '50% 概率，2030 年之前'],
    ['Metaculus 社区', '2026.11', 2027.6, '中位数：2027 年 8 月'],
  ];

  // ---------------------------------------------------------------------------
  // S10 · 天才国度
  // ---------------------------------------------------------------------------
  D.ECON = {
    chatgptWeekly: 1.2e9,
    chatgptDate: '2026.11.10',
    capex2026: [
      ['Alphabet', 200],
      ['Microsoft', 170],
      ['Meta', 140],
      ['Amazon', 220],
    ],
    capex2027: '超过 1 万亿',
    stargate: 5000,
    claudeCode: 0.8,
    anthropicRR: 810,
    openaiRR: 500,
    queryWh: 0.34,
    researchers: 900, // 万: UNESCO counts ~8.8M full-time-equivalent researchers (2018)
  };

  // ---------------------------------------------------------------------------
  // S11 · 快进的百年
  // ---------------------------------------------------------------------------
  D.SCI = {
    pdb: 190000, // experimentally determined structures in the PDB, ~2022 (archive founded 1971)
    alphafold: 200000000, // AlphaFold DB, 2022-07-28
    perCell: 16000, // the slide draws a 125 × 100 grid: 12,500 cells × 16,000 = 200,000,000
    cols: 125,
    rows: 100,
  };

  // ---------------------------------------------------------------------------
  // S12 · 瓦 — power ladder
  // ---------------------------------------------------------------------------
  D.SCALE = [
    { w: 20, name: '人脑', note: '860 亿个神经元，一台台灯的功率', exp: '20 瓦' },
    { w: 2.25e10, name: '三峡大坝', note: '2250 万千瓦', exp: '2.25 × 10¹⁰ 瓦' },
    { w: 3.6e12, name: '全人类发电', note: '2025 年约 31,700 太瓦时', exp: '3.6 × 10¹² 瓦' },
    { w: 1.74e17, name: '照向地球的阳光', note: '卡尔达肖夫 Ⅰ 型', exp: '1.7 × 10¹⁷ 瓦' },
    { w: 3.83e26, name: '太阳的全部输出', note: '卡尔达肖夫 Ⅱ 型', exp: '3.8 × 10²⁶ 瓦' },
    { w: 4.0e37, name: '整个银河系', note: '卡尔达肖夫 Ⅲ 型', exp: '4 × 10³⁷ 瓦' },
  ];
  D.GALAXY_YEARS = '一百万年';

  // ---------------------------------------------------------------------------
  // S9 · 时间 — conditional arithmetic: if the rate of progress doubled every year
  // ---------------------------------------------------------------------------
  // [years from now, label, years of wall-clock time for one century of 20th-century progress]
  D.ZENO = [
    [0, '100 年', 100],
    [7, '9.4 个月', 0.781],
    [10, '36 天', 0.0977],
    [13, '4.4 天', 0.0122],
    [16, '13.4 小时', 0.00153],
  ];
})();
