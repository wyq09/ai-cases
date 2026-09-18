# thunder-fighter 雷霆战机 — 模块契约（唯一事实源，动码前必读）

经典竖版飞行射击（雷霆战机类）H5 复刻。手机触屏为主，桌面/横屏自适应。
开发期分模块文件，最终 build.py 合并为单文件 index.html。**零外部资源**：美术全 SVG dataURI、
音频全 WebAudio 合成、特效全 Canvas 程序化。中文 UI 文案。

## 游戏规格（主线已定，勿改数字）

- 逻辑画布：宽 W=420 固定，H=clamp(round(420*vh/vw),560,900)，竖版卷轴（背景向下滚动）。
- 6 架战机（机库购买+升星，跨关保留）：A突击者(免费,hp100,dmg10,rate130ms,单双管) /
  B幻影(2500币,速1.15,双斜) / C重锤(6000,重炮单发dmg26 rate240) / D苍穹(12000,3向散) /
  E雷神(25000,贯穿弹) / F灭世(50000,5向+双排)。升星1-5：hp×(1+.18(s-1)) dmg×(1+.16(s-1))。
- 局内火力 P0-P4（吃"P"道具升级，坠机-1）：firePattern(id,power) 给出弹幕偏移。
- 僚机 2 槽 ×3 种（gun机炮/missile导弹/tesla电磁），lv1-5，机库购买升级。
- 敌机 6 种（按关解锁）：grunt蜂群/gunner哨卫/diver俯冲蝠/tank装甲堡/kami刺客/elite执政官。
- Boss 6 原型轮换：母舰/堡垒/战刃/蜂后/幽灵/天罚，variant=floor((n-1)/6)%3 换配色；3 阶段(66%/33%)+狂暴。
- 无限关卡 n：hpK=1+.13(n-1)+.012(n-1)²，spdK=min(1+.025(n-1),1.7)，fireK=min(1+.03(n-1),2)，
  densityK=min(1+.06(n-1),2.2)；波次=4+min(floor(n/3),6)+Boss；波次脚本用种子 rand(确定性，重打同布局)。
- 道具：P火力/B炸弹+1/H修复25%/S护盾8s/L生命+1/coin金币/part部件。磁吸半径90px(护盾160)。
- 血条生命：HP条(舰体×星)+生命×N(基础2,上限5)；坠机-1命重生满血无敌3s火力-1；命尽可币复活1次/局。
- 炸弹：底右按钮，清屏弹+全屏伤害+1.5s无敌，基础2上限6。
- 计分：击杀 base×comboMult（连击窗2.2s，mult=1+min(combo,50)×.02）；擦弹graze+5分；
  Boss 3000+500n；通关 1000n+星级(1/1.2/1.5)+剩余HP加成。本地排行 top10。
- 打击感(重要)：命中白闪+击退、击杀 hitstop 40-70ms、震屏 trauma²、爆炸=闪光+冲击环+火花+碎片+烟、
  伤害数字、连击弹窗、擦弹火花、低血红色晕影、Boss死慢动作+连环爆、navigator.vibrate(可关)。
- 操控：手指拖动=战机跟随位移×1.15(sens可调)，自动开火；桌面鼠标拖/WASD/方向键，空格炸弹，P暂停。

## 全局命名空间 window.TF（唯一顶层名，模块内禁止 `const TF` 顶层声明）

每模块文件顶层形如 `window.TF=window.TF||{}; TF.XXX=(()=>{...return api})();`
模块未就绪时主线用 NOOP Proxy 兜底互调，故**任何模块不得在加载期调用他人模块**。

## ART（子代理A → src/art.js）全 SVG dataURI，同步返回+缓存

