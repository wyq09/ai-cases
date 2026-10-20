# 鼠族跑酷 · MOUSE RUSH — 模块契约（唯一事实源，动码前必读）

横版 2D 无限关卡跑酷 H5。主角是一只戴橙红围巾、背奶酪背包的灰色小老鼠。
手机竖屏 / 横屏双支持，**带手动切换横屏模式**。零外部资源（美术全程序化 Canvas2D、
音频全 WebAudio 合成、特效全 Canvas 粒子），最终 build.py 合并为单文件 `index.html`。
中文 UI 文案。

---

## 0. 全局铁律（所有模块都必须遵守）

1. 顶层命名空间唯一：`window.MP = window.MP || {};`
   模块文件顶层**禁止** `const MP` / `let MP` / `var MP` 声明，只能 `window.MP = window.MP || {};`。
2. 任何模块**不得在加载期调用其他模块**（不得在文件顶层执行 `MP.ART.xxx()`）。
   跨模块调用只发生在函数体内（运行时），由 game.js 负责保证调用顺序。
3. **零外部资源**：不得引用任何网络 URL、CDN、字体文件、图片文件、音频文件。
   不得 `fetch`/`XMLHttpRequest`。所有美术用 Canvas2D 程序化绘制，
   所有音效用 WebAudio 实时合成。
4. 不得使用 `eval` / `new Function` / `innerHTML` 拼接外部数据。
   允许 `innerHTML` 写入**模块内自带的字面量模板**（不含用户输入）。
5. 目标浏览器：iOS Safari 15+ / Android Chrome 90+ / 桌面 Chrome、Safari、Firefox。
   禁用 `OffscreenCanvas`、禁 `structuredClone` 依赖、禁 CSS `filter` 性能陷阱。
6. 每模块文件内不得出现字符串 `</script`（大小写不敏感）——会截断 HTML。
7. 代码注释用中文。
8. 模块必须能被安全地"缺失"——game.js 用 NOOP Proxy 兜底任一未加载模块。

### 文件归属（严格互斥，禁止越界修改他人文件）

| 文件 | 归属 |
|---|---|
| `src/logic.js` | 子代理 A（纯逻辑） |
| `src/art.js` | 子代理 B（美术） |
| `src/fx.js` | 子代理 C（特效） |
| `src/audio.js` | 子代理 D（音频） |
| `src/shell.html` | 子代理 E（页面骨架 + UI DOM） |
| `src/style.css` | 子代理 E |
| `src/ui.js` | 子代理 E |
| `src/game.js` | 主线（我来写） |
| `build.py` / `test/*` / `README.md` | 主线 |

子代理**只允许写自己那一格里的文件**，不要碰 build.py、game.js、README、根 README。

---

## 1. 游戏规格（主线已定，勿改数字）

### 1.1 坐标与视图

- 世界坐标：x 向右，y **向下**（Canvas 惯例）。地面基准线 `GROUND_Y = 460`（世界单位）。
- 参考视口宽度（世界单位）：竖屏 `VIEW_W_PORTRAIT = 520`，横屏 `VIEW_W_LANDSCAPE = 960`。
- 缩放 `scale = canvasCssWidth / viewW`；可见世界高度 = `canvasCssHeight / scale`。
  相机横向跟随玩家（`camX = player.x - viewW*0.38`），纵向让玩家维持在屏幕下方 40% 处，
  并做 `clamp` 防止看到地面之下过多或天花板之上太多。
- 小老鼠碰撞盒 `w = 34, h = 26`（滑铲时 `h = 14`，宽 `44`）。

### 1.2 物理常量（必须完全一致，logic.js 内定义并导出 `MP.LOGIC.PHYS`）

```
GRAVITY        = 2400   // px/s^2
MAX_FALL       = 1500
RUN_SPEED      = 320    // 基础最大水平速度
RUN_ACCEL      = 2600
RUN_FRICTION   = 3200
AIR_ACCEL      = 1800
AIR_FRICTION   = 900
JUMP_V         = 780    // 一段跳初速 → 跳跃高度约 126.75px
DOUBLE_JUMP_V  = 660
JUMP_CUT       = 0.45   // 松开跳跃键时 vy *= 0.45（可变跳跃高度）
COYOTE_TIME    = 0.10   // 离地后仍可跳的宽限
JUMP_BUFFER    = 0.12   // 落地前按键缓冲
DASH_SPEED     = 900
DASH_TIME      = 0.18
DASH_CD        = 0.55
DASH_COST      = 30     // 体力消耗
STAMINA_MAX    = 100
STAMINA_RUN    = 4      // 每秒跑动消耗
STAMINA_REGEN  = 25     // 每秒静止恢复
SLIDE_TIME     = 0.55
SLIDE_SPEED_MUL= 1.15
BOUNCE_V       = 520    // 踩敌人弹起
```

### 1.3 无限关卡

