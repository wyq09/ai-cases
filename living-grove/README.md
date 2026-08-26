# 林间 · 走进活着的世界

单屏品牌落地页：一座程序化生成的苔藓根茎活世界 Three.js 场景，配以改编自液态金属色散着色器的交互按钮。

## Features

- **Living World Scene**: 横卧的古根苔肩由管状扫描几何程序化拼合，顶点噪声位移熔去管感；草叶（2.6 万实例）、蕨类、小花、花粉尘、蝴蝶全部在 GPU 上随风摇曳
- **GL-CSS 像素对齐**: 几何按 1600 × 880 设计单位建造，相机距离随视口推算，GL 地标与 DOM 布局逐像素对齐
- **Liquid-Metal Buttons**: WebGL2 五通道色散着色器——平行谷线场、逐波长平台采样、自折射、按压涟漪与指针扰动；入场巡检脉冲从根肩荡开一圈受光扫描环
- **Glass Dock Nav**: 悬浮玻璃坞导航，药丸随指针靠近弹性放大，conic 高光描边实时指向指针
- **Staged Entrance**: clip-path 遮罩逐层揭示，卡片图版以 12 级步进扫描展开，采样自图像的像素点沿推进边缘聚拢
- **Procedural Imagery**: 两张卡片「摄影」由 Canvas 2D 程序化绘制（苔藓软垫 / 雾林树影），页面零外部图片资源

## Run

纯静态，Three.js r149 已本地化到 `assets/`，字体走 Google Fonts CDN（缺失时回退系统字体）：

```sh
cd ai-cases
python3 -m http.server 8000
# open http://localhost:8000/living-grove/
```

- 桌面 / ≤900px 单列两套构图，`prefers-reduced-motion` 下静帧渲染
- 液态金属与场景各持独立 WebGL 上下文，WebGL2 不可用时页面仍完整可用
