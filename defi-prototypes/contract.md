# 契约：DeFi 原型馆（8 套金融 App 概念 1:1 交互复刻 H5）

单文件 H5 交付。页面 = 8 个「场景海报」纵向排列，每个场景 1:1 复刻一张参考图（背景/手机壳/排布/构图），每台手机内是**完全可交互**的真机 UI，全部文案中文。

## 参考图（动手前必 Read）

- `ref/img1.jpg` Solidity Swap 三屏（启动/行情/兑换）— **泡沫玻璃质感主打**
- `ref/img2.jpg` Chase 卡三屏（卡片仪表/我的卡片/转账）
- `ref/img3.jpg` EcoFin 两屏（紫色储蓄主页×2）
- `ref/img4.jpg` Aura AI 两屏（问候首页/训练计划）
- `ref/img5.jpg` 轻钱包三屏（引导/首页/统计）
- `ref/img6.jpg` 加密组合三屏（组合/发送/提现）
- `ref/img7.jpg` 紫金银行三屏（转账/首页/卡片）
- `ref/img8.jpg` 卡片管理三屏（支付记录/虚拟卡/卡片设置）

## 全局架构（主线已实现，场景代理只写自己的 scene-X.js）

- `src/app.js` → `window.SW` 命名空间、场景注册表、海报段落渲染、底部 dock 导航、全屏观看器、toast、音频、持久化、错误采集 `window.__errs`
- `src/phone.js` → `SW.phone(opts)` iPhone 壳组件（390×844 设计稿尺寸，灵动岛/状态栏/Home 条）
- `src/charts.js` → Canvas 图表库（禁 shadowBlur，DPR≤2，自动入场动画）
- `src/ui.js` → tabs/seg/toggle/slider/keypad/sheet/carousel/avatar/press 组件
- `src/fx-bubbles.js` → 玻璃泡泡引擎
- `src/scene-a.js … scene-h.js` → **8 个场景代理各写一个文件，其他文件一律不动**

