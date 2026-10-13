// 填成语 · 设置面板自测（代理C）
// 运行：node test/panel.test.mjs
// 覆盖：
//  ① node require 本模块不炸、CY.panel 导出接口存在、无 DOM 环境调用安全降级；
//  ② 浏览器路径冒烟（mini 假 DOM）：open/close、四分区渲染、控件 change→CY.config.set、
//     onChange 回刷、里程碑/金额成对校验拒绝、导入/导出/重置/词库管理入口。
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

// ============ ① node 环境（无 document）============
console.log('[panel] node require 模块…');
let mod = null;
try {
  mod = require('../src/config-panel.js');
  ok(true, 'require 不抛错');
} catch (e) {
  ok(false, 'require 不抛错（异常: ' + e.message + '）');
}
if (mod) {
  ok(mod && typeof mod === 'object', '导出为对象');
  ok(typeof mod.open === 'function', 'open 是函数');
  ok(typeof mod.close === 'function', 'close 是函数');
  ok(typeof mod.isOpen === 'function', 'isOpen 是函数');
}
const CY1 = globalThis.CY;
ok(!!CY1 && typeof CY1 === 'object', 'globalThis.CY 存在');
ok(!!CY1 && CY1.panel === mod, 'CY.panel === module.exports');

console.log('[panel] node（无 document）安全降级…');
ok(mod.isOpen() === false, 'isOpen() 返回 false');
try { ok(mod.open() === false, 'open() 无 DOM 返回 false 不炸'); }
catch (e) { ok(false, 'open() 无 DOM 返回 false 不炸（异常: ' + e.message + '）'); }
try { ok(mod.close() === false, 'close() 未开时返回 false 不炸'); }
catch (e) { ok(false, 'close() 未开时返回 false 不炸（异常: ' + e.message + '）'); }
ok(mod.isOpen() === false, 'close() 后 isOpen() 仍为 false');
try { mod.open('data'); mod.open('奖励'); mod.open('audio'); ok(true, 'open(section) 多次调用不炸'); }
catch (e) { ok(false, 'open(section) 多次调用不炸（异常: ' + e.message + '）'); }

// ============ ② 浏览器路径冒烟（mini 假 DOM）============
console.log('[panel] 浏览器路径冒烟（假 DOM）…');

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.parentNode = null;
    this._attrs = {}; this._cls = new Set(); this._listeners = {};
    this.style = {}; this.value = ''; this.checked = false;
    this._text = ''; this.offsetWidth = 10; this.offsetTop = 100;
    this.className = '';
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children.length = 0; } // 真实 DOM：置文本会清空子节点
  setAttribute(k, v) {
    this._attrs[k] = String(v);
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = String(v);
    if (k === 'value') this.value = String(v); // 真实 DOM：value 内容属性即默认值
  }
  getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  focus() {} select() {}
  fire(type, ev) { (this._listeners[type] || []).slice().forEach(fn => fn(ev || { type })); }
  get classList() {
    const cls = this._cls; const self = this;
    return {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      contains: c => cls.has(c),
      toggle: (c, force) => {
        const has = cls.has(c);
        const next = force === undefined ? !has : !!force;
        next ? cls.add(c) : cls.delete(c);
        return next;
      }
    };
  }
}

// 假配置模块（模拟主线 CY.config 接口，set 对 startWords 钳制 3..8）
const cfg = {
  level: { startWords: 4, growthEvery: 2, maxWords: 14, givenRatio: 0.3, attempts: 5, maxSpan: 9 },
  rewards: { milestones: [1, 3, 14], amounts: [120, 120, 240], completeCoins: 0 },
  props: { hintCost: 80, reviveCost: 150, reviveAttempts: 3 },
  audio: { master: 0.9, sfx: 0.8, bgm: 0.25, muted: false },
  motion: { reduced: false },
  bank: { source: 'builtin' }
};
let changeCb = null; const setCalls = []; let resetCalled = false; let importOpenCalled = false;
function merge(t, s) {
  for (const k in s) {
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) { t[k] = t[k] || {}; merge(t[k], s[k]); }
    else t[k] = s[k];
  }
}
const fakeConfig = {
  defaults: () => JSON.parse(JSON.stringify(cfg)),
  get: () => cfg,
  set(patch) {
    const p = JSON.parse(JSON.stringify(patch));
    if (p.level && typeof p.level.startWords === 'number') {
      p.level.startWords = Math.min(8, Math.max(3, p.level.startWords));
    }
    merge(cfg, p); setCalls.push(p);
    if (changeCb) changeCb(cfg);
  },
  onChange(cb) { changeCb = cb; if (changeCb) changeCb(cfg); return () => { changeCb = null; }; },
  export: () => JSON.stringify(cfg),
  importJson(str) {
    try { const o = JSON.parse(str); merge(cfg, o); if (changeCb) changeCb(cfg); return true; }
    catch (e) { return false; }
  },
  resetAll() { resetCalled = true; }
};

