# 祖玛实现契约
参考图无法视觉读取，当前为暖棕石刻主题暂定版，禁止声称1:1。
游戏使用Canvas2D，世界坐标横屏1100×620、竖屏620×1000，画面等比缩放；D=32。window.ZArt、window.ZAudio 独立模块先于 game.js 加载。

## art.js（只负责此文件）
window.ZArt = {
 background(ctx,w,h,theme): 用离屏缓存绘制暖棕遗迹石块、边缘藤叶、雕刻几何纹饰，世界坐标。theme为0..5。
 track(ctx,points): points=[{x,y,s}]，凹槽轨道，宽42，内径32，复古石质。
 ball(ctx,x,y,color,r=16,rotation=0): color整数0..5，颜色红/蓝/黄/绿/紫/白；球有清晰立体材质、花纹区分、柔和高光；离屏预渲染缓存。
 frog(ctx,x,y,angle,current,next,recoil): angle以正x为0；金绿石蛙、眼睛、腿、石刻翅边，当前球在朝向前侧，下一球在后侧。可调用ball。
 gate(ctx,x,y,end,danger): 起点洞口/终点带牙齿石口，不使用emoji。
};
不能依赖DOM、不能shadowBlur、不能读取其他模块状态，不使用外部图像。美术需要丰富且可读而非平面示意图。

## audio.js（只负责此文件）
window.ZAudio={unlock(),setMuted(bool),play(type,combo=1)};type:shoot,hit,pop,swap,win,lose,slow,bomb。WebAudio程序化短音效，音量克制，play自动unlock，try/catch兼容不支持音频的设备，无外部依赖。

主线负责game.js、shell、构建、测试、文档。代理不得更改其他文件。
