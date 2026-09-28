# 复古像素摩托竞速 H5 复刻 — 玩法规则与技术规格调研

> 调研日期：2026-09-28。调研手段：WebSearch + WebFetch（Wikipedia / Sega Retro / Jake Gordon javascript-racer 源码等）。
> 标注约定：**[已证实]** = 有来源链接佐证；**[推测]** = 未查到确证，按街机惯例给出合理值。

---

## 一、原作识别

**结论：未识别到确切原作，按经典街机摩托竞速（Sega Hang-On / Super Hang-On 系）规则复刻。**

排查过程：
- 用「retro pixel motorcycle racing online multiplayer PING HUD」「pixel moto racer itch.io pseudo-3D desert sunset」等中英文关键词多轮搜索，未找到任何同时满足「像素摩托 + 伪 3D 背后视角 + 12 人排名（POS X/12）+ PING 延迟显示 + RIDER/BIKE 状态条」的已发行游戏。
- itch.io 已知同类：Tanuki Sunset Classic（滑板非摩托）、Sunset Drivers、Moto RKD Dash、UNDERGUATER MOTO 等，均无 PING/POS 12 人 HUD。参考：itch.io 赛车分类 https://itch.io/games/tag-racing 、https://itch.io/games/tag-outrun/tag-racing 。
- 截图带「PING 66」「P2 3RD」，强烈指向**某独立开发者的在线多人 web demo / 短视频平台传播的 H5 作品**（中文视频水印「倍速」），大概率未在主流平台收录，公开资料不可检索。

识别到的最接近血统：**Sega Hang-On（1985）/ Super Hang-On（1987）**——日落沙漠（紫平顶山）、多车道公路、路肩桶、背后视角摩托、检查点计时，全部是 Super Hang-On「Africa 非洲线」的标志性视觉母题 **[已证实，见 Wikipedia/Sega Retro 链接]**。截图中的「/12」12 人排名与 PING 是原街机没有的现代联网层，复刻时按「Hang-On 规则 + 伪联机（AI 补位 12 人）」处理。

---

## 二、玩法规则

### 2.1 比赛结构（计时检查点延长制）

| 项 | 规则 | 依据 |
|---|---|---|
| 赛道结构 | 一条线性长赛道，切分为若干 stage（路段），每个 stage 末端是 CHECKPOINT | Hang-On：一段式长路分 5 个 stage **[已证实]** |
| 倒计时 | 开局给定初始时间，过检查点追加时间，**剩余时间滚动累加进下一 stage** | Hang-On **[已证实]** |
| 初始时间 | 街机惯例 **45~60 秒**，复刻建议 **50 秒** | **[推测]** |
| 每检查点追加 | 视路段长度 **+30~60 秒**，随 stage 推进递减（前期宽松后期紧），建议 45/40/35/30 | **[推测]** |
| 游戏结束 | 时间归零 → GAME OVER（"TIME UP"）；跑完全部 stage → GOAL（胜利结算，按剩余时间加分） | Hang-On **[已证实]**（GOAL 加分为推测） |
| Stage 数 | Hang-On 5 段 **[已证实]**；Super Hang-On 按大洲线：非洲 6 / 亚洲 10 / 美洲 14 / 欧洲 18 段 **[已证实]**。H5 复刻建议 **6~8 段 × 每段 40~60s**，单局 3~5 分钟 | 混合 |
| 主题推进 | Super Hang-On 每条线沿途换景（非洲线：沙漠→草原→黄昏），日落沙漠对应其非洲线开端视觉 | **[已证实]**（换景节奏为推测） |

### 2.2 开局

- 起跑排位于出发格（Hang-On 出发格上有其他摩托但**不直接竞速**，只比时间）**[已证实]**；截图作品改为 12 人排名竞速 → 复刻采用「1 名玩家 + 11 个 AI 对手（其中 1 个标为 P2 展示位）」，AI 用与玩家相同的车辆物理 **[推测]**。
- Super Hang-On 开局先**选 BGM**（4 首曲，机制借用自 Out Run）**[已证实]** → 复刻可选：标题界面选曲。
- 起步：街机惯例「绿灯起步」，抢跑（红灯踩油门）会打滑/罚时 **[推测]**；复刻可简化为 3-2-1-GO 倒计时。

