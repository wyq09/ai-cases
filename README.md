# AI Cases

AI 辅助产出的案例集合 —— 方案 · 演示 · 视觉作品。

**在线访问**: <https://case.youyongai.com>

## Cases

- [mouse-parkour](./mouse-parkour/) — 鼠族跑酷 · MOUSE RUSH · 横版 2D 无限关卡跑酷 H5：戴橙红围巾、背奶酪背包的灰色小老鼠穿越厨房/仓库/雨林/熔岩/冰原/虚空六大场景（每 5 关一换，26 关后循环，难度线性上升），关卡程序化生成且同种子完全可复现、**硬约束保证可通关**（断崖 ≤175、台阶抬升 ≤100、平台间距 ≤300、终点前 220px 无伤害机关）；**36 种物件**（25 种拾取物：奶酪/金币/钻石/四叶草/磁铁/猫薄荷/跑鞋/泡泡糖二段跳/火焰尾迹/巨化/缩小/羽毛/护盾泡泡/无敌星/时停沙漏/能量核心/生命果/钻头/弹力靴/复活铃铛/冰冻水晶/电磁脉冲/双倍金币/重力翻转/火箭筒 + 11 种危险物：巡逻猫/尖刺/坠坑/落石/电栅栏/酸液池/摆锤/激光/风车刀片/飞行器/压机）与 4 种敌人（巡逻猫/飞行器/追踪蜂/炮台）；**六套积分系统并存**（主积分=距离+拾取+风格+击杀+过关奖励 / 金币 / 奶酪 / 风格分 D→C→B→A→S→SS 含 8 种风格动作 / 连击倍率最高 ×4 / 能量槽满可放必杀「鼠王冲刺」清屏）+ 1~3 星关卡评级与无伤通关徽章；手感打磨到顶（coyote time 0.10s + 跳跃缓冲 0.12s + 可变跳跃高度 + 冲刺残影/火焰尾迹 + 滑铲压低身形过矮道 + 踩敌弹起 + 极限落地硬直）；**打击感**全套（hitstop 冻结帧 25~90ms、trauma² 震屏、受击闪白、伤害数字、连击弹窗、死亡 0.35x 慢动作、必杀 0.5x 慢动作、相机 zoom punch、高速速度线、低命红晕、navigator.vibrate）；**横竖屏双适配 + 手动切换横屏**（自动/强制竖屏/强制横屏三档，优先 requestFullscreen + screen.orientation.lock，失败降级 CSS rotate(90°) 交换宽高，URL 参数 ?orient=land|port），移动端**动态虚拟摇杆**（按下处即原点）+ 跳/冲/滑三键；**手机端专项优化**（摇杆底座归位到左下角拇指落点不再压角色 + 横屏 HUD 进度条限宽 200px + 竖屏仅 1 秒视野 vs 横屏 3 秒的转屏引导卡 + 触屏设备菜单只显示触屏说明 + `?touch=1/0` 强制开关触摸 UI）；镜头**硬约束**跟随（角色恒在视口 35%~55%，竖屏窄视野冲刺也不出画；修掉了 translate/scale 顺序写反导致的整幅画面错位，验收落到像素级）+ **五档全局速度**（0.5×~1.5×，即时生效）+ 道具密度收敛（单关 ≤40 个、最小间距 ≥80 单位、平均 ≥0.6 秒一个）；全程序化美术（小老鼠实时程序化绘制 9 种姿态 + 4 腿步态 + 耳朵围巾飘动，36 件道具/危险物程序化精灵，6 群系三层视差背景）、WebAudio 27 音效 + 5 轨 BGM 全合成、Canvas 粒子池 520 上限零 shadowBlur，单文件 325KB 零外部资源；契约驱动多子代理并行开发（art/audio/fx/logic/ui 五模块 + 主线 game，NOOP Proxy 兜底）；node 56 项断言 + ego-lite 132 项 UI 回归（含手机端专项 23 项）（竖屏 390×844 / 横屏 844×390 / 触屏 / 25 道具逐个拾取 / 结算 / Game Over / 镜头安全带 / 道具密度 / 五档速度）全绿零报错（[在线游玩](https://case.youyongai.com/mouse-parkour/)）

- [math-race](./math-race/) — 口算竞速场 · 小学生分年级数学竞赛：同房间同倒计时、各做各的题——手机答题 + 教室大屏实时赛道直播。一~四年级按人教版进度分龄出题（10/20 以内加减 → 表内乘除 → 万以内加减与两位数乘法 → 三位数乘法与含括号混合），题量按年级配平（15/12/10/8），答案恒为非负整数配纯数字键盘；出题是纯函数 `genQuestion(grade, seed)`，答案永不下发客户端，断线重连不丢题、同房间各人题目互异；8 位房间号 + 二维码扫码加入、大厅可切跑道/龙舟主题与 2/3/5 分钟赛制、房主踢人与一键再来一局；结算含领奖台、名次表与个人错题回顾。零依赖 Node 单进程（`node:http` + SSE 实时推送、失败降级轮询、`node:sqlite` 持久化、重启恢复房间），前端单文件 110KB 零外部资源，服务端时间校准倒计时；node 48099 项断言回归全绿 + ego-lite 三端联动全流程验收（[在线开赛](https://case.youyongai.com/math-race/)）

- [bubble-arcade](./bubble-arcade/) — 泡泡堂 · BUBBLE ARCADE · 经典《泡泡堂 / Crazy Arcade》H5 复刻（PC 键盘 + 手机触屏）：15×13 棋盘放泡对战，2.4s 引信十字水柱、链式引爆、炸箱掉道具、困泡 3.6s 自救（狂按方向键约 11 下）与队友贴身救援、踢靴滑行撞人困泡、护盾抵挡；混战 2/3/4 人与 2v2 组队、先到 N 胜、超时死亡模式随机落泡、5 张对称地图、**AI v2 会算账机器人**（时间感知危险图含链式引爆 + 时间约束逃生寻路 + 连通区域分析 + 预判型放泡/走廊封路/迎面堵人 + 确定性随机可重放；自炸致死 69%→**0%**、平均存活 10.6s→**57.9s**）、**手机端专项优化**（文字 UI 搬出被缩放的棋盘层，标题 6px→**44px**、玩家名 4.6px→**11px**；摇杆死区 12→8px + 快速划动立刻换向 + 常驻底座 + 剩余泡数角标；脚下引信倒计时环与可逃方向箭头；振动反馈；竖屏棋盘顶到上方并给横屏引导）、本地双人（WASD+Space / 方向键+Enter）、手机触屏（动态虚拟摇杆按下处即原点 + 4 向吸附轴间迟滞防抖 + 右下放泡键 + 被困摇杆变向计入自救，竖横屏控制区避让 + 安全区适配）；全程序化美术（5 套主题 × 4 角色 × 4 朝向 × 4 帧 + 困泡 + 5 道具 + 8 帧泡泡）、WebAudio 21 音效 + 8bit BGM、对象池粒子与震屏、120Hz 固定步长 + 自由移动物理、战绩持久化，单文件 243KB 零外部资源，ego-lite 逻辑 33 项 + 触屏 25 项 + 手机端 26 项回归全绿 + 全 AI 对局仿真器量化调参（[在线游玩](https://case.youyongai.com/bubble-arcade/)）
- [qq-speed-3d](./qq-speed-3d/) — QQ飞车 · 极速海岸 3D · Three.js 卡丁车竞速致敬作：7 条主题赛道（海岸/峡谷/霓虹/雪原/雨林/火山/云端）+ 程序化无限赛道（每阶段换主题、前 4 名晋级），逐关解锁 + 三星 + 每关最佳成绩；漂移三段蓄力（青→紫→橙火花）、松手喷 + 双喷、三格氮气、加速带、完美起步；5 种道具（氮气引擎/**追踪导弹自动锁第一名**/燃油地雷/能量护盾/电磁风暴）+ 问号箱 + AI 布雷 + 受击打滑；**低/中/高三档难度**（同时调 AI 速度、极速上限、充能、金币倍率与星级门槛）+ **五部件三级改装工坊**（引擎/涡轮/轮胎/尾翼/涂装，性能与尾翼·排气·轮圈·车底霓虹一起变，金币购买并持久化）；全程序化资产（主题天空/地形/植被/城市/天气，程序化卡丁车/粒子/音效），WebAudio 全合成引擎与 128BPM BGM，触屏双指漂移 + 手机/横屏/桌面三套 HUD；无限赛道阶段结算与最佳阶段存档，ego-lite 四套验收（含难度改装 20 项）全绿（[在线开跑](https://case.youyongai.com/qq-speed-3d/)）

- [fluffy-fox](./fluffy-fox/) — 毛茸茸小狐 · 3D · Three.js 程序化建模 + 壳层毛发（shell texturing）自然态小狐（无帽无衣，由南瓜狐狸换装而来）：全身 13 部位覆盖壳层毛发——躯干奶油肚皮顶点色渐变、腮毛耳内绒、双臂毛、16 层壳大尾巴（橙→奶白分界沿环向波浪起伏），头顶三撮炸毛 + 张嘴吐舌 + 腮红大眼；每毛随机参差长度羽化轮廓 + 毛根伪 AO + 毛尖 rim 光，风摆/重力全在顶点端；待机呼吸摇尾抖耳眨眼 + 点击弹跳惊喜，毛发长度（面部位上限防埋脸）/密度/风力/风速/画质三档全参数可调并持久化；手机优先底部抽屉面板，几何/软阴影/枫叶全运行时生成零资源，three r170 本地化离线可用，Playwright 双视口零报错 + 真 GPU 121fps 实测（[在线把玩](https://case.youyongai.com/fluffy-fox/)）

- [zombie-defense](./zombie-defense/) — 僵尸防线 · 孤哨重制 · 「僵尸防线·至尊版」H5 复刻：拖动哨兵守防线打僵尸潮，升级三选一 roguelike 14 技能（多弹道/穿透/爆破/冰冻/燃烧/无人机/激光/雷链/弹幕/处决），每 5 波 Boss 远程压制备必掉钻，局外金币永久养成 4 项×20 级 + 钻石宝箱抽 6 种宝石三品质叠加 + 模拟充值 VIP（0 元真实扣费），×1/×2/×3 倍速、暂停结算不白打；视觉全面重制「末日孤哨」军事风（夜空月亮双层废墟剪影/四型僵尸步态动画/军琥珀 DOM UI/全 SVG 图标），全程序化 WebAudio 22 音效+双场景 BGM，手机/横屏/桌面三视口自适应，单文件 120KB 零外部资源离线可玩，账目不变式与 90 秒浸泡实测全绿零报错（[在线游玩](https://case.youyongai.com/zombie-defense/)）

- [member-ops-dashboard](./member-ops-dashboard/) — 会员运营 · 数字化驱动增长 · WebGL 3D 实时粒子可视化数据大屏（PC 宽屏大屏版 + 移动端 H5 版单文件双端自适应）：加载时按 UA + 视口宽度判定设备，手机访问自动呈现 H5 版（粘性毛玻璃导航 + 锚点胶囊 / 2×2 核心指标卡 / 750×790 触控视差 3D 漏斗 / 6 级策略卡片点击联动高亮 / 底部悬浮控制条），宽屏 PC 自动呈现 1920×1080 1:1 大屏版，跨断点旋转/缩放窗口自动重载切换；大屏版五层渲染管线（科技玻璃面板底框 / WebGL 着色器 3D 六层漏斗 + 底座能量场 + 2200 GPU 点精灵粒子 / Canvas 2D 52 条金色贝塞尔流光曲线 + 彗星粒子 + 漏斗涡旋 + 声波频谱 + 六维雷达图 / SVG 矢量四层金字塔·引出线·营销折线 / HUD 高清文字层），小屏 PC 视图引擎（智能满屏消除黑边 / 适宽滚动看细节 / 16:9 等比 / Ctrl+滚轮缩放 + 拖拽漫游 + 全屏，≤1600px 自动增强次级文字对比度），八大板块（会员规模概览·数据中台·价值评估模型·获客漏斗 6 级引出·分层运营金字塔·营销效果分析·权益体系·全生命周期），鼠标视差 + 漏斗层级悬浮/点击脉冲联动，粒子流速 0.5x/1.0x/1.8x + 能量脉冲，两套渲染引擎按端守卫互不启动，单文件 ~180KB 零外部资源，四组视口（1600×900 / 1366×768 / 390×844 / iPhone UA）实测全绿零报错（[在线预览](https://case.youyongai.com/member-ops-dashboard/)）

- [chengyu-cross](./chengyu-cross/) — 填成语 · 十字填字 · 微信小游戏复刻：深紫底十字成语填字（点空格选橙框、点候选字，填对变绿且光标自动顺延到当前成语下一空位、本成语填完流转到交叉下一条，累计填对触发里程碑金币奖励链，填错抖动扣剩余次数，耗尽可花金币补或重开），无限关卡种子确定性自动出题（每关词数/增长节奏/预给字比例/网格跨度/剩余次数全部可设置），自定义成语导入 + 可行性分析三步引擎（合法性校验→共字并查集孤立词识别→交叉摆放求解，报告✓可行子集附谜面预览/⚠位置冲突/✗孤立词/✗非法词，一键采用可行子集开玩或仅存词库，换摆法加盐可复现），2076 条常用成语词库 + 1068 字频序表（高频字交叉出题率），提示/跳关/过关弹窗列本关成语，出题引擎带独立 validateGrid 复核（粘连/贴边/连通性），全程序化 WebAudio 中国风音效 + BGM，进度/金币/配置/词库分 key 持久化，大网格可拖拽/滚轮平移+选中格自动滚入可视区，候选字随数量自适应缩小且候选区限高，手机/iPad/桌面自适应（iPad 舞台 640px 加宽），竖屏上下/横屏左右布局，单文件 153KB 零外部资源离线可玩，node 35 项 + Playwright 真实 UI 75 项回归全绿零报错（[在线游玩](https://case.youyongai.com/chengyu-cross/)）

- [exit-zero](./exit-zero/) — EXIT 0 · 一个进程的一生 · 全程序化生成音乐短片播放器：音乐 WebAudio 离线合成（96 BPM·110s，10 声部事件表即乐谱即数据，节拍/起音与音频同源）+ 画面 WebGL2 七章节着色器逐帧渲染（点阵十六进制内存转储 / 星座连边 / 步进指令环与伪 3D 轨道环 / 扫波示波器与李萨如 / 异常走廊与栈帧轨道 / 内存块回收 / 余辉终端光标定格） · 机制致敬 FrostNova《world.execute (me) ;》网页版并完整复刻其四套核心系统——①乐谱事件烘焙 60fps 特征 Float32Array（对应 features.f32）②剪辑表以拍号 B()/起音 HIT() 锚点声明、解析时自校验（对应 edit/table.js）③奇数子帧累积运动模糊实时封顶 3 帧（对应 engine.js subframes）④帧耗时 EMA 对预算的 4 档画质爬升降档（对应 player/quality.js） · 着色器预热进度 · 确定性渲染同一时刻同一帧可跳转复现 · 中文字幕轨可开关 · 光敏提醒 · 单文件零外部资源（[在线体验](https://case.youyongai.com/exit-zero/)）

- [alice-promo](./alice-promo/) — 白艾莉 · Alice 产品宣传视频：为 [alice.miyang.cn](https://alice.miyang.cn/)（米羊科技拟人化 AI 助理）制作的 54 秒成片（1920×1080·30fps·中文旁白+70BPM 暖钢琴垫乐），按 apple-motion-guide「Premium Motion Design Guide」执行——一个清晰观念（你负责做决定，执行交给她）、三色克制视觉系统（纸白/墨/茜玫，宋体衬线标题，恒定暖纸底+细纸纹）、六镜头静帧先行（品牌定场→口号→Agent 接力办成一件事→圆桌脑暴→24 引擎点阵→水彩主视觉收尾）、动效全部为时间轴纯函数逐帧确定性渲染（ego-browser 逐帧 seek 截图 1620 帧 + ffmpeg 装配，旁白按镜落位 -16 LUFS，BGM Mixkit 免费商用），judge 六镜验收+复验全过（[成片](./alice-promo/delivery/Alice_Promo_1080p.mp4)）

- [park-radar](./park-radar/) — 公园雷达 · 小屿 · 动物森友会风格公园发现 H5：列表/详情/我的（收藏·点赞·足迹）+ 智能助手「小屿」——本地规则 NLU 完全离线可用（条件检索「免费又好玩能野餐」/公园别名直查/上下文指代「第一个怎么样」「换一批」/收藏足迹问答/闲聊与雨天兜底，结果附推荐理由卡片+跟进 chips，可选接任意 OpenAI 兼容 LLM 且失败自动回退），12 座虚构公园全程序化 CSS 场景画（樱花飘落/萤火闪烁/湖光潋滟/篝火/摩天轮，零图片资源），雷达扫描横幅签名细节，视觉按 animal-island-ui 规格复刻（暖羊皮纸底+薄荷青+仅主按钮 3D 像素堆叠阴影+燕尾丝带+SVG blob 弹窗+黄色焦点），动效移植 Rare UI（GLSL fbm 流体球/粒子爆发/数字滚轮/gooey 粘滞导航），77 枚 naive-icons 内联，hash 路由深链+详情聊天堆叠互盖+localStorage 持久化+桌面自动手机相框，单文件双击即用（React/Babel 走 CDN，首次加载需联网），Playwright 49 项功能回归+视觉几何验收全过零报错（[在线体验](https://case.youyongai.com/park-radar/)）

- [park-radar-lumen](./park-radar-lumen/) — 公园雷达 · Lumen · 秋日公园查询 H5：58 座公园 / 10 个城区的列表·详情·我的（收藏/点赞/足迹）四页应用，动效层按 Rare UI 机制用原生 CSS/SVG/WAAPI 重写（gooey 流体底部导航、点赞收藏粒子迸发、里程表数字滚动、卡片网格揭示、流体球头像、弹簧平滑滚动进度、指针邻近响应、左滑删除），视觉按 animal-island-ui 规格复刻（暖羊皮纸底 + 薄荷青 + 只给主按钮的 3D 像素堆叠阴影 + 燕尾绶带标题 + SVG 水滴 blob 弹窗），内联 125 个 naive-icons 字形；智能助手「小岛」为本地确定性语义解析（标签/类型/城区/设施/价格/距离/评分/开放时间/季节/人流→槽位），严格匹配优先、放宽必披露、推荐附可核对理由，可另接任意 OpenAI 兼容接口且失败自动回退；全部公园插画/地图/雷达图程序化生成，单文件零外部资源（[在线体验](https://case.youyongai.com/park-radar-lumen/)）

- [retro-moto-racer](./retro-moto-racer/) — SUNSET RIDE · 日落摩托 · OutRun/Hang-On 血统复古像素摩托竞速：伪 3D segment 投影公路（双黄线/红白路缘/红岩平顶山视差）、12 人排名、检查点计时延长、氮气涡轮 280→322km/h、RIDER/BIKE 双状态条、三关卡日落→暮色→夜路换色、弯道离心力与路肩沙地物理、AI 梯队车手礼让避让+橡皮筋、托管车手模拟器校准难度、13 色×5 倾斜像素摩托/位图字体/三套视差背景全程序化、WebAudio 引擎声+3 轨芯片 BGM、CRT 扫描线、拖拽转向+氮气刹车大按钮、配置面板与战绩持久化，单文件零外部资源（[在线游玩](https://case.youyongai.com/retro-moto-racer/)）

- [sheep-a-sheep](./sheep-a-sheep/) — 羊了个羊 · 三消羊圈 · 经典三消 tile 层叠游戏复刻：点击无遮挡牌入槽三同消除、移出/撤销/洗牌三道具与复活、无限关卡种子生成经「贪心+预算回溯」求解器验证保证可解、同一求解器驱动 AI 演示自动通关、难度模拟器校准爬升曲线（每 5 关喘息）、17 项难度参数滑杆 + 14 种牌面图标/背景/音效逐个上传替换 + 配置导出导入、Canvas 层叠遮挡与飞牌消除演出、WebAudio 马林巴田园 BGM，单文件零外部资源（[在线游玩](https://case.youyongai.com/sheep-a-sheep/)）

- [tower-crane](./tower-crane/) — 盖楼达人 · 经典盖楼小游戏复刻：吊机摆动点按松钩落块、完美吸附居中连击加成、偏出即坠损命、每 10 层里程碑加命、40 层达标转无尽、难度曲线经时机误差模拟器调参、房间块配色与贴图/背景/吊钩上传替换、11 条音效逐条自定义、25 项玩法参数面板、配置导出导入、进度存档刷新续玩，单文件零外部资源（[在线游玩](https://case.youyongai.com/tower-crane/)）

- [pelican-bike](./pelican-bike/) — 鹈鹕骑自行车 · 海堤傍晚的动态插画：鹈鹕踩着城市自行车，喉囊里一条鱼，按住加速、空格按铃，单文件零外部资源（[在线观看](https://case.youyongai.com/pelican-bike/)）

- [water-sort](./water-sort/) — 倒水挑战 · Water Sort Puzzle 经典倒水排序益智复刻：无限关卡（种子确定性生成 + DFS 求解器验证必可解）、同一求解器驱动提示与 AI 自动演示、Canvas 倒水液流演出与 SVG 玻璃瓶裁剪、三猪观战动画、星级与每关最佳步数、三套房间/水色板与逐条音效上传替换、配置导出导入，单文件零外部资源（[在线游玩](https://case.youyongai.com/water-sort/)）

- [gravity-pinball](./gravity-pinball/) — 重力弹球王 · 微信小游戏 1:1 复刻：拖动瞄准把全部库存球成串射入封闭球场、球停自动回收顶部等下一轮、撞数字 bumper 递减归零爆炸得分、清场过关无限关卡、点按冲击波弹球、球送进漩涡 +3 球回收、加球经济、炸弹与沙漏道具、菱形 ×2 大白球 ×3 倍率、自研 2D 物理（线段/圆/菱形 OBB/弧形地板/180Hz 子步）、关卡种子生成、WebAudio 程序化音效、图标上传与玩法参数配置面板、进度持久化，单文件零外部资源（[在线游玩](https://case.youyongai.com/gravity-pinball/)）

- [tomato-timer](./tomato-timer/) — 番茄时钟 · 专注：番茄工作法倒计时复刻，专注/休息循环、跳过重置、时长切换、当日番茄统计，四种 WebAudio 合成铃声 + 本地音频上传自定义（IndexedDB 存储），后台计时校准，手机竖屏/横屏/桌面自适应，单文件零外部资源（[在线体验](https://case.youyongai.com/tomato-timer/)）

- [thunder-fighter](./thunder-fighter/) — 雷霆战机 · 银河防线 · 经典竖版飞行射击复刻：6 级战机升星与僚机挂架、无限关卡递进、6 大 Boss 三阶段弹幕、火力/炸弹/护盾道具、血条生命与币复活、连击擦弹计分与本地排行、hitstop/震屏/慢动作打击感、WebAudio 24 音效 + 3 轨 BGM、AI 演示可挂机，单文件零外部资源（[在线游玩](https://case.youyongai.com/thunder-fighter/)）

- [bull-flight](./bull-flight/) — 小飞牛炒股大冒险 · "炒股版 Flappy Bird"复刻：小飞牛在 K 线图里飞行、点屏冲高、撞买/卖按钮建仓平仓（半仓滚动/税费/借款还贷）、躲挡板+±10% 涨跌停强制平仓、收盘战报（收益率/最大回撤/称号评定/收益走势图）、本金跨局滚动、牛立绘音效玩法参数可自定义+配置导出导入、AI 自动演示、WebAudio 音效，单文件零外部资源（[在线游玩](https://case.youyongai.com/bull-flight/)）

- [whack-mole](./whack-mole/) — 欢乐打地鼠 · 经典街机打地鼠 × 营销活动 H5：3×3 洞阵三档难度、连击翻倍、礼盒鼠触发狂热时刻（双倍得分金鼠出没）、金银铜牌评级领对应奖品与演示券码、每日次数限制、`WM.marketing.register()` 平台一行接入（文案/奖品/券码前缀/结算领奖分享钩子）、地鼠立绘音效玩法参数营销文案游戏内可自定义+配置导出导入、AI 自动演示、WebAudio 音效、390 竖屏/横屏/桌面自适应，单文件零外部资源（[在线游玩](https://case.youyongai.com/whack-mole/)）

- [memory-flip](./memory-flip/) — 翻牌赢好礼 · 经典营销活动记忆翻牌 H5 复刻：三档难度、开局记忆预览、连击翻倍计分、限时挑战、星级结算、领奖券码与分享战绩，卡面/音效/玩法参数游戏内可自定义，单文件零外部资源（[在线游玩](https://case.youyongai.com/memory-flip/)）

- [pipe-connect](./pipe-connect/) — 接水管 · 经典微信管道连通益智 H5 复刻：点击旋转限时接通、保证可解的棋盘生成、水流逐格灌充演出、关卡递进与计分持久化、AI 自动演示、三套色板与音效自定义，单文件零外部资源（[在线游玩](https://case.youyongai.com/pipe-connect/)）

- [zuma-infinite](./zuma-infinite/) — 祖玛 · 无尽遗迹：无限关卡、同色三球消除与回吸连锁、横竖屏适配、免费道具、程序化音效和本地进度保存；参考画面尚未完成一比一视觉核验。

- [jump-jump](./jump-jump/) — 跳一跳 · 非官方 H5 复刻：按住蓄力、连续中心奖励、六类平台、自动演示、WebAudio 音效与本地进度保存（[在线游玩](https://case.youyongai.com/jump-jump/)）

- [defi-prototypes](./defi-prototypes/) — DeFi 原型馆 · 8 套金融 App 概念设计稿组成一个完整可操作的 H5 App：主屏 8 个应用图标、App 内按钮/返回键/底部 tab/左缘右滑真实导航、Home 条回主屏，21 屏行情兑换/转账键盘/统计图表/卡片开关全可点，玻璃泡泡可点爆，单文件（[在线体验](https://case.youyongai.com/defi-prototypes/)）

- [orchestrateiq-dashboard](./orchestrateiq-dashboard/) — OrchestrateIQ · AI Agent 编排平台监控后台复刻：8 秒录屏 → 全按钮可点的 SaaS dashboard，Overview/Traces/Trace 瀑布/Handoff 断链诊断四屏像素级还原，明暗双主题、⌘K 命令面板、实时直播流、真 CSV 导出（[在线预览](https://case.youyongai.com/orchestrateiq-dashboard/)）

- [slide-puzzle](./slide-puzzle/) — 数字华容道 · 木质滑块拼图复刻：3×3~6×6、加权 A* 提示与长按自动演示、照片拼图模式、WebAudio 合成音效与落叶粒子、纪录刷新不丢（[在线游玩](https://case.youyongai.com/slide-puzzle/)）

- [duofu-777](./duofu-777/) — 多福巨奖 · 澳门赌场 243 路老虎机复刻：四大递增奖池、福娃选奖、免费局、福 WILD 与金身押注档，WebAudio 合成 21 种音效、全 SVG 程序化资产、图标音效玩法全开放配置、积分刷新不丢（[在线游玩](https://case.youyongai.com/duofu-777/)）

- [xiangan-airport-film](./xiangan-airport-film/) — 向海而翔 · 厦门翔安国际机场：45 秒 Blender 三维与实景宣传片，1080p、24fps、原创配乐（[在线播放](https://case.youyongai.com/xiangan-airport-film/)）

- [hecheng-haowu](./hecheng-haowu/) — 合成好物 · 微信小游戏 1:1 复刻：拖拽合成升级、配送员生成商品、X5 一键合成，任务得体力与补分签到全闭环，44 个手绘 SVG 图标（[在线游玩](https://case.youyongai.com/hecheng-haowu/)）

- [skynomad-n90](./skynomad-n90/) — SKYNOMAD N90 · 3D 全场景配置器：Blender 程序化建模 SUV，实时切换天气/季节/环境/车漆/时刻，模型压缩至 102 KB，移动端可用（[在线预览](https://case.youyongai.com/skynomad-n90/)）

- [tibet-wild](./tibet-wild) — 荒原之上 · 藏南秘境 × 藏北无人区 私人自驾远征，23 页横向翻页 PPT（[在线预览](https://case.youyongai.com/tibet-wild/ppt/)）
- [watch-customizer](./watch-customizer) — ATELIER · 3D 腕表自定义工坊：拖拽旋转、PBR 材质实时预览、背带动画换装、本地时间实时扫秒、复杂功能悬停辉光、摄像头 AR 试戴（[在线预览](https://case.youyongai.com/watch-customizer/)）
- [prediction-market](./prediction-market) — 预测市场首页 1:1 复刻：黑白双主题、Canvas 点阵地球自转、像素马赛克背景与实时倒计时微动效（[在线预览](https://case.youyongai.com/prediction-market/)）
- [solcard-carousel](./solcard-carousel) — solcard 加密卡功能轮播：无限居中轮播、雪花冻结动效、数字滚动与辉光仪表盘（[在线预览](https://case.youyongai.com/solcard-carousel/)）
- [metalforge-editor](./metalforge-editor) — MetalForge 进度特效编辑器复刻：WebGPU/WGSL 蜂窝进度条，六种渲染风格实时切换、参数面板、自动播放与可分享状态链接（[在线预览](https://case.youyongai.com/metalforge-editor/)）
- [ra2-lab](./ra2-lab) — RA2 LAB · 红警蓝图兵器库：红警2 风格蓝图查看器 1:1 复刻，Three.js 线框载具建模、六视角正交相机、爆炸图与部件拾取（[在线预览](https://case.youyongai.com/ra2-lab/)）
- [living-grove](./living-grove) — 林间 · 走进活着的世界：程序化苔藓根茎活世界 Three.js 场景、液态金属色散按钮、玻璃坞导航与逐层揭幕入场（[在线预览](https://case.youyongai.com/living-grove/)）

## 本地运行

纯静态文件，无任何依赖：

```sh
git clone https://github.com/wyq09/ai-cases.git
cd ai-cases
npx serve .        # 或 python3 -m http.server
```

浏览器打开 `http://localhost:3000` 即为案例库首页。

## 新增案例

1. 新建 `<case-name>/` 目录，放入静态页面与资源
2. 在根 [`index.html`](./index.html) 案例库中登记入口
3. 推送到 `main`，自动发布上线
