'use strict';

/**
 * 分年级口算出题引擎（对齐人教版教学进程）
 *
 * - 确定性：genQuestion(grade, seedStr) 同入参必同题，服务端可离线复算答案，
 *   客户端永远拿不到答案，断线重连题目不丢，同房间不同玩家题目不同。
 * - 答案恒为非负整数：除法先定商与除数再反推被除数；混合运算按模板构造，
 *   结果下限 10，适配儿童纯数字键盘（无需负号/小数点）。
 *
 * 年级进度（人教版）：
 *   一年级  10/20 以内加减（含进位退位）、100 以内不进位口算、整十数加减
 *   二年级  100 以内进位加/退位减、表内乘法、表内除法（口诀求商）、百内连加减
 *   三年级  万以内加减、多位数×一位数、两位数×两位数、除数一位数除法、两步混合
 *   四年级  三位数×两位数、除数两位数除法、大数加减、含括号四则混合
 */

// 各年级题量：按"约 3 分钟赛程"配速（单题均耗随年级递增），进度条按各自 total 折算百分比
const COUNTS = { 1: 15, 2: 12, 3: 10, 4: 8 };

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ri = (r, min, max) => min + Math.floor(r() * (max - min + 1));

// 加权随机挑一种题型生成
function pick(r, list) {
  let total = 0;
  for (const [w] of list) total += w;
  let x = r() * total;
  for (const [w, fn] of list) {
    x -= w;
    if (x < 0) return fn();
  }
  return list[list.length - 1][1]();
}

function genGrade1(r) {
  return pick(r, [
    // 10 以内加法
    [3, () => {
      const a = ri(r, 1, 9), b = ri(r, 1, 10 - a);
      return { text: `${a} + ${b}`, answer: a + b, kind: 'g1.add10' };
    }],
    // 10 以内减法
    [3, () => {
      const a = ri(r, 2, 10), b = ri(r, 1, a - 1);
      return { text: `${a} - ${b}`, answer: a - b, kind: 'g1.sub10' };
    }],
    // 20 以内进位加法
    [4, () => {
      const a = ri(r, 2, 9), b = ri(r, 11 - a, 9);
      return { text: `${a} + ${b}`, answer: a + b, kind: 'g1.add20c' };
    }],
    // 20 以内退位减法
    [4, () => {
      const a = ri(r, 11, 18), b = ri(r, a - 9, 9);
      return { text: `${a} - ${b}`, answer: a - b, kind: 'g1.sub20b' };
    }],
    // 100 以内不进位加法（下册口算）
    [2, () => {
      const a = ri(r, 11, 79);
      const bt = ri(r, 1, 9 - Math.floor(a / 10));
      const bo = ri(r, 0, 9 - (a % 10));
      const b = bt * 10 + bo;
      return { text: `${a} + ${b}`, answer: a + b, kind: 'g1.add100' };
    }],
    // 整十数加减
    [2, () => r() < 0.5
      ? (() => {
        const a = ri(r, 1, 5) * 10, b = ri(r, 1, 10 - a / 10) * 10;
        return { text: `${a} + ${b}`, answer: a + b, kind: 'g1.tens' };
      })()
      : (() => {
        const a = ri(r, 3, 10) * 10, b = ri(r, 1, a / 10 - 1) * 10;
        return { text: `${a} - ${b}`, answer: a - b, kind: 'g1.tens' };
      })()],
  ]);
}

function genGrade2(r) {
  return pick(r, [
    // 100 以内进位加法
    [3, () => {
      const a = ri(r, 11, 79);
      const bt = ri(r, 1, 8 - Math.floor(a / 10));
      const bo = ri(r, 10 - (a % 10), 9);
      const b = bt * 10 + bo;
      return { text: `${a} + ${b}`, answer: a + b, kind: 'g2.add100c' };
    }],
    // 100 以内退位减法
    [3, () => {
      const a = ri(r, 21, 99);
      const bt = ri(r, 1, Math.floor(a / 10) - 1);
      const bo = ri(r, 10 - (a % 10), 9);
      const b = bt * 10 + bo;
      return { text: `${a} - ${b}`, answer: a - b, kind: 'g2.sub100b' };
    }],
    // 表内乘法（九九口诀）
    [4, () => {
      const a = ri(r, 2, 9), b = ri(r, 2, 9);
      return { text: `${a} × ${b}`, answer: a * b, kind: 'g2.mul' };
    }],
    // 表内除法（口诀求商，整除）
    [4, () => {
      const b = ri(r, 2, 9), q = ri(r, 2, 9);
      return { text: `${b * q} ÷ ${b}`, answer: q, kind: 'g2.div' };
    }],
    // 百内两步连加减
    [2, () => {
      const a = ri(r, 11, 39), b = ri(r, 11, 40), c = ri(r, 11, a + b - 6);
      return { text: `${a} + ${b} - ${c}`, answer: a + b - c, kind: 'g2.mix' };
    }],
  ]);
}

