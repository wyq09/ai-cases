# 欢乐打地鼠（whack-mole）— 模块契约

单文件 H5 复刻「经典营销活动 · 打地鼠」小游戏，手机竖屏优先。开发期分模块文件（`src/*.js`），最终 `build.py` 合并为单文件 `index.html`。
所有模块挂 `window` 全局，无构建、无外部依赖、**零外部资源**（无外部字体/图片/音频，全部程序化生成）。

> 无参考图：本作从玩法名复刻（国内营销活动打地鼠 H5 通用形态）。视觉风格以本契约为准。
> 工程模式可参考 `../memory-flip/src/`（同类营销 H5 已上线案例）：audio.js 的 WebAudio 引擎骨架、fx.js 的粒子池骨架、config-panel.js 的抽屉+work 副本骨架。**只借鉴工程结构，输出必须全改为本作命名空间 WM 与本作主题**，禁止残留 `MF` 字样（交付前 `grep -c MF` 必须为 0）。

## 游戏规格（主线已定，勿改）

**核心循环**：经典街机打地鼠 + 营销活动包装。

### 洞阵与地鼠

- 洞阵固定 **3×3 = 9 洞**，难度只调节奏参数。
- 地鼠 4 种，`id` 与中文名、分值锁死：

| id | 名称 | 分值 | 说明 |
|---|---|---|---|
| normal | 地鼠 | +100 | 主力，权重最高 |
| gold | 金地鼠 | +300 | 稀有、驻留更短 |
| gift | 礼盒鼠 | +150 | 打中收集 1 件奖品（进收集栏）并**触发狂热时刻** |
| bomb | 炸弹鼠 | −200 | **禁打**：敲中扣分、清空连击、屏幕抖动 |

- 每种地鼠两态立绘：`up`（探头）与 `hit`（被打：普通/金/礼盒=压扁晕眼冒星；炸弹=焦黑爆炸脸）。

### 难度三档（`WM.LOGIC.DIFFS`，主线写死）

| key | 名称 | popUp 驻留ms | 间隔ms | 同屏上限 | bomb权重 | gold权重 | gift权重 | 铜牌分 | 银牌分 | 金牌分 |
|---|---|---|---|---|---|---|---|---|---|---|
| easy | 悠闲 | 1150 | 900 | 2 | 0 | 0.10 | 0.08 | 1500 | 3000 | 5000 |
| normal | 标准 | 900 | 640 | 3 | 0.12 | 0.10 | 0.08 | 2500 | 5000 | 8000 |
| hard | 疯狂 | 620 | 400 | 4 | 0.16 | 0.12 | 0.08 | 4000 | 7500 | 12000 |

间隔/驻留在运行时有 ±25% 随机抖动；狂热时刻期间间隔×0.45、驻留×0.75、gold 权重×3、得分翻倍。

### 计分与连击

- 命中得分 = 分值 × 连击倍率（连击 = 当前连续命中数）×（狂热中 ×2）。倍率：连击 1–2 → ×1，3–5 → ×2，6–9 → ×3，≥10 → ×4（`cfg.comboOn=false` 时恒 ×1）。
- 敲空（点到无鼠洞/地面）不断连击、不扣分，只出尘土音效；**敲中 bomb**：−200（不低于 0 分）、连击清零、抖屏。
- 地鼠自然缩回（未被打）：连击**保留**（街机惯例，惩罚只来自 bomb 与漏 gift）。
- **狂热时刻（Frenzy）**：打中 gift 触发，持续 `cfg.frenzySec`(4)s：间隔×0.45、gold×3 权重、全场得分 ×2、边框金色脉动、HUD 出现「狂热」倒计时徽章、BGM duck + 上扬音效。狂热中再次打中 gift 不叠加时长（重新计时）。
- 命中率 = 命中数 ÷ 总敲击数（敲空计入分母）。

### 局与结算

