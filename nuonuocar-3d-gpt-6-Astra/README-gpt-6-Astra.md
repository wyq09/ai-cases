# 挪挪车 3D · PARK A LITTLE

一座可以旋转的微缩停车场。真实 WebGL 3D 车辆、标记车位、光照与阴影，乘客走到车门旁逐个上车，多车可以同时出驶。

## 打开

线上入口：<https://case.youyongai.com/nuonuocar-3d-gpt-6-Astra/index-gpt-6-Astra.html>

在仓库根目录运行：

```sh
python3 -m http.server 8876 --bind 0.0.0.0
```

然后打开 <http://localhost:8876/nuonuocar-3d-gpt-6-Astra/index-gpt-6-Astra.html>。同一 Wi-Fi 下，手机把 `localhost` 换成电脑局域网 IP 即可。

需要支持 WebGL 2 的现代浏览器；ES modules 请通过 HTTP 打开。Three.js 已随目录提供，无需安装依赖或在运行时访问 CDN。

## 玩法

- 点车沿箭头出发；前方有车时先挪开挡路车辆。
- 四个接客位可扩到六个；队首乘客上同色车，坐满自动离开。
- 接客与其他车辆行驶互不锁定，所有驶出车辆即时预留独立接客位。
- 五种道具：提示、刷新、消除、排序、翻转；支持撤销、金币补给与三星奖励。
- 手机拖动旋转、双指缩放；电脑拖动、滚轮缩放，方向键选车、回车发车。右下角恢复默认视角。
- 无限种子关卡，关卡、道具、金币自动保存。`?level=100` 从指定关卡开始，刷新后继续保存的进度。

## 独立性

全部运行资源在本目录内，不引用旧 `nuonuocar/` 代码。逻辑引擎和调度器从原版本复制后独立维护。原目录及仓库首页未修改。

新存档键：`nuonuocar_3d_gpt-6-Astra_v1`，与旧版 `nuonuocar_gpt-6-Astra_v1` 分开。

## 文件

| 文件 | 职责 |
| --- | --- |
| `index-gpt-6-Astra.html` / `styles-gpt-6-Astra.css` | 手机与桌面 UI |
| `boot-gpt-6-Astra.js` | 模块启动、WebGL 错误提示 |
| `scene-gpt-6-Astra.js` | 场景、相机、射线拾取、触摸手势 |
| `models-gpt-6-Astra.js` | 车身、车门、车轮、乘客、树木模型 |
| `motion-gpt-6-Astra.js` | 外围行驶、入位、开门上车、满员离开 |
| `batching-gpt-6-Astra.js` | 共享模型合批，减少移动端绘制调用 |
| `engine-gpt-6-Astra.js` | 确定性关卡、规则和道具逻辑 |
| `traffic-gpt-6-Astra.js` | 多车并行、车位预留、逐客结算 |
| `game-gpt-6-Astra.js` | UI、存档、金币、关卡流程 |
| `vendor/` | Three.js 0.181.2 及 MIT 许可证 |

## 验证

```sh
node nuonuocar-3d-gpt-6-Astra/verify-gpt-6-Astra.cjs
node nuonuocar-3d-gpt-6-Astra/verify-boarding-gpt-6-Astra.cjs
node nuonuocar-3d-gpt-6-Astra/verify-traffic-gpt-6-Astra.cjs
node nuonuocar-3d-gpt-6-Astra/verify-scene-gpt-6-Astra.cjs
```

2026-09-05 验收：

- 1,005 个关卡可解性、60 次重排、确定性、碰撞与人数守恒。
- 100 个关卡逐客上车、每个保存边界恢复、出发前不得提前清空车位。
- 多车同时行驶、接客和离开并行、四车位上限、取消过期回调。
- 3D 薄地面几何、车门显隐、实例矩阵更新、移动后射线拾取。
- ego-browser：真实 WebGL 2、完整首关三星通关与下一关；常速接客期间再次触摸发车；五种道具、撤销、扩到六位、刷新续玩；拖动和双指手势不误发车。
- 390×844、320×700、第 100 关 25 辆车、844×390 横屏和 1512×809 桌面布局检查。
- 浏览器测试全关循环加速动画；并行发车测试以接近正常时长的动画观察。无浏览器脚本或资源加载错误。
- 原版文件 SHA-256 及旧存档均保持不变。

开发时附加 `?debug=1` 可以读取 `window.parkingDebug`；正常入口不暴露调试对象。

Three.js 官方资料：<https://threejs.org/>。随附库遵循 `vendor/LICENSE-three-gpt-6-Astra.txt`。
