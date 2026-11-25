// Atmospheric physics, elevation zones, slope comparison, and historical data for Mount Everest.

export const EVEREST_SUMMIT_M = 8848.86;
export const SEA_LEVEL_PRESSURE_HPA = 1013.25;

/**
 * Computes realistic Himalayan / subtropical-latitude barometric pressure (hPa)
 * using the US Standard Atmosphere blended with the known Everest subtropical
 * summer anomaly (~337 hPa at 8,848.86 m, vs ~314 hPa ISA).
 *
 * @param {number} altitudeM Altitude in meters (0 to 9000)
 * @returns {number} Pressure in hPa
 */
export function computePressureHpa(altitudeM) {
  const h = Math.max(0, Math.min(11000, Number(altitudeM) || 0));
  // Standard troposphere formula: P = P0 * (1 - L*h/T0)^(g*M/(R*L))
  const isa = SEA_LEVEL_PRESSURE_HPA * Math.pow(1 - (0.0065 * h) / 288.15, 5.25588);
  // Subtropical Himalayan warm-column correction (+23 hPa around 8848m in climbing season)
  const subtropBoost = 23.0 * Math.pow(h / EVEREST_SUMMIT_M, 1.35);
  return Math.round((isa + subtropBoost) * 100) / 100;
}

/**
 * Effective oxygen availability as a percentage of sea-level inspired O2 density.
 * Note: atmospheric O2 fraction remains ~20.95%, only partial pressure drops.
 */
export function computeOxygenPct(altitudeM) {
  const p = computePressureHpa(altitudeM);
  return Math.round((p / SEA_LEVEL_PRESSURE_HPA) * 1000) / 10;
}

/**
 * Inspired tracheal oxygen partial pressure PiO2 in mmHg:
 * PiO2 = 0.2095 * (P_mmHg - 47)  (water vapor at 37C is 47 mmHg)
 */
export function computeInspiredPO2MmHg(altitudeM) {
  const pMmHg = computePressureHpa(altitudeM) * 0.750062;
  return Math.max(0, Math.round(0.2095 * (pMmHg - 47) * 10) / 10);
}

/**
 * Boiling point of pure water (Celsius) using Clausius-Clapeyron approximation.
 */
export function computeBoilingPointC(altitudeM) {
  const p = computePressureHpa(altitudeM);
  // Antoine-like empirical fit accurate from 300 hPa to 1013 hPa
  const tK = 1 / (1 / 373.15 - (8.3144626 / 40660) * Math.log(p / SEA_LEVEL_PRESSURE_HPA));
  return Math.round((tK - 273.15) * 10) / 10;
}

/**
 * Approximate mean annual temperature (C) along Everest southern slope
 * (lapse rate ~0.62 C per 100 m from ~19C at 1,500m, sharper above 6,000m).
 */
export function computeMeanTempC(altitudeM) {
  const h = Math.max(0, Math.min(9000, Number(altitudeM) || 0));
  const t = 28.0 - 0.0063 * h - (h > 6500 ? 0.0014 * (h - 6500) : 0);
  return Math.round(t * 10) / 10;
}

/**
 * Relative UV radiation intensity compared to sea level (~10-12% rise per 1,000 m).
 */
export function computeUvFactor(altitudeM) {
  const h = Math.max(0, Number(altitudeM) || 0);
  return Math.round((1 + 0.11 * (h / 1000)) * 100) / 100;
}