- 局时 `cfg.timeLimit`(60)s 倒计时；最后 5 秒每秒 tick 音 + 时间条变红。时间到即结算（打地鼠无失败态）。
- 评级章：分数 ≥金牌线→金牌，≥银牌→银牌，≥铜牌→铜牌（按难度各自的线）。
- 结算页：评级章 + 得分/最高连击/命中率/收集奖品行 + **营销领奖**（见下）+「再来一局」。
- **奖品收集栏**（HUD 下方）：本轮打中的 gift 以奖品图标点亮槽位（每局上限 4 槽，超出合并计数 ×n）；结算页汇总展示。
- 每日次数：`cfg.dailyLimit`(0=无限)，封面显示「今日剩余 N 次」，用尽禁开局（toast）。
- 最佳纪录：按难度分别记录最高分 / 最高连击 / 最佳命中率（localStorage）。

### 营销接入层（本作核心卖点，主线写，但 schema 全员遵守）

- `cfg.marketing`（默认值见配置 schema）：活动主/副标题、规则文案、**奖品三档**（gold/silver/bronze 各有名称+券码前缀）、客服链接。
- 领奖：结算页「一键领取好礼」→ 按评级映射奖品档位 → 生成演示券码 `前缀-XXXX-XXXX`（保险起见附「本地演示券码」字样）→ 彩带庆祝 + 可复制；再点变为「复制券码」。
- 分享：`navigator.share` 优先，fallback 复制战绩文案。
- **平台接入钩子**（游戏内暴露，营销系统可一行接入）：
  ```js
  WM.marketing = {
    hooks: { onRoundEnd(result), onClaim(result), onShare(result) }, // 可整体/单项覆写，返回 false 阻止默认行为
    register(opts) // 深合并进 cfg.marketing 并立即生效落盘（活动标题/奖品/文案/回调一次配好）
  };
  ```
  `result = { score, maxCombo, accuracy, stars(tier:'gold'|'silver'|'bronze'), gifts:n, claimed, code }`。
- config-panel 增设**「营销」标签页**可编辑上述全部文案与奖品档位（这是「可营销接入属性」的可视化面）。

### 自动演示（`?auto=1`）

封面自动开局；AI 扫描弹出中的地鼠：normal/gold/gift 按反应延迟 260–460ms 出锤，bomb 永不打；狂热期间延迟缩短到 200–320ms。供演示与浸泡测试。

## 视觉风格（全局锁，所有模块遵守）

**草地游园会 × 印刷海报风**：暖米纸底 + 草绿场地 + 红金活动色，扁平 + 细描边 + 实色偏移投影（offset shadow，禁止 blur 阴影）。热闹但克制，印刷品质感，不做糖果渐变卡通。

- 色板：纸底 `#F4EFDF`｜场地草绿 `#7DA45B`｜深草 `#5D8242`｜草地暗纹 `#6B9350`｜土棕 `#8A5A33`｜洞深 `#3B2A1C`｜墨字 `#2B2622`｜深棕描边 `#3A2E24`｜活动红 `#B93A2B`｜深红 `#8F2B20`｜金 `#C99A3C`｜亮金 `#E4B95B`｜米白 `#FFF9EE`
- 圆角 ≤8px；描边 2px `#3A2E24`；投影统一 `box-shadow: 3px 3px 0 rgba(58,46,36,.9)`。
- 封面主标题用衬线（`"Songti SC","STSong",serif`）900 大字红底金边海报感；正文 system-ui。
- 禁：紫蓝渐变、霓虹发光、玻璃拟态、Emoji 图标、blur 阴影、大圆角卡片海。
- 地鼠造型：扁平插画棕地鼠（爪扒洞沿、粉鼻、圆眼、两颗大门牙是本征特征可以有），2px 深棕描边，80px 下剪影可辨；金地鼠金色身+头顶小金星；礼盒鼠抱红礼盒（金色蝴蝶结）；炸弹鼠=黑色圆炸弹+引信火花，一眼可辨「危险勿打」。

## 全局命名

