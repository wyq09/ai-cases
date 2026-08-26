# Prediction Market

1:1 复刻一个预测市场首页，含黑 / 白双主题与全套动效。

- Canvas 点阵地球：真实世界陆地数据（world-atlas 110m）光栅化后逐帧渲染自转
- Live Action 卡像素马赛克背景随机闪烁，"44 Active" 数字实时漂移
- 共享倒计时逐秒走动、Active 绿点脉冲、铃铛/按钮微交互、入场 stagger 动画
- 主题切换使用 View Transition 圆形扩散过渡，选择持久化到 localStorage

## 运行

浏览器直接打开 `index.html` 即可，无构建步骤。

`gen-mask.js` 用于从 world-atlas TopoJSON 重新生成 `land-mask.js` 陆地位图。
