# 僵尸防线 · 孤哨重制 —— 并行开发契约（唯一事实源）

> 复刻对象：`ref/original.html`（僵尸防线·至尊版，全部机制与数值从源码提取，**权威规格，勿凭感觉改数值**）。
> 本次重制目标：玩法与数值 1:1，**视觉/UI 全面重做**（原版太丑），手机端全屏自适应，新增全程序化音效。

## 0. 参考文件（动手前必读）

- `ref/original.html` —— 原版完整源码（含全部数值表）
- `src/contract.md` —— 本契约
- 视觉方向见 §4，**禁止**紫蓝渐变/霓虹堆砌/emoji 图标/玻璃拟态/SaaS 卡片风/大圆角白卡（用户硬约束）

## 1. 目录与交付

```
zombie-defense/
  src/
    contract.md   shell.html   style.css   build.py
    config.js     # 常量数值表（主线）
    game.js       # 逻辑/状态机/战斗/波次/局外养成（主线）
    ui.js         # DOM 覆盖层全部界面 + DOM HUD（主线）
    main.js       # 启动/循环驱动/输入/resize（主线）
    art.js        # canvas 绘制模块（子代理 A）
    audio.js      # WebAudio 音效模块（子代理 B）
  ref/original.html
  index.html      # build.py 产出单文件
  README.md
```

构建：`python3 build.py` 把 style.css 与按 ORDER 排列的 js 拼进 shell.html → `../index.html`。
红线：任何 js 内**不得出现 `</script` 字面量**；不引任何外部资源；离线可玩。

## 2. 全局命名空间

```js
window.ZD = window.ZD || {};
ZD.CFG    // 常量数值表 (config.js)
ZD.ART    // 绘制函数集 (art.js)
ZD.audio  // 音效 (audio.js)
ZD.game   // 游戏核心：state/save/stats/接口 (game.js)
ZD.ui     // DOM 界面 (ui.js)
```

各模块对缺失模块容错：主线统一 `const A = (window.ZD&&ZD.ART)||FALLBACK` 模式；
art/audio 内部**只依赖** `window.ZD` 自身与浏览器 API，**不得反向调用 game/ui**。

## 3. 玩法数值锁死（从原版源码逐行提取，勿改）

### 3.1 僵尸 ZTYPES
| type | hp | hp/波 | spd | spd/波 | w×h | 墙伤 | 金币 | 钻 | XP | 出现 |
|---|---|---|---|---|---|---|---|---|---|---|
| normal | 18 | +6 | .35 | +.012 | 36×44 | 8 | 2 | 0 | 2 | 常驻 |
| fast | 10 | +4 | .85 | +.02 | 30×36 | 5 | 3 | 0 | 3 | 波≥3, 22% |
| tank | 60 | +16 | .22 | +.008 | 48×56 | 16 | 6 | 0 | 5 | 波≥4, 12% |
| boss | 400 | +90 | .16 | 0 | 84×92 | 30(每50f) | 50 | 20 | 30 | 波%5==0 末尾 |

波次怪数 = 6+floor(n*1.8)，boss 波 ×0.6 向下取整；出场间隔 22f（boss 波 34f）；
boss delay = count*22+40。血量 = base + wave*hpw，速度 = base + wave*spw。
波清空（queue空且场空）：+2 钻，waveTimer=100，wave++。开局 waveTimer=90。
Boss 远程：y>60 后每 200f 朝玩家方向发弹（vy=4.5, vx=朝玩家*0.004），落地(y>WALL_Y+20)墙伤 12。
Boss 击破：+20 钻、墙回 20、ring 120、shake 14。
近战怪到墙（z.y+z.h ≥ WALL_Y+30）每 50f 咬一次。

