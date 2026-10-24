# 决斗传说 · DUEL LEGENDS

原创游戏王风格单机卡牌对战：39 种卡牌、3 套卡组、完整 AI 对手，手机与桌面即开即玩。

## 玩法

- 双方 8000 LP、20 张卡组、起手 5 张；削减对手 LP 或耗尽其卡组获胜。
- 点击手卡召唤怪兽、发动魔法或盖放魔陷；每回合一次通常召唤，高星怪兽需要祭品。
- 主要阶段后进入战斗，点击攻击表示怪兽选择目标；支持攻守表示、直接攻击、贯穿、墓地复活与自动触发陷阱。
- 内置卡牌图鉴、搜索与分类筛选、规则说明、战斗记录、胜负结算和一键重赛。
- 本作是经典规则轻量复刻，不含额外卡组、复杂手动连锁、同调/超量/灵摆/连接召唤。

## 技术要点

- **单文件离线运行**：卡面、原创角色、卡背均为程序化 SVG；无 CDN、外部字体、图片或音频。
- **真实规则引擎**：统一合法动作校验、种子洗牌、阶段状态机、战斗/效果结算；AI 与玩家使用完全相同的规则。
- **移动端适配**：竖屏、横屏与桌面布局，点击卡牌完成操作，无需精细拖拽。
- **合成演出**：WebAudio 音效与背景节奏、召唤/攻击/伤害粒子、LP 动画；声音开关和战绩使用 localStorage 保存。
- **回归验证**：Node 35 项逻辑断言全绿；ego-lite 24 项 UI 检查全绿；另在手机视口通过真实 UI 点击完成整局、重赛、声音/规则/记录流程，并验证 `file://` 离线启动，控制台零错误。已用内置浏览器检查桌面视觉；ego 截图接口在当前环境超时，因此 UI 自动化脚本跳过其截图调用。

## 开发

```bash
python3 build.py
node test/run.mjs
python3 test/serve.py 8794
# 另一个终端：先运行 ego-browser skill
ego-browser nodejs < test/ego/ego-01-flow.mjs
ego-browser nodejs < test/ego/ego-02-complete.mjs
ego-browser nodejs < test/ego/ego-03-offline.mjs
```

调试参数：`?seed=42&fast=1` 固定洗牌并加速 AI；`?reset=1` 清空本案例战绩与设置。

在线路径（部署后）：https://case.youyongai.com/duel-legends/
