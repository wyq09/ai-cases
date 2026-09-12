# 数字华容道 slide-puzzle — 模块契约

单文件 H5 复刻：木质卡通数字滑块拼图（经典 15-puzzle，截图为 5×5）。支持 3×3~10×10，六款主题配色，通关战绩历史。
开发期分模块文件，build.py 合并为单文件 index.html。**全部程序化生成，零外部资源**（无图片/音频/字体文件）。
无框架无构建依赖，手机端自适应。

## 参考图（动手前必 Read）

- 整图: `<proj>/ref/original.png`（720×1280，若缺从 cache 路径拷贝）
- 裁片: `ref/top-buttons.png`（左上圆钮）、`ref/status-row.png`（计时/牌匾/步数行）、`ref/tile-closeup.png`（数字块细节）、`ref/board-corner.png`（棋盘边框）、`ref/bottom-buttons.png`（重置/提示按钮）、`ref/leaves.png`（落叶+右侧紫角，紫角是宿主 App UI **不复刻**）

## 全局命名

`window.SP` 为唯一顶层命名空间，模块挂 SP.LOGIC / SP.ART / SP.AUDIO / SP.FX / SP.CONFIG_PANEL。
每模块文件顶层形如 `window.SP=window.SP||{}; SP.XXX=(()=>{...return api})();`
**禁止** `const SP` 或 `window.SP =`（覆盖式赋值会互相清掉，build 同页拼接）。

## 视觉规格（锁死，取色自参考图）

- 色板：背景沙金 #ecd29c→#d9ba81（径向暗角）；棋盘框 #a8703c（描边 #7c4a22、外圈高光 #c89a5e）；凹槽 #6d3b24；数字块面 #fbeecb→#f3d69a 渐变、块描边 #b98a4e、内嵌细线 rgba(122,74,34,.35)；数字 #5b2410；胶囊底 #a85a2e→#8a4423、字/图标奶油 #f7e6c4；底部按钮面 #f7e4b2、边 #b5713a、字 #6b3212。
- 字体：`Georgia,'Times New Roman','Songti SC','STSong',serif`，数字与中文都用衬线。
- 设计稿 720×1280，#stage transform:scale 适配视口（主线负责）。
- 数字块：圆角 14px，内嵌一圈细线（inset 8%），微立体（上亮下暗 + 底部投影）。空格露凹槽色。
- 圆形按钮（左上）：奶油粗图标 + 红棕底放射渐变 + 奶油外环 + 深棕外描边，按下下沉 2px。
- 底部胶囊按钮：奶油木纹面（水平细纹）+ 橙棕厚边 + 外圈奶油线，图标+文字横排。

## 游戏规格（锁死）

- N×N，N∈{3,4,5,6}，默认 5，牌匾显示 `N×N`，点牌匾循环换尺寸并重开一局。
- 打乱：随机排列 + 奇偶校验修正保证可解（N 奇：逆序数偶可解；N 偶：逆序数+空格所在行（从底数）奇偶关系）。
- 操作：点与空格相邻的块滑入；也支持棋盘上滑动（swipe 方向对侧块滑入空格）。一次滑一步，步数 +1。
- 计时：首次移动开始计时，mm:ss。步数、用时随局持久化，刷新恢复。
- 重置：重新打乱，步数/计时清零。
- 提示（行为为**推测**，原版不可考）：点按 = 自动把一个数字归位（带动画，逐步走）；**长按 600ms = 自动演示**连续归位直到完成，任意点按中断。
- 胜利：1..N²-1 顺序排列 → 落叶粒子爆发 + 胜利音效 + 结算弹层（用时/步数/最佳纪录，按尺寸存 best）。
- 求解器：n≤6 加权 A*（manhattan+linear conflict，w 按尺寸 2.2~4）；n≥7 或 A* 失败用 planSeq 顺序归位求解器（单块 moveTileTo + 行尾/列尾 planPair 双块 A* + 残局 BFS，全尺寸稳定可解）。

## LOGIC（主线自写，子代理勿实现）

```js
SP.LOGIC = {
  solved(n) -> Int8Array/array,           // [tile,...] row-major，0=空
  shuffle(n, rng) -> board,               // 奇偶可解
  blankOf(board) -> i,
  canMove(board, n, i) -> bool,           // i 与空格相邻
  applyMove(board, n, i) -> newBoard|null,
  isSolved(board) -> bool,
  plan(board, n, opt) -> [i,...]|null     // 从 board 到复原的滑块索引序列
};
```

