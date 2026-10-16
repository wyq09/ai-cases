# 毛茸茸小狐 · 3D

Three.js 程序化建模的自然态小狐狸：无帽无衣，全身 13 个部位覆盖**壳层毛发**（shell texturing，致敬 [piellardj/fur-threejs](https://github.com/piellardj/fur-threejs)）——同一几何沿法线挤出多层半透明壳，片元用 3D cell hash 噪声做毛束 discard + 每根毛随机参差长度，根部压暗、毛尖提亮，风摆/重力全在顶点端，无贴图无骨骼无外部资源。

> 由「南瓜狐狸」换装而来：去掉南瓜灯帽/格纹围巾/芥黄外套，改为自然态（旧版保留在 git 历史）；旧地址 `pumpkin-fox/` 自动跳转到本目录。

## 看点

- 全程序化：几何、软阴影、飘落枫叶全部运行时生成
- 壳层毛发 13 部位：躯干（奶油肚皮顶点色渐变）、头、吻、腮毛、耳内外、双臂、胸毛、16 层壳大尾巴（橙→奶白，分界线沿环向波浪起伏）
- 造型细节：头顶三撮炸毛、张嘴吐舌、腮红大眼、眉点、深棕耳尖/爪/小腿
- 待机演出：呼吸、摇尾随风、随机抖耳、眨眼；点它一下会弹跳 + 疯狂摇尾
- 参数面板：毛发长度/密度（面部位带单部位上限防埋脸）、风力/风速、画质三档、转台、毛发显隐、截图
- 手机优先：底部抽屉、safe-area、双指缩放，参数 localStorage 持久化

## 运行

任意静态服务器指向本目录即可（ESM + importmap，不能 file:// 直开）：

```bash
cd fluffy-fox && python3 -m http.server 8734
# 打开 http://localhost:8734  手机访问 http://<局域网IP>:8734
```

## 结构

```
index.html          页面骨架 + 暖秋纸感 UI + 面板
src/app.js          场景/灯光/参数系统/动画循环/交互（集成层）
src/fox.js          程序化狐狸建模（buildFox，无服饰自然态）
src/fur.js          壳层毛发着色器（createShellFur）
src/textures.js     Canvas 贴图工厂（软阴影在用；格纹/南瓜脸为旧装遗留，保留备用）
src/leaves.js       枫叶飘落彩蛋
vendor/             three r170 本地化（离线可用）
reference/          三视图参考图（自然态 + 旧装南瓜版）
test/acceptance.py  Playwright 双视口验收（截图 + console 零报错 + 交互冒烟）
test/verify_live.py 线上地址真实渲染复验
```

## 验收

```bash
python3 test/acceptance.py   # 1440×900 与 390×844(iPhone UA) 双跑，零 console error 才算过
```