### 2.3 操控与速度

| 项 | 数值 | 依据 |
|---|---|---|
| 变速箱 | Hang-On 街机为 LO/HI 两档手动：LO 档极速 **156 km/h**、HI 档极速 **324 km/h**；过弯必须降 LO | LO/HI 档位与 156/324 数字为街机通行记载 **[已证实（档位制）/数值为通行记载]** |
| Super Hang-On | 改为自动档 + 涡轮：普通极速 **280 km/h**，达到极速后按 TURBO → **324 km/h**（增益约 +44 km/h / +16%）， turbo 只能在全油门且已到极速时激活，松油门即取消 | **[已证实]** |
| H5 复刻建议 | 单档 + 长按/双击加速键触发 turbo（0.3 马赫声效+镜头拉伸），极速 324 km/h，turbo +20% | **[推测]** |
| 普通巡提速 | 截图起步 35 KM/H，加速到 280 顶层约需 8~15 秒，加速度曲线 easeOut | **[推测]** |
| 转向 | 倾斜车身转向，急弯需压满；弯道离心力会把车往外抛（速度越快越明显，见 §4 centrifugal） | Hang-On **[已证实]**（物理公式见 §4） |

### 2.4 离路 / 碰撞

| 项 | 规则 | 依据 |
|---|---|---|
| 压上路肩 | 车身抖动 + 轻微减速 | 街机惯例 **[推测]** |
| 完全离路（越过红白路缘到沙地） | 强减速到约 1/4 极速以下（javascript-racer：offRoadLimit = maxSpeed/4，offRoadDecel = -maxSpeed/2） | **[已证实（源码）]** |
| 撞静止障碍（桶/广告牌/仙人掌） | Hang-On：摔车，**骑手飞出、车辆滑行、重置回路上**，损失 2~3 秒；javascript-racer 实现：速度归到 maxSpeed/5、车停在障碍物前 | Hang-On 摔车 **[已证实]**；数值 **[已证实（源码）]** |
| 撞其他车手 | 从后方追撞：自己骤降到对方速度（speed = car.speed × (car.speed/speed)），不摔车只掉速；对手不会摔 | **[已证实（源码实现）]**（原街机表现的推断成分见 §4） |
| 摔车惩罚 | 街机惯例摔车动画 1.5~2.5s + 重新起步从 0 加速；复刻建议 **2 秒 + 速度清零** | **[推测]** |

### 2.5 排名（POS X/12）

- 原街机（Hang-On）无排名系统（只比时间）**[已证实]**；「4/12 POS」为该截图作品自有系统。
- 复刻方案：每帧比较 12 名车手的**赛道累计里程**（z + 圈数修正），实时算名次；超越时 POS 数字弹跳闪烁 + 「第 4→第 3」音效 **[推测]**。
- AI 对手策略：按目标圈速给出 0.85~1.05 倍玩家极速的个体极速 + 弯道自动减速 + 前车避让（javascript-racer 的 updateCarOffset 可直接用）**[推测，源码可证]**。

### 2.6 胜负与结算

- 时间内跑完全程 = 胜利，按 剩余时间 × 系数 + 名次分 + 连续 turbo 里程 结算 SCORE **[推测]**。
- 街机惯例：GAME OVER 后显示Continue 倒计时 10s，可投币续关（H5 里改「看广告/分享续关」或直接省略）**[推测]**。

---

## 三、HUD 术语对照（截图元素 → 含义 → 复刻方案）

