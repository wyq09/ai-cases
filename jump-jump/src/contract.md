# 跳一跳 H5 契约

非官方复刻，零外部资源，Canvas 2D 等距投影。没有用户参考图，以经典跳一跳的浅灰背景、黑色棋子、彩色立体平台为参考。规则出处在 ../ref/rules-spec.md，未核实参数是复刻设定。

## 唯一命名空间 window.JJ
所有模块 IIFE，顺序 logic, art, audio, config-panel, game。

## 世界与渲染（锁定）
平台 {id,x,y,size,height,type,color}; 世界 x/y 水平，z 竖直。size 约 100，height 42；下一块沿世界 +x 或 +y，距离 170~260。投影由主线提供 project(x,y,z)->{x,y}，投影比例 screenX=(x-y)*0.86，screenY=-(x+y)*0.50-z（下一个平台朝右上/左上延伸；可见侧为-x/-y，平台按x+y降序绘制），棋子脚在平台顶 z=height。
ART.platform(ctx,p,project,time): 画平台，按 x+y 深度排序由主线调用。
ART.pawn(ctx,{x,y,z,squash,rotation,opacity},project,time): 黑色棋子，原点脚部，常态高60世界单位，圆头+窄颈+锥形身。
ART 平台类型 plain, cylinder, rubik, manhole, shop, record。箱体颜色克制（珊瑚橙、灰绿、米白、黄色）；实现材质与顶面细节，不画整屏背景。支持 p.texture 为已加载 Image，可选在顶面贴图。

## 音频
JJ.AUDIO.unlock() 幂等; setMuted(bool); chargeStart(); chargeStop(); jump(); land(combo); fall(); bonus(); applyOverrides({jump,land,fall,bonus} dataURL字典)。纯 WebAudio 合成，禁外部资源。visibilitychange停止蓄力声音。不自行读 localStorage。

## 逻辑（主线负责）
JJ.LOGIC.defaultCfg()-> {difficulty:1,chargeRate:0.32,maxCharge:1200,sound:true,showGuide:false,background:'#dededc',platformTexture:'',audio:{}}。
JJ.LOGIC.sanitize(raw)白名单验证。普通落地+1；中心连击+2,+4,+6...；特殊方块停留2秒一次性+5/+10/+15/+30。所有物理/出现概率为复刻参数。

## 配置面板（独立代理负责）
JJ.CONFIG_PANEL.mount(host); open(); close(); isOpen(); onChange(cb)。open 时从 JJ.cfg 取深拷贝 work，保存时 JJ.LOGIC.sanitize(work) 后通知 cb(完整快照)，不碰 localStorage。主线提供 JJ.cfg getter，JJ.pause()/resume()。
面板字段：难度0.75~1.35、chargeRate0.22~0.42、sound、showGuide、background颜色、platformTexture图片上传（限500KB）、音效上传jump/land/fall/bonus每个限300KB、导出导入JSON、恢复默认。CSS只作用 .jj-config；自带样式注入。设计：白纸/灰黑/微信绿，直角或4px小圆角，手机内滚动。关闭及Escape恢复游戏。不得有外部依赖。

## DOM 主线负责
#game 全屏canvas；#score,#best,#combo,#hint；#startScreen 开始层；#endScreen 结束层；#startBtn,#retryBtn,#demoBtn,#soundBtn,#settingsBtn,#exitDemoBtn；#cfgHost；#toast。移动端不滚动，safe-area，桌面非手机壳。
localStorage jj_config_v1 / jj_state_v1；reset 在shell首个script清除。主线存最高分/最近10局；稳定落地状态可恢复，失败不恢复。
window.__jj 测试钩子 state/getConfig/start/press/release/jumpFor/setAuto/snapshot。?autoplay=1 自动演示，?seed=数值，?muted=1。

主线负责 logic.js/game.js/shell.html/build.py/测试/文档。素材代理只改 art.js；音频代理只改 audio.js；配置代理只改 config-panel.js。其他文件一律不动。