构建：`python3 build.py` 把 shell.html + 所有 src/*.js 拼成 `index.html` 单文件。

## 场景模块接口（锁死）

```js
SW.scenes.register({
  id: 'a',                 // 场景字母，与文件名一致
  num: 1,                  // 图号（海报序号）
  title: 'Solidity Swap · 兑换',
  sub: '启动页 · 行情 · 币币兑换',
  bg: '#D8D7EA',           // 海报背景 CSS（纯色/渐变均可）
  ambience: { tint: '210,205,255', density: 0.45 },  // 背景氛围泡泡，可不传
  captions: ['移动应用 / 网页设计', '2025 · 概念稿', 'Aura AI 概念'],  // 可选：海报顶部三栏小字
  build(poster, api) {     // poster=海报容器 div；api 见下
    // 在这里创建手机、塞内容；不返回任何值
  }
});
```

`api`（build 的第二参数）与全局 `SW` 等价，另有便捷方法：

```js
api.phone({
  scale: 0.8,          // 缺省：桌面 0.8，窄屏自动 (vw-48)/390 与 0.8 取小
  status: 'light',     // 状态栏文字颜色 'light'白 | 'dark'黑，缺省 light
  screenBg: '#0B0B12', // 屏幕底色
  name: 'a1',          // 必填！全屏观看器/深链用，格式：场景字母+序号
}) // → { wrap, root, screen }
// wrap：布局占位 div（已按 scale 缩放尺寸），poster.appendChild(wrap)
// root：.phone 元素（390×844，已 transform:scale），往 root 里加自绘悬浮层
// screen：内容滚动容器（overflow-y:auto），UI 全放这里；顶部预留 54px 状态栏高度（状态栏是透明覆盖层）
```

## 组件 API（锁死签名，勿重复造）

```js
// charts（全部 canvas，el 为挂载元素，自动 DPR）
SW.charts.spark(el, data, {color='#fff', h=40, w, fill=false, width=2})            // 迷你折线
SW.charts.line(el, {series:[{data,color,width,fill,fillColor}], h, min, max,
                   dot:{i,color,r}, vline:{i,color,label}, h})                      // 平滑曲线+标注点/竖虚线
SW.charts.bars(el, {values:[{v,color,h(0~1相对高)}], h, gap, rounded, animate=true}) // 圆角柱状
SW.charts.candles(el, {data:[[o,c,h,l],...], up='#8B7CF6', down='#CFC9F2', h})      // K线
SW.charts.gauge(el, {value=0.75, startDeg=-215, endDeg=35, thick=20,
                     track='rgba(255,255,255,.1)', from='#5B5FEF', to='#7DE3FF',
                     glow=true, h, center(el)})                                     // 环形仪表(圆头+柔光)

// ui（全部返回控制器或有回调；所有可点元素自带按压反馈）
SW.ui.press(el)                                   // 给任意元素补 ripple+按压缩放
SW.ui.tabs({el, items:[{v,label}], value, onChange(v)})           // 胶囊 tab 组
SW.ui.seg({el, items:[{v,label}], value, onChange(v)})            // 分段控件（整条底座）
SW.ui.toggle(el, {value, onChange(v)})            // iOS 开关 → {get,set}
SW.ui.slider(el, {min,max,step,value,onChange(v)})// 滑块（含已填充轨道）→ {get,set}
SW.ui.keypad({el, keys:[{t,wide?,icon?}], onPress(t)})            // 3列数字键盘
SW.ui.sheet({host, title, items:[{v,label,desc}], value, onPick(v)}) // 手机内底部弹层，host=screen
SW.ui.carousel({el, count, value=0, onChange(i)}) // 横向轮播（拖拽+圆点）→ {go(i)}
SW.ui.avatar({txt, bg, size=40})                  // 首字/字母头像 → el
SW.toast('文案')                                   // 全局顶部 toast

// fx 泡泡（重点特效）
SW.fx.bubbles(host, {
  count=14, minR=16, maxR=80, speed=0.3,          // 数量/半径/上升速度
  tint='220,220,255',                              // 泡泡边缘色 RGB 串
  interactive=true,                                // 点击爆开（水珠粒子+音效）
  mode='rise'|'cluster',                           // rise=升腾漂浮 cluster=星团抖动
  center:{x,y,r},                                  // cluster 模式星团中心/半径(host内像素)
  z=1                                              // canvas 层级
}) // → {destroy(), burst(x,y,n)}
SW.audio.pop() / SW.audio.tap()                    // 泡泡爆/轻点音（已处理解锁）
```

## 中文文案规范

- **所有 UI 文字一律中文**（含按钮、标签、占位符、状态栏时间保持 9:41）。
- 品牌名/币种代码保留原文：SOLIDITY SWAP、VISA、MasterCard、BTC、ETH、SOL、XRP、LTC、USD、ISA、Spotify/Netflix/星巴克用「字母/几何近似 logo」（绿底音符、红底 N、绿底★），不引外链。
- 人名音译：Amara→阿玛拉、Gilbert Arenas→吉尔伯特·阿里纳斯、Kristin Watson→克里斯汀·沃森、Esther→埃丝特、Ethan Carte→伊桑·卡特、Maicol Handray→梅克尔·汉德雷。
- 金额保持 $ 原数值（如 $12,692.00），标签翻译：Markets→行情、Overview/News/Watchlist→概览/资讯/自选、Total M.Cap→总市值、Top Gainers→涨幅榜、You send/You get→你支付/你到账、Rate→汇率、Price impact→价格影响、Liquidity provider fee→流动性手续费、Confirm→确认、Get started→开始使用、Balance→余额、My Cards→我的卡片、Send Money→转账、Transactions→交易记录、Expenses→支出、View All→查看全部、Home/Cards/Invest/History/Profile→首页/卡片/投资/记录/我的、Continue→继续、Withdraw→提现、Deposit→存入、Statistics→统计、Income→收入、Services→服务、Transfer→转账、Voucher→卡券、Bill→账单、More→更多、Quick Send→快速发送、Hold To Send→长按发送、Total Balance→总余额、Quick Access→快捷入口、Top Up→充值、Statements→账单明细、Bills Pay→生活缴费、Loans→借贷、Freeze Cards→冻结卡片、Limit Request→额度调整、Deposits→存款、Add New Card→添加新卡片、Payment History→支付记录、Valid Thru→有效期、Save→保存、Tomorrow→明天、Days→天、Heart rate→心率、Training→训练、Good morning→早上好。

## 交互基线（每个场景必须做到）

1. 所有 tab/分段可切换并真实改变下方内容（哪怕换一组列表数据）。
2. 所有按钮有按压反馈；无后续页面的按钮点出 `SW.toast('「xx」为原型演示')`。
3. 数字键盘真实改写金额显示；滑块真实拖动；开关真实翻转；轮播可拖拽/点点切换。
4. 参考图暗示的页内跳转要做出来（如「开始使用」滑到下一屏、确认/继续弹出成功浮层），手机内返回箭头可返回。
5. 图表入场自动动画（charts 已内置）；图1 场景的泡沫必须用 SW.fx.bubbles 且可点击爆开。
6. 手机内弹层（sheet/成功浮层）用绝对定位盖在 screen 内，不超出手机圆角。

## 工程红线

- 只写自己的 `src/scene-X.js`；DOM id/class 一律加 `sX-` 前缀防冲突。
- 禁外部资源：无外链图片/字体/CDN；图标全用内联 SVG（stroke 1.6~1.8、圆头）或 emoji；头像用 SW.ui.avatar。
- 禁 shadowBlur / backdrop-filter 嵌套大区域；纯 CSS 动画优先 transform/opacity。
- JS 字符串里不得出现 `</script`。
- 颜色从参考图取色，渐变要平滑（同色系 2~3 档），卡片圆角 18~26px，手机内布局用 px（手机恒为 390×844 设计稿）。
- 场景内手机排布用 api.phone 的 wrap + CSS（flex 排开、可给个别手机 translateY/rotate 微调），构图贴近参考图。
- 自检必须零报错：`window.__errs` 为空。

## 自检循环（每个场景代理必须执行，最多 3 轮）

```bash
cd /Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/defi-prototypes
node --check src/scene-X.js
node tools/shot.js "file://$PWD/test.html?scene=X" /tmp/sX-poster.png 1440 1000 --wait 2200 --console
node tools/shot.js "file://$PWD/test.html?scene=X&phone=X1" /tmp/sX-full.png 420 900 --wait 1800 --console
```

然后 **Read 截图自查**：手机壳是否完整、布局是否溢出/塌陷、文字是否中文、图表/特效是否渲染、配色是否贴近参考图。有问题改完重拍。

## 主线负责（场景代理勿动）

app.js / phone.js / charts.js / ui.js / fx-bubbles.js / shell.html / test.html / build.py / index.html。发现地基 bug 在汇报里说明，不要自己修别人的文件。
