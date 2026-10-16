# fluffy-fox · 毛茸茸小狐 · Three.js 毛茸茸 3D

> **v2 换装**：应用户要求已换成自然态小狐（无南瓜帽/围巾/外套），原南瓜套装几何配方见 git 历史；本文其余章节（色板/灯光/fur/textures/UI 接口）继续有效。fox.js 现为：无服饰 + 躯干奶油肚皮顶点色（fillFn 方向渐变）+ 头顶三撮锥形炸毛 + 张嘴吐舌 + 尾尖分界沿环向波浪 + 手臂/躯干纳入 furTargets（共 13 部位）。


参考图：`reference/turnaround.png`（写代码前必须先 Read 这张图，取色、取比例、取服装细节）。
技术参考：github.com/piellardj/fur-threejs（shell fur 壳层毛发）。
目标：单页 H5，手机优先，程序化建模一只「戴杰克南瓜灯帽 + 格纹围巾 + 黄外套」的 Q 版狐狸，毛发用 shell texturing，质感必须细腻。

## 全局约定

- ES Module，importmap 由 index.html 提供：`three` → `./vendor/three.module.js`，`three/addons/` → `./vendor/addons/`。
- 坐标：狐狸面向 +Z，脚底 y=0，总高约 2.1 单位（含帽子）。全身比例 Q 版：头大身小，尾巴巨大。
- 每个 agent 只写自己负责的文件，不改别人的文件，不改 SPEC。
- 写完必须通过语法检查：`node --input-type=module --check < 文件路径`（stdin 方式，报错则修到零报错）。
- 代码风格：紧凑、无废话注释；注释只写"为什么"级别的约束。UI 文案中文，界面禁止 emoji 图标（需要图标用内联 SVG）。
- 色板（从参考图取，允许 ±5% 微调）：
  - 狐橙 `#e0813c`（身/头/耳外/尾根），暗橙 `#c96a2e`
  - 奶油 `#f7edda`（吻部/腮毛/胸毛/耳内/尾尖/爪尖），尾尖更白 `#fbf3e4`
  - 深棕 `#5f4433`（耳尖/手套/靴子），鼻/嘴线 `#402c20`
  - 虹膜 `#5a3520`，腮红 `#f2a48c`
  - 外套芥黄 `#e7b34c`，纽扣 `#7a4e2c`
  - 围巾底 `#2b2732`，格纹亮线 `#d98e3c`，次线 `#8a5a33`
  - 南瓜 `#e08832`（比狐橙偏黄），南瓜暗部 `#c8701f`，雕脸 `#3a2418`，瓜蒂绿 `#6e7f45`
- 灯光氛围：暖调摄影棚。背景交给 CSS（index.html 的 body 渐变，暖纸色 `#f3ead9 → #e8d9bd`），canvas `alpha:true` 透明。3D 内：HemisphereLight(0xfff2dc, 0xc9a276, 1.05) + DirectionalLight 暖白 0xffe8c8 强度 2.2（前左上，castShadow）+ 冷色轮廓光 DirectionalLight 0xbfd4ff 0.6（正后上方）。
- 材质基调：MeshStandardMaterial，roughness≈0.92 metalness=0；眼睛高光泽 roughness 0.2，高光点用 MeshBasicMaterial 纯白。全部毛发表面自带 vertexColors。
- 渲染：outputColorSpace 默认 sRGB；ACESFilmicToneMapping，exposure 1.05；antialias true；DPR = min(devicePixelRatio, 2)。

## 文件与接口（冻结，不得改签名）

### src/textures.js（B2 负责）

```js
import * as THREE from 'three';
export function makePlaidTexture(THREE, opts = {})  // → THREE.CanvasTexture
export function makePumpkinTexture(THREE, opts = {}) // → THREE.CanvasTexture
export function makeSoftShadowTexture(THREE, opts = {}) // → THREE.CanvasTexture
```

