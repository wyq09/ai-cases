# gravity-pinball 重力弹球王 · 复刻契约（唯一事实源，勿改）

1:1 复刻「重力弹球王」：白色小球从顶部黑色漩涡漏斗落入封闭球场，受重力弹跳，撞击带数字的彩色 bumper 使数字减 1、减到 0 爆炸得分；清空全场 bumper 进入下一关（无限关卡）。单文件 H5，手机竖屏可玩。

## 0. 参考图（动手前必 Read）

- 原图：`/Users/yiqunwu/.zcode/cli/image-cache/sess_28db7643-7fdc-41ed-b0fe-5b8c64c35fab/image-de3151744386bd33da7c04bad8f6c56b.png`（698×1252，部分白色块是用户打码，勿复刻打码块）
- 裁片（本项目 ref/ 下，均已放大）：`top-hud.png`（HUD+漏斗+漩涡）、`funnel-vortex.png`（杯口+漩涡 3x）、`bumpers-row.png`（bumper 样式）、`bottom-bar.png`（收球/加球/炸弹/沙漏槽）、`mountains.png`（山丘剪影）、`balls.png`（球的样子）
- 玩法调研：`ref/rules-spec.md`（若有，标「推测」的以本契约为准）

## 1. 游戏规格（锁死）

- **掉球**：球从顶部中央漩涡下方杯口自动落入（间隔 cfg.dropInterval），球数 HUD「N球」递减
- **bumper**：球撞一次数字 −1（同一球对同一 bumper 有 150ms 冷却），减到 0 → 爆炸消失 +粒子 +浮分
- **计分**：普通撞 +1 分；消除 = 初始数字 ×5（消除时大数字更爽）；菱形倍率 ×2、大白球倍率 ×3（撞分与消除分都乘）
- **漩涡回收**：球弹起穿过杯口触及漩涡核心 → 被吸走（jackpot）：+15 分且 +3 球（HUD 播放回收动画）
- **收球**：点「收球」按钮，场上静止/低速球（speed<60）飞回 HUD 变回球数
- **加球**：粉色按钮 +10 球，花分数（价格 100 起，每次 +50，换关重置）；分不够时按钮变「领取+5」（30s 冷却免费）
- **炸弹道具**（左下玻璃罩槽，带数量角标）：点选后下一颗落入的球变为炸弹球，首次碰撞爆炸：半径 130 内 bumper −6、推开球、震屏；初始 2 个，每过一关 +1（上限 5）
- **沙漏道具**（右下玻璃罩槽）：点选触发 7 秒慢动作 timeScale 0.4；初始 1 个，每 3 关 +1（上限 3）
- **点按弹开**：在球场空白处点按 → 冲击波把附近 90px 内球推开（250ms 冷却）——慢动作+点按是核心技术（把球点进漩涡）
- **关卡**：清空全部 bumper → 结算横幅「第 N 关 完成 +X分」→ 自动生成下一关（球、分数、道具保留）。关卡程序生成：数量 min(5+floor(L*0.7),13)、基础计数 min(4+2L,60)±30%、L≥2 出菱形、L%4==0 出大白球(r27,计数×3)、L≥5 部分 bumper 水平往返移动
- **失败**：无失败。球尽且分不够加球时「领取+5」兜底
- **持久化**：level/score/balls/bombs/glasses/best 刷新不丢

## 2. 视觉规格（锁死，逻辑坐标 390×844，canvas 全屏，实际按视口等比缩放）

