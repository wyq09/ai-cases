# 地摊套圈 Ring Toss — 模块契约

单文件 H5 复刻夜市地摊套圈（1:1 复刻参考照片：红帐篷+横幅+三排彩色矮凳+九种奖品+老板）。
开发期分模块文件，最终 build.py 合并为单文件 index.html。
所有模块挂 window 全局，无构建、无外部依赖、无外部字体/图片/音频资源（全部程序化生成）。

## 参考图（先 Read 看图再动手）
- 原图: /Users/yiqunwu/.zcode/cli/image-cache/sess_3e9fa53b-f6b4-4bff-8ee0-b607ba93668f/image-3f60576aaa3628a5b434ff10d90e2e6f.png
- 项目裁片（2x 放大）: ring-toss-stall/ref/full.png（构图）、ref/banner.png（横幅+灯串+圈堆）、
  ref/prizes-left.png、ref/prizes-right.png（奖品细节）、ref/front.png（凳子+地毯+地砖）、ref/vendor.png（老板）

## 世界与投影（主线已定，勿改）
伪 3D 针孔投影，世界坐标米制：x 横向(米，摊位内 −4.6..4.6)，y 向上(米，0=地面)，z 纵深(米，0=玩家出手线，越大越远)。
投影: `scale = FOCAL/(FOCAL+z)`，screenX = cx + x*scale*PPM，screenY = horizonY + (EYE−y)*scale*PPM。
常量: FOCAL=7, EYE=1.35, PPM 由视口宽自适应（main.js 定，其他模块只消费投影结果）。
场景纵深: 地毯 z∈[0.2,4.6]，横幅/帐篷在 z≈4.8，奖品凳三排 z≈{1.5, 2.6, 3.7}。

## 游戏规格（主线已定，勿改）
### 奖品表（9 种，id / 中文名 / SVG key / 分值 / 稀有档 / 世界尺寸(宽x高米)）
| id | 名 | key | 分值 | 档 | 尺寸 | 备注 |
|---|---|---|---|---|---|---|
| goose | 白鹅 | goose | 1 | 常 | 0.34x0.42 | 红丝带白鹅 |
| frog | 青蛙王 | frog | 2 | 常 | 0.36x0.40 | 绿冠青蛙，白脸 |
| panda | 熊猫 | panda | 3 | 常 | 0.38x0.40 | 抱竹子 |
| dog | 小狗 | dog | 3 | 常 | 0.36x0.38 | 棕白花狗 |
| pig | 粉猪 | pig | 4 | 中 | 0.40x0.36 | 粉猪存钱罐 |
| pug | 巴哥 | pug | 5 | 中 | 0.32x0.38 | 黑脸巴哥 |
| goggle | 护目镜小子 | goggle | 6 | 中 | 0.36x0.46 | 戴金色护目镜、拿盘子 |
| doll | 蓝裙娃娃 | doll | 8 | 稀 | 0.36x0.48 | 蓝裙金发 |
| dragon | 小火龙 | dragon | 10 | 稀 | 0.40x0.44 | 红色幼龙喷小火 |

### 摊位布局（15 个凳位，金字塔纵深，凳色循环 red/green/yellow）
- 前排 z=1.5，3 位：goose, frog, goose（x = −1.1, 0, 1.1）
- 中排 z=2.6，5 位：dog, panda, goggle, panda, pig（x = −1.9, −0.95, 0, 0.95, 1.9）
- 后排 z=3.7，7 位：dragon, doll, pug, frog, pug, doll, dragon（x = −2.8, −1.87, −0.93, 0, 0.93, 1.87, 2.8）
- 老板站在 x=−3.1, z=4.15；圈堆挂在横幅左下 (x=−3.2, z=4.55, y=1.55)
- 凳子: 方凳 0.55x0.55 米、凳面高 0.34 米，prize 放凳面上。

### 经济（照横幅文案，勿改）
- 游戏币 coins；初始 20 币；买圈档位固定两个：20币→20圈、60币→100圈
- 币用完且无圈：老板送 5 币（冷却 60s），不设死局
- 套中奖品：进图鉴 + 战利品；重复奖品自动折算币（分值×0.5 向上取整）入账
- 台词（老板气泡，掷圈/中奖随机）：见 game.js 文案表，fx 不涉及

### 物理与判定（主线 logic.js 实现，其他模块只读常量）
- 圈: 内半径 R_in=0.115m、外半径 R_out=0.155m、管径 0.04m；出手点 (aimX*0.5, 1.15, 0)
- 出手速度: 由滑动力度 power∈[0,1] 映射 vz∈[4.2,7.2]m/s，vx 由瞄准横移决定；g=9.8
- 圈姿态: 飞行中倾角 tilt 从 55° 渐落；套中判定 = 落点(圈中心x,z) 距奖品碰撞柱轴 ≤ R_in−颈半径，
  且落点高度穿过凳面/奖品颈高度带；碰凳沿/奖品体则弹开（法向反弹 e=0.45，切向 0.75）
- 地面反弹 e=0.38，弹 2 次后滚停为 miss；模拟步长 dt=1/120
- 命中率标定: logic.simulate(n, aimNoise) 蒙特卡洛——普通玩家（噪声 σ=0.16m）20 圈期望套中 1~3 个，
  稀有档单圈命中率 ≤ 常见档 1/3

## 全局命名
`window.RT` 为唯一顶层命名空间：RT.ART / RT.AUDIO / RT.FX / RT.CONFIG_PANEL / RT.LOGIC / RT.SCENE / RT.GAME。
每模块文件顶层形如 `window.RT=window.RT||{}; RT.XXX=(()=>{...return {...}})();`（禁止 const RT）。

