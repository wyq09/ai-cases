# 多福巨奖 777 — 模块契约

单文件 H5 复刻澳门赌场「多福巨奖」(88 Fortunes / Duo Fu Duo Cai 系) 5×3 243路老虎机。
开发期分模块文件，最终 build.py 合并为单文件 index.html。所有模块挂 window 全局，
无构建、无外部依赖、无外部字体/图片/音频资源（全部程序化生成）。

## 参考图（先 Read 看图再动手）
- 整机原图: /Users/yiqunwu/.zcode/cli/image-cache/sess_e1a08b7d-a329-4f31-ab2e-9a8f4137718a/image-5dbd5a073987427e644646fb5d891284.png
- 裁剪: duofu-777/ref/top.png（顶部四奖池屏）、ref/main.png（主滚轮屏）、ref/deck.png（机身按键面板）

## 游戏规格（主线已定，勿改）
- 5 轮 × 3 行，243 路全 ways（从左到右相邻轮含该符号即连着算，任意行位组合各算一路）。
- 符号 id（固定）:
  - 低: `10 J Q K A`
  - 高: `koi`(金鱼) < `frog`(金蟾) < `turtle`(金龟) < `dragon`(金龙) < `ingot`(元宝碗)
  - 金身变体: `g_koi g_frog g_turtle g_ingot`（dragon 无金身）
  - Scatter: `gong`(金锣)，任意位置 3+ 触发免费局
- 押注档 5 档（默认分值 8/18/38/68/88，可配置），档位 t 开启前 t 个金身符号:
  档1→g_frog，档2→+g_koi，档3→+g_turtle，档4→+g_ingot，档5→全部且中奖加成×1.2。
  金身落在轮面时替换对应普身，并为其奖池轨道+1。
- 四奖池: `grand`(多福巨奖) `major`(多财大奖) `minor`(多福中奖) `mini`(多福小奖)。
  金身→轨道映射: g_frog→mini、g_koi→minor、g_turtle→major、g_ingot→grand。
  轨道需求默认 mini5/minor8/major12/grand15（可配置），轨道在会话中持续累积、中奖后清零该轨道，其余保留。
- 任一轨道满 → 轮末进入「福娃选奖」: 15 枚金币(mini×5 minor×4 major×3 grand×3)盖置，
  逐枚翻开，任一奖名集满 3 枚 → 中该奖池金额，未翻的自动揭示，回基础局。
- 免费局: 3+ gong → 10 次（可配置），3+ 再触发 +5；免费局滚轮条剔除全部低符号(A K Q J 10)、金身全开，按触发时押注计。
- 大奖演出: 本轮赢分/押注 ≥15× 「大奖」，≥30×「超级大奖」全屏演出；奖池中奖单独演出。

## 全局命名
`window.DF` 为唯一顶层命名空间，各模块挂在 `DF.ART / DF.AUDIO / DF.LOGIC / DF.FX / DF.CONFIG_PANEL`。
每模块文件顶层形如 `window.DF = window.DF || {}; DF.ART = (() => {...return {...}})();`

## ART（子代理A → src/art.js）
```js
DF.ART = {
  symbol(id)   -> '<svg viewBox="0 0 100 100" …>', // id: 10 J Q K A koi frog turtle dragon ingot gong
  gold(id)     -> svg,   // id: koi frog turtle ingot（金身版：普身造型+金底放射纹+红金描边圈，参照原机金字）
  coin()       -> svg,   // 金色游戏币，浮雕"福"字
  logo()       -> svg,   // 顶部艺术字 LOGO「多福巨奖」，金字红底，喜庆浮雕（参照原图顶部）
  bgMain()     -> svg,   // 主屏背景 800×480：紫红渐变+暗金龙纹+四角金饰，低调不抢符号
  bgTop()      -> svg,   // 顶部奖池屏背景 800×300：深红+金框+暗纹
  kidFu()      -> svg,   // 福娃小孩头像（原图多福字样上的娃），选奖界面用
};
```
要求: 全部 viewBox 起头、无固定 width/height；金/红/紫赌场奢华风、符号要在 ~80px 下清晰可辨
（大胆的剪影+金描边+径向渐变立体感）；SVG 内可用 gradient/filter，但导出为
`'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)` 字符串返回；
单图源码尽量 ≤3KB。文件顶层 `window.DF=window.DF||{}; DF.ART=(()=>{...})();`

