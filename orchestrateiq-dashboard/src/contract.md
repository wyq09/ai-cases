# OrchestrateIQ 复刻契约（唯一事实源）

复刻 8 秒 SaaS 后台录屏为**全可交互**单文件 Web demo。非游戏：无音效/无RTP，重点是**像素级排版 + 全按钮可点 + 完整交互闭环**。

## 0. 参考图（动手前必 Read）

全部在 `ref/`（源视频帧 1600×1200，fps=3：f_001≈0.33s … f_024≈8s）：

| 文件 | 内容 | 真值帧 |
|---|---|---|
| `nav_top.png` | 顶栏：logo/导航胶囊/Live/30min/搜索/铃铛/头像 | f_004 |
| `sidebar.png` | 左侧图标轨：日月主题、6主图标、底部帮助/登出 | f_004 |
| `ov_health.png` `ov_stats.png` `ov_network.png` `ov_incidents.png` `ov_cost.png` `ov_welcome.png` | Overview 六块 | f_004 |
| `tr_header.png` `tr_table.png` | Traces 头部+表格 | f_010 |
| `td_header.png` `td_waterfall.png` `td_invoke.png` | Trace 详情头/瀑布/右侧 invocation 面板 | f_016 |
| `ho_path.png` `ho_context.png` `ho_blast.png` | Handoff 三块 | f_022 |

整页构图看 f_004（Overview）、f_010（Traces）、f_016（Trace 详情）、f_022（Handoff）。

## 1. 交付形态与文件所有权

`python3 build.py` → `dist/index.html` 单文件。源码拼装：

| 文件 | 所有权 | 说明 |
|---|---|---|
| `src/contract.md` `src/shell.html` `build.py` | 主线 | 勿动 |
| `src/styles.css` | 主线 | 设计系统+共享组件类+shell布局 |
| `src/icons.js` | 主线 | `OIQ.icon(name,size)` 全量 SVG |
| `src/data.js` | 主线 | 种子随机+全量 demo 数据+格式化 |
| `src/core.js` | 主线 | 路由/主题/toast/modal/dropdown/命令面板/直播流/测试钩子 |
| `src/pg-overview.js` + `src/css-overview.css` | **overview代理** | 只准动这两个 |
| `src/pg-traces.js` + `src/css-traces.css` | **traces代理** | 同上 |
| `src/pg-trace.js` + `src/css-trace.css` | **tracedetail代理** | 同上 |
| `src/pg-handoff.js` + `src/css-handoff.css` | **handoff代理** | 同上 |
| `src/pg-extra.js` + `src/css-extra.css` | **extra代理** | Workflows/LiveMap/Incidents/Insights 四页 |

**其他文件一律不动。** 需要新共享类/新图标/新数据字段 → 在完工报告里列出来，主线补。禁止自己改 `styles.css/data.js/core.js`。`build.py` 拼接顺序：styles → css-* → icons → data → core → pg-*。JS 里禁止出现 `</script` 字样（build 会断言）。

## 2. 全局命名空间

```js
window.OIQ = {
  icon(name, size=18) -> svg字符串          // 见 icons 名册 §6
  data: { traces, incidents, network, costs, handoff, workflows, agents, me,
          getTrace(id), traceSpans(t), fmt: {num, money, kb, ms, ago} }
  ui: {
    toast(msg, kind='info')                 // kind: info|success|warn|error
    modal({title, body(HTMLElement|string), actions:[{label,kind,onClick}], wide}) -> closeFn
    confirm({title, message, danger, okLabel}) -> Promise<bool>
    dropdown(triggerEl, items, onSelect)    // items:[{label,icon?,value,checked?,danger?}]; 自动定位/开关/Esc
    popoverAnchor(el)                       // 返回绝对定位容器工具(少用)
  }
  pages: { overview, traces, trace, handoff, workflows, livemap, incidents, insights }
  registerPage(id, {title, mount(root, params), unmount()})  // 页面模块唯一注册口
  go(hash)                                  // 编程导航
  on(evt, cb) / emit(evt, ...)              // 'route' | 'theme' | 'range' | 'live' | 'incidents'
  range: '30 min'                           // 全局时间范围(顶栏下拉改, emit 'range')
  live: true                                // 顶栏 Live 徽标可暂停
  state: { theme:'light', traceId, handoffTab... }
}
```

## 3. 路由（hash）

```
#/overview            默认
#/traces              ?q= 由 core 维护在 OIQ.state.traceQuery
#/trace/tr_84921      params={id}
#/trace/tr_84921/handoff   params={id, sub:'handoff'}
#/workflows  #/livemap  #/incidents  #/insights
```

core 负责解析 hash → 调 `page.mount(root, params)`，切页时旧页 `unmount()`（清理 interval/rAF/监听！），页面容器 `.page-enter` 动画 300ms 淡入+上移8px。未知 trace id 也要能渲染（data.getTrace 会程序化生成兜底）。