`window.WM` 为唯一顶层命名空间：`WM.LOGIC / WM.ART / WM.AUDIO / WM.FX / WM.CONFIG_PANEL / WM.GAME / WM.marketing`。
每模块文件顶层形如 `window.WM=window.WM||{}; WM.XXX=(()=>{...return {...}})();`
**不要**在模块顶层 `const WM`（build.py 同页拼接会重复声明 SyntaxError）。模块内禁止出现 `</script` 字样。

构建收录顺序（build.py）：`logic, art, audio, fx, config-panel, game`。先到先跑，各模块自包含零交叉 import；缺模块时其他模块必须仍能跑（游戏侧对可缺模块用 NOOP Proxy 兜底，子代理侧不 require 他人）。

## LOGIC（主线自己写 → src/logic.js）

纯函数 + 常量表：`DIFFS`（上表含全部权重/节奏/奖线）、`MOLES`（分值/中文名表）、`pickMole(rng, diffKey, frenzy)` 权重选种、`comboMult(combo, comboOn)`、`tier(score, diffKey)` 评级、`genCode(prefix, rng)` 券码、`?reset=1` 清档（顶层最先执行）。供 game 与测试脚本共用。

## ART（子代理A → src/art.js）

```js
WM.ART = {
  mole(id, pose) -> dataURI   // id ∈ normal|gold|gift|bomb; pose ∈ 'up'|'hit'；viewBox="0 0 100 100"
  holeBack()     -> dataURI   // 洞后片：洞口深色椭圆+洞内壁（地鼠绘在其上层，随后被前片遮挡下半）
  holeFront()    -> dataURI   // 洞前片：洞口下沿土色弧+前沿草皮遮挡片（viewBox="0 0 120 60"）
  hammer(pose)   -> dataURI   // pose ∈ 'idle'|'hit'；木锤：棕柄+红锤头+亮金箍，viewBox="0 0 100 100"
  grassTuft(i)   -> dataURI   // 草丛簇装饰 i∈0..2，点缀场地空白处
  seal()         -> dataURI   // 印章 logo：红底圆角方+金色「鼠」字（封面/顶栏用，CSS 控制尺寸）
  uiIcon(name)   -> dataURI   // sound/soundOff/gift/cfg/clock/trophy/back，viewBox="0 0 24 24" 线性风 2px 描边
};
```

要求：全部 SVG data URI（`'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(...)`）；单图源码 ≤3KB；**90px 下剪影可辨**（手机上地鼠实际显示 ~92px 宽）；扁平插画风、2px 级深棕描边 `#3A2E24`、草地绿/土棕/红金米色板（见上节）、每图至多一处轻渐变；禁止 shadowBlur。
自检：写 `tools/art-preview.html`（本模块单独引入 `../src/art.js`，把全部产物铺开标注），headless 截图后 **Read 截图自查**（渲染错误/全黑/错位/剪影不可辨），最多迭代 3 轮。

## AUDIO（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频

```js
WM.AUDIO = {
  unlock(), play(name, opts), startLoop(name), stopLoop(name), duck(ms),
  setBGMVolume(v), setSFXVolume(v), setMasterVolume(v),
  applyOverrides(map),  // {cue: dataURL} 自定义音效优先，解码失败回落合成
  names: ['pop','whack','whiff','gold','gift','bomb','frenzy','combo','win','tick','click','bgm']
};
```

cue 清单（听感/时长）：
- `pop` 地鼠弹出「啵」短促上滑（音高每次随机 ±2 半音防重复感）~120ms｜`whack` 锤击命中「啪+嗒」厚实 ~150ms｜`whiff` 敲空闷「咚」~120ms｜`gold` 金地鼠清脆双叮（E6→B6）~250ms｜`gift` 礼盒开启上行三连音+闪光感 ~400ms｜`bomb` 低频爆噗+噪声衰减 ~400ms｜`frenzy` 狂热开启上扬 gliss+锣点 ~600ms｜`combo` 随连击档上行清脆叮（opt.level 1-4，A4→C5→E5→A5）~250ms｜`win` 结算三连上行 fanfare+收尾琶音 ~900ms｜`tick` 木鱼短嗒 ~60ms｜`click` UI 轻嗒 ~40ms
- `bgm` 循环：欢快游园进行曲风，C 大调五声音阶 swing 拨弦 + 轻打击，~96bpm，音量自压低（默认 0.4），热闹不吵。