- 关卡 `n` 从 1 起，**无限**。玩家死亡退回本关起点，耗尽 3 条命 → Game Over（可从第 1 关重开，
  最高分与关卡记录持久化）。
- 关卡长度 `len = Math.min(4200 + n * 260, 9600)`。
- 生成种子 `seed = hash32(n, runSeed)`（`runSeed` 为本次开局随机整数）。
  **同 (n, runSeed) 必须生成完全相同的关卡**（node 可测）。
- 难度系数 `diff = 1 + (n - 1) * 0.09`。
  - 敌人速度 `× min(1 + 0.03 * (n - 1), 1.9)`
  - 敌人密度 `× min(1 + 0.04 * (n - 1), 2.0)`
  - 高级道具出现率随 n 下降：`rarityWeight = max(0.35, 1 - 0.03 * (n - 1))`
  - 机关（压机/摆锤/激光）从 n≥3 起出现，n≥7 起密度提升。
- 生物群系（每 5 关一换，26 关后循环，难度继续上升）：

| 关卡 | id | 名称 | 主色 | 描述 |
|---|---|---|---|---|
| 1-5 | `kitchen` | 厨房 | `#ffb347` 暖黄 | 橱柜、番茄酱、奶酪塔 |
| 6-10 | `warehouse` | 仓库 | `#4aa3ff` 蓝灰 | 集装箱、货架、传送带 |
| 11-15 | `rainforest` | 雨林 | `#39d353` 翠绿 | 藤蔓、巨叶、荧光菇 |
| 16-20 | `lava` | 熔岩 | `#ff5a3c` 橙红 | 岩浆、黑曜石、蒸汽 |
| 21-25 | `ice` | 冰原 | `#7ff2ff` 青白 | 冰晶、雪丘、极光 |
| 26-30 | `void` | 虚空 | `#b07cff` 紫黑 | 星河、浮石、裂隙 |
| 31+ | 循环回 `kitchen` | 循环 | — | 难度继续上升 |

- 关卡结构 = 若干"段落 section"按权重随机拼接，每段一种主题：
  `flat`(平地) / `gap`(断崖) / `stairs`(阶梯) / `float`(浮空平台) / `enemy`(敌人区)
  / `machine`(机关区) / `sprint`(冲刺走廊) / `gauntlet`(综合挑战)。
  首段恒为 `flat`（长 320，给玩家热身），末段恒为 `sprint`（长 480 通向终点）。
- **可通关性硬约束**（logic.js 生成器必须保证，node 测试要断言）：
  - 断崖宽度 `gapWidth ≤ 175`（基础跑速可跳过）
  - 向上台阶单级高度 `≤ 100`（基础跳跃高度 126 可上）
  - 下落高度不限
  - 浮空平台之间水平间距 `≤ 300` 且高度差 `≤ 100`（可跳）；宽于 300 的跨越必须放移动平台或弹簧
  - 终点前 220px 内不得有敌人或伤害性机关
- 检查点 `checkpoints`：每段开头一个，x 坐标数组；死亡后从最近已激活检查点复活。
- 终点 `goalX = len - 120`，终点处画"奶酪城堡 + 旗子"。

### 1.4 道具与机关总表（**25 种拾取物 + 11 种危险物 = 36 种物件**，远超 20 种要求）

#### 拾取物（`type: 'pickup'`）——由 `MP.LOGIC.ITEMS` 导出，字段见 §1.6

| id | 中文名 | 稀有度 | 效果摘要 |
|---|---|---|---|
| `cheese` | 奶酪 | 1 | +150 分，+1 奶酪（收集度） |
| `coin` | 金币 | 1 | +80 分，+1 金币 |
| `gem` | 钻石 | 4 | +500 分，+3 金币 |
| `clover` | 四叶草 | 3 | 分数 ×2，持续 20s |
| `magnet` | 磁铁 | 3 | 吸取半径 160，8s |
| `catnip` | 猫薄荷 | 2 | 速度 +30%，10s |
| `sneakers` | 跑鞋 | 2 | 跳跃高度 +25%、速度 +15%，12s |
| `bubblegum` | 泡泡糖 | 3 | 永久获得二段跳（一次性） |
| `flame` | 火焰尾迹 | 3 | 冲刺时留下火焰带（灼伤敌人），8s |
| `giant` | 巨化药水 | 4 | 体型 ×1.6，可撞碎砖墙，12s |
| `mini` | 缩小药水 | 3 | 体型 ×0.65，可钻缝隙，12s |
| `feather` | 羽毛 | 2 | 空中下落减速 60%，10s |
| `shield` | 护盾泡泡 | 3 | 抵挡 1 次伤害 |
| `star` | 无敌星 | 4 | 无敌 5s + 撞碎机关 |
| `hourglass` | 时停沙漏 | 4 | 敌人/机关速度 ×0.35，6s |
| `energy` | 能量核心 | 2 | 能量 +40 |
| `heart` | 生命果 | 4 | 命 +1（上限 5） |
| `drill` | 钻头 | 3 | 冲刺可破墙，8s |
| `boots` | 弹力靴 | 2 | 跳跃高度 ×1.6，10s |
| `bell` | 复活铃铛 | 4 | 免死一次（坠坑/受击不消耗命） |
| `freeze` | 冰冻水晶 | 3 | 5s 内冻结全部敌人 |
| `emp` | 电磁脉冲 | 4 | 清除屏幕内敌人与伤害性机关，击退 |
| `multiply` | 双倍金币 | 3 | 金币收益 ×2，15s |
| `gravity` | 重力翻转 | 4 | 反重力 8s（天花板行走） |
| `rocket` | 火箭筒 | 4 | 装填 1 发，发射时向前贯穿冲刺（破一切） |

