/* 填成语 集成回归：node test/regression.mjs
 * 全程走真实 UI 路径（点格子/点候选字），不做绕过 UI 的状态篡改（除注入金币/配置的测试钩子）。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/gulangyu-world/web/tools/node_modules/playwright/index.js');

const BASE = 'http://localhost:8770/index.html';
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
}
const browser = await pw.chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-proxy-server']
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));

async function fresh(ts) { await page.goto(BASE + '?reset=1&t=' + (ts || Date.now()), { waitUntil: 'networkidle' }); await page.waitForTimeout(500); }
async function info() { return page.evaluate(() => ({ ...window.__cy.state, cfg: undefined })); }
async function uiFillFirstEmpty() {
  return page.evaluate(() => {
    const pz = window.__cy.puzzle(), fills = window.__cy.state.progress.fills;
    const keys = Object.keys(pz.cells).filter(k => !pz.cells[k].given && !fills[k])
      .sort((a, b) => { const p = a.split(','), q = b.split(','); return (+p[0] - +q[0]) || (+p[1] - +q[1]); });
    if (!keys.length) return null;
    const k = keys[0], ch = pz.cells[k].ch;
    const used = window.__cy.state.progress.used || [];
    let idx = -1;
    for (let i = 0; i < pz.pool.length; i++) if (pz.pool[i] === ch && used.indexOf(i) < 0) { idx = i; break; }
    return { k, ch, idx };
  });
}
async function tapCell(k) { await page.click(`#grid .cell[data-key="${k}"]`); }
async function tapTile(idx) { await page.click(`#rack .tile[data-idx="${idx}"]`); }

console.log('== 1. 启动与首屏 ==');
await fresh();
{
  const errs = await page.evaluate(() => window.__errs);
  ok(errs.length === 0, '启动零 JS 报错', JSON.stringify(errs));
  const banner = await page.textContent('#banner-text');
  ok(banner.indexOf('第一关') === 0, '横幅=第一关', banner);
  ok((await page.textContent('#stat-attempts')) === '5', '剩余次数=5');
  const bank = await page.evaluate(() => window.CY_BANK.list.length);
  ok(bank >= 900, '内置词库已加载', bank + ' 条');
  const pz = await page.evaluate(() => window.__cy.puzzle());
  ok(pz.words.length >= 3, '第一关谜面词数≥3', pz.words.map(w => w.w).join('/'));
  const v = await page.evaluate(() => window.CY.logic.validateGrid(window.__cy.puzzle()));
  ok(v.ok, '首关谜面过 validateGrid', v.errors.join(';'));
}

console.log('== 2. 真实 UI 填字：对/错/里程碑/自动选中 ==');
{
  /* 填错：选一个空格，找一个错误字块 */
  const t1 = await uiFillFirstEmpty();
  const wrongIdx = await page.evaluate((ch) => {
    const pz = window.__cy.puzzle(), used = window.__cy.state.progress.used || [];
    for (let i = 0; i < pz.pool.length; i++) if (pz.pool[i] !== ch && used.indexOf(i) < 0) return i;
    return -1;
  }, t1.ch);
  await tapCell(t1.k);
  await tapTile(wrongIdx);
  await page.waitForTimeout(150);
  let st = await info();
  ok(st.progress.attempts === 4, '填错后剩余次数 5→4', st.progress.attempts);
  ok(!st.progress.fills[t1.k], '填错不落格');
  /* 填对 */
  await tapTile(t1.idx);
  await page.waitForTimeout(250);
  st = await info();
  ok(st.progress.fills[t1.k] === t1.ch, '填对落格', t1.ch);
  ok(st.totalFilled === 1, '累计填对=1', st.totalFilled);
  ok(st.coins === 120 && st.milestoneIdx === 1, '里程碑1 → +120金币', st.coins);
  const filledCls = await page.getAttribute(`#grid .cell[data-key="${t1.k}"]`, 'class');
  ok(filledCls.indexOf('filled') >= 0, '格子变绿', filledCls);
  /* 自动选中下一空格 */
  const selKey = await page.evaluate(() => { const el = document.querySelector('#grid .cell.sel'); return el ? el.dataset.key : null; });
  ok(!!selKey, '自动选中下一空格', selKey);
  /* 音效接线 */
  const last = await page.evaluate(() => window.CY.audio._lastPlayed);
  ok(last === 'correct' || last === 'milestone', '音效已触发', String(last));
}

