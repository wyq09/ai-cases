# 有庇 · 闽南掷筊

在线访问：https://case.youyongai.com/minnan-jiaobei/dist/

Three.js 民俗互动页面，支持桌面和手机。先用 Blender 5.2 建模，再导出 GLB 供页面实际加载。

## 启动与交付

```sh
cd minnan-jiaobei
npm ci
npm run dev -- --port 5178
npm run build
```

开发地址 `http://localhost:5178/`；同一局域网的手机使用启动日志中的 Network 地址。公网部署时将 `dist/` 内容放入 HTTPS 静态网站目录。生产包使用相对资源路径，可部署在任意子目录。手机系统分享取决于浏览器的 Web Share 文件支持及 HTTPS；始终提供下载图片与长按保存的备用方式。

## 功能

- 参考红木筊杯形态的半月模型、平面与凸面、红漆木纹、环境光与落地阴影。
- 点击后先举筊过眉，再松手抛下：重力驱动的抛起、翻转、碰撞和自然弹跳、可选木质碰撞音效。长按蓄力抛得更高、翻得更多。
- 单次圣筊 / 笑筊 / 阴筊结果，含传统解释。
- 上方投掷按钮与大面积筊杯场景同屏，场景本身也可点击投掷；结果叠在盘面，侧边心愿按钮打开输入弹窗。
- 心事输入、快捷心愿、本机最近 20 条筊记。
- 1080 × 1440 PNG 分享图，包含当前实际 3D 画面、结果、心事与时间。
- 原生文件分享、PNG 下载、移动端长按保存。
- 键盘操作、减少动态效果偏好、模型加载失败和 WebGL 不可用提示。

## 模型

- `assets/jiaobei.blend`：可编辑的 Blender 源文件。
- `assets/jiaobei.glb`：页面通过 GLTFLoader 加载的模型，导出后再经 gltf-transform 量化（KHR_mesh_quantization，位置 14 位、法线 10 位、顶点色 8 位，280 KB → 186 KB，无需额外解码器）。重新导出后请重跑：
  `npx @gltf-transform/cli quantize assets/jiaobei.glb assets/jiaobei.glb`
- `scripts/create_jiaobei.py`：可复现建模与导出脚本，5626 顶点、5624 面；平底、弧面、封闭边缘及顶点木纹色。

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/create_jiaobei.py
```

## 规则和模拟边界

朝上的两面一平一凸为圣筊，两平为笑筊，两凸为阴筊。各地仪式次数不一，本页不强制连续三次。

使用 `cannon-es` 刚体引擎。1 个画面单位对应 0.06 米，重力为 9.81 m/s²，固定物理步长 1/120 秒；自由飞行阶段没有线性阻尼，碰地后由接触摩擦、恢复系数和角阻尼消耗能量。掷杯分两段：先把筊杯举到约 0.24–0.32 米高处（蓄力越高举得越高），随后释放，竖直初速 0.95–1.8 m/s 并带随机翻转让其自然落盘。随机量只用于起手姿态、线速度和角速度，结果不预设。物理出现异常姿态（NaN 或求解失败）时会把筊杯复位并以“未定”计，不中断页面。

`physics.js` 用与 Blender 模型相同的曲面公式生成单个凸包碰撞体，合并共面的底部三角形，避免重叠接触面导致抖动；浅内弧用凸包近似。地面使用稳定的平面碰撞，盘沿有对应的实体围挡。接触地面后增加滚动阻力，低速休眠或持续 0.6 秒姿态稳定后，读取真实四元数变换后的面法向进行判读。侧立、相倚或 12 秒仍未稳时显示“未定”，不强制翻面。

这是近似几何、均匀木材质量和经验接触参数的刚体模拟，不承诺真实器物的结果分布。

规则来源：
- [三凤宫：掷筊程序](https://www.sunfong.org.tw/?act=menuinfo&ml_id=20220720011)
- [国家文化记忆库：筊杯](https://tcmb.culture.tw/zh-tw/detail?id=17120007177&indexCode=MOCCOLLECTIONS)

Three.js 官方参考：[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)。

## 数据

心事不上传服务器。完成的筊记只保存 `kind/wish/date` 到 `localStorage`，生成分享图片时才把对应心事画进图片。Google Fonts 改为非阻塞加载（`preconnect` + 异步样式表），不可用时自动使用系统宋体后备字体，首屏不被字体请求阻塞。场景按需渲染：仅投掷、举杯、窗口尺寸变化时重绘，静止时不消耗 GPU。部署服务器需对 `application/javascript` 与 `model/gltf-binary` 开启 gzip（本站已在 nginx `conf.d/gzip.conf` 配置）。

## 本次验证

- `npm run build` 成功。
- `npm test`：十项全部通过——自由落体轨迹与速度、30/60 Hz 固定步长一致性、三种朝向及侧立判读、六组种子投掷碰撞与稳定性、休眠后不再抖动、极端姿态镜头边界、100 次逐步轮廓边界/间距检查、故障姿态纠正、staged 杯静止到释放、NaN 姿态恢复为“未定”。
- Playwright 检查移动 390×844 与桌面 1440×900：举杯→抛出→落定→判读全流程正常，蓄力投掷可达更高顶点，投掷后 scrollY 保持 0。
- 静止时画布不再重绘（连续帧像素一致），控制台无错误；筊记只存 `kind/wish/date`。
- 线上 JS 经 gzip 后 690 KB → 183 KB，GLB 280 KB → 142 KB（新包 GLB 量化后再压缩约 110 KB）。

## 防叠杯与防出盘

`landing-guard.js` 使用与 Blender 相同的 96×28 采样密度检查完整轮廓（包含凸面），在每个物理步把两枚筊杯约束在盘内的左右独立落地区。起手间距加大，横向速度与偏航减小。必要时只纠正水平位置与绕竖直轴的方位，不修改竖直自由落体或平/凸面朝向。这是为可玩性增加的落点保护，不是完全无约束的真实掷杯。

预览生产包可运行 `npm exec vite preview -- --host 0.0.0.0 --port 5180`。

模型根据新参考图重制：浅内弧、宽实外轮廓、圆钝尖端、较厚弧面与低对比深红木纹；保留 Blender 源文件。
