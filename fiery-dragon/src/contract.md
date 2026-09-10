# FIERY DRAGON 火龙珠水果机 — 模块契约

单文件 H5 复刻经典街机「火龙珠」跑马灯水果机。开发期分模块文件，最终由主线合并为单文件 index.html。
所有模块挂 window 全局，无构建、无外部依赖、无外部字体/图片/音频资源（全部程序化生成）。

## 参考图（先用 Read 看图再动手）
- 整机原图: /Users/yiqunwu/.zcode/cli/image-cache/sess_bb18749d-7c0b-43a5-a573-963996d1a57d/image-b8c1ec0b2a7bb6b71de48d0aa5307561.png
- 裁剪细节: 同目录 crop_ring_left.png / crop_ring_right.png / crop_ring_top.png / crop_ring_bot.png / crop_center.png / crop_btns.png / crop_payout.png / crop_top_led.png

## 游戏规格（主线已定，勿改）
24 格灯环顺时针（0=左上角开始）:
`0 橙 | 1 铃铛x3 | 2 BAR×50 | 3 BAR×100 | 4 苹果 | 5 苹果x3 | 6 柠檬 | 7 西瓜 | 8 西瓜x3 | 9 LUCK蓝 | 10 苹果 | 11 橙x3 | 12 橙 | 13 铃铛 | 14 77x3 | 15 77 | 16 苹果 | 17 柠檬 | 18 柠檬x3 | 19 星 | 20 星x3 | 21 LUCK橙 | 22 苹果 | 23 铃铛x3`
倍率: 苹果5 / 橙10 / 柠檬15 / 铃铛20 / 西瓜20 / 星30 / 77·40 / BAR 50与100；x3 格=基础×3；LUCK=免费再跑一次；BAR×100 命中额外赢 JP 池。
押注门 8 个(按倍率行顺序): bar(100) seven(40) star(30) melon(20) bell(20) lemon(15) orange(10) apple(5)。

## ART（子代理A → src/art.js）
```js
window.ART = {
  symbol(key) -> '<svg viewBox="0 0 100 100" …></svg>', // key: apple orange lemon bell melon star seven bar
  luckEgg(color) -> svg,   // color: 'orange' | 'blue'，含放射光背景+蛋+LUCK字样（参照原图LUCK格）
  coin() -> svg,           // 金色游戏币，带 "FD" 或星纹浮雕
  jpCoin() -> svg,         // 中央 JP 金币（金底红字 JP，立体浮雕感）
  scene() -> svg,          // 中央 560×640 场景：紫天空+云+白色城堡(金顶尖)+绿地+松树+左侧白马骑士(白甲红缨枪红羽盔)+右下蓝龙(喷火姿态)+顶部弧形 "FIERY DRAGON" 黄色立体艺术字(红描边)。构图尽量贴近原图。
};
```
要求: 卡通粗描边风、饱和度接近原图；水果带高光与叶子；铃铛金色带铃锤；star 为双星叠放；seven 为红色立体描边数字77；bar 为黑底白字 "BAR/X50/BAR" 两版——bar 用参数? 不拆两版，symbol('bar') 画三行BAR字黑牌即可，X50/X100 文字由布局层叠。
符号内不画 x3 角标（布局层叠）。SVG 必须以 viewBox 起头、无固定 width/height。文件顶层 `window.ART = (() => { ... return {...}; })();`

## SFX（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频
```js
window.SFX = {
  init(),               // 幂等；创建/恢复 AudioContext
  play(name, opts),     // 见下
  setMuted(b), toggleMuted(), isMuted(),
  startBGM(), stopBGM() // 轻量8bit风循环，音量低不喧宾
};
```
name 清单: coin(投币叮当+滑落), bet(短促嘟), allin(快速上行扫弦), go(启动嗖+低鸣), tick(灯跳一格哒，opts.pitch 0.6~1.6 随速度), luck(神秘上行琶音+闪), win0(小奖短jingle), win1(中奖jingle~1.2s), win2(大奖jingle~2.5s), win3(JACKPOT 长jingle~4s+烟花感), gspin(比倍轮盘连续滴答, opts.on/off 用 start/stop 型返回句柄或 play/stop('gspin')), gwin(猜对叮咚), glose(低沉下滑), insert(收分金币流入), press(通用按键)。引擎: 主增益+简单混响(convolver可用噪声IR)；所有节点用完 stop+disconnect；iOS 需首次手势 unlock。文件顶层 `window.SFX = (() => {...})();`

## FX（子代理C → src/fx.js）Canvas2D 粒子，独立叠加层，禁止 shadowBlur（手机GPU杀手，用径向渐变/半透明叠色块）
```js
window.FX = {
  init(hostEl),          // hostEl=全屏fixed容器；内部自建 canvas(rAF驱动, devicePixelRatio≤2, 页面隐藏时暂停)
  coinBurst(x,y,n,opt),  // 视口坐标金币喷泉: n枚, opt{spread,gravity}
  coinRain(n),           // 顶部全屏金币雨
  confetti(n),           // 彩带纸屑
  spark(x,y,color,n),    // 小星光迸发
  flash(color,alpha),    // 全屏一闪
  ring(x,y,color),       // 冲击波圆环
  bigText(text,opt),     // 大字冲屏: opt{color,sub,scale} "JACKPOT!"/"LUCK!"/"大满贯"
  stopAll()
};
```
金币画法: 预渲染离屏金币贴图旋转缩放，性能优先。粒子用对象池。文件顶层 `window.FX = (() => {...})();`

## 主线负责（勿动他人模块）
布局/状态机/跑灯/比倍/投币/结算/JP/GameServer 适配层/集成/验证。
