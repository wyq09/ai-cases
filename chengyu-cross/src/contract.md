# 填成语 · 十字填字 H5 — 并行开发契约 v1

项目根: `chengyu-cross/`。全部路径相对项目根。
单文件构建管线: `src/*.js` 模块 + `shell.html`(含 `<!-- MODULE_SCRIPTS -->` 占位) + `build.py` 拼接。

## 0. 参考图（视觉由主线负责，代理无需还原视觉）
- `ref/reference.jpg` 原始截图 1080×2400
- `ref/top.png` 顶栏+统计链 / `ref/grid.png` 字谜区 / `ref/tiles.png` 候选字区

## 1. 游戏规格（锁死，勿改）
- 十字填成语：每关一张由若干 4 字成语纵横交叉组成的字谜网格。格子三态：
  - 米白格=预给字（不可点）；绿色格=玩家已填对；紫色空格=待填；当前选中空格=橙色描边。
- 玩家点紫色空格选中 → 点底部候选字填充：填对变绿（正确音效+里程碑检查），填错格子抖动红闪、`剩余次数 −1`。
- 次数耗尽 → 失败弹窗：`重新开始`（本关清空重摆）/ `补次数`（花金币恢复 N 次）/ `设置`。
- 全部填完 → 过关弹窗（本关成语列表+本关金币）→ `下一关`；关卡无限，种子确定性生成（同一关永远同一张图）。
- 顶部统计：左 `成语 N`（累计填对字数，持久）；中 里程碑奖励链（累计填对达到 [1,3,14] 发 [120,120,240] 金币，节点分 已达成/当前/未达成 三态）；右 `剩余次数`。
- 候选字池 = 本关全部待填字（每空一格一字，重复字重复出）+ 干扰字（`ceil(待填数/2)+1` 个，取自常用字表且不出现在本关待填字中），seeded 洗牌。
- 菜单（右上 `···`）：提示（花金币自动填对一格，计入填对数）、重新开始本关、跳关（输入关卡号）、词库导入、设置。
- 顶部返回键 = 过关确认弹窗样式复用（本项目无上级页，返回=弹"确认重开进度?"可改为直接无操作，主线定）。

## 2. 全局命名空间与模块接口（锁死）
`window.CY = {}` 根命名空间，各模块挂载：

```js
// src/config.js（主线）
CY.config = {
  defaults,                 // 函数：返回深拷贝默认配置
  get(),                    // 当前生效配置（默认+用户补丁深合并）
  set(patch),               // 深合并、钳制合法范围、落盘、通知 onChange
  onChange(cb) -> unsub,    // cb(完整生效配置)；模块加载后补发一次
  export() -> string,       // 配置 JSON
  importJson(str) -> bool,  // 合法才生效
  resetAll(),               // 清 cy_* 全部 localStorage 并重载
}
// localStorage key（锁死）: cy_cfg_v2 / cy_state_v2 / cy_custom_v2
// ?reset=1 必须在 config.js 模块最顶端、任何 localStorage 读取之前清除。

// src/idioms.js（代理A）
window.CY_BANK = {
  list: string[],        // ≥900 条常用成语；每条恰 4 个 CJK 汉字；去重；大致按常用度排序
  COMMON_CHARS: string[],// ≥200 个单字，按在 list 中的出现频次降序
}
// 文件末尾: if (typeof module !== 'undefined') module.exports = window.CY_BANK;
// （window 赋值需有 typeof window 守卫，保证 node require 不炸）

// src/audio.js（代理B）
CY.audio = {
  init(), unlock(),                 // unlock 幂等，首个 pointerdown 调用
  play(name),                       // tap|correct|wrong|milestone|win|fail|coin|hint
  setVol({master,sfx,bgm}),         // 0..1
  applyOverrides(map),              // {muted:true} 等运行时覆盖
  stopBgm(), _lastPlayed,           // _lastPlayed 供测试断言
}
// 全 WebAudio 程序化合成，零外部文件；visibilitychange 停 BGM；node 环境加载不炸（window 守卫）。

// src/config-panel.js（代理C）
CY.panel = { open(section?), close(), isOpen() }
// 渲染到 #drawer；配置读写一律走 CY.config（禁止直接碰 localStorage）；
// "词库管理"按钮调用 CY.game?.openImport?.()（可选链兜底）。

// src/logic.js（主线）
CY.logic = { rng32, fnv1a, genPuzzle(opts), analyzeImport(text, opts), canPlace, applyPlace, validateGrid }
// 纯函数、无 DOM，node require 可测（module.exports 守卫）。

// src/game.js（主线）
CY.game = { start(), openImport(), state }
window.__cy = { state, cfg:()=>CY.config.get(), fill(r,c,ch), puzzle(), analyze(t),
                gotoLevel(n), setCoins(n), _audio:CY.audio }
```

