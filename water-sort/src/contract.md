# 倒水挑战（water-sort）— 模块契约

单文件 H5 复刻「倒水挑战 · Water Sort Puzzle」：经典倒水排序益智，**无限关卡**（程序化生成+求解器验证必可解），手机竖屏优先。开发期分模块文件（`src/*.js`），最终 `build.py` 合并为单文件 `index.html`。
所有模块挂 `window` 全局，无构建、无外部依赖、**零外部资源**（无外部字体/图片/音频，全部程序化生成）。

参考图（**动手前必 Read**，目录 `ref/`）：
- `ref/splash_full.png` — 启动页整屏：橙色底+猪鼻暗纹、彩色艺术字 logo、猪骑红色摩托驮快递箱、蓝色加载条
- `ref/splash_logo.png` — logo 放大 2 倍：绿溅块衬底、「倒水挑战」橙黄胖字白描边、小瓶子倾倒装饰
- `ref/splash_pig.png` — 骑摩托的猪放大 2 倍：红头盔粉猪、红色小摩托、棕色大快递箱
- `ref/game_full.png` — 游戏页整屏：紫墙+木框窗（窗外蓝天）、吧台沿后三只戴盔小猪（红/黄/蓝）、大木桌面、三只玻璃瓶（黄/黄红/红）、左上黄色暂停圆钮、顶中「第1关」白底棕字胶囊、右上 0%、底部蓝猪对话气泡「把同色的水倒入一个瓶子里」
- `ref/game_top.png` / `ref/game_bottles.png` / `ref/game_bottom.png` — 各区域放大 2 倍裁片

## 游戏规格（主线已定，勿改）

**核心循环**：点击瓶子拿起（升起），再点目标瓶倾倒——源瓶顶同色段倒入目标（目标空 或 顶色相同 且 有空间），同色 4 格聚满一瓶即完成一色；**全部瓶 空或纯色 = 过关**，进入下一关，无限递进。

- 容量 capacity=4（可配置 3/4/5）。颜色数按关卡递增：`K(n) = min(3 + floor((n-1)/2), cfg.maxColors)`（1,2关→3色；3,4关→4色；…封顶 cfg.maxColors 默认 10）。空瓶数 E = cfg.empties（默认 2）。总瓶数 = K + E，上限 12（>6 瓶两行排布）。
- **生成必可解**：seed=`(n*2654435761^0x9E3779B9)>>>0` 的 mulberry32；K×capacity 个色单位随机洗牌分装 K 瓶；「已有整瓶纯色」重摇；**DFS 求解器验证可解**，不可解 attempt+1 重摇（seed+attempt*7919）。生成即确定（同关同布局，刷新/续玩一致）。
- **求解器**（同一份用于验证/提示/AI演示）：状态 key=各瓶 join 后排序；剪枝：空瓶不出、已完成瓶不出、纯色瓶→空瓶跳过、空→空跳过；节点上限 3 万，超限按不可解。返回步序 `[{from,to,n}]` 或 null（玩家可能把自己玩死锁 → 提示按钮 null 时 toast「卡住啦，试试撤销」）。
- 无限 undo（每步前快照）；每关加瓶（+1 空瓶）次数 cfg.addBottle 默认 1；提示按钮自动演示一步；重玩本关重摇=同 seed 重生成。
- 进度 % = 已完成色数 / K。步数统计，过关面板展示本关步数+历史最佳。
- AI 演示（`?demo=1`）：循环 求解→逐步动画执行，卡死自动撤销重来，过关自动下一关——供浸泡测试与挂机演示。
- 胜利演出：FX 彩带 + 三猪欢呼 + 「过关！」面板（步数/最佳/下一关按钮）。
- 新手气泡：第 1-2 关底部蓝猪气泡「把同色的水倒入一个瓶子里」，首次倾倒后淡出。

## 视觉风格（全局锁，所有模块遵守；色值取自参考图实采）

扁平卡通风、实色色块为主、克制高光；禁止 blur 阴影/霓虹/玻璃拟态/Emoji 图标/紫蓝科技渐变。卡通猪是参考图固有风格，照画。