- `makePlaidTexture`：512²。底 `#2b2732`；粗横竖条带（半透明 `#3a3342`）+ 亮橙 `#d98e3c` 中细线 + 棕 `#8a5a33` 细线，交叠处自然变亮；整体撒一层细噪点（布纹）；RepeatWrapping，colorSpace = SRGBColorSpace，anisotropy=4。默认重复设 (2,1) 之类由调用者定，纹理本身 wrap 设 RepeatWrapping。
- `makePumpkinTexture`：1024²，专用于球体 UV（u 环向 0→1，v 从底 0 到顶 1）。要求：
  - 底色 `#e08832`，画 8 条纵向瓜瓣：每瓣中央略亮 `#eb9a42`、瓣沟略暗 `#c8701f`，瓣沟位置必须对准几何位移波峰（几何用 cos(8θ) 位移，瓣沟在 θ = k·π/4 处 → 即 u = k/8，注意绘制时对准）。
  - 顶部/底部轻微压暗（AO 感）。
  - 杰克灯脸画在 u=0.5 一带（即画布 x 中心），范围 x∈[0.36,0.64]·W，v∈[0.40,0.70]·H：两个三角眼（内倾）+ 一排三角齿的咧嘴，颜色 `#3a2418`，边缘略微不规则（手绘感，用多边形抖动 2-3px）。脸上不用发光。
- `makeSoftShadowTexture`：256²，径向渐变中心黑 alpha≈0.55 → 边缘 0，用于接触阴影平面。

### src/fox.js（B1 负责）

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePlaidTexture, makePumpkinTexture } from './textures.js';

export function buildFox() → {
  group,            // THREE.Group，原点在脚底中心，面向 +Z
  pivots: {         // 都是需要动画的 Object3D 枢纽（已挂好子件）
    bodyRoot,       // 整个身体（呼吸缩放用，含四肢尾巴）
    head,           // 头（含脸、耳、帽），点头/摇摆用
    earL, earR,     // 耳根枢纽（抖耳用）
    tail,           // 尾根枢纽（摇尾用）
    armL, armR,     // 肩枢纽（摆臂用）
  },
  eyes: { left, right }, // 两组眼球 Group（眨眼 = 两者的 scale.y 压扁）
  furTargets: [ { mesh, length, shells, density, tint, order } ], // 见下
  dispose(),
}
```

furTargets 每项：`mesh` 是已加入场景树的毛发表面 Mesh（几何需有 position/normal/uv，可带 color 顶点色）；`length` 毛长（世界单位）；`shells` 高画质档的壳层数；`density` 毛尖保留密度 0~1（越小毛越稀）；`tint` 毛尖染色的 THREE.Color（可为 null=不加染）；`order` 渲染顺序基数。B1 只负责登记，不创建壳。

几何配方（数值可直接用，允许 ±10% 微调让比例更像参考图；先 Read 参考图！）：

- 躯干：橙，球 scale(0.60,0.66,0.52) 置 y≈0.72。
- 外套：LatheGeometry A 字裙摆轮廓：hem(y0.30,r0.56) → (y0.55,r0.48) → (y0.80,r0.40) → (y1.00,r0.335) → 领口收 (y1.08,r0.14)，芥黄；领口加一环 Torus(r0.32,tube0.06) y≈1.08；前襟 3 颗纽扣（球 r0.045 深棕，z 取该高度 lathe 半径外扩 0.01，y=0.58/0.74/0.90）；左右各一个小翻盖口袋（薄圆角盒子近似：box 0.14×0.10×0.02 微转），颜色比外套暗 8%。
- 胸毛：奶油球 scale(0.34,0.30,0.24) y≈0.98 z≈0.22，从领口探出 → furTarget(混入体色淡橙 tint，len 0.09, shells 10, density 0.5)。
- 头：橙球 scale(0.52,0.47,0.50) 中心 y≈1.55，挂 head 枢纽（head 位于 y=1.55）→ furTarget(len 0.045, shells 8, density 0.7, tint 更亮橙)。脸朝 +Z。
- 吻部：奶油球 scale(0.20,0.15,0.16) 头内局部 (0,-0.10,0.40) → furTarget(len 0.05, shells 7, density 0.55, tint 白)。
- 鼻子：深棕球 r0.055 于吻端 (0,-0.045,0.545)；嘴：小 Torus 弧段（r0.055,tube0.013,arc≈2.2rad, 旋转让弧口朝上形成微笑）位于鼻下 z≈0.545，深棕；张嘴感可省。
- 眼睛：两组 Group 挂 head，位于 (±0.20,0.05,0.415) 附近，朝外微转：虹膜球 r0.105（`#5a3520` roughness0.25）+ 瞳孔深黑 r0.055 前凸 + 主高光白球 r0.032（Basic，左上）+ 副高光 r0.016（右下）。眨眼=group.scale.y 压到 0.08。
- 眉点：两颗奶油小球 r0.03 于 (±0.14,0.24,0.44)（参考图眼上白点）。
- 腮红：两侧半透明粉扁球 r0.07 scale z 0.35，(±0.33,-0.08,0.33) Basic 或 Standard+opacity0.5。
- 腮毛：奶油扁球 scale(0.17,0.12,0.10) 于 (±0.345,-0.02,0.20) → furTarget(len 0.07, shells 8, density 0.45, tint 白)。
- 耳：挂 earL/earR（位于头局部 (±0.27,0.30,0.02)，各自 rotation.z 外倾 ±0.35、微后仰）：耳外=橙球 scale(0.155,0.26,0.09) 上移 0.18 → furTarget(len 0.035, shells 6, density 0.75)；耳尖=深棕小扁球盖住上 1/3 scale(0.13,0.12,0.08) y+0.32；耳内=奶油扁球 scale(0.10,0.17,0.04) 沿法线外移 z+0.055 → furTarget(len 0.06, shells 7, density 0.5, tint 白)。
- 南瓜帽：挂 head，位于头顶局部 (0,0.30,-0.02)，整体微后仰 rotation.x≈-0.12：
  - 瓜体：SphereGeometry(0.5, 48, 32)，对每个顶点做位移 `r *= 1 + 0.055*cos(8θ)`（θ=atan2(x,z) 环向角），压扁 scale(1, 0.72, 0.98)，材质 map=makePumpkinTexture（记得把脸转向 +Z：若 u=0.5 不朝 +Z，旋转瓜体 y 直到脸在正前）。
  - 瓜蒂：TubeGeometry 沿 CatmullRomCurve3[(0,0.30,0),(0.05,0.42,0.02),(0.02,0.50,0.07)] 半径 0.045→0.03（用 lathe 或手动缩放环），绿 `#6e7f45`，微弯。
  - 帽沿：Torus(r0.44,tube0.035) 贴瓜底缘，颜色暗橙 `#c8701f`。
