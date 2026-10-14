/* ============================================================
 * 僵尸防线 · 孤哨重制 —— ZD.audio 音频模块（子代理 B）
 * 全 WebAudio 程序合成，零外部文件。
 * 只依赖 window.ZD 与浏览器 API，不反向调用 game/ui。
 * 音色定位：低沉军事/末日，避开 >4kHz 刺耳区；短音效 <0.6s。
 * ============================================================ */
(function () {
'use strict';
var ZD = window.ZD = window.ZD || {};

/* ---------- 全局状态 ---------- */
var ctx = null;            // AudioContext（懒创建）
var master = null;         // 总增益出口，≤0.6
var noiseBuf = null;       // 预生成白噪声 buffer，全程复用
var muted = false;
var bgmMode = null;        // 期望模式 'menu'|'battle'|null
var bgmRun = null;         // 当前 BGM 运行图
var MASTER_MAX = 0.6;
var BGM_LVL = { menu: 0.14, battle: 0.18 };   // BGM 相对音量（很低）

/* ---------- 基础工具 ---------- */
// 2 秒白噪声 buffer：所有噪声类音效共用
function makeNoise(c) {
  var len = Math.floor(c.sampleRate * 2);
  var buf = c.createBuffer(1, len, c.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function noiseSrc(loop) {
  var s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = !!loop;
  return s;
}
// 指数包络：t0 起 atk 秒冲到 peak，再衰减到 0（dur 为总长）
function env(g, t, atk, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
// 指数滑频
function glide(o, f1, t1) { o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t1); }
function osc(type, f0, t) {
  var o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  return o;
}
function bp(f, q) {
  var b = ctx.createBiquadFilter();
  b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q || 1;
  return b;
}
function lp(f) {
  var b = ctx.createBiquadFilter();
  b.type = 'lowpass'; b.frequency.value = f; b.Q.value = 0.8;
  return b;
}
// 每个音效独立的输出 gain（挂到 master，走完后自动断开清理）
function out(lvl, dur) {
  var g = ctx.createGain();
  g.gain.value = lvl;
  g.connect(master);
  setTimeout(function () { try { g.disconnect(); } catch (e) {} }, (dur + 0.4) * 1000);
  return g;
}

/* ============================================================
 * 音效库：每个音效独立函数、独立 gain，短促不刺耳
 * ============================================================ */
var SFX = {

  /* 短促轻量枪声：带通噪声爆破 + 低频 punch 下坠 */
  shoot: function (t) {
    var g = out(0.5, 0.18);
    var n = noiseSrc(), f = bp(1800, 0.9), ng = ctx.createGain();
    env(ng, t, 0.004, 0.9, 0.09);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.12);
    var o = osc('sine', 160, t); glide(o, 60, t + 0.08);
    var og = ctx.createGain(); env(og, t, 0.003, 0.8, 0.1);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.12);
  },

  /* 暴击：更亮更脆 + 金属泛音双音 */
  shootCrit: function (t) {
    var g = out(0.48, 0.24);
    var n = noiseSrc(), f = bp(3200, 1.4), ng = ctx.createGain();
    env(ng, t, 0.003, 0.7, 0.07);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.1);
    [2400, 3600].forEach(function (fr, i) {         // 金属泛音
      var o = osc('triangle', fr, t), og = ctx.createGain();
      env(og, t, 0.002, 0.35 - i * 0.12, 0.08);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.1);
    });
    var o = osc('sine', 150, t); glide(o, 50, t + 0.09);
    var og = ctx.createGain(); env(og, t, 0.003, 0.85, 0.11);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.13);
  },

  /* 命中僵尸：肉感短噗（低通噪声 + 快速下坠正弦） */
  hitZ: function (t) {
    var g = out(0.5, 0.15);
    var n = noiseSrc(), f = lp(650), ng = ctx.createGain();
    env(ng, t, 0.005, 0.85, 0.08);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.1);
    var o = osc('sine', 95, t); glide(o, 50, t + 0.09);
    var og = ctx.createGain(); env(og, t, 0.004, 0.9, 0.1);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.12);
  },

  /* 僵尸死亡：低哑呻吟下滑 + 湿润噪声 */
  dieZ: function (t) {
    var g = out(0.42, 0.52);
    var o = osc('sawtooth', 170, t); glide(o, 68, t + 0.4);
    var f = lp(550), og = ctx.createGain();
    env(og, t, 0.03, 0.55, 0.45);
    o.connect(f); f.connect(og); og.connect(g);
    o.start(t); o.stop(t + 0.48);
    var n = noiseSrc(), nf = lp(900), ng = ctx.createGain();  // 湿润噪声
    env(ng, t + 0.05, 0.02, 0.35, 0.25);
    n.connect(nf); nf.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.35);
  },

  /* Boss 死亡：更深沉长下滑 + 低频轰 */
  dieBoss: function (t) {
    var g = out(0.5, 0.58);
    var o = osc('sawtooth', 110, t); glide(o, 42, t + 0.5);
    var f = lp(380), og = ctx.createGain();
    env(og, t, 0.04, 0.6, 0.52);
    o.connect(f); f.connect(og); og.connect(g);
    o.start(t); o.stop(t + 0.55);
    var s = osc('sine', 55, t); glide(s, 28, t + 0.45);        // 低频轰
    var sg = ctx.createGain(); env(sg, t, 0.02, 0.8, 0.5);
    s.connect(sg); sg.connect(g); s.start(t); s.stop(t + 0.52);
    var n = noiseSrc(), nf = lp(220), ng = ctx.createGain();
    env(ng, t, 0.03, 0.4, 0.45);
    n.connect(nf); nf.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.5);
  },

  /* 爆炸：低频轰 + 噪声衰减（低通快速下扫） */
  explode: function (t) {
    var g = out(0.6, 0.56);
    var n = noiseSrc(), f = lp(1400);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    var ng = ctx.createGain(); env(ng, t, 0.006, 0.95, 0.5);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.55);
    var s = osc('sine', 75, t); glide(s, 24, t + 0.4);
    var sg = ctx.createGain(); env(sg, t, 0.005, 0.85, 0.42);
    s.connect(sg); sg.connect(g); s.start(t); s.stop(t + 0.45);
  },

  /* 电流：方波随机抖频 + 高频噼啪噪声 */
  zap: function (t) {
    var g = out(0.28, 0.26);
    var o = osc('square', 900, t), og = ctx.createGain();
    for (var i = 0, tt = t; i < 12; i++) {          // 抖频：随机步进
      tt += 0.016;
      o.frequency.setValueAtTime(600 + Math.random() * 1100, tt);
    }
    env(og, t, 0.004, 0.6, 0.2);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.22);
    for (var j = 0; j < 3; j++) {                   // 噼啪火花
      var n = noiseSrc(), f = bp(2600, 2), ng = ctx.createGain();
      var tt2 = t + 0.02 + j * 0.07;
      env(ng, tt2, 0.002, 0.5, 0.04);
      n.connect(f); f.connect(ng); ng.connect(g);
      n.start(tt2); n.stop(tt2 + 0.05);
    }
  },

  /* 弹幕：快速连发扫射（多组噪声+thump 密集排布） */
  barrage: function (t) {
    var g = out(0.4, 0.44);
    for (var i = 0; i < 7; i++) {
      var tt = t + i * 0.055;
      var n = noiseSrc(), f = bp(1200 + Math.random() * 900, 1), ng = ctx.createGain();
      env(ng, tt, 0.003, 0.6, 0.05);
      n.connect(f); f.connect(ng); ng.connect(g);
      n.start(tt); n.stop(tt + 0.06);
      var o = osc('sine', 140 + Math.random() * 30, tt); glide(o, 60, tt + 0.04);
      var og = ctx.createGain(); env(og, tt, 0.002, 0.55, 0.05);
      o.connect(og); og.connect(g); o.start(tt); o.stop(tt + 0.06);
    }
  },

  /* 无人机：轻快电子点射（短上滑三角波 blip） */
  drone: function (t) {
    var g = out(0.28, 0.17);
    var o = osc('triangle', 780, t); glide(o, 980, t + 0.06);
    var og = ctx.createGain(); env(og, t, 0.004, 0.8, 0.09);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.11);
    var s = osc('sine', 1560, t + 0.03);
    var sg = ctx.createGain(); env(sg, t + 0.03, 0.003, 0.25, 0.07);
    s.connect(sg); sg.connect(g); s.start(t + 0.03); s.stop(t + 0.12);
  },

  /* 升级：上行三音号角感（锯齿+低通） */
  lvl: function (t) {
    var g = out(0.35, 0.56);
    [196, 262, 392].forEach(function (fr, i) {
      var tt = t + i * 0.17, dur = i === 2 ? 0.36 : 0.15;
      var o = osc('sawtooth', fr, tt);
      var f = lp(900), og = ctx.createGain();
      env(og, tt, 0.02, i === 2 ? 0.6 : 0.5, dur);
      o.connect(f); f.connect(og); og.connect(g);
      o.start(tt); o.stop(tt + dur + 0.03);
    });
  },

  /* 金币入账：清脆短叮 + 非谐泛音 + 随机音高 */
  coinIn: function (t) {
    var g = out(0.25, 0.17);
    var base = 1500 + Math.random() * 500;
    [1, 2.76].forEach(function (m, i) {             // 钟形非谐分音
      var o = osc('sine', base * m, t), og = ctx.createGain();
      env(og, t, 0.002, i ? 0.3 : 0.8, i ? 0.1 : 0.14);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.16);
    });
  },

  /* 墙体受击：沉闷重击（超低 thump + 闷噪声） */
  wallHit: function (t) {
    var g = out(0.6, 0.34);
    var o = osc('sine', 58, t); glide(o, 34, t + 0.22);
    var og = ctx.createGain(); env(og, t, 0.005, 0.95, 0.26);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.28);
    var n = noiseSrc(), f = lp(280), ng = ctx.createGain();
    env(ng, t, 0.004, 0.5, 0.18);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.2);
  },

  /* Boss 警报：低鸣两声（锯齿+低通短促下坠） */
  bossWarn: function (t) {
    var g = out(0.4, 0.58);
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.3;
      var o = osc('sawtooth', 138, tt); glide(o, 126, tt + 0.24);
      var f = lp(480), og = ctx.createGain();
      env(og, tt, 0.02, 0.6, 0.26);
      o.connect(f); f.connect(og); og.connect(g);
      o.start(tt); o.stop(tt + 0.28);
    }
  },

  /* 开波号角：低沉汽笛（双失谐锯齿 + 慢攻 + 尾音下沉） */
  waveHorn: function (t) {
    var g = out(0.4, 0.56);
    var o1 = osc('sawtooth', 82, t), o2 = osc('sawtooth', 82.8, t);
    glide(o1, 76, t + 0.5); glide(o2, 76.7, t + 0.5);
    var f = lp(520), og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.55, t + 0.09);
    og.gain.setValueAtTime(0.55, t + 0.34);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
    o1.connect(f); o2.connect(f); f.connect(og); og.connect(g);
    o1.start(t); o2.start(t); o1.stop(t + 0.55); o2.stop(t + 0.55);
  },

  /* UI 点击：干短哒（方波 blip + 微噪声） */
  click: function (t) {
    var g = out(0.3, 0.07);
    var o = osc('square', 320, t), og = ctx.createGain();
    env(og, t, 0.002, 0.5, 0.035);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.04);
    var n = noiseSrc(), f = bp(2000, 2), ng = ctx.createGain();
    env(ng, t, 0.001, 0.3, 0.02);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.03);
  },

  /* 轻点击：更轻的正弦短音 */
  clickSoft: function (t) {
    var g = out(0.18, 0.08);
    var o = osc('sine', 420, t), og = ctx.createGain();
    env(og, t, 0.003, 0.5, 0.045);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.05);
  },

  /* 购买确认：上行双音 */
  buy: function (t) {
    var g = out(0.28, 0.28);
    [[523, 0, 0.1], [784, 0.11, 0.15]].forEach(function (p) {
      var o = osc('sine', p[0], t + p[1]);
      var og = ctx.createGain(); env(og, t + p[1], 0.01, 0.7, p[2]);
      o.connect(og); og.connect(g); o.start(t + p[1]); o.stop(t + p[1] + p[2] + 0.03);
      var s = osc('triangle', p[0], t + p[1]);                 // 厚度
      var sg = ctx.createGain(); env(sg, t + p[1], 0.01, 0.25, p[2]);
      s.connect(sg); sg.connect(g); s.start(t + p[1]); s.stop(t + p[1] + p[2] + 0.03);
    });
  },

  /* 宝箱开启：神秘上滑 */
  gachaOpen: function (t) {
    var g = out(0.28, 0.44);
    var o = osc('sine', 220, t); glide(o, 880, t + 0.34);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.6, t + 0.28);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.42);
    var s = osc('triangle', 660, t); glide(s, 1760, t + 0.3);  // 微光泛音
    var sg = ctx.createGain(); env(sg, t, 0.05, 0.2, 0.32);
    s.connect(sg); sg.connect(g); s.start(t); s.stop(t + 0.34);
  },

  /* 抽中稀有：华丽上行琶音 + 闪亮尾光 */
  gachaRare: function (t) {
    var g = out(0.26, 0.54);
    [523, 659, 784, 1046, 1318].forEach(function (fr, i) {
      var tt = t + i * 0.075;
      var o = osc('triangle', fr, tt), og = ctx.createGain();
      env(og, tt, 0.005, 0.55, 0.2);
      o.connect(og); og.connect(g); o.start(tt); o.stop(tt + 0.22);
      var s = osc('sine', fr * 2, tt), sg = ctx.createGain();   // 亮八度
      env(sg, tt, 0.004, 0.18, 0.12);
      s.connect(sg); sg.connect(g); s.start(tt); s.stop(tt + 0.14);
    });
    var n = noiseSrc(), f = bp(3600, 1.2), ng = ctx.createGain();  // 短闪噪
    env(ng, t + 0.36, 0.01, 0.12, 0.12);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t + 0.36); n.stop(t + 0.5);
  },

  /* 结算金币：收银叮 + 纸张沙沙 */
  cash: function (t) {
    var g = out(0.28, 0.36);
    [1318, 2637].forEach(function (fr, i) {
      var o = osc('sine', fr, t), og = ctx.createGain();
      env(og, t, 0.003, i ? 0.25 : 0.6, 0.15);
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.17);
    });
    var n = noiseSrc(), f = bp(2800, 0.8), ng = ctx.createGain();  // 纸沙沙
    env(ng, t + 0.06, 0.02, 0.35, 0.22);
    n.connect(f); f.connect(ng); ng.connect(g);
    n.start(t + 0.06); n.stop(t + 0.32);
  },

  /* 失败：下行哀号（锯齿长滑 + 颤音） */
  lose: function (t) {
    var g = out(0.35, 0.58);
    var o = osc('sawtooth', 330, t); glide(o, 110, t + 0.52);
    var f = lp(800), og = ctx.createGain();
    env(og, t, 0.04, 0.5, 0.54);
    var lfo = osc('sine', 6, t), lg = ctx.createGain();          // 颤音
    lg.gain.value = 12;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(f); f.connect(og); og.connect(g);
    o.start(t); lfo.start(t); o.stop(t + 0.56); lfo.stop(t + 0.56);
  }
};
SFX.gacha = SFX.gachaOpen;   // 契约别名：gacha ≙ gachaOpen