| 截图元素 | 含义 | 复刻方案建议 |
|---|---|---|
| 左上 `4 /12 POS` 大字 + 横向进度条 | 当前名次 4 / 共 12 名；进度条 = 赛程推进（已跑里程 / 总里程，或距下一检查点） | 像素字渲染 `POS 4/12`；进度条按 trackLength 分段打刻度（每检查点一格）**[推测：进度条口径]** |
| 右上 `0'01"23` | 比赛总用时：分'秒"百分秒（01 秒 23 → 1.23s）。街机计时 HUD 标准格式 | `M'SS"cc` 定宽像素字体，每帧刷新 **[已证实：街机惯例格式]** |
| 右上绿色 `PING 66` | 网络延迟 66ms（绿=流畅）。证明原作为在线多人 | 复刻：若做真联机显示真实 ws RTT；若单机可显示模拟值（40~80 随机抖动）作氛围装饰。绿 <100 / 黄 <200 / 红 ≥200 |
| 左下分段能量条 + `35 KM/H` 大字 | 35 km/h 实时速度；分段条 = **turbo/加速槽**（Super Hang-On turbo 的现代化改造：攒满一段可短时爆发）或速度档位表 | 建议做成 turbo 能量槽：满 1 段可按 turbo 1.5s，共 4 段；KM/H 用 3 位数大像素字 **[推测]** |
| 底部中 `P2 3RD` + 绿色分段条 | 第二名人类玩家（P2）当前名次第 3 及其能量/进度 | 双人（本机同屏或网络双人）时显示队友/对手玩家状态；单人复刻可保留为「最近对手车手」状态条 **[推测]** |
| 右下 `RIDER` 黄条 + `BIKE` 蓝条 | 车手状态（体力/耐力）与 车辆状态（耐久/油量）。黄=RIDER 蓝=BIKE 是街机摩托 HUD 惯例配色分工 | 复刻：RIDER 条随摔车/长时间压弯消耗，BIKE 条随碰撞扣减；任一归零 → 摔车/重置。轻量化方案：BIKE=油量（随时间缓降，检查点补满）**[推测]** |
| CRT 扫描线 | 原作视频滤镜 | CSS `repeating-linear-gradient` 覆盖层（2px 周期，opacity 0.08~0.12）+ 轻微暗角，勿加过强弧面畸变 |
| 路景：中央双黄线、白虚线、红白路缘、橙色路肩桶 | 对向/同向分道公路；rumble strip 提示弯道 | 对应 §4 的 lanes + rumbleLength + 路缘配色；双黄线 = 两条 lane marker 合并绘制 **[推测：绘制口径]** |

---

## 四、伪 3D 算法要点（Jake Gordon "Javascript Racer" 体系）

权威来源：https://codeincomplete.com/posts/javascript-racer/ ，源码 https://github.com/jakesgordon/javascript-racer （以下常量与代码逐行核对自 `v4.final.html` 与 `common.js`）。配套理论文：Lou's Pseudo 3D Page http://www.extentofthejam.com/pseudo/ 。

### 4.1 核心模型

公路 = 段（segment）数组，每段长 `segmentLength`，段内两个世界坐标点 `p1/p2`（`world.y`=海拔，`world.z`=里程）。**曲线不是真 3D 曲线**，而是每段带一个 `curve` 值，渲染时逐段横向累积偏移（假弯道）；山丘是 `world.y` 真实高度 + 屏幕裁剪（maxy）。

### 4.2 关键常量（v4.final 原值，可直接照抄）

```js
fps = 60;  step = 1/60;
segmentLength = 200;        // 每段世界长度
rumbleLength  = 3;          // 每 3 段切换一次红/白路缘颜色
roadWidth     = 2000;       // 半路宽（路面从 -roadWidth 到 +roadWidth）
lanes         = 3;          // 车道数（截图为多车道+双黄线，建议 lanes=6 自绘分隔线）
fieldOfView   = 100;        // 视场角（度）
cameraHeight  = 1000;       // 摄像机离地高度
drawDistance  = 300;        // 绘制段数（视距）
fogDensity    = 5;          // 指数雾密度
centrifugal   = 0.3;        // 离心力系数

cameraDepth = 1 / Math.tan((fieldOfView/2) * Math.PI/180); // ≈0.84
playerZ     = cameraHeight * cameraDepth;                  // 玩家在摄像机前方的投影距离 ≈840
resolution  = height/480;

maxSpeed     = segmentLength/step;      // =12000 单位/s（保证每帧最多跨 1 段，简化碰撞）
accel        =  maxSpeed/5;             // 加速度
breaking     = -maxSpeed;               // 刹车
decel        = -maxSpeed/5;             // 自然滑行减速
offRoadDecel = -maxSpeed/2;             // 离路减速
offRoadLimit =  maxSpeed/4;             // 离路速度下限（低于此不再减速）
```
速度→表显换算：源码 HUD 显示 `5*round(speed/500)` ≈ speed/100（mph）。要显示 km/h：`display = Math.round(speed / maxSpeed * 324)` 即可对齐街机 324 顶速 **[推测：映射比]**。

