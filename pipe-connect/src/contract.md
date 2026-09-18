# 接水管（pipe-connect）— 模块契约

单文件 H5 复刻「微信接水管 · 管道连通益智小游戏」，手机竖屏优先。开发期分模块文件（`src/*.js`），最终 `build.py` 合并为单文件 `index.html`。
所有模块挂 `window` 全局，无构建、无外部依赖、**零外部资源**（无外部字体/图片/音频，全部程序化生成）。

参考图（**动手前必 Read**）：
- `ref/phone.png` — 原机整屏
- `ref/top.png` — 顶栏：阀门手轮 + 倒计时胶囊 + 云/白鸽
- `ref/mid.png` — 网格中部：水管/法兰/网格线/水波线/水中装饰
- `ref/bottom.png` — 底部出水管（深藏青）

## 游戏规格（主线已定，勿改）

**核心循环**：限时连通益智（Plumber）。点击水管顺时针转 90°，在倒计时归零前把进水口与出水口接通即过关，关卡递进。

- 棋盘：**列数恒为 5**；行数按关卡 `rowsForLevel(n)`：n=1→5，n=2..3→6，n≥4→7（封顶 7）。
- 进水口：**第 0 列顶部**（水从上方阀门竖直向下进入格子 (0,0) 的 N 边）。
- 出水口：**第 1 列底部**（水从格子 (1, rows-1) 的 S 边向下离开棋盘）。
- 管件仅两种：`straight`（直管，rot 0=N+S 通，rot 1=E+W 通，mod 2）、`elbow`（弯管，rot 0=N+E，rot 1=E+S，rot 2=S+W，rot 3=W+N，mod 4）。点击任意格顺时针 +90°（200ms 过渡），无次数限制。
- 生成（保证可解）：随机 DFS 简单路径 (0,0)→(1,rows-1)，按路径边确定解向（对边=straight、邻边=elbow），非路径格填随机管件；全盘随机旋转打乱后**必须校验初始局面未连通**（若连通则再拧一个路径格）。
- 胜负：每次旋转落地后 BFS 判定——从虚拟进水口（(0,0) 的 N 边）沿连接关系扩散，抵达虚拟出水口（(1,rows-1) 的 S 边）= **连通**：锁定输入 → 水流按 BFS 层序逐格灌充（~170ms/格，水色描边 dashoffset 动画）→ 阀门轮转动 + 出水口溅花 → 结算面板。倒计时归零 = **失败**面板（重试本关，得分回退到本关开始时的快照）。
- 计时：`timeForLevel(n) = max(cfg.timeMin, cfg.timeBase − (n−1)×4)`；≤10s 每秒 tick 音 + 胶囊红脉冲。
- 计分：过关 = `cfg.baseScore(100) + (n−1)×cfg.levelBonus(20) + 剩余秒×cfg.timeBonus(5)`，累计跨关；最佳总分/最高关卡持久化（localStorage）。
- 自动演示：AI 解算（按解向逐格旋转，~350ms/格，带音效），`?demo=1` 自动开局演示，也供浸泡测试。

## 视觉风格（全局锁，所有模块遵守；全部取自参考图实采色）

扁平卡通风、实色色块、无描边描画（管件无外描线）、禁止 blur 阴影/霓虹/玻璃拟态/Emoji 图标。

- 色板（classic）：天空 `#6DBAE4`｜深水 `#55A8D6`（底部再深至 `#4E9EC9`）｜管体 `#EEF0F6`（微暖白）｜法兰 `#E9E9BE`（ khaki，暗缘 `#D6D69E`）｜水色 `#58B7EC`｜藏青（阀管/时钟/文字深色）`#2E3450`｜轮环 `#8D8FB5`｜轮辐 `#EAE6C8`｜支架绿 `#3FAE8C`｜云 `#8FC8E4`｜导航条 `#2F3037`｜计时数字 `#3D4A5C`
- 网格线：2px 白 90% 不透明；水波线：白色扇贝波浪一条，横贯棋盘上部（约第一行中部）。
- 水中装饰：比底色深 ~6% 的幽灵管件形状 + 稀疏小气泡，克制。
- 法兰造型：比管身宽的圆角矩形块，位于管件两端连接缘中点（随管件整体旋转，视觉旋转不变）。
- 导航条仿微信：深灰 `#2F3037`，左「‹ 返回」白字（=重开菜单）、中「接水管」、右「⋯」（=设置）。正文 system-ui，数字/计时用 italic 900。

