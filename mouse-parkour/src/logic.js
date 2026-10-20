/* ============================================================================
 * logic.js — 鼠族跑酷 · MOUSE RUSH 纯逻辑模块
 * ----------------------------------------------------------------------------
 * 契约：见 src/contract.md §1.2 / §1.3 / §1.4 / §1.5 / §1.6 / §1.7 / §2.1
 * 铁律：纯逻辑，零 DOM（不触碰任何浏览器渲染 / 本地存储 / 动画帧接口）；
 *       顶层不声明 MP（只用 root.MP = root.MP || {}）；加载期不调用其它模块；
 *       注释中文；不含 script 结束标签字面量（避免内联进 HTML 时被提前截断）。
 *
 * 【stepPhysics 使用说明（给 game.js）】
 *   · 输入来源优先级：p.input > p.keys > p.cmd > world.input
 *     持续量：left / right（或 axis）、up、down、jump、dash、slide
 *     边沿量：jumpPressed / dashPressed / slidePressed
 *              （亦认 jumpDown / dashDown / slideDown / pressed.jump 等别名）
 *   · 返回 { p, events }；p 为**就地更新**后的同一对象（res.p === p），
 *     world（solids / hazards / enemies / level）全程只读。
 *   · events 每项形如 { type, x, y, ... }，type 取值：
 *     land | jump | djump | dash | slide | stomp | hurt | die | break | spring
 *     | graze | bell | rocket | land
 *   · 风格分：stepPhysics 内部已调用 addStyle（冲刺/踩敌/滑铲/二段跳/极限落地/
 *     擦弹/空中连击）。事件里的 styleKind / stylePts 仅为回显，game.js 不要再
 *     重复调用 addStyle，否则会双倍计分。
 *   · world 可选携带 g（局内全局数据）；有则自动同步 combo / style / buffs /
 *     energy，game.js 仍需自行调用 comboTick / styleTick 做计时。
 *
 * 【本模块在玩家对象上新增的字段（契约 §2.1.1 之外）】
 *   input          输入快照对象（游戏层写入，本模块只读）
 *   permanentBubbles  是否永久拥有二段跳（泡泡糖，一次性）
 *   rocketAmmo     火箭筒弹药数（0 / 1）
 *   shieldCharges  护盾剩余可抵挡次数
 *   crumbleStand   脚下碎裂平台 id（避免重复触发崩塌）
 *   standId        当前站立的实体 id（移动平台跟随用）
 *   jumpCut        本次跳跃是否已执行过松手减速（JUMP_CUT 只生效一次）
 *   deadReason     死亡原因：'' | 'pit' | 'hazard' | 'hit'
 *   grazeCd        擦弹计分冷却计时
 * ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  root.MP = root.MP || {};
  root.MP.LOGIC = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ======================================================================
   * 一、物理常量（契约 §1.2，数值勿改）
   * ==================================================================== */
  var PHYS = {
    GRAVITY: 2400,          // 重力 px/s^2
    MAX_FALL: 1500,         // 最大下落速度
    RUN_SPEED: 320,         // 基础最大水平速度
    RUN_ACCEL: 2600,        // 地面加速度
    RUN_FRICTION: 3200,     // 地面摩擦
    AIR_ACCEL: 1800,        // 空中加速度
    AIR_FRICTION: 900,      // 空中摩擦
    JUMP_V: 780,            // 一段跳初速（跳跃高度约 126.75px）
    DOUBLE_JUMP_V: 660,     // 二段跳初速
    JUMP_CUT: 0.45,         // 松开跳跃键时 vy *= 0.45（可变跳跃高度）
    COYOTE_TIME: 0.10,      // 离地宽限
    JUMP_BUFFER: 0.12,      // 落地前按键缓冲
    DASH_SPEED: 900,        // 冲刺速度
    DASH_TIME: 0.18,        // 冲刺持续
    DASH_CD: 0.55,          // 冲刺冷却
    DASH_COST: 30,          // 冲刺体力消耗
    STAMINA_MAX: 100,       // 体力上限
    STAMINA_RUN: 4,         // 每秒跑动消耗
    STAMINA_REGEN: 25,      // 每秒静止恢复
    SLIDE_TIME: 0.55,       // 滑铲持续
    SLIDE_SPEED_MUL: 1.15,  // 滑铲速度倍率
    BOUNCE_V: 520,          // 踩敌弹起初速

    /* 以下为契约 §1.2 之外、由本模块定义并导出的补充常量 */
    GROUND_Y: 460,          // 地面基准线
    VIEW_W_PORTRAIT: 520,   // 竖屏参考视口宽
    VIEW_W_LANDSCAPE: 960,  // 横屏参考视口宽
    PLAYER_W: 34,           // 玩家碰撞盒宽
    PLAYER_H: 26,           // 玩家碰撞盒高
    SLIDE_W: 44,            // 滑铲碰撞盒宽
    SLIDE_H: 14,            // 滑铲碰撞盒高
    MAX_HP: 3,              // 每条命的生命值（归零则扣 1 条命并从检查点复活）
    SPRING_V: 1180,         // 弹簧弹起初速
    DEATH_DROP: 140,        // 低于地面多少判定坠坑死亡
    COMBO_TIME: 2.5,        // 连击保持时间（秒）
    COMBO_MAX: 30,          // 连击倍率上限（1 + 30*0.1 = 4）
    STYLE_DECAY: 0.92,      // 风格分每秒保留比例（衰减 8%）
    DIST_SCORE_PER: 12,     // 每 12 世界单位 +1 距离分
    GRAZE_DIST: 14,         // 擦弹判定距离
    ENERGY_PICKUP: 2,       // 拾取普通道具 +能量
    ENERGY_KILL: 6          // 拾取/伤害敌人 +能量
  };

  /* ======================================================================
   * 二、生物群系（契约 §1.3，每 5 关一换，26 关后循环）
   * ==================================================================== */
  var BIOMES = [
    { id: 'kitchen',    name: '厨房', palette: { sky: ['#3a2a1c', '#ffb347'], silhouette: '#5a3a22', accent: '#ffb347', fog: 'rgba(255,179,71,0.10)' }, desc: '橱柜、番茄酱、奶酪塔' },
    { id: 'warehouse',  name: '仓库', palette: { sky: ['#16202e', '#4aa3ff'], silhouette: '#22303f', accent: '#4aa3ff', fog: 'rgba(74,163,255,0.10)' }, desc: '集装箱、货架、传送带' },
    { id: 'rainforest', name: '雨林', palette: { sky: ['#0f2418', '#39d353'], silhouette: '#16351f', accent: '#39d353', fog: 'rgba(57,211,83,0.10)' }, desc: '藤蔓、巨叶、荧光菇' },
    { id: 'lava',       name: '熔岩', palette: { sky: ['#2a0e08', '#ff5a3c'], silhouette: '#3d160c', accent: '#ff5a3c', fog: 'rgba(255,90,60,0.12)' }, desc: '岩浆、黑曜石、蒸汽' },
    { id: 'ice',        name: '冰原', palette: { sky: ['#122436', '#7ff2ff'], silhouette: '#1d3b52', accent: '#7ff2ff', fog: 'rgba(127,242,255,0.12)' }, desc: '冰晶、雪丘、极光' },
    { id: 'void',       name: '虚空', palette: { sky: ['#0a0714', '#b07cff'], silhouette: '#170f2a', accent: '#b07cff', fog: 'rgba(176,124,255,0.12)' }, desc: '星河、浮石、裂隙' }
  ];

  /* ======================================================================
   * 三、道具表（契约 §1.4 / §1.6，共 25 种）
   *     effect(p, g) 为纯函数：只改 p / g 的数据，返回 undefined
   * ==================================================================== */
  function buffSet(p, g, id, dur) {
    if (!p.buffs) p.buffs = {};
    p.buffs[id] = dur;
    if (g && g.buffs) g.buffs[id] = dur;
  }
  function coinMul(p) {
    return (p && p.buffs && p.buffs.multiply > 0) ? 2 : 1;
  }

  var ITEMS = {
    cheese: {
      id: 'cheese', name: '奶酪', type: 'pickup', rarity: 1, icon: 'cheese',
      score: 150, coin: 0, cheese: 1, desc: '+150 分，+1 奶酪',
      effect: function (p, g) { g.cheese = (g.cheese || 0) + 1; p.cheese = (p.cheese || 0) + 1; }
    },
    coin: {
      id: 'coin', name: '金币', type: 'pickup', rarity: 1, icon: 'coin',
      score: 80, coin: 1, cheese: 0, desc: '+80 分，+1 金币',
      effect: function (p, g) { var n = 1 * coinMul(p); g.coin = (g.coin || 0) + n; p.coins = (p.coins || 0) + n; }
    },
    gem: {
      id: 'gem', name: '钻石', type: 'pickup', rarity: 4, icon: 'gem',
      score: 500, coin: 3, cheese: 0, desc: '+500 分，+3 金币',
      effect: function (p, g) { var n = 3 * coinMul(p); g.coin = (g.coin || 0) + n; p.coins = (p.coins || 0) + n; p.gems = (p.gems || 0) + 1; }
    },
    clover: {
      id: 'clover', name: '四叶草', type: 'pickup', rarity: 3, icon: 'clover',
      score: 200, coin: 0, cheese: 0, desc: '分数 ×2，持续 20s',
      effect: function (p, g) { buffSet(p, g, 'clover', 20); }
    },
    magnet: {
      id: 'magnet', name: '磁铁', type: 'pickup', rarity: 3, icon: 'magnet',
      score: 120, coin: 0, cheese: 0, desc: '吸取半径 160，8s',
      effect: function (p, g) { buffSet(p, g, 'magnet', 8); }
    },
    catnip: {
      id: 'catnip', name: '猫薄荷', type: 'pickup', rarity: 2, icon: 'catnip',
      score: 100, coin: 0, cheese: 0, desc: '速度 +30%，10s',
      effect: function (p, g) { buffSet(p, g, 'catnip', 10); }
    },
    sneakers: {
      id: 'sneakers', name: '跑鞋', type: 'pickup', rarity: 2, icon: 'sneakers',
      score: 120, coin: 0, cheese: 0, desc: '跳跃高度 +25%、速度 +15%，12s',
      effect: function (p, g) { buffSet(p, g, 'sneakers', 12); }
    },
    bubblegum: {
      id: 'bubblegum', name: '泡泡糖', type: 'pickup', rarity: 3, icon: 'bubblegum',
      score: 180, coin: 0, cheese: 0, desc: '永久获得二段跳（一次性）',
      effect: function (p, g) { p.permanentBubbles = true; if (!p.buffs) p.buffs = {}; p.buffs.bubblegum = 1; if (g && g.buffs) g.buffs.bubblegum = 1; }
    },
    flame: {
      id: 'flame', name: '火焰尾迹', type: 'pickup', rarity: 3, icon: 'flame',
      score: 150, coin: 0, cheese: 0, desc: '冲刺时留下火焰带（灼伤敌人），8s',
      effect: function (p, g) { buffSet(p, g, 'flame', 8); }
    },
    giant: {
      id: 'giant', name: '巨化药水', type: 'pickup', rarity: 4, icon: 'giant',
      score: 300, coin: 0, cheese: 0, desc: '体型 ×1.6，可撞碎砖墙，12s',
      effect: function (p, g) { buffSet(p, g, 'giant', 12); }
    },
    mini: {
      id: 'mini', name: '缩小药水', type: 'pickup', rarity: 3, icon: 'mini',
      score: 200, coin: 0, cheese: 0, desc: '体型 ×0.65，可钻缝隙，12s',
      effect: function (p, g) { buffSet(p, g, 'mini', 12); }
    },
    feather: {
      id: 'feather', name: '羽毛', type: 'pickup', rarity: 2, icon: 'feather',
      score: 100, coin: 0, cheese: 0, desc: '空中下落减速 60%，10s',
      effect: function (p, g) { buffSet(p, g, 'feather', 10); }
    },
    shield: {
      id: 'shield', name: '护盾泡泡', type: 'pickup', rarity: 3, icon: 'shield',
      score: 150, coin: 0, cheese: 0, desc: '抵挡 1 次伤害',
      effect: function (p, g) {
        p.shieldCharges = Math.min(3, (p.shieldCharges || 0) + 1);
        if (!p.buffs) p.buffs = {};
        p.buffs.shield = p.shieldCharges;
        if (g && g.buffs) g.buffs.shield = p.shieldCharges;
      }
    },
    star: {
      id: 'star', name: '无敌星', type: 'pickup', rarity: 4, icon: 'star',
      score: 400, coin: 0, cheese: 0, desc: '无敌 5s + 撞碎机关',
      effect: function (p, g) { buffSet(p, g, 'star', 5); }
    },
    hourglass: {
      id: 'hourglass', name: '时停沙漏', type: 'pickup', rarity: 4, icon: 'hourglass',
      score: 350, coin: 0, cheese: 0, desc: '敌人/机关速度 ×0.35，6s',
      effect: function (p, g) { buffSet(p, g, 'hourglass', 6); }
    },
    energy: {
      id: 'energy', name: '能量核心', type: 'pickup', rarity: 2, icon: 'energy',
      score: 60, coin: 0, cheese: 0, desc: '能量 +40',
      effect: function (p, g) {
        g.energy = Math.min(PHYS.STAMINA_MAX, (g.energy || 0) + 40);
        p.energy = Math.min(PHYS.STAMINA_MAX, (p.energy || 0) + 40);
      }
    },
    heart: {
      id: 'heart', name: '生命果', type: 'pickup', rarity: 4, icon: 'heart',
      score: 250, coin: 0, cheese: 0, desc: '命 +1（上限 5）',
      effect: function (p, g) {
        p.lives = Math.min(5, (p.lives || 0) + 1);
        p.maxLives = Math.max(p.maxLives || 5, p.lives);
        g.lives = p.lives;
      }
    },
    drill: {
      id: 'drill', name: '钻头', type: 'pickup', rarity: 3, icon: 'drill',
      score: 250, coin: 0, cheese: 0, desc: '冲刺可破墙，8s',
      effect: function (p, g) { buffSet(p, g, 'drill', 8); }
    },
    boots: {
      id: 'boots', name: '弹力靴', type: 'pickup', rarity: 2, icon: 'boots',
      score: 150, coin: 0, cheese: 0, desc: '跳跃高度 ×1.6，10s',
      effect: function (p, g) { buffSet(p, g, 'boots', 10); }
    },
    bell: {
      id: 'bell', name: '复活铃铛', type: 'pickup', rarity: 4, icon: 'bell',
      score: 300, coin: 0, cheese: 0, desc: '免死一次（坠坑/受击不消耗命）',
      effect: function (p, g) { p.hasBell = true; }
    },
    freeze: {
      id: 'freeze', name: '冰冻水晶', type: 'pickup', rarity: 3, icon: 'freeze',
      score: 280, coin: 0, cheese: 0, desc: '5s 内冻结全部敌人',
      effect: function (p, g) { buffSet(p, g, 'freeze', 5); }
    },
    emp: {
      id: 'emp', name: '电磁脉冲', type: 'pickup', rarity: 4, icon: 'emp',
      score: 400, coin: 0, cheese: 0, desc: '清除屏幕内敌人与伤害性机关，击退',
      effect: function (p, g) { buffSet(p, g, 'emp', 0.6); }
    },
    multiply: {
      id: 'multiply', name: '双倍金币', type: 'pickup', rarity: 3, icon: 'multiply',
      score: 200, coin: 0, cheese: 0, desc: '金币收益 ×2，15s',
      effect: function (p, g) { buffSet(p, g, 'multiply', 15); }
    },
    gravity: {
      id: 'gravity', name: '重力翻转', type: 'pickup', rarity: 4, icon: 'gravity',
      score: 400, coin: 0, cheese: 0, desc: '反重力 8s（天花板行走）',
      effect: function (p, g) { buffSet(p, g, 'gravity', 8); }
    },
    rocket: {
      id: 'rocket', name: '火箭筒', type: 'pickup', rarity: 4, icon: 'rocket',
      score: 350, coin: 0, cheese: 0, desc: '装填 1 发，发射时向前贯穿冲刺（破一切）',
      effect: function (p, g) { p.rocketAmmo = (p.rocketAmmo || 0) + 1; }
    }
  };

  var ITEM_IDS = [
    'cheese', 'coin', 'gem', 'clover', 'magnet', 'catnip', 'sneakers', 'bubblegum',
    'flame', 'giant', 'mini', 'feather', 'shield', 'star', 'hourglass', 'energy',
    'heart', 'drill', 'boots', 'bell', 'freeze', 'emp', 'multiply', 'gravity', 'rocket'
  ];

  /* 稀有度配色（供 UI / 飘字复用） */
  var RARITY_COLOR = { 1: '#ffd23f', 2: '#35e0c8', 3: '#4aa3ff', 4: '#ff4d8d' };

  /* ======================================================================
   * 四、危险物表（契约 §1.4，共 11 种）
   *     kind 与 id 相同（便于 LevelSpec.hazards[].kind 直接查表），
   *     motion 描述运动方式，供 game.js / fx.js 参考
   * ==================================================================== */
  var HAZARDS = {
    cat:      { id: 'cat',      name: '巡逻猫',   w: 38, h: 30,  damage: 1, kind: 'cat',      motion: 'patrol', desc: '有视锥的巡逻猫，撞上扣命' },
    spike:    { id: 'spike',    name: '尖刺',     w: 30, h: 28,  damage: 1, kind: 'spike',    motion: 'static', desc: '地面上的尖刺' },
    pit:      { id: 'pit',      name: '坠坑',     w: 120, h: 40, damage: 1, kind: 'pit',      motion: 'pit',    desc: '地面缺口，掉下去就完了' },
    rock:     { id: 'rock',     name: '落石',     w: 34, h: 34,  damage: 1, kind: 'rock',     motion: 'fall',   desc: '从上方砸落的石头' },
    fence:    { id: 'fence',    name: '电栅栏',   w: 18, h: 60,  damage: 1, kind: 'fence',    motion: 'static', desc: '高压电栅栏' },
    acid:     { id: 'acid',     name: '酸液池',   w: 90, h: 20,  damage: 1, kind: 'acid',     motion: 'pool',   desc: '地面上的酸液' },
    pendulum: { id: 'pendulum', name: '摆锤',     w: 40, h: 40,  damage: 1, kind: 'pendulum', motion: 'swing',  desc: '来回摆动的大铁锤' },
    laser:    { id: 'laser',    name: '激光',     w: 16, h: 200, damage: 1, kind: 'laser',    motion: 'beam',   desc: '周期性发射的激光' },
    blade:    { id: 'blade',    name: '风车刀片', w: 56, h: 56,  damage: 1, kind: 'blade',    motion: 'spin',   desc: '高速旋转的刀片' },
    drone:    { id: 'drone',    name: '飞行器',   w: 34, h: 28,  damage: 1, kind: 'drone',    motion: 'fly',    desc: '来回巡逻的飞行器' },
    crusher:  { id: 'crusher',  name: '压机',     w: 70, h: 240, damage: 1, kind: 'crusher',  motion: 'crush',  desc: '从天而降的巨型压机' }
  };

  /* ======================================================================
   * 五、敌人表（契约 §1.5，共 4 种）
   * ==================================================================== */
  var ENEMIES = {
    cat:    { id: 'cat',    name: '巡逻猫', hp: 2, speed: 90,  w: 38, h: 30, score: 120, behavior: 'patrol', desc: '地面往返巡逻，遇玩家加速扑咬' },
    drone:  { id: 'drone',  name: '飞行器', hp: 2, speed: 120, w: 34, h: 28, score: 140, behavior: 'sine',   desc: '正弦飞行的无人机器' },
    wasp:   { id: 'wasp',   name: '追踪蜂', hp: 1, speed: 80,  w: 26, h: 24, score: 100, behavior: 'chase',  desc: '缓慢追踪玩家的蜂群' },
    turret: { id: 'turret', name: '炮台',   hp: 3, speed: 0,   w: 36, h: 36, score: 180, behavior: 'turret', desc: '固定炮台，向玩家方向发射慢速弹幕' }
  };

  /* ======================================================================
   * 六、Buff 说明表（UI 图鉴用）
   *     type: 'timed' 计时（秒） | 'permanent' 永久 | 'charge' 次数
   * ==================================================================== */
  var BUFF_INFO = {
    clover:       { name: '四叶草',   dur: 20,    type: 'timed',     desc: '分数 ×2' },
    magnet:       { name: '磁铁',     dur: 8,     type: 'timed',     desc: '吸取半径 160' },
    catnip:       { name: '猫薄荷',   dur: 10,    type: 'timed',     desc: '速度 +30%' },
    sneakers:     { name: '跑鞋',     dur: 12,    type: 'timed',     desc: '跳跃 +25%，速度 +15%' },
    bubblegum:    { name: '泡泡糖',   dur: 0,     type: 'permanent', desc: '永久获得二段跳' },
    flame:        { name: '火焰尾迹', dur: 8,     type: 'timed',     desc: '冲刺留下火焰带' },
    giant:        { name: '巨化',     dur: 12,    type: 'timed',     desc: '体型 ×1.6，可撞碎砖墙' },
    mini:         { name: '缩小',     dur: 12,    type: 'timed',     desc: '体型 ×0.65，可钻缝隙' },
    feather:      { name: '羽毛',     dur: 10,    type: 'timed',     desc: '空中下落减速 60%' },
    shield:       { name: '护盾泡泡', dur: 0,     type: 'charge',    desc: '抵挡 1 次伤害' },
    star:         { name: '无敌星',   dur: 5,     type: 'timed',     desc: '无敌并撞碎机关' },
    hourglass:    { name: '时停沙漏', dur: 6,     type: 'timed',     desc: '敌人/机关速度 ×0.35' },
    drill:        { name: '钻头',     dur: 8,     type: 'timed',     desc: '冲刺可破墙' },
    boots:        { name: '弹力靴',   dur: 10,    type: 'timed',     desc: '跳跃高度 ×1.6' },
    freeze:       { name: '冰冻',     dur: 5,     type: 'timed',     desc: '冻结全部敌人' },
    emp:          { name: '电磁脉冲', dur: 0.6,   type: 'timed',     desc: '清屏并击退' },
    multiply:     { name: '双倍金币', dur: 15,    type: 'timed',     desc: '金币收益 ×2' },
    gravity:      { name: '重力翻转', dur: 8,     type: 'timed',     desc: '反重力，天花板行走' }
  };

  /* 会随时间倒数的 buff（charge / permanent 不倒计时） */
  var TIMED_BUFFS = {
    clover: 1, magnet: 1, catnip: 1, sneakers: 1, flame: 1, giant: 1, mini: 1,
    feather: 1, star: 1, hourglass: 1, drill: 1, boots: 1, freeze: 1, emp: 1,
    multiply: 1, gravity: 1
  };

  /* ======================================================================
   * 七、风格分（契约 §1.7）
   * ==================================================================== */
  var STYLE_LEVELS = ['D', 'C', 'B', 'A', 'S', 'SS'];
  var STYLE_THRESHOLDS = [0, 120, 320, 700, 1300, 2200];
  var STYLE_ACTIONS = {
    dash: 50,      // 冲刺
    stomp: 120,    // 踩敌
    slam: 80,      // 跳劈
    slide: 40,     // 滑铲
    djump: 30,     // 二段跳
    hardland: 60,  // 极限落地
    graze: 20,     // 擦弹
    air: 10        // 空中连击（每 0.5s 空中时间）
  };

  /* ======================================================================
   * 八、工具函数
   * ==================================================================== */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function aabb(a, b) {
    if (!a || !b) return false;
    return (a.x < b.x + b.w) && (a.x + a.w > b.x) && (a.y < b.y + b.h) && (a.y + a.h > b.y);
  }

  /* 确定性 32 位哈希：hash32(a, b) */
  function hash32(a, b) {
    var h = 0x811c9dc5 >>> 0;
    h = (h ^ (a >>> 0)) >>> 0; h = Math.imul(h, 0x01000193) >>> 0;
    h = (h ^ (b >>> 0)) >>> 0; h = Math.imul(h, 0x01000193) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x2545f491) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h >>> 0;
  }

  /* 确定性随机数发生器：mulberry32(seed) → () => [0,1) */
  function mulberry32(seed) {
    var a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function pickWeighted(rng, list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i][1];
    var r = rng() * total;
    for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r <= 0) return list[i][0]; }
    return list[0][0];
  }

  function styleIndexOf(letter) {
    var i = STYLE_LEVELS.indexOf(letter);
    return i < 0 ? 0 : i;
  }
  function styleLevelOf(pts) {
    var i = 0;
    for (var k = 0; k < STYLE_THRESHOLDS.length; k++) if (pts >= STYLE_THRESHOLDS[k]) i = k;
    return STYLE_LEVELS[i];
  }

  /* ======================================================================
   * 九、关卡生成（契约 §1.3）
   * ==================================================================== */

  /* 平台链约束：任意相邻两个"平台类"实体，左边缘间距 ≤ CHAIN_DX，高度差 ≤ CHAIN_DY */
  var CHAIN_DX = 240;
  var CHAIN_DY = 85;
  /* 平台带：相对地面的高度区间。
   * 上界 -95：基础跳跃高度约 123，玩家跳得上去；单级抬升 ≤ 100 的硬约束也满足。
   * 下界 -46：平台下沿（+16 厚）始终高于站立时头顶（-26），跑步不会被挡、也不会磕头。 */
  var PLAT_BAND_TOP = -95;
  var PLAT_BAND_BOT = -46;
  var PLAT_H = 16;

  function isPlatKind(k) {
    return k === 'platform' || k === 'oneway' || k === 'mover' || k === 'spring' || k === 'crumble';
  }
  /* 可"从下方穿过、只从上方落脚"的实体 */
  function isPassKind(k) {
    return k === 'oneway' || k === 'mover' || k === 'crumble';
  }

  function genLayout(level, runSeed) {
    var n = Math.max(1, Math.floor(level) || 1);
    var len = Math.min(4200 + n * 260, 9600);
    var seed = hash32(n, runSeed);
    var rng = mulberry32(seed);
    var groundY = PHYS.GROUND_Y;
    var goalX = len - 120;
    var diff = 1 + (n - 1) * 0.09;
    var biome = BIOMES[Math.floor((n - 1) / 5) % BIOMES.length];

    var solids = [];
    var hazards = [];
    var sections = [];
    var sid = 0;

    function addSolid(x, y, w, h, kind, extra) {
      var s = {
        id: 's' + (sid++), x: x, y: y, w: w, h: h, kind: kind,
        vx: 0, vy: 0, range: 0, phase: 0, hp: 1, breakable: false
      };
      if (extra) for (var k in extra) s[k] = extra[k];
      solids.push(s);
      return s;
    }
    function addHazard(h) { hazards.push(h); return h; }
    function ground(x0, x1) {
      if (x1 - x0 <= 0) return null;
      return addSolid(x0, groundY, x1 - x0, 60, 'ground');
    }
    /* 平台：高度平滑（相邻差 ≤ CHAIN_DY），并限制在可达带内 */
    function platY(next) {
      var base = chainY;
      var y = base + Math.round((rng() * 2 - 1) * 40);
      y = clamp(y, groundY + PLAT_BAND_TOP, groundY + PLAT_BAND_BOT);
      if (next) chainY = y;
      return y;
    }
    var chainY = groundY - 60;
    function addPlat(x, y, w, h, kind, extra) {
      var s = addSolid(x, y, w, h, kind || 'platform', extra);
      chainY = s.y;
      return s;
    }

    /* 首段恒为 flat（长 520）：留足起跑热身跑道，
       出生点落在画面 ~40% 处时脚下仍有实体地面 */
    sections.push({ type: 'flat', x0: 0, x1: 520 });
    buildSection('flat', 0, 520);

    var endX = len - 480;   // 末段 sprint 长 480
    var cur = 520;

    var SECTION_LEN = {
      flat:    [300, 520],
      gap:     [240, 400],
      stairs:  [320, 520],
      float:   [380, 620],
      enemy:   [320, 520],
      machine: [340, 520],
      sprint:  [420, 560],
      gauntlet:[460, 700]
    };
    function weights() {
      var w = [
        ['flat', 1.30], ['gap', 1.00], ['stairs', 0.90], ['float', 1.00],
        ['enemy', 1.10], ['machine', n >= 3 ? 0.80 : 0.30], ['sprint', 0.50], ['gauntlet', 0.85]
      ];
      return w;
    }

    function buildSection(type, x0, x1) {
      var w = x1 - x0, i, x, gw, gs, steps, stepW, sx, y;
      switch (type) {
        case 'flat':
          ground(x0, x1);
          // 少量装饰平台（同时维持平台链密度）
          addPlat(x0 + 70, platY(true), 120, PLAT_H, 'oneway');
          if (w > 380) addPlat(x0 + 200, platY(true), 110, PLAT_H, 'oneway');
          if (n >= 4 && rng() < 0.35) {
            // 低矮砖墙：可跳过去，冲刺+破墙能力可撞碎
            addSolid(x0 + Math.round(w * 0.6), groundY - 80, 30, 80, 'brick', { breakable: true, hp: 1 });
          }
          break;

        case 'gap': {
          gw = Math.min(175, Math.max(90, Math.round(w * 0.45)));
          gs = x0 + Math.round((w - gw) * 0.45);
          ground(x0, gs);
          ground(gs + gw, x1);
          // 间隙上方的踏板（低空，可跳上）
          addPlat(gs + Math.max(0, Math.round((gw - 110) / 2)), platY(true), 110, PLAT_H, 'oneway');
          // 弹力板：地面上的弹跳器
          if (rng() < 0.5) {
            addSolid(gs + gw + 40, groundY - PLAT_H, 40, PLAT_H, 'spring', { hp: 1 });
          }
          addHazard({ x: gs, y: groundY, w: gw, h: 40, kind: 'pit', id: 'hz_pit_' + Math.round(gs) });
          break;
        }

        case 'stairs': {
          ground(x0, x1);
          steps = 3 + Math.floor(rng() * 3);
          stepW = 96;
          sx = x0 + 40;
          y = platY(true);
          for (i = 0; i < steps; i++) {
            addPlat(sx, y, stepW, PLAT_H, 'oneway');
            y = Math.max(groundY + PLAT_BAND_TOP, y - 45);
            sx += stepW;
          }
          break;
        }

        case 'float': {
          gw = Math.min(175, 130);
          gs = x0 + Math.round((w - gw) * 0.5);
          ground(x0, gs);
          ground(gs + gw, x1);
          var cnt = 3;
          for (i = 0; i < cnt; i++) {
            var px = gs - 40 + i * ((gw + 80) / (cnt - 1));
            addPlat(px, platY(true), 110, PLAT_H, 'oneway');
          }
          // 移动平台：横向缓慢移动，给大跨越兜底
          if (rng() < 0.45) {
            addSolid(gs + gw - 60, groundY - 80, 90, PLAT_H, 'mover', {
              vx: 60 * (rng() < 0.5 ? -1 : 1), vy: 0, range: 50, phase: rng() * Math.PI * 2, hp: 1
            });
          }
          addHazard({ x: gs, y: groundY, w: gw, h: 40, kind: 'pit', id: 'hz_pit_' + Math.round(gs) });
          break;
        }

        case 'enemy':
          ground(x0, x1);
          addPlat(x0 + 80, platY(true), 120, PLAT_H, 'oneway');
          if (w > 400) addPlat(x0 + 260, platY(true), 110, PLAT_H, 'oneway');
          break;

        case 'machine':
          ground(x0, x1);
          addPlat(x0 + 60, platY(true), 120, PLAT_H, 'oneway');
          if (w > 400) addPlat(x0 + 250, platY(true), 110, PLAT_H, 'oneway');
          // 碎裂平台：踩上去会塌
          if (rng() < 0.5) {
            addSolid(x0 + Math.round(w * 0.55), groundY - 70, 80, PLAT_H, 'crumble', { hp: 1 });
          }
          break;

        case 'sprint':
          ground(x0, x1);
          addPlat(x0 + 90, platY(true), 130, PLAT_H, 'oneway');
          if (w > 460) addPlat(x0 + 300, platY(true), 120, PLAT_H, 'oneway');
          break;

        case 'gauntlet': {
          gw = Math.min(175, 110);
          gs = x0 + Math.round((w - gw) * 0.35);
          ground(x0, gs);
          ground(gs + gw, x1);
          addPlat(gs - 20, platY(true), 110, PLAT_H, 'oneway');
          addPlat(gs + gw - 90, platY(true), 110, PLAT_H, 'oneway');
          addHazard({ x: gs, y: groundY, w: gw, h: 40, kind: 'pit', id: 'hz_pit_' + Math.round(gs) });
          break;
        }
      }
    }

    while (cur < endX) {
      var type = pickWeighted(rng, weights());
      var L = randInt(rng, SECTION_LEN[type][0], SECTION_LEN[type][1]);
      if (cur + L > endX) L = endX - cur;
      if (L < 140) {
        // 剩余太短：补一个 flat 段落尾巴
        type = 'flat';
        L = endX - cur;
      }
      sections.push({ type: type, x0: cur, x1: cur + L });
      buildSection(type, cur, cur + L);
      cur += L;
    }
    /* 末段恒为 sprint（长 480，通向终点） */
    sections.push({ type: 'sprint', x0: endX, x1: len });
    buildSection('sprint', endX, len);

    /* 平台链补齐：保证任意相邻平台类实体左边缘间距 ≤ CHAIN_DX */
    var plats = solids.filter(function (s) { return isPlatKind(s.kind); })
      .sort(function (a, b) { return a.x - b.x; });
    var filler = [];
    var guard = 0;
    for (var i = 1; i < plats.length && guard < 4000; i++) {
      var a = plats[i - 1], b = plats[i];
      var dx = b.x - a.x;
      while (dx > CHAIN_DX && guard++ < 4000) {
        var fw = 60;
        var fx = a.x + CHAIN_DX - fw + 10;
        if (fx < a.x + a.w + 10) fx = a.x + a.w + 10;
        if (fx > b.x - 20) break;
        var f = addSolid(fx, a.y, fw, 14, 'oneway');
        filler.push(f);
        a = f;
        dx = b.x - a.x;
      }
    }
    if (filler.length) {
      // 补齐的踏板也纳入链尾，保证最后一节到终点之间不出现大跨度
      var lastPlat = null;
      for (var j = 0; j < solids.length; j++) if (isPlatKind(solids[j].kind)) lastPlat = solids[j];
      if (lastPlat) {
        var xEnd = len - 200;
        while (lastPlat.x + CHAIN_DX < xEnd && guard++ < 4000) {
          var nx = lastPlat.x + CHAIN_DX - 50;
          var ns = addSolid(nx, lastPlat.y, 60, 14, 'oneway');
          lastPlat = ns;
        }
      }
    }

    var enemySpeedK = Math.min(1 + 0.03 * (n - 1), 1.9);
    var densityK = Math.min(1 + 0.04 * (n - 1), 2.0);
    var rarityWeight = Math.max(0.35, 1 - 0.03 * (n - 1));

    return {
      n: n, len: len, seed: seed, rng: rng, groundY: groundY, goalX: goalX,
      diff: diff, biome: biome, sections: sections, solids: solids,
      hazards: hazards, targetCheese: levelTargets(n).cheese,
      enemySpeedK: enemySpeedK, densityK: densityK, rarityWeight: rarityWeight
    };
  }

  /* ---- 敌人布点 ---- */
  function genEnemyPlacements(level, runSeed, solids, layout) {
    var L = layout || genLayout(level, runSeed);
    var rng = mulberry32(hash32(L.n, (runSeed ^ 0x27d4eb2f) >>> 0));
    var out = [];
    var safeX = L.goalX - 220;
    var speedK = L.enemySpeedK, densK = L.densityK;

    function push(kind, x, y) {
      var d = ENEMIES[kind];
      var e = {
        x: x, y: y, w: d.w, h: d.h, kind: kind,
        vx: 0, hp: d.hp, maxHp: d.hp, range: 0, y0: y, phase: 0, state: 'idle', t: 0
      };
      if (kind === 'cat') { e.vx = d.speed * speedK; e.range = 110; e.state = 'patrol'; }
      else if (kind === 'drone') { e.vx = d.speed * speedK * 0.6; e.range = 28; e.y0 = y; e.state = 'fly'; e.phase = rng() * Math.PI * 2; }
      else if (kind === 'wasp') { e.vx = d.speed * speedK * 0.7; e.range = 80; e.state = 'chase'; e.y0 = y; }
      else if (kind === 'turret') { e.vx = 0; e.range = 0; e.state = 'aim'; }
      out.push(e);
    }

    for (var i = 0; i < L.sections.length; i++) {
      var sec = L.sections[i];
      var count = 0;
      if (sec.type === 'enemy') count = Math.max(1, Math.round(1 * densK));
      else if (sec.type === 'gauntlet') count = 1;
      else if (sec.type === 'flat' && sec.x0 > 0 && L.n >= 2) count = (rng() < 0.4) ? 1 : 0;
      if (count <= 0) continue;
      var w = sec.x1 - sec.x0;
      for (var k = 0; k < count; k++) {
        var x = sec.x0 + 60 + rng() * Math.max(40, w - 140);
        var kind = 'cat';
        var r = rng();
        if (L.n >= 5 && r < 0.18) kind = 'turret';
        else if (r < 0.55) kind = 'cat';
        else if (r < 0.85) kind = 'wasp';
        else kind = 'drone';
        var y;
        if (kind === 'drone') y = L.groundY - 120 - rng() * 30;
        else if (kind === 'wasp') y = L.groundY - 110 - rng() * 20;
        else y = L.groundY - ENEMIES[kind].h;
        push(kind, x, y);
      }
    }
    /* 终点前 220px 内不得有敌人 */
    return out.filter(function (e) { return e.x + e.w <= safeX; });
  }

  /* ---- 机关/危险物布点 ---- */
  var MACHINE_KINDS = ['pendulum', 'laser', 'crusher', 'blade', 'rock', 'drone'];
  var STATIC_KINDS = ['spike', 'fence', 'acid'];

  function makeHazard(kind, x, groundY, rng) {
    var d = HAZARDS[kind];
    var h = { x: x, y: groundY, w: d.w, h: d.h, kind: kind, id: 'hz_' + kind + '_' + Math.round(x) };
    switch (kind) {
      case 'spike':   h.y = groundY - d.h; break;
      case 'fence':   h.y = groundY - d.h; break;
      case 'acid':    h.y = groundY - d.h; break;
      case 'pendulum': h.y = groundY - 210; h.range = 90; h.phase = rng() * Math.PI * 2; h.pivotY = groundY - 230; break;
      case 'laser':   h.y = groundY - 220; h.phase = rng() * Math.PI * 2; h.period = 2.4; break;
      case 'blade':   h.y = groundY - 160; h.range = 60; h.phase = rng() * Math.PI * 2; break;
      case 'crusher': h.y = groundY - 260; h.phase = rng() * Math.PI * 2; h.period = 3.0; h.h = 240; break;
      case 'rock':    h.y = groundY - 230; h.vy = 120; break;
      case 'cat':     h.y = groundY - d.h; h.range = 100; h.phase = rng() * Math.PI * 2; break;
      case 'drone':   h.y = groundY - 140; h.range = 60; h.phase = rng() * Math.PI * 2; break;
    }
    return h;
  }

  function genHazardPlacements(level, runSeed, solids, layout) {
    var L = layout || genLayout(level, runSeed);
    var rng = mulberry32(hash32(L.n, (runSeed ^ 0x165667b1) >>> 0));
    var out = [];
    var machineOk = L.n >= 3;

    function place(kind, x) {
      // 避免与平台链在同一 x 区间重叠（平台带高度 40~100）
      for (var t = 0; t < 4; t++) {
        var bad = false;
        for (var i = 0; i < solids.length; i++) {
          var s = solids[i];
          if (!isPlatKind(s.kind)) continue;
          if (s.x < x + HAZARDS[kind].w && s.x + s.w > x) {
            if (s.y < L.groundY && s.y > L.groundY - 110) { bad = true; break; }
          }
        }
        if (!bad) break;
        x += 130;
      }
      out.push(makeHazard(kind, x, L.groundY, rng));
    }

    for (var i = 0; i < L.sections.length; i++) {
      var sec = L.sections[i];
      if (sec.type === 'machine' || sec.type === 'gauntlet') {
        var count = sec.type === 'machine' ? (rng() < 0.55 ? 2 : 1) : 1;
        for (var k = 0; k < count; k++) {
          var kind = machineOk ? MACHINE_KINDS[Math.floor(rng() * MACHINE_KINDS.length)]
                               : STATIC_KINDS[Math.floor(rng() * STATIC_KINDS.length)];
          var x = sec.x0 + 70 + rng() * Math.max(30, (sec.x1 - sec.x0) - 160);
          place(kind, x);
        }
      } else if (sec.type === 'enemy' && L.n >= 2 && rng() < 0.4) {
        var sx = sec.x0 + 90 + rng() * Math.max(30, (sec.x1 - sec.x0) - 200);
        place(STATIC_KINDS[Math.floor(rng() * STATIC_KINDS.length)], sx);
      }
      /* 巡逻猫（危险物版本）出现在平地段落 */
      if (sec.type === 'flat' && sec.x0 > 0 && L.n >= 3 && rng() < 0.35) {
        var cx = sec.x0 + 80 + rng() * Math.max(30, (sec.x1 - sec.x0) - 200);
        place('cat', cx);
      }
    }
    /* 终点前 220px 内不得有伤害性机关 */
    var safeX = L.goalX - 220;
    out = out.filter(function (h) { return h.x + h.w <= safeX; });
    /* 保底：每关至少 2 个伤害性机关（静态类，低关也可能有尖刺/栅栏） */
    var dmg = out.filter(function (h) { return h.kind !== 'pit'; });
    if (dmg.length < 2) {
      var need = 2 - dmg.length;
      for (var t = 0; t < need; t++) {
        var fx = 420 + t * 260 + Math.floor(rng() * 120);
        if (fx > safeX - 60) fx = safeX - 60 - (need - t) * 40;
        if (fx < 380) continue;
        out.push(makeHazard(STATIC_KINDS[t % STATIC_KINDS.length], fx, L.groundY, rng));
      }
    }
    return out;
  }

  /* ---- 道具布点 ---- */
  function genItemPlacements(level, runSeed, solids, layout) {
    var L = layout || genLayout(level, runSeed);
    var rng = mulberry32(hash32(L.n, (runSeed ^ 0x5bf03635) >>> 0));
    var picks = [];
    var i, x, pos;

    function surfaceY(xx) {
      var best = null;
      for (var k = 0; k < solids.length; k++) {
        var s = solids[k];
        if (s.kind === 'ground') {
          if (xx >= s.x - 2 && xx <= s.x + s.w + 2) best = s.y;
        } else if (isPlatKind(s.kind)) {
          if (xx >= s.x && xx <= s.x + s.w) {
            if (best === null || s.y < best) best = s.y;
          }
        }
      }
      return best;
    }
    function place(xx) {
      var roll = rng();
      if (roll < 0.34) {
        // 放在平台上
        var cands = [];
        for (var k = 0; k < solids.length; k++) {
          var s = solids[k];
          if (isPlatKind(s.kind) && xx >= s.x - 30 && xx <= s.x + s.w + 30) cands.push(s);
        }
        if (cands.length) {
          var s2 = cands[Math.floor(rng() * cands.length)];
          return { x: clamp(xx, s2.x + 12, s2.x + s2.w - 12), y: s2.y - 22 };
        }
      }
      if (roll < 0.62) {
        // 空中
        return { x: xx, y: L.groundY - 70 - rng() * 55 };
      }
      // 地面
      return { x: xx, y: L.groundY - 22 };
    }

    /* ---- 收集类：奶酪 / 金币 ----
       按关卡目标数分层均匀铺开（带抖动，避免扎堆也避免过密）。
       旧版每关额外撒 (len/300) 个随机道具，密集处一个道具只隔 0.3 秒，
       既刷屏又抢跑酷节奏；现在总量固定、间距可控。 */
    var target = levelTargets(L.n).cheese;
    // 奶酪数必须 ≥ 星级目标（留 3 个余量），否则高关卡拿不到二星
    var cheeseN = Math.min(target + 3, 32);
    var coinN = Math.min(4 + Math.floor(L.n / 4), 10);

    /* ---- 能力道具：23 种（除奶酪/金币外），每关 5 种 ----
       取池子里的「连续 5 个」窗口，窗口起点按关卡步进 5（23 与 5 互质）：
       第 1~5 关恰好覆盖全部 23 种，第 6 关起窗口继续轮转、不会重复扎堆。 */
    var powerPool = ITEM_IDS.filter(function (id) { return id !== 'cheese' && id !== 'coin'; });
    var powerIds = [];
    var pStart = ((L.n - 1) * 5) % powerPool.length;
    for (i = 0; i < 5; i++) {
      powerIds.push(powerPool[(pStart + i) % powerPool.length]);
    }

    function layOut(ids, from, to) {
      if (!ids.length) return;
      var span = Math.max(120, to - from);
      var gap = span / ids.length;
      for (var j = 0; j < ids.length; j++) {
        var base = from + (j + 0.5) * gap;
        var jit = (rng() - 0.5) * gap * 0.35;   // 抖动控制在 35% 以内，保证不扎堆
        x = clamp(base + jit, from + 30, to - 30);
        pos = place(x);
        picks.push({ x: Math.round(pos.x), y: Math.round(pos.y), id: ids[j], r: 16, type: 'pickup' });
      }
    }

    /* 收集类与能力道具交错排布（避免奶酪/金币连成一片、也避免能力道具扎堆） */
    var mixed = [];
    var ci = 0, oi = 0;
    var coll = [];
    for (i = 0; i < cheeseN; i++) coll.push('cheese');
    for (i = 0; i < coinN; i++) coll.push('coin');
    while (ci < coll.length || oi < powerIds.length) {
      if (ci < coll.length) mixed.push(coll[ci++]);
      if (oi < powerIds.length) mixed.push(powerIds[oi++]);
    }
    layOut(mixed, 170, L.len - 200);

    /* 最小间距整理：不同分组万一仍挨太近，强制拉开 */
    picks.sort(function (a, b) { return a.x - b.x; });
    var MIN_GAP = 70;
    for (i = 1; i < picks.length; i++) {
      var minX = picks[i - 1].x + MIN_GAP;
      if (picks[i].x < minX) picks[i].x = Math.round(minX);
    }
    return picks;
  }

  /* ---- 对外：生成一整关 ---- */
  function genLevel(level, runSeed) {
    var L = genLayout(level, runSeed);
    var n = L.n;
    return {
      level: n,
      seed: L.seed,
      biome: L.biome,
      length: L.len,
      groundY: L.groundY,
      diff: L.diff,
      solids: L.solids,
      hazards: L.hazards.concat(genHazardPlacements(n, runSeed, L.solids, L)),
      pickups: genItemPlacements(n, runSeed, L.solids, L),
      enemies: genEnemyPlacements(n, runSeed, L.solids, L),
      checkpoints: L.sections.map(function (s) { return s.x0; }),
      goalX: L.goalX,
      sections: L.sections,
      targetCheese: L.targetCheese,
      spawn: { x: 90, y: L.groundY - 60 },
      enemySpeedK: L.enemySpeedK,
      densityK: L.densityK,
      rarityWeight: L.rarityWeight
    };
  }

  /* ======================================================================
   * 十、玩家 / 局内数据
   * ==================================================================== */
  var PLAYER_FIELDS = [
    /* —— 契约 §2.1.1 字段 —— */
    'x', 'y', 'vx', 'vy', 'w', 'h', 'dir',
    'onGround', 'wasOnGround', 'jumpsLeft', 'coyote', 'jumpBuf', 'jumpHeld',
    'dashT', 'dashCd', 'dashDir', 'sliding', 'slideT',
    'stamina', 'hp', 'invuln', 'hurtT', 'dead', 'deadT',
    'buffs', 'stylePts', 'styleLevel', 'styleCombo', 'styleTimer',
    'combo', 'comboTimer', 'energy',
    'lives', 'maxLives', 'hasBell', 'bellUsed',
    'coins', 'cheese', 'gems', 'score',
    'level', 'checkpointX', 'spawnX', 'spawnY',
    'airTime', 'airComboScore', 'lastLandVy', 'groundedTime', 'runT', 'animT',
    'megaReady', 'megaActive',
    /* —— 本模块新增字段 —— */
    'input', 'permanentBubbles', 'rocketAmmo', 'shieldCharges',
    'crumbleStand', 'standId', 'jumpCut', 'deadReason', 'grazeCd'
  ];

  function createPlayer(x, y) {
    x = x || 0; y = y || 0;
    return {
      x: x, y: y, vx: 0, vy: 0, w: PHYS.PLAYER_W, h: PHYS.PLAYER_H, dir: 1,
      onGround: false, wasOnGround: false, jumpsLeft: 0, coyote: 0, jumpBuf: 0, jumpHeld: false,
      dashT: 0, dashCd: 0, dashDir: 1, sliding: false, slideT: 0,
      stamina: PHYS.STAMINA_MAX, hp: PHYS.MAX_HP, invuln: 0, hurtT: 0, dead: false, deadT: 0,
      buffs: {}, stylePts: 0, styleLevel: 'D', styleCombo: 0, styleTimer: 0,
      combo: 0, comboTimer: 0, energy: 0,
      lives: 3, maxLives: 5, hasBell: false, bellUsed: false,
      coins: 0, cheese: 0, gems: 0, score: 0,
      level: 1, checkpointX: x, spawnX: x, spawnY: y,
      airTime: 0, airComboScore: 0, lastLandVy: 0, groundedTime: 0, runT: 0, animT: 0,
      megaReady: false, megaActive: false,
      /* 新增字段 */
      input: { axis: 0, left: false, right: false, up: false, down: false, jump: false, dash: false, slide: false, jumpPressed: false, dashPressed: false, slidePressed: false },
      permanentBubbles: false, rocketAmmo: 0, shieldCharges: 0,
      crumbleStand: null, standId: null, jumpCut: false, deadReason: '', grazeCd: 0
    };
  }

  function createRun(runSeed) {
    var seed = (runSeed === undefined || runSeed === null)
      ? (Math.floor(Math.random() * 0x7fffffff) | 0)
      : (runSeed | 0);
    return {
      runSeed: seed, level: 1, score: 0, coin: 0, cheese: 0, energy: 0,
      lives: 3, maxLives: 5,
      combo: 0, comboTimer: 0, bestCombo: 0,
      style: 0, styleLevel: 'D', bestStyleLevel: 'D',
      kills: 0, items: 0, distance: 0, deaths: 0, damageTaken: 0,
      buffs: {}, checkpointX: 0, flawless: true, startT: 0, levelScore: 0
    };
  }

  /* ======================================================================
   * 十一、计分系统（契约 §1.7，6 套并存）
   * ==================================================================== */

  /* 分数：主积分（距离分 + 拾取分 + 风格分 + 击杀分 + 过关奖励）
   * 连击倍率按"本次得分前"的连击数计算：第 1 次拾取 ×1，之后逐级 ×1.1…×4（上限） */
  function addScore(g, base, kind) {
    if (!g) return 0;
    base = Math.round(base || 0);
    var mul = comboMultiplier(g.combo);
    if (kind === 'pickup' || kind === 'kill') {
      g.combo = (g.combo || 0) + 1;
      g.comboTimer = PHYS.COMBO_TIME;
      if (g.bestCombo == null || g.combo > g.bestCombo) g.bestCombo = g.combo;
    }
    var clover = (g.buffs && g.buffs.clover > 0) ? 2 : 1;
    var gain = Math.round(base * mul * clover);
    g.score = (g.score || 0) + gain;
    if (kind === 'pickup') g.items = (g.items || 0) + 1;
    if (kind === 'kill') g.kills = (g.kills || 0) + 1;
    return gain;
  }

  /* 连击倍率：1 + min(combo, 30) * 0.1（上限 ×4） */
  function comboMultiplier(combo) {
    return 1 + Math.min(Math.max(0, combo || 0), PHYS.COMBO_MAX) * 0.1;
  }

  /* 连击计时衰减 */
  function comboTick(g, dt) {
    if (!g) return 0;
    if (g.comboTimer > 0) {
      g.comboTimer -= dt;
      if (g.comboTimer <= 0) { g.comboTimer = 0; g.combo = 0; }
    } else {
      g.combo = 0;
    }
    return g.combo;
  }

  /* 风格分：动作加分 + 等级判定 */
  function addStyle(p, g, kind, points) {
    if (!p) return { points: 0, level: p ? p.styleLevel : 'D', up: false, down: false, index: 0 };
    var base = (points !== undefined && points !== null) ? points : (STYLE_ACTIONS[kind] || 0);
    if (base <= 0) return { points: 0, level: p.styleLevel, up: false, down: false, index: styleIndexOf(p.styleLevel) };
    var before = styleIndexOf(p.styleLevel);
    p.stylePts = (p.stylePts || 0) + base;
    p.styleCombo = (p.styleCombo || 0) + 1;
    p.styleTimer = 0;
    var after = styleIndexOf(styleLevelOf(p.stylePts));
    p.styleLevel = STYLE_LEVELS[after];
    if (g) {
      g.style = p.stylePts;
      g.styleLevel = p.styleLevel;
      if (styleIndexOf(g.bestStyleLevel || 'D') < after) g.bestStyleLevel = STYLE_LEVELS[after];
    }
    return { points: base, level: p.styleLevel, up: after > before, down: after < before, index: after };
  }

  /* 风格衰减（每秒 8%）+ 等级升降 */
  function styleTick(p, g, dt) {
    if (!p) return { level: 'D', down: false, up: false, points: 0 };
    dt = dt || 0;
    if (dt > 0 && p.stylePts > 0) {
      p.stylePts = p.stylePts * Math.pow(PHYS.STYLE_DECAY, dt);
    }
    p.styleTimer = (p.styleTimer || 0) + dt;
    if (p.styleTimer > 3 && p.styleCombo > 0) p.styleCombo = 0;
    var before = styleIndexOf(p.styleLevel);
    var after = styleIndexOf(styleLevelOf(p.stylePts));
    p.styleLevel = STYLE_LEVELS[after];
    if (g) { g.style = p.stylePts; g.styleLevel = p.styleLevel; }
    return { level: p.styleLevel, down: after < before, up: after > before, points: p.stylePts };
  }

  /* 过关结算：基础 800*n + 无伤 1500 + 奶酪 80/个 + 剩余命 600/条 */
  function scoreLevelClear(g, level, stats) {
    stats = stats || {};
    var n = Math.max(1, Math.floor(level) || 1);
    var base = 800 * n;
    var flawless = stats.flawless ? 1500 : 0;
    var cheeseCount = stats.cheese !== undefined && stats.cheese !== null
      ? stats.cheese : (g ? (g.cheese || 0) : 0);
    var cheese = 80 * cheeseCount;
    var lives = 600 * Math.max(0, stats.lives !== undefined && stats.lives !== null
      ? stats.lives : (g ? (g.lives || 0) : 0));
    var total = base + flawless + cheese + lives;
    var target = levelTargets(n).cheese;
    var stars = 1;
    if (cheeseCount >= target) stars = 2;
    if (stats.flawless && cheeseCount >= target) stars = 3;
    return {
      base: base, flawless: flawless, cheese: cheese, lives: lives,
      total: total, stars: stars, cheeseCount: cheeseCount, target: target
    };
  }

  /* 关卡目标：奶酪 target = 6 + floor(n/2) */
  function levelTargets(level) {
    var n = Math.max(1, Math.floor(level) || 1);
    /* 关卡长度在 9600 单位封顶，奶酪目标同步封顶（否则超高关卡永远拿不到二星） */
    return { cheese: Math.min(6 + Math.floor(n / 2), 28) };
  }

  /* ======================================================================
   * 十二、道具效果
   * ==================================================================== */
  function applyItem(p, g, itemId) {
    var item = ITEMS[itemId];
    if (!item) return { text: '未知道具', color: RARITY_COLOR[1] };
    g = g || {};
    g.buffs = g.buffs || {};
    if (!p.buffs) p.buffs = {};
    item.effect(p, g);
    /* 能量：拾取普通道具 +2（energy 道具自身已 +40） */
    if (itemId !== 'energy') {
      g.energy = Math.min(PHYS.STAMINA_MAX, (g.energy || 0) + PHYS.ENERGY_PICKUP);
      p.energy = Math.min(PHYS.STAMINA_MAX, (p.energy || 0) + PHYS.ENERGY_PICKUP);
    }
    var color = RARITY_COLOR[item.rarity] || RARITY_COLOR[1];
    return { text: item.name + '！' + item.desc, color: color, item: itemId };
  }

  /* ======================================================================
   * 十三、物理推进（纯逻辑，world 只读）
   * ==================================================================== */
  function normalizeInput(src) {
    var inp = {
      axis: 0, left: false, right: false, up: false, down: false,
      jump: false, dash: false, slide: false,
      jumpPressed: false, dashPressed: false, slidePressed: false
    };
    if (!src || typeof src !== 'object') return inp;
    function pick(a, b) {
      if (src[a] !== undefined) return src[a];
      if (b !== undefined && src[b] !== undefined) return src[b];
      return undefined;
    }
    var left = !!pick('left', 'moveLeft');
    var right = !!pick('right', 'moveRight');
    var axis = pick('axis', 'moveAxis');
    inp.left = left; inp.right = right;
    if (typeof axis === 'number' && axis !== 0) inp.axis = axis > 0 ? 1 : -1;
    else inp.axis = right ? 1 : (left ? -1 : 0);
    inp.up = !!pick('up', 'moveUp');
    inp.down = !!pick('down', 'moveDown');
    inp.jump = !!(pick('jump', 'jumpHeld') || pick('jumpKey', undefined));
    inp.dash = !!(pick('dash', 'dashHeld'));
    inp.slide = !!(pick('slide', 'slideHeld'));
    inp.jumpPressed = !!(pick('jumpPressed', 'jumpDown') || pick('jumpJust', 'jumpEdge'));
    inp.dashPressed = !!(pick('dashPressed', 'dashDown') || pick('dashJust', 'dashEdge'));
    inp.slidePressed = !!(pick('slidePressed', 'slideDown') || pick('slideJust', 'slideEdge'));
    if (src.pressed) {
      inp.jumpPressed = inp.jumpPressed || !!src.pressed.jump;
      inp.dashPressed = inp.dashPressed || !!src.pressed.dash;
      inp.slidePressed = inp.slidePressed || !!src.pressed.slide;
    }
    return inp;
  }

  /* 移动平台当前位置（确定性：与 t 有关） */
  function moverPos(m, t) {
    if (!m || m.kind !== 'mover') return { x: m ? m.x : 0, y: m ? m.y : 0 };
    var x = m.x, y = m.y;
    var range = m.range || 0;
    if (m.vx) {
      var kx = Math.abs(m.vx) / Math.max(range, 1);
      x = m.x + Math.sin(t * kx + (m.phase || 0)) * range * (m.vx < 0 ? -1 : 1);
    }
    if (m.vy) {
      var ky = Math.abs(m.vy) / Math.max(range, 1);
      y = m.y + Math.sin(t * ky + (m.phase || 0) * 1.7) * range * (m.vy < 0 ? -1 : 1);
    }
    return { x: x, y: y };
  }

  function solidXY(s, t) {
    if (s.kind === 'mover') return moverPos(s, t);
    return { x: s.x, y: s.y };
  }

  function stepPhysics(p, dt, world) {
    if (!p) return { p: p, events: [] };
    world = world || {};
    var solids = world.solids || [];
    var hazards = world.hazards || [];
    var enemies = world.enemies || [];
    var level = world.level;
    var g = world.g || null;
    var groundY = PHYS.GROUND_Y;
    if (level && typeof level === 'object' && typeof level.groundY === 'number') groundY = level.groundY;

    var events = [];
    dt = clamp(dt || 0, 0, 1 / 20);   // 防止大 dt 穿透

    var inp = normalizeInput(p.input || p.keys || p.cmd || world.input);
    var buffs = p.buffs || (p.buffs = {});
    var i, s, pos, other;

    function has(id) { return buffs[id] > 0; }
    function canBreak() {
      return has('giant') || has('star') || has('drill') || (p.rocketAmmo || 0) > 0;
    }

    if (p.dead) {
      p.deadT += dt;
      return { p: p, events: events };
    }

    /* 本帧开始时是否站在地上（用于落地判定与跳跃次数结算） */
    var groundedAtStart = p.onGround;

    /* ---------- 计时器 ---------- */
    p.runT += dt;
    p.animT += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.grazeCd > 0) p.grazeCd -= dt;
    for (var bid in buffs) {
      if (!TIMED_BUFFS[bid]) continue;
      buffs[bid] -= dt;
      if (buffs[bid] <= 0) delete buffs[bid];
    }

    /* ---------- buff 派生系数 ---------- */
    var speedMul = 1;
    if (has('catnip')) speedMul *= 1.3;
    if (has('sneakers')) speedMul *= 1.15;
    var jumpMul = 1;
    if (has('sneakers')) jumpMul *= 1.25;
    if (has('boots')) jumpMul *= 1.6;
    var gravMul = 1;
    if (has('feather') && !p.onGround) gravMul *= 0.4;
    var gravSign = has('gravity') ? -1 : 1;
    var sizeMul = 1;
    if (has('giant')) sizeMul *= 1.6;
    if (has('mini')) sizeMul *= 0.65;

    /* ---------- 体型（碰撞盒）---------- */
    function applySize(sliding) {
      var nw = Math.round((sliding ? PHYS.SLIDE_W : PHYS.PLAYER_W) * sizeMul);
      var nh = Math.round((sliding ? PHYS.SLIDE_H : PHYS.PLAYER_H) * sizeMul);
      if (nh !== p.h) { p.y += (p.h - nh); p.h = nh; }
      p.w = nw;
    }
    applySize(p.sliding);

    /* ---------- 体力 ---------- */
    var moving = Math.abs(p.vx) > 30 || Math.abs(inp.axis) > 0.1;
    if (p.dashT <= 0) {
      if (p.onGround && moving) p.stamina = Math.max(0, p.stamina - PHYS.STAMINA_RUN * dt);
      else if (p.onGround) p.stamina = Math.min(PHYS.STAMINA_MAX, p.stamina + PHYS.STAMINA_REGEN * dt);
    }

    /* ---------- 跳跃缓冲 / coyote ---------- */
    if (inp.jumpPressed) p.jumpBuf = PHYS.JUMP_BUFFER;
    else if (p.jumpBuf > 0) p.jumpBuf -= dt;
    if (p.onGround) p.coyote = PHYS.COYOTE_TIME;
    else if (p.coyote > 0) p.coyote -= dt;
    p.jumpHeld = !!inp.jump;

    /* ---------- 冲刺 / 火箭 ---------- */
    if (inp.dashPressed && p.dashCd <= 0 && p.dashT <= 0) {
      var ddir = inp.axis !== 0 ? (inp.axis > 0 ? 1 : -1) : p.dir;
      if ((p.rocketAmmo || 0) > 0) {
        p.rocketAmmo--;
        p.dashT = 0.42; p.dashCd = PHYS.DASH_CD + 0.2; p.dashDir = ddir;
        p.vx = ddir * PHYS.DASH_SPEED * 1.25; p.vy = 0;
        p.stamina = Math.max(0, p.stamina - PHYS.DASH_COST);
        p.sliding = false; p.slideT = 0;
        events.push({ type: 'rocket', x: p.x, y: p.y, dir: ddir });
        addStyle(p, g, 'dash');
      } else if (p.stamina >= PHYS.DASH_COST) {
        p.dashT = PHYS.DASH_TIME; p.dashCd = PHYS.DASH_CD; p.dashDir = ddir;
        p.vx = ddir * PHYS.DASH_SPEED; p.vy = 0;
        p.stamina -= PHYS.DASH_COST;
        p.sliding = false; p.slideT = 0;
        events.push({ type: 'dash', x: p.x, y: p.y, dir: ddir, styleKind: 'dash', stylePts: STYLE_ACTIONS.dash });
        addStyle(p, g, 'dash');
      }
    }
    if (p.dashT > 0) { p.dashT -= dt; if (p.dashT < 0) p.dashT = 0; }

    /* ---------- 滑铲 ---------- */
    if (inp.slidePressed && p.onGround && p.dashT <= 0 && !p.sliding) {
      p.sliding = true; p.slideT = PHYS.SLIDE_TIME;
      applySize(true);
      var boost = PHYS.RUN_SPEED * PHYS.SLIDE_SPEED_MUL;
      p.vx = p.dir * Math.max(Math.abs(p.vx), boost);
      events.push({ type: 'slide', x: p.x, y: p.y, styleKind: 'slide', stylePts: STYLE_ACTIONS.slide });
      addStyle(p, g, 'slide');
    }
    if (p.sliding) {
      p.slideT -= dt;
      if (p.slideT <= 0 || !p.onGround) { p.sliding = false; p.slideT = 0; applySize(false); }
    }

    /* ---------- 跳跃 ---------- */
    var maxJumps = p.permanentBubbles ? 2 : 1;
    if (p.jumpBuf > 0) {
      if (p.onGround || p.coyote > 0) {
        p.vy = -PHYS.JUMP_V * jumpMul;
        p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
        p.jumpsLeft = maxJumps - 1;
        p.jumpCut = false; p.standId = null;
        events.push({ type: 'jump', x: p.x, y: p.y, v: p.vy });
      } else if (p.jumpsLeft > 0) {
        p.vy = -PHYS.DOUBLE_JUMP_V * jumpMul;
        p.jumpsLeft--;
        p.jumpBuf = 0;
        p.jumpCut = false;
        events.push({ type: 'djump', x: p.x, y: p.y, v: p.vy, styleKind: 'djump', stylePts: STYLE_ACTIONS.djump });
        addStyle(p, g, 'djump');
      }
    }
    /* 可变跳跃高度：松手时 vy *= JUMP_CUT（每次跳跃只做一次） */
    if (!p.jumpHeld && p.vy < 0 && !p.jumpCut) { p.vy *= PHYS.JUMP_CUT; p.jumpCut = true; }

    /* ---------- 水平移动 ---------- */
    var maxSpeed = PHYS.RUN_SPEED * speedMul;
    if (p.sliding) maxSpeed = PHYS.RUN_SPEED * PHYS.SLIDE_SPEED_MUL * speedMul;
    if (p.dashT > 0) {
      p.vx = p.dashDir * (p.rocketAmmo === undefined ? PHYS.DASH_SPEED : PHYS.DASH_SPEED);
    } else {
      var accel = p.onGround ? PHYS.RUN_ACCEL : PHYS.AIR_ACCEL;
      var fric = p.onGround ? PHYS.RUN_FRICTION : PHYS.AIR_FRICTION;
      if (inp.axis !== 0) {
        p.vx += inp.axis * accel * dt;
        if (p.vx > maxSpeed) p.vx = maxSpeed;
        if (p.vx < -maxSpeed) p.vx = -maxSpeed;
        p.dir = inp.axis > 0 ? 1 : -1;
      } else {
        var sgn = p.vx > 0 ? 1 : (p.vx < 0 ? -1 : 0);
        if (sgn !== 0) {
          p.vx -= sgn * fric * dt;
          if ((sgn > 0 && p.vx < 0) || (sgn < 0 && p.vx > 0)) p.vx = 0;
        }
      }
    }

    /* ---------- 重力 ---------- */
    if (p.dashT > 0) {
      p.vy = 0;
    } else {
      p.vy += PHYS.GRAVITY * gravMul * gravSign * dt;
      if (gravSign > 0 && p.vy > PHYS.MAX_FALL) p.vy = PHYS.MAX_FALL;
      if (gravSign < 0 && p.vy < -PHYS.MAX_FALL) p.vy = -PHYS.MAX_FALL;
    }

    /* ---------- 移动平台跟随 ---------- */
    if (p.standId != null) {
      for (i = 0; i < solids.length; i++) {
        if (solids[i].id !== p.standId) continue;
        var m0 = moverPos(solids[i], p.runT - dt);
        var m1 = moverPos(solids[i], p.runT);
        p.x += (m1.x - m0.x);
        p.y += (m1.y - m0.y);
        break;
      }
    }

    /* ---------- X 轴碰撞（分轴 AABB 扫掠）---------- */
    p.x += p.vx * dt;
    for (i = 0; i < solids.length; i++) {
      s = solids[i];
      if (isPassKind(s.kind)) continue;   // 单向平台不阻挡横向移动
      pos = solidXY(s, p.runT);
      if (p.x + p.w <= pos.x || p.x >= pos.x + s.w) continue;
      if (p.y + p.h <= pos.y + 1) continue;   // 玩家在实体上方
      if (pos.y + s.h <= p.y + 1) continue;   // 实体在玩家上方
      if (s.kind === 'brick' && s.breakable && canBreak() && p.dashT > 0) {
        events.push({ type: 'break', x: pos.x, y: pos.y, w: s.w, h: s.h, kind: 'brick', id: s.id, hp: s.hp });
        continue;
      }
      if (p.vx > 0) p.x = pos.x - p.w;
      else if (p.vx < 0) p.x = pos.x + s.w;
      p.vx = 0;
    }

    /* ---------- Y 轴碰撞 ---------- */
    var prevTop = p.y;
    var prevBottom = p.y + p.h;
    var fallVy = p.vy;
    p.y += p.vy * dt;
    p.onGround = false;
    p.standId = null;
    var landed = false, landSolid = null;

    for (i = 0; i < solids.length; i++) {
      s = solids[i];
      pos = solidXY(s, p.runT);
      if (p.x + p.w <= pos.x + 1 || p.x >= pos.x + s.w - 1) continue;
      if (p.y + p.h <= pos.y || p.y >= pos.y + s.h) continue;

      if (s.kind === 'oneway' || s.kind === 'mover') {
        if (p.vy <= 0) continue;                    // 向上穿过
        if (prevBottom > pos.y + 4) continue;       // 从下方进入
        p.y = pos.y - p.h; p.vy = 0; p.onGround = true; p.standId = s.id;
        landed = true; landSolid = s;
        continue;
      }
      if (s.kind === 'spring') {
        if (p.vy <= 0) { p.y = pos.y + s.h; p.vy = 0; continue; }
        if (prevBottom > pos.y + 4) { p.y = pos.y - p.h; p.vy = 0; continue; }
        p.y = pos.y - p.h; p.vy = -PHYS.SPRING_V;
        p.onGround = false; p.standId = null; p.jumpCut = false;
        events.push({ type: 'spring', x: p.x, y: p.y });
        continue;
      }
      if (s.kind === 'crumble') {
        if (p.vy > 0 && prevBottom <= pos.y + 4) {
          p.y = pos.y - p.h; p.vy = 0; p.onGround = true; p.standId = s.id;
          landed = true; landSolid = s;
          if (p.crumbleStand !== s.id) {
            p.crumbleStand = s.id;
            events.push({ type: 'break', x: pos.x, y: pos.y, w: s.w, h: s.h, kind: 'crumble', id: s.id, hp: s.hp });
          }
        }
        continue;
      }
      if (p.vy > 0) {
        p.y = pos.y - p.h; p.vy = 0; p.onGround = true; p.standId = s.id;
        landed = true; landSolid = s;
      } else if (p.vy < 0) {
        // 只有"确实从下方撞上去"才顶头，避免把已重叠的玩家瞬移
        if (prevTop < pos.y + s.h) { p.y = pos.y + s.h; p.vy = 0; }
      }
    }

    /* 反重力时的"天花板"虚拟平面 */
    if (gravSign < 0) {
      var ceilY = groundY - 320;
      if (p.y < ceilY) { p.y = ceilY; p.vy = 0; p.onGround = true; }
    }

    /* ---------- 落地处理 ---------- */
    if (landed && !groundedAtStart) {
      p.lastLandVy = fallVy;
      var hard = fallVy > 1100;
      events.push({ type: 'land', x: p.x, y: p.y, vy: fallVy, hard: hard, solid: landSolid ? landSolid.id : null, styleKind: hard ? 'hardland' : null, stylePts: hard ? STYLE_ACTIONS.hardland : 0 });
      if (hard) addStyle(p, g, 'hardland');
    }
    /* 跳跃次数结算：落地补满、离地扣掉地面那一跳 */
    var maxJumpsNow = p.permanentBubbles ? 2 : 1;
    if (p.onGround && !groundedAtStart) {
      p.jumpsLeft = maxJumpsNow;
    } else if (!p.onGround && groundedAtStart) {
      p.jumpsLeft = maxJumpsNow - 1;
    }
    if (p.onGround) {
      p.airTime = 0;
      p.airComboScore = 0;
      p.groundedTime += dt;
      p.crumbleStand = null;
    } else {
      p.groundedTime = 0;
      p.airTime += dt;
      var want = Math.min(60, Math.floor(p.airTime / 0.5) * 10);
      if (want > p.airComboScore) {
        var d = want - p.airComboScore;
        p.airComboScore = want;
        addStyle(p, g, 'air', d);
      }
    }
    p.wasOnGround = groundedAtStart;

    /* ---------- 敌人碰撞（踩 / 受伤）---------- */
    for (i = 0; i < enemies.length; i++) {
      other = enemies[i];
      if (other.dead) continue;          // 已被消灭的尸体不再参与碰撞
      var eb = { x: other.x, y: other.y, w: other.w || 30, h: other.h || 28 };
      if (!aabb({ x: p.x, y: p.y, w: p.w, h: p.h }, eb)) continue;
      if (p.vy > 0 && prevBottom <= eb.y + 8) {
        events.push({ type: 'stomp', ei: i, kind: other.kind, x: eb.x + eb.w / 2, y: eb.y, hp: other.hp, styleKind: 'stomp', stylePts: STYLE_ACTIONS.stomp });
        p.vy = -PHYS.BOUNCE_V;
        p.jumpCut = false;
        p.onGround = false;
        p.standId = null;
        addStyle(p, g, 'stomp');
        continue;
      }
      hurt('enemy', eb);
    }

    /* ---------- 危险物碰撞 + 擦弹 ---------- */
    for (i = 0; i < hazards.length; i++) {
      other = hazards[i];
      if (other.dead) continue;          // 已被清除的机关不再参与碰撞
      if (other.kind === 'pit') continue;
      var hb = { x: other.x, y: other.y, w: other.w || 20, h: other.h || 20 };
      if (aabb({ x: p.x, y: p.y, w: p.w, h: p.h }, hb)) {
        hurt('hazard', hb);
      } else if (p.grazeCd <= 0) {
        var gapX = Math.max(hb.x - (p.x + p.w), p.x - (hb.x + hb.w));
        var gapY = Math.max(hb.y - (p.y + p.h), p.y - (hb.y + hb.h));
        var dist = Math.max(gapX, gapY);
        if (dist >= 0 && dist < PHYS.GRAZE_DIST) {
          p.grazeCd = 0.4;
          events.push({ type: 'graze', x: p.x, y: p.y, dist: dist, styleKind: 'graze', stylePts: STYLE_ACTIONS.graze });
          addStyle(p, g, 'graze');
        }
      }
    }

    /* ---------- 坠坑 ---------- */
    if (p.y > groundY + PHYS.DEATH_DROP) {
      if (p.hasBell && !p.bellUsed) {
        p.bellUsed = true;
        respawn(p, groundY);
        events.push({ type: 'bell', x: p.x, y: p.y, reason: 'pit' });
      } else {
        p.dead = true; p.deadReason = 'pit'; p.deadT = 0;
        events.push({ type: 'die', reason: 'pit', x: p.x, y: p.y });
      }
    }

    /* ---------- 同步局内数据 ---------- */
    if (g) {
      g.buffs = buffs;
      g.style = p.stylePts;
      g.styleLevel = p.styleLevel;
      p.combo = g.combo || 0;
      p.comboTimer = g.comboTimer || 0;
      p.energy = g.energy || 0;
    } else {
      if (p.comboTimer > 0) {
        p.comboTimer -= dt;
        if (p.comboTimer <= 0) { p.comboTimer = 0; p.combo = 0; }
      }
    }
    p.megaReady = p.energy >= PHYS.STAMINA_MAX;

    return { p: p, events: events };

    /* ---------- 内部：受伤 ---------- */
    function hurt(src, box) {
      if (p.invuln > 0 || p.dead) return false;
      if (has('star')) return false;                 // 无敌星
      if (p.shieldCharges > 0) {                    // 护盾抵挡
        p.shieldCharges--;
        buffs.shield = p.shieldCharges;
        p.invuln = 0.8;
        events.push({ type: 'hurt', blocked: true, src: src, x: p.x, y: p.y });
        return false;
      }
      if (p.hasBell && !p.bellUsed) {               // 复活铃铛
        p.bellUsed = true;
        p.invuln = 1.2;
        events.push({ type: 'hurt', saved: true, src: src, x: p.x, y: p.y });
        return false;
      }
      p.hp -= 1;
      p.invuln = 1.2;
      p.hurtT = 0.35;
      if (src === 'hazard') {
        p.lives -= 1;
        p.dead = true; p.deadReason = 'hazard'; p.deadT = 0;
        events.push({ type: 'hurt', fatal: true, src: src, x: p.x, y: p.y });
        events.push({ type: 'die', reason: 'hazard', x: p.x, y: p.y });
      } else {
        p.vx = -p.dir * 220;
        p.vy = -240;
        events.push({ type: 'hurt', fatal: false, src: src, x: p.x, y: p.y });
        if (p.hp <= 0) {
          p.hp = PHYS.MAX_HP;
          p.lives -= 1;
          p.dead = true; p.deadReason = 'hit'; p.deadT = 0;
          events.push({ type: 'die', reason: 'hit', x: p.x, y: p.y });
        }
      }
      return true;
    }

    /* ---------- 内部：从检查点复活 ---------- */
    function respawn(pp, gy) {
      pp.x = pp.checkpointX || 0;
      pp.y = gy - pp.h;
      pp.vx = 0; pp.vy = 0;
      pp.dead = false;
      pp.deadReason = '';
      pp.invuln = 1.0;
      pp.hp = PHYS.MAX_HP;
      pp.stamina = PHYS.STAMINA_MAX;
      pp.standId = null;
      pp.crumbleStand = null;
    }
  }

  /* 碰撞查询（只读）：返回与玩家重叠的危险物 / 敌人 / 实体 */
  function resolveCollisions(p, world) {
    world = world || {};
    var out = { hazards: [], enemies: [], solids: [] };
    if (!p) return out;
    var box = { x: p.x, y: p.y, w: p.w, h: p.h };
    var i, arr, o;
    arr = world.hazards || [];
    for (i = 0; i < arr.length; i++) {
      o = arr[i];
      if (aabb(box, { x: o.x, y: o.y, w: o.w || 20, h: o.h || 20 })) out.hazards.push(o);
    }
    arr = world.enemies || [];
    for (i = 0; i < arr.length; i++) {
      o = arr[i];
      if (aabb(box, { x: o.x, y: o.y, w: o.w || 30, h: o.h || 28 })) out.enemies.push(o);
    }
    arr = world.solids || [];
    for (i = 0; i < arr.length; i++) {
      o = arr[i];
      if (aabb(box, { x: o.x, y: o.y, w: o.w, h: o.h })) out.solids.push(o);
    }
    return out;
  }

  /* ======================================================================
   * 十四、导出
   * ==================================================================== */
  var api = {
    /* 常量与数据表 */
    PHYS: PHYS,
    BIOMES: BIOMES,
    ITEMS: ITEMS,
    ITEM_IDS: ITEM_IDS,
    ENEMIES: ENEMIES,
    HAZARDS: HAZARDS,
    BUFF_INFO: BUFF_INFO,
    RARITY_COLOR: RARITY_COLOR,
    STYLE_LEVELS: STYLE_LEVELS,
    STYLE_THRESHOLDS: STYLE_THRESHOLDS,
    STYLE_ACTIONS: STYLE_ACTIONS,
    PLAYER_FIELDS: PLAYER_FIELDS,

    /* 随机 */
    hash32: hash32,
    mulberry32: mulberry32,

    /* 关卡 */
    genLevel: genLevel,
    genItemPlacements: genItemPlacements,
    genEnemyPlacements: genEnemyPlacements,
    genHazardPlacements: genHazardPlacements,
    levelTargets: levelTargets,

    /* 玩家 */
    createPlayer: createPlayer,
    createRun: createRun,
    stepPhysics: stepPhysics,
    resolveCollisions: resolveCollisions,
    moverPos: moverPos,

    /* 道具与计分 */
    applyItem: applyItem,
    addStyle: addStyle,
    addScore: addScore,
    comboTick: comboTick,
    comboMultiplier: comboMultiplier,
    styleTick: styleTick,
    scoreLevelClear: scoreLevelClear,

    /* 工具 */
    aabb: aabb,
    clamp: clamp
  };

  return api;
});
