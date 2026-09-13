# AI Cases

AI 辅助产出的案例集合 —— 方案 · 演示 · 视觉作品。

**在线访问**: <https://case.youyongai.com>

## Cases

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
