# sheep-a-sheep 契约（唯一事实源，动手前必读）

复刻「羊了个羊」：层叠三消 tile 游戏。手机竖屏优先，单文件零外部资源。
玩法规则为公知（三消/7槽/3道具），美术全部自绘田园风，不使用原版任何素材与字体。
参考先例：water-sort/、tower-crane/（同仓库，构建/面板/音频模式直接沿用）。

## 一、游戏规格（锁死，勿改）

- **牌堆**：主堆 = 半格精度网格上逐层密堆（上层牌可压住下层 1~4 张），可选左右侧堆（长条叠牌柱）。
- **可点**：一张牌无任何更高层牌与它矩形相交 → 可点。被压牌视觉罩暗。
- **槽位**：点牌飞入底部槽（默认 7 格，可配 5~9）。槽内凑 3 同 → 立即消除腾格。
- **失败**：槽满（第 S 张进槽无法凑 3）→ 败。**清空全场牌** → 过关。
- **道具**（每关按配置给次数）：
  - 移出 out：槽内前 3 张随机叠回场上顶层（重新可见可点）
  - 撤销 undo：最后一张进槽的牌（未引发消除时）放回原位原层
  - 洗牌 shuffle：场上全部牌图案重新随机分配（位置/层不变）
- **复活**：失败弹窗一次机会（每关一次），复活 = 清空槽位全部牌叠回场上顶层。
- **关卡**：关卡 L 由难度曲线生成参数；种子 levelSeed(L) 同关同布局；每 breatherEvery 关一个喘息关（低难）；败 = 重试本关。
- **保证可解**：生成后跑 solver（贪心+预算回溯）验证，不可解重摇（≤40 次，兜底降密度）；cfg.guaranteed=false 跳过验证（变态模式）。

## 二、命名空间与文件

`window.SH = window.SH || {}`，模块 `SH.core / SH.logic / SH.ART / SH.AUDIO / SH.FX / SH.PANEL`，game.js 最后启动。
**禁止**模块顶层 `const SH`；**禁止**任何模块源码出现 `</script`。
build 序：`core, logic, art, audio, fx, config-panel, game`（build.py 拼接 + `</script` 断言）。

- `src/core.js`：URL 参数 `Q`（`sh_q`）、`?reset=1` 清档（IIFE 顶部最先执行）、deepMerge、mulberry32、levelSeed、loadJSON/saveJSON、`window.__errs` 探针。mulberry32 与 levelSeed 照抄 water-sort/src/logic.js L21-30。
- `src/logic.js`：DEFAULT_CFG、难度曲线 specForLevel(L,cfg)、布局生成 genLevel、solver、demo 策略 pickBySolver、simulate。纯逻辑零 DOM。
- `src/art.js`：14 种牌面图标 SVG data URI + 背景 + 预热 ready。
- `src/audio.js`：WebAudio 全合成。照 water-sort/src/audio.js 结构。
- `src/fx.js`：Canvas 粒子（消除星屑/过关彩纸/飘字）。禁 shadowBlur。
- `src/config-panel.js`：三 tab（玩法/外观/数据）。work 副本 + onChange 完整快照，面板自身永不碰 localStorage。
- `src/game.js`：canvas 渲染、输入、状态机、持久化、HUD、demo、`window.__sh` 钩子。

## 三、logic.js 接口（主线亲写，他人勿动）

```js
SH.logic = {
  DEFAULT_CFG,                       // 见 §四
  specForLevel(L, cfg),              // -> {kinds, tiles, layers, density, slots, sideLen, props...}
  genLevel(L, cfg, rng?),            // -> board（可解已验证）
  solve(board, slots, opts?),        // -> {ok, steps:[tileId...]} | {ok:false}  贪心+预算回溯
  pick(boardState, slots),           // -> tileId | null  demo/提示单步策略
}
// board 结构（渲染层与 solver 共用的唯一牌数据）：
board = {
  W: 半格网格列数, H: 半格网格行数,      // 布局包围盒（半格单位）
  tiles: [{id, kind, gx, gy, z}],       // gx,gy 为半格整数坐标（牌占 2x2 半格？否——牌占宽1高1.2，
                                        //   统一：gx,gy 为 0.5 步进的网格坐标，相交判定在像素域做）
  slots: 7,
}
```

**坐标与相交判定（锁死）**：牌的逻辑尺寸 tileW=1、tileH=1.2（半格单位）。两牌相交 ⇔ |gx差|<1 且 |gy差|<1.2 且 z 不同（同层由生成保证不相交）。A 压 B ⇔ 相交且 A.z>B.z。covered(B) ⇔ 存在 A 压 B。

**solver**：强制消除优先（3 同必消，证明：腾槽无成本）；候选=当前可点牌；启发式排序（槽内 2 同 > 1 同 > 新种类，种类内取 z 高者）；回溯预算 nodes≤4000；记忆化 key=已取牌集合不能承受 → 用「失败深度表」近似即可（slots 内种类计数+剩余可点集哈希）。性能目标：150 张牌验证 <80ms。

**难度曲线（初始值，simulate 调参后回写 DEFAULT_CFG）**：
kindsStart=5, kinds+=min(1,⌊L/3⌋) 上限 cfg.kinds(默认12)；tilesStart=30, +12/关，上限 cfg.tilesMax(默认150)；layersStart=3, +1 每 2 关，上限 8；density 0.55+L*0.02 上限 0.8；每 breatherEvery(5) 关全参数回落到 L-3 水平。

**simulate(n, L, cfg, skill)**：模拟玩家（贪心策略 + 概率 skill 选次优 + 道具简单规则），返回 {winRate, avgSlotsUsed}。用于调难度曲线，game.js 不调用。

