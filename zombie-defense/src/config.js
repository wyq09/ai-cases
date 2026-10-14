/* ==== config.js ==== 常量数值表 —— 全部自原版源码提取，勿改（契约 §3） */
(function(){
'use strict';
window.ZD = window.ZD || {};
const CFG = window.ZD.CFG = {};

CFG.SAVE_KEY = 'zd.save.v1';
CFG.CFG_KEY  = 'zd.cfg.v1';

// 僵尸类型：hp/波增、spd/波增、宽高、墙伤、金币、钻、xp
CFG.ZTYPES = {
  normal:{ hp:18,  hpw:6,   spd:0.35, spw:0.012, w:36, h:44, dmg:8,  coin:2,  dia:0,  xp:2 },
  fast:  { hp:10,  hpw:4,   spd:0.85, spw:0.02,  w:30, h:36, dmg:5,  coin:3,  dia:0,  xp:3 },
  tank:  { hp:60,  hpw:16,  spd:0.22, spw:0.008, w:48, h:56, dmg:16, coin:6,  dia:0,  xp:5 },
  boss:  { hp:400, hpw:90,  spd:0.16, spw:0,     w:84, h:92, dmg:30, coin:50, dia:20, xp:30 },
};
CFG.WAVE_BASE = 6, CFG.WAVE_PER = 1.8, CFG.WAVE_GAP = 22, CFG.WAVE_GAP_BOSS = 34;
CFG.WAVE_REST = 100, CFG.WAVE_FIRST = 90;

// 局内技能池
CFG.MAX_DISTINCT = 4;
CFG.SKILL_POOL = [
  { id:'dmg',    name:'火力强化', desc:'子弹伤害 +35%',              max:8 },
  { id:'rate',   name:'极速扳机', desc:'射击速度 +25%',              max:8 },
  { id:'multi',  name:'多弹道',   desc:'同时多发射一发子弹',          max:4 },
  { id:'pierce', name:'穿甲弹头', desc:'子弹可穿透 +1 个目标',        max:4 },
  { id:'boom',   name:'爆破弹头', desc:'命中后小范围爆炸',            max:5 },
  { id:'ice',    name:'低温弹',   desc:'命中减速 40%，持续 2 秒',     max:3 },
  { id:'drone',  name:'无人战机', desc:'召唤一台自动副炮',            max:4 },
  { id:'crit',   name:'致命瞄准', desc:'暴击率 +12%',                max:6 },
  { id:'wall',   name:'防线加固', desc:'防线回 30% 并提升上限 15%',   max:5 },
  { id:'laser',  name:'制导激光', desc:'持续照射最近敌人的高能光束',   max:5 },
  { id:'burn',   name:'燃烧弹',   desc:'命中点燃，持续灼烧伤害',      max:4 },
  { id:'chain',  name:'雷电链',   desc:'闪电在敌人之间跳跃',          max:4 },
  { id:'barrage',name:'弹幕风暴', desc:'周期性向全屏发射弹幕',        max:3 },
  { id:'exe',    name:'处决令',   desc:'击中时有概率直接秒杀小怪',    max:4 },
];

// 宝石（局外）：base×品质系数 叠加
CFG.GEM_TYPES = [
  { id:'critR', name:'致命宝石', base:0.02, fmt:v=>'+'+Math.round(v*100)+'% 暴击率' },
  { id:'critD', name:'狂暴宝石', base:0.10, fmt:v=>'+'+Math.round(v*100)+'% 暴击伤害' },
  { id:'atk',   name:'力量宝石', base:0.04, fmt:v=>'+'+Math.round(v*100)+'% 攻击力' },
  { id:'rate',  name:'迅捷宝石', base:0.03, fmt:v=>'+'+Math.round(v*100)+'% 射速' },
  { id:'coin',  name:'贪财宝石', base:0.05, fmt:v=>'+'+Math.round(v*100)+'% 金币收益' },
  { id:'exe',   name:'处决宝石', base:0.01, fmt:v=>'+'+(v*100).toFixed(1)+'% 处决概率' },
];
CFG.GEM_QUALITY = [ {n:'传说', c:'#8ea2ff', m:1}, {n:'绝世', c:'#ffb347', m:2}, {n:'至尊', c:'#ff5ce1', m:3.5} ];

// 金币永久升级（上限 20 级）
CFG.UPGRADES = [
  { id:'atk',  name:'火力校准',   desc:lv=>'子弹伤害 +'+lv*10+'% → +'+(lv+1)*10+'%',  base:200 },
  { id:'rate', name:'供弹系统',   desc:lv=>'射速 +'+lv*6+'% → +'+(lv+1)*6+'%',        base:260 },
  { id:'hp',   name:'防线工事',   desc:lv=>'防线血量 +'+lv*10+'% → +'+(lv+1)*10+'%',  base:300 },
  { id:'coin', name:'战利品回收', desc:lv=>'金币收益 +'+lv*8+'% → +'+(lv+1)*8+'%',    base:150 },
];
CFG.UP_MAX_LV = 20, CFG.UP_COST_K = 1.55;
CFG.upCost = (u,lv)=> Math.round(u.base * Math.pow(CFG.UP_COST_K, lv));

// 宝箱 / 充值 / VIP
CFG.CHEST = { single:{cost:100, n:1, q2:0.05, q1:0.30}, triple:{cost:300, n:3, q2:0.15, q1:0.60} };
CFG.PAY_TIERS = [ {p:'¥6', d:60, id:'t6'}, {p:'¥30', d:300, id:'t30'}, {p:'¥98', d:980, id:'t98'} ];
CFG.VIP_STEP = 60, CFG.VIP_COIN = 0.08;

// 布局（运行时按视口微调，这些是相对比例）
CFG.LAYOUT = { fieldMaxW: 560, wallFromBottom: 0.1375, wallMin: 76, wallMax: 120 };
})();
