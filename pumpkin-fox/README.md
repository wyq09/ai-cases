# 南瓜狐狸 · 毛茸茸 3D

Three.js 程序化建模的 Q 版狐狸：戴杰克南瓜灯帽、围格纹厚围巾、穿芥黄外套，尾巴巨大蓬松。毛发用 **shell texturing**（壳层毛发，致敬 [piellardj/fur-threejs](https://github.com/piellardj/fur-threejs)）——同一几何沿法线挤出 N 层半透明壳，片元用 3D cell hash 噪声做毛束 discard，根部压暗、毛尖提亮 + 风摆/重力下垂全在顶点端完成，无贴图、无骨骼、无外部资源。

## 看点

- 全程序化：狐狸几何、格纹围巾、南瓜雕脸贴图、枫叶飘落、软阴影，全部运行时生成
- 壳层毛发：尾巴 16 层 + 腮毛/耳内绒/胸毛/头部绒毛分层调参，根部伪 AO + 毛尖 rim 光
- 待机演出：呼吸、摇尾随风、随机抖耳、眨眼；点它一下会弹跳 + 疯狂摇尾
- 参数面板：毛发长度/密度、风力/风速、画质三档（自动适配移动端）、自动转台、毛发显隐、截图保存
- 手机优先：底部抽屉面板、≥40px 触控目标、safe-area、双指缩放拖转，参数 localStorage 持久化

## 运行

任意静态服务器指向本目录即可（模块化 ESM + importmap，不能 file:// 直开）：

```bash
cd pumpkin-fox && python3 -m http.server 8734
# 打开 http://localhost:8734  手机访问 http://<局域网IP>:8734
```

## 结构

```
index.html          页面骨架 + 暖秋纸感 UI + 面板
src/app.js          场景/灯光/参数系统/动画循环/交互（集成层）
src/fox.js          程序化狐狸建模（buildFox）
src/fur.js          壳层毛发着色器（createShellFur）
src/textures.js     格纹/南瓜脸/软阴影 Canvas 贴图
src/leaves.js       枫叶飘落彩蛋
vendor/             three r170 本地化（离线可用）
reference/          三视图参考图
test/acceptance.py  Playwright 双视口验收（截图 + console 零报错 + 交互冒烟）
```

## 验收

```bash
python3 test/acceptance.py   # 1440×900 与 390×844(iPhone UA) 双跑，零 console error 才算过
```
