# RETRO-MOTO-RACER 契约（并行协作唯一事实源）

日落沙漠像素摩托竞速（OutRun / Hang-On 一路伪 3D 街机赛车 + CRT 扫描线），手机 H5 单文件交付。
全局命名空间 `window.RM`。**先 Read 本文件与参考图，再动手；本文件锁死的规格勿改。**

## 0. 参考图清单（ref/，先 Read）

- `ref/road-full.png` 整体构图（伪 3D 公路、透视、路宽、HUD 布局）
- `ref/backdrop.png` 天空分层/平顶山/红岩/沙地（第一关 SUNSET）
- `ref/player-bike.png` 玩家红摩托+白盔骑手（背后视角、投影、影子）
- `ref/rival-bikes.png` 对手摩托（绿/蓝/橙骑手）、白虚线、红白路缘、橙桶、远景车群
- `ref/hud-topleft.png` `4/12 POS` 大字面板
- `ref/hud-topright.png` `0'01"23` + 绿色 `PING 66`
- `ref/hud-topcenter.png` 赛道进度条（左端绿色标记、右端白旗）
- `ref/hud-bottomleft.png` 氮气绿格 + `35 KM/H` 大字
- `ref/hud-bottomcenter.png` `P2 3RD` + 绿色长格条（名次/进度）
- `ref/hud-bottomright.png` `RIDER` 黄格条 + `BIKE` 蓝格条

视觉基调：低内部分辨率放大（image-rendering: pixelated），CRT 扫描线+暗角+轻微色偏，全程像素风。
**禁止**：紫蓝渐变、emoji 图标、玻璃拟态、卡通圆角风格（用户全局 20 条反 AI 风格禁令）。

## 1. 游戏规格（锁死，勿改）

- **12 名车手**：玩家 + 11 AI。排位赛起步玩家第 8 位（可 ?pos= 覆盖）。名次按累计里程排序。
- **3 个关卡**（stage，点对点 + 计时检查点延长制）：
  1. SUNSET DESERT（参考图配色） 2. CANYON DUSK（暗红紫） 3. MOJAVE NIGHT（夜空星星+车头灯）
  每关 ~2400 segment（segLen=200 单位 → 单关约 50–60s），每关 2 个中途检查点 + 终点拱门。
  过检查点 +18s（cfg 可调）并回 40 氮气；倒计时归零 → TIME UP，可重试本关或回标题。
- **速度**：maxSpeed=12000 u/s（表显 = v/maxSpeed×280 → 顶速 280 KM/H、氮气 322，对齐 Super Hang-On 280/324 传承）；氮气中 ×1.15。
  加速 0→满约 6s；自然减速 maxSpeed/8；刹车 maxSpeed/2.2；离路钳 3000 且强减速。
- **氮气**：绿格条 100 单位。被动 +3/s；跟车吸尾流（前方 2 段内 |dx|<0.35）+9/s；按住 NITRO 28/s 消耗。
- **离路**：|playerX|>1.05 进入路肩沙地：限速、扬尘、RIDER 掉 stamina；撞橙色桶 speed×0.6+震屏。
- **碰撞**：同段且 |dx|<0.28 顶到对手：双方减速、弹开、火花、BIKE 条 -4；BIKE 条上限影响极速
  （条件 <40% 时极速 ×0.92，<20% 时 ×0.85）。RIDER 条：碰撞/离路掉、干净骑行缓慢回；低 stamina 加速变肉。
- **AI**：11 人分梯队巡航（2×0.97、4×0.90、5×0.82 ±3% 噪声），弯道按技术减速，前方受阻自动变线，
  轻微橡皮筋（cfg.rubberband 缩放：领先玩家 >1200u 减 1.5%，落后 >1500u 加 2%）。