## 四、配置 schema（DEFAULT_CFG 锁字段，面板/持久化按此）

```js
{
  // 玩法/难度
  slots: 7,            // 5~9
  kindsMax: 12,        // 6~14 图标种类上限
  tilesStart: 30,      // 24~60 首关牌数(向下取3倍数)
  tilesPerLevel: 12,   // 0~24
  tilesMax: 150,       // 60~198
  layersStart: 3,      // 2~5
  layersMax: 8,        // 3~9
  density: 0.6,        // 0.4~0.85 上层覆盖率
  sideStacks: 2,       // 0~2
  sideLen: 5,          // 3~8 侧堆长度
  propsOut: 1, propsUndo: 1, propsShuffle: 1,   // 0~9
  revives: 1,          // 0~3
  guaranteed: true,    // 求解器验证
  breatherEvery: 5,    // 0~10 (0=无喘息)
  // 外观
  icons: {},           // {kindId: dataURI} 空/缺省=内置 SVG
  bgCustom: '',        // 背景 dataURI
  tileSkin: 0,         // 0 米白 1 纸浆 2 薄荷
  // 音画
  sfxVol: 0.9, bgmVol: 0.45, muted: false,
  audioOverrides: {},  // {cue: dataURL}
}
```

localStorage：`sh_cfg_v1`（配置）/ `sh_state_v1`（进度 `{lv, best, revUsed, muted?}`）。`?reset=1` 在 core.js IIFE 顶部最先清两个 key。

## 五、ART 接口

```js
SH.ART = {
  ready,                          // Promise（全部图标+背景预热 decode）
  KINDS: ['carrot','cabbage','corn','mushroom','scissors','flame','grass','pine','cotton','bucket','sickle','fork','hat','glove'],
  icon(kindId, customURI?),       // -> dataURI（customURI 优先；内置 48 viewBox 扁平多彩+细深描边，≤3KB）
  bg(themeIdx, customURI?),       // -> dataURI 田园夜空/羊圈木栅风，viewBox 690x1232 cover 映射
  tileSkin(i),                    // -> {fill, edge, line} 牌面配色
}
```

图标风格（锁死）：扁平剪影 + 2px 深描边(#4A3B2A 系)，主体大色块，80px 下剪影可辨、颜色互相拉开（禁渐变滥用，最多单色渐变提亮）。田园农具/蔬果主题，禁 emoji 字符（全手绘 path）。

## 六、AUDIO 接口（照 water-sort 结构）

```js
SH.AUDIO = {
  init(), unlock(),               // unlock 幂等，首手势调用
  play(name, vol?),               // cue 即发
  startBGM()/stopBGM(), duck(ms),
  setBGMVolume(v)/setSFXVolume(v)/setMasterVolume(v),
  applyOverrides(map), names: [...],
}
```

cue 名单（锁死）：`pick, place, match, deny, out, undo, shuffle, win, lose, click, revive, bgm`。
风格：田园轻快——pick 木鱼短哒、place 木质轻叩、match 马林巴上行三音+刷弦、win 口哨+马林巴琶音、BGM 马林巴五声音阶+口哨旋律循环（音量压低 duck 0.3）。

## 七、FX 接口

```js
SH.FX = { init(canvas), resize(W,H,DPR), burst(x,y,color,n), confetti(), float(x,y,text), step(dt), clear() }
```

## 八、DOM 骨架（id 锁死）

```
#app
  #cv          主 canvas（背景+牌堆+槽位+飞行+粒子，全画）
  #hud         顶栏：#hudLv（第N关）· #hudLeft（剩x/总y）· #btnMenu（☰样式自绘CSS）
  #propBar     底部道具条：#btnOut #btnUndo #btnShuffle（CSS 自绘图标+次数角标 .cnt）
  #overlay     弹窗容器（title 起始页 / win / lose / 暂停），内容动态
  #panelHost   配置面板挂载点
  #toast
```

样式基调：暖米白+木棕+草绿田园风，禁紫蓝渐变/霓虹/玻璃拟态/大圆角卡片堆砌，遵守全局 20 条反 AI 风格禁令。safe-area 上下留白，`height:100dvh` 双写，桌面 ≥700px 收 440px 壳居中，横屏 `@media(max-height:540px)` 压缩 HUD。

## 九、game.js 行为（主线负责，勿动他人模块）

- boot：`?reset` 已由 core 处理 → loadCfg/loadState → ART.ready（3s 超时竞速）→ title 弹窗（继续第L关/重新开始/设置）。
- 状态机：title → playing ⇄ paused；win → nextLevel；lose →(revive?)→ retry。
- 持久化：过关即存 state；配置 onChange 即存 cfg。
- demo：`?demo=1` 自动开始并用 logic.pick 单步自动玩，跨关自续，失败自动重试本关。
- URL：`?level=N`（跳关）`?demo=1` `?snap=1`（零动画）`?muted=1` `?reset=1`。
- 钩子 `window.__sh`：{get st, get cfg, get busy, board(), slotsArr(), props(), solve(), pick(), startLevel(n), demo(on), useOut/useUndo/useShuffle/revive}。
- 渲染：rAF + setInterval(120ms) 双驱动，dt 按时间戳；DPR≤2；resize+orientationchange(250ms) 重算。
- 点击拾取：像素→半格坐标，z 从高到低找第一张相交且未 covered 且可点（含动画中的牌不可点）。
- 交互守则：动画期间 busy；道具不足 toast；槽位临界（≥S-1）槽位条红色脉冲提示。

—— core/logic/art/audio/fx/config-panel 各自独立可缺，game 对缺失模块 NOOP 兜底（惰性解析 + 安全调用）。main 负责 game.js 与集成。
