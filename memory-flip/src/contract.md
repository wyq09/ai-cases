# 翻牌赢好礼（memory-flip）— 模块契约

单文件 H5 复刻「经典营销活动 · 记忆翻牌」小游戏，手机竖屏优先。开发期分模块文件（`src/*.js`），最终 `build.py` 合并为单文件 `index.html`。
所有模块挂 `window` 全局，无构建、无外部依赖、**零外部资源**（无外部字体/图片/音频，全部程序化生成）。

> 无参考图：本作从玩法名复刻（国内营销活动翻牌 H5 通用形态）。视觉风格以本契约为准。

## 游戏规格（主线已定，勿改）

**核心循环**：经典记忆配对（Concentration）+ 营销活动包装。

- 卡组：10 种「好礼」图标，每种恰好一对。`id` 与中文名锁死：

| id | 名称 | id | 名称 |
|---|---|---|---|
| ingot | 金元宝 | cat | 招财猫 |
| hongbao | 红包 | crown | 王冠 |
| coupon | 优惠券 | gem | 宝石 |
| gift | 礼盒 | firework | 礼花 |
| koi | 锦鲤 | coin | 铜钱 |

- 难度（grid，列×行）：轻松 `4x3`=12张6对 / 标准 `4x4`=16张8对 / 挑战 `5x4`=20张10对。
- 回合：点选第 1 张翻开 → 点选第 2 张翻开 → 图标相同=**配对成功**（保持翻开、收集奖品、连击+1、得分）；不同=**失配**（约 750ms 后自动盖回、连击清零）。配对期间锁输入（busy）。
- 开局「记忆预览」：全部卡面朝上 `cfg.peekSec` 秒（默认 2，0=关）→ 盖回 → 开始计时。
- 限时：`cfg.timeLimit` 秒倒计时（默认 90，0=不限时）。归零未完成=失败结算。最后 5 秒每秒 tick 音 + 时间条变红。
- 计分：每对 `cfg.baseScore`(100) × 连击倍率（连击 1/2/3 次 = ×1/×2/×3，≥4 封顶 ×4）；全部配对完成再加分 `cfg.timeBonus`(10) × 剩余秒（限时模式才有）。
- 星级：准确率 = 对数 ÷ 翻牌步数，≥0.66→3星，≥0.45→2星，否则 1星。
- 结算：成功 = 成绩（星/得分/用时/步数/最高连击）+ **奖品领取**（收集的奖品图标行 + 「一键领取」→ 生成虚拟券码 + 彩带庆祝，可复制）；失败 = 未完成 n/对数，无领奖。两态均有「再来一局」。
- 次数限制：`cfg.dailyLimit`（0=无限）。>0 时封面显示「今日剩余 N 次」，按自然日计数，次数用尽禁止开局（toast 提示）。
- 最佳纪录：按难度分别记录最高分/最短用时/最高连击/最佳星级（localStorage）。
- 自动演示（`?auto=1`）：封面自动开局，AI 带记忆贪心翻牌（已知对优先，否则翻未知牌），约 600ms/步，供演示与浸泡测试。

## 视觉风格（全局锁，所有模块遵守）

暖米纸底 + 印刷红金，**扁平 + 细描边 + 实色偏移投影（offset shadow，禁止 blur 阴影）**，喜庆但克制。

- 色板：纸底 `#F6EFE2`｜卡面米白 `#FFF9EE`｜主红 `#B93A2B`｜深红 `#8F2B20`（卡背底 `#A93426`）｜墨字 `#2B2622`｜金 `#C99A3C`｜亮金 `#E4B95B`｜深棕描边 `#3A2E24`
- 圆角 ≤8px；描边 2px `#3A2E24`；投影统一 `box-shadow: 3px 3px 0 rgba(58,46,36,.9)`（或对应色）。
- 禁：紫蓝渐变、霓虹发光、玻璃拟态、彩色标签堆、Emoji 图标、大圆角卡片海。
- 标题字重 900 黑体（system-ui），正文 400；封面主标题可用衬线（`"Songti SC","STSong",serif`）营造活动海报感。

## 全局命名