- **HUD（canvas 像素字绘制，见 §5 布局）**：左上 `N/12 POS`+关卡进度细条；顶中赛道进度长条（绿标+右端白旗）；
  右上 `M'SS"CC` 计时 + 绿色 `PING nn`（装饰性假 ping 55–95 随机游走，复古氛围彩蛋）；左下氮气格 + 大字速度 `KM/H`；
  底中 `P1 3RD`（玩家 tag + 当前名次）+ 12 格名次条；右下 `RIDER` 黄格条 + `BIKE` 蓝格条。
- **状态机**：BOOT → TITLE（logo+TAP TO START+车库换色 4 色域+设置齿轮）→ COUNTDOWN(3,2,1,GO) → RACING
  →（CHECKPOINT / STAGE 换色横幅）→ FINISH（冲线慢动作 1.2s）→ RESULTS（名次/各关时间/最佳纪录/彩带）→ TITLE。
  RACING 中可 PAUSE（含 visibilitychange 自动暂停）。
- **操控**：移动端下半屏横向拖拽转向（相对位移映射，灵敏度 cfg）+ NITRO / BRAKE 两个大按钮 + 自动油门（默认开）；
  键盘 ←→/AD 转向、↑↓/WS 油门刹车、Shift/Space 氮气、P 暂停。
- **伪 3D 算法（Jake Gordon segment 投影，主线实现，子代理无需关心）**：
  每段 {index, p1/p2 world(camera z, x 路宽偏移 curve 累计, y 山丘), curve, 色 index}；
  project: cameraDepth=1/tan(fov/2), fov≈100°; scale=cameraDepth/z; screenX/W/Y; 曲线用逐段 dx 累计、
  玩家离心力 playerX -= dt*speedRatio*curve*centrifugal(0.32)；山丘 y 用正弦叠加。
  drawDistance=300 段，远端雾/淡出。4 车道：中央双黄线、±半车道白虚线、路缘红白（左）/白实线+橙桶（右）。

## 2. 内部分辨率与帧循环（锁死）

- 内部渲染低分辨率：长边 480px、短边 = clamp(round(480×short/long), 232, 300)，CSS 拉伸满屏
  `image-rendering: pixelated`，黑色 letterbox。ctx.imageSmoothingEnabled=false，drawImage 尺寸取整。
- 帧循环 rAF + setInterval(120ms) 双驱动（防后台节流冻结），dt=clamp(now-last, 0, 50ms)。
- DPR 不放大（像素风要的就是低分辨率）。

## 3. 模块与接口（window.RM.*，签名勿改；实现可自由发挥）

模块文件：`src/art.js` `src/font.js` `src/audio.js` `src/fx.js` `src/config-panel.js` `src/logic.js` `src/main.js`
每个文件用 IIFE 挂到 `window.RM.<NAME>`；互相引用一律惰性 `RM.X && RM.X.y()`，缺模块调用方不炸。

### art.js（ART）— 全部像素矩阵→离屏 canvas，NEAREST，**禁止外部图片/字体/网络资源**
- `ART.init()` 同步构建全部精灵（main.js 在 BOOT 时调用一次）
- `ART.bike(colorIdx, lean) -> canvas` lean ∈ -2..2（5 帧倾斜）；colorIdx 0=玩家红，1..11=对手色
- `ART.prop(id) -> canvas` id: barrel/cactus/rock/bush/sign/light
- `ART.arch(kind) -> canvas` kind: start/checkpoint/finish（跨路拱门，含文字）
- `ART.backdrop(stage) -> {sky, sun, mesasFar, mesasNear, dunes}` 每层为可水平平铺 tile canvas（stage: 0/1/2）
- `ART.flame(f) -> canvas` 氮气尾焰 2 帧；`ART.logo() -> canvas` 标题 LOGO；`ART.flag() -> canvas` 白旗小图
- `ART.PAL` 导出调色板（§6）

### font.js（FONT）— 5×7 位图像素字体（A-Z 0-9 及 `'"/!.:-+&%?▮` 等），字符→离屏缓存
- `FONT.draw(ctx, text, x, y, size, color, align, outlineColor)` align: left/center/right
- `FONT.measure(text, size) -> w`

