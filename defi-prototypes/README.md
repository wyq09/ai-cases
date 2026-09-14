# DeFi 原型馆

8 套金融 App 概念设计稿的 1:1 可交互复刻，组成**一台完整可操作的手机**：打开是主屏（实时时钟 + 8 个 App 图标），点图标进入 App，App 内按钮 / 返回键 / 底部 tab / 左缘右滑真实导航，Home 条回主屏。21 台手机的行情、兑换、转账键盘、统计图表、卡片开关全部可点，桌面与手机通吃。

## 浏览

- 主屏点按图标打开 App；App 内沿界面自然导航（开始使用 / 返回键 / 底部 tab / 快捷操作浮层）；左缘右滑或点 Home 条返回
- 首次进入 App 有「Home 条返回」提示，2.6 秒自动消失；玻璃泡泡可以点爆
- 调试参数：`?gallery=1` 查看海报墙模式 · `?app=g` 直接打开某个 App · `?snap=1` 零动画（自动化截图用）

## 技术要点

- **单文件交付**：`build.py` 把 shell.html + src/*.js 拼成 index.html，零外部资源、离线可用
- **原型机壳**：`phone-os.js` —— 主屏 / App 层 / 页面栈导航（push·pop·tab 换栈·左缘右滑）；对场景内"死按钮"经 toast 通道与捕获期点击锚点自动接管为真实跳转
- **地基组件**：iPhone 壳（390×844 设计稿 transform 缩放）、Canvas 图表库（spark/line/bars/candles/gauge，DPR≤2、禁 shadowBlur）、UI 组件（tabs/seg/toggle/slider/keypad/sheet/carousel）、玻璃泡泡引擎（离屏精灵预渲染 + 点击爆开水珠粒子）
- **契约驱动并行开发**：contract.md 锁死场景注册接口与组件签名，8 个场景各一个 scene-*.js 由多代理并行产出；`tools/navtest.js` 对 36 条导航链路做自动断言

## 开发

```bash
python3 build.py      # 产出 index.html 单文件
node tools/navtest.js # 导航链路回归（36 条，全绿为过）
```

调试：`test.html?scene=a` 单场景海报 · `index.html?app=a&snap=1` 原型机直开 · `window.__errs` 错误采集
