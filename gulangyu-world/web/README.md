# 鼓浪屿 · 漫步（Web）

基于 `gulangyu-world` Blender 场景的 three.js 交互网页：操控一位草帽小人在 1:1 岛屿尺度
的鼓浪屿上漫游，探访八卦楼、日光岩、菽庄花园四十四桥、天主堂、龙头路六个地标。

**本地预览**：仓库根目录任意静态服务器，如 `python3 -m http.server`，
访问 `/gulangyu-world/web/`。线上地址：`https://case.youyongai.com/gulangyu-world/web/`。

## 操作

| 桌面 | 移动端 |
|---|---|
| `W A S D` / 方向键移动，`Shift` 疾走 | 左下虚拟摇杆移动，推满疾走 |
| 拖拽画面转视角，滚轮缩放 | 右侧滑动转视角，双指缩放 |
| 点击小地图 / 「地图」打开全岛地图，可传送到地标 | 同左 |

走近地标会弹出介绍卡片并计入打卡进度（localStorage 持久化，右上角「景点」可查看与传送）。

## 资产

`assets/` 由 `tools/extract.mjs` 从 `../delivery/game/` 的官方导出离线生成：

| 文件 | 来源 | 说明 |
|---|---|---|
| `env.glb` (27 MB) | `Gulangyu_Environment_LOD1.glb` (140 MB) | 剥离植被与核心区建筑后，经 gltf-transform 合并同材质网格、贴图转 WebP、meshopt 压缩（`--palette false`，palette 会破坏平铺 UV 的墙面材质） |
| `detail.glb` (15 MB) | `Gulangyu_Environment_LOD0.glb` (513 MB) | 龙头路核心街区 158 栋建筑 + 7 个地标的高模版本（实体门窗、遮阳棚、百叶窗），与 env 中同位置的低模互斥显示 |
| `trees.glb` (246 KB) | 同上 | 6 个榕树 LOD1 原型（树皮 + 双叶材质），运行时 InstancedMesh 实例化 |
| `instances.bin` (390 KB) | `vegetation_instances.json` | 12,494 个树实例（位置/旋转/缩放/原型），32 字节定长二进制 |
| `terrain.bin` (1.9 MB) | 环境网格烘焙 | 2 m 精度可行走高度场（Int16 厘米，-32768 = 阻挡），由全部"坡度 ≤ 63° 的面"取最大高度栅格化；建筑墙面形成阻挡，台阶、观景台、桥面、礁石天然可走；地面低于水位 -0.12 m 视为水域阻挡 |
| `meta.json` | — | 地标 POI（位置取自 `LM_*` 节点）、出生点、网格参数 |

所有 `B_*` 建筑按"脚印外围地形最低点"做**沉降**（≤8 m 全额落地，更深的悬崖建筑最多降 8 m），
消除源数据中约 20% 建筑的悬空缝隙。运行时按 320 m 网格分块实例化树，按相机距离剔除；
相机碰撞用同一高度场沿视线步进采样，落进建筑体内时逐级回缩。

## 复现资产

```bash
cd tools
npm install            # @gltf-transform/core + functions + extensions、meshoptimizer、playwright
node --max-old-space-size=8192 extract.mjs      # env_notrees/trees_raw/terrain/instances/meta
node --max-old-space-size=12288 extract_detail.mjs   # LOD0 高模 → detail_raw.glb（158 栋+地标）
npx @gltf-transform/cli optimize ../assets/env_notrees.glb ../assets/env.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --palette false
npx @gltf-transform/cli optimize ../assets/detail_raw.glb ../assets/detail.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 --palette false
node check_terrain.mjs                  # 高度场抽检 + 预览图
node verify.mjs                         # headless 桌面 + 移动端交互验证
```

注意：`extract.mjs` 烘焙高度场时从写盘后的 `env_notrees.glb` 重新读取，而非复用内存文档；
`tools/terrain_util.mjs` 的 ringGap/dropFor 是 env 与 detail 共用的建筑沉降算法，必须一致。

## 传输优化（无损）

几何已过 meshopt 熵编码，但 `brotli -q 11` 仍能再压一半（GLB 内多流间的重复模式）。
`assets/` 中的 `.gz` / `.br` 为预压缩文件，随仓库分发；服务器 nginx 开启
`gzip_static` / `brotli_static` 直接发送（零 CPU），并为 `.glb`/`.bin` 设置
30 天 immutable 缓存。更新资产内容时必须同步重新生成预压缩文件，并升 `main.js`
里的 `?v=N` 版本号以穿透客户端缓存。`detail.glb` 不阻塞首屏，进场后后台加载。

```bash
cd assets
for f in env.glb detail.glb trees.glb instances.bin terrain.bin; do
  gzip -9 -k -f $f && brotli -q 11 -k -f $f
done
```

实际传输量：env 26.7→13.6 MB、detail 14.7→4.5 MB、terrain 1.9→0.57 MB（brotli）。

## 数据与署名

模型与地形数据来自 [gulangyu-world](../README.md)：岛形、路网、建筑占地 ©
OpenStreetMap 贡献者（ODbL）；高程 © AWS Terrain Tiles / Tilezen。地标介绍为通俗简介，
非官方文案。
