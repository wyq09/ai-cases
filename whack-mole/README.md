# whack-mole · 欢乐打地鼠

经典街机打地鼠 × 营销活动 H5。单文件、零外部资源、手机竖屏优先，自带完整的活动接入层（奖品三档 / 券码 / 每日次数 / 平台钩子）。

## 玩法

- 3×3 洞阵限时 60 秒，敲中得分：地鼠 +100、金地鼠 +300、礼盒鼠 +150；**炸弹鼠禁打**（−200 并清空连击）
- 连击 3 / 6 / 10 档倍率 ×2 / ×3 / ×4；敲空不惩罚，地鼠缩回不断连
- 敲中礼盒鼠收集奖品并触发**狂热时刻**：双倍得分、金鼠出没、节奏加快
- 三档难度（悠闲 / 标准 / 疯狂），按分数评金银铜牌，按牌级领对应好礼、生成演示券码
- 三档难度分别记录最佳分 / 连击 / 命中率；每日次数可配置

## 营销接入

```js
// 活动方一行接入：文案 / 奖品 / 券码前缀 / 生命周期钩子
WM.marketing.register({
  title: 'XX商场周年庆', subtitle: '打地鼠 · 赢好礼',
  prizes: [{ tier: 'gold', name: '免单大奖', prefix: 'DJ' }, ...],
  hooks: {
    onRoundEnd(result) { /* 上报成绩，返回 false 接管结算 */ },
    onClaim(result)    { /* 发券，返回 false 接管领奖演出 */ },
    onShare(result)    { /* 自定义分享，返回 false 接管分享 */ }
  }
});
```

配置面板（游戏内 ⚙）含**营销标签页**：标题 / 规则 / 三档奖品与券码前缀 / 客服链接均可视化编辑，另支持地鼠立绘与音效上传替换、玩法参数、配置导出导入。

## 技术要点

- **单文件零依赖**：`build.py` 把 logic / art / audio / fx / config-panel / game 六模块内联成 `index.html`，全部图形 SVG data URI、全部音频 WebAudio 程序化合成
- **rAF + setInterval 双驱动**：时间戳调度弹鼠/狂热/倒计时，后台节流不冻结；`visibilitychange` 暂停并在回前台时整体平移时间轴
- **外部模块 NOOP 桥**：任一子模块缺失仅降级不报错，busy 永不依赖外部回调
- 配置/存档分离（`wm_config_v1` / `wm_state_v1`），`?reset=1` 在模块读存储前清档

## 开发

```
python3 build.py        # 合并 src/ → index.html
```

调试参数：`?reset=1` 清档｜`?auto=1` AI 自动演示｜`?diff=hard`｜`?time=30`｜`?muted=1`；测试钩子 `window.__wm`（start / whack / spawn / state / cfg）。
