# ai-cases 项目约定

## UI 自动化测试（强制）

- H5 / 网页 / 游戏的 UI 回归测试：一律使用 ego-lite 浏览器技能（ego-browser，先运行 `ego-browser skill` 获取用法），禁止使用 Playwright。
- ego-lite 页面管理：整个任务只用一个 TaskSpace，复用 `p1` 用 `goto()` 换页，不要每轮 `newPage()`；任务结束/脚本结束时只关掉自己额外开的页面，保留 `p1` 这个常驻测试台给下一轮用。临时探针脚本也必须收尾，否则渲染进程会堆积到把内存吃满（截图/CDP 会超时）。
- 需要直接操作电脑（点击、键盘、本机应用、截屏）时：使用 Kimi CU 或 LCU。
- API / 逻辑层回归：普通 node 测试脚本（如 `test/run.mjs` 模式）。

## 项目结构惯例

- 一个目录一个案例；纯静态案例用 `build.py` 把 `src/*` 打成单文件 `index.html`，零外部资源。
- 带后端的案例（如 math-race）自带零依赖 Node 服务进程，独立端口、独立部署，不进静态站托管。
- 每个案例的 README 里写清：玩法、技术要点、测试情况（多少项回归、是否全绿）、在线链接。
- 新案例要在根 README.md 的 Cases 列表顶部加索引条目。