`window.MF` 为唯一顶层命名空间：`MF.LOGIC / MF.ART / MF.AUDIO / MF.FX / MF.CONFIG_PANEL / MF.GAME`。
每模块文件顶层形如 `window.MF=window.MF||{}; MF.XXX=(()=>{...return {...}})();`
**不要**在模块顶层 `const MF`（build.py 同页拼接会重复声明 SyntaxError）。模块内禁止出现 `</script` 字样。

构建收录顺序（build.py）：`logic, art, audio, fx, config-panel, game`。先到先跑，各模块自包含零交叉 import；缺模块时其他模块必须仍能跑（游戏侧用 NOOP 兜底，子代理侧不 require 他人）。

## LOGIC（主线自己写 → src/logic.js）

纯函数 + 常量表：`ICONS`（上表）、`GRIDS`（难度表）、`dealPairs(grid, rng)` 洗牌发牌、`comboMult(combo)`、`stars(pairs, moves)`、`judge(...)` 结算计算。供 game 与测试脚本共用。

## ART（子代理A → src/art.js）

```js
MF.ART = {
  card(id)   -> dataURI  // 卡面奖品插画，id ∈ 上表 10 种；viewBox="0 0 100 100" 起头、无宽高
  back()     -> dataURI  // 卡背：红底 #A93426 + 金色回纹边框 + 中央金圈「礼」字印章
  trayIcon(id) -> dataURI // 收集栏小图标（同 card 造型可复用 card(id) 实现，但接口独立）
};
```

要求：全部 SVG data URI（`'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(...)`）；单图源码 ≤3KB；**80px 下剪影可辨**（手机卡面实际显示 ~52-64px）；扁平插画风、2px 级深棕描边 `#3A2E24`、红金米三色为主、每图可带一个克制的亮金高光；禁止渐变滥用（每图至多一处轻渐变）。

## AUDIO（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频

```js
MF.AUDIO = {
  unlock(), play(name, opts), startLoop(name), stopLoop(name), duck(ms),
  setBGMVolume(v), setSFXVolume(v), setMasterVolume(v),
  applyOverrides(map),  // {cue: dataURL} 自定义音效优先，解码失败回落合成
  names: ['flip','match','miss','combo','win','lose','tick','click','bgm']
};
```

cue 清单（听感/时长）：
- `flip` 轻快翻页「沙嗒」~90ms｜`match` 上行双音叮咚（E5→A5 带泛音微光）~350ms｜`miss` 低音「咚」~180ms｜`combo` 随连击档位上行的清脆叮（opt.level 1-4，音阶 A4→C5→E5→A5）~250ms｜`win` 三连上行小 fanfare + 收尾琶音 ~900ms｜`lose` 下行两音 ~500ms｜`tick` 木鱼短嗒 ~60ms｜`click` UI 轻嗒 ~40ms
- `bgm` 循环：轻快国风五声音阶（C D E G A）拨弦琶音 ~92bpm，木鱼/沙锤轻打击点缀，音量自压低（默认 0.4），欢快不吵。

引擎要求：AudioContext 惰性创建；`unlock()` 幂等（首次手势 resume）；循环注册表 stop 干净；节点用完 `stop()+disconnect()`；`visibilitychange` 停/续 BGM；`duck(ms)` 压 BGM 再恢复。

## FX（子代理C → src/fx.js）Canvas2D 粒子，禁止 shadowBlur（径向渐变 + lighter 叠色）

```js
MF.FX = {
  init(hostEl),                                  // hostEl = #mf-fx 容器，canvas 铺满
  burst(x,y,opt{n,colors}),                      // 纸屑/光点爆开
  coinFly(x1,y1,x2,y2,opt{n,icon,done}),         // 奖品/铜钱沿贝塞尔曲线飞向收集栏（icon 为 img dataURI 可选）
  confetti(n),                                   // 全屏红金彩带雨
  spark(x,y,color,n), flash(color,alpha),
  ring(x,y,color), bigText(text,opt{color,sub,scale,dur}),   // bigText 用 DOM：金渐变字+描边层+WAAPI 弹入停留淡出自毁
  stopAll()
};
```

要求：铜钱/纸屑离屏预渲染多帧、scaleX 模拟翻转；粒子对象池+上限保护；DPR≤2；resize/orientationchange 自适应；`document.hidden` 暂停恢复；红金配色（色板见上）。风格：印刷喜庆（铜钱、方孔钱、纸屑、金粉），不要霓虹。

