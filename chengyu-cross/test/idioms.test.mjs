/* 词库自测：node test/idioms.test.mjs
 * 校验项：
 *   1) 总条数 ≥ 950
 *   2) 每条恰为 4 个 CJK 汉字（/^[\u4e00-\u9fff]{4}$/）
 *   3) Set 去重后数量不变（全表无重复）
 *   4) COMMON_CHARS ≥ 220，且严格按在 list 中的频次降序、无重复、均在词库中出现
 *   5) 打印字符覆盖度：出现≥10 次的单字个数 + Top20 高频字
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CY_BANK = require('../src/idioms.js');

const list = CY_BANK.list;
const cc = CY_BANK.COMMON_CHARS;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log('PASS  ' + name);
  } else {
    failed++;
    console.log('FAIL  ' + name + (detail ? '  ->  ' + detail : ''));
  }
}

/* 频次表（测试独立重算，不依赖实现内部逻辑） */
const freq = Object.create(null);
for (const w of list) for (const ch of w) freq[ch] = (freq[ch] || 0) + 1;

/* 1. 总数 */
check(`总条数≥950（实际 ${list.length}）`, list.length >= 950);

/* 2. 格式 */
const re = /^[\u4e00-\u9fff]{4}$/;
const bad = list.filter((w) => !re.test(w));
check('每条恰为4个CJK汉字', bad.length === 0,
  bad.length ? `非法条目(${bad.length}): ${bad.slice(0, 10).join(' / ')}${bad.length > 10 ? ' …' : ''}` : '');

/* 3. 去重 */
const uniq = new Set(list);
if (uniq.size === list.length) {
  check('Set去重后数量不变', true);
} else {
  const count = Object.create(null);
  for (const w of list) count[w] = (count[w] || 0) + 1;
  const dups = Object.keys(count).filter((w) => count[w] > 1);
  check('Set去重后数量不变', false,
    `去重前 ${list.length} / 去重后 ${uniq.size}；重复项: ${dups.slice(0, 20).join(' / ')}`);
}

/* 4. COMMON_CHARS */
check(`COMMON_CHARS≥220（实际 ${cc.length}）`, Array.isArray(cc) && cc.length >= 220);
const ccDup = new Set(cc);
check('COMMON_CHARS 无重复单字', ccDup.size === cc.length);
check('COMMON_CHARS 均为单字且在词库中出现',
  cc.every((c) => /^[\u4e00-\u9fff]$/.test(c) && freq[c] > 0),
  cc.filter((c) => !(freq[c] > 0)).slice(0, 10).join(''));
let sortedDesc = true;
for (let i = 1; i < cc.length; i++) {
  if (freq[cc[i - 1]] < freq[cc[i]]) { sortedDesc = false; break; }
}
check('COMMON_CHARS 按频次降序', sortedDesc);

/* 5. 字符覆盖度 */
const ge10 = Object.keys(freq).filter((c) => freq[c] >= 10).length;
const top20 = Object.keys(freq)
  .sort((a, b) => freq[b] - freq[a] || a.localeCompare(b, 'zh'))
  .slice(0, 20)
  .map((c) => `${c}:${freq[c]}`)
  .join(' ');
console.log('---- 字符覆盖度 ----');
console.log(`词库总条数: ${list.length}（去重后 ${uniq.size}）`);
console.log(`不同单字总数: ${Object.keys(freq).length}`);
console.log(`出现≥10次的单字: ${ge10} 个`);
console.log(`Top20 高频字: ${top20}`);

if (failed) {
  console.log(`RESULT: ${failed} 项未通过`);
  process.exit(1);
} else {
  console.log('RESULT: ALL PASS');
}
