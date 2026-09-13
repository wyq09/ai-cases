# OrchestrateIQ

AI Agent 编排平台监控后台的 1:1 可交互复刻 —— 8 秒产品录屏 → 全部按钮可点、数据闭环的 SaaS dashboard demo。纯前端单文件，零依赖离线可跑。

在线预览: <https://case.youyongai.com/orchestrateiq-dashboard/>

## 界面与交互

- **Overview** — Health 半圆仪表盘（载入动画、随时间范围联动）、4 张 KPI 卡（sparkline 描画 + hover 数值）、Live agent network 实时网络图（贝塞尔边、流动粒子、节点 hover/点击过滤、Expand 全屏、按 agent/时间窗下钻）、Active incidents（详情弹窗 → 一键跳转对应 trace）、Cost by agent（7/30/90 天切换）、AI 助手卡（快捷提问、0/300 计数、打字机回复）
- **Traces** — 42 条 trace 实时过滤（搜索/5 类筛选 chip/Saved views）、行点击进详情、Export 真 CSV 下载、Rows per page、直播流每 6 秒滑入新 trace
- **Trace 详情** — Waterfall / Timeline / Context / Metadata / Raw JSON 五个实内容 tab；瀑布图 span 点击切换右侧 Invocation 面板（含 retry、ghost "not executed" 态）；Create incident 表单弹窗 → incidents 与通知实时 +1；一键进入 Handoff Inspector
- **Handoff Inspector** — Router→Billing 断链路径动画、Context comparison 逐字段对比（行点击展开样例值）、payload 膨胀条、blast radius、OrchestrateIQ 分析、Create fix（diff 弹窗 → Apply → 绿态闭环）、Dismiss + Undo
- **全局** — 明暗双主题（日月即切）、⌘K 命令面板（页面/动作/trace 全局搜索）、通知面板、头像菜单、设置与快捷键弹窗、Toast 反馈、hash 路由全深链

## 技术要点

- **单文件交付**：`build.py` 把 icons/data/core/8 个页面模块与 DM Sans 字体（base64）拼装为一个 `index.html`
- **契约驱动的并行开发**：`src/contract.md` 锁死命名空间/路由/设计 token/数据真值，4+1 个子代理各交付 2 个文件，主线集成
- **种子随机数据**：42 条 trace 逐格对齐录屏真值，其余程序化生成——任意 trace id（含直播流新造的）都能打开完整瀑布详情
- **零外部资源**：手写 SVG 图标库（40+）、SVG sparkline/网络图/瀑布图，Web 字体内嵌
- **工程化自检**：`tools/shot.js` headless 截图 + `window.__errs` 错误探针 + `?freeze=1` 定帧参数；`?theme=dark`、`?reset=1` 等 URL 钩子

## 开发

```sh
python3 build.py     # 重新拼装 index.html
```

调试参数：`?theme=dark` 暗色 · `?freeze=1` 冻结动画/直播流（截图确定性） · `#/trace/tr_84921/handoff` 直达任意深链。
