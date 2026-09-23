# tower-crane 盖楼达人 · 复刻契约（唯一事实源，勿改）

1:1 复刻经典「盖楼」小游戏（Tower Bloxx 类）：吊机吊着集装箱房间块左右摆动，点按松钩让房间块垂直落下，与楼下房间块对齐越准分越高；落偏太多整块坠落损一命，命尽游戏结束；叠到目标层数（默认 40 层）达标。单文件 H5，手机竖屏可玩，全部元素可配置。

## 0. 参考图（动手前必 Read）

- 原图：`/Users/yiqunwu/.zcode/cli/image-cache/sess_5d8acebb-c8cb-4e57-83c8-22ab1540c463/image-9d72a4bc76d4596a069506b42a4e8658.png`（562×1334）
- 裁片（本项目 ref/ 下，已放大 2x）：`top.png`（HUD 面板+调试钮）、`crane.png`（吊钩+橙色房间块特写）、`stack.png`（红/绿/橙房间块堆叠塔+工地背景）、`bgcity.png`（虚化城市）、`full.png`（整机）
- 玩法调研：`ref/rules-spec.md`（若有；标「推测」的以本契约为准）

## 1. 游戏规格（锁死）

- **摆动**：吊钩绕顶部锚点（屏幕水平居中、锚点在世界 y=-30）做正弦摆动 x(t)=anchorX+A·sin(2π·t/T)；默认振幅 A=110px、周期 T=2600ms。房间块挂在吊钩正下方（块顶中心=钩底），缆绳从锚点画到钩顶
- **落块**：游戏中任意点按 → 松钩。默认**垂直直落**（x 不变，vy 从 0 起自由落体 g=2400px/s²）；cfg.carryVelocity=true 时保留摆动水平速度（进阶玩法，默认关）
- **判定**（offset = 落点块中心x − 楼顶块中心x，W=块宽）：
  - |o| ≤ 9%W → **perfect**：块 x 吸附到楼顶块中心，连击 combo+1
  - |o| ≤ 28%W → **great**：原地落
  - |o| ≤ 55%W → **good**：原地落（肉眼半悬空，惊险感）
  - |o| > 55%W → **miss**：块翻转坠落出屏，损 1 命
  - 首层（地面基座）同样判定，基座中心=世界 x=0（锚点正下）
- **计分**：perfect +60 + (combo−1)×15；great +25；good +5；每次成功落块额外 +10 基础分；每 10 层里程碑 +100 分且 +1 命（上限 cfg.maxLives=5）
- **难度曲线**：每 +1 层，T −24ms（下限 1400）、A +1.1px（上限 165），cfg 可调（曲线已用模拟器平衡：好手±50ms 可上百层、普通 ±90ms 约 56 层过 40 层线、手残 ±130ms 卡线）
- **目标/胜负**：叠到 cfg.targetFloors（默认 40）→ 达标庆祝弹窗（可「继续无尽」或「重新开始」）；命数 0 → 游戏结束弹窗（分数/层数/最佳）
- **镜头**：楼顶（堆叠顶面）始终锚在 worldH×0.66 处，落块成功后镜头平滑下移一个块高（lerp 0.12/帧）；背景城市视差 0.4×、云 0.15×+缓慢自漂
- **托管 demo**：cfg.demo 或 URL ?demo=1 → AI 在 |块x−楼顶x|<perfect 判定带内自动松钩（测试与演示两用）；菜单里也有「托管」开关
- **持久化**：best 分数/最高层数/累计局数；进行中的塔（每块落点 x 数组+分数+命+连击）每步落盘，刷新后标题页出现「继续 N 层」
- **无 resources**：全程序化，零外部资源

## 2. 视觉规格（锁死）

### 世界坐标与缩放
逻辑世界宽 W≥390 保证：`scale = min(vw/390, vh/620)`，世界尺寸 = vw/scale × vh/scale（canvas 始终精确铺满窗口，DPR≤2）。竖屏 390×844 时 scale=1。几何全部相对 (worldW, worldH) 计算，禁止硬编码 390/844。

### 颜色/样式表（从参考图取样）
```
天空渐变（世界固定层）：#2e8fe0(顶) → #6fc0ee(中) → #c9ecfa(地平线附近)
云：白云 #ffffff 底部带 #d8ecf9 阴影，柔软积云 3 变体
房间块调色板（body/dark 描边/light 高光），4 色循环取用：
  red    {body:#ef6a5e, dark:#c94b41, light:#ff9285}
  mint   {body:#7cdcb4, dark:#54b78e, light:#aaf0d2}
  orange {body:#f5a733, dark:#d1821a, light:#ffc76e}
  blue   {body:#5fb7ef, dark:#3d8fc9, light:#96d5fb}
  块细节：门+窗框奶白 #f7f3e8，玻璃深蓝 #3d5a80，角柱铆钉白点
吊钩：金黄 #f2b53d 主体 + 深金描边 #c98a1e，下方灰色钢环 #8a93a0，缆绳深灰 #5a6470 宽3
HUD 面板（DOM）：bg rgba(125,185,240,.42) + backdrop-filter blur(6px)，边 1.5px rgba(255,255,255,.65)，圆角 22
HUD 文字：白 #fff 粗体；「目标 N 层」数字加大白粗；「当前 N 层」数字金黄 #ffd34d 加大粗
调试钮风格 → 菜单钮：深蓝黑 rgba(28,52,84,.85) 圆角 10 白字/白图标
地面基座：混凝土灰板 #b9c2cc 顶面 #d7dee6 + 警示斜纹黄黑
```