## CONFIG_PANEL（子代理D → src/config-panel.js）

```js
MF.CONFIG_PANEL = { mount(el), open(tab?), close(), isOpen(), onChange(cb) };
```

标签页：**卡面**（10 个 icon 上传替换 + 单项/全部恢复默认 + 预览格）｜**音效**（8 cue + bgm 上传替换 + BGM/SFX/主音量滑条）｜**玩法**（默认难度、限时秒 0-300、预览秒 0-5、连击开关、每对基础分、每剩秒加成、每日次数 0-99）｜**数据**（配置导出 JSON 下载 / 导入 / 恢复出厂 / 清除最佳纪录）。
工程要求：`open()` 时深拷贝 `MF.cfg` 为 work；任何编辑改 work 后立即 `onChange(完整深拷贝快照)`；**永不直接读写 localStorage**；样式内联 `<style>`、类名前缀 `mfcp-`；移动端底部抽屉、大点击区、`overscroll-behavior:contain`；全中文文案；存在性兜底（MF.ART/MF.AUDIO 可能缺）。色板遵循上节。

## 配置 schema（主线定）

```js
cfg = {
  grid: '4x4',      // 默认难度 '4x3'|'4x4'|'5x4'
  timeLimit: 90,    // 秒，0=不限时
  peekSec: 2,       // 开局记忆预览秒，0=关
  comboOn: true,    // 连击倍率开关
  baseScore: 100,   // 每对基础分
  timeBonus: 10,    // 全清后每剩 1 秒加成（限时模式）
  dailyLimit: 0,    // 每日次数，0=无限
  vols: { bgm: 0.4, sfx: 0.9, master: 1 },
  icons: {},        // iconId -> dataURL 覆盖
  sounds: {},       // cue -> dataURL 覆盖
}
```

持久化：localStorage `mf_config_v1`（cfg）/ `mf_state_v1`（`{best:{'<grid>':{score,time,combo,stars}}, plays:{'YYYY-MM-DD':n}, muted:bool}`）。
`?reset=1` 清档必须在模块读 localStorage **之前**执行（放 logic.js 顶层最先）。

## DOM 骨架（主线负责壳与全部接线）

```
body > #mf-app（390px 通高列，桌面居中）
  #mf-fx（FX canvas 容器，绝对定位铺满、pointer-events:none）
  #mf-top     左：印章 logo + 「翻牌赢好礼」 右：#mf-btn-sound、#mf-btn-cfg
  #mf-hud     #mf-timebar（进度条）+ #mf-time-num ｜ #mf-moves 步数 ｜ #mf-combo 连击 ｜ #mf-score 得分
  #mf-tray    收集栏：N 个槽位 .slot（配对成功点亮 + 飞入动画）
  #mf-board   牌桌 grid（--cols 变量）；.card > .card-inner > .face.back / .face.front(>img)
  #mf-cover   封面：主标题/活动规则三行/难度选择 #mf-diff（三档）/最佳纪录 #mf-best/开始按钮 #mf-btn-start/今日次数 #mf-plays
  #mf-result  结算浮层（成绩 + 领奖/失败两态；#mf-btn-claim、#mf-btn-share、#mf-btn-again）
  #mf-cfg-host（CONFIG_PANEL mount 点）
  #mf-toast
```

## URL 参数与测试钩子（主线实现）

`?reset=1` 清档｜`?auto=1` 自动演示｜`?grid=5x4` 覆盖难度｜`?time=60` 覆盖限时｜`?peek=0` 覆盖预览｜`?muted=1` 静音。
`window.__mf = { version, get state(), get cfg(), get busy(), flip(i), start(grid?), auto(on), setMuted(b) }` 活引用非快照。

## 主线负责（勿动他人模块）

logic.js｜shell.html + 全部壳 CSS｜game.js 状态机/翻牌引擎/计时/计分/结算/领奖/分享/自动演示/持久化/NOOP 兜底接线｜build.py｜README｜注册案例库｜集成与全部测试。
子代理只写自己的 `src/<模块>.js`（美术/特效另加 `tools/*-preview.html` 自检页），其他文件一律不动。