### 颜色表
```
背景基色 #463d35；中央聚光 #5c5148（径向渐变到透明）；四角 vignette 加深
山丘剪影 #332c26（两层，位于下半屏，纯背景不碰撞）
墙壁线条 #b5ada6 宽 3（顶角圆角 r18）；虚线 rgba(244,219,212,.9) 宽 4 圆帽 dash[14,9]
底部色带 #3a4450（上缘即球场弧形地板）
球：径向 #ffffff→#e2ded8，描边 rgba(0,0,0,.15)，r=11
bumper 数字色 #38332e 粗体
普通 bumper（r19，外圈 halo rgba(255,255,255,.15)）：
  yellow {fill:#dfe666,ring:#b9c93e}  purple {fill:#b3a2e6,ring:#8d78cf}
  blue   {fill:#a5d9f2,ring:#6fb9e6}  cyan   {fill:#6fd9e8,ring:#3cb4cc}
  green  {fill:#9fe07a,ring:#6fbe4e}  orange {fill:#f2b95e,ring:#d99a34}
  pink   {fill:#f29ab8,ring:#d96f98}
菱形（半对角 22）：fill #9feaf2，外描边 #d8f8fc 宽 3，ring #5cc8d8
大白球（r27）：fill 径向 #f6f2ee→#d9d2c9，ring #cfc6bc，玻璃高光弧
收球钮：bg rgba(255,255,255,.12) border rgba(255,255,255,.22) 圆角 10 文字 #ddd
加球钮：胶囊渐变 #ff7078→#e84a5e，白粗体 + 白圆底红加号图标，底部深色压边
色带/槽：#3a4450；玻璃罩槽 = 半圆顶玻璃胶囊，边缘 rgba(255,255,255,.35) 高光
菜单钮：黑圆 rgba(20,16,12,.85) 内含白色圆环+三横线
```

### 几何（390×844 逻辑坐标）
```
菜单钮圆心 (30,34) r22
「N分」x=28 左对齐 y中心82 字号26 w900 白字带阴影；「N球」x=362 右对齐同款
顶墙：左角(14,60) 斜线降到杯口左沿(172,148)；杯=圆心(195,148) r23 的下半圆弧；
      右沿(218,148) 斜线升到右角(376,60)；左右侧墙 x=14/376 从 y=60 到 690，
      末端 T 形帽（装饰，水平短杠 20×5）
虚线 y=148，两段 x∈[22,168]、[222,368]
漩涡：圆心 (195,26) r52，画在墙线之下层（墙线压在漩涡上），顶部被屏幕裁掉，
      深色螺旋臂 2-3 条逆时针内卷、中心雾状亮心 #c8beb8，整体缓慢自转
关卡数字：右上对齐 (168,168) 15px rgba(255,255,255,.5)
地板弧（碰撞+色带上缘同一条线）：(14,763) 二次曲线控制点(195,812) 到 (376,763)，
      采样≥24 段折线；色带从该弧向下填充到屏幕底
收球钮：DOM，中心(195,758) 尺寸 96×40
加球钮：DOM，中心(195,806) 尺寸 190×52（含 safe-area 位移）
炸弹槽：DOM/绘于(34,812) r27；沙漏槽 (356,812) r27；数量角标右上
bumper 生成区：y∈[260,680]，x∈[40,350]，互不重叠（间距≥r1+r2+26）且避开杯口下方 120px 锥形区
```

### 渲染层序（canvas 自底向上）
静态离屏层（背景+山丘+聚光+色带+墙+杯+虚线+T帽，一次预渲染）→ 漩涡精灵（离屏预渲染，每帧旋转 drawImage）→ bumpers（每色预渲染精灵，数字每帧绘制；命中白闪、消除 scale+fade 200ms）→ 球（单精灵复用）→ FX 粒子 → 浮动分数文字。慢动作时全屏加淡蓝罩+角落沙漏图标。**全程序化零外部资源，禁 shadowBlur（光晕用径向渐变烘焙进离屏精灵），DPR≤2。**

## 3. 工程结构（单文件管线）

```
gravity-pinball/
  src/contract.md           本文件
  src/shell.html            骨架：viewport/safe-area/DOM 骨架/CSS，含 <!-- MODULE_SCRIPTS --> 占位
  src/core.js    [主线]     window.GP 命名空间、URL 参数、?reset=1 清档、localStorage 存取、rng、__errs 探针
  src/art.js     [子代理]   GP.ART.icon(name)->SVG dataURI
  src/audio.js   [子代理]   GP.AUDIO
  src/fx.js      [子代理]   GP.FX
  src/config-panel.js [子代理] GP.CFGP
  src/physics.js [主线]     GP.PHY 纯物理
  src/game.js    [主线]     GP.GAME 状态机+关卡生成+渲染主循环+DOM 接线+测试钩子
  build.py               拼接生成 ../index.html（单文件）
```