### 布局（相对 worldW/worldH）
```
锚点 (worldW/2, -30)；缆长默认 150（钩顶 y≈120）
房间块默认 120×76（cfg.blockW/blockH），水平居中悬挂
楼顶锚线：worldH×0.66（堆叠顶面所在屏幕 y）
基座：世界 y=0 为基座顶面，基座向下画 90 厚 + 警示斜纹，基座下方渐变到城市
HUD：面板顶部居中（top: max(10, safe-area)）；分数 chip 左上；命数（钩形/心形小图标×n）右上；菜单钮右上角
```

### 渲染层序（canvas 自底向上）
静态天空层（渐变+太阳光晕，离屏预渲染一次）→ 云层（3 变体精灵，视差漂移）→ 远城市层（离屏预渲染，缩小放大法模糊）→ 近城市层（同法，含吊机剪影/树/坡）→ 基座 → 已落塔块（每色预渲染精灵按 x,y 绘制，落地瞬间 squash 弹跳 150ms）→ 下落中块（miss 时带旋转）→ 缆绳+吊钩+悬挂块（悬挂块轻微摇摆角度=摆动角一半）→ FX 粒子/浮字 → 前景无。**禁 shadowBlur（柔光用径向渐变烘焙进离屏精灵），模糊一律缩小放大法，DPR≤2。**

### 城市背景构成（paintCity 由 art.js 提供，game 预渲染+模糊）
远层：淡蓝灰楼群剪影 + 1 台橙色塔吊；近层：蓝灰楼群+黄色塔吊×2+绿色圆树丛+草坡。全部低对比，让前景塔块是绝对主角。

## 3. 工程结构（单文件管线）

```
tower-crane/
  src/contract.md           本文件
  src/shell.html            骨架：viewport/safe-area/DOM/CSS，含 <!-- MODULE_SCRIPTS --> 占位
  src/core.js    [主线]     window.TC 命名空间、URL 参数、?reset=1 清档最先执行、localStorage、defaultCfg、rng、__errs 探针
  src/art.js     [子代理]   TC.ART（房间块/吊钩/云/图标/天空城市绘制）
  src/audio.js   [子代理]   TC.AUDIO
  src/fx.js      [子代理]   TC.FX
  src/config-panel.js [子代理] TC.CFGP
  src/logic.js   [主线]     TC.LOGIC 纯逻辑（摆动/判定/计分/难度曲线/模拟器）
  src/game.js    [主线]     TC.GAME 状态机+渲染主循环+镜头+输入+DOM 接线+测试钩子
  build.py               拼接生成 ../index.html（单文件）
```

模块加载顺序：core → art → audio → fx → config-panel → logic → game。
可缺模块（ART/AUDIO/FX/CFGP）主线路径一律惰性解析 + NOOP Proxy 兜底（调用不存在的方法不得抛错）。

### 全局命名空间
```js
window.TC = { core, ART, AUDIO, FX, CFGP, LOGIC, GAME }
window.__errs = []   // core.js 挂：onerror + unhandledrejection 推入
TC.ART.room(i) -> dataURI            // 调色板第 i 色房间块，viewBox "0 0 240 152"（2x 逻辑块）
TC.ART.hook() -> dataURI             // 金黄吊钩+灰钢环（不含缆绳，缆绳 game 画）
TC.ART.cloud(i) -> dataURI           // i=0,1,2 三种积云
TC.ART.icon(name) -> dataURI         // menu,close,heart,play,pause,upload,download,reset,check,info,volumeOn,volumeOff,trophy,home
TC.ART.paintSky(ctx,w,h)             // 天空渐变+太阳光晕（无云）
TC.ART.paintCity(ctx,w,h,depth)      // depth 0=远层 1=近层（模糊由 game 的缩小放大法做）
TC.AUDIO.init/unlock/play(name,{vol,pitch})/startLoop/stopLoop/duck(ms)
TC.AUDIO.setMuted(bool)/setVolume(0..1)/setBGMVolume(v)/setSFXVolume(v)/applyOverrides(map)
TC.AUDIO.names = ['click','release','perfect','great','good','miss','over','win','milestone','combo','bgm']
TC.FX.init(canvas)/resize(w,h,dpr)/dust(x,y,n,color)/confetti(n)/floatText(x,y,str,{color,size})
TC.FX.bigText(text,{sub,color})/ring(x,y,color)/shake(mag)/update(dt)/draw(ctx)/stopAll()
TC.CFGP.open(tab?)/close()/toggle()/isOpen()/onChange(cb)   // cb(完整 cfg 深拷贝)
TC.LOGIC.swingX(cfg,floors,tMs) -> {x,vx}   // 锚点居中，返回块中心 x 与水平速度
TC.LOGIC.resolveDrop(cfg,dropX,topX) -> {grade,offset,landX}
TC.LOGIC.scoreFor(cfg,grade,combo) -> points
TC.LOGIC.ramp(cfg,floors) -> {amp,period}
TC.LOGIC.simulate(cfg,skillErr,ndrops,seed) -> {floors,reached,score,perfects,misses}  // node 平衡性自测
```