## ART（子代理 → src/art.js）

```js
SP.ART = {
  icon(id) -> dataURI  // viewBox 起头无宽高，单图源码 ≤3KB
};
// ids: back(左箭头) sndOn sndOff timer(秒表) foot(脚印) reset(双循环箭头) bulb(灯泡)
//      gear(齿轮) trophy(奖杯) close(×)
SP.ART.leaf(i) -> dataURI  // i=0..2 三种落叶形状，橙黄渐变+叶脉，带短柄
```

风格：奶油色 #f7e6c4 图形 + 深棕 #5b2410 细节，圆角卡通、2.5D 微浮雕感（同参考图裁片）。

## AUDIO（子代理 → src/audio.js）WebAudio 程序化合成，禁止外部音频/BGM

```js
SP.AUDIO = { unlock(), play(name), setVolume(v), setMuted(b), applyOverrides(map), names:[...] };
```

cue 表：`button`(轻 click 30ms) `move`(木块 tock：低通噪声+190Hz 正弦衰减 ~70ms) `denied`(低沉 thud ~100Hz) `shuffle`(三连快速 tock) `hint`(双音上行 chime ~300ms) `snap`(极轻高频 tick，音量自降) `win`(木琴五声琶音上行+收尾和弦 ~1.6s)。
要求：AudioContext 惰性创建；unlock 幂等（首次手势 resume）；节点用完 stop+disconnect；applyOverrides 接 {cue:dataURL}，解码失败回落合成音。

## FX（子代理 → src/fx.js）Canvas2D 粒子，禁止 shadowBlur

```js
SP.FX = { init(hostEl), leafBurst(x,y,n,opt), stopAll() };
```

落叶爆发：叶片 = 贝塞尔叶形（离屏预渲染 3 色 3 形 × 4 旋转帧），初速四散 + 重力 + 水平摇摆 + 自转，2~2.6s 淡出；对象池、上限 300、DPR≤2、resize 自适应、document.hidden 暂停。调色 #e8912a #d96b1f #f2b23a #b5541c。

## CONFIG_PANEL（子代理 → src/config-panel.js）

```js
SP.CONFIG_PANEL = { mount(el), open(tab?), close(), isOpen(), onChange(cb) };
```

- 底部抽屉，类名前缀 `spcp-`，样式内联注入，中文文案，大点击区，overscroll-behavior:contain。
- Tab 玩法：尺寸 3/4/5/6（segmented）、落叶动画开关、音效开关、音量滑条。
- Tab 图片：上传图片开启图片模式（file→canvas 压缩长边 ≤720 → dataURL）、恢复数字模式按钮、说明一行。
- Tab 音效：move/win/button 三项自定义上传 + 恢复默认 + 试听按钮。
- Tab 数据：导出配置 JSON（下载）、导入配置（file）、恢复默认配置。
- 内部持 work 深拷贝，任何编辑立即 onChange(完整 cfg 快照)；**永不直接碰 localStorage**；存在性兜底（SP.ART/SP.AUDIO 可能未装载）。

## 配置 schema（主线定）

```js
{ n:5, leaves:true, sound:true, vols:{sfx:0.9}, picture:null /*dataURL*/, sounds:{} /*cue:dataURL*/ }
```

持久化：localStorage `sp_config_v1` / `sp_state_v1`（主线读写）。URL 参数：`?reset=1` `?n=3..6` `?muted=1` `?autoplay=1`（主线处理）。

## DOM 骨架（主线负责壳与全部接线）

`#stage > #bgLeaves / #topBar(#btnBack #btnSound #btnGear) / #statusRow(#pillTime #timeVal | #plaque #sizeVal | #pillSteps #stepVal) / #board > #grid(.tile×N²-1) / #bottomBar(#btnReset #btnHint) / #fxCanvas`；弹层 `#winOverlay #helpOverlay #cfgHost #toast`。

## 主线负责（勿动他人模块）

logic.js / game.js（渲染、状态机、计时、持久化、提示与自动演示接线）/ shell.html / build.py / 集成测试 / README / 案例库登记。
