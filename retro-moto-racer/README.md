# SUNSET RIDE · 日落摩托

复古像素摩托竞速 H5 —— OutRun / Hang-On 血统的伪 3D 街机赛车：日落沙漠公路、12 人排名、检查点计时延长、氮气涡轮、CRT 扫描线，单文件零外部资源。

在线游玩：<https://case.youyongai.com/retro-moto-racer/>

## 玩法

- 12 名车手同场竞速（1 玩家 + 11 AI），按累计里程实时排名，3 个关卡：SUNSET DESERT → CANYON DUSK → MOJAVE NIGHT（配色/天光随关切换）
- 计时检查点延长制：开局 50s，过检查点 +18s 并回 40 氮气，倒计时归零前没到下一检查点即 TIME UP
- 氮气（NITRO）：顶速 280 → 322 km/h；被动缓回、吸对手尾流加速回、检查点大回
- RIDER / BIKE 双状态条：骑手体力（离路/碰撞消耗，低体力加速变肉）、车辆状况（碰撞消耗，低车况压极速）
- 弯道离心力会把你往外抛，HARD 弯满速过不去必须收油；路肩沙地强减速、撞橙色桶掉速掉车况
- 操控：下半屏横向拖拽转向（或设置里换半屏按住转向），NITRO / BRAKE 大按钮，自动油门；键盘 ←→/AD、Shift/Space 氮气、P 暂停
- 战绩持久化：单关最佳 / 总时间最佳 / 历史最高名次；标题屏车库可选 4 种车色

## 技术要点

- **伪 3D 渲染**：segment 投影（Jake Gordon javascript-racer 体系，segLen=200 / fov=100 / drawDist=300），逐段 dx 累积伪造曲线 + maxy 裁剪山丘 + 指数雾；低内部分辨率（长边 480px）+ `image-rendering: pixelated` 放大，全程 NEAREST
- **全程序化美术**：像素矩阵 → 离屏 canvas（13 色 × 5 lean 摩托、6 种路旁道具、3 种跨路拱门、三关各一套可平铺天空/远山/红岩/沙丘视差层），5×7 位图字体 HUD，零图片零字体文件
- **AI 车手**：11 人分梯队巡航 + 弯道按技术减速 + 前车避让 + 玩家贴后礼让 + 轻橡皮筋；「托管车手」模拟器（与实机共用同一 stepPlayer 物理）校准三关时长与检查点预算，node 单测保证可完赛性
- **WebAudio 全合成**：双振荡器引擎声（音高随速度 + 氮气风噪层）、13 条音效、3 轨步进音序器 BGM；unlock 幂等、可见性停播
- **CRT 质感**：CSS 扫描线 + 暗角覆盖层（强度可调可关），结算彩带/火花/沙尘/高速气流线对象池粒子（禁 shadowBlur）
- **游戏内配置面板**：音量/BGM 曲目、转向模式与灵敏度、CRT/粒子/震屏、AI 难度/检查点秒数/氮气回填/橡皮筋、配置导出导入
- rAF + setInterval 双驱动帧循环（后台节流不冻结）、`?auto=1` AI 托管演示、`?stage/?pos/?reset` 等调试参数、`window.__rm` 测试钩子

## 开发

```
python3 build.py        # src/*.js + shell.html → index.html（单文件）
node tools/test-logic.js  # 逻辑单测（赛道确定性/物理/检查点/名次/托管可完赛）
```

调试参数：`?reset=1` 清档 · `?muted=1` 静音 · `?auto=1` 托管演示 · `?stage=1..3` 直达关卡 · `?pos=n` 起步名次 · `?crt=0` 关 CRT · `?touch=1` 强制触屏模式