引擎要求：AudioContext 惃创建（首次手势 resume）；`unlock()` 幂等；循环注册表 stop 干净；节点用完 `stop()+disconnect()`；`visibilitychange` 停/续 BGM；`duck(ms)` 压 BGM 再恢复。
自检：`node --check` + 一个 node 脚本 mock AudioContext 跑通全部 cue 不抛错（参考 memory-flip 的做法）。

## FX（子代理C → src/fx.js）Canvas2D 粒子，禁止 shadowBlur（径向渐变 + lighter 叠色）

```js
WM.FX = {
  init(hostEl),                                  // hostEl = #wm-fx 容器，canvas 铺满
  whackStar(x,y),                                // 锤击冲击：放射短线+白星（命中反馈第一层）
  dust(x,y),                                     // 敲空尘土/草屑小喷
  burst(x,y,opt{n,colors}),                      // 通用纸屑/光点爆开
  floatScore(x,y,text,opt{color,size}),          // 飘分（+100 / -200!）：DOM 实现，弹起淡出自毁
  coinFly(x1,y1,x2,y2,opt{n,icon,done}),         // 礼盒奖品沿贝塞尔飞向收集栏（icon 为 img dataURI 可选）
  confetti(n),                                   // 全屏红金草绿彩带雨
  ring(x,y,color), bigText(text,opt{color,sub,scale,dur}), // bigText 用 DOM：金渐变字+描边层+WAAPI 弹入停留淡出自毁
  shake(el, ms),                                 // 屏幕抖动（bomb 用，transform 抖宿主元素）
  stopAll()
};
```

要求：粒子对象池+上限保护；DPR≤2；resize/orientationchange 自适应；`document.hidden` 暂停恢复；色板用红金+草绿+土黄，印刷喜庆风不要霓虹。锤击星/尘土离屏预渲染多帧。
自检：写 `tools/fx-preview.html`（单独引入 `../src/fx.js`，按钮触发各 API），headless 截图 Read 自查，最多迭代 3 轮。

## CONFIG_PANEL（子代理D → src/config-panel.js）

```js
WM.CONFIG_PANEL = { mount(el), open(tab?), close(), isOpen(), onChange(cb) };
```

标签页：
1. **地鼠**（4 种地鼠立绘上传替换 + 单项/全部恢复默认 + 预览格；hit 态由程序压扁+晕圈表现，无需上传）
2. **音效**（11 cue + bgm 上传替换 + BGM/SFX/主音量滑条）
3. **玩法**（默认难度三选一、局时 30–120s、狂热秒数 2–8、连击开关、每只基础分 50–300、每日次数 0–99）
4. **营销**（活动主标题/副标/规则文案（textarea）、奖品三档名称+券码前缀、客服链接）——本作特色 tab
5. **数据**（配置导出 JSON 下载 / 导入 / 恢复出厂 / 清除最佳纪录）

工程要求：`open()` 时深拷贝 `WM.cfg` 为 work；任何编辑改 work 后立即 `onChange(完整深拷贝快照)`；**永不直接读写 localStorage**；样式内联 `<style>`、类名前缀 `wmcp-`；移动端底部抽屉、大点击区、`overscroll-behavior:contain`；全中文文案；存在性兜底（WM.ART/WM.AUDIO 可能缺）。色板遵循上节（纸底米白+深棕描边+活动红）。
自检：写 `tools/config-preview.html`（stub 一个 `WM.cfg` + onChange 打印到页面），headless 截图 Read 自查每个 tab，最多迭代 3 轮。

## 配置 schema（主线定）