/* ============================================================
 * BGM：暗黑环境垫乐（菜单/战斗），无缝循环
 * 层：低频 drone + 心跳低音脉冲 + 风噪底 + 偶发远雷
 * 战斗版：脉冲更低更密 + 轻微军鼓点
 * 调度用 lookahead 定时器，切模式 0.5s 交叉淡入淡出
 * ============================================================ */
// 心跳“咚-咚”低音脉冲
function heartPulse(t, bus, lvl) {
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(lvl, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  g.connect(bus);
  var o = osc('sine', 48, t); glide(o, 38, t + 0.24);
  o.connect(g); o.start(t); o.stop(t + 0.32);
}
// 军鼓点：带通噪声短击 + 低频 tick
function snareTick(t, bus) {
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  g.connect(bus);
  var n = noiseSrc(), f = bp(1900, 1);
  n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.1);
}
// 远雷：低通噪声长涌 + 下扫
function thunder(t, bus) {
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
  g.connect(bus);
  var n = noiseSrc(), f = lp(300);
  f.frequency.exponentialRampToValueAtTime(80, t + 2.2);
  n.connect(f); f.connect(g); n.start(t); n.stop(t + 2.4);
}
// lookahead 调度：每 200ms 排入未来 0.45s 内的事件
function bgmTick(st) {
  if (!ctx || !bgmRun || bgmRun.st !== st) return;
  var ahead = ctx.currentTime + 0.45;
  var battle = st.mode === 'battle';
  while (st.nextPulse < ahead) {                       // 心跳脉冲
    heartPulse(st.nextPulse, st.bus, battle ? 0.5 : 0.65);
    heartPulse(st.nextPulse + 0.19, st.bus, (battle ? 0.5 : 0.65) * 0.6);
    st.nextPulse += battle ? 1.15 : 1.75;              // 战斗更密
  }
  if (battle) {
    while (st.nextSnare < ahead) { snareTick(st.nextSnare, st.bus); st.nextSnare += 0.55 + (Math.random() < 0.35 ? 0.27 : 0); }
  } else st.nextSnare = ahead + 2;
  while (st.nextThunder < ahead) {                     // 偶发远雷
    thunder(st.nextThunder, st.bus);
    st.nextThunder += 9 + Math.random() * 14;
  }
}
// 搭建一张 BGM 图（连续层 ⇒ 无缝循环，无接缝点）
function buildBgm(mode, t0) {
  var bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, t0);
  bus.gain.linearRampToValueAtTime(BGM_LVL[mode] || 0.14, t0 + 0.5);  // 0.5s 淡入
  bus.connect(master);
  var stopAll = [];
  // 低频 drone：三失谐锯齿 + 低通慢呼吸
  var lpF = ctx.createBiquadFilter();
  lpF.type = 'lowpass'; lpF.frequency.value = 180; lpF.Q.value = 2;
  var dg = ctx.createGain(); dg.gain.value = 0.5;
  lpF.connect(dg); dg.connect(bus);
  [55, 55.4, 82.5].forEach(function (fr) {
    var o = osc('sawtooth', fr, t0);
    o.connect(lpF); o.start(t0); stopAll.push(o);
  });
  var lfo = osc('sine', 0.07, t0), lg = ctx.createGain(); lg.gain.value = 60;
  lfo.connect(lg); lg.connect(lpF.frequency); lfo.start(t0); stopAll.push(lfo);
  // 风噪底：循环噪声 + 低通 + 增益慢摆
  var wn = noiseSrc(true);
  var wf = lp(420), wg = ctx.createGain(); wg.gain.value = 0.1;
  wn.connect(wf); wf.connect(wg); wg.connect(bus); wn.start(t0); stopAll.push(wn);
  var wlfo = osc('sine', 0.11, t0), wlg = ctx.createGain(); wlg.gain.value = 0.045;
  wlfo.connect(wlg); wlg.connect(wg.gain); wlfo.start(t0); stopAll.push(wlfo);
  // 事件调度器
  var st = {
    mode: mode, bus: bus,
    nextPulse: t0 + 0.6,
    nextSnare: t0 + 2.5,
    nextThunder: t0 + 5 + Math.random() * 8
  };
  var timer = setInterval(function () { bgmTick(st); }, 200);
  return { bus: bus, stopAll: stopAll, timer: timer, st: st };
}
// 拆除一张 BGM 图（0.5s 淡出后停振清节点）
function killBgm(r) {
  if (!ctx || !r) return;
  var t = ctx.currentTime;
  try {
    r.bus.gain.cancelScheduledValues(t);
    r.bus.gain.setValueAtTime(r.bus.gain.value || 0.0001, t);
    r.bus.gain.linearRampToValueAtTime(0.0001, t + 0.5);
  } catch (e) {}
  clearInterval(r.timer);
  setTimeout(function () {
    r.stopAll.forEach(function (n) { try { n.stop(); } catch (e) {} });
    try { r.bus.disconnect(); } catch (e) {}
  }, 700);
}

