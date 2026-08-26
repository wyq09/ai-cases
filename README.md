# AI Cases

AI 辅助产出的案例集合 —— 方案 · 演示 · 视觉作品。

**在线访问**: <https://case.youyongai.com>

## Cases

- [tibet-wild](./tibet-wild) — 荒原之上 · 藏南秘境 × 藏北无人区 私人自驾远征，23 页横向翻页 PPT（[在线预览](https://case.youyongai.com/tibet-wild/ppt/)）
- [watch-customizer](./watch-customizer) — ATELIER · 3D 腕表自定义工坊：拖拽旋转、PBR 材质实时预览、背带动画换装、本地时间实时扫秒、复杂功能悬停辉光、摄像头 AR 试戴（[在线预览](https://case.youyongai.com/watch-customizer/)）
- [prediction-market](./prediction-market) — 预测市场首页 1:1 复刻：黑白双主题、Canvas 点阵地球自转、像素马赛克背景与实时倒计时微动效（[在线预览](https://case.youyongai.com/prediction-market/)）
- [solcard-carousel](./solcard-carousel) — solcard 加密卡功能轮播：无限居中轮播、雪花冻结动效、数字滚动与辉光仪表盘（[在线预览](https://case.youyongai.com/solcard-carousel/)）
- [metalforge-editor](./metalforge-editor) — MetalForge 进度特效编辑器复刻：WebGPU/WGSL 蜂窝进度条，六种渲染风格实时切换、参数面板、自动播放与可分享状态链接（[在线预览](https://case.youyongai.com/metalforge-editor/)）

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