export const ELEVATION_ZONES = [
  {
    id: "zone-1",
    index: 1,
    numeral: "I",
    minM: 1500,
    maxM: 3000,
    midM: 2250,
    title: "暖湿河谷与山地阔叶林带",
    subtitle: "季风的入口 · 杜鹃与云雾峡谷",
    enTitle: "Subtropical & Montane Broadleaf Forest",
    accent: "#2B6A4E",
    bandColor: "#3D7E5C",
    tempSummer: "14°C 至 24°C",
    tempWinter: "2°C 至 10°C",
    precip: "1,800 – 2,500 mm / 年",
    southNote: "南坡（尼泊尔督德科西河谷）：印度洋湿润季风长驱直入，峡谷深切，常绿青冈栎、喜马拉雅铁杉与乔木杜鹃密布。",
    northNote: "北坡（中国西藏）：此海拔带在北坡并不存在——青藏高原珠峰北侧基面已抬升至 4,000 米以上。",
    flora: ["乔木杜鹃（树形杜鹃）", "高山栎与青冈", "喜马拉雅铁杉", "悬垂松萝与苔藓"],
    fauna: ["小熊猫", "喜马拉雅叶猴", "雪鸽", "彩雉"],
    landmarks: ["卢克拉机场（2,860 m）", "帕克丁吊桥（2,610 m）", "督德科西冰川河谷"],
    physiology: "呼吸如常，偶有初上山者的轻微疲倦；空气温润富氧，约相当于海平面的 71%–84%。",
  },
  {
    id: "zone-2",
    index: 2,
    numeral: "II",
    minM: 3000,
    maxM: 4000,
    midM: 3500,
    title: "亚高山针叶林与桦林带",
    subtitle: "森林的边界 · 经幡与林线守望",
    enTitle: "Subalpine Conifer & Birch Timberline",
    accent: "#3A5F6F",
    bandColor: "#4F7A82",
    tempSummer: "8°C 至 15°C",
    tempWinter: "-8°C 至 2°C",
    precip: "900 – 1,500 mm / 年",
    southNote: "南坡：喜马拉雅冷杉、丽江云杉与糙皮桦交替成林；至 3,900–4,100 m 抵达生态林线，乔木止步。",
    northNote: "北坡：定日盆地边缘接近此上限，因喜马拉雅山脉雨影效应，森林稀缺，呈现半干旱河谷荒漠草原风貌。",
    flora: ["喜马拉雅冷杉（Abies spectabilis）", "糙皮桦（Betula utilis）", "高山圆柏", "林下矮杜鹃"],
    fauna: ["棕尾虹雉（尼泊尔国鸟）", "喜马拉雅麝", "喜马拉雅塔尔羊", "血雉"],
    landmarks: ["南池巴扎（3,440 m）", "天波切寺（3,867 m）", "昆布林线分界（~4,000 m）"],
    physiology: "首次进入临床意义上的“高海拔”区间（> 2,500–3,000 m），静息心率轻度加快，建议在南池巴扎停留适应。",
  },
  {
    id: "zone-3",
    index: 3,
    numeral: "III",
    minM: 4000,
    maxM: 5000,
    midM: 4500,
    title: "高山灌丛与高寒草甸带",
    subtitle: "风与牦牛的牧场 · 垫状生命哲学",
    enTitle: "Alpine Scrub & High-Altitude Meadow",
    accent: "#9C6B32",
    bandColor: "#B68443",
    tempSummer: "2°C 至 10°C",
    tempWinter: "-18°C 至 -5°C",
    precip: "400 – 750 mm / 年",
    southNote: "南坡：乔木绝迹，贴地匍匐的矮杜鹃、垫状点地梅与金黄嵩草铺展于冰碛谷地，夏季绿绒蒿短暂盛放。",
    northNote: "北坡：西藏定日与绒布河谷起点（~4,200 m），降水不足 300 mm，砾石荒原与紫花针茅草原辽阔敞亮。",
    flora: ["高山垫状植物", "喜马拉雅蓝绿绒蒿", "嵩草与针茅", "水母雪兔子"],
    fauna: ["雪豹", "岩羊（蓝羊）", "喜马拉雅旱獭", "藏雪鸡与高山兀鹫"],
    landmarks: ["丁波切牧村（4,410 m）", "佩里切医疗站（4,371 m）", "西藏绒布河谷（~4,500–4,900 m）"],
    physiology: "含氧量降至海平面 54%–63%，急性高原反应（AMS）高发带；睡眠易现周期性呼吸，需严格遵循“高爬低睡”。",
  },
  {
    id: "zone-4",
    index: 4,
    numeral: "IV",
    minM: 5000,
    maxM: 6000,
    midM: 5500,
    title: "流石滩、冰川舌与大本营带",
    subtitle: "生命的稀薄边缘 · 砾石与蓝冰之门",
    enTitle: "Subnival Scree, Glaciers & Base Camp",
    accent: "#4E687D",
    bandColor: "#637F94",
    tempSummer: "-4°C 至 6°C",
    tempWinter: "-26°C 至 -12°C",
    precip: "300 – 500 mm（多固态雪）",
    southNote: "南坡：植被退缩为壳状地衣与零星流石滩草本；5,364 m 珠峰南坡大本营扎于移动的昆布冰川表碛之上，上方紧接 5,486 m 昆布冰瀑。",
    northNote: "北坡：5,000 m 绒布寺与 5,200 m 北坡大本营可直面雄伟北壁；雪线高达 5,800–6,200 m，碎石与冰川舌裸露更高。",
    flora: ["壳状地衣与石耳", "极少数高山苔藓", "5,800 m 以上维管植物近乎绝迹"],
    fauna: ["黄嘴山鸦（可飞至 8,000 m）", "喜马拉雅跳蛛（常驻纪录 ~6,700 m）", "雪雀"],
    landmarks: ["北坡大本营（5,200 m）", "南坡大本营 EBC（5,364 m）", "昆布冰瀑（5,486 – 5,900 m）"],
    physiology: "气压已降至海平面约一半（~50% 含氧），水的沸点跌破 83°C；5,500 m 常被视为人类长期定居的生理上限。",
  },
  {
    id: "zone-5",
    index: 5,
    numeral: "V",
    minM: 6000,
    maxM: 8000,
    midM: 7000,
    title: "永久冰雪带与高海拔营地带",
    subtitle: "雪线之上 · 寂静谷与洛子冰壁",
    enTitle: "Permanent Snow, Icefall & High Camps",
    accent: "#1F557C",
    bandColor: "#2E6A96",
    tempSummer: "-15°C 至 -5°C（寂静谷晴午局部可闷热）",
    tempWinter: "-40°C 至 -22°C",
    precip: "以高空降雪与吹雪为主",
    southNote: "南坡：穿过冰瀑进入 C1（6,065 m）与“寂静谷”C2（6,400 m），随后沿近乎垂直的洛子蓝冰壁攀升至 C3（7,200 m）与南坳 C4（7,906 m）。",
    northNote: "北坡：由前进营地 ABC（6,500 m）上攀 7,020 m 北坳冰雪坡，经 7,500 m、7,790 m 营地逼近大风口。",
    flora: ["无维管植物，仅微尺度嗜冷雪藻与微生物休眠孢子"],
    fauna: ["斑头雁（迁徙飞越 7,000–8,000 m 气流）", "高山兀鹫（高空巡航纪录）"],
    landmarks: ["寂静谷 C2（6,400 m）", "北坡前进营地 ABC（6,500 m）", "北坳（7,020 m）", "南坳 C4（7,906 m）"],
    physiology: "含氧跌至海平面 36%–48%；人体红细胞急剧增生致血液黏稠，食欲丧失、肌肉与脂肪持续消耗，伤口极难愈合。",
  },
  {
    id: "zone-6",
    index: 6,
    numeral: "VI",
    minM: 8000,
    maxM: 8848.86,
    midM: 8450,
    title: "极高山“死亡地带”与顶峰",
    subtitle: "触碰对流层之巅 · 8,848.86 米",
    enTitle: "The Death Zone & Summit Ridge",
    accent: "#C87A4B",
    bandColor: "#142236",
    tempSummer: "-28°C 至 -18°C",
    tempWinter: "-60°C 至 -36°C",
    precip: "副热带西风急流横扫，旗云翻涌",
    southNote: "南坡：自南坳（7,906 m）夜间出发，经阳台（8,400 m）、南峰（8,749 m）与希拉里台阶（8,790 m）沿刃脊冲顶。",
    northNote: "北坡：自 8,300 m 突击营地翻越著名的第一、第二（8,610 m）、第三台阶裸露岩壁，直抵珠峰雪顶。",
    flora: ["无原生植物；顶峰灰岩中封存着 4.5 亿年前古特提斯海海洋生物化石"],
    fauna: ["无常驻动物，仅有随上升气流偶入的极少数昆虫与尘埃微生物"],
    landmarks: ["阳台 Balcony（8,400 m）", "北坡第二台阶（8,610 m）", "南峰（8,749 m）", "珠穆朗玛峰顶（8,848.86 m）"],
    physiology: "死亡地带（> 8,000 m）：峰顶气压仅约 337 hPa（海平面约 33%），细胞耗氧超过摄入极限，大脑与心肺呈倒计时衰减，必须严格控时撤离。",
  },
];