- 围巾：挂 bodyRoot，位于 y≈1.06：主环 Torus(r0.345,tube0.125) scale(1,0.82,1)，材质 map=makePlaidTexture（repeat 3,1）；垂穗两段：一段在左前（绕过肩垂到胸口，用 2 个嵌套扁盒 0.20×0.34×0.05 微转 8°，末端加 4 条小穗 box 0.035×0.09×0.05），一段在背后右侧短些；全部 plaid 材质。
- 手臂：挂 bodyRoot；肩枢 armL/armR 位于 (±0.46,0.95,0)，rotation.z 外张 ±0.5、前伸微 0.15：袖=芥黄 Capsule(r0.125,len0.30) 沿臂向下；手套=深棕球 r0.115 于袖末端；袖口=芥黄 Torus(r0.13,tube0.03)。
- 腿/靴：bodyRoot 下 y≈0.16，x=±0.20：靴筒深棕 Capsule(r0.115,len0.14)；靴尖奶油压扁球 scale(0.11,0.075,0.13) 前移 z+0.05。
- 尾巴（灵魂部件，必须体积感+曲线感）：挂 tail 枢纽，tail 位于 (0,0.62,-0.30)。沿 CatmullRomCurve3 局部点 [(0,0,0),(0.30,0.28,-0.28),(0.62,0.72,-0.28),(0.80,1.15,-0.05),(0.72,1.42,0.18)] 建管：实现用 TubeGeometry(curve, 48, 1, 20, false) 然后逐环缩放半径 profile [0.10,0.24,0.32,0.30,0.14]（按 u 插值，首尾收口：把端帽收成球头，可另加两端小球 r0.10/r0.13 merge）。顶点色沿 u：u<0.52 纯狐橙 → 0.52~0.66 渐变 → >0.66 尾尖奶白 `#fbf3e4`。mergeGeometries 前确保所有几何都有相同 attributes（需要给每个子几何都补 color attribute）。整体 scale 约 1.15 增肥。→ furTarget(len 0.20, shells 16, density 0.42, tint 奶白, order 10)。
- 硬性要求：所有 mesh castShadow=true（Basic 材质小件除外）；furTargets 的 mesh 本体材质颜色 = 该部位基色；毛根会覆盖本体，本体颜色可略暗 10% 作根部 AO。geometry 若手改过顶点必须 computeVertexNormals()。所有 new THREE.Color 用十六进制字面量。