## 4. 锁死的设计 token（styles.css 已定义，页面只能用 var() 引用，禁止硬编码色值/圆角/阴影）

```css
--bg:#E9EBF0(页面外底)  --panel:#FBFCFD(应用大板)  --card:#FFF  --canvas:#F3F4F6(灰画布)
--line:#ECEEF2  --line2:#E3E6EB
--ink:#191B1F  --ink2:#5D6673  --ink3:#9AA3AF
--blue:#2E6BE6  --blue-weak:#EAF1FE  --blue-mid:#7FA6F2(瀑布蓝条 #82A8F4→#6D97F0 渐变可)
--green:#1F9D5F  --green-weak:#E4F6EC  --green-dot:#33C481
--red:#E5484D   --red-weak:#FDEDED  --red-dot:#F04438
--amber:#F5A623 --amber-weak:#FDF3DC  --amber-dot:#F5A623
--purple:#7C5CFC --purple-weak:#F0EBFE
--r-lg:20px(卡) --r-md:14px(内盒) --r-pill:999px
--shadow-card:0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.06)
--font:'DM Sans'(内嵌base64), fallback 系统
```

字号阶梯：页大标题 34/700 -0.03em；卡标题 22/600；正文 14；次要 13；小标签(全大写) 11.5/600 letter-spacing .08em 色 --ink3。

共享组件类（styles.css 提供，直接用）：
`.card` `.pill`(白胶囊按钮) `.pill-btn`(同+hover) `.btn-primary`(蓝底白字胶囊) `.chip`(浅蓝筛选chip) `.chip-x` `.badge-green/.badge-red/.badge-amber/.badge-purple`(小圆点+浅底) `.dot`(8px圆点 .dot-green/.dot-red/.dot-amber/.dot-gray) `.kv`(小标签+值白盒) `.toolbar-pill`(灰底下拉胶囊) `.icon-btn` `.stat-row`(Health卡右侧行) `.table-g`(表格通用) `.searchbar` `.ai-orb`(蓝球) 等——写页面前先通读 styles.css 现有类，别重复造。

## 5. DOM 骨架（core 渲染，页面只管自己的 root）

```
body > .stage > .app-panel
  .topnav: .brand | nav.pagenav(6胶囊) | .nav-right(Live徽标/30min下拉/搜索/铃铛/头像菜单)
  .body-row: .rail(上:日月 中:6图标 下:帮助/登出) + #page-root
#cmdk(命令面板) #modal-root #toast-root
```

侧栏图标映射：仪表盘=overview（默认高亮蓝底）、机器人=workflows、圆$=insights、扳手=traces、插头=livemap、齿轮=设置modal；日月=主题切换；?=帮助modal；登出=confirm。

## 6. 图标名册（icons.js，`OIQ.icon(name)`）

`logo bars sun moon dashboard robot dollar wrench plug gear help logout search bell calendar chevron-down chevron-right arrow-up-right arrow-right arrow-left back send attach image mic doc bookmark download check x plus filter spark shield person warning clock bolt code braces git(分支) gauge wrench2 alert`（实现以 icons.js 为准，页面用名不符时先查文件）

风格：stroke 1.6、round cap/join、24 viewBox、currentColor。

## 7. 数据契约（data.js，页面禁止自造数字，全从 OIQ.data 取）

- **traces**：42 条。`tr_84921..tr_84932` 12 条 = 视频表格逐格真值（id/workflow/started/duration/agents/tokens/cost/status）；`tr_84918` `tr_84911` = handoff recent runs 真值；其余按种子生成（时间倒序自 09:39 往前，workflow 从 8 个真值池取，status 约 40% failed）。
- **trace 对象**：`{id, workflow, env:'Production', started:'09:42:18.421', startedClock:'09:42:18', dur, durText, agents, retries, tokens, tokensIn, tokensOut, cost, costX, status:'Success'|'Failed', framework:'LangGraph', rootAgent, rootCause, errType, errMsg, spans:[{agent,dot:'green|amber|red|gray', t0,t1(秒), tok, kind:'run|retry|ghost', model, spanId, parentId, invokedAt, cost, ctxKB, ctxFields, err?}], contextFlow:[...], recent:[...]}`。
- **tr_84921 真值锁死**（勿改）：4.82s/8 agents(2 retries)/12,481 tok(in 9,410 out 3,071)/$0.42(3.2×)/Billing Agent invocation 5 of 8/Context loss/authorization_scope；spans=Supervisor 0→4.82 绿 1,204tok；Router 0→0.58 绿 842；Knowledge 0.35→1.22 绿 3,104；Support 1.05→1.82 amber 2,441；Billing 1.95→2.72 红 + retry1 2.78→3.22 红 3,241tok model GPT-5 span sp_29184 parent sp_29180 ctx 12.4KB 4 fields err AuthorizationContextMissing；Validator ghost 3.95→4.24 灰 984；Response ghost 4.35→4.64 灰 665。
- **handoff(Router→Billing)**：path 卡(12.4KB/420ms/2,431 tok/4 of 5 fields, scope admin→user rejected)、context 6 行真值（authorization_scope missing）、payload 12.4KB·3.2×、recent 3 行、blast(128/17.8%/$184/2)、analysis 文案、recommended fix 文案、same pattern 2 行。
- **incidents**：INC-2481 Infinite delegation loop/Customer Support·842 runs affected/4m 18s/红；Authorization context dropped/Billing Agent·128 runs affected/12m/红；Research Agent latency +38%/Research Pipeline·degraded/31m/amber。
- **network**：节点 User request(18.4K req/hr)/Supervisor(1,842·99.4%)/Research agent(842·98.9%)/Data agent(1,204·99.2%)/Validation agent(980·82.1% degraded)/Final agent(1,780·99.8%)；边=灰，Supervisor→Validation=amber；健康图例 4 色。
- **costs(30d)**：Supervisor $2,421 紫 / Research $1,842 绿 / Support $1,421 蓝 / Billing $984 黄（7d/90d 由种子另生成）。
- **overview KPI**：Health 94(+2)、Success 96.4%(-1.2%)、Agents 186(+12)、Failed 248(-18%)、Cost $8,421(+6.8%)；Health 右列 5 行；顶栏 me={team:'Platform Team', role:'Owner · acme-ai'}。range 切换(15m/1h/24h)时 core emit 'range'，页面可用 data.rescale(v, rangeKey) 生成合理漂移值。