### 3.2 玩家/射击
- 基础 dmg 10、rate 2.4 发/s（cd=60/rate f）、multi 1、pierce 0、wall 100
- 子弹速度 16（无人机 13，伤害 ×0.5，无穿透），飞行中持续锁定目标转向
- 瞄准：打 y 最大（最靠下）的活怪，枪管角度 lerp 0.22，限 ±1.15rad；玩家 x lerp 0.25，clamp 24..W-24
- 暴击：暴伤 2.5×；处决：0.02*lv + 宝石加成，仅非 boss
- 爆破：半径 40+boom*10，伤 0.4*boom*dmg；冰冻 slow=120f（速度×0.6）；燃烧 burn=180f（每 f 伤 0.08*burn）
- 雷链：周期 300-25*lv，跳 2+lv 只，伤 1.2*dmg；弹幕：周期 480-60*lv，14 发扇形（π→2π），伤 0.6*dmg，pierce1
- 激光：持续照 y 最大怪，dps 0.3*lv；无人机绕玩家正弦漂移，cd 45f

### 3.3 局内技能池（三选一，MAX_DISTINCT=4，满级转 +100 金币）
dmg×1.35(max8) / rate×1.25(max8) / multi+1(4) / pierce+1(4) / boom+1(5) / ice+1(3) /
drone+1(4) / crit+12% cap95%(6) / wall 上限×1.15+回30%新上限(5) / laser+1(5) / burn+1(4) /
chain+1(4) / barrage+1(3) / exe+1(4)。
XP：击杀得 xp，xpNeed 初 8，升级后 ×1.5 取整。

### 3.4 局外养成
- 金币永久升级（上限 20 级，cost=base×1.55^lv）：
  atk +10%/lv(200) / rate +6%/lv(260) / hp +10%/lv(300) / coin +8%/lv(150)
- 宝石 6 种（致命2%暴击/狂暴10%暴伤/力量4%攻击/迅捷3%射速/贪财5%金币/处决1%秒杀），
  品质 传说×1 / 绝世×2 / 至尊×3.5，同名可叠加，自动生效
- 宝箱：100 钻 1 颗（至尊5%/绝世25%/传说70%）；300 钻 3 颗（15%/45%/40%）
- 充值模拟：¥6=60钻 / ¥30=300 / ¥98=980，首购双倍；vipPts += 档位钻/10（不按双倍算）
- VIP = floor(vipPts/60)，每级金币收益 +8%
- 结算带出：coins += round(runCoins×(1+coin加成))，dia += runDia。防线破/主动退出都结算。
- Boss 掉钻石必得；全局 coin 加成 = up.coin*0.08 + VIP*0.08 + 贪财宝石

### 3.5 存档与配置
- 存档 key：`zd.save.v1`（coins/dia/gems/up/paid/vipPts）；配置 key：`zd.cfg.v1`（muted 等）
- `?reset=1` 清档（build.py 注入 reset_js，**先于模块执行**）

## 4. 视觉方向（重制核心，全员遵守）

主题 **「末日孤哨」**：深夜蓝黑 + 冷月光 + 军用琥珀 + 血红警戒。粗粝军事哨站质感，
不是可爱卡通风，也不是赛博霓虹风。

调色板（CSS 变量 + canvas 同源）：
```
--bg:#0b1016   夜空顶 #05080d → 地平 #1a2230
--ink:#e8e4d8  骨白文字     --muted:#8a93a3
--amber:#e8a33d 军琥珀(主)  --amber-hi:#ffc966
--red:#d9483f  危险/僵尸血   --green:#79a852 防线
--gold:#f2c14e 金币         --dia:#7dd3e0 钻石
--panel:#141b24 面板        --line:#2a3340 描边
```
僵尸配色：normal 病绿 #6a9a4a / fast 枯黄 #b09a3e / tank 锈铁 #8a7f6d+装甲板 / boss 暗红 #a83a3a+骨角。
**canvas 红线**：逐帧路径禁 `ctx.shadowBlur`（性能），发光一律离屏预渲染或 radial-gradient+globalCompositeOperation'lighter'；粒子/子弹用预渲染 sprite 贴图；DPR 由主线统一处理（≤2）。