### src/fur.js（C 负责）

```js
import * as THREE from 'three';
export const furShared = { uTime:{value:0}, uWind:{value:0.35}, uWindSpeed:{value:1}, uGravity:{value:0.35} };
export function createShellFur(target, opts = {}) → {
  group,      // 与 target.mesh 同父级的壳层 Group（壳=共享几何的多 Mesh，各带独立 ShaderMaterial）
  shells,     // 当前壳数
  setShells(n),            // 重建壳层（换画质用）
  setDensity(d), setLengthScale(s), setTint(color|null), // 调参热更新（改 uniform/材质缓存）
  dispose(),
}
```

实现要点（shell fur，本项目的质感核心）：
- 每个壳 = 复用 target.mesh.geometry 的 Mesh，顶点着色器里沿法线（object space）外推 `pos += normal * (uLength * shellFrac * uLenScale)`；再叠重力下垂与风摆：`droop = -objUp * (shellFrac²) * uGravity * uLength`（objUp≈normalize(object 空间的世界上方向，简单取 (0,1,0) 除以 mesh 缩放即可，或直接用 (0,1,0))；`sway = sin(uTime*uWindSpeed*2.2 + hash(pos.xz*3.7+pos.y)*6.283 + shellFrac*2.5) * shellFrac² * uWind * uLength * 0.6`，作用在 x/z。
- 片元：3D cell hash 噪声（输入 object-space position × uFreq≈220/单位，fxaa 无需平滑，硬阈值）：`n = hash(floor(p*freq) 邻域扰动)`；阈值 `th = mix(0.985, uDensity, shellFrac)`；`if(n > th) discard;`。为了不像方格点，cell hash 里叠一层低频 value-noise 让毛束成簇（2 octave）。
- 颜色：`c = mix(rootColor, tipColor, smoothstep(0,0.85,shellFrac))`，rootColor = 顶点色(或 uniform uBase)×0.62（根部暗=伪 AO），tipColor = 顶点色×1.06 与 uTint 按 uTintAmt 混。顶点色 varying 传入（无 color attribute 时 fallback uBase）。
- 光照：half-lambert（dot(n, lightDir)*0.5+0.5，lightDir 取世界 (0.5,0.8,0.6) 经 normalMatrix 变换）+ 顶部 rim（`pow(1-abs(dot(n,viewDir)),2)`×0.25 暖白）。
- 材质：ShaderMaterial，transparent:false，depthWrite:true，side:FrontSide，逐壳 uniform { uShellFrac }；renderOrder = target.order*10 + i。
- 性能：所有壳共享同一 geometry 引用（禁止 clone geometry）；材质 clone 自基模板。移动端友好的循环结构，避免片元内三角函数滥用（sway 在顶点端）。
- 兼容：mesh 的世界变换直接由父级承担（壳作为 mesh 的兄弟节点加在同一父下，复制 mesh 的 position/rotation/scale）——因为壳顶点位移在 object space，父级变换自然带动。若 target.mesh 的父级是动画枢纽（tail/head），壳会跟着动，这正是需求。
- 注意 shader 字符串必须是合法 GLSL（three r170 WebGL2/GLSL3 默认 ShaderMaterial 仍是 GLSL1 风格+自动 prefix，直接写 attribute/varying 风格即可，用 `#include <common>` 可省略）。

### index.html + src/leaves.js（D 负责）