function genGrade3(r) {
  return pick(r, [
    // 万以内加法
    [3, () => {
      const a = ri(r, 1024, 4999), b = ri(r, 1024, 9999 - a);
      return { text: `${a} + ${b}`, answer: a + b, kind: 'g3.add4' };
    }],
    // 万以内减法
    [3, () => {
      const a = ri(r, 2048, 9999), b = ri(r, 1024, a - 256);
      return { text: `${a} - ${b}`, answer: a - b, kind: 'g3.sub4' };
    }],
    // 多位数 × 一位数
    [3, () => {
      const b = ri(r, 3, 9), a = ri(r, 102, Math.min(999, Math.floor(9999 / b)));
      return { text: `${a} × ${b}`, answer: a * b, kind: 'g3.mul31' };
    }],
    // 两位数 × 两位数（下册）
    [3, () => {
      const a = ri(r, 11, 99), b = ri(r, 11, 99);
      return { text: `${a} × ${b}`, answer: a * b, kind: 'g3.mul22' };
    }],
    // 除数一位数、商两位数的整除除法
    [3, () => {
      const b = ri(r, 2, 9), q = ri(r, Math.ceil(100 / b), 99);
      return { text: `${b * q} ÷ ${b}`, answer: q, kind: 'g3.div1' };
    }],
    // 两步混合（先乘后加）
    [2, () => {
      const a = ri(r, 2, 9), b = ri(r, 2, 9), c = ri(r, 11, 99);
      return r() < 0.5
        ? { text: `${a} × ${b} + ${c}`, answer: a * b + c, kind: 'g3.mix2' }
        : { text: `${c} + ${a} × ${b}`, answer: c + a * b, kind: 'g3.mix2' };
    }],
  ]);
}

function genGrade4(r) {
  return pick(r, [
    // 三位数 × 两位数
    [3, () => {
      const b = ri(r, 11, 99), a = ri(r, 100, 999);
      return { text: `${a} × ${b}`, answer: a * b, kind: 'g4.mul32' };
    }],
    // 除数两位数、商两位数的整除除法
    [3, () => {
      let b = 0, q = 0;
      for (let i = 0; i < 24; i++) {
        b = ri(r, 11, 99); q = ri(r, 11, 99);
        if (b * q >= 1000) break;
      }
      if (b * q < 1000) { b = 50; q = 40; }
      return { text: `${b * q} ÷ ${b}`, answer: q, kind: 'g4.div2' };
    }],
    // 大数加法
    [2, () => {
      const a = ri(r, 10000, 499999), b = ri(r, 10000, 999999 - a);
      return { text: `${a} + ${b}`, answer: a + b, kind: 'g4.bigadd' };
    }],
    // 大数减法
    [2, () => {
      const a = ri(r, 200000, 999999), b = ri(r, 10000, a - 10000);
      return { text: `${a} - ${b}`, answer: a - b, kind: 'g4.bigsub' };
    }],
    // 含括号两步混合
    [3, () => {
      if (r() < 0.5) {
        const a = ri(r, 11, 49), b = ri(r, 11, 49), c = ri(r, 2, 9);
        const v = (a + b) * c;
        const d = ri(r, 11, Math.max(11, v - 10));
        return { text: `(${a} + ${b}) × ${c} - ${d}`, answer: v - d, kind: 'g4.mix' };
      }
      const a = ri(r, 30, 99), b = ri(r, 11, a - 10), c = ri(r, 2, 9), d = ri(r, 11, 99);
      return { text: `(${a} - ${b}) × ${c} + ${d}`, answer: (a - b) * c + d, kind: 'g4.mix' };
    }],
    // 无括号三步混合
    [2, () => {
      const a = ri(r, 11, 99), b = ri(r, 2, 9), c = ri(r, 2, 9);
      const d = ri(r, 11, a + b * c - 10);
      return { text: `${a} + ${b} × ${c} - ${d}`, answer: a + b * c - d, kind: 'g4.chain' };
    }],
  ]);
}

const GEN = { 1: genGrade1, 2: genGrade2, 3: genGrade3, 4: genGrade4 };

function genQuestion(grade, seedStr) {
  const g = GEN[grade] ? grade : 1;
  const r = mulberry32(fnv1a(String(seedStr)));
  return GEN[g](r);
}

module.exports = { genQuestion, COUNTS, fnv1a, mulberry32 };