// 假 document
function findById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children) { const r = findById(c, id); if (r) return r; }
  return null;
}
const docFake = {
  head: new FakeEl('head'),
  body: new FakeEl('body'),
  documentElement: new FakeEl('html'),
  activeElement: null,
  createElement: t => new FakeEl(t),
  getElementById(id) {
    return findById(docFake.head, id) || findById(docFake.body, id) || findById(docFake.documentElement, id);
  },
  addEventListener() {},
  execCommand: () => true
};
function getAll(root, pred, out) {
  out = out || [];
  if (!root) return out;
  if (pred(root)) out.push(root);
  for (const c of root.children) getAll(c, pred, out);
  return out;
}
const byId = id => findById(docFake.head, id) || findById(docFake.body, id) || findById(docFake.documentElement, id);
const inputByLabel = label => getAll(docFake.body, el => el.tagName === 'INPUT' && el._attrs['aria-label'] === label)[0] || null;
const btnByText = text => getAll(docFake.body, el => el.tagName === 'BUTTON' && el.textContent === text)[0] || null;
const toastText = () => { const t = byId('cyp-toast'); return t ? t.textContent : ''; };
const tick = ms => new Promise(r => setTimeout(r, ms));

// 挂浏览器环境并重新加载模块（清 require 缓存）
globalThis.window = globalThis;
globalThis.document = docFake;
globalThis.confirm = () => true;
const resolvePath = require.resolve('../src/config-panel.js');
delete require.cache[resolvePath];
const panel = require('../src/config-panel.js');
globalThis.CY.config = fakeConfig;

// open / drawer 构建
ok(panel.open() === true, 'open() 有 DOM 返回 true');
const drawer = byId('drawer');
ok(!!drawer && drawer.id === 'drawer', '#drawer 存在');
ok(drawer.parentNode === docFake.body, '#drawer 挂在 body 末尾');
ok(drawer.getAttribute('data-cyp') === '1', '#drawer 内容已构建');
ok(drawer.classList.contains('cyp-open'), 'open 后 drawer 有 cyp-open');
ok(panel.isOpen() === true, 'isOpen() === true');
for (const id of ['cyp-sec-play', 'cyp-sec-reward', 'cyp-sec-audio', 'cyp-sec-data']) {
  ok(!!byId(id), '分区存在: ' + id);
}
ok(drawer.classList.contains('cyp-nomotion') === false, 'motion.reduced=false 无 nomotion');

// onChange 初次补发 → 值回填
ok(inputByLabel('每关起始词数') && inputByLabel('每关起始词数').value === '4', 'startWords 初值 4 回填');
ok(inputByLabel('预给字比例') && inputByLabel('预给字比例').value === '0.3', 'givenRatio 初值 0.3 回填');
ok(inputByLabel('里程碑节点') && inputByLabel('里程碑节点').value === '1,3,14', 'milestones 回填');
ok(inputByLabel('初始剩余次数') && inputByLabel('初始剩余次数').value === '5', 'attempts=5 整数尾零不被吞');

// 数值 change → set(patch)
const sw = inputByLabel('每关起始词数');
sw.value = '6'; sw.fire('change');
ok(setCalls.length === 1 && JSON.stringify(setCalls[0]) === '{"level":{"startWords":6}}', 'startWords=6 提交 {level:{startWords:6}}');

// 钳制回写：输入 99 → cfg 钳为 8 → 输入框回写 8（防自触发：值不同才写）
sw.value = '99'; sw.fire('change');
ok(cfg.level.startWords === 8, 'set 层钳制 99→8');
ok(sw.value === '8', '钳制后输入框回写为 8');

// 非法数值：拒绝 + toast + 恢复
const before = setCalls.length;
sw.value = 'abc'; sw.fire('change');
ok(setCalls.length === before, '非法数值不提交');
ok(toastText().indexOf('有效数字') >= 0, '非法数值 toast 提示');
ok(sw.value === '8', '非法数值恢复原值');

// 里程碑 + 金额 成对提交
const msIn = inputByLabel('里程碑节点'), amIn = inputByLabel('里程碑奖励金币');
msIn.value = '2,5,20'; msIn.fire('change');
ok(JSON.stringify(setCalls[setCalls.length - 1]) === '{"rewards":{"milestones":[2,5,20],"amounts":[120,120,240]}}', '里程碑改 2,5,20 成对提交');
amIn.value = '50,80,100'; amIn.fire('change');
ok(cfg.rewards.amounts.join(',') === '50,80,100', '金额 50,80,100 提交生效');

// 个数不一致 → 拒绝 + toast + 恢复原值
const before2 = setCalls.length;
amIn.value = '1,2'; amIn.fire('change');
ok(setCalls.length === before2, '个数不一致不提交');
ok(toastText().indexOf('不一致') >= 0, '个数不一致 toast 提示');
ok(amIn.value === '50,80,100', '个数不一致恢复原值');

// 非递增里程碑 → 拒绝
msIn.value = '5,3,1'; msIn.fire('change');
ok(setCalls.length === before2, '非递增里程碑不提交');
ok(toastText().indexOf('递增') >= 0, '非递增 toast 提示');