- 房间（warm 默认）：墙紫 `#8A6FA5`（下缘更深 `#7A5F93`）｜窗框木 `#B98A5A`、窗内天空 `#BFE3F0`+白云、十字棂 `#A5764A`｜吧台沿立面 `#8A5533`、台面高光 `#C89A6B`｜大桌面木板 `#A96A3F`、板缝 `#8F5530`、板面微渐变加深至 `#965C34`（桌面整体允许同色系明度渐变，禁跨色相渐变）
- 启动页：底橙 `#F7A83B`、猪鼻暗纹 `#E8952C`（大圆+两小鼻孔椭圆，散布旋转）、加载条槽 `#D8821F` 内浅 `#FBD9A0` 填充蓝 `#4FA8E0`
- 猪：粉皮 `#F2A9B8`、耳内/鼻孔 `#D97F93`、眼白+黑瞳、头盔/衣服三色 红`#E8483F` 黄`#F5B93C` 蓝`#3FA0D8`、头盔高光白
- 瓶：玻璃淡白 `rgba(255,255,255,.28)` 描边 `rgba(255,255,255,.55)`、左侧竖高光条、瓶口外翻唇；液体实色平涂+层间 1px 暗线+顶面浅色高光线
- HUD：暂停钮黄圆 `#F5B93C` 边 `#D89A28`｜胶囊白底 `#FFF7E8` 圆角全、棕字 `#7A4A1E`｜工具条按钮米白圆角方 `#FFF3DC` 边 `#E8CFA5` 图标棕 `#8A5A2A`
- 水色板（liquidSet，每套 10 色，色相/明度拉开可辨）：classic 取糖果饱和色（黄#F5C542 红#E2483D 天蓝#3FA0D8 草绿#59B35B 橙#F08A3C 粉#EF7FA4 紫#8E6FC8 青#4EC8C0 棕#A5714A 青柠#A8C93A）——其余两套 candy/ocean 由 ART 定，保持同索引可区分

## 全局命名

`window.WS` 为唯一顶层命名空间：`WS.LOGIC / WS.ART / WS.AUDIO / WS.FX / WS.PANEL / WS.GAME`。
每模块文件顶层形如 `window.WS=window.WS||{}; WS.XXX=(()=>{...return {...}})();`
**不要**在模块顶层 `const WS`（build.py 同页拼接会重复声明 SyntaxError）。模块内禁止出现 `</script` 字样。

构建收录顺序（build.py）：`logic, art, audio, fx, config-panel, game`。先到先跑，各模块自包含零交叉 import；缺模块时其他模块必须仍能跑（游戏侧 NOOP 兜底，子代理侧不 require 他人）。

## LOGIC（主线自己写 → src/logic.js）

纯函数 + 常量：`mulberry32(seed)`、`specForLevel(n, cfg) -> {K, E, cap, bottles}`、`genLevel(n, cfg) -> {bottles: number[][], K, cap, seed}`（瓶=色id数组，底→顶）、`solve(bottles, cap, maxNodes=30000) -> [{from,to,n}] | null`、`isWin(bottles, cap)`、`completedColors(bottles, cap) -> number`、`topRun(b) -> {color, n}`、`canPour(src, dst, cap)`、`applyPour(bottles, from, to, cap) -> {bottles, n}`（纯函数返回新数组）、`LS_ST='ws_state_v1'`、`LS_CFG='ws_cfg_v1'`、`DEFAULT_CFG`。

## ART（子代理A → src/art.js）

