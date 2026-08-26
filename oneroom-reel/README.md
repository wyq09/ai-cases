# ONEROOM Motion Reel · 网页复刻

一个纯前端实现的 15 秒动态排版（kinetic typography）宣传片复刻。
原始动效由 X 上的 [**@studio_oneroom**](https://x.com/studio_oneroom/status/2092220604309205341) 创作，本仓库是对其视觉风格与剪辑节奏的代码复刻练习，仅用于学习交流，原作版权归 @studio_oneroom 所有。

## 预览

直接用浏览器打开 `index.html`，或本地起任意静态服务：

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000
```

页面尝试自动带声播放；若被浏览器自动播放策略拦截，点击画面中的「▶ 点击播放」即可。播放结束自动循环。

> 调试：追加 `?freeze=秒数` 可把时间轴钉在任意时刻（如 `index.html?freeze=7.1`），用于逐场景检查。

## 实现要点

- **音画同轴**：以 `audio.currentTime` 作为唯一主时钟，全部动画都是时间的纯函数，循环回卷零漂移；浏览器阻止出声时退化为内部时钟静音预览。
- **13 个场景**：黑场刮痕 → 橙盘粒子漩涡 → MiniM 打字机 → MiniMax H3 字标 → 竖条擦除 → MOTION 跑马灯 → GRAPHICS 透视文字海（CSS 3D）→ 标签卡序列 → 日文双卡 → 雷达圈 + 玻璃碎裂（110+ 三角 shard）→ 暗场主字 → AI STUDIO 定版。
- **三个 Canvas 系统**：多向刮痕/过灭点速度线（LineFX）、子步积分的螺旋拖尾漩涡（Vortex）、按扇环 Voronoi 切分的碎片飞散（Shards）。
- **全局质感层**：描边水印墙、difference 混合的条形码噪点（按显示分辨率生成贴图）、胶片颗粒、剪辑白闪、手持抖动与偶发色差鬼影。
- **性能**：只写 `transform/opacity`，DPR 上限 2，粒子上限受控；无头 Chromium 实测 120fps。

## 结构

```
oneroom-reel/
├── index.html          # 场景骨架
├── css/style.css       # 版式 / 调色板 / 全局层
├── js/main.js          # 主时钟 · 场景表 · 渲染器 · 粒子系统
└── assets/
    ├── audio.m4a       # 原片音轨（仅本地演示用，版权归原作者）
    └── fonts/archivo-black-latin.woff2   # OFL 开源字体
```

## License

代码部分 MIT；字体 SIL OFL；原始视频画面与音频的著作权归 @studio_oneroom，请勿商用。