## SFX（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频文件
```js
DF.AUDIO = {
  unlock(),                 // 首次用户手势调用；幂等，创建/resume AudioContext
  play(name, opts={}),      // opts: {volume, rate}
  startLoop(name), stopLoop(name),          // 循环型 cue（bgm/reelSpin）
  duck(ms),                 // BGM 压低闪避（大奖演出时）
  setBGMVolume(v), setSFXVolume(v), setMasterVolume(v),   // v: 0~1
  applyOverrides(map),      // map: {cue: dataURL(wav/mp3 base64)}，自定义音效优先于合成
  names: [...]              // 全部 cue 名数组
};
```
cue 清单: `bgm`(循环,五声音阶古筝拨弦+低垫,音量低), `reelSpin`(循环,滚动呼啸), `reelStop`(每轮制动顿),
`allStop`(落定重音), `betUp` `betDown`, `button`(通用按键嗒), `goldLand`(金身上桌叮), `railFill`(轨道推进),
`countTick`(计分滴答,opts.rate 可加速), `wayWin`(中奖和弦闪), `winSmall` `winMid` `winBig`(渐长 jingle),
`jackpot`(奖池长演出 ~4s), `freeTrigger`(锣响+欢呼感), `pickReveal`(翻币), `pickMatch`(凑齐叮咚),
`coinRain`(金币雨沙沙), `refill`(补币流入), `error`(无效操作低鸣)。
引擎: 主 gain→(可选轻混响 convolver 噪声IR)；iOS 首手势 unlock；循环型用 handle 或内部注册表 stop；
所有节点用完 stop+disconnect 防泄漏。文件顶层 `window.DF=window.DF||{}; DF.AUDIO=(()=>{...})();`

## FX（子代理C → src/fx.js）Canvas2D 粒子，独立叠加层，禁止 shadowBlur（手机GPU杀手，用径向渐变/半透明叠色块）
```js
DF.FX = {
  init(hostEl),            // 全屏 fixed 容器；内部自建 canvas(rAF, DPR≤2, 页面隐藏暂停)
  coinBurst(x,y,n,opt),    // 视口坐标金币喷泉 opt{spread,gravity}
  coinRain(n),             // 顶部全屏金币雨
  confetti(n),             // 红金彩带
  spark(x,y,color,n),      // 星光迸发
  flash(color,alpha),      // 全屏一闪
  ring(x,y,color),         // 冲击波圆环
  bigText(text,opt),       // 大字冲屏 opt{color,sub,scale}（"大奖!"/"超级大奖"/奖名）
  stopAll()
};
```
金币: 预渲染离屏贴图旋转缩放；粒子对象池。文件顶层 `window.DF=window.DF||{}; DF.FX=(()=>{...})();`

## CONFIG_PANEL（子代理D → src/config-panel.js）
```js
DF.CONFIG_PANEL = {
  mount(containerEl),       // 挂载点（全屏抽屉/弹层，含遮罩）
  open(tab?), close(), isOpen(),
  onChange(cb),             // cb(完整新cfg) —— 面板内任何改动即回调，主线负责存 localStorage+应用
};
```
四个标签页: `图标`(全部符号/金币/LOGO 上传替换+恢复默认，文件→dataURL)、
`音效`(cue 逐个上传替换+BGM/SFX/总音量滑条)、`玩法`(初始积分、押注档位5个数值、轨道需求、
免费局次数与追加、大奖倍率阈值、中奖倍率 winScale 0.5~2)、`数据`(导出配置JSON/导入/一键重置)。
cfg 读写走 `DF.cfg`（主线提供的全局对象，含 schema 默认值）；面板不自己碰 localStorage。
移动端可用（大点击区、滚动手势不冲突）。文件顶层 `window.DF=window.DF||{}; DF.CONFIG_PANEL=(()=>{...})();`
样式内联在模块里（一个 `<style>` 注入），类名前缀 `dfcp-`。

## 配置 schema（主线定，DF.cfg）
```js
{ startCredits:10000, betTiers:[8,18,38,68,88],
  railNeed:{mini:5,minor:8,major:12,grand:15},
  freeSpins:10, freeRetrigger:5, tier5Boost:1.2,
  payDivisor:50,            // 每路赢分 = PAYS[s][n] × bet / payDivisor
  winScale:1.0, bigWinTiers:[15,30],
  jackpots:{grand:{seed:8888.88,grow:0.010},major:{seed:688.88,grow:0.006},
            minor:{seed:88.88,grow:0.003},mini:{seed:12.88,grow:0.0015}}, // grow=每注占比
  vols:{master:1,bgm:0.5,sfx:1}, icons:{}, sounds:{}, turbo:false, autoStopBigWin:true }
```
持久化: localStorage `df777_state_v1`(积分/奖池/轨道/档位/统计/设置) 与 `df777_config_v1`(cfg 覆盖)。

## DOM 骨架（主线负责 index 壳与全部接线，勿动他人模块）
`#cabinet > #topScreen(四奖池+两侧赔付表) / #mainScreen(#reelBox>5×.reel>.strip>.cell / #winInfo) /
#bottomBar(#creditVal #betVal #winVal) / #deck(押注-/档位点/押注+ #btnAuto #btnTurbo #btnSpin #btnMenu)`
弹层: `#paytableModal #menuModal #pickBonus #bigWinOverlay #configMount #fxLayer`

## 主线负责（勿动他人模块）
布局CSS/状态机/滚轮动画/243路结算/免费局/选奖/自动押注/持久化/RTP模拟/集成/验证/README。