### audio.js（AUDIO）— 全 WebAudio 合成，禁外部音频文件
- `AUDIO.init()` 幂等；`AUDIO.unlock()` 首个手势调用
- `AUDIO.setVolumes({master,bgm,sfx})` `AUDIO.setMuted(b)`
- `AUDIO.play(id)` id: click/beep/count/go/bump/barrel/nitro/checkpoint/stage/finish/gameover/timeup/tick
- 引擎声：`engineStart() / engineUpdate(speed01, nitroOn) / engineStop()`（锯齿+方波过低通，音高随速度）
- `AUDIO.bgm(id)` id: menu/race1/race2 `AUDIO.bgmStop()`
- unlock 幂等、visibilitychange 停 BGM、duck()、可 applyOverrides({bgm:id})；音量走 cfg.sound

### fx.js（FX）— 粒子/震屏，**禁 shadowBlur**（径向渐变+globalCompositeOperation='lighter'），对象池，上限 ~240
- `FX.init(canvas)` `FX.resize(w,h)` `FX.update(dt)` `FX.draw(ctx)`（在路渲染后、HUD 前调用）
- `FX.spawn(id, x, y, opts)` id: dust/spark/confetti/speedline
- `FX.shake(mag)` `FX.clear()`

### config-panel.js（CFGP）— DOM 面板，work 副本 + onChange(完整快照)，**永不直接碰 localStorage**
- `CFGP.init({getConfig, apply})` apply(snapshot) 由主线合并/落盘/实时生效
- `CFGP.open() / close() / toggle() / isOpen()`
- 字段分组：声音（master/bgm/sfx 音量、BGM 曲目 menu 曲×2）、操控（转向模式 drag/buttons、灵敏度、自动油门）、
  画面（CRT 开关/强度、扫描线、粒子密度、震屏）、比赛（AI 难度 easy/normal/hard、检查点秒数 10–25、
  氮气回填倍率、橡皮筋开关）、数据（配置导出/导入 JSON、恢复默认）。样式暗棕像素风与 HUD 一致。

### logic.js（LOGIC，主线亲写）— 纯逻辑，node 可跑（不碰 DOM/audio）
- 赛道生成（种子确定性：`LOGIC.buildTrack(stage, seed)` → 段数组+检查点/拱门索引+总长）
- 物理/AI/名次/检查点/计时纯函数：`LOGIC.stepPlayer(race, input, dt)`、`LOGIC.stepAI(race, dt)`、
  `LOGIC.rank(race)`、`LOGIC.simulate(stage, {skill, nitroUse}, seed)`（自机托管模拟，测试难度曲线用）
- race 对象形态：{stage, segs, z, playerX, speed, nitro, time, timeLeft, riders[12]({z,x,speed,colorway,skill,isPlayer,dist}),
  cpNext, phase, stageTimes[], curve, …} — 字段是两线程约定，logic/main 同源维护

### main.js（主线）— bootstrap、状态机、输入、HUD 绘制、渲染循环、持久化、测试钩子

## 4. 配置 schema 与持久化

```js
RM.cfg = {
  sound: { master:0.9, bgm:0.5, sfx:0.9, bgmTrack:"sunrise" },   // bgmTrack: sunrise|midnight
  video: { crt:true, crtIntensity:0.55, scanlines:true, particles:1, shake:true },
  race:  { difficulty:"normal", checkpointTime:18, nitroFill:1, rubberband:true,
           autoThrottle:true, steerMode:"drag", steerSens:1 },
  player:{ tag:"P1", colorway:0 }
}
```
localStorage：`rm_cfg_v1`（配置）、`rm_state_v1`（战绩：bestTime/bestPos/stageBest/races/wins）。
`?reset=1` 在 main.js 最顶层最先执行清档（必须在任何模块读 localStorage 之前）。
配置面板 onChange → 主线 deepMerge 入 RM.cfg → 写 rm_cfg_v1 → 调各模块 apply。