```js
WS.ART = {
  bg() -> dataURI,   // 房间背景整图，viewBox="0 0 690 1232"：上 22% 紫墙+木框窗（左右对称居中，窗内蓝天白云+十字棂），22%~27% 吧台沿（立面+台面高光线），以下至底大木桌面（横向木板 6~7 条+板缝+同色系明度渐变）。setRoom 后重建缓存。
  pig(accent, pose) -> dataURI,  // 吧台后小猪上半身，viewBox="0 0 200 170"：圆头盔(高光)+猪头(竖椭圆耳+大眼白黑瞳+椭圆鼻孔鼻)+衣服+两前蹄扒沿；pose='idle'|'cheer'(两蹄上举+嘴张开)。accent 为头盔/衣服色。
  scooterPig() -> dataURI,  // 启动页整只：侧视红头盔猪骑红色小摩托(前挡风+车头灯+坐垫+两轮深灰+轮轂浅灰)+身后棕色大快递箱(绑带)，viewBox="0 0 360 300"，微前倾动感
  logo() -> dataURI,  // 「倒水挑战」艺术字，viewBox="0 0 520 260"：绿色飞溅色块衬底(不规则圆瓣)+四字胖圆体(两行:倒水/挑战)填充 #FFC93C 底缘加深 #E8821E、白色粗外描、深棕投影，字上两只小玻璃瓶倾斜+滴落彩色水滴
  bottle() -> { img, innerD, mouth, W:100, H:190 },
      // img: 玻璃瓶透明 dataURI（空瓶：瓶口外翻唇+细颈+鼓腹+平底圆角，淡白半透明填充+白描边+左内侧竖高光条，viewBox="0 0 100 190"）
      // innerD: 瓶内液体区域的 SVG path d 字符串（同一 0..100×0..190 坐标系，game 端 new Path2D 后 scale 到目标尺寸做 ctx.clip 液体裁剪）——内壁比外形内收 ≥4，瓶颈段也是液体通道，底到瓶口以下
      // mouth: {x,y} 瓶口出液点坐标（倾倒时液流起点）
  icon(name) -> dataURI,  // 'pause','play','gear','undo','refresh','plus','bulb','sound','soundOff','close','star' 统一棕色 #8A5A2A 线条/实块图标，viewBox="0 0 48 48"
  setRoom(name),   // 'warm'|'mint'|'dusk'，切换后重建 bg 缓存（mint=薄荷绿墙+浅木，dusk=暮蓝墙+深胡桃木；窗/吧台/桌面造型不变只换 palette）
  rooms: {...},    // 三套 {wall, wallDeep, frame, sky, cloud, mullion, counterFace, counterTop, wood, woodDark, woodDeep}
  liquids: {...},  // 三套水色板 {classic:[10],candy:[10],ocean:[10]}，每套 10 个 hex 互相可辨
};
```

要求：全部 SVG data URI（`'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(...)`），函数级缓存（同参数二次调用返回缓存）；单图源码 ≤4KB；造型严格对照参考图裁片；扁平实色+克制高光，禁渐变（桌面明度渐变与 logo 字底缘加深除外）。art.js 顶部加 `WS.ART.ready = Promise.all([每个 img 加载完成])`（img=new Image+decode，全加载后 resolve）供 game 等待。

## AUDIO（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频

```js
WS.AUDIO = {
  unlock(), play(name, opts), startLoop(name), stopLoop(name), duck(ms),
  setBGMVolume(v), setSFXVolume(v), setMasterVolume(v),
  applyOverrides(map),  // {cue: dataURL} 自定义音效优先，decodeAudioData 失败回落合成
  names: ['pick','pour','deny','drop','colorDone','pig','win','click','start','bgm']
};
```

cue 清单（听感/时长）：
- `pick` 拿起瓶子 木质/玻璃轻pop ~80ms｜`pour` 倒水咕嘟咕嘟 ~700ms（气泡+窄带噪声，一次性）｜`deny` 不允许 闷嗒 ~120ms｜`drop` 一格液体落定 哒 ~60ms｜`colorDone` 一色完成 清脆叮+上行小滑音 ~500ms｜`pig` 小猪哼欢 ~250ms（滑音双音，配合完成色）｜`win` 过关 fanfare 上行四音 ~1.1s 轻快不刺耳｜`click` UI 轻嗒 ~40ms｜`start` 开始 whoosh+叮 ~300ms｜`bgm` 轻快八音盒/马林巴循环，BGM 音量默认压低
unlock 幂等（首次手势调用）；visibilitychange 自动停 BGM 回来续；override 播放走独立增益受 sfx 音量控。