### 4.3 投影公式（common.js `Util.project`，原样）

```js
function project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
  p.camera.x = (p.world.x || 0) - cameraX;
  p.camera.y = (p.world.y || 0) - cameraY;
  p.camera.z = (p.world.z || 0) - cameraZ;
  p.screen.scale = cameraDepth / p.camera.z;                                  // 透视除法
  p.screen.x = Math.round((width/2)  + (p.screen.scale * p.camera.x * width/2));
  p.screen.y = Math.round((height/2) - (p.screen.scale * p.camera.y * height/2));
  p.screen.w = Math.round((p.screen.scale * roadWidth * width/2));            // 路半宽的屏幕宽
}
```

### 4.4 渲染主循环（曲线/山丘/雾/裁剪）

```js
baseSegment = findSegment(position);            // findSegment(z) = segments[floor(z/segmentLength) % N]
playerY     = interpolate(playerSegment.p1.world.y, p2.world.y, playerPercent); // 玩家当前海拔
maxy        = height;                           // 山丘裁剪线
x = 0;  dx = -(baseSegment.curve * basePercent);

for (n = 0; n < drawDistance; n++) {
  segment = segments[(baseSegment.index + n) % segments.length];
  segment.fog = exponentialFog(n/drawDistance, fogDensity);   // 1/ pow(E,(d*d*density))
  segment.clip = maxy;

  // 关键：cameraX 里减去累积弯道偏移 x —— 用平移伪造曲线
  project(segment.p1, playerX*roadWidth - x,     playerY + cameraHeight, position, ...);
  project(segment.p2, playerX*roadWidth - x - dx, playerY + cameraHeight, position, ...);
  x  += dx;
  dx += segment.curve;                          // 每段再加增量 → 弯越深偏移越快

  // 三种剔除：在自己身后 / 背面（p2.y>=p1.y）/ 被已画山丘挡住（p2.y>=maxy）
  if (p1.camera.z <= cameraDepth || p2.screen.y >= p1.screen.y || p2.screen.y >= maxy) continue;
  renderSegment(...);                            // 先画草地全宽 → 路缘 → 路面 → 车道线
  maxy = segment.p1.screen.y;                    // 更新裁剪线
}
// 第二趟：从远到近画 sprites/车辆/玩家（painter's algorithm），用 segment.clip 裁剪被山丘遮住的下半部
```

路缘/车道线宽（common.js）：`rumbleWidth = 投影路宽 / max(6, 2*lanes)`；`laneMarkerWidth = 投影路宽 / max(32, 8*lanes)`。sprite 缩放基准：`SPRITES.SCALE = 0.3 * (1/PLAYER_STRAIGHT.w)`（玩家车宽≈半路宽的 1/3）。

### 4.5 每帧更新（操控物理，原样要点）

```js
speedPercent = speed / maxSpeed;
dx = dt * 2 * speedPercent;          // 满速时 1 秒可从路最左横移到最右
playerX -= dx * speedPercent * playerSegment.curve * centrifugal;   // 离心力外抛
position = increase(position, dt * speed, trackLength);             // 里程推进（循环赛道取模）
// 离路：|playerX|>1 时若 speed>offRoadLimit 则施加 offRoadDecel；撞 sprite → speed=maxSpeed/5 并停在障碍前
// 追撞车：speed = car.speed * (car.speed/speed)，位置顶到该车后方
playerX = limit(playerX, -3, 3);     // 允许冲出路边最多 3 倍半路宽
// 背景视差：skyOffset += skySpeed(0.001) * curve * (位移/段长)；hill 0.002 / tree 0.003
```