#### 危险物（`type: 'hazard'`，碰到扣命，`invuln` 期间无效）

`cat`(巡逻猫，有视锥) / `spike`(尖刺) / `pit`(坠坑) / `rock`(落石) / `fence`(电栅栏) /
`acid`(酸液池) / `pendulum`(摆锤) / `laser`(激光) / `blade`(风车刀片) / `drone`(飞行器) /
`crusher`(压机)

### 1.5 敌人（4 种，`MP.LOGIC.ENEMIES`）

`cat` 巡逻猫（地面往返，遇玩家加速扑咬）/ `drone` 飞行器（正弦飞行，撞击伤）
`wasp` 追踪蜂（缓慢追踪玩家）/ `turret` 炮台（固定，向玩家方向发射慢速弹幕，n≥5 出现）。

### 1.6 道具数据结构

```js
MP.LOGIC.ITEMS = {
  cheese: {
    id:'cheese', name:'奶酪', type:'pickup', rarity:1, icon:'cheese',
    score:150, coin:0, cheese:1,
    desc:'+150 分，+1 奶酪',
    effect: (p, g) => { g.cheese += 1; }        // g = 本局全局数据
  },
  // ... 25 项，字段齐全
};
```

`effect(p, g)`：`p` = 玩家状态对象，`g` = 全局局内数据（分数/金币/能量/关卡/统计）。
`effect` 必须**纯函数**（不改 DOM，不弹窗），返回 `undefined`。

### 1.7 计分系统（**6 套并存**，全部要在 HUD 可见）

| 系统 | 键 | 说明 |
|---|---|---|
| 主积分 | `score` | 距离分 + 拾取分 + 风格分 + 击杀分 + 过关奖励 |
| 金币 | `coin` | 经济货币，可用于复活（100 金币买 1 命）/ 关卡商店 |
| 奶酪 | `cheese` | 特殊收集物，每关收集数决定星级 |
| 风格分 | `style` | 靠动作累积，有等级 D→C→B→A→S→SS，随时间衰减 |
| 连击 | `combo` | 连续拾取/击杀不断链，倍率 = `1 + min(combo, 30) * 0.1`（上限 ×4） |
| 能量 | `energy` | 0-100，满槽可放必杀「鼠王冲刺」清屏 |

- 距离分：`每 12 世界单位 +1 分`。
- 风格动作加分（`style` 系统唯一来源）：

| 动作 | 加分 | 说明 |
|---|---|---|
| 冲刺 | +50 | dash 触发时 |
| 踩敌 | +120 | 从上方落到敌人身上 |
| 跳劈 | +80 | 空中按下"下劈"，砸地 |
| 滑铲 | +40 | 滑铲完成 |
| 二段跳 | +30 | 空中第二次起跳 |
| 极限落地 | +60 | 落地垂直速度 > 1100 |
| 擦弹 | +20 | 距离危险物 < 14px 但未碰撞 |
| 空中连击 | +10/段 | 同一跳中每累积 0.5s 空中时间 +10（上限 +60/跳） |

- 风格等级由风格分阈值决定（每关独立，重置）：
  D 0 / C 120 / B 320 / A 700 / S 1300 / SS 2200。
  风格分每秒衰减 `8%`，低于当前等级下限则降级（伴随降级提示）。
- 过关奖励：`score += 800 * n`（基础）+ 无伤 `+1500` + 奶酪收集 `+80/个` + 剩余命 `+600/条`。
- 星级：到达终点 ★；奶酪收集 ≥ 关卡目标数（`target = 6 + floor(n/2)`）★★；无伤且奶酪达标 ★★★。
- 能量：拾取敌人/伤害敌人 +6，拾取普通道具 +2，充能满可放「鼠王冲刺」。

### 1.8 打击感（重要，game.js + fx.js 协作实现）

- **hitstop**：受击 90ms / 击杀 55ms / 落地 25ms（落地速度 > 1100 时 45ms）。
- **震屏**：trauma 累加制，位移 = `trauma^2 * 18px`，每秒衰减 1.6。
  受击 +0.6，击杀 +0.25，落地 +0.15（按落地速度缩放），必杀 +0.8。