/* ============================================================
 * 对外接口
 * ============================================================ */
// 首次用户手势调用：懒创建 ctx + master，幂等；之后负责 resume
function unlock() {
  if (!ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_MAX;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);
    if (bgmMode) bgmRun = buildBgm(bgmMode, ctx.currentTime);  // 恢复挂起的 BGM 期望
  }
  if (ctx.state === 'suspended') {
    try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
}
// 触发音效：未知名字静默忽略，绝不抛错
function play(name) {
  if (!ctx || !noiseBuf || !SFX[name]) return;
  try { SFX[name](ctx.currentTime); } catch (e) {}
}
// BGM 模式切换：'menu' | 'battle' | null（停止）；0.5s 交叉淡化
function bgm(mode) {
  mode = (mode === 'battle' || mode === 'menu') ? mode : null;
  if (mode === bgmMode) return;
  bgmMode = mode;
  if (!ctx) return;                       // 未解锁：只记期望，unlock 后自动起
  var old = bgmRun;
  bgmRun = null;
  if (old) killBgm(old);
  if (mode) bgmRun = buildBgm(mode, ctx.currentTime);
}
// 静音：master 归零，BGM 与音效全静（静音只动 gain，不销毁图）
function setMuted(b) {
  muted = !!b;
  if (master) {
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value || 0.0001, t);
      master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_MAX, t + 0.04);
    } catch (e) { master.gain.value = muted ? 0 : MASTER_MAX; }
  }
}
function toggle() { setMuted(!muted); return muted; }

ZD.audio = {
  unlock: unlock,
  play: play,
  bgm: bgm,
  setMuted: setMuted,
  toggle: toggle,
  get muted() { return muted; }
};

/* 页面可见性：隐藏挂起 ctx，回来 resume（模块自挂，仅浏览器环境） */
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    try {
      var p = null;
      if (document.hidden) { if (ctx.state === 'running') p = ctx.suspend(); }
      else if (ctx.state === 'suspended') p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  });
}
})();
