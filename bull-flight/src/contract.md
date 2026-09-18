# bull-flight 契约（唯一事实源，动码前必读）

复刻对象：抖音"炒股版 Flappy Bird"小游戏——小飞牛沿 K 线图飞行，玩家点屏幕让牛冲高（=做多力量），
牛撞到红色"买"按钮自动按交易风格买入、撞到绿色"卖"按钮全部平仓，躲避半透明管道；碰管道或触及
涨跌停边界（主板 ±10% 即价格 90/110）本局结束，强制平仓结算，出"收盘战报"。

## 参考图（先 Read 再动手）
- ref/f01.png 开局准备整页 · ref/setup_page.png 放大版
- ref/f02..f16.png 游戏过程 · ref/hud_top.png 顶部 HUD+仓位条 · ref/buy_btn.png 买钮 · ref/sell_btn.png 卖钮
- ref/pipes.png 管道+蜡烛+成本线 · ref/hud_bottom.png 成交提示+迷你K · ref/f17.png 暂停弹层
- ref/f18.png 收盘战报 · ref/report_bottom.png 战报下半 · ref/bull.png 牛特写（黄棕斑纹+白翅）

## 游戏规格（锁死，勿改）
- 价格空间 [90, 110]，基准 100，即主板 ±10% 涨跌停；触界=爆涨跌停=本局结束
- 点击屏幕 = 给牛向上冲量（做多力量），不点受重力下沉 + 随机噪声；牛的 y = 当前价
- 世界坐标驱动：管道/按钮存 born=生成时 worldX，渲染 x = x0 − (worldX−born)；蜡烛每
  56px 世界距离由 game 层调 LOGIC.finalizeCandle() 定界一根（newRound 预生成 9 根历史 K）；
  任何帧率/暂停恢复/遮挡节流下位移严格 = speed×dt
- 难度默认（config-panel DEF）：gravity 540 / jumpV 300 / noise 20 / scrollSpeed 115 /
  pipeGap 0.24 / pipeEvery 7–11 根蜡烛 / buyEvery 4–7s / 首管道 ~4.4s / gap 中心可过性约束
  （距牛位 ≤3.2 价位、距上个 gap ≤3.6 价位）；牛视觉 82×62，hitbox ±15/±11
- 首仓：开局 ~0.4s 后自动按交易风格建首仓（对应视频"空仓待入场"→"多头·1笔"）
- 买钮（玫红圆 R34"买"+价签）：牛碰到 → 半仓滚动买入（cash×50%，税费 0.04% 摊入成本）
- 卖钮（绿色圆 R30"卖"+价签）：仅持仓时生成，碰到 → 全部平仓，盈亏落袋
- 管道：宽 78px，成对上下伸出，gap 高约 15% 视高，端帽斜纹；碰到=本局结束
- 结束时自动强制平仓："浮盈需平仓兑现，浮亏扣除"
- 结算称号按收益率+最大回撤分档（账户医学奇迹=盈利且回撤≥5%）
- 贷款：开局准备页"借款加仓"最多借本金×0.5，结算自动还贷，可致破产结局

## 全局命名空间 window.BF（全部模块挂这里，禁止另起全局名）
- BF.ART.bullFrame(i) -> dataURI   i=0|1 两帧扇翅
- BF.ART.bullHead() -> dataURI      战报/大厅牛头像
- BF.ART.bullBig() -> dataURI       大厅大立绘
- BF.ART.icon(name) -> dataURI      name∈{pause,play,lock,back,settings,loan,share,
                                    dividend,buyback,issue,bank,microloan,leverage,short}
- BF.ART.qr(seed) -> dataURI        装饰二维码
- BF.ART.ready -> bool
- BF.SFX.init() / unlock() / play(name) / setMuted(b) / bgmOn(b) / ready
  name∈{tap,buy,sell,profit,loss,crash,ui,open,pause}
- BF.FX.burst(x,y,type,type∈{coin,feather,plus,minus}) / floatText(x,y,str,color) / step(dt,ctx)
- BF.CFG.all() -> cfg / apply(snapshot) / openPanel() / exportJSON() / importJSON(str)
- BF.LOGIC.newRound(principal, loan) / tick(dt) / tapImpulse() / state（价格/持仓/账目/曲线/成交记录）
- BF.GAME.start() / pause() / resume() / update(dt) / render(ctx) / on / alive
- BF.UI.show(page, page∈{hall,setup,game,report}) / toast(str) / refreshHUD()
- BF.main 由 main.js 提供：BF.boot()

## 配置 schema（BF.CFG，localStorage key：bf.cfg.v1）
{ gravity:540, jumpV:300, noise:20, candleTicks:22, scrollSpeed:115,
  pipeGap:0.24, pipeEveryMin:7, pipeEveryMax:11, buyEveryMin:4, buyEveryMax:7,
  feeRate:0.0004, loanK:0.5, bgm:true, sfx:true, bullImg:null }
work 副本+onChange(完整快照)+apply；面板永不直接写 localStorage。

## 存档（localStorage key：bf.save.v1）
{ principal 起始本金(默认 25892), asset 当前总资产, best 最佳收益率, rounds 累计局数,
  lastReport 上局战报快照 }；?reset=1 必须在模块读 localStorage 之前清。

## DOM 骨架 id
#app > #page-hall / #page-setup / #page-game(>#hud-top #hud-pos #cv #hint #mini)
/ #page-report / #dlg-pause / #dlg-detail / #panel-cfg / #toast

## 单文件管线
src/*.js 模块 + src/shell.html(<!--MODULE_SCRIPTS-->占位) + build.py 拼接；
产物 index.html（仓库根 bull-flight/）。禁止 "</script" 字面量出现在 JS 字符串。

## 主线负责（勿动他人模块）
logic.js / game.js / ui.js / main.js / style.css / shell.html / build.py 由主线写；
art.js 归美术代理、audio.js 归音频代理、fx.js 与 config-panel.js 归主线批 2（也可主线自写）。
互调一律走 window.BF.*，模块未就绪时用 NOOP Proxy 兜底。