- **屏幕闪**：`flash(color, alpha, ms)`；受击红闪、拾取金闪、无敌白闪。
- **伤害数字 / 拾取飘字 / 连击弹窗**：`floatText(x, y, str, opts)`。
- **慢动作**：死亡 0.35 倍速 0.8s；必杀释放 0.5 倍速 0.5s。
- **速度线**：高速（>600）时屏幕边缘径向速度线。
- **冲击缩放**：相机 zoom punch（1.0 → 1.03 → 1.0，120ms）。
- **红晕**：低命时屏幕边缘红晕呼吸。
- `navigator.vibrate` 可在设置里关闭。

### 1.9 操作

- 桌面：`←/→` 或 `A/D` 移动，`空格`/`W`/`↑` 跳（长按更高），`Shift`/`J` 冲刺，
  `S`/`↓` 滑铲（地面）或跳劈（空中），`P`/`Esc` 暂停，`R` 重开本关。
- 移动端：左半屏**动态虚拟摇杆**（手指按下处即原点），右半屏三键：跳 / 冲刺 / 滑铲(跳劈)。
- 移动端按钮：`id="btn-jump"` `id="btn-dash"` `id="btn-slide"`；摇杆容器 `id="stick-zone"`，
  底座 `id="stick-base"`，摇杆头 `id="stick-knob"`。
- 触屏控件在触屏设备上默认显示（`ontouchstart` 或 `maxTouchPoints > 0`），
  设置里可强制开/关。

### 1.10 横竖屏

- 自动跟随 `window.orientation` / `matchMedia('(orientation: portrait)')`。
- **手动横屏模式**：设置面板提供三选项 `自动 / 强制竖屏 / 强制横屏`。
  - 强制横屏：优先 `screen.orientation.lock('landscape')`（需先 `requestFullscreen()`，
    失败降级）；再降级为 CSS `transform: rotate(90deg)` 包裹整个 `#app`（用 CSS 变量
    `--rot` 标记，旋转时按视口宽高互换尺寸）。
  - 强制竖屏：同上反向。
- URL 参数 `?orient=land` / `?orient=port` 可直接指定。
- 布局差异：
  - 竖屏：HUD 在顶部（分数/风格/连击一行，奶酪/能量/命下一行），触屏控件在底部左右。
  - 横屏：HUD 更紧凑（分数大号、其余小号并排一行），触屏控件仍在底部左右但更小。
- 安全区：`viewport-fit=cover` + `env(safe-area-inset-*)` 内边距。
- **竖屏取景**：竖屏按「世界可视高度 700 单位」定标（`scale = ch / 700`），世界宽度由
  屏幕宽高比反推；横屏按「可视宽度 960 单位」定标。高瘦屏不得把可视世界拉到
  上千单位（否则画面空旷、主角过小）。

### 1.11 镜头跟随（硬约束，角色永不出画）

- 目标：把角色放在视口 **45%** 处。
- **安全带硬约束**：角色相对视口的横向位置必须始终落在 **35%~55%** 区间内
  （与关卡边界求交；关卡首尾处由边界优先，允许贴边）。
  实现：`camX = clamp(平滑值, p.x - 0.55*viewW, p.x - 0.35*viewW)`。
  纯 lerp 追赶在竖屏（可视宽仅 ~320 单位）缓冲不足，冲刺会把角色甩出画面，
  因此**必须**有这条硬约束，不能只靠插值。
- 纵向：地面锚定（地面在视口 78% 处），角色跳高时镜头上移；再叠一条
  「角色不出画面上下边界」的兜底夹紧。
- 角色在任一时刻都不得完全跑出画面。

#### ⚠️ 渲染变换的顺序铁律（踩过一次的坑，务必遵守）

Canvas 的 `translate` 与 `scale` 复合顺序不同：

- `translate(t)` 后 `scale(s)` → 合成结果是 `s·p + t`（**平移量不被缩放**）
- `scale(s)` 后 `translate(t)` → 合成结果是 `s·(p + t)`（平移量被缩放）

相机要的是 `s·(p − camX)`，所以**必须先 `scale` 再 `translate`**：

```js
ctx.translate(cw / 2 + shakeX, ch / 2 + shakeY);  // 震屏用屏幕像素
ctx.scale(zoom, zoom);
ctx.translate(-cw / 2, -ch / 2);
ctx.scale(G.scale, G.scale);      // ← 先缩放
ctx.translate(-G.cam.x, -G.cam.y); // ← 再平移（顺序反了整幅画面会错位）
```

顺序写反会让整幅画面被顶偏 `camX × (scale − 1)` 像素：
屏幕越宽越明显（1920 宽 → scale=2 → 偏移量 = camX），
表现为**左侧一大块黑边、角色被推到画面边缘**，且越往后跑越偏。

**验收必须落到像素级**，不能只验逻辑值：