export const LANDMARK_BENCHMARKS = [
  { name: "海平面", altitudeM: 0, note: "标准大气 1013.25 hPa，沸点 100°C" },
  { name: "拉萨", altitudeM: 3650, note: "日光城，接近珠峰林线高度" },
  { name: "勃朗峰", altitudeM: 4808, note: "西欧最高峰，相当于珠峰草甸上限" },
  { name: "珠峰大本营（南）", altitudeM: 5364, note: "气压近海平面一半，冰川之旅起点" },
  { name: "乞力马扎罗", altitudeM: 5895, note: "非洲最高峰，接近珠峰雪线" },
  { name: "南坳 C4", altitudeM: 7906, note: "死亡地带门户，最后冲顶营地" },
  { name: "珠穆朗玛峰顶", altitudeM: 8848.86, note: "2020 中尼联合雪面高程" },
];

export const CROSS_SECTION_MARKERS = {
  south: [
    { name: "卢克拉", alt: 2860, x: 138, side: "south", detail: "2,860 m · 南坡徒步起点" },
    { name: "南池巴扎", alt: 3440, x: 198, side: "south", detail: "3,440 m · 夏尔巴重镇与适应站" },
    { name: "天波切寺", alt: 3867, x: 245, side: "south", detail: "3,867 m · 林线边缘的千年佛寺" },
    { name: "丁波切", alt: 4410, x: 300, side: "south", detail: "4,410 m · 高山草甸与牦牛牧村" },
    { name: "南坡大本营", alt: 5364, x: 378, side: "south", detail: "5,364 m · 昆布冰川上的帐篷城" },
    { name: "寂静谷 C2", alt: 6400, x: 438, side: "south", detail: "6,400 m · 冰瀑之上的前进营地" },
    { name: "南坳 C4", alt: 7906, x: 500, side: "south", detail: "7,906 m · 死亡地带边缘冲顶营" },
  ],
  north: [
    { name: "北坡大本营", alt: 5200, x: 758, side: "north", detail: "5,200 m · 西藏绒布寺北壁仰望点" },
    { name: "前进营地 ABC", alt: 6500, x: 678, side: "north", detail: "6,500 m · 东绒布冰川高海拔基地" },
    { name: "北坳营地", alt: 7020, x: 642, side: "north", detail: "7,020 m · 冰壁攀登关键隘口" },
    { name: "突击营地 C3", alt: 8300, x: 582, side: "north", detail: "8,300 m · 死亡地带北脊宿营点" },
    { name: "第二台阶", alt: 8610, x: 562, side: "north", detail: "8,610 m · 北坡最陡峭的岩壁关隘" },
  ],
  summit: {
    name: "珠穆朗玛峰顶",
    alt: 8848.86,
    x: 540,
    detail: "8,848.86 m · 27°59′17″N, 86°55′31″E",
  },
};