// 滑杆：input 只改显示，change 提交
const vol = inputByLabel('主音量');
const rval = vol.parentNode.children.find(c => c.className === 'cyp-rval');
vol.value = '0.5'; vol.fire('input');
ok(rval && rval.textContent === '0.50', '滑杆 input 实时显示 0.50');
vol.fire('change');
ok(JSON.stringify(setCalls[setCalls.length - 1]) === '{"audio":{"master":0.5}}', '滑杆 change 提交 {audio:{master:0.5}}');

// 开关
const mute = inputByLabel('静音');
mute.checked = true; mute.fire('change');
ok(cfg.audio.muted === true, '静音开关提交 audio.muted=true');
const red = inputByLabel('减弱动效');
red.checked = true; red.fire('change');
ok(drawer.classList.contains('cyp-nomotion') === true, 'motion.reduced=true 后 drawer 加 nomotion');
red.checked = false; red.fire('change');

// 词库单选（无自定义包：内置一项，radio 提交 bank.source）
const radios = getAll(docFake.body, el => el.tagName === 'INPUT' && el._attrs.name === 'cyp-bank');
ok(radios.length >= 1 && radios[0]._attrs.value === 'builtin', '内置词库 radio 存在');
radios[0].checked = true; radios[0].fire('change');
ok(JSON.stringify(setCalls[setCalls.length - 1]) === '{"bank":{"source":"builtin"}}', '词库切换提交 {bank:{source:...}}');

// 有自定义包（主线 CY.custom.list()）→ 列表出现并可切换
globalThis.CY.custom = { list: () => [{ id: 'p1', name: '我的词包' }, { id: 'p2', name: '科举词库' }] };
panel.open(); // 幂等重开触发 refreshAll → 重建词库列表
const radios2 = getAll(docFake.body, el => el.tagName === 'INPUT' && el._attrs.name === 'cyp-bank');
ok(radios2.length === 3, '内置 + 2 个自定义包 radio 渲染');
const p1 = radios2.find(r => r._attrs.value === 'custom:p1');
ok(!!p1, '自定义包 custom:p1 出现在列表');
p1.checked = true; p1.fire('change');
ok(JSON.stringify(setCalls[setCalls.length - 1]) === '{"bank":{"source":"custom:p1"}}', '切自定义包提交 {bank:{source:"custom:p1"}}');
ok(cfg.bank.source === 'custom:p1', 'bank.source 写入配置');
delete globalThis.CY.custom;

// 外部配置变更（模拟游戏改配置）→ 面板回刷
cfg.level.attempts = 9;
if (changeCb) changeCb(cfg);
ok(inputByLabel('初始剩余次数').value === '9', '外部 onChange 回刷 attempts=9');

// 导出配置（legacy copy 路径）
btnByText('导出配置').fire('click');
await tick(20);
ok(toastText().indexOf('剪贴板') >= 0, '导出配置复制并 toast');

// 导入配置
btnByText('导入配置').fire('click');
const ta = getAll(docFake.body, el => el.tagName === 'TEXTAREA')[0];
ta.value = '{"audio":{"master":0.6}}';
btnByText('应用导入').fire('click');
ok(cfg.audio.master === 0.6, '导入 JSON 应用到配置');
ok(toastText().indexOf('已导入') >= 0, '导入成功 toast');
ta.value = 'not-json'; btnByText('应用导入').fire('click');
ok(toastText().indexOf('无效') >= 0, '非法 JSON 导入失败 toast');

// 清空全部进度：双 confirm 后 resetAll
btnByText('清空全部进度').fire('click');
ok(resetCalled === true, '双确认后调用 CY.config.resetAll()');

// 词库管理：无 CY.game → toast；有 CY.game.openImport → 调用
btnByText('词库管理').fire('click');
ok(toastText().indexOf('暂不可用') >= 0, '无 CY.game 时词库管理 toast 兜底');
globalThis.CY.game = { openImport() { importOpenCalled = true; } };
btnByText('词库管理').fire('click');
ok(importOpenCalled === true, '有 CY.game.openImport 时被调用');

// 滚动锚点
try { panel.open('data'); await tick(120); ok(true, 'open(\'data\') 锚点滚动不炸'); }
catch (e) { ok(false, 'open(\'data\') 锚点滚动不炸（异常: ' + e.message + '）'); }

// close / 遮罩 / Esc
ok(panel.close() === true && panel.isOpen() === false, 'close() 关闭');
ok(drawer.classList.contains('cyp-open') === false, 'close 后移除 cyp-open');
panel.open();
drawer.children[0].fire('click'); // 遮罩
ok(panel.isOpen() === false, '遮罩点击关闭');
panel.open();
docFake.fire ? docFake.fire('keydown', { key: 'Escape' }) : null; // doc 级监听为空实现，仅验证不炸
ok(panel.isOpen() === true, 'Esc 监听注册不炸（真实按键行为由浏览器验证）');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