```js
cfg = {
  diff: 'normal',       // 默认难度 'easy'|'normal'|'hard'
  timeLimit: 60,        // 局时秒，30-120
  frenzySec: 4,         // 狂热持续秒，2-8
  comboOn: true,        // 连击倍率开关
  baseScore: 100,       // 地鼠基础分（gold/gift/bomb 按 MOLES 表倍数联动：gold×3、gift×1.5、bomb−2）
  dailyLimit: 0,        // 每日次数，0=无限
  vols: { bgm: 0.4, sfx: 0.9, master: 1 },
  moles: {},            // moleId -> dataURL 覆盖（up 态；hit 态程序化压扁）
  sounds: {},           // cue -> dataURL 覆盖
  marketing: {
    title: '欢乐打地鼠',
    subtitle: '游园会 · 赢好礼',
    rules: '限时敲鼠得分，连击翻倍；敲中礼盒鼠集奖品并触发狂热时刻；小心炸弹鼠！按评级领对应好礼。',
    prizes: [
      { tier: 'gold',   name: '游园大奖', prefix: 'WMJ' },
      { tier: 'silver', name: '幸运好礼', prefix: 'WMY' },
      { tier: 'bronze', name: '参与奖',   prefix: 'WMC' }
    ],
    supportUrl: ''
  }
}
```

持久化：localStorage `wm_config_v1`（cfg）/ `wm_state_v1`（`{best:{'<diff>':{score,combo,acc}}, plays:{'YYYY-MM-DD':n}, muted:bool}`）。
`?reset=1` 清档必须在模块读 localStorage **之前**执行（放 logic.js 顶层最先）。

## DOM 骨架（主线负责壳与全部接线）

```
body > #wm-app（390px 通高列，桌面居中；bomb 抖动作用于它）
  #wm-fx（FX canvas 容器，绝对定位铺满、pointer-events:none）
  #wm-top     左：印章 logo + 「欢乐打地鼠」 右：#wm-btn-sound、#wm-btn-cfg
  #wm-hud     #wm-timebar（进度条）+ #wm-time-num ｜ #wm-score 得分 ｜ #wm-combo 连击 ｜ #wm-frenzy 徽章（hidden）
  #wm-tray    收集栏：4 个奖品槽 .slot（gift 命中点亮 + 飞入动画）+ 标签「奖品」
  #wm-board   3×3 洞阵 grid；.hole（定位容器，pointerdown 命中判定）> img.hole-back / .mole(>img) / img.hole-front
  #wm-cover   封面：主标题/规则三行/难度选择 #wm-diff（三档）/最佳纪录 #wm-best/开始按钮 #wm-btn-start/今日次数 #wm-plays
  #wm-result  结算浮层（评级章/成绩/奖品行/领奖 #wm-btn-claim、分享 #wm-btn-share、再来 #wm-btn-again）
  #wm-cfg-host（CONFIG_PANEL mount 点）
  #wm-hammer  锤子元素（fixed，pointer-events:none，锤击动画）
  #wm-toast
```

## URL 参数与测试钩子（主线实现）

`?reset=1` 清档｜`?auto=1` 自动演示｜`?diff=hard` 覆盖难度｜`?time=30` 覆盖局时｜`?muted=1` 静音。
`window.__wm = { version, get state(), get cfg(), get busy(), start(diff?), whack(holeIdx), auto(on), setMuted(b), spawn(holeIdx, moleId, ms), marketing }` 活引用非快照。（`spawn` 供测试定点弹鼠。）

## 主线负责（勿动他人模块）

logic.js｜shell.html + 全部壳 CSS｜game.js 状态机/洞调度引擎/锤击/计分/狂热/结算/领奖/分享/自动演示/持久化/NOOP 兜底接线/营销钩子层｜build.py｜README｜注册案例库｜集成与全部测试。
子代理只写自己的 `src/<模块>.js`（美术/特效/配置另加 `tools/*-preview.html` 自检页），其他文件一律不动。
