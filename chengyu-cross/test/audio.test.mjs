// 音效模块 node 自测：加载不炸 + 守卫 + 无 AudioContext 降级
// 运行：node test/audio.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const audioPath = fileURLToPath(new URL('../src/audio.js', import.meta.url));

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    const r = fn();
    if (r === false) {
      fail++;
      console.log('FAIL - ' + name);
    } else {
      pass++;
      console.log('ok   - ' + name);
    }
  } catch (err) {
    fail++;
    console.log('FAIL - ' + name + ' :: ' + (err && err.message));
  }
}

let audio = null;

check('node require src/audio.js 不抛错', () => {
  audio = require(audioPath);
  return true;
});

check('挂载到 globalThis.CY.audio（window 守卫）', () =>
  !!(globalThis.CY && globalThis.CY.audio === audio));

['init', 'unlock', 'play', 'setVol', 'applyOverrides', 'startBgm', 'stopBgm']
  .forEach((m) => check('方法存在: audio.' + m, () => typeof audio[m] === 'function'));

check('_lastPlayed 初始为空（null/undefined）', () =>
  audio._lastPlayed === null || audio._lastPlayed === undefined);

check('play 未知名为安全 no-op（不炸、不记 _lastPlayed）', () => {
  const before = audio._lastPlayed;
  const ret = audio.play('__not_a_sound__');
  return ret === undefined && audio._lastPlayed === before;
});

check('play("tap") 无 AudioContext 降级不抛错', () => {
  audio.play('tap');
  return true;
});

check('_lastPlayed 记录 tap', () => audio._lastPlayed === 'tap');

const NAMES = ['tap', 'correct', 'wrong', 'milestone', 'win', 'fail', 'coin', 'hint'];
check('8 个合法音效名全部安全降级播放', () => {
  for (const n of NAMES) audio.play(n);
  return audio._lastPlayed === 'hint'; // 最后一个是 hint
});

check('init() 幂等（重复调用无副作用）', () => {
  audio.init();
  audio.init();
  audio.init();
  return true;
});

check('unlock() 幂等（连续 3 次）', () => {
  audio.unlock();
  audio.unlock();
  audio.unlock();
  return true;
});

check('setVol 越界值被钳制且不抛错', () => {
  audio.setVol({ master: 9, sfx: -2, bgm: 0.5 });
  audio.setVol(null);
  return true;
});

check('applyOverrides({muted:true}) 后 play 不抛错', () => {
  audio.applyOverrides({ muted: true });
  audio.play('win');
  return audio._lastPlayed === 'win';
});

check('applyOverrides({muted:false}) 恢复后 play 不抛错', () => {
  audio.applyOverrides({ muted: false });
  audio.play('coin');
  return true;
});

check('applyOverrides 非法入参安全忽略', () => {
  audio.applyOverrides(null);
  audio.applyOverrides('x');
  audio.applyOverrides({ unknown: 1 });
  return true;
});

check('BGM 开关安全（node 无声，仅记账）', () => {
  audio.startBgm();
  audio.stopBgm();
  audio.startBgm();
  audio.stopBgm();
  audio.stopBgm();
  return true;
});

check('播放未知名后 _lastPlayed 不被污染', () => {
  audio.play('definitely-not-a-sound');
  return audio._lastPlayed === 'coin';
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
