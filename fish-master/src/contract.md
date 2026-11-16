# 捕鱼达人 · DEEP SEA ANGLER — 模块契约

单文件 H5 Three.js 3D 捕鱼小游戏。开发期分模块文件，`build.py` 把 `src/*.js`
与 vendored Three.js（r170）内联进 `src/shell.html`，产出**零外部资源**的 `index.html`，
`file://` 可直接打开。所有模块挂 `window.FM`，禁止外部字体 / 图片 / 音频 / CDN。

## 美术方向（全项目统一，勿跑偏）

「深海生物发光 × 高级街机」。深海军蓝→青碧的水体渐变、自顶而下的丁达尔光束与焦散、
漂浮微粒与气泡；鱼群为**柔和低多边形 + 发光边缘**，主色是青蓝 / 珊瑚橙 / 金；
炮台为黄铜金 + 青绿能量核心。克制、通透、有光晕，拒绝俗气大红大绿。
字体：中文标题用衬线（`Songti SC, STSong, serif`），数字/正文用无衬线系统字体。

## 全局命名空间与加载顺序

`window.FM` 是唯一顶层命名空间。build.py 里 Three.js 先被包成 `const THREE`，
随后按顺序拼接模块：

```
logic.js → config.js → audio.js → fish-art.js → ui.js → scene.js → game.js → main.js
```

**每个模块必须自带 IIFE，禁止顶层裸 `const FM`**（同页拼接会重复声明）：

```js
(function () {
  'use strict';
  window.FM = window.FM || {};
  window.FM.AUDIO = (function () { /* ... */ return api; })();
})();
```

模块内部引用其他模块一律用 `window.FM.XXX`，不要依赖局部变量。

## 坐标与场景约定（主线）

- `THREE.PerspectiveCamera`，`fov=50`，位于 `(0,0,32)` 看向原点；可视高度在 z=0 处约 30 世界单位。
- 鱼在 XY 平面游动，z ∈ [-6, 6]；X 正方向为鱼头朝向；炮台在屏幕底部中央 `(0, -height/2+2, 2)`。
- 场景尺寸随视口自适应，`window.FM.Scene` 会提供 `bounds()` → `{left,right,top,bottom}`。
- 所有长度单位 = 世界单位；`dt` 单位秒。

## 规格锁死（勿改）

炮台功率 1~5 档；每发消耗金币 `[1,2,3,5,8]`；网半径 `[2.2,2.8,3.4,4.2,5.2]`；
发射冷却 `[0.32,0.34,0.36,0.40,0.44]` 秒；初始金币 600；连击窗口 2.6 秒；
连击倍率 `1,1.2,1.5,2,3`（streak 0/2/4/7/11+）；炸弹充能每捕获 +14，满 100 可放，
炸弹半径 12 世界单位。鱼种表见 `CONFIG` 节。

## CONFIG（主线 → src/config.js，勿动）

```js
window.FM.CONFIG = {
  startCoins: 600,
  shotCost:   [1,2,3,5,8],
  netRadius:  [2.2,2.8,3.4,4.2,5.2],
  fireCd:     [0.32,0.34,0.36,0.40,0.44],
  comboWindow: 2.6,
  comboSteps: [0,2,4,7,11],
  comboMults: [1,1.2,1.5,2,3],
  bombMax: 100, bombPerCatch: 14, bombRadius: 12,
  species: {
    clown:  { key:'clown',  name:'小丑鱼', color:0xff7a3d, accent:0xffffff, size:0.55, speed:2.4, value:2,   weight:1,  rarity:30, pattern:'stripes' },
    tang:   { key:'tang',   name:'蓝吊鱼', color:0x2f9fe0, accent:0xffd23f, size:0.75, speed:1.9, value:5,   weight:2,  rarity:22, pattern:'solid' },
    gold:   { key:'gold',   name:'金鱼',   color:0xffc23f, accent:0xff7a3d, size:0.9,  speed:1.4, value:10,  weight:3,  rarity:16, pattern:'solid' },
    puffer: { key:'puffer', name:'河豚',   color:0xf2d06b, accent:0x7a4a22, size:1.1,  speed:1.0, value:20,  weight:5,  rarity:10, pattern:'spots' },
    sword:  { key:'sword',  name:'旗鱼',   color:0x63d6c8, accent:0x1b6e78, size:1.5,  speed:3.1, value:50,  weight:8,  rarity:8,  pattern:'sword' },
    angler: { key:'angler', name:'灯笼鱼', color:0x8f6fd0, accent:0x8fffe0, size:1.2,  speed:1.3, value:100, weight:12, rarity:5,  pattern:'glow' },
    whale:  { key:'whale',  name:'座头鲸', color:0x4a6fa5, accent:0x9fd8ff, size:3.4,  speed:0.55,value:500, weight:25, rarity:1,  pattern:'whale' }
  }
};
```

## LOGIC（主线 → src/logic.js，纯函数，可 node 单测）

```js
window.FM.LOGIC = {
  clamp(v, lo, hi),
  pickSpecies(rng) -> key,                 // 按 CONFIG.species.rarity 加权；rng:()=>[0,1)
  catchChance(power, weight) -> number,    // power>=weight 时 1，否则 clamp(0.25+0.75*power/weight,0,0.95)
  resolveCatch(power, fish, rng) -> bool,
  comboMultiplier(streak) -> number,       // 按 comboSteps/comboMults 查表
  coinsFor(value, mult) -> int,            // Math.round(value*mult)
  bombCharge(cur) -> number                // min(bombMax, cur + bombPerCatch)
};
```

