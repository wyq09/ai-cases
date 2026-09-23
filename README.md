# AI Cases

AI 辅助产出的案例集合 —— 方案 · 演示 · 视觉作品。

**在线访问**: <https://case.youyongai.com>

## Cases

- [sheep-a-sheep](./sheep-a-sheep/) — 羊了个羊 · 三消羊圈 · 经典三消 tile 层叠游戏复刻：点击无遮挡牌入槽三同消除、移出/撤销/洗牌三道具与复活、无限关卡种子生成经「贪心+预算回溯」求解器验证保证可解、同一求解器驱动 AI 演示自动通关、难度模拟器校准爬升曲线（每 5 关喘息）、17 项难度参数滑杆 + 14 种牌面图标/背景/音效逐个上传替换 + 配置导出导入、Canvas 层叠遮挡与飞牌消除演出、WebAudio 马林巴田园 BGM，单文件零外部资源（[在线游玩](https://case.youyongai.com/sheep-a-sheep/)）

- [tower-crane](./tower-crane/) — 盖楼达人 · 经典盖楼小游戏复刻：吊机摆动点按松钩落块、完美吸附居中连击加成、偏出即坠损命、每 10 层里程碑加命、40 层达标转无尽、难度曲线经时机误差模拟器调参、房间块配色与贴图/背景/吊钩上传替换、11 条音效逐条自定义、25 项玩法参数面板、配置导出导入、进度存档刷新续玩，单文件零外部资源（[在线游玩](https://case.youyongai.com/tower-crane/)）

- [water-sort](./water-sort/) — 倒水挑战 · Water Sort Puzzle 经典倒水排序益智复刻：无限关卡（种子确定性生成 + DFS 求解器验证必可解）、同一求解器驱动提示与 AI 自动演示、Canvas 倒水液流演出与 SVG 玻璃瓶裁剪、三猪观战动画、星级与每关最佳步数、三套房间/水色板与逐条音效上传替换、配置导出导入，单文件零外部资源（[在线游玩](https://case.youyongai.com/water-sort/)）

- [gravity-pinball](./gravity-pinball/) — 重力弹球王 · 微信小游戏 1:1 复刻：拖动瞄准把全部库存球成串射入封闭球场、球停自动回收顶部等下一轮、撞数字 bumper 递减归零爆炸得分、清场过关无限关卡、点按冲击波弹球、球送进漩涡 +3 球回收、加球经济、炸弹与沙漏道具、菱形 ×2 大白球 ×3 倍率、自研 2D 物理（线段/圆/菱形 OBB/弧形地板/180Hz 子步）、关卡种子生成、WebAudio 程序化音效、图标上传与玩法参数配置面板、进度持久化，单文件零外部资源（[在线游玩](https://case.youyongai.com/gravity-pinball/)）

- [tomato-timer](./tomato-timer/) — 番茄时钟 · 专注：番茄工作法倒计时复刻，专注/休息循环、跳过重置、时长切换、当日番茄统计，四种 WebAudio 合成铃声 + 本地音频上传自定义（IndexedDB 存储），后台计时校准，手机竖屏/横屏/桌面自适应，单文件零外部资源（[在线体验](https://case.youyongai.com/tomato-timer/)）

- [thunder-fighter](./thunder-fighter/) — 雷霆战机 · 银河防线 · 经典竖版飞行射击复刻：6 级战机升星与僚机挂架、无限关卡递进、6 大 Boss 三阶段弹幕、火力/炸弹/护盾道具、血条生命与币复活、连击擦弹计分与本地排行、hitstop/震屏/慢动作打击感、WebAudio 24 音效 + 3 轨 BGM、AI 演示可挂机，单文件零外部资源（[在线游玩](https://case.youyongai.com/thunder-fighter/)）

- [bull-flight](./bull-flight/) — 小飞牛炒股大冒险 · "炒股版 Flappy Bird"复刻：小飞牛在 K 线图里飞行、点屏冲高、撞买/卖按钮建仓平仓（半仓滚动/税费/借款还贷）、躲挡板+±10% 涨跌停强制平仓、收盘战报（收益率/最大回撤/称号评定/收益走势图）、本金跨局滚动、牛立绘音效玩法参数可自定义+配置导出导入、AI 自动演示、WebAudio 音效，单文件零外部资源（[在线游玩](https://case.youyongai.com/bull-flight/)）

- [whack-mole](./whack-mole/) — 欢乐打地鼠 · 经典街机打地鼠 × 营销活动 H5：3×3 洞阵三档难度、连击翻倍、礼盒鼠触发狂热时刻（双倍得分金鼠出没）、金银铜牌评级领对应奖品与演示券码、每日次数限制、`WM.marketing.register()` 平台一行接入（文案/奖品/券码前缀/结算领奖分享钩子）、地鼠立绘音效玩法参数营销文案游戏内可自定义+配置导出导入、AI 自动演示、WebAudio 音效、390 竖屏/横屏/桌面自适应，单文件零外部资源（[在线游玩](https://case.youyongai.com/whack-mole/)）

- [memory-flip](./memory-flip/) — 翻牌赢好礼 · 经典营销活动记忆翻牌 H5 复刻：三档难度、开局记忆预览、连击翻倍计分、限时挑战、星级结算、领奖券码与分享战绩，卡面/音效/玩法参数游戏内可自定义，单文件零外部资源（[在线游玩](https://case.youyongai.com/memory-flip/)）

- [pipe-connect](./pipe-connect/) — 接水管 · 经典微信管道连通益智 H5 复刻：点击旋转限时接通、保证可解的棋盘生成、水流逐格灌充演出、关卡递进与计分持久化、AI 自动演示、三套色板与音效自定义，单文件零外部资源（[在线游玩](https://case.youyongai.com/pipe-connect/)）

- [zuma-infinite](./zuma-infinite/) — 祖玛 · 无尽遗迹：无限关卡、同色三球消除与回吸连锁、横竖屏适配、免费道具、程序化音效和本地进度保存；参考画面尚未完成一比一视觉核验。

- [jump-jump](./jump-jump/) — 跳一跳 · 非官方 H5 复刻：按住蓄力、连续中心奖励、六类平台、自动演示、WebAudio 音效与本地进度保存（[在线游玩](https://case.youyongai.com/jump-jump/)）

- [defi-prototypes](./defi-prototypes/) — DeFi 原型馆 · 8 套金融 App 概念设计稿组成一个完整可操作的 H5 App：主屏 8 个应用图标、App 内按钮/返回键/底部 tab/左缘右滑真实导航、Home 条回主屏，21 屏行情兑换/转账键盘/统计图表/卡片开关全可点，玻璃泡泡可点爆，单文件（[在线体验](https://case.youyongai.com/defi-prototypes/)）

- [orchestrateiq-dashboard](./orchestrateiq-dashboard/) — OrchestrateIQ · AI Agent 编排平台监控后台复刻：8 秒录屏 → 全按钮可点的 SaaS dashboard，Overview/Traces/Trace 瀑布/Handoff 断链诊断四屏像素级还原，明暗双主题、⌘K 命令面板、实时直播流、真 CSV 导出（[在线预览](https://case.youyongai.com/orchestrateiq-dashboard/)）

- [slide-puzzle](./slide-puzzle/) — 数字华容道 · 木质滑块拼图复刻：3×3~6×6、加权 A* 提示与长按自动演示、照片拼图模式、WebAudio 合成音效与落叶粒子、纪录刷新不丢（[在线游玩](https://case.youyongai.com/slide-puzzle/)）

- [duofu-777](./duofu-777/) — 多福巨奖 · 澳门赌场 243 路老虎机复刻：四大递增奖池、福娃选奖、免费局、福 WILD 与金身押注档，WebAudio 合成 21 种音效、全 SVG 程序化资产、图标音效玩法全开放配置、积分刷新不丢（[在线游玩](https://case.youyongai.com/duofu-777/)）

- [xiangan-airport-film](./xiangan-airport-film/) — 向海而翔 · 厦门翔安国际机场：45 秒 Blender 三维与实景宣传片，1080p、24fps、原创配乐（[在线播放](https://case.youyongai.com/xiangan-airport-film/)）

- [hecheng-haowu](./hecheng-haowu/) — 合成好物 · 微信小游戏 1:1 复刻：拖拽合成升级、配送员生成商品、X5 一键合成，任务得体力与补分签到全闭环，44 个手绘 SVG 图标（[在线游玩](https://case.youyongai.com/hecheng-haowu/)）

- [skynomad-n90](./skynomad-n90/) — SKYNOMAD N90 · 3D 全场景配置器：Blender 程序化建模 SUV，实时切换天气/季节/环境/车漆/时刻，模型压缩至 102 KB，移动端可用（[在线预览](https://case.youyongai.com/skynomad-n90/)）

- [tibet-wild](./tibet-wild) — 荒原之上 · 藏南秘境 × 藏北无人区 私人自驾远征，23 页横向翻页 PPT（[在线预览](https://case.youyongai.com/tibet-wild/ppt/)）
- [watch-customizer](./watch-customizer) — ATELIER · 3D 腕表自定义工坊：拖拽旋转、PBR 材质实时预览、背带动画换装、本地时间实时扫秒、复杂功能悬停辉光、摄像头 AR 试戴（[在线预览](https://case.youyongai.com/watch-customizer/)）
- [prediction-market](./prediction-market) — 预测市场首页 1:1 复刻：黑白双主题、Canvas 点阵地球自转、像素马赛克背景与实时倒计时微动效（[在线预览](https://case.youyongai.com/prediction-market/)）
- [solcard-carousel](./solcard-carousel) — solcard 加密卡功能轮播：无限居中轮播、雪花冻结动效、数字滚动与辉光仪表盘（[在线预览](https://case.youyongai.com/solcard-carousel/)）
- [metalforge-editor](./metalforge-editor) — MetalForge 进度特效编辑器复刻：WebGPU/WGSL 蜂窝进度条，六种渲染风格实时切换、参数面板、自动播放与可分享状态链接（[在线预览](https://case.youyongai.com/metalforge-editor/)）
- [ra2-lab](./ra2-lab) — RA2 LAB · 红警蓝图兵器库：红警2 风格蓝图查看器 1:1 复刻，Three.js 线框载具建模、六视角正交相机、爆炸图与部件拾取（[在线预览](https://case.youyongai.com/ra2-lab/)）
- [living-grove](./living-grove) — 林间 · 走进活着的世界：程序化苔藓根茎活世界 Three.js 场景、液态金属色散按钮、玻璃坞导航与逐层揭幕入场（[在线预览](https://case.youyongai.com/living-grove/)）

## 本地运行

纯静态文件，无任何依赖：

```sh
git clone https://github.com/wyq09/ai-cases.git
cd ai-cases
npx serve .        # 或 python3 -m http.server
```

浏览器打开 `http://localhost:3000` 即为案例库首页。

## 新增案例

1. 新建 `<case-name>/` 目录，放入静态页面与资源
2. 在根 [`index.html`](./index.html) 案例库中登记入口
3. 推送到 `main`，自动发布上线