## 3. 配置 schema（锁死字段名）
```js
{
  level:   { startWords:4, growthEvery:2, maxWords:14, givenRatio:0.30,
             givenDecay:0.008, attempts:5, maxSpan:9 },
  rewards: { milestones:[1,3,14], amounts:[120,120,240], completeCoins:0 },
  props:   { hintCost:80, reviveCost:150, reviveAttempts:3 },
  audio:   { master:0.9, sfx:0.8, bgm:0.25, muted:false },
  motion:  { reduced:false },
  bank:    { source:'builtin' }   // 'builtin' | 'custom:<id>'
}
```
钳制范围：startWords 3..8、growthEvery 1..5、maxWords 4..16、givenRatio 0..0.6、
givenDecay 0..0.03、attempts 1..20、maxSpan 6..12、milestones 递增正整数 ≤999、amounts 0..9999、
costs 0..9999、音量 0..1。非法输入拒绝落盘。

state（cy_state_v2，主线管）：
```js
{ level:1, coins:0, totalFilled:0, milestoneIdx:0,
  puzzle:{ seed, words:[{w,r,c,dir}], cells:{"r,c":{ch,given}}, pool:[ch...],
           distractors:n },
  progress:{ fills:{"r,c":ch}, attempts:n } }
```

## 4. 自定义词库与可行性分析（引擎主线写，UI 主线写，面板只加入口）
`analyzeImport(text)` 返回：
```js
{ parsed:n, valid:[...], invalid:[{w,reason}], duplicates:[...],
  isolated:[...],                      // 与任何其他成语无公共字 → 永远无法连入字谜
  placement:{ placed:[...], unplaced:[{w,reason}], ms, iters },
  verdict:'full'|'partial'|'none',     // 全部可玩 / 部分可玩(有可行子集) / 不可行
  adopt:[...] }                        // 可行子集(已成功摆入者)
```
分析三步：①合法性（恰4汉字、去重）②连通性（共字并查集，孤立词单列）③摆放求解
（回溯+多种子重试+迭代预算，目标全部摆入；失败则保留最大可行子集）。
UI：导入弹窗 = 粘贴框 + 示例按钮 + `开始分析` → 报告分区（✓可玩/⚠未摆入/✗无效/✗孤立）+ 按钮
`采用可行子集并开玩` / `仅保存词库` / `重新分析(换摆法)`。采用后存 cy_custom_v2
`[{id,name,text,adopt,createdAt}]`，可在设置里把出题词库切为该包（池太小自动回退内置并 toast）。

## 5. DOM 骨架与 CSS 令牌（锁死 id）
```html
<div id="app"><div id="stage">
  <header id="topbar">…返回/标题/菜单…</header>
  <section id="statbar">…成语计数 / 里程碑链 #chain / 剩余次数…</section>
  <div id="banner">第N关</div>
  <main id="board"><div id="grid"></div></main>
  <footer id="rack"></footer>
</div>
<aside id="drawer"></aside><div id="modal-root"></div><div id="toast"></div></div>
```
CSS 令牌（shell.html `:root` 定义）：`--bg1 #3c0d55 --bg2 #6d1157 --bg3 #a3165f --cream #f2e7cf
--cream-edge #d9c8a6 --ink #453526 --green #2fa75e --green-edge #1f7d43 --empty #5e2565
--accent #ffb43a --gold #ffd94a`；汉字字体 `"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif`。
#stage 手机宽度 ≤480px 桌面居中；禁横向滚动；safe-area。

## 6. 工程红线
- 零外部网络资源、零图片文件；音效全 WebAudio；图标全 SVG/Unicode 字符。
- 所有 JS `node --check` 通过；代理各自附 node 自测脚本并贴运行结果（audio 允许仅语法+守卫检查）。
- 文件边界：代理A→`src/idioms.js`(+`test/idioms.test.mjs`)；代理B→`src/audio.js`(+`test/audio.test.mjs`)；
  代理C→`src/config-panel.js`(+`test/panel.test.mjs`)。**其他文件一律不动**。
- config-panel 永不直接读写 localStorage；所有列表型配置（里程碑）解析失败保持原值并 toast。

## 7. 主线负责（其他代理勿动）
src/config.js、src/logic.js、src/game.js、shell.html、build.py、test/logic.test.mjs、集成与视觉。