## 5. DOM 骨架与 HUD 布局

```
body > #app
  #game   (canvas, 内部低分辨率, pixelated)
  #crt    (扫描线+暗角 overlay, pointer-events:none, CSS 变量 --crt-i 控强度)
  #ui     (DOM 层)
    #btn-nitro #btn-brake #btn-pause #btn-gear #swatches(车库4色)
    #panel-config (CFGP)
    #toast
```
HUD 全部画在 canvas 内（内部分辨率坐标系，W×H=§2）。布局（参照截图）：
左上面板(x=4,y=4,w≈86)：大字名次+`/12 POS`+下方细进度条 | 顶部中央长条(y=4,w≈0.62W)：赛道进度+右端白旗 |
右上面板：计时+下行绿字 `PING nn` | 左下(x=4)：氮气格条+大字速度+`KM/H` | 底中(w≈0.3W)：`P1 3RD`+12 格名次条 |
右下(w≈110)：`RIDER`+黄格 / `BIKE`+蓝格。HUD 面板底色 #2a1420ee、描边 #4a2432。

## 6. 调色板（锁死，取自参考图采样）

```
SUNSET  天空带(顶→地平) #b04a6a #d9606a #ef8352 #ffb35c #ffd98a  太阳 #ffe9b0/#ffd270(横切条纹)
        远山紫 #8d6092/#6e4a7e  红岩 #bf4d47/#93362f  沙地 #d88d43/#c07a38
DUSK    天空 #6e2450 #a03a55 #d4603f #f08a4a  山 #5e2f52/#472442  沙地 #b06a38/#985c2f
NIGHT   天空 #171035 #241650 #35206a  星 #f2ede4  山 #241744/#1a1033  沙地 #4a3550/#3e2c45
路面    沥青明暗相间 #5e5158/#544b55  双黄线 #ffd23f  白线 #f2ede4  路缘红 #d94f3d/#efe6d8
        路缘橙线 #e8823c  桶 #e8823c/#f2ede4  起伏明暗 fog 用同层色 lerp
HUD     面板 #2a1420 边 #4a2432  黄 #ffd23f  白 #f5f0e6  绿 #57d95c  RIDER条 #f2b53d  BIKE条 #3f8fd9
摩托    玩家红 #e0342c/#8e1f1c 座 #2a2a34 盔白 #f2ede4 靴 #1e1e26
对手色  green #3fae49 blue #3f6fd9 orange #e8823c teal #3fb8a8 purple #9b59d0 pink #e86aa8
        lime #a8d93f gray #9a9aa8 brown #a8743f cyan #5cd9d9 white #e8e8f0 yellow #d9c53f
```

## 7. URL 参数与测试钩子（主线实现）

- `?reset=1` 清档；`?muted=1` 静音；`?auto=1` 托管 AI 演示（转向/氮气自动，浸泡测试用）；
  `?stage=1..3` 直接开该关；`?pos=n` 起步名次 rig；`?crt=0` 关 CRT；`?skip=1` 跳标题直接 COUNTDOWN。
- `window.__rm = { version, state, cfg, busy, race(), start(stage), quit(), pause(), resume(),
  rig:{ time(s), nitro(v), pos(n), speed(kmh) }, errs }`
- `window.__errs = []`：window.onerror + unhandledrejection 推入（main.js 最顶层接好，所有模块共用）。

## 8. 分工边界

| 文件 | 负责 |
|---|---|
| art.js, font.js | art 代理 |
| audio.js | audio 代理 |
| fx.js | fx 代理 |
| config-panel.js | config 代理 |
| logic.js, main.js, shell.html, build.py, README | **主线（其他人勿动）** |

子代理完工汇报：改了什么 + node --check 结果 + 模块自测结果 + （art/fx）headless 截图 Read 自查结论。
其他文件一律不动；不放调试残留；不引外部资源。
