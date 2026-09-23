# 「盖楼」（Tower Bloxx 及中文复刻版）玩法规则调研

调研日期：2026-09-23。方法：WebSearch + WebFetch 轻量调研（维基百科、TV Tropes、JayIsGames、百度百科转述、搜狐微信小游戏报道等）。
凡查不到确切出处的条目，均标注「未查到，推测」。

---

## 1. 核心循环

**吊机摆动 → 点按落块 → 判定 → 下一层**，单键操作（one-button mechanic）。

- 楼层方块吊在屏幕上方，从一侧向另一侧来回摆动，玩家点按/点击让它落下，落在下方楼层顶部。来源：https://en.wikipedia.org/wiki/Tower_Bloxx
- 落下后按水平对齐精度判定：
  - **完全对齐（dead center）→ PERFECT**：触发/延续连击，连击倍率 +1。来源：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx
  - **小偏差 → 仍算成功**：方块带偏移落下，楼体开始左右摇晃；后续方块会以前一层为基准继续堆，误差会累积。物理判定"不太严格"，允许一定悬挑。来源：https://www.jayisgames.com（Tower Bloxx 评测）、https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx
  - **偏差过大 → 整块坠落，损一命**：完全没搭上（错过楼体）即 miss，损失一次机会。来源：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx（"You lose one every time a block doesn't fall properly"）
- 精确数值阈值（如 |Δx| ≤ 几像素算 Perfect）：**未查到，推测**。惯例可取：Perfect ≈ |Δx| < 10% 块宽，成功 ≈ |Δx| < 50% 块宽（有咬合即算），否则坠落。

## 2. Tower Bloxx 原版机制

- **居民数即分数**：每层落定后居民"飘进窗户"，Perfect 落块大幅增加入住居民数；连击倍率（combo multiplier）每 Perfect 一次 +1，倍率只在连击计量条耗尽前有效，倍率越高每层新增居民越多。来源：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx 、https://www.jayisgames.com
- **两条主模式**：
  - **Quick Game（快速游戏，即无尽模式）**：目标是盖最高楼，3 次 miss 后结束；塔可超过 100 层、直冲太空。来源：https://en.wikipedia.org/wiki/Tower_Bloxx 、https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx
  - **Build City（城建模式）**：盖好一栋楼放进城市网格，人口是总目标，人口解锁更高级楼型；主线每栋楼要求 **40 层**；楼顶特殊屋顶（奖励屋顶）在表现好时追加居民。来源：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx
- **命 = 3 次**：Wiki 原文 "the game ends after three missed drops"；All About Symbian："If your dropped blocks miss three times, the current tower construction stops"。来源：https://en.wikipedia.org/wiki/Tower_Bloxx 、https://allaboutsymbian.com
- **塔的摇晃影响判定**：是。落偏使楼体摇晃加剧（sway），摇晃会提高后续落块难度（视觉基准在动），越盖越难；这是官方难度设计的一部分。来源：https://en.wikipedia.org/wiki/Tower_Bloxx（"sloppy placement increases swaying and difficulty"）
- **镜头滚动**：具体描述**未查到，推测**——原版及所有复刻中镜头跟随楼顶上移、保持吊块可见，属该玩法的标配表现（所有演示视频均如此），可作为设计假设。

## 3. 中文复刻版惯例

- **HUD 用词**：百度百科对 Tower Bloxx/City Bloxx 词条的中文描述为"屏幕下方显示大楼**高度、人口**，以及通常拥有的 **3 次机会（生命）**"。「目标 N 层 / 当前 N 层」的具体措辞**未查到，推测**——这是中文 H5/微信盖楼小游戏的通用 HUD 设计（如"目标：40 层""当前：23 层"），可作为默认 UI 文案。
- **《一起来盖楼》（微信小游戏，2018，搜狐报道）**：界面正下方一栋基础房子，上方吊车吊着楼层来回晃动，时机合适时切断吊线落层；落得越准评分越高，出现 "Perfect" 提示并触发连击加分；盖得越高"收益"越高（金钱化包装）。来源：https://www.sohu.com（2018-11-24《一起来盖楼》报道）
- **《都市摩天楼》（City Bloxx，诺基亚原版复刻，App Store / Google Play）**：吊车晃动、点击落块；对齐精准得 Perfect，连续 Perfect 触发连击奖励；楼越高、楼等级越高得分越多。来源：https://apps.apple.com（都市摩天楼）、https://play.google.com/store/apps/details?id=com.zeek.citybloxx
- **4399《疯狂盖楼》（H5，山海工作室）**：点击让吊机移动的楼层方块落下堆叠，敏捷类玩法。来源：4399 H5（转述，无稳定直链）
- **失败条件惯例**：3 条命（3 次落偏/坠落）为主流；部分极简复刻采用"掉一块直接结束"。**未查到逐款确认，推测**：做 3 命制最贴合原版与多数中文复刻。
- **分数规则惯例**：每层基础分 + Perfect 连击倍率加成 +（可选）人口/居民数作为第二展示指标。逐款数值**未查到，推测**：基础 10 分/层 × 连击倍率是常见做法。

## 4. 难度曲线惯例

- **摆速随楼高加快**：TV Tropes 称之为 "Difficulty by Acceleration"——塔越高，吊块摆得越快。来源：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx
- Google Play 上 City Bloxx 官方描述也确认关卡"逐渐提升难度"。来源：https://play.google.com/store/apps/details?id=com.zeek.citybloxx
- 具体数值曲线**未查到，推测**：常用做法为角速度从 ~60°/s 线性或分段递增至 ~150°/s，或按"每 10 层提一档"；摆幅（振幅）通常保持恒定（覆盖全屏宽），部分变体在高楼层缩小振幅同时加速。

## 5. 达标（如 40 层）后的处理

- 原版对照：城建模式主线每栋楼只需盖到 **40 层**即算该楼完工，转入城市放置与下一栋；Quick Game 则无上限、无尽盖高（100+ 层可到太空）。来源：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx 、https://en.wikipedia.org/wiki/Tower_Bloxx
- 中文复刻对"目标 N 层"达成后的处理**未查到，推测**：主流是两种之一——(a) 弹出"目标达成"庆祝后继续进入无尽模式计分；(b) 结算胜利画面并鼓励继续挑战。建议实现为 (a)：达标弹提示，不中断局内体验，与 Quick Game 的无尽精神一致。

---

## 来源清单

1. Tower Bloxx - Wikipedia：https://en.wikipedia.org/wiki/Tower_Bloxx
2. Tower Bloxx - TV Tropes：https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/TowerBloxx
3. JayIsGames - Tower Bloxx Walkthrough/Tips/Review：https://www.jayisgames.com
4. All About Symbian - City Bloxx review：https://allaboutsymbian.com
5. 搜狐 -《一起来盖楼》微信小游戏报道（2018）：https://www.sohu.com
6. 都市摩天楼 - App Store：https://apps.apple.com
7. City Bloxx - Google Play：https://play.google.com/store/apps/details?id=com.zeek.citybloxx
8. 百度百科「Tower Bloxx」「都市摩天楼」词条（经搜索摘要转述）：https://baike.baidu.com