### ART 细节要求（先 Read ref/crane.png 与 ref/stack.png 再动手）
- 房间块 = 集装箱风：圆角矩形箱体（圆角≈高的 12%），四角同色深一号角柱+白点铆钉，箱体竖向波纹板条（dark 色 8% 透明度细竖条），左侧门（奶白框、门内小方窗深蓝玻璃、门把手黄点），右侧四格窗（奶白框十字分格深蓝玻璃），最右竖向点线装饰+小白牌。顶部一条 light 高光、底部一条 dark 阴影边。单图源码 ≤3KB，door/window 位置左右可镜像变体？——**不需要**，所有块同款版式只换色
- 吊钩：横销在上、U 形金环、下系灰色圆钢环（环孔透出天空），卡通厚描边风
- icon 全部粗描边圆角风格，白色描边（HUD/深色按钮上用）

### 配置 schema（TC.core.defaultCfg，锁字段名）
```js
{ targetFloors:40, startLives:3, maxLives:5,
  blockW:120, blockH:76, cableLen:150,
  swingAmp:110, swingPeriod:2600, ampPerFloor:1.1, ampMax:165, periodPerFloor:-24, periodMin:1400,
  gravity:2400, carryVelocity:false,
  perfectPct:0.09, greatPct:0.28, goodPct:0.55,
  scoreFloor:10, scoreGreat:25, scorePerfect:60, comboStep:15,
  milestoneEvery:10, milestoneBonus:100, milestoneLife:1,
  camLerp:0.12, dropSpawnDelay:350,
  demo:false, muted:false, bgmVolume:0.35, sfxVolume:0.9,
  roomColors:[{body,dark,light}×4],   // 数量可 3~6，面板可改色/增删
  icons:{room:'', bg:'', hook:''},    // 上传替换（dataURL），空=默认
  sounds:{} }                          // {cue: dataURL}
```
存储键：`tc_cfg_v1`（配置）/ `tc_state_v1`（进度 {best,bestFloors,games,run:{floors:[x…],score,lives,combo,personalPerfects,target,demo}}）。
`?reset=1` 必须在 core.js 顶层最先执行（先于任何 localStorage 读）。
URL 参数：`?reset=1 &muted=1 &demo=1 &floors=N（开局预置 N 层，测试镜头） &target=N &lives=N &rig=perfect|miss（强制下次落块结果）`。

### shell.html DOM 骨架 id（主线负责，子代理只注入自己 modal 内容）
```
#c（canvas 全屏）
#hud：#panel（两行：目标N层/当前N层） #scoreChip（分数） #livesBox（命图标） #menuBtn
#startOverlay（标题 LOGO+开始/继续N层/说明/设置+最佳纪录） #helpModal #overOverlay #winOverlay
#toast
配置面板 modal 由 CFGP 自建挂 body
```

### 音效 cue（听感/时长）
click( UI 轻点 30ms) / release(松钩 whoosh 120ms) / perfect(清亮钟琴上行琶音 350ms) / great(闷响+短钟 200ms) / good(软闷响 120ms) / miss(下落滑音+闷碰撞 600ms) / over(下行小调三音 900ms) / win(号角上行庆祝 1.2s) / milestone(闪烁铃音 400ms) / combo(短 ping，pitch 随连击升高) / bgm(轻快马林巴/尤克里里五声音阶循环，音量压低)
BGM 引擎要求：iOS 首手势 unlock 幂等；visibilitychange 停/续；节点用完 stop+disconnect；duck(ms) 压 BGM。

## 4. 分工边界

- **主线亲写（子代理勿动）**：core.js / logic.js / game.js / shell.html / build.py / README / 案例库登记
- **子代理只写自己的一个文件**：art.js / audio.js / fx.js / config-panel.js，其他文件一律不碰
- 子代理自检：`node --check` 过 + 自写测试跑通 + 截图 Read 自查（art/fx/config-panel），完工按格式汇报