/**
 * Finds the matching elevation zone object for any altitude (meters).
 */
export function getZoneForAltitude(altitudeM) {
  const h = Math.max(0, Number(altitudeM) || 0);
  for (let i = ELEVATION_ZONES.length - 1; i >= 0; i--) {
    if (h >= ELEVATION_ZONES[i].minM) {
      return ELEVATION_ZONES[i];
    }
  }
  return ELEVATION_ZONES[0];
}

/**
 * Returns a concise human physiology status label for a given altitude.
 */
export function getPhysiologySummary(altitudeM) {
  const h = Math.max(0, Number(altitudeM) || 0);
  if (h < 1500) {
    return {
      level: "常压舒适区",
      code: "NORMAL",
      desc: "氧分压充沛，动脉血氧饱和度约 97%–99%，人体代谢与体能发挥处于常态基准。",
    };
  }
  if (h < 3000) {
    return {
      level: "轻度高原适应区",
      code: "MILD",
      desc: "呼吸频率微升，长距离爬升略有气促；绝大多数人无需特殊适应即可平稳通行。",
    };
  }
  if (h < 4500) {
    return {
      level: "高海拔反应警戒区",
      code: "MODERATE",
      desc: "血氧饱和度降至 85%–92%，易出现头痛、失眠与轻度急性高原反应（AMS），须控制日升海拔。",
    };
  }
  if (h < 5800) {
    return {
      level: "极高海拔定居极限",
      code: "SEVERE",
      desc: "气压逼近海平面一半；5,500 m 以上人类无法长期繁衍生息，静息心率显著加快，恢复变慢。",
    };
  }
  if (h < 8000) {
    return {
      level: "冰雪衰竭与高耗能区",
      code: "EXTREME",
      desc: "血红蛋白代偿性升高使血液黏滞；食欲抑制、体重持续下滑，必须依赖轮换拉练与高热量补给。",
    };
  }
  return {
    level: "死亡地带 · 生理倒计时",
    code: "DEATH_ZONE",
    desc: "含氧不足海平面三分之一，身体无法完成有效适应，细胞呈不可逆损耗；非辅助供氧停留极具致命风险。",
  };
}