- 渲染时用 `ctx.getTransform()` 抓下真实 CTM（连同当时的 camX/camY/角色坐标一起快照，
  避免与实时状态产生竞态），断言把 `(camX, camY)` 送进 CTM 的结果落在屏幕 `(0,0)`。
- 并抽样画布像素，断言背景左边缘在屏幕 `x=0`（无黑边）。
- 再用 CTM 算出角色的**实际绘制屏幕坐标**，断言落在视口 30%~60%。

### 1.12 出生点

- 出生 x 随视口宽度自适应：`min(400, max(90, viewW * 0.42))`，
  保证**起跑瞬间角色就在画面 ~42% 处**，不会贴着左边缘看起来像「镜头没跟上」。
- 因此关卡首段必须是足够长的平地跑道：首段 `flat` 长 **520**（原 320），
  出生点脚下始终有实体地面。

### 1.12 道具密度（节奏控制）

- 单关道具总量 **≤ 40**；相邻道具最小间距 **≥ 70 单位**（基础跑速下 ≥ 0.2s）。
- 平均间距目标 **≥ 0.6 秒/个**（基础跑速 320px/s 下约 200+ 单位）。
- 布点方式：奶酪 / 金币 / 能力道具**交错**后统一单次分层均匀铺开（抖动 ≤ 35% 间距），
  再做一次最小间距整理。**禁止**在同一关内随机撒点（旧版会扎堆成一个道具接着一个）。
- 奶酪数量必须 **≥ 星级目标**（`target + 3` 余量），否则高关卡拿不到二星。
- 星级目标 `levelTargets(n).cheese = min(6 + floor(n/2), 28)`（关卡长度 9600 封顶，
  目标同步封顶，保证可达）。

### 1.13 全局游戏速度（设置项）

- 设置面板新增「游戏速度」五档：`0.5× / 0.75× / 1× / 1.25× / 1.5×`，默认 `1×`。
- 作用范围：整体时间缩放——物理推进、粒子、机关、敌人 AI 全部同步变慢/变快；
  固定步长仍为 1/60s（只是单位时间内的步数变化）。
- 持久化在 `mr.cfg.v1` 的 `speed` 字段。
- HUD 在场景名旁显示当前倍速标记（仅非 1× 时显示）。
- 切换即时生效，无需重开关卡。

---

## 2. 模块 API 契约

所有模块形如：
```js
window.MP = window.MP || {};
MP.XXX = (() => { 'use strict'; /* ... */ return api; })();
```

### 2.1 `MP.LOGIC`（子代理 A → `src/logic.js`）**纯逻辑，禁止出现 DOM/Canvas/window 引用**

```js
MP.LOGIC = {
  PHYS,                    // §1.2 全部常量
  BIOMES,                  // §1.3 生物群系表 {id,name,palette:{sky,silhouette,accent,fog},desc}
  ITEMS,                   // §1.6 25 项
  ENEMIES,                 // §1.5 4 项 {id,name,hp,speed,w,h,score,behavior}
  HAZARDS,                 // 11 项 {id,name,w,h,damage,kind}

  hash32(a, b),            // 确定性 32 位哈希
  mulberry32(seed),        // 返回 ()=>[0,1) 的确定性随机数生成器

  genLevel(level, runSeed),  // → LevelSpec（见下）
  genItemPlacements(level, runSeed, solids), // → 道具布点（在 solids 上方/空中）
  genEnemyPlacements(level, runSeed, solids),

  createPlayer(x, y),      // → 玩家状态对象（字段见 §2.1.1）
  createRun(),             // → 本局全局数据 {runSeed, level, score, coin, cheese, energy, lives, ...}

  stepPhysics(p, dt, world),  // 纯函数式推进一帧物理；world={solids, hazards, enemies, level}
  resolveCollisions(p, world),

  applyItem(p, g, itemId), // 施加道具效果，返回 {text, color} 提示
  addStyle(p, g, kind),     // 风格动作加分 + 等级判定
  addScore(g, base, kind),  // 加分并处理连击
  comboTick(g, dt),         // 连击计时衰减
  styleTick(p, g, dt),      // 风格衰减 + 等级变化

  scoreLevelClear(g, level, stats), // → 结算明细 {base, flawless, cheese, lives, total, stars}
  levelTargets(level),      // → {cheese: target}

  // 工具
  aabb(a, b),
  clamp(v, a, b),
};
```

**LevelSpec 结构**：
```js
{
  level, seed, biome, length, groundY, diff,
  solids: [ {x,y,w,h, kind:'ground'|'platform'|'oneway'|'crumble'|'mover'|'spring'|'wall'|'brick',
             // mover: vx,vy,range,phase ; crumble: hp; brick: hp
             vx:0, vy:0, range:0, phase:0, hp:1, breakable:false} ],
  hazards: [ {x,y,w,h, kind, ...params} ],
  pickups: [ {x,y,id,r:16,type:'pickup'} ],
  enemies: [ {x,y,w,h,kind,vx,hp,maxHp,range,y0,phase,state,t} ],
  checkpoints: [x,...],
  goalX,
  sections: [ {type, x0, x1} ],
  targetCheese,
}
```

