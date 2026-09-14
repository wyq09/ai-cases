# DeFi 原型馆

8 套金融 App 概念设计稿的 1:1 可交互 H5 复刻 —— 一张概念图一个场景海报，21 台手机全部真实可点：行情、币币兑换、转账键盘、统计图表、卡片开关，桌面与手机通吃。

## 浏览

- 纵向滚动浏览 8 个场景海报；底部 dock 圆点快速跳转，右上「全屏体验」进入单机全屏观看器
- 所有 tab / 分段 / 开关 / 滑块 / 数字键盘 / 轮播均为真实交互；图 1 的玻璃泡泡可以点爆
- 双击任意手机进入该机全屏模式

## 技术要点

- **单文件交付**：`build.py` 把 shell.html + src/*.js 拼成 index.html，零外部资源、离线可用
- **地基组件**：iPhone 壳（390×844 设计稿 transform 缩放）、Canvas 图表库（spark/line/bars/candles/gauge，DPR≤2、禁 shadowBlur）、UI 组件（tabs/seg/toggle/slider/keypad/sheet/carousel）、玻璃泡泡引擎（离屏精灵预渲染 + 点击爆开水珠粒子）
- **契约驱动并行开发**：contract.md 锁死场景注册接口与组件签名，8 个场景各一个 scene-*.js 由多代理并行产出

## 开发

```bash
python3 build.py   # 产出 index.html 单文件
```

调试：`test.html?scene=a` 单场景 · `&phone=a1` 单机 · `window.__errs` 错误采集