## 8. 交互底线（每页必须全活，禁摆设）

通用：一切下拉都是真 dropdown；一切 × 都能删；一切按钮都有 hover+active+反馈（toast/导航/modal，不许 no-op）。`?freeze=1` 时停 rAF 包络/直播流（截图确定性），主题切换全页生效。

- **overview**：仪表盘载入动画(0→94)+range 联动；4 KPI 卡 sparkline 描画动画+hover 显示数值点；网络图 hover 节点放大+边高亮、点击节点→toast+跳 traces(带 agent 过滤)、Supervisor→Data 边上流动蓝点动画、Validation 节点呼吸警告；All agents/Last 5 min 下拉(过滤 dim 其他节点/换数据)；Expand→全屏 modal 网络图；3 条 incident 点击→incident modal(带 View trace 跳 tr_84921)；View all→#/incidents；Cost 30 days 下拉(7/30/90)条形宽度动画+hover tooltip；Welcome 卡 3 个快捷键→填入输入框；输入框可打字(0/300 计数)、send/Enter→AI 回复气泡(打字机效果，文案从 data 池取)；Attach/Create/mic→toast。
- **traces**：搜索实时过滤(id/workflow/status)+⌘K 聚焦+Esc 清空；5 个 chip × 可删→计数联动；+ Add filter 下拉(5 类，加了生成对应 chip，重复禁选)；行 hover 高亮，点击→#/trace/id；Export→真下载 CSV(blob)；Saved views 下拉(3 个预设，套用换 chips)；Rows per page 下拉 12/24/48；Live 开时每 6s 头部滑入一条新 trace(计 folk 入 42+，freeze 时不加)；空态文案。
- **trace detail**：面包屑回 traces；5 个 tab 全实内容：Waterfall(默认)/Timeline(垂直时刻列表)/Context(context flow 大图)/Metadata(kv 表)/Raw JSON(格式化高亮)；span hover 亮、点击→右栏 invocation 详情切换(每个 span 有数据，ghost span 点开显示 not executed 态)；失败 callout；Create incident→modal 表单(预填)→确定后 incidents+1+toast；Open Handoff Inspector→#/trace/id/handoff；Inspect handoff 同；View raw JSON→Raw JSON tab。
- **handoff**：Back to trace/View root cause(回详情且右栏定位 Billing)；context 行 hover；行点击展开样例值；Create fix→modal(diff 预览)→Apply→推荐框变 "Fix proposed ✓" 绿态+toast；Dismiss recommendation→框收起+toast 带 Undo；recent 3 行点击→对应 trace 详情；4 of 5 徽章、payload 条动画。

## 9. 代理自检协议（每轮必做，≤3 轮）

```bash
cd 项目根 && python3 build.py          # 字节数+断言过
node tools/shot.js "dist/index.html#/xxx" /tmp/shot_x.png 1600 1200   # 无网络依赖,内部起 http
```
然后 **Read 截图自查**（对照对应 ref 裁片：布局/间距/颜色/字号/缺图标/NaN/[object Object]）。JS 必须 `node --check` 过。交互自检：shot.js 支持 `--click "选择器"`（可多次）后再截图。

## 10. 完工报告格式

`改动文件清单 / 自检截图路径与结论 / 需要主线补的共享依赖(或"无") / 未覆盖的交互(或"无")`。

## 11. 主线负责（勿动他人模块）

contract/shell/build/styles/icons/data/core + 集成/E2E/judge/交付。子代理只交付自己两个文件。
