/* 捕鱼达人 · 配置常量（主线模块，勿在子模块修改） */
(function () {
  'use strict';
  window.FM = window.FM || {};
  window.FM.CONFIG = {
    startCoins: 600,
    shotCost: [1, 2, 3, 5, 8],
    netRadius: [2.2, 2.8, 3.4, 4.2, 5.2],
    fireCd: [0.32, 0.34, 0.36, 0.40, 0.44],
    comboWindow: 2.6,
    comboSteps: [0, 2, 4, 7, 11],
    comboMults: [1, 1.2, 1.5, 2, 3],
    bombMax: 100,
    bombPerCatch: 14,
    bombRadius: 12,
    netTravelSpeed: 30,
    netHoldTime: 0.42,
    maxFish: 34,
    spawnInterval: 0.72,
    species: {
      clown:  { key: 'clown',  name: '小丑鱼', color: 0xff7a3d, accent: 0xffffff, size: 0.55, speed: 2.4,  value: 2,   weight: 1,  rarity: 30, pattern: 'stripes' },
      tang:   { key: 'tang',   name: '蓝吊鱼', color: 0x2f9fe0, accent: 0xffd23f, size: 0.75, speed: 1.9,  value: 5,   weight: 2,  rarity: 22, pattern: 'solid' },
      gold:   { key: 'gold',   name: '金鱼',   color: 0xffc23f, accent: 0xff7a3d, size: 0.9,  speed: 1.4,  value: 10,  weight: 3,  rarity: 16, pattern: 'solid' },
      puffer: { key: 'puffer', name: '河豚',   color: 0xf2d06b, accent: 0x7a4a22, size: 1.1,  speed: 1.0,  value: 20,  weight: 5,  rarity: 10, pattern: 'spots' },
      sword:  { key: 'sword',  name: '旗鱼',   color: 0x63d6c8, accent: 0x1b6e78, size: 1.5,  speed: 3.1,  value: 50,  weight: 8,  rarity: 8,  pattern: 'sword' },
      angler: { key: 'angler', name: '灯笼鱼', color: 0x8f6fd0, accent: 0x8fffe0, size: 1.2,  speed: 1.3,  value: 100, weight: 12, rarity: 5,  pattern: 'glow' },
      whale:  { key: 'whale',  name: '座头鲸', color: 0x4a6fa5, accent: 0x9fd8ff, size: 3.4,  speed: 0.55, value: 500, weight: 25, rarity: 1,  pattern: 'whale' }
    }
  };
})();