**玩家状态结构**（§2.1.1）：
```js
{
  x,y,vx,vy,w,h, dir:1,
  onGround, wasOnGround, jumpsLeft, coyote, jumpBuf, jumpHeld,
  dashT, dashCd, dashDir, sliding, slideT,
  stamina, hp, invuln, hurtT, dead, deadT,
  buffs: { [id]: remainingSeconds },
  stylePts, styleLevel, styleCombo, styleTimer,
  combo, comboTimer, energy,
  lives, maxLives, hasBell, bellUsed,
  coins, cheese, gems, score,
  level, checkpointX, spawnX, spawnY,
  airTime, airComboScore, lastLandVy, groundedTime, runT, animT,
  megaReady, megaActive,
}
```

`stepPhysics` 必须是**纯函数**（不修改 world 之外的可变全局；返回值含新的 p），
以便 node 里做确定性回放测试。允许内部克隆需要的字段。

### 2.2 `MP.ART`（子代理 B → `src/art.js`）程序化 Canvas2D

```js
MP.ART = {
  init(),                      // 预渲染全部精灵到离屏 canvas
  sprite(key),                 // → HTMLCanvasElement（离屏），按 key 缓存；未知 key 返回 null
  draw(ctx, key, x, y, w, h, opts), // opts: {flip, rot, alpha, tint, scale}
  drawMouse(ctx, o),           // o: {x,y,w,h,dir,pose,t,runT,squashX,squashY,blush,dead}
                               // pose: 'run'|'idle'|'jump'|'fall'|'slide'|'dash'|'hurt'|'cheer'|'dead'|'sleep'
  backdrop(ctx, biomeId, camX, camY, viewW, viewH, t), // 视差背景（至少 3 层）
  ground(ctx, biomeId, x, y, w, h, t),                  // 地面/平台质感
  particleTex(kind),           // 'spark'|'smoke'|'star'|'flame'|'ring'|'glow' → canvas
  palette(biomeId),            // → {sky:[c1,c2], accent, silhouette, fog, glow}
};
```

**美术风格（务必遵守）**：**霓虹卡通 + 扁平几何**
- 主角：灰色蓝身体 `#8e9bb3`，白腹 `#e9eef7`，橙红围巾 `#ff6b3d`（辨识度锚点），
  奶酪黄背包 `#ffd23f`，黑豆眼带高光白点，粉内耳 `#ff9db0`，细长 S 形尾巴。
  比例：头大身小，耳朵大而圆，整体 3 头身以内。
- 4 条腿按 `runT` 做正弦摆动（相位错开），耳朵随速度后飘，围巾随速度飘扬。
- 背景：每个 biome 3 层视差（远景剪影 / 中景主体 / 近景装饰）+ 天空渐变 + 雾。
- 敌人/道具用**高饱和霓虹描边**风格：深色描边 + 亮色填充 + 外发光（用径向渐变，**禁 shadowBlur**）。
- 全部用 `ctx.fillRect/fillStyle/path` 程序化绘制，**禁外部图片、禁 SVG 外链**。
  预渲染到离屏 canvas 后 `drawImage` 上屏，保证性能。
- 每个精灵源码控制在合理体积，全文件建议 ≤ 60KB。

### 2.3 `MP.FX`（子代理 C → `src/fx.js`）Canvas2D 粒子

```js
MP.FX = {
  init(canvas),
  resize(w, h),
  addShake(amount),              // trauma 累加，上限 1
  shakeOffset(),                  // → {x,y}（trauma^2*18）
  burst(x, y, o),                 // o:{kind:'spark'|'fire'|'debris'|'smoke'|'star'|'confetti',
                                   //    n, color|colors, spd, size, life, grav, spread, angle}
  ring(x, y, o),                  // o:{r0,r1,life,color,width}
  explosion(x, y, scale, o),      // 组合：闪光+冲击环+火+碎片+烟
  trail(x, y, o),                 // o:{color,size,life}
  floatText(x, y, str, o),        // o:{color,size,crit,vy,life}
  popup(str, o),                  // 屏幕中央大字幕（连击/必杀/升级）
  flash(color, alpha, ms),       // 屏幕闪
  slowmo(scale, dur),             // 时间缩放（game.js 读取 MP.FX.timeScale()）
  timeScale(),
  update(dt),
  render(ctx, layer),             // layer:'world'（相机变换内）| 'screen'（flash/晕影/速度线/大字幕）
  clear(),
  setQuality(q),                 // 'high'|'low'：low 时粒子数减半、禁速度线
  setVignette(alive),             // 低命红晕
};
```

- 粒子对象池，硬上限 520（low 质量 260），超出丢弃最旧。
- **禁 `shadowBlur`**：发光用径向渐变 + `globalCompositeOperation='lighter'`。
- 伤害数字/飘字用系统字体描边（`strokeText` 深色描边 + `fillText` 亮色填充）。