模块加载顺序：core → art → audio → fx → config-panel → physics → game。
可缺模块（ART/AUDIO/FX/CFGP）主线路径一律惰性解析 + NOOP Proxy 兜底（调用不存在的模块方法不得抛错）。

### 全局命名空间
```js
window.GP = { core, ART, AUDIO, FX, CFGP, PHY, GAME }
window.__errs = []   // core.js 挂：window.onerror + unhandledrejection 推入
GP.ART.icon(name) -> 'data:image/svg+xml,...'   // name 见下
GP.AUDIO.init(); GP.AUDIO.unlock(); GP.AUDIO.play(name, {vol,pitch})
GP.AUDIO.bounce(intensity01); GP.AUDIO.setMuted(bool); GP.AUDIO.setVolume(0..1)
GP.AUDIO.applyOverrides({name: ArrayBuffer})    // 自定义音效替换
GP.FX.init(canvas); GP.FX.burst(x,y,color,n); GP.FX.floatText(x,y,str,color)
GP.FX.swallow(x,y); GP.FX.ring(x,y,color); GP.FX.shake(mag)
GP.FX.update(dt); GP.FX.draw(ctx); GP.FX.clear()
GP.CFGP.open(); GP.CFGP.close(); GP.CFGP.toggle(); // 自挂 DOM，onChange 回调整份 cfg
GP.PHY.World 类：new World(opts) / addBall / removeBall / setStatics(segments,bumperObjs)
   / step(dt) / balls 数组 / 事件回调 onBumperHit(onBall,onPop 由 game 注入)
GP.GAME：状态机 + 主循环；测试钩子 window.__gp = {
   state, cfg, WORLD, dropOne(), collect(), addBalls(n), useBomb(), useGlass(),
   clearLevel(), jumpLevel(n), stats() }
```

### ART 图标清单（每个 ≤3KB，viewBox 起头，扁平圆润风，参考截图里炸弹是黑炸弹白眼睛卡通、沙漏是橙框蓝沙+顶部青色星星）
menu(圆环三横线), bomb, hourglass, plus(实心圆+加号，用于加球钮), close, volumeOn, volumeOff,
upload, download, reset, info, pause, play, check

### 配置 schema（GP.core.defaultCfg，锁字段名）
```js
{ gravity:1500, dropInterval:550, ballR:11, startBalls:20, maxBalls:80,
  addBallAmount:10, addBallBaseCost:100, addBallCostStep:50,
  bombRadius:130, bombPower:6, glassDuration:6, glassTimeScale:0.45,
  restWall:0.72, restBumper:0.88, restFloor:0.55, restBall:0.4,
  sfxVolume:0.8, muted:false, autoCollect:false,
  icons:{bomb:'',hourglass:''}, sounds:{} }
```
存储键：`gp_cfg_v1`（配置）/ `gp_state_v1`（进度 {level,score,balls,bombs,glasses,best,addBallUses,tutDone,swallows,pops}）。
`?reset=1` 必须在 core.js 顶层最先执行（先于任何 localStorage 读）。
URL 参数：`?reset=1 &level=N &balls=N &muted=1`。

### shell.html DOM 骨架 id（主线负责，子代理只注入自己 modal 内容）
```
#c（canvas 全屏）  #hud（分/球/菜单钮 DOM） #menuBtn
#btnCollect（收球） #btnAdd（加球） #slotBomb #slotGlass（道具槽，含 .badge 角标）
#menuModal（菜单弹层：继续/重开/说明/设置/最佳纪录）  #toast
配置面板 modal 由 CFGP 自建挂 body
```

## 4. 分工边界

- **主线亲写（子代理勿动）**：core.js / physics.js / game.js / shell.html / build.py / README / 案例库登记
- **子代理只写自己的一个文件**：art.js / audio.js / fx.js / config-panel.js，其他文件一律不碰
- 子代理自检：`node --check` 过 + 自写 node 测试脚本跑通 + 完工按格式汇报
