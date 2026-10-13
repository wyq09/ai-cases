/* 填成语 主线逻辑自测：node test/logic.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const L = require('../src/logic.js');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
}

/* 高连通迷你词库（词库代理产出前也可稳定回归） */
const MINI = ('一心一意 十全十美 万水千山 千军万马 千家万户 万事大吉 大功告成 大快人心 ' +
  '七步成章 举目千里 光彩夺目 光明磊落 落落大方 心想事成 成千上万 万紫千红 ' +
  '山清水秀 青山绿水 风和日丽 春暖花开 花红柳绿 鸟语花香 井井有条 头头是道 ' +
  '天长地久 地久天长 日新月异 异想天开 开门见山 来日方长 长年累月 月明星稀 ' +
  '理直气壮 壮志凌云 云开雾散 勇往直前 前因后果 果实累累 改邪归正 正大光明 ' +
  '明察秋毫 毫不利己 欲罢不能 能屈能伸 凡夫俗子 有口皆碑 话中有话 机不可失 ' +
  '失而复得 一目十行 行云流水 水到渠成 成人之美 美中不足 足智多谋 谋事在人 ' +
  '人定胜天 天下第一 一鸣惊人 人山人海 海阔天空 空前绝后 后来居上 上行下效 ' +
  '寸步难行 行之有效 力争上游 游刃有余 余音绕梁 梁上君子').split(/\s+/);
const COMMON = MINI.join('').split('').filter((v, i, a) => a.indexOf(v) === i);

console.log('\n== 生成器 ==');
/* 1. 确定性 */
{
  const a = L.genPuzzle({ seed: 12345, count: 6, maxSpan: 9, list: MINI });
  const b = L.genPuzzle({ seed: 12345, count: 6, maxSpan: 9, list: MINI });
  ok(JSON.stringify(a.words) === JSON.stringify(b.words), '同种子生成完全一致', a.words.length + ' 词');
}
/* 2. 关卡 1..30 全部合法、连通、规模单调 */
{
  let worst = null, allOk = true, counts = [];
  for (let lv = 1; lv <= 30; lv++) {
    const count = Math.min(14, 4 + Math.floor((lv - 1) / 2));
    const raw = L.genPuzzle({ seed: L.fnv1a('builtin|lvl|' + lv + '|v1'), count, maxSpan: 9, list: MINI });
    const v = L.validateGrid({ words: raw.words });
    counts.push(raw.words.length);
    if (!v.ok || raw.words.length < 4) { allOk = false; worst = { lv, v: v.errors, n: raw.words.length }; }
  }
  ok(allOk, '30 关全部通过 validateGrid 且 ≥4 词', worst ? JSON.stringify(worst) : '');
  ok(Math.max(...counts) >= 12, '高关卡能摆出 12+ 词', 'max=' + Math.max(...counts));
}
/* 3. 网格跨度约束 */
{
  const raw = L.genPuzzle({ seed: 777, count: 10, maxSpan: 7, list: MINI });
  const m = gridMetrics(raw);
  ok(m.rows <= 7 && m.cols <= 7, 'maxSpan=7 时网格不超界', `${m.rows}x${m.cols}`);
  function gridMetrics(r) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    r.words.forEach(w => {
      for (let i = 0; i < 4; i++) {
        const rr = w.r + (w.dir === 'V' ? i : 0), cc = w.c + (w.dir === 'H' ? i : 0);
        a = Math.min(a, rr); b = Math.max(b, rr); c = Math.min(c, cc); d = Math.max(d, cc);
      }
    });
    return { rows: b - a + 1, cols: d - c + 1 };
  }
}
/* 4. finalize：预给字比例、候选池、每词必有空格 */
{
  const raw = L.genPuzzle({ seed: 42, count: 6, maxSpan: 9, list: MINI });
  const pz = L.finalizePuzzle({ words: raw.words, seed: 42, givenRatio: 0.3, distractorBank: COMMON });
  const cells = pz.cells, keys = Object.keys(cells);
  const givenCnt = keys.filter(k => cells[k].given).length;
  ok(keys.every(k => /^[\u4e00-\u9fff]$/.test(cells[k].ch)), '所有格字符合法');
  ok(givenCnt >= 1 && givenCnt < keys.length, '有预给字且未全给', `${givenCnt}/${keys.length}`);
  let allWordsHaveEmpty = true;
  pz.words.forEach(w => {
    for (let i = 0; i < 4; i++) {
      const k = (w.r + (w.dir === 'V' ? i : 0)) + ',' + (w.c + (w.dir === 'H' ? i : 0));
    }
    const ks = [];
    for (let i = 0; i < 4; i++) ks.push((w.r + (w.dir === 'V' ? i : 0)) + ',' + (w.c + (w.dir === 'H' ? i : 0)));
    if (ks.every(k => cells[k].given)) allWordsHaveEmpty = false;
  });
  ok(allWordsHaveEmpty, '每个成语都留有待填空格');
  const needed = keys.filter(k => !cells[k].given).map(k => cells[k].ch);
  const expectDistr = Math.ceil(needed.length / 2) + 1;
  ok(pz.pool.length === needed.length + expectDistr, '候选池=待填字+干扰字', `${needed.length}+${expectDistr}`);
  const neededSet = {}; needed.forEach(c => neededSet[c] = 1);
  const extra = pz.pool.filter(c => !neededSet[c]);
  ok(extra.length === expectDistr && extra.every(c => !neededSet[c]), '干扰字与待填字无重叠');
  const vv = L.validateGrid({ words: pz.words, cells: pz.cells });
  ok(vv.ok, 'finalize 产物再次过 validateGrid', vv.errors.join(';') || '');
}