## 全局命名

`window.PC` 为唯一顶层命名空间：`PC.LOGIC / PC.ART / PC.AUDIO / PC.FX / PC.CONFIG_PANEL / PC.GAME`。
每模块文件顶层形如 `window.PC=window.PC||{}; PC.XXX=(()=>{...return {...}})();`
**不要**在模块顶层 `const PC`（build.py 同页拼接会重复声明 SyntaxError）。模块内禁止出现 `</script` 字样。

构建收录顺序（build.py）：`logic, art, audio, fx, config-panel, game`。先到先跑，各模块自包含零交叉 import；缺模块时其他模块必须仍能跑（游戏侧 NOOP 兜底，子代理侧不 require 他人）。

## LOGIC（主线自己写 → src/logic.js）

纯函数 + 常量：`COLS=5`、`rowsForLevel(n)`、`timeForLevel(n,cfg)`、`CONS`（连接表：type/rot → 边集）、`genBoard(rows, rng)`（含可解性与初始未连通校验）、`conn(rows,cells)`（邻接判定）、`solveFrom(board)`（BFS：返回 {win, dist, prev, path} 水从进水口的扩散树/最短链）、`solutionRotations(board)`（AI 演示用：把每格拧回解向的最少步序列）、`LS_ST='pc_state_v1'`、`LS_CFG='pc_cfg_v1'`、`DEFAULT_CFG`。

## ART（子代理A → src/art.js）

```js
PC.ART = {
  pipeStraight() -> dataURI,   // viewBox="0 0 100 100"，rot0=竖直 N-S；管体+两端法兰
  pipeElbow()    -> dataURI,   // viewBox="0 0 100 100"，rot0=N+E 四分之一圆弧；两端法兰
  waterPath(kind)-> 'M...' d字符串, // kind='straight'|'elbow'，与管件同几何的水流中线（game 自己拼 svg，ART 只给 path d 和长度 pipeLen(kind)）
  pipeLen(kind)  -> number,
  valve()        -> dataURI,   // 完整阀门：绿支架×2 + 深藏青竖管（顶天立地）+ 紫灰轮环 + 米色轮辐 + 藏青毂；viewBox="0 0 200 220"
  outletPipe()   -> dataURI,   // 深藏青竖管上下法兰，viewBox="0 0 100 140"，管内藏 id="pcWater" 的水条（默认 opacity 0，game 控制显隐做出水动画）
  cloud(i)       -> dataURI,   // i=0,1 两种扁平云（比天空深一档的实色云）
  dove()         -> dataURI,   // 扁平小白鸽（参考图右上有）
  clock()        -> dataURI,   // 闹钟图标：藏青壳红铃白面红针，viewBox="0 0 48 48"
  setPalette(name),            // 'classic'|'mint'|'sand'，切换后重建全部缓存 dataURI（mint=薄荷绿管/沙色法兰，sand=暖沙底/陶土法兰，只换 palette 内定义的色，不动造型）
  palettes: {...}              // 三套：{sky,water,waterDeep,pipe,flange,flangeEdge,clove,navy,wheel,spoke,bracket,gridLine,waterFlow,ghostAlpha}
};
```

要求：全部 SVG data URI（`'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(...)`），函数级缓存（同参数二次调用返回缓存）；单图源码 ≤3KB；扁平实色、禁止渐变（至多法兰一块两色拼）；造型严格对照参考图裁片。

## AUDIO（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频

```js
PC.AUDIO = {
  unlock(), play(name, opts), startLoop(name), stopLoop(name), duck(ms),
  setBGMVolume(v), setSFXVolume(v), setMasterVolume(v),
  applyOverrides(map),  // {cue: dataURL} 自定义音效优先，解码失败回落合成
  names: ['rotate','flow','splash','win','lose','tick','click','start','bgm']
};
```

cue 清单（听感/时长）：
- `rotate` 金属棘轮短嗒「咔」~70ms｜`flow` 水流汩汩（loop，灌充期间开）~白噪声+低频滑音｜`splash` 出水口噗通水花 ~300ms｜`win` 上行三音小 fanfare ~800ms（轻快不刺耳）｜`lose` 下行两音 ~500ms｜`tick` 秒针嗒 ~50ms（≤10s 每秒）｜`click` UI 轻嗒 ~40ms｜`start` 关卡开始汽笛短鸣 ~250ms
- `bgm` 循环：轻快休闲解谜风（马林巴/木琴拨音 + 轻打击），C 大调五声音阶 ~96bpm，音量自压低（默认 0.35），耐听不吵。