## AUDIO（子代理 A → src/audio.js）

纯 WebAudio 合成，零外部音频文件。必须实现：

```js
window.FM.AUDIO = {
  unlock(),                    // 幂等；首个用户手势 resume AudioContext
  play(name, opts),            // 单次音效，opts 可含 {volume=1, rate=1}
  startLoop(name), stopLoop(name), stopAllLoops(),
  setMuted(bool), isMuted(), setVolume(v),
  names: ['shoot','catch','coin','bomb','combo','click','start','levelup','ambient']
};
```

音效听感（时长 0.1~0.8s，除 ambient）：
- `shoot`：水下闷响 + 气泡上浮，轻快不刺耳
- `catch`：清脆水润的三音上行铃音
- `coin`：短促高频金属叮
- `bomb`：低频轰鸣 + 噪声扫频
- `combo`：明亮上行闪光音
- `click`：UI 轻点
- `start`：柔和上行铺底
- `levelup`：庆祝式小琶音
- `ambient`：循环型，极轻的水下 drone + 偶发气泡，音量默认很低（0.12）

工程要求：AudioContext 惰性创建；`unlock()` 幂等；循环注册表 stop 干净；节点用完
stop+disconnect；`document.visibilitychange` 时暂停/恢复 ambient；静音开关真实生效。

## ART（子代理 B → src/fish-art.js）

用 Three.js 程序化建模，零贴图文件。必须实现：

```js
window.FM.ART = {
  createFish(typeKey) -> THREE.Group,
  disposeFish(group),
  glowTexture() -> THREE.CanvasTexture   // 径向渐变白色辉光，供炮口/灯笼鱼/ coin 复用
};
```

`createFish(typeKey)`：
- 读取 `window.FM.CONFIG.species[typeKey]` 取 color/accent/size/pattern；
- 返回 `THREE.Group`，**鱼头朝 +X**，整体尺寸按 `size` 缩放（基准体长约 2 世界单位）；
- `group.userData.animate = function(t, speedFactor)`：摆尾 / 鳍扇动 / 发光脉动（`t` 秒）；
- 材质用 `MeshStandardMaterial`（柔和光照、轻微 emissive 提亮），可加发光边缘（稍大的
  背面壳或 emissive 描边），**不要用外部贴图**；
- 细节按 pattern：
  - `stripes`（小丑鱼）白色竖纹 2~3 道
  - `solid`（蓝吊/金鱼）干净流线 + 尾鳍
  - `spots`（河豚）圆胖身 + 深色斑点 + 小刺
  - `sword`（旗鱼）长吻 + 高背鳍，流线型
  - `glow`（灯笼鱼）头部发光小球 + 细长钓竿，emissive 青绿
  - `whale`（座头鲸）庞大身躯 + 巨大尾叶 + 胸鳍，温和蓝
- 眼睛：深色小球 + 白色高光点；
- 几何/材质尽量按 typeKey 缓存复用；每条鱼拥有独立 group；`disposeFish` 释放独占资源。

## UI（子代理 C → src/shell.html + src/style.css + src/ui.js）

HUD / 弹层 / 样式全部由你负责。必须实现：

```js
window.FM.UI = {
  init(handlers) -> void,
  // handlers = { onPower(p), onBomb(), onMute(muted), onPause(paused),
  //              onStart(), onRestart(), onHelp(open) }
  setCoins(n), setScore(n), setCombo(n), setPower(p), setBombCharge(v01),
  showCatch(text, sub), showToast(text),
  showStart(visible), showPause(visible), showHelp(visible), showResult(data),
  setFishCount(n), setFps(n), update()
};
```

DOM 骨架 id（shell.html 必须包含，主线靠这些 id 与 canvas-host）：

```
#app
  #canvas-host              ← 主线把 three renderer.domElement 插这里（position:absolute 全屏）
  #hud                      ← pointer-events:none，内部可交互元素单独 auto
    .brand  (标题 捕鱼达人 / DEEP SEA ANGLER)
    #coins #score            ← 数字
    #combo                   ← 连击徽章
    #fish-count              ← 场中鱼数
    #power-bar               ← 5 个按钮 [data-power="1..5"]，显示档位与每发消耗
    #bomb-btn  #bomb-fill     ← 炸弹按钮 + 充能填充
    #mute-btn #pause-btn #help-btn
    #hint                    ← 底部操作提示
  #catch-pop                 ← 捕获飘字容器
  #toast
  #start-overlay  #start-btn
  #pause-overlay  #resume-btn #restart-btn
  #help-overlay   #help-close
  #result-overlay #result-title #result-body #again-btn
  <!-- MODULE_SCRIPTS -->    ← build.py 替换点（放在所有 script 之前或之后均可，但唯一）
```

要求：
- `#hud` 及弹层不挡 canvas 点击（除按钮/面板本身），`pointer-events` 精确控制；
- 响应式：桌面 + 手机竖屏 390×844 + 横屏 844×390，按钮 ≥44px，safe-area，禁止滚动；
- 视觉按上面「美术方向」：深海玻璃拟态 HUD、金色数字、青绿高亮、衬线标题、细边框；
- `showCatch` 用 WAAPI/CSS 动画飘字+淡出，自动移除；`showToast` 同理；
- 不引用任何外部字体/图片/脚本；图标用内联 SVG 或纯 CSS。

## 主线负责（勿动他人模块）

`config.js` / `logic.js` / `scene.js` / `game.js` / `main.js` / `build.py` / `README.md` /
`test/` / 根 README 与 index.html 登记 / ego-browser 回归验收 / 集成修复。