console.log('\n== 可行性分析 analyzeImport ==');
{
  const good = '光彩夺目 举目千里 千家万户 万事大吉 大功告成 七步成章';
  const r = L.analyzeImport(good);
  ok(r.parsed === 6 && r.valid.length === 6, '6 条全部识别有效', `parsed=${r.parsed}`);
  ok(r.verdict === 'full', '全连通可摆 → verdict=full', r.verdict);
  ok(r.adopt.length === 6, 'adopt=6', String(r.adopt));
  const v = L.validateGrid({ words: r.placement.placed, cells: r.placement.placedCells || null });
  ok(v.ok, '摆放结果过 validateGrid', v.errors.join(';') || '');
  ok(r.placement.ms < 1500, '求解耗时受控', r.placement.ms + 'ms');

  const r2 = L.analyzeImport(good + '\n画蛇添足');
  ok(r2.isolated.indexOf('画蛇添足') >= 0, '孤立词被识别', r2.isolated.join(','));
  ok(r2.verdict === 'partial' && r2.adopt.length === 6, '孤立不影响可行子集', r2.verdict + '/' + r2.adopt.length);

  const r3 = L.analyzeImport('光彩夺目 举目千里 三个字 五个字的成语 hello 千家万户 千家万户');
  ok(r3.invalid.length === 3, '非法词识别（非四字/含外文）', JSON.stringify(r3.invalid.map(x => x.reason)));
  ok(r3.duplicates.indexOf('千家万户') >= 0, '重复词识别');
  ok(r3.adopt.length === 3, '非法/重复不影响其余可行子集', String(r3.adopt));

  const big = MINI.join(' ');
  const r4 = L.analyzeImport(big);
  ok(r4.placement.placed.length >= 20, '80 词大词库自适应跨度后大部分可连通成谜', `placed=${r4.placement.placed.length} isolated=${r4.isolated.length} unplaced=${r4.placement.unplaced.length}`);
  const v4 = L.validateGrid({ words: r4.placement.placed });
  ok(v4.ok, '大词库摆放结果合法', v4.errors.slice(0, 3).join(';'));

  const r5 = L.analyzeImport('一心一意 意气风发 发扬光大');
  ok(r5.verdict === 'full' || r5.adopt.length >= 3, '三词链式连通可行', `${r5.verdict} placed=${r5.adopt.length}`);

  const r6 = L.analyzeImport('画蛇添足');
  ok(r6.verdict === 'none', '单词输入判不可行', r6.verdict);
  const r7 = L.analyzeImport('');
  ok(r7.verdict === 'none' && r7.parsed === 0, '空输入安全', r7.verdict);
}

console.log('\n== 里程碑与配置 ==');
{
  const adv1 = L.advanceMilestones(0, [1, 3, 14], [120, 120, 240], 0);
  ok(adv1.idx === 0 && adv1.gains.length === 0, '0 填无里程碑');
  const adv2 = L.advanceMilestones(1, [1, 3, 14], [120, 120, 240], 0);
  ok(adv2.idx === 1 && adv2.gains.length === 1 && adv2.gains[0].amount === 120, '第1填得120');
  const adv3 = L.advanceMilestones(15, [1, 3, 14], [120, 120, 240], 1);
  ok(adv3.idx === 3 && adv3.gains.length === 2, '一次连跳两个里程碑');
  const adv4 = L.advanceMilestones(99, [1, 3, 14], [120, 120, 240], 3);
  ok(adv4.idx === 3 && adv4.gains.length === 0, '全部达成后不再重复发放');
}
{
  try {
    const C = require('../src/config.js');
    const g1 = C.get();
    ok(g1.level.attempts === 5 && g1.rewards.milestones.join() === '1,3,14', '默认配置正确');
    C.set({ level: { attempts: 99 } });
    ok(C.get().level.attempts === 20, 'attempts 钳制到 20');
    C.set({ rewards: { milestones: [5, 3] } });
    ok(C.get().rewards.milestones.join() === '1,3,14', '非法里程碑(非递增)回退默认');
    C.set({ rewards: { milestones: [2, 5, 9], amounts: [50, 60] } });
    ok(C.get().rewards.milestones.join() === '1,3,14', '里程碑与金额个数不一致回退默认');
    C.set({ rewards: { milestones: [2, 5, 9], amounts: [50, 60, 70] } });
    ok(C.get().rewards.milestones.join() === '2,5,9' && C.get().rewards.amounts.join() === '50,60,70', '合法里程碑生效');
    ok(C.importJson('not-json') === false, '导入非法 JSON 拒绝');
  } catch (e) {
    ok(false, 'config.js node 加载', e.message);
  }
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
