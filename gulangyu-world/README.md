# 鼓浪屿 · Blender 场景工程

这是一套以真实地图轮廓约束的鼓浪屿游戏环境原型，包含可编辑 Blender 场景、六段三维相机镜头、通用 glTF 模型、LOD 和静态碰撞代理。它不是逐栋测绘或实景扫描成果：岛形、路网和建筑占地来自地图，高度、立面与地标外观存在参考推定。

## 交付文件

| 文件 | 用途 |
|---|---|
| `delivery/Gulangyu_Showcase_1080p.mp4` | 1920 × 1080、24 fps、24 秒；六段真实 Blender 相机运动，含原创合成环境配乐 |
| `delivery/Gulangyu_World.blend` | 完整可编辑场景；贴图已打包，打开即可查看相机和材质 |
| [`web/`](web/) | **three.js 交互网页**：小人漫游、键盘/虚拟摇杆、地标打卡（assets 由 `delivery/game` 离线压缩生成） |
| `delivery/game/Gulangyu_Environment_LOD0.glb` | 完整建筑门窗、地标、地形、道路、植被；PBR 贴图内嵌 |
| `delivery/game/Gulangyu_Environment_LOD1.glb` | 远景简化版本，保留建筑屋顶与窗口分布 |
| `delivery/game/Gulangyu_Collision_Proxies.glb` | 独立地形和建筑静态碰撞代理 |
| `delivery/game/Foliage_Prototypes_LOD0.glb` | 六种共享植被原型，便于替换或实例化 |
| `delivery/game/vegetation_instances.json` | 植被位置、旋转、缩放及原型名称，提供 Blender 与 glTF 两种坐标 |
| `delivery/textures/` | 原创合成基础色、法线和粗糙度贴图 |
| `delivery/Poster.jpg`、`delivery/Contact_Sheet.jpg` | 场景海报和六镜头检查图 |
| `delivery/VALIDATION.json` | 文件、模型、画面序列及视频参数的自动核验结果 |
| `data/` | 原始地图、高程瓦片、处理后的几何与地形数据 |
| `scripts/` | 采集、地理处理、建模、LOD、导出、渲染和视频合成脚本 |

## 场景内容

陆地约 1.97 平方公里。地图中筛选了 1,153 个建筑轮廓和 463 段道路，布置了 12,494 株共享网格植被。重点区域包括日光岩岩体、观景台和阶梯，八卦楼回廊、柱列和穹顶，菽庄花园海上步道，以及天主堂和龙头路低机位展示区域。

近景铺装使用细分网格贴合最终地形，避免与地表交叠。建筑各自保留地图 ID，独立对象原点位于其平面包围盒中心与底部高程。门窗框、百叶窗、檐口、雨水管、台阶、护栏、路灯和部分近景门面使用实体网格；重复植被复用六个基础网格。所有贴图均为本项目合成，参考照片没有作为游戏贴图打包。

## 还原依据与范围

| 元素 | 依据 | 精度与当前限制 |
|---|---|---|
| 岛形、海岸线 | OpenStreetMap 原始节点，地形网格沿岸裁切 | 实际地理分布；受公开地图精度和更新情况限制 |
| 建筑占地、道路位置 | OpenStreetMap，保留 way ID | 未对每栋建筑做现场核验；地图可能有遗漏 |
| 地形起伏 | Mapzen / AWS Terrarium 高程瓦片 | 原始数据为粗分辨率 DEM；6 米建模网格不代表 6 米测绘精度，海岸高程经过整理 |
| 楼高、楼层 | 有地图标注时使用标注，其余按低层街区推定 | 大多数建筑不是实测高度 |
| 普通建筑立面、屋顶细节 | 闽南红砖与西式回廊建筑的模块化解释 | 没有逐栋对照街景，不能作为各栋现状复刻 |
| 八卦楼、日光岩、天主堂 | 地图位置与公开照片参考 | 外观重建，未使用点云、测绘立面或照片测量 |
| 菽庄花园四十四桥 | 地图已有西段 + 照片参考补充东段 | 东段属于参考推定，已写入模型属性；并非完整测绘线形 |
| 树种、树位与街道小品 | 程序布置并避让建筑和主要道路 | 不是逐株实景位置；近景门面装饰亦为解释性细节 |
| 厦门对岸 | 单独的低细节参考集合 | 默认关闭渲染，未放入游戏导出 |

“细节多”和“实测准确”是两个不同指标。本工程提供了完整可修改的岛屿环境基础；如果用于要求逐街逐栋真实的游戏，应以现场照片、授权航测/点云和建筑测绘资料校准重点可游玩街区。当前没有建筑室内、角色控制器、导航网格、NPC 或游戏逻辑。

本版数据中，带明确楼高字段的建筑为 0 栋，带楼层数字段的为 11 栋；其他楼高均属于建模推定。详见 `delivery/ACCURACY.json`。

## Blender 中使用