## FX（子代理C → src/fx.js）canvas 粒子层，禁 shadowBlur（用径向渐变+lighter 叠色）

```js
WS.FX = {
  init(canvas), resize(w, h, dpr),
  droplets(x, y, color, n=8),   // 倒水落点小液滴飞溅（重力回落）
  sparkle(x, y, color),          // 一色完成：瓶口星火小爆
  confetti(w, h),                // 过关：全屏彩带纸屑（矩形旋转飘落 2.2s）
  stop(), clear()
};
```

要求：对象池复用、DPR≤2、rAF 内部自驱但帧空时自动停表（无粒子不空转）；主循环异常安全（单帧抛错不终止循环）。

## CONFIG-PANEL（子代理D → src/config-panel.js）

参照成熟实现改写：`/Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/pipe-connect/src/config-panel.js`（**先 Read 它**，沿用 work 副本+onChange(完整快照)+上传音效 override 的既有模式与交互质感，只换条目）。

```js
WS.PANEL = {
  mount(opts), // { root, get:()=>cfg, onChange:(fullCfgSnapshot)=>void, onClose:()=>void,
               //   stats:()=>({lv,clears,moves}), onClearProgress:()=>void,
               //   audioNames:[...], onAudioOverride:(map)=>void }
  open(), close(), isOpen()
};
```

条目：音量（BGM/SFX 两滑杆）｜玩法（瓶容量 3/4/5、空瓶数 1/2、色数上限 4~10、每关加瓶 0/1/2、动画速度 0.5~2 步进 0.25、提示开关）——均注明「下一关生效」｜外观（房间色板 warm/mint/dusk、水色板 classic/candy/ocean，即时生效）｜音效自定义（逐 cue 上传替换/试听/恢复，≤3MB）｜存档（导出 JSON 下载 / 导入 / 清空进度双确认）。样式与全站一致的暖棕米色系，手机可滑。

## GAME（主线自己写 → src/game.js）

状态机 menu→playing⇄pouring→winShow→playing(下一关)；渲染分层：`#bgImg`(img) → `#pigRow`(三只 pig DOM img，CSS idle 浮动/cheer 跳跃动画) → `#gameCanvas`(瓶子+液体+倒水动画，全屏透明) → `#fxCanvas` → HUD/工具条 DOM → 覆盖层。倒水动画：拿起升起→移动到目标瓶口上方→绕瓶口旋转 ~72°→液流曲线+源减目标增+落点 droplets→回位；busy 期间锁输入；shake 表现 deny。持久化 st={lv, stats:{clears,movesTotal}, best:{}}，cfg 同 pipe-connect 的 deepMerge 模式；`?reset=1` 在读 localStorage 前清档。测试钩子 `window.__ws`={st,cfg,busy,level(),apply(moves),solve,demo}；URL 参数 `?level=N` `?demo=1` `?snap=1`(零动画) `?muted=1` `?reset=1`；`window.__errs` 错误探针。

## shell.html（主线写 → src/shell.html）

DOM 骨架 id：`#app > #splash(logo img#splashLogo/img#splashPig/#splashBar>#splashFill/#splashStart) + #stage(#bgImg/#pigRow/.pig×3/#gameCanvas/#fxCanvas/#hud(#pauseBtn/#levelPill/#pctPill)/#toolbar(#undoBtn/#hintBtn/#addBtn/#restartBtn)/#bubble/#pauseMenu/#winPanel/#panelHost/#toast)`。`.snap` 类全局禁 transition/animation。桌面 (min-width:700px) `#app` max-width 440px 居中带边框阴影；横屏矮窗压缩比例但不溢出。

## 主线负责（勿动他人模块）

logic.js / game.js / shell.html / build.py / README 由主线写；art.js / audio.js / fx.js / config-panel.js 由子代理各管一文件，**其他文件一律不动**。接口对不上的地方以本契约为准，缺接口先 NOOP 兜底跑通再等补齐。