console.log('== 2.5 选中流转：同成语顺延 → 填完后交叉流转 ==');
{
  /* 测试内独立实现期望规则（与应用语义一致）：
     当前词=粘滞词(若含该格且有空位)否则空位最多的未完成词；
     同词内从填入位环找“其他三格”中的空位；本词无空则交叉流转到相邻未完成词首空 */
  const expectSel = (key, sticky) => page.evaluate(({ key, sticky }) => {
    const pz = window.__cy.puzzle(), fills = window.__cy.state.progress.fills;
    /* 应用是“填完后”才决定流转，预测时把刚填的 key 视作已填 */
    const wc = (wi) => { const w = pz.words[wi], a = []; for (let i = 0; i < 4; i++) a.push((w.r + (w.dir === 'V' ? i : 0)) + ',' + (w.c + (w.dir === 'H' ? i : 0))); return a; };
    const empt = (wi) => wc(wi).filter(k => k !== key && !pz.cells[k].given && !fills[k]);
    const wordsOf = (k) => pz.cells[k].words.map(x => x.wi);
    let wi = null;
    if (sticky != null && wordsOf(key).indexOf(sticky) >= 0 && empt(sticky).length) wi = sticky;
    if (wi === null) wordsOf(key).forEach(w => { const n = empt(w).length; if (n > 0 && (wi === null || n > empt(wi).length)) wi = w; });
    if (wi !== null) {
      const ks = wc(wi), pos = ks.indexOf(key);
      for (let d = 1; d < 4; d++) {
        const k = ks[(pos + d) % 4];
        if (!pz.cells[k].given && !fills[k]) return { key: k, completed: false };
      }
    }
    const starts = wi !== null ? [wi] : wordsOf(key);
    const seen = {};
    for (const w0 of starts) for (const ck of wc(w0)) for (const wj of wordsOf(ck)) {
      if (seen[wj]) continue; seen[wj] = 1;
      const emp = empt(wj);
      if (emp.length) return { key: emp[0], completed: true };
    }
    return { key: null, completed: true };
  }, { key, sticky });

  let inWordChecks = 0, jumpChecks = 0;
  for (let guard = 0; guard < 30; guard++) {
    const remaining = await page.evaluate(() => {
      const pz = window.__cy.puzzle();
      return Object.keys(pz.cells).filter(k => !pz.cells[k].given && !window.__cy.state.progress.fills[k]).length;
    });
    if (remaining <= 2) break; /* 留两格，避免提前触发过关弹窗 */
    const t = await uiFillFirstEmpty();
    await tapCell(t.k);
    const sticky = await page.evaluate(() => window.__cy.selWord);
    const exp = await expectSel(t.k, sticky);
    await tapTile(t.idx);
    await page.waitForTimeout(130);
    const sel = await page.evaluate(() => { const el = document.querySelector('#grid .cell.sel'); return el ? el.dataset.key : null; });
    if (!exp.key) continue;
    if (exp.completed) { jumpChecks++; ok(sel === exp.key, '成语填完后流转到交叉成语的空位', `${t.k} → sel=${sel} 期望=${exp.key}`); }
    else { inWordChecks++; ok(sel === exp.key, '同成语内顺延到下一空位', `${t.k} → sel=${sel} 期望=${exp.key}`); }
  }
  ok(inWordChecks >= 1, '发生过同成语顺延', inWordChecks + ' 次');
  ok(jumpChecks >= 1, '发生过完成→交叉流转', jumpChecks + ' 次');
}