### 2.4 `MP.SFX`（子代理 D → `src/audio.js`）WebAudio 全合成

```js
MP.SFX = {
  init(), unlock(),               // unlock 幂等，首个用户手势调用
  play(name, opts),               // opts:{rate=1, vol=1}
  startBGM(track), stopBGM(),     // track: 'menu'|'run'|'danger'|'clear'|'over'
  setVol(bgm, sfx), muted(b), setMuteBgm(b), setMuteSfx(b),
  names,                          // 全部 cue 名数组
};
```

**音效 cue 列表（≥22 个，名字固定）**：
`ui`(短 click) `jump`(上滑音) `djump`(二段更高) `land`(落地闷响) `slide`(摩擦噪声)
`dash`(破空 whoosh) `hurt`(闷响+哨) `die`(长下滑) `coin`(亮 ping) `cheese`(双音叮)
`gem`(三音琶音) `pickup`(上行双音) `powerup`(上行三连音) `stomp`(踩扁音) `kill`(小爆)
`explode`(大爆) `freeze`(玻璃感) `emp`(电流噪声) `mega`(必杀蓄力+释放)
`combo`(随连击上行短 blip) `style`(风格升级上行) `star`(闪烁) `clock`(倒计时滴答)
`checkpoint`(双音确认) `clear`(通关上行琶音) `gameover`(下行悲鸣) `music`? 取消。

**BGM 四轨**（全程序化，master gain ≈ 0.22）：
- `menu`：舒缓 pad + 慢琶音，100BPM。
- `run`：跳动的方波主旋律 + 贝斯 + 轻鼓点，132BPM。
- `danger`：紧张快速鼓点 + 半音，150BPM。
- `clear`：胜利小号 + 上行琶音。
- `gameover`：下行琶音 + 闷响。
- AudioContext 惰性创建；master 挂 `DynamicsCompressor` 防削波；
  `visibilitychange` 隐藏时停 BGM；所有节点用完 `stop()+disconnect()`。

### 2.5 `MP.UI`（子代理 E → `src/shell.html` + `src/style.css` + `src/ui.js`）

**shell.html 骨架要求**：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#0b0e18">
  <title>鼠族跑酷 · MOUSE RUSH</title>
  <!--STYLE_INLINE-->
</head>
<body>
  <div id="app">
    <canvas id="stage"></canvas>
    <div id="ui-root"></div>
  </div>
  <!--RESET_INLINE-->
  <!--MODULE_SCRIPTS-->
</body>
</html>
```
- `<!--STYLE_INLINE-->`、`<!--RESET_INLINE-->`、`<!--MODULE_SCRIPTS-->` 三个占位符各出现且仅出现一次。
- `#app` 是唯一的定位根；`#stage` 铺满；`#ui-root` 绝对定位铺满、`pointer-events:none`，
  内部可交互元素自己开 `pointer-events:auto`。

**JS 模块注入顺序（build.py 固定）**：
`art.js` → `audio.js` → `fx.js` → `logic.js` → `ui.js` → `game.js`

**MP.UI API**：
```js
MP.UI = {
  init(game),          // game = MP.game 对象
  screens: {menu, hud, pause, clear, over, settings},  // 各为 DOM 容器
  show(name),          // 切换到某屏（'hud' 不遮罩）
  showAll(),           // 全部隐藏（游戏内）
  update(snapshot),    // 每帧刷新 HUD 数据
  toast(text, kind),   // kind: 'info'|'good'|'bad'
  popup(text, kind),   // 大提示
  result(data),        // 结算面板渲染（关卡结算 / 游戏结束）
  setOrientationMode(mode),  // 'auto'|'portrait'|'landscape'
  orientationMode(),
  getTouchControls(),  // → {stickZone, stickBase, stickKnob, btnJump, btnDash, btnSlide} | null
  isTouch(),
  applyOrientation(),  // 根据 mode 与实际方向给 #app 加 class 'force-land' / 'force-port' / ''
  onResize(),
  vibrate(ms),         // navigator.vibrate 包装，设置可关
};
```

**UI 必须提供的屏幕与按钮**：
- **主菜单**：标题「鼠族跑酷 · MOUSE RUSH」+ 副标题、操作说明（键盘/触屏）、按钮：
  `开始游戏` / `继续游戏`（有存档时） / `设置` / `最高分` / `玩法说明`。
- **HUD**（游戏内常驻）：主积分（大号，数字滚动动画）、金币、奶酪、风格等级+分条、
  连击数（>1 时显示并有弹跳）、能量条、命数、关卡号、道具剩余时间图标条。
- **暂停面板**：继续 / 重开本关 / 设置 / 返回主菜单。
- **关卡结算**：得分明细（距离分/拾取分/风格分/击杀分/过关奖励逐行显示并有数字滚动）、
  星级评定（★动画）、风格等级评定、下一关 / 重玩 / 主菜单。