index.html：
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`，`<html lang="zh-CN">`，title「南瓜狐狸 · 毛茸茸 3D」。
- importmap：`{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/addons/"}}`；`<script type="module" src="./src/app.js"></script>`（app.js 由集成者写，D 不用管内容，只要引用）。
- 结构：`<main id="stage">`（内含 canvas 容器 div#canvas-host，JS 会往里 append canvas）；左上角标题区 `.brand`（中文标题「南瓜狐狸」+ 小字副题「Three.js 壳层毛发 · 南瓜灯小狐」）；底部提示条 `.hint`（「拖动旋转 · 双指缩放 · 点我一下有惊喜」，几秒后淡出）；控制面板 `#panel`；面板开关按钮 `#panel-toggle`（右下角圆形按钮，内联 SVG 调节图标）。
- 面板内容（所有控件必须带 id，JS 靠 id 绑定）：
  - 滑杆：`#fur-length`（毛发长度 0.4–2.0 step0.01 默认 1）、`#fur-density`（毛尖密度 0.2–0.8 step0.01 默认 0.42）、`#wind-strength`（风 0–1.5 step0.01 默认 0.35）、`#wind-speed`（风速 0.2–2.5 step0.01 默认 1）；每个滑杆配 `output` 显示当前值。
  - 开关（自制 switch，checkbox）：`#auto-rotate`（自动转台，默认开）、`#idle-anim`（待机动画，默认开）、`#show-fur`（毛发显隐，默认开）。
  - 画质分段（3 个按钮，data-q="low|mid|high"，默认 mid，选中态高亮）：`#q-low #q-mid #q-high`。
  - 按钮：`#reset-view`（复位视角）、`#screenshot`（截图保存 PNG）。
  - 分组小标题用 `<h3>`：「毛发」「风与动画」「画质」「视角」。
- 样式（内联 `<style>`，遵守用户全局约束——不要紫蓝渐变/霓虹/玻璃拟态/大圆角卡片堆砌/emoji）：
  - 移动优先：面板=底部抽屉（fixed bottom，max-height 46vh，可滚动，默认收起 translateY(110%)，`.open` 弹出；顶部有拖拽把手条）；canvas 全屏铺满（100dvh）；标题区左上安全距离 env(safe-area-inset-*)；控件触摸目标 ≥40px；`touch-action:none` 只给 canvas 区，面板可滚动。
  - 桌面 ≥900px：面板改为右侧固定栏宽 300px 全高常开，#panel-toggle 隐藏。
  - 视觉：暖纸底渐变 body（`#f3ead9 → #e9d9bc` 径向），墨色 `#3a2e26` 文字，强调橙 `#c9702e`；细边框 1px rgba(58,46,38,.18)；字体 system-ui + "Noto Serif SC" 衬线标题；控件极简：滑杆原生 accent-color 橙、开关做胶囊；禁止阴影滥用（面板一个轻投影即可）。
- src/leaves.js（小彩蛋，量力而为）：
  ```js
  export function createLeaves(THREE, opts={}) → { group, update(dt, t) }
  ```
  12–16 片程序化枫叶（CanvasTexture 画单片叶形，PlaneGeometry 0.14×0.14 双面），绕场景缓慢飘落+摇摆+自转，y<0 循环回顶。材质 transparent depthWrite:false。低配可减半。

### src/app.js（集成者/主 agent 写，其他人不写）

职责：renderer/scene/camera/lights/接触阴影（makeSoftShadowTexture 平面 + directional shadow 用 THREE.ShadowMaterial 地面 opacity 0.15，shadow.mapSize 1024，PCFSoft）；buildFox；按 quality 档（low/mid/high → DPR 1/1.5/2、壳数系数 0.55/0.8/1）对每个 furTarget createShellFur；参数状态（localStorage key `pumpkin-fox.v1`）+ 全部 UI id 绑定 + 滑杆 output 更新；动画循环：呼吸（bodyRoot scale 1+0.012sin）、摇尾（tail.rotation.y = sin(t*1.3)*0.22 + 风附加、rotation.x 微）、随机抖耳、每 3–6s 眨眼（eyes scaleY 0.08 持续 120ms）、点击狐狸 raycast → 弹跳弹簧 scale + 尾巴加速 1.5s + 立即眨眼；OrbitControls（enablePan:false, damping, minDistance 2.6, maxDistance 8.5, maxPolarAngle 1.48, target(0,1.02,0), autoRotate 速度 0.8）；resize；`window.__fox = { params, setParam, fox, furs, scene }` 供测试。leaves 集成 `createLeaves`。

## 验收（集成者执行，agent 不用跑浏览器）

- node --check 全绿；Playwright 无头双视口（1440×900 / 390×844）零 console error；毛发密度/长度/风滑杆实时生效；自动转台/点击交互/眨眼正常；手机抽屉面板开合顺畅；截图人工核对毛茸茸质感与参考图还原度。