## 5. 模块接口

### 5.1 art.js → `ZD.ART`（子代理 A）
全部纯绘制函数，不持状态（除 bg 缓存）：
```js
ZD.ART.bg(w,h)                    // →离屏canvas：星空+月+云+两层城市废墟剪影+雾带+地面战壕纹理；同尺寸缓存
ZD.ART.vignette(w,h)              // →离屏canvas 四周暗角
ZD.ART.wall(ctx,W,wallY,frame,hpRatio)      // 沙袋工事+铁丝网+左端警示灯(低血闪烁红)
ZD.ART.zombie(ctx,z,frame)        // z:{type,x,y,w,h,hurt,slow,burn,hp,max}；四种差异剪影+走路动画+受击白闪+冰蓝描边+燃烧余烬粒子感+头顶血条
ZD.ART.player(ctx,px,py,ang,recoil,flash,frame) // 士兵：头盔/护甲/步枪随ang旋转+后坐；flash>0 画枪口火光
ZD.ART.drone(ctx,x,y,frame)
ZD.ART.bullet(ctx,b)              // b:{x,y,vx,vy,crit,drone} 拖尾+亮核
ZD.ART.bossShot(ctx,s)
ZD.ART.laser(ctx,x1,y1,x2,y2,lvl,frame)
ZD.ART.ring(ctx,e)  ZD.ART.bolt(ctx,b)  ZD.ART.part(ctx,p)
ZD.ART.coin(ctx,c)  ZD.ART.floatText(ctx,f)  ZD.ART.muzzle(ctx,x,y,t)
```
要求：同一僵尸类型有 2 帧以上走路感（摆动/弹跳相位）；boss 有犄角+体型压迫感；
性能优先（480×800@60fps 不卡）；自检 harness 见 tools/art-harness.html（主线提供）。

### 5.2 audio.js → `ZD.audio`（子代理 B）
全 WebAudio 程序合成，零外部文件。接口：
```js
ZD.audio.unlock()                 // 首次 pointerdown 调用，幂等；懒创建 AudioContext
ZD.audio.play(name)               // 音效名见下
ZD.audio.bgm(mode)                // 'menu'|'battle'|null 暗黑环境垫乐，音量低
ZD.audio.setMuted(b) / .muted / .toggle()
```
音效清单（game.js 会按这些名字调用）：`shoot shootCrit hitZ dieZ dieBoss explode zap
barrage drone lvl coinIn wallHit bossWarn waveHorn click buy gacha gachaRare cash lose clickSoft`
要求：主增益 ≤0.6；BGM 循环无缝；visibilitychange 时挂起；合成音色偏军事/低沉，
禁刺耳高频；每个音效带独立 gain 便于平衡。

### 5.3 game.js / ui.js / main.js（主线，此处仅列边界）
- game.js 持有全部状态，暴露 `ZD.game.{state,save,stats,frame,...}` 与动作接口给 ui/main
- ui.js 只读 game 状态 + 调 game 动作；HUD 每帧由 main 驱动 ui.updateHUD()
- main.js：rAF+setInterval 双驱动定步长（60fps 基准 × speed 1/2/3）、pointer 输入、resize/DPR、可见性暂停

## 6. 测试钩子（主线实现，其他模块勿碰）
`window.__zd = {state,save,stats,startRun(),setCur(c,d),giveXp(n),setSpeed(n),errs}`；
URL 参数：`?reset=1 ?muted=1 ?dev=1`(FPS 显示)。

## 7. 边界（谁写什么，勿动他人文件）

- **主线**：contract / build.py / shell.html / style.css / config.js / game.js / ui.js / main.js / tools/* / README / 登记
- **子代理 A**：只写 `src/art.js`（+可自查用临时文件，勿留）
- **子代理 B**：只写 `src/audio.js`（+可自查用临时文件，勿留）