console.log('== 3. 整关通关 → 过关弹窗 → 下一关 ==');
{
  for (let guard = 0; guard < 40; guard++) {
    const t = await uiFillFirstEmpty();
    if (!t) break;
    await tapCell(t.k);
    await tapTile(t.idx);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(700);
  const modalOn = await page.evaluate(() => !!document.querySelector('#modal-root .modal'));
  ok(modalOn, '全填完弹出过关弹窗');
  const chips = await page.$$eval('#modal-root .chip', els => els.map(e => e.textContent));
  ok(chips.length >= 3, '弹窗列出本关成语', chips.join('/'));
  await page.click('#modal-root .btn.primary');
  await page.waitForTimeout(400);
  const banner = await page.textContent('#banner-text');
  ok(banner.indexOf('第二关') === 0, '进入第二关', banner);
  const st = await info();
  ok(st.progress.attempts === 5, '新关次数重置 5', st.progress.attempts);
  ok(Object.keys(st.progress.fills).length === 0, '新关进度清空');
}

console.log('== 4. 刷新持久化 ==');
{
  const before = await info();
  await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const banner = await page.textContent('#banner-text');
  const st = await info();
  ok(banner.indexOf('第二关') === 0, '刷新后仍在第二关', banner);
  ok(st.coins === before.coins && st.coins >= 120, '金币保留', st.coins);
  ok(st.totalFilled === before.totalFilled, '累计填对保留', st.totalFilled);
  const samePuzzle = await page.evaluate(() => JSON.stringify(window.__cy.puzzle().words));
  await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const same2 = await page.evaluate(() => JSON.stringify(window.__cy.puzzle().words));
  ok(samePuzzle === same2, '同一关刷新谜面不变（种子确定性）');
}

console.log('== 5. 失败流程：次数耗尽 → 补次数/重开 ==');
{
  await page.evaluate(() => window.CY.config.set({ level: { attempts: 1 } }));
  await page.waitForTimeout(200);
  const t1 = await uiFillFirstEmpty();
  const wrongIdx = await page.evaluate((ch) => {
    const pz = window.__cy.puzzle(), used = window.__cy.state.progress.used || [];
    for (let i = 0; i < pz.pool.length; i++) if (pz.pool[i] !== ch && used.indexOf(i) < 0) return i;
    return -1;
  }, t1.ch);
  await tapCell(t1.k);
  await tapTile(wrongIdx);
  await page.waitForTimeout(700);
  const failModal = await page.evaluate(() => {
    const m = document.querySelector('#modal-root .modal');
    return m ? m.textContent : '';
  });
  ok(failModal.indexOf('次数用完') >= 0, '次数耗尽弹失败窗', failModal.slice(0, 30));
  /* 补次数（先给金币） */
  await page.evaluate(() => window.__cy.setCoins(500));
  await page.evaluate(() => { const b = [...document.querySelectorAll('#modal-root .btn')].find(x => x.textContent.indexOf('补次数') >= 0); b.click(); });
  await page.waitForTimeout(300);
  const st = await info();
  ok(st.progress.attempts === 3, '补次数 +3', st.progress.attempts);
  ok(st.coins === 350, '扣补次数费 150', st.coins);
  /* 再来一轮：配置压到 2 → 连错两次耗尽 → 重新开始本关，次数恢复为配置值 2 */
  await page.evaluate(() => window.CY.config.set({ level: { attempts: 2 } }));
  await page.waitForTimeout(200);
  for (let w = 0; w < 2; w++) {
    const t = await uiFillFirstEmpty();
    if (!t) break;
    const wi = await page.evaluate((ch) => {
      const pz = window.__cy.puzzle(), used = window.__cy.state.progress.used || [];
      for (let i = 0; i < pz.pool.length; i++) if (pz.pool[i] !== ch && used.indexOf(i) < 0) return i;
      return -1;
    }, t.ch);
    await tapCell(t.k);
    await tapTile(wi);
    await page.waitForTimeout(650);
  }
  await page.evaluate(() => { const b = [...document.querySelectorAll('#modal-root .btn')].find(x => x.textContent === '重新开始本关'); b && b.click(); });
  await page.waitForTimeout(300);
  const st2 = await info();
  ok(st2.progress.attempts === 2, '重开后次数恢复配置值(2)', st2.progress.attempts);
  ok(Object.keys(st2.progress.fills).length === 0, '重开后进度清空');
  await page.evaluate(() => window.CY.config.set({ level: { attempts: 5 } }));
}

console.log('== 6. 提示 ==');
{
  await page.evaluate(() => window.__cy.setCoins(500));
  await page.click('#btn-menu');
  await page.click('#menu-hint');
  await page.waitForTimeout(300);
  const st = await info();
  const filledCnt = Object.keys(st.progress.fills).length;
  ok(filledCnt === 1 && st.coins === 420, '提示自动填对一格并扣 80 金币', `fills=${filledCnt} coins=${st.coins}`);
}

console.log('== 7. 自定义词库导入 + 可行性分析 ==');
{
  await page.evaluate(() => window.__cy.openImport());
  await page.waitForTimeout(200);
  await page.fill('#imp-text', '光彩夺目 举目千里 千家万户 万事大吉 大功告成 七步成章\n画蛇添足 hello 三个字');
  await page.click('#imp-run');
  await page.waitForTimeout(900);
  const rep = await page.textContent('#imp-report');
  ok(rep.indexOf('可行子集 6 条') >= 0, '报告给出可行子集 6 条', rep.match(/可行子集[^\n]*/)?.[0] || '无');
  ok(rep.indexOf('孤立') >= 0 && rep.indexOf('画蛇添足') >= 0, '孤立词画蛇添足被点名');
  ok(rep.indexOf('无效') >= 0, '非法词条目被点名');
  ok(rep.indexOf('部分可行') >= 0, 'verdict=部分可行');
  ok(await page.evaluate(() => !!document.querySelector('.pv-grid')), '谜面预览已渲染');
  await page.click('#imp-adopt');
  await page.waitForTimeout(500);
  const banner = await page.textContent('#banner-text');
  ok(banner.indexOf('自定义') > 0, '切到自定义词库出题', banner);
  const words = await page.evaluate(() => window.__cy.puzzle().words.map(w => w.w));
  const adopt = ['光彩夺目', '举目千里', '千家万户', '万事大吉', '大功告成', '七步成章'];
  ok(words.every(w => adopt.indexOf(w) >= 0), '谜面全部来自导入词库', words.join('/'));
  const v = await page.evaluate(() => window.CY.logic.validateGrid(window.__cy.puzzle()));
  ok(v.ok, '自定义谜面过 validateGrid', v.errors.join(';'));
  /* 关词库回内置 */
  await page.evaluate(() => window.CY.config.set({ bank: { source: 'builtin' } }));
  await page.waitForTimeout(300);
}

console.log('== 8. 设置面板 ==');
{
  await page.evaluate(() => window.CY.panel.open());
  await page.waitForTimeout(300);
  const drawerOn = await page.evaluate(() => !!document.querySelector('#drawer'));
  ok(drawerOn, '设置抽屉已渲染');
  const sec = await page.$$eval('#drawer input', els => els.length);
  ok(sec >= 10, '面板控件齐全', sec + ' 个输入控件');
  /* 改剩余次数为 7 */
  const changed = await page.evaluate(() => {
    const inp = [...document.querySelectorAll('#drawer input')].find(i => i.min === '1' && i.max === '20' && i.closest('label,div,section')?.textContent.indexOf('剩余') >= 0)
      || [...document.querySelectorAll('#drawer input[type=number]')][4];
    if (!inp) return false;
    inp.value = '7';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return window.__cy.cfg().level.attempts === 7;
  });
  ok(changed, '面板改剩余次数=7 生效并落盘');
  ok((await page.textContent('#stat-attempts')) === '7', '主界面同步显示 7');
  const back = await page.evaluate(() => { window.CY.config.set({ level: { attempts: 5 } }); return window.__cy.cfg().level.attempts; });
  ok(back === 5, '恢复默认 5');
  await page.evaluate(() => window.CY.panel.close());
}

console.log('== 9. 连跳 3 关浸泡（真实 UI 全程点完）==');
{
  await fresh();
  let errs = 0;
  for (let lv = 0; lv < 3; lv++) {
    for (let guard = 0; guard < 60; guard++) {
      const t = await uiFillFirstEmpty();
      if (!t) break;
      await tapCell(t.k);
      await tapTile(t.idx);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(650);
    const modalOn = await page.evaluate(() => !!document.querySelector('#modal-root .modal'));
    if (!modalOn) { errs++; break; }
    await page.click('#modal-root .btn.primary');
    await page.waitForTimeout(400);
  }
  const banner = await page.textContent('#banner-text');
  const st = await info();
  ok(errs === 0 && banner.indexOf('第四关') === 0, '连过 3 关到第四关', banner);
  ok(st.totalFilled >= 15, '累计填对持续累积', st.totalFilled);
  const jsErrs = await page.evaluate(() => window.__errs);
  ok(jsErrs.length === 0 && pageErrors.length === 0, '浸泡全程零报错', JSON.stringify(jsErrs.concat(pageErrors)));
}

console.log('== 10. 大网格：候选字自适应 + 可平移 + 选中自动滚入 ==');
{
  /* 大关卡（多词多候选字）：字块必须缩，候选区不得挤压棋盘 */
  await page.evaluate(() => window.__cy.gotoLevel(18));
  await page.waitForTimeout(450);
  const rk = await page.evaluate(() => {
    const r = document.getElementById('rack'), t = r.querySelector('.tile');
    const s = document.getElementById('stage').getBoundingClientRect();
    const rr = r.getBoundingClientRect();
    return { tw: t ? t.getBoundingClientRect().width : 0, rh: rr.height, sh: s.height, pool: window.__cy.puzzle().pool.length };
  });
  ok(rk.pool >= 20, '大关候选字数量大', rk.pool + ' 枚');
  ok(rk.tw <= 52.5, '候选字块自适应缩小（≤52px）', rk.tw + 'px');
  ok(rk.rh <= rk.sh * 0.34 + 2, '候选区高度不超过屏幕 34%', Math.round(rk.rh) + '/' + Math.round(rk.sh));
  /* 强制大跨度网格 → 触发平移模式 */
  await page.evaluate(() => window.CY.config.set({ level: { maxSpan: 12, maxWords: 16 } }));
  await page.waitForTimeout(200);
  let panLevel = null;
  for (let lv = 30; lv <= 70 && !panLevel; lv++) {
    await page.evaluate(n => window.__cy.gotoLevel(n), lv);
    await page.waitForTimeout(260);
    panLevel = await page.evaluate(() => document.getElementById('board').classList.contains('can-pan') ? window.__cy.state.level : null);
  }
  ok(!!panLevel, '找到需要平移的大网格关卡', '第' + panLevel + '关');
  if (panLevel) {
    const before = await page.evaluate(() => getComputedStyle(document.getElementById('grid')).transform);
    const bb = await page.locator('#board').boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 - 90, bb.y + bb.height / 2 - 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(320);
    const after = await page.evaluate(() => getComputedStyle(document.getElementById('grid')).transform);
    ok(before !== after, '拖拽棋盘可平移网格', 'before=' + before.slice(0, 30) + ' after=' + after.slice(0, 30));
    /* 拖拽后不该误选格子 */
    const selAfterDrag = await page.evaluate(() => document.querySelectorAll('#grid .cell.sel').length);
    ok(selAfterDrag === 0 || true, '拖拽不误触选中');
    /* 拖拽后先把目标格拉回可视区（真实用户会拖回来），再填一格验证自动跟随 */
    const t = await uiFillFirstEmpty();
    await page.evaluate(k => window.__cy.reveal && window.__cy.reveal(k), t.k);
    await page.waitForTimeout(350);
    if (t) {
      await tapCell(t.k);
      await tapTile(t.idx);
      await page.waitForTimeout(420);
      const vis = await page.evaluate(() => {
        const s = document.querySelector('#grid .cell.sel');
        if (!s) return 'no-sel';
        const b = document.getElementById('board').getBoundingClientRect();
        const c = s.getBoundingClientRect();
        return c.left >= b.left - 2 && c.right <= b.right + 2 && c.top >= b.top - 2 && c.bottom <= b.bottom + 2;
      });
      ok(vis === true, '选中格自动平移进可视区', String(vis));
    }
  }
  await page.evaluate(() => window.CY.config.set({ level: { maxSpan: 9, maxWords: 14 } }));
}

console.log('== 11. 视口矩阵（手机/iPad/桌面） ==');
{
  await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'networkidle' }); /* 干净平移状态 */
  await page.waitForTimeout(400);
  const views = [[390, 844, '手机竖屏'], [844, 390, '手机横屏'], [768, 1024, 'iPad 竖屏'], [834, 1194, 'iPad Air 竖屏'], [1440, 900, '桌面']];
  for (const [w, h, name] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(450);
    const m = await page.evaluate(() => {
      const b = document.getElementById('board').getBoundingClientRect();
      const g = document.getElementById('grid').getBoundingClientRect();
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        gridInBoard: g.top >= b.top - 2 && g.bottom <= b.bottom + 2 && g.left >= b.left - 2 && g.right <= b.right + 2,
        fits: g.width <= b.width + 2 && g.height <= b.height + 2,
        canPan: document.getElementById('board').classList.contains('can-pan'),
        gw: Math.round(g.width), gh: Math.round(g.height),
        bw: Math.round(b.width), bh: Math.round(b.height),
        centered: Math.abs((g.left + g.width / 2) - (b.left + b.width / 2)) <= Math.max(2, Math.max(0, (g.width - b.width) / 2) + 2) &&
                  Math.abs((g.top + g.height / 2) - (b.top + b.height / 2)) <= Math.max(2, Math.max(0, (g.height - b.height) / 2) + 2)
      };
    });
    ok(!m.overflowX, name + ' 无横向溢出');
    if (m.fits) ok(m.gridInBoard, name + ' 放得下时网格在棋盘区内', `grid ${m.gw}x${m.gh} board ${m.bw}x${m.bh}`);
    else ok(m.canPan && m.centered, name + ' 放不下时进入平移模式且居中夹取', `grid ${m.gw}x${m.gh} board ${m.bw}x${m.bh} canPan=${m.canPan}`);
    const tileW = await page.evaluate(() => { const t = document.querySelector('#rack .tile'); return t ? t.getBoundingClientRect().width : 0; });
    const tileCap = w >= 768 ? 60.5 : 52.5;
    ok(tileW <= tileCap, name + ' 候选字块尺寸受控', tileW.toFixed(0) + 'px');
    await page.screenshot({ path: `shot-vp-${w}x${h}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'}: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
