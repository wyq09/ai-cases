# ra2-lab · 红警蓝图兵器库

《红色警戒 2》风格「LAB 蓝图查看器」复刻：蓝色晒图底上，五种经典载具以线框蓝图呈现，可拖拽环视、切换视角、爆炸拆解与部件拾取。

**零构建** —— 原生 HTML/JS，仅内置 three.js（r149），克隆即用。

## 特性

- **5 种载具程序化建模**：PRISM / MIRAGE / APOCALYPSE / GATLING / ROCKET GATLING，`EdgesGeometry` 线框 + 半透明剖面填充 + 斜线 hatch 装甲面
- **流动履带**：履带板沿环形轨道逐帧推进，负重轮辐条同步滚动（ANIMATE 档）
- **正交相机六预设**：ISO / 3/4 F / 3/4 R / SIDE / FRONT / PLAN，指数阻尼平滑过渡，FREE / LOCKED 状态联动
- **爆炸图**：分组沿各自爆炸向量分离，遥测面板实时显示 EXPLODE 百分比
- **部件拾取**：悬停高亮、点击选中弹出 SELECTED 图层说明（CLEAR 可清除）
- **标注系统**：01–05 编号锚点 + SVG 折线引线 + 图层卡，跟随 3D 锚点逐帧投影
- **VIEW TELEMETRY**：方位角 / 仰角 / 正交缩放 / 爆炸 / 运动状态 / 分组数与 FPS 实时刷新
- **乱码解码动效**：切换载具时全 HUD 文本 scramble 解码（尊重 `prefers-reduced-motion`）
- **响应式**：桌面三栏 HUD；移动端底部车辆条 + 单行控制，双指捏合缩放，竖屏自动后移相机并抬高模型

## 运行

任意静态服务器指向本目录即可：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 深链参数

`?v=1..5` 选载具，`&view=iso|34f|34r|side|front|plan`，`&explode=1`，`&mode=static`，`&sel=1..5` 预选部件（用于分享与自动化截图）。

## 结构

```
index.html            入口（HUD + 场景 + 全部逻辑）
assets/three.min.js   three.js r149（本地内置）
```

---

灵感来自 X 上流传的红警 2 蓝图风格载具展示页，为学习 Three.js 线框渲染与 HUD 工程而作。
