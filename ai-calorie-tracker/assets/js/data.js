// 静态数据：食谱 / 分类 / 识别候选 / 快速添加

export const CATS = [
  { id: 'all',      label: '全部',   emoji: '🍱' },
  { id: 'vegan',    label: '素食',   emoji: '🥗' },
  { id: 'protein',  label: '高蛋白', emoji: '🍗' },
  { id: 'snack',    label: '零食',   emoji: '🍟' },
  { id: 'breakfast',label: '早餐',   emoji: '🥑' },
  { id: 'low',      label: '低卡',   emoji: '🍎' },
];

const img = n => `assets/img/${n}`;

export const RECIPES = [
  {
    id: 'r1', name: '藜麦蔬菜碗', img: img('quinoa-bowl.jpg'),
    kcal: 750, minutes: 45, diff: '简单', level: 2, tags: ['vegan'],
    p: 27, c: 89, f: 31,
    desc: '牛油果、烤鹰嘴豆与彩虹蔬菜铺在绵密藜麦上，一碗里拿到膳食纤维与优质脂肪。',
    ingredients: [['藜麦', '80g'], ['牛油果', '半个'], ['樱桃番茄', '6 颗'], ['黄瓜', '半根'], ['紫甘蓝', '40g'], ['黑豆', '50g']],
    steps: [
      '藜麦淘洗后加 1.2 倍水，中小火煮 15 分钟至出芽。',
      '黄瓜、番茄、紫甘蓝切丁，牛油果切片备用。',
      '黑豆与彩椒快炒断生，调入少许盐与黑胡椒。',
      '碗中铺藜麦，码上蔬菜与牛油果，淋柠檬油醋汁即可。',
    ],
  },
  {
    id: 'r2', name: '牛油果鸡蛋吐司', img: img('avocado-toast.jpg'),
    kcal: 420, minutes: 15, diff: '简单', level: 1, tags: ['breakfast', 'protein'],
    p: 19, c: 34, f: 22,
    desc: '5 分钟搞定的元气早餐：绵密牛油果泥配溏心蛋，撒一把辣椒碎提味。',
    ingredients: [['全麦吐司', '1 片'], ['牛油果', '半个'], ['鸡蛋', '1 个'], ['辣椒碎', '少许'], ['柠檬汁', '几滴']],
    steps: [
      '吐司入平底锅烘至两面微脆。',
      '牛油果压泥，挤入柠檬汁加盐调味，厚涂在吐司上。',
      '鸡蛋煮 7 分钟成溏心蛋，切片摆放。',
      '撒辣椒碎与黑胡椒即可。',
    ],
  },
  {
    id: 'r3', name: '香煎三文鱼时蔬', img: img('salmon-plate2.jpg'),
    kcal: 560, minutes: 25, diff: '中等', level: 3, tags: ['protein'],
    p: 42, c: 18, f: 33,
    desc: '外脆里嫩的三文鱼配四季豆与小土豆，高蛋白低碳水的经典晚餐。',
    ingredients: [['三文鱼', '150g'], ['小土豆', '5 个'], ['四季豆', '80g'], ['柠檬', '2 片'], ['黄油', '10g']],
    steps: [
      '小土豆煮 12 分钟后对半切开，煎至金黄。',
      '三文鱼擦干表皮，皮朝下中火煎 4 分钟，翻面再煎 2 分钟。',
      '放入黄油与柠檬片，浇淋鱼身增香。',
      '四季豆焯熟摆盘，撒海盐黑胡椒。',
    ],
  },
  {
    id: 'r4', name: '莓果酸奶杯', img: img('yogurt-cup.jpg'),
    kcal: 280, minutes: 10, diff: '简单', level: 1, tags: ['snack', 'breakfast'],
    p: 12, c: 41, f: 7,
    desc: '希腊酸奶与蓝莓、格兰诺拉分层叠放，下午茶的能量补给。',
    ingredients: [['希腊酸奶', '150g'], ['混合莓果', '80g'], ['格兰诺拉麦片', '30g'], ['蜂蜜', '1 小勺']],
    steps: [
      '杯底铺一层酸奶。',
      '交替叠入莓果、麦片与酸奶，做两层。',
      '淋蜂蜜，用薄荷叶点缀。',
    ],
  },
  {
    id: 'r5', name: '咖喱鸡胸糙米饭', img: img('curry-rice.jpg'),
    kcal: 680, minutes: 35, diff: '中等', level: 3, tags: ['protein'],
    p: 45, c: 72, f: 19,
    desc: '浓郁日式咖喱裹着嫩煎鸡胸，配糙米饭慢慢释放能量。',
    ingredients: [['鸡胸肉', '150g'], ['糙米饭', '1 碗'], ['咖喱块', '2 块'], ['洋葱', '半个'], ['胡萝卜', '半根'], ['土豆', '1 个']],
    steps: [
      '鸡胸切塊，少油煎至两面定型盛出。',
      '洋葱、胡萝卜、土豆炒软，加水煮 12 分钟。',
      '关火放入咖喱块搅化，回锅鸡胸小火煮 5 分钟。',
      '浇在糙米饭上即可。',
    ],
  },
  {
    id: 'r6', name: '芒果思慕雪碗', img: img('smoothie-bowl.jpg'),
    kcal: 350, minutes: 10, diff: '简单', level: 1, tags: ['vegan', 'breakfast'],
    p: 8, c: 68, f: 6,
    desc: '冻芒果与香蕉打成绵密冰沙，铺满水果与奇亚籽，清爽开胃。',
    ingredients: [['冷冻芒果', '200g'], ['香蕉', '1 根'], ['椰奶', '80ml'], ['奇亚籽', '1 小勺'], ['时令水果', '适量']],
    steps: [
      '芒果、香蕉与椰奶入料理机打至绵密。',
      '倒入碗中，静置 1 分钟让其稍凝固。',
      '铺上水果丁，撒奇亚籽与椰片。',
    ],
  },
  {
    id: 'r7', name: '烤蔬菜鹰嘴豆碗', img: img('chickpea-bowl.jpg'),
    kcal: 460, minutes: 40, diff: '简单', level: 2, tags: ['vegan'],
    p: 16, c: 62, f: 15,
    desc: '烤箱一步到位：焦香时蔬与酥脆鹰嘴豆，佐芝麻酱汁更香。',
    ingredients: [['鹰嘴豆', '100g'], ['西兰花', '100g'], ['红薯', '1 个'], ['彩椒', '半个'], ['芝麻酱', '1 勺']],
    steps: [
      '鹰嘴豆擦干拌油和烟熏椒盐，200℃ 烤 25 分钟。',
      '红薯块与蔬菜同盘烤 20 分钟。',
      '芝麻酱加柠檬汁调开，淋在碗里拌匀。',
    ],
  },
  {
    id: 'r8', name: '椰香蔬菜咖喱饭', img: img('curry-rice2.jpg'),
    kcal: 520, minutes: 30, diff: '中等', level: 2, tags: ['vegan'],
    p: 11, c: 78, f: 18,
    desc: '椰浆咖喱炖煮时蔬，浇在热米饭上，暖胃的素食晚餐。',
    ingredients: [['椰浆', '150ml'], ['咖喱粉', '1 勺'], ['米饭', '1 碗'], ['西葫芦', '半根'], ['四季豆', '60g'], ['罗勒', '少许']],
    steps: [
      '咖喱粉干焙出香，加椰浆与半碗水煮开。',
      '放入西葫芦与四季豆煮 8 分钟至软身。',
      '浇在米饭上，点缀罗勒与青柠。',
    ],
  },
];

// 扫描识别候选（依次循环出现）
export const SCAN_POOL = [
  { name: '时令蔬果拼盘', img: img('veggies.jpg'),     kcal: 180, p: 4,  c: 41, f: 1,  conf: 97 },
  { name: '藜麦烤蔬菜碗', img: img('quinoa-bowl2.jpg'), kcal: 480, p: 18, c: 62, f: 16, conf: 95 },
  { name: '牛油果鸡蛋吐司', img: img('avocado-toast.jpg'), kcal: 420, p: 19, c: 34, f: 22, conf: 96 },
];

// 「快速添加」常见食物
export const QUICK_FOODS = [
  { name: '无糖拿铁', kcal: 95,  emoji: '☕️' },
  { name: '香蕉',     kcal: 105, emoji: '🍌' },
  { name: '苹果',     kcal: 78,  emoji: '🍎' },
  { name: '水煮蛋',   kcal: 78,  emoji: '🥚' },
  { name: '希腊酸奶', kcal: 120, emoji: '🥛' },
  { name: '坚果一把', kcal: 180, emoji: '🥜' },
];