- **游戏结束**：本局总分、最高分、到达关卡、最高连击、最高风格等级、
  `再来一局` / `主菜单`。
- **设置面板**：BGM 音量、SFX 音量、震动开关、画质（高/低）、
  **横竖屏模式**（自动/强制竖屏/强制横屏）、触屏控件开关、
  存档导出/导入、清空存档。
- **玩法说明**：道具图鉴（25 种拾取物 + 11 种危险物，带中文名与说明）、
  风格动作表、计分规则说明。道具图鉴用 `MP.ART.sprite(key)` 渲染成 `<img>`/`<canvas>`。

**UI 交互约定**：
- 所有按钮 `type="button"`，带 `data-action="<actionName>"`。
- UI **不直接操作游戏状态**，一律通过 `game.onAction(actionName, payload)` 派发。
- UI **不得**在加载期调用 `MP.LOGIC`/`MP.ART` 的数据以外的函数；`init(game)` 里才可。

**CSS 要求**：
- 深色霓虹主题：底色 `#0b0e18`，强调色青 `#35e0c8` + 品红 `#ff4d8d` + 暖黄 `#ffd23f`。
- 字体：系统字体栈（`-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`），**禁外链字体**。
- 玻璃拟态卡片：`backdrop-filter: blur(10px)` + 半透明深色底 + 1px 亮边 + 霓虹外发光。
- 所有 UI 用 `transform`/`opacity` 做动画，避免 `width/height/top/left` 动画。
- `touch-action: none` 于 `#app`（防页面滚动缩放），`overscroll-behavior: none` 于 `body`。
- 竖屏/横屏用 `#app.force-land` / `#app.force-port` 类 + `@media (orientation: landscape)` 共同控制。
- 强制横屏的 CSS 旋转降级：`#app.rotated { position:fixed; transform: rotate(90deg); transform-origin: center; }`
  并由 JS 设置其宽高为交换后的尺寸。
- 按钮 ≥ 44px 触控高度，间距 ≥ 8px。

### 2.6 `MP.game`（主线 → `src/game.js`）

```js
MP.game = {
  state,                // 'menu'|'playing'|'paused'|'clear'|'over'|'settings'
  startRun(),           // 新开一局
  startLevel(n),        // 进入第 n 关
  retryLevel(),         // 重开本关
  nextLevel(),          // 下一关
  toMenu(), pause(), resume(), togglePause(),
  onAction(name, payload),  // 接收 UI 派发
  snapshot(),           // → HUD 快照对象
  getLevel(), getPlayer(),
  applyForceOrientation(mode), // 手动横屏：requestFullscreen + orientation.lock + CSS 兜底
};
```

---

## 3. 验收标准（全部必须满足）

1. `python3 build.py` 生成单文件 `index.html`，**零外部资源**（全文搜索 `http://`、`https://`、
   `src="`、`.png`、`.mp3` 不得出现真实外链；`data:` URI 允许）。
2. `node test/run.mjs` 全部通过：逻辑层 ≥ 40 项断言，覆盖
   关卡确定性（同种子同关卡）、可通关性（gap/rise 约束）、道具效果 25 项全覆盖、
   积分系统 6 套、风格等级升降、连击衰减、碰撞与死亡、结算与星级。
3. ego-lite UI 回归全绿：主菜单→开始→游玩→吃到道具→受击→暂停→设置切横屏→
   通关结算→下一关→Game Over 全流程，**控制台零报错**。
4. 竖屏（390×844）与横屏（844×390）均正常显示；手动切横屏按钮生效。
5. 移动端触屏可玩（虚拟摇杆 + 三键）。
6. 25 种拾取物与 11 种危险物全部在关卡中出现且可被触发（道具有效性测试）。
7. 6 套计分系统同时在 HUD 可见且数值正确变化。
8. 无限关卡：`startLevel(1..50)` 均可生成且第 31 关起循环生物群系。

---

## 4. 常见坑（请避免）

- 玩家 y 向下，所以"更高"= y 更小。跳跃 = `vy = -JUMP_V`。
- `stepPhysics` 里的 dt 必须固定 1/60（累加器模式），不要用可变 dt 直接积分物理。
- 移动平台：玩家站在 mover 上时要**跟随 mover 位移**（记录上一帧 mover 位移差）。
- 碎裂平台：踩到后 0.35s 掉落。
- 砖墙：只有 `giant` 或 `star` 或 `rocket` buff 状态或 `drill` buff 状态下冲刺才能撞碎。
- 触屏按钮要 `preventDefault()`，否则会触发选中/滚动。
- 暂停时必须冻结物理与粒子更新，但保持渲染循环。
- `visibilitychange` 隐藏页面时自动暂停。
- localStorage key 前缀统一 `mr.`（如 `mr.save.v1` / `mr.cfg.v1` / `mr.records.v1`）。