## FX（子代理C → src/fx.js）canvas 覆盖层特效

```js
PC.FX = {
  init(canvas), resize(w,h,dpr),      // dpr≤2；rAF+setInterval(120ms) 双驱动防遮挡冻结
  burst(x,y,opts),                     // 水花爆点（灌充到出水口/连通时）：蓝白水滴抛物线飞溅+重力
  confetti(x,y,w),                     // 过关庆祝：水滴+浅色纸屑混合自上飘落 ~1.8s
  ambient(w,h),                        // 背景气泡缓升（低频、稀疏，装饰）
  stop(), clear()
};
```

要求：对象池、禁 shadowBlur（径向渐变+lighter 叠色可）、粒子色取自 classic 色板（水蓝/白/浅黄），总粒子 ≤160。

## CONFIG_PANEL（子代理D → src/config-panel.js）游戏内设置面板

```js
PC.CONFIG_PANEL = {
  mount(el), open(tab?), close(), isOpen(), onChange(cb), onClearBest(cb)
};  // 任何编辑改 work 副本后立即 onChange(完整深拷贝快照)；永不直接碰 localStorage
```

cfg schema（与 PC.LOGIC.DEFAULT_CFG 对齐）：
```js
{ timeBase:60, timeMin:30, baseScore:100, levelBonus:20, timeBonus:5,
  palette:'classic',           // 'classic'|'mint'|'sand'
  bgmVol:0.35, sfxVol:0.8,     // 0..1
  aiDemo:false,                // 开局自动 AI 演示
  sfxOverrides:{}              // {cue: dataURL}
}
```
页签：`玩法`（timeBase/timeMin/三项分值，数字输入+滑杆）、`音画`（palette 三选一含色卡预览、bgmVol/sfxVol 滑杆、音效自定义上传+恢复默认）、`数据`（最佳纪录展示+清除、配置导出 JSON 下载/导入 file input、恢复默认）。风格：白底 `#F7FBFE`、藏青标题、2px `#2E3450` 边框、圆角 ≤10px、绿 `#3FAE8C` 主按钮，扁平无阴影海；与游戏同视觉系。面板从右侧/底部滑入，遮罩点击关闭。

## GAME（主线自己写 → src/game.js）+ DOM 骨架（shell.html，id 勿改）

```
#app（桌面居中 420px 通高列，移动端全屏；内部 flex column）
  #navbar   （深灰条 44px+safe-area：#btnBack ‹返回 | 接水管 | #btnCfg ⋯）
  #skyband  （relative，含 .cloud×3 .dove、#valve（绝对定位，JS 算 x 对齐第0列中心）、右侧 .hud（#timerPill>#clockImg+#timeNum、#lvChip 第N关、#scoreChip 得分））
  #gridwrap （flex:1，内 #grid 绝对居中，格子 .cell>.rot>img.pipe+svg.wat）
  #seabed   （底部水带，含 #outlet（绝对定位对齐第1列中心）、装饰幽灵管）
  #fxcv     （全屏 canvas 特效层，pointer-events:none）
  #wave     （棋盘顶部扇贝水波条，绝对定位）
  #toast / #panel（开场/过关/失败/菜单覆盖层） / #cfgMount（设置面板挂载点）
```

- 状态机：`menu → playing → flowing → win|lose → (next|retry) → playing`；busy 期间锁格子输入。
- 持久化：`PC.LS_ST`（best score/level）、`PC.LS_CFG`；`?reset=1` 在模块读 localStorage **之前**清档；`?level=`跳关、`?demo=1`、`?muted=1`。
- 测试钩子 `window.__pc`：`{state, board(), rotate(r,c), timer, score, level, demo(), flowInfo()}`。
- 头部 HUD、阀门/出水口 x 对齐、格子尺寸均在 `layout()` 里按视口计算（cell = min((vw−16)/5, gridH/rows)），resize/旋屏重算。

## 主线负责（勿动他人模块）

logic.js / game.js / shell.html / build.py / README 由主线写；子代理只写自己的一个文件 + 自测，其他文件一律不动。
