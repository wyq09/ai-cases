# 合成大西瓜

单文件、全配置驱动的合成类 H5 小游戏。基于原生 Canvas 与 Matter.js，无需构建、无外部依赖，等级数量、逐级图标、背景主题、页面文案、物理手感、特效音效全部可通过配置修改。

## 特性

- 等级数量可配：`levelCount` 任意增减，半径、颜色、分数按等级自动生成
- 逐级图标可配：每级支持自定义名称、半径、颜色、分值、图案（deco）或图片（icon）
- 背景与页面全可配：渐变/纯色/背景图三种背景、页面强调色、全套界面文案
- 物理引擎：Matter.js 0.19.0（已本地内置），重力、弹性、摩擦、投放冷却可调
- 合成特效：粒子碎屑、冲击波、屏幕震动、下落拖尾、落地压扁、彩带、震动反馈，均可独立开关
- WebAudio 实时合成音效，不依赖任何音频素材文件

## 快速开始

- 直接用浏览器打开 `index.html` 即可游玩；或通过任意静态服务器访问目录。
- 桌面端支持方向键左右移动、空格键投放。
- 微信内直接发送链接即可点开游玩。

加载自定义配置示例：

```
index.html?config=config.custom.json
```

## 自定义方式

四种方式按顺序叠加生效：`DEFAULT_CONFIG` → 面板本地保存 → 远程配置 → URL 快捷参数。

1. **游戏内配置面板（推荐）**：点击右上角齿轮按钮打开。可视化修改：标题等文案、等级数量、每一级的名称 / 颜色 / 分数 / 半径 / **上传图片作为图标**、背景（渐变 / 纯色 / **上传背景图** + 压暗度）、强调色、重力 / 投放冷却 / 危险线高度、特效与音效开关。「应用并保存」立即生效并写入浏览器本地存储（`localStorage`，键 `mw_user_config`，刷新后保留）；「导出 JSON」可下载当前完整配置用于 `?config=` 或写入 `DEFAULT_CONFIG`；「导入」可加载配置文件；「恢复默认」清空本地保存。
2. **修改 `index.html` 顶部 `DEFAULT_CONFIG`**：所有默认配置集中在这一个对象里，直接编辑即可。
3. **`?config=配置文件.json`**：通过 fetch 加载一份 JSON（本地路径或 URL 均可），与默认配置深度合并后生效；加载失败时静默回退默认值。注意 `file://` 直开时浏览器会拦截 fetch，此时需经静态服务器访问。示例配置见 `config.custom.json`。
4. **快捷参数**：
   - `?levelCount=9`：快速修改合成等级数量（3~15），在远程配置加载后再覆盖
   - `?dropPool=5`：快速修改随机投放等级池大小

配置合并为深度合并：JSON 中只写想覆盖的字段，其余沿用默认值；`levels` 数组例外，见下文。

## 配置项参考

以下为 `DEFAULT_CONFIG` 的全部字段及默认值。

### rules（玩法规则）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `levelCount` | `7` | 合成等级数量，等级增加时半径/颜色/分数自动生成 |
| `dropPoolCount` | `4` | 随机投放池大小，只从前 N 级中随机投放 |
| `dangerY` | `96` | 顶部危险线高度（世界单位，距画布顶部） |
| `overGraceMs` | `1500` | 有球持续越线该时长后判负 |
| `maxMergeBonus` | `100` | 两个最高级相撞（双双消失）的额外奖励分 |
| `comboWindowMs` | `900` | 连击判定时间窗口 |
| `comboBonus` | `0.25` | 连击加成系数，得分 = 基础分 × (1 + (连击数 - 1) × 系数) |

### levels（等级列表，单项字段）

默认内置 7 级手工配色（樱桃/橘子/柠檬/猕猴桃/桃子/柿子/西瓜，暖色系）。自定义时，`levels` 数组与按 `levelCount` 自动生成的结果**按下标逐项深度合并**（`deco` 内各开关同样逐项合并），因此**只需写想覆盖的字段**。

最终等级数量的优先级：**显式指定的 `rules.levelCount`（配置 JSON 或 `?levelCount=`）> `levels` 数组长度**。即：未显式指定时数组长度决定等级数并回写 `rules.levelCount`；显式指定时以该值为准，数组多余项截断、不足项按自动生成规则补齐。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `name` | 水果名 | 等级名称，用于横幅文案与最高分存档 key |
| `radius` | 17 → 84 | 圆半径（世界单位，限制在 10~140） |
| `color` | 自动生成 | 主色，渲染时自动派生高光与暗部 |
| `score` | `i + 1` | 合成出该级时的基础得分 |
| `deco` | 见下表 | 图案开关对象 |
| `icon` | 无 | 图片 URL 或 dataURL，圆形裁切铺满显示，**优先于 deco 渲染**；加载失败时回退为 deco 图案 |

`deco` 各图案开关（布尔值）：

| 开关 | 说明 |
| --- | --- |
| `stem` | 顶部果茎 |
| `leaf` | 顶部叶片 |
| `stripes` | 纵向深色条纹 |
| `seeds` | 果籽斑点 |
| `dots` | 深色圆点 |
| `calyx` | 顶部四瓣花蒂 |
| `cleft` | 表面裂缝 |
| `flesh` | 浅色果肉与籽环 |