### 4.6 赛道描述语法（buildRoad DSL，原样）

```js
addRoad(enter, hold, leave, curve, y) {
  startY = lastY(); endY = startY + y * segmentLength;  // y=多少段长的高度差
  for n in enter: addSegment(easeIn(0,curve,n/enter),              easeInOut(startY,endY,n/total));
  for n in hold:  addSegment(curve,                                easeInOut(startY,endY,(enter+n)/total));
  for n in leave: addSegment(easeInOut(curve,0,n/leave),           easeInOut(startY,endY,(enter+hold+n)/total));
}
ROAD = { LENGTH: {NONE:0, SHORT:25, MEDIUM:50, LONG:100},
         HILL:   {NONE:0, LOW:20,  MEDIUM:40, HIGH:60},
         CURVE:  {NONE:0, EASY:2,  MEDIUM:4,  HARD:6} };
addStraight(num)          = addRoad(num,num,num, 0, 0);
addHill(num,height)       = addRoad(num,num,num, 0, height);
addCurve(num,curve,height)= addRoad(num,num,num, curve, height);
addSCurves()  = 5 段连招: (-EASY,0)→(MEDIUM,+MEDIUM)→(EASY,-LOW)→(-EASY,+MEDIUM)→(-MEDIUM,-MEDIUM)
addLowRollingHills() / addBumps()（8 个 10 段小起伏 ±2~8） / addDownhillToEnd()（长下坡归零海拔）
```
一条完整示例赛道（resetRoad）：直道→起伏丘→S 弯→弯+丘→颠簸→起伏丘→超长弯→直道→高山丘→S 弯→…→`addDownhillToEnd()` 收尾回 y=0；起点两段涂白色（START）、终点 rumbleLength 段涂黑（FINISH）。起点线/检查点可直接用同机制在指定段换色绘制。

### 4.7 复刻增补（截图特有元素）

- **多车道+双黄线**：lanes=6，中央两条 lane marker 用黄色实线绘制，其余白色虚线（dash 按段 index 交替画/不画）**[推测]**。
- **红白路缘**：COLORS.LIGHT.rumble / DARK.rumble 改为红/白交替（原库默认灰系）；每 `rumbleLength` 段切换。
- **日落沙漠背景**：三层视差图（天空渐变橙粉+太阳 / 紫色平顶山剪影 / 近景仙人掌·路肩桶 sprite），沿 4.5 的 skyOffset/hillOffset/treeOffset 三速视差。
- **CRT 扫描线**：canvas 上叠一层 CSS 网格即可，勿在 canvas 内画（省性能）。

---

## 五、参考资料

1. Wikipedia — Hang-On（1985，玩法/5 stage/检查点/摔车）：https://en.wikipedia.org/wiki/Hang-On
2. Wikipedia — Super Hang-On（280/324 km/h、turbo、四线 stage 数、选曲）：https://en.wikipedia.org/wiki/Super_Hang-On
3. Sega Retro — Hang-On（出发格对手不直接竞速、赛道分段）：https://segaretro.org/Hang-On
4. Jake Gordon — "Javascript racer" 系列文章：https://codeincomplete.com/posts/javascript-racer/
5. jakesgordon/javascript-racer 源码（本规格 §4 全部常量/代码核对处）：https://github.com/jakesgordon/javascript-racer （`v4.final.html`、`common.js`）
6. Lou's Pseudo 3D Page（伪 3D 赛车渲染理论权威长文）：http://www.extentofthejam.com/pseudo/
7. itch.io 赛车游戏分类（原作排查用）：https://itch.io/games/tag-racing 、https://itch.io/games/tag-outrun/tag-racing
8. 原作排查结论：未命中 → 详见 §一（搜索关键词组合：retro pixel moto multiplayer PING HUD / 伪3D 像素摩托 联机 / itch.io outrun motorcycle 等）