## ART（子代理A → src/art.js）
```js
RT.ART = {
  prize(id) -> dataURI svg（viewBox 0 0 200 240 起，无宽高）, // 9 种奖品
  stool(color) -> dataURI svg（viewBox 0 0 200 160，color: 'red'|'green'|'yellow'）,
  vendor() -> dataURI svg（老板立绘 viewBox 0 0 220 300）,
  ringStack() -> dataURI svg（一叠彩虹圈 viewBox 0 0 240 140）,
  coin() -> dataURI svg（游戏币 viewBox 0 0 100 100）,
  bulb() -> dataURI svg（灯串灯泡 viewBox 0 0 60 90）
};
```
风格：参考照片里的陶瓷/绒玩偶质感——亮色平涂+柔和双色阴影（每件 2~3 个暗面色块，不追求写实），
卡通圆润但保持照片中各奖品的关键特征（鹅红丝带、青蛙白脸绿冠、熊猫抱竹、粉猪钱罐口、巴哥黑脸、
金护目镜+黄衣拿盘、蓝裙金发、红龙喷小火）。凳子照照片：厚面板+四短腿，红/绿/黄三色，顶面比侧面亮一档。
单图源码 ≤3KB。老板：格子衬衫+深裤，头旁不画圈（圈堆单独）。

## AUDIO（子代理B → src/audio.js）WebAudio 程序化合成，禁止外部音频
```js
RT.AUDIO = { unlock(), play(name, opts), startLoop(name), stopLoop(name), duck(ms),
  setBGMVolume(v), setSFXVolume(v), setMasterVolume(v), applyOverrides(map), names: [...] };
```
cue 清单：throw(圈出手 whoosh 短)、swoosh(高速风声变体)、bounceWood(磕凳面木咚)、bounceGround(塑料地弹)、
ringSettle(圈落地滚停摩擦)、win(套中：上行五声琶音+欢呼合音 0.8s)、rare(稀有中奖：更华丽加锣)、
missSoft(轻落 miss 噗)、coin(买圈叮当×2)、prizeCollect(收奖品叮-咚上滑)、talk(老板短哼两音)。
BGM `loop:bgm`：夜市感——五声音阶(宫调)弹拨轻快循环 + 低音量锣鼓点，BGM 默认音量 0.35。
引擎要求：iOS 首手势 unlock 幂等；循环注册表 stop 干净；节点用完 stop+disconnect；
visibilitychange 停 BGM；applyOverrides 解码 dataURL 失败回落合成。

## FX（子代理C → src/fx.js）Canvas2D 粒子，禁止 shadowBlur（径向渐变+lighter 叠色）
```js
RT.FX = { init(hostEl), resize(w,h), confetti(n, opt{x,y,spread}), spark(x,y,color,n),
  coinBurst(x,y,n), dust(x,y,n), flash(color,alpha), bigText(text, opt{color,sub,scale}),
  popLabel(x,y,text,color), stopAll() };
```
风格：红金喜庆。confetti 红黄绿纸屑；popLabel 用于"+N币/套中XX!"漂浮小字（世界坐标转屏幕由调用方传入）。
粒子对象池；DPR≤2；document.hidden 暂停；bigText 用 DOM 金渐变+描边+WAAPI。

## CONFIG_PANEL（子代理D → src/config-panel.js）
```js
RT.CONFIG_PANEL = { mount(el), open(tab?), close(), isOpen(), onChange(cb) };
```
标签页：音效(BGM/SFX 滑条) / 玩法(辅助瞄准线开关、力度灵敏度、老板台词开关) / 数据(导出导入恢复出厂)。
图标/音效上传本作不做（奖品是复刻主体，不做替换）。内部持 work 副本，任何改动即 onChange(完整 cfg 深拷贝)；
永不直接碰 localStorage。样式内联注入类名前缀 rtcp-，移动端底部抽屉，大点击区，中文文案。
存在性兜底（RT.AUDIO 可能缺）。

## 配置 schema（主线定）
```js
{ aimGuide:true, powerSens:1.0, talk:true, vols:{bgm:0.35,sfx:1,master:1}, sound:true }
```
持久化: localStorage `ringtoss_state_v1`（coins/rings/dex/loot/stats）/ `ringtoss_config_v1`。

## DOM 骨架（主线负责壳与全部接线）
```
#app
  #stage          // 全屏 canvas（场景+圈+FX 各一层 canvas 叠放）
  #hud            // 顶栏：币(coin 图标+数字) 圈数 图鉴btn 设置btn
  #aimHint        // 底部提示"按住拖动瞄准，松手掷圈"（首 3 次显示）
  #shop           // 买圈弹层：两档大按钮 20币→20圈 / 60币→100圈 + 领5币
  #dex            // 图鉴弹层：9 格（未套中=剪影），战利品计数
  #bubble         // 老板台词气泡（自动消失）
  #toast          // 通用提示
  #panel          // 设置面板挂载点
```

## 测试钩子（main 暴露）
`window.__rt = { get state(), get cfg(), get busy(), throwRing(x,z,power), rig(name), setCoins(v), setRings(v), simulate(n) }`
URL 参数（boot 最早处理，先于读 localStorage）：`?reset=1` 清档、`?rig=win|rare` 下圈必中（普通/稀有）、
`?auto=N` 自动掷 N 圈、`?muted=1` 静音。

## 主线负责（勿动他人模块）
投影/物理/场景渲染/状态机/瞄准交互/经济/图鉴/持久化/老板台词/集成/验证/README。