### theme（背景与主题）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `bgType` | `'gradient'` | 背景类型：`gradient` / `solid` / `image` |
| `bgColorTop` | `'#fff4d8'` | 渐变背景顶部颜色 |
| `bgColorBottom` | `'#ffd394'` | 渐变背景底部颜色 |
| `solidColor` | `'#ffe9c4'` | 纯色背景颜色（`bgType='solid'` 时生效） |
| `backgroundImage` | `null` | 背景图 URL（`bgType='image'` 时生效，cover 铺满） |
| `backgroundImageDim` | `0.25` | 背景图暗化遮罩强度 0~1，保证游戏元素可读 |
| `courtColor` | `'rgba(255,252,240,0.55)'` | 游戏区底色 |
| `wallColor` | `'#e2953f'` | 预留字段（边框当前使用 `wallLineColor`） |
| `wallLineColor` | `'#c97c26'` | 游戏区边框颜色 |
| `dangerLineColor` | `'#e8443a'` | 危险线颜色 |
| `dangerLineLabel` | `'危险线'` | 危险线右侧文字，置空则不显示 |
| `decoBokeh` | `true` | 背景柔光圆点装饰 |
| `pageAccent` | `'#ff7a21'` | 页面强调色（顶栏分数、按钮、标题圆点） |

### ui（界面文案）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `title` | `'合成大西瓜'` | 页面标题与 `document.title` |
| `hint` | `'拖动瞄准 · 松手投放'` | 首次操作提示 |
| `bestPrefix` | `'最高 '` | 预留字段（顶栏最高分当前由 `bestTemplate` 渲染） |
| `scoreFloatPrefix` | `'+'` | 得分飘字前缀 |
| `comboText` | `'连击 x{combo}'` | 连击飘字，`{combo}` 为连击数 |
| `maxLevelBanner` | `'合成 {name}!'` | 合成出最高级的横幅，`{name}` 为最高级名称 |
| `maxMergeBanner` | `'双{max}临门 · 奖励 {bonus} 分!'` | 两个最高级相撞的横幅，`{max}` 为名称，`{bonus}` 为奖励分 |
| `newRecordBanner` | `'新纪录!'` | 预留字段（结算页"新纪录"标签文案当前内置于页面） |
| `overTitle` | `'游戏结束'` | 结算弹窗标题 |
| `overTip` | `'水果堆过红线啦'` | 结算弹窗副标题 |
| `overScoreLabel` | `'本局分数'` | 结算分数标签 |
| `againText` | `'再来一局'` | 重开按钮文字 |
| `overBestPrefix` | `'历史最高 '` | 结算弹窗历史最高分前缀 |
| `bestTemplate` | `'最高 {best}'` | 顶栏最高分模板，`{best}` 为最高分 |

### physics（物理参数）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `gravity` | `1.15` | 重力加速度 |
| `restitution` | `0.15` | 碰撞弹性 |
| `friction` | `0.4` | 摩擦力 |
| `frictionAir` | `0.006` | 空气阻力 |
| `dropCooldownMs` | `480` | 两次投放的最小间隔 |

### effects（特效开关）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `particles` | `true` | 合成碎屑粒子 |
| `shockwave` | `true` | 冲击波圆环 |
| `shake` | `true` | 屏幕震动 |
| `shakeScale` | `1` | 震动幅度倍数 |
| `trail` | `true` | 高速下落拖尾 |
| `squash` | `true` | 落地压扁回弹 |
| `confetti` | `true` | 最高级合成与新纪录彩带 |
| `haptic` | `true` | 震动反馈（`navigator.vibrate`，部分安卓微信生效） |

### audio（音效）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 音效总开关（WebAudio 合成，无素材文件） |
| `volume` | `0.5` | 音量 0~1 |

## 运行时 API

`window.MergeGame` 与测试钩子 `window.__mw` 指向同一对象。

属性（getter）：

| 属性 | 说明 |
| --- | --- |
| `config` | 当前生效的完整配置对象 |
| `score` | 当前分数 |
| `best` | 当前最高分 |
| `state` | 游戏状态：`'playing'` / `'over-anim'`（结算动画中） / `'over'` |
| `levelCount` | 当前等级数量 |
| `levelNames` | 各等级名称数组 |

方法：

| 方法 | 说明 |
| --- | --- |
| `restart()` | 重开一局 |
| `setConfig(ext)` | 深度合并配置并重建等级、图片、主题、文案、重力与危险线，随后自动重开 |
| `dropAt(x, level?)` | 在世界坐标 `x` 处投放当前级（或指定级）的球；冷却中或已结束返回 `false` |
| `spawnAt(level, x, y)` | 在指定世界坐标直接生成一个指定等级的球（不受冷却与判负限制） |
| `fruitCount()` | 当前场上球的数量 |
| `__bodies()` | 全部球的物理状态（`{x, y, r, vx, vy}` 数组），供自动化测试探针使用 |

坐标系说明：逻辑世界宽度固定为 390，`x` 取值约 0~390，`y` 向下增大。画布宽高比上限约 0.62，宽屏 / 横屏下画布自动收窄居中，保证容器始终占满可用高度。

调用示例：

```js
MergeGame.setConfig({ rules: { levelCount: 9 }, ui: { title: '合成挑战' } });
MergeGame.dropAt(195);        // 在正中间投放
MergeGame.spawnAt(6, 100, 300);
MergeGame.restart();
```

## 目录结构

```
merge-watermelon/
├── index.html            游戏主体（HTML + CSS + JS + 默认配置 DEFAULT_CONFIG + 配置面板）
├── matter.min.js         Matter.js 0.19.0 物理引擎（本地内置）
├── config.custom.json    自定义配置示例（「合成星球」主题）
├── tools/
│   ├── verify.cjs        Playwright E2E 回归（合成 / 计分 / 配置 / 结算）
│   ├── verify-layout.cjs 多视口布局回归（比例钳制 / 居中 / 满高 / 越界）
│   └── test-config.json  E2E 用的远程配置样例
└── README.md
```

## License

MIT
