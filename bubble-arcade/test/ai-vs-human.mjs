#!/usr/bin/env node
/* 真人视角验证：1 人类 + 3 AI 实战，截屏 + 观察 AI 行为与帧率 */
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:8771';
let CFG = { diff: 'normal', map: 'garden', seconds: 12 };
try { CFG = JSON.parse(readFileSync('/tmp/ba-ai-cfg.json', 'utf8')); } catch (e) {}

const task = await taskSpace('泡泡堂 真人视角');
const page = task.page('p1');
await page.goto(`${BASE}/?reset=1&fps=1&v=${Date.now()}`);
// 标签页提到前台：后台标签被浏览器节流，rAF 几乎不跑，截图也会超时
try { await page.cdp('Page.bringToFront'); } catch (e) {}
await page.waitForFunction(() => window.__ba && window.__ba.phase === 'idle', undefined, { timeout: 20000 });

await page.evaluate((o) => {
  window.__ba.start({ mode: 'ffa', humans: 1, players: 4, diff: o.diff, map: o.map, winsNeeded: 3, seed: 2024 });
  window.__ba.fastForward(3.4);
}, CFG);

// 人类玩家做一些动作：乱走 + 放泡，模拟真实操作
// 真实按键走真实输入链路；物理用 fastForward 确定性推进（ego-lite 无头只有 5~6 FPS，
// 靠真实帧率推进会导致对局时间几乎不走，AI 根本没机会出手）
const acts = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
for (let i = 0; i < CFG.seconds; i++) {
  const k = acts[i % acts.length];
  await page.keyboard.down(k);
  await page.evaluate(() => window.__ba.fastForward(0.6));
  await page.keyboard.up(k);
  if (i % 3 === 0) { await page.keyboard.press('Space'); }
  await page.evaluate(() => window.__ba.fastForward(0.2));
}

const state = await page.evaluate(() => {
  const S = window.__ba.state;
  return {
    fps: window.__ba.fps,
    phase: window.__ba.phase,
    time: Math.round(S.time),
    errors: window.__ba.errors,
    players: S.players.map((p) => ({
      id: p.id, human: p.isHuman, alive: p.alive, trapped: p.trapped,
      x: +p.x.toFixed(2), y: +p.y.toFixed(2),
      bombs: p.statBombs || 0, blocks: p.statBlocks || 0, kills: p.statKills || 0,
      maxBombs: p.maxBombs, power: p.power
    })),
    bombs: S.bombs.length, items: S.items.length
  };
});
console.log('\n=== 实战状态 ===');
console.log('帧率', state.fps, '| 阶段', state.phase, '| 已玩', state.time, 's | JS 报错', state.errors.length);
for (const p of state.players) {
  console.log(`  ${p.id}${p.human ? '(人类)' : '(AI)  '} 活=${p.alive} 困=${p.trapped} 放泡=${p.bombs} 炸箱=${p.blocks} 击杀=${p.kills} 泡数=${p.maxBombs} 威力=${p.power}`);
}
/* 截屏：ego-lite 无头环境里 Page.captureScreenshot 会超时（连标题页都截不出），
 * 改为直接从 canvas 导出 PNG——游戏零外部资源，canvas 不会被污染。 */
let shot = '（截图失败）';
try {
  const dataUrl = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('canvas')]
      .filter(c => c.width > 200 && c.height > 200)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return cands.length ? cands[0].toDataURL('image/png') : '';
  });
  if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
    writeFileSync('/tmp/ba-vs-ai.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
    shot = '/tmp/ba-vs-ai.png';
  } else {
    shot = '（canvas 导出为空）';
  }
} catch (e) {
  shot = '（canvas 导出异常：' + (e && e.message) + '）';
}
console.log('\n截图:', shot);
await task.finish({ keep: [] });