```js
TF.ART = {
  ship(id),        // id∈'A'..'F'；viewBox="0 0 100 120" 机头朝上
  enemy(kind),     // grunt|gunner|diver|tank|kami|elite；viewBox="0 0 100 100" 机头朝下(朝玩家)
  boss(i,v),       // i∈0..5 原型, v∈0..2 配色变体；viewBox="0 0 200 240" 机头朝下
  wing(kind),      // gun|missile|tesla；viewBox="0 0 60 60"
  power(kind),     // P|B|H|S|L|coin|part；viewBox="0 0 64 64"
  icon(name),      // 48×48 单线条线性图标: pause play settings back close star heart bomb coin part
                   // lock next prev home cup wing ship refresh check plus minus export import reset
  emblem(),        // 240×240 标题徽章(翼形军徽+闪电母题)
};
```
风格（务必遵守）：**深空军事科幻**——机体 gunmetal 灰蓝三阶明暗(亮#7f93a8/中#46586c/暗#1d2630)，
硬边装甲板切线 #131a22，1px rim light 队伍色；玩家 accent 青 #35e0c8，敌军橙红 #ff5a3c，
Boss 深红 #d8345a+暗部加紫 #3a2440；剪影锋利三角/箭头语言，80px 下轮廓可辨；无圆胖卡通、无驾驶舱
拟人、无眼睛；引擎口/炮口留深色开口（游戏里另加尾焰）。每图源码 ≤3KB（boss ≤6KB），
`<defs>` 线性渐变 ≤2 个/图，禁 filter/外链。dataURI 格式
`'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg viewBox=…')`。

## SFX（子代理B → src/audio.js）WebAudio 全合成，禁外部音频

```js
TF.SFX = { init(), unlock(), play(name, opts{rate=1,vol=1}), startBGM(track), stopBGM(),
  duck(ms,depth), setVol(bgm,sfx), muted(b), applyOverrides(map), names: [...] };
```
- cues（24个，含听感）：ui(短click) back(低click) shoot1(轻快blip,可被高频重复不吵,vol自带低)
  shoot2(中性双音) shoot3(低频重炮thump) hit(短noise+高频click,打击点) die1(小爆) die2(中爆)
  bigdie(大爆:noise带+正弦300→60Hz下滑+45Hz sub) bosshit(金属命中) bossdie(超长连环爆底)
  bosswarn(警笛双音交替×2) phurt(受创闷响+短哨) pdie(坠机长下滑) pu(道具上行双音) coin(亮ping)
  life(上行三连音) bomb(全频冲击+长尾) shield(护盾展开嗡) shieldbrk(玻璃碎感) clear(通关上行琶音)
  combo(rate参数控制音高随连击上行,短blip) graze(极短tick) heart(低血心跳,循环型)。
- BGM 三轨：battle(140BPM 四小节循环:四踩kick+锯齿bass十六分+方波lead短动机,小调紧张推进) /
  boss(160BPM 半音阶压迫) / hangar(舒缓pad+慢琶音)。BGM gain 压低(~0.25)，切轨平滑。
- 引擎：AudioContext 惰性创建、unlock() 幂等（首手势 resume）；heart 循环注册表 stop 干净；
  节点用完 stop+disconnect；**master 挂 DynamicsCompressor 防多音叠加削波**；visibilitychange 停BGM；
  applyOverrides(map) 自定义音效(dataURL audio)优先，解码失败回落合成。

## FX（子代理C → src/fx.js）Canvas2D 粒子，禁 shadowBlur（径向渐变+lighter 叠色）

```js
TF.FX = { init(), addShake(p), camOffset(),            // trauma²衰减；游戏每帧取偏移加到相机
  burst(x,y,o{kind:spark|fire|debris|smoke|star, n, color|colors, spd, size, life, grav}),
  ring(x,y,o{r0,r1,life,color,width}), explosion(x,y,scale,o),   // 组合:闪+环+火+碎片+烟
  muzzle(x,y,ang,s), trail(x,y,o), floatText(x,y,str,o{color,size,crit}),
  flash(color,alpha,ms), update(dt), render(ctx,layer), // layer:'world'(相机变换内)|'screen'(含flash/晕影)
  stopAll(), setQuality(q) };
```
- 预渲染发光 sprite（径向渐变圆盘多色缓存），additive lighter；粒子对象池+上限 420；
  DPR≤2；document.hidden 暂停；floatText 军用等宽感+深描边，crit 放大+震。
- 色板纪律：白/黄白火花 #ffe9c0、爆橙红 #ff7a3c/#ffd0a0、玩家青 #35e0c8、敌红 #ff5a3c、
  护盾青白。禁彩虹。风格：军事科幻打击感，干净锐利不糊屏。

## CONFIG_PANEL（子代理D → src/config-panel.js）含 TF.CFG 存储层

```js
TF.CFG = { defaultCfg(), all(), apply(snap), openPanel(), close(), isOpen(), onChange(cb),
  exportJSON(), importJSON(str) };
```
- defaultCfg = { sens:1.15, fireK:1, diff:1, dropK:1, shake:1, vib:1, bgmVol:.7, sfxVol:.9,
  quality:'auto', demoSpd:1, shipImg:{A:null,B:null,C:null,D:null,E:null,F:null}, sounds:{} }
- localStorage key `tf.cfg.v1`；apply(snap) 深合并→落盘→逐个触发 onChange(完整快照)；面板内部持
  work 副本，任何编辑立即 onChange，**永不直接写 localStorage**。
- 面板 4 tab：战机立绘(A-F 上传替换 file→canvas 压缩 256px→dataURL 存 shipImg+恢复默认) /
  音效(cue 下拉+上传存 sounds{}+BGM/SFX 音量滑条实时 setVol) / 玩法(sens/fireK/diff/dropK/shake/
  vib/quality/demoSpd) / 数据(存档导出/导入走 TF.PROFILE.export()/import(str)，恢复出厂=清两 key)。
- 样式内联 `<style>` 类名前缀 tfcp-；军事 UI 风：深底 #0b0f14+1px #263241 边+切角面板
  (clip-path polygon)，accent 青 #35e0c8，无圆角卡片堆、无渐变按钮、无 emoji 图标（用 TF.ART.icon）；
  移动端底部抽屉、大点击区、overscroll-behavior:contain；中文文案；存在性兜底（TF.ART/TF.SFX/TF.PROFILE 可能缺）。

## LOGIC（主线 → src/logic.js）纯数据+数学，node 可跑

表：SHIPS/WINGS/ENEMIES/BOSSES/掉落权重；函数：starsMul(s), shipStat(id,star), firePattern(id,power),
levelParams(n)(含种子波次脚本 waves:[{t,kind,x,form}]), dropsFor(kind,n,rand), comboMult(c),
reward(n,stars,hpPct), unlockCost(id), starCost(id,toStar), wingCost(id,toLv),
PROFILE{load,save,get,addRun,boardAdd,export,import}。存档 key `tf.save.v1`（schema 见主线）。

## ENEMY（子代理E → src/enemy.js）敌机 AI + Boss 弹幕 + 波次导演

```js
TF.ENEMY = {
  move(e, dt, api),        // 按 e.move ∈ sine|dive|strafe|hover|charge|enter 更新 e.x/y/e.t
  fire(e, api),            // 按 e.fire ∈ aimed|fan|ring|spiral|snipe|none 发射
  DIRECTOR: { build(waves) -> {tick(dt, api), done(), progress()} },
  BOSS: { build(lp) -> boss实体{hp,maxHp,x,y,phase,...}, tick(b, dt, api) }  // 3阶段+狂暴弹幕
};
// api 由 game 每帧注入：{W,H,dt, player{x,y}, rand(), spawn(kind,x,y,o), ebul(x,y,ang,spd,o),
//  ebulFan(x,y,angs,spd,o), telegraph(x,y,w,dur,kind), spawnPower(x,y), sfx(name), difficulty}
```
自检：node --check + /tmp 桩 api 跑 60s 模拟（关卡1/5/20），断言 spawn/ebul 计数>0、无 NaN。

## GAME/UI/MAIN（主线负责，勿动）

game.js 引擎(循环/输入/碰撞/子弹/道具/打击感/渲染/AI演示) · ui.js 全部 DOM 屏与 HUD ·
main.js boot+URL参数+钩子。DOM 骨架：
`#app > #scr-title / #scr-hangar / #scr-levels / #scr-game(>#cv+#hud) / #dlg-pause / #dlg-settle / #dlg-over / #panel-cfg / #toast / #demo-badge`
URL 参数：`?reset=1`(shell 内联最先清两 key) `?demo=1` `?level=N` `?boot=title|hangar|levels` `?muted=1` `?god=1` `?snap=1`。
调试钩子 window.__tf。存档/配置 key：tf.save.v1 / tf.cfg.v1。

## 单文件管线

src/*.js 模块 + src/shell.html(`/*STYLE_INLINE*/ /*RESET_INLINE*/ /*MODULE_SCRIPTS*/` 占位) + build.py；
产物根 index.html。禁止 JS 字符串含 `</script` 字面量。

## 主线负责（子代理勿动他人模块）

logic.js / game.js / ui.js / main.js / enemy 桩位（stub，子代理E整体替换）/ style.css / shell.html / build.py。
art.js 归美术代理、audio.js 归音频代理、fx.js 归特效代理、config-panel.js 归面板代理、enemy.js 归行为代理。
互调一律走 window.TF.*，可缺模块 NOOP 兜底。