打开 `delivery/Gulangyu_World.blend`。场景使用 Blender 5.2.1 LTS 和 Eevee，主时间轴 1–576 帧，24 fps；六个相机切换标记分别位于 1、97、193、289、385、481 帧。按数字键盘 `0` 查看当前相机，空格播放相机动画。

集合按地形、建筑、道路、地标、植被、海水、相机和碰撞分开。`08_Game_Collision` 默认不参与渲染；`09_Xiamen_Distant_Context` 为默认关闭的对岸参考。建筑名以 `B_<OSM ID>` 开头，地标以 `LM_` 开头。原始场景保存完整细节；视频渲染脚本在每个镜头开始时为远处物体选择简化网格，镜头内不会来回切换 LOD。

贴图已打包到 `.blend`。海水的程序法线和天空属于 Blender 演示场景，不包含在环境 GLB 中；游戏引擎可使用自己的海水与天空系统。

## 游戏接入

- 单位为米。Blender 使用 X 向东、Y 向北、Z 向上；glTF 导出自动转为 X 向东、Y 向上、Z 向南。参考原点为 WGS84 经度 118.063、纬度 24.447。
- 可以先导入 `Gulangyu_Environment_LOD1.glb` 查看布局，再按近景需求使用 LOD0 或从 Blender 导出选定街区。两套模型使用一致世界位置；在引擎中配置实际 LODGroup / LOD 切换距离。
- 通用 GLB 中的树为共享网格节点。项目同时提供原型与布置 JSON，可转换为引擎的植被实例或 GPU 实例。原型库为了方便查看在 X 轴上排开；`library_display_offset_m` 是展示偏移，实例化时使用网格局部原点。
- 碰撞文件需要独立导入并设为不可渲染的静态碰撞体。建筑代理是封闭的占地外壳，不支持进入室内；没有给树叶添加碰撞。楼顶与桥梁的精确碰撞、角色可通行间隙、导航烘焙需要按游戏玩法继续设置。
- 简化版 GLB 已成功回读到 Blender，包含 13,672 个网格对象，约 1.94 × 1.98 公里的水平范围。唯一网格三角面数由约 718 万减少到 162 万；计入所有树木实例后，总三角面数由约 5,978 万减少到 2,624 万。目前未在 Unity 或 Unreal 项目中运行，也没有实测帧率。LOD0 包含较多实体门窗细节，不能将离线视频帧率视为引擎实时性能。根据目标平台配置分区加载、实例化、遮挡剔除和远景 LOD。

## 复现

地理和贴图处理脚本使用 Python 的 `numpy pillow shapely scipy`。Blender 建模和 glTF 导出使用 Blender 自带 Python；视频编码使用 FFmpeg。固定随机种子已写入脚本。

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/fetch_data.py
.venv/bin/python scripts/prepare_geo.py
.venv/bin/python scripts/make_textures.py
.venv/bin/python scripts/refine_geo.py
.venv/bin/python scripts/refine_surfaces.py
.venv/bin/python scripts/finalize_geo.py
.venv/bin/python scripts/clip_terrain.py
.venv/bin/python scripts/road_boundaries.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_scene.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup delivery/Gulangyu_World.blend --python scripts/export_game.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup delivery/Gulangyu_World.blend --python scripts/render_film.py -- 1 576
.venv/bin/python scripts/finish_film.py
.venv/bin/python scripts/validate_delivery.py
```

以上命令从本目录执行。字体路径和 Blender / FFmpeg 路径按 macOS 编写，其他系统可在对应脚本中替换。重建会覆盖本项目的生成输出，请将手工修改的场景另存。地图数据可能随时间变化；保留的 `data/osm.json` 和高程瓦片可用于重复构建本版。

## 数据与参考

地图：© OpenStreetMap contributors，ODbL，见 [OpenStreetMap 版权与许可](https://www.openstreetmap.org/copyright)。原始数据与处理数据保留在 `data/`，数据派生部分继续遵守该许可。地图获取日期：2026-09-07。

地形：[AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)；高程编码与来源说明见 [Tilezen / Joerd attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。全球来源包括 SRTM、GMTED 等，具体来源按瓦片汇编说明。

遗产与岛屿布局：[UNESCO 鼓浪屿遗产页面](https://whc.unesco.org/en/list/1541/)、[遗产范围地图](https://whc.unesco.org/en/documents/159841)、[鼓浪屿景点地图](https://kulangsuisland.org/maps-of-kulangsu-gulangyu/)。

八卦楼形制参考：[福建日报：鼓浪屿地标八卦楼](https://www.fjdaily.com/app/content/2023-05/06/content_1872600.html)。日光岩形态参考：[东南网 / 新华社航拍](https://usa.fjsen.com/2020-04/23/content_30277102.htm)。菽庄花园海上步道参考：[公开航拍参考](https://data.tibetcn.com/pictures/xiamen-gulangyu-shuzhuang-garden1.jpg)。照片仅作为建模观察参考，未随资产包分发。

视频的环境音与音符由 `finish_film.py` 合成，无外部音乐采样。
