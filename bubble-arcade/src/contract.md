# 泡泡堂 · BUBBLE ARCADE — 模块契约

单文件 H5 复刻经典《泡泡堂 / Crazy Arcade》：15×13 网格、放泡泡、水柱十字爆破、炸箱出道具、困泡自救/救援、混战与 2v2、1-2 本地玩家 + AI。
**PC 专用**：键盘操作；触屏/移动 UA 显示"请用电脑打开"提示（不做手机适配）。

开发期 `src/*.js` + `src/shell.html`，`build.py` 拼成单文件 `index.html`。零外部依赖/字体/图片/音频。

## 全局命名

`window.BA` 唯一顶层命名空间：

- `BA.CORE` — 工具、配置、存档、RNG
- `BA.ART` — 程序化离屏精灵（tile / 角色 / 道具 / 泡泡 / 水柱 / 头像）
- `BA.AUDIO` — WebAudio 合成音效 + BGM
- `BA.FX` — Canvas 粒子 / 浮字 / 震屏
- `BA.MAPS` — 地图模板 + 对称生成 + 连通性校验
- `BA.AI` — 机器人（危险图 / BFS / 放泡决策）
- `BA.GAME` — 状态机 / 物理 / 战斗 / 渲染 / 循环
- `BA.UI` — DOM 屏幕 / HUD / 设置 / 战绩

## 核心规格（锁死）

- 网格 15×13，`TILE=64` 逻辑像素，棋盘 960×832。
- 瓦片：0 地板 / 1 硬墙 / 2 软箱。四角出生点 (1,1)(13,1)(1,11)(13,11)，出生 L 形 3 格清空。
- 泡泡：默认引信 2.4s，十字水柱，威力 = 起始 1 格；遇硬墙停、炸软箱停、遇泡泡引爆（链式 0.09s）。
- 玩家：起始 1 泡泡 / 1 威力 / 速度 3.4 格/秒；上限 8 泡泡 / 8 威力 / 6.2 速度。
- 被水柱命中 → 困泡 3.6s：队友贴身 0.75 格救援；自己狂按方向/放泡键可缩短；到时爆泡死亡。困泡再被水柱命中立即死亡。
- 护盾道具抵挡一次水柱（1.6s 无敌）。
- 踢泡泡：有靴子时走向泡泡把它踢出，滑到障碍/泡泡/玩家处停下（撞到玩家使其困泡）。
- 道具：泡泡+1 / 威力+1 / 速度+1 / 踢靴 / 护盾；软箱摧毁按概率掉落（默认 30%），水柱会冲毁地上道具。
- 回合：最后存活者/队伍获胜；默认 150s 后进入"死亡模式"随机落泡直到分出胜负。
- 比赛：先到 `winsNeeded`（默认 3）局者/队获胜。混战按人计分，组队按队计分。

## 配置 schema（`ba_cfg_v1`）

```js
{ winsNeeded:3, roundTime:150, fuse:2.4, startBombs:1, startPower:1,
  itemChance:0.30, suddenDeath:true, sfxVolume:0.8, musicVolume:0.35,
  shake:1, particles:1, showFps:false,
  lastMap:'garden', lastMode:'ffa', lastHumans:1, lastPlayers:4, lastDiff:'normal' }
```

存档 `ba_save_v1`：`{ stats:{matches,wins,rounds,bombs,blocks,items,rescues,bestStreak}, streak }`。
`?reset=1` 必须在模块读 localStorage 之前清 key（shell 内联脚本负责）。

## 模块接口

```js
BA.CORE = { U:{clamp,lerp,rand,randInt,choice,shuffle,rng,deepMerge,clone,el,esc,fmtTime},
            CFG:{get,save,patch,reset,on}, SAVE:{get,save,patch,reset}, PARAMS };
BA.ART = { init(), tile(type,theme,variant), soft(theme,variant), player(themeId,dir,kind,frame),
           avatar(themeId)->dataURL, item(type)->canvas, itemURL(type)->dataURL,
           bubbleSprite, trappedSprite, geyser(frames)->canvas[], themeColor(theme), THEMES };
BA.AUDIO = { init(), unlock(), play(name,opts), bgm(on), duck(ms), setSfx(v), setMusic(v), muted(bool) };
BA.FX = { init(), splash(x,y,n,opt), burst(x,y,color,n,opt), dust(x,y,n), text(x,y,str,color),
          confetti(n), ring(x,y,color), shake(a), update(dt), draw(ctx), clear() };
BA.MAPS = { LIST, build(id, rng)->{name,theme,w,h,grid,spawns}, thumb(id,canvas) };
BA.AI = { think(S,p,dt) };
BA.GAME = { init(canvas), startMatch(opts), quit(), pause(), resume(), nextRound(), render(), S };
BA.UI = { init(), show(name), hide(), hud(S), toast(msg), setHints(S) };
```

## DOM id 约定

`#game`(canvas)、`#hud`、`#scoreStrip`、`#timer`、`#roundTag`、`#hints`、`#screenTitle`、`#screenSettings`、`#screenHelp`、`#screenStats`、`#screenPause`、`#screenRound`、`#screenMatch`、`#countdown`、`#toast`、`#desktopOnly`、`#fps`。
标题页设置 chips：`[data-set="mode|humans|players|diff|map|wins"]`。

## 测试钩子 `window.__ba`

`state/phase/players/board/cfg/fps/errors`、`start(opts)`、`quit()`、`pause/resume()`、`nextRound()`、
`fastForward(sec)`、`setBotOnly(bool)`、`give(id,type,n)`、`teleport(id,tx,ty)`、`placeBomb(id)`、
`forceEnd(id)`、`seed(n)`、`setSpeed(x)`、`winNow(id)`。

## 主线负责（勿动他人模块）

全部模块由主线实现；子代理仅按需只读契约。
