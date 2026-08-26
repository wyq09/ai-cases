# ATELIER · 3D 腕表自定义工坊

单页 WebGL 腕表自定义器，基于 Three.js 实现。

## Features

- **Drag-Orbit**: 拖拽旋转、滚轮缩放
- **PBR 材质实时预览**: 表壳 / 表盘 / 指针 / 表带多组材质，平滑过渡切换
- **Animated Strap Swaps**: 表带交叉淡入淡出换装
- **Real-time Hand Sweep**: 本地时间实时扫秒（含 GMT 子表盘）
- **Complication Hover-Glow**: 日期、24H、昼夜复杂功能悬停辉光 + 提示
- **Webcam-AR "Try on your wrist"**: 调用摄像头，将 3D 腕表叠加到视频上，配合对位圆环

## Run

纯静态，无构建依赖，3D 视图可直接双击打开（已打包为单文件 bundle）：

```sh
cd ai-cases
python3 -m http.server 8000
# open http://localhost:8000/watch-customizer/
```

- 3D 自定义视图：支持直接 `file://` 打开
- AR 试戴：需通过 `http(s)` / `localhost` 访问，以启用摄像头权限
