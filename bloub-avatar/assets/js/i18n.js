/**
 * i18n.js — 界面语言:简体中文 / English / Français
 * 检测浏览器语言,选择持久化在 localStorage。
 */

export const LOCALES = {
  'zh-Hans': {
    label: '简体中文', flag: '🇨🇳',
    customize: '个性化', animate: '动画', settings: '设置',
    shapes: '形状', moods: '表情', colors: '颜色',
    language: '语言', about: '关于',
    viewOnGitHub: '在 GitHub 上查看项目',
    madeBy: (a) => `由 ${a} 用 ❤️ 打造`,
    exportPng: '导出 PNG', exportGif: '下载 GIF 动图', exportWebm: '录制 WebM 视频',
    copyImage: '复制图片',
    moreFormats: '其他格式',
    gifTransparentNote: 'GIF 的透明是全有或全无：不带背景时，轮廓边缘会略显生硬。',
    whiteBg: '白色背景', whiteBgNote: '边缘平滑，适合浅色底',
    transparentBg: '透明背景', transparentBgNote: '适配任何背景，边缘略硬',
    download: '下载', cancel: '取消', copy: '复制',
    exporting: '正在导出…', exported: '已导出', copied: '已复制', exportFailed: '导出失败',
    webmHint: '视频更轻更流畅，到处都能播放',
    gifHint: '动图必须有背景，体积更大',
    pngHint: '静止画面，随时可截',
    animations: '动画', timeline: '轨道', addHint: '点击动画把它加进轨道',
    play: '开始播放', stop: '停止播放', exportSequence: '导出动画序列',
    newSequence: '新建序列', renameSequence: '重命名序列', sequenceName: '序列名称',
    create: '创建', rename: '重命名', delete: '删除',
    deleteConfirm: (n, c) => `该序列将被删除，其中包含的 ${c} 个动画也将一并丢失。`,
    defaultSeq: '默认序列', mySeq: '我的序列',
    seconds: '秒', duration: '时长', remove: '移除',
    idle: '静止', think: '思考', blink: '眨眼', wide: '睁大眼睛',
    alert: '警示', notice: '通知', exclaim: '感叹号', sleep: '休眠',
    egg: '蛋形', play: '播放', orbit: '轨道', burst: '爆散',
    comet: '彗星', vortex: '漩涡',
    shape_circle: '圆形', shape_pebble: '卵石', shape_roundedSquare: '圆角方形',
    shape_capsule: '胶囊', shape_triangle: '三角形', shape_hexagon: '六边形',
    shape_cloud: '云朵', shape_drop: '水滴',
    mood_calm: '平静', mood_focus: '专注', mood_surprised: '惊讶', mood_excited: '兴奋',
    mood_happy: '开心', mood_laugh: '大笑', mood_angry: '生气', mood_sad: '难过',
    mood_scared: '害怕', mood_skeptical: '怀疑', mood_confused: '困惑', mood_curious: '好奇',
    mood_smug: '得意', mood_shy: '羞怯', mood_bored: '无趣', mood_sleepy: '困倦',
    color_ink: '墨黑', color_cream: '奶油白', color_brown: '棕色', color_red: '红色',
    color_orange: '橙色', color_amber: '琥珀色', color_green: '绿色', color_teal: '青绿色',
    color_blue: '蓝色', color_purple: '紫色', color_pink: '粉色', color_gray: '灰色',
  },
  en: {
    label: 'English', flag: '🇬🇧',
    customize: 'Customize', animate: 'Animate', settings: 'Settings',
    shapes: 'Shapes', moods: 'Moods', colors: 'Colors',
    language: 'Language', about: 'About',
    viewOnGitHub: 'View project on GitHub',
    madeBy: (a) => `Made with ❤️ by ${a}`,
    exportPng: 'Export PNG', exportGif: 'Download GIF', exportWebm: 'Record WebM',
    copyImage: 'Copy image',
    moreFormats: 'More formats',
    gifTransparentNote: 'GIF transparency is all-or-nothing: without a background, edges look slightly rough.',
    whiteBg: 'White background', whiteBgNote: 'Smooth edges, best on light surfaces',
    transparentBg: 'Transparent background', transparentBgNote: 'Fits any background, slightly rough edges',
    download: 'Download', cancel: 'Cancel', copy: 'Copy',
    exporting: 'Exporting…', exported: 'Exported', copied: 'Copied', exportFailed: 'Export failed',
    webmHint: 'Video is lighter and smoother, plays everywhere',
    gifHint: 'Animated GIF needs a background, heavier file',
    pngHint: 'Still picture, ready to grab',
    animations: 'Animations', timeline: 'Timeline', addHint: 'Click an animation to add it to the track',
    play: 'Play', stop: 'Stop', exportSequence: 'Export sequence',
    newSequence: 'New sequence', renameSequence: 'Rename sequence', sequenceName: 'Sequence name',
    create: 'Create', rename: 'Rename', delete: 'Delete',
    deleteConfirm: (n, c) => `“${n}” will be deleted, and its ${c} animation clips will be lost.`,
    defaultSeq: 'Default sequence', mySeq: 'My sequences',
    seconds: 's', duration: 'Duration', remove: 'Remove',
    idle: 'Idle', think: 'Thinking', blink: 'Blink', wide: 'Wide eyes',
    alert: 'Alert', notice: 'Notice', exclaim: 'Exclaim', sleep: 'Sleep',
    egg: 'Egg', play: 'Play', orbit: 'Orbit', burst: 'Burst',
    comet: 'Comet', vortex: 'Vortex',
    shape_circle: 'Circle', shape_pebble: 'Pebble', shape_roundedSquare: 'Squircle',
    shape_capsule: 'Capsule', shape_triangle: 'Triangle', shape_hexagon: 'Hexagon',
    shape_cloud: 'Cloud', shape_drop: 'Drop',
    mood_calm: 'Calm', mood_focus: 'Focused', mood_surprised: 'Surprised', mood_excited: 'Excited',
    mood_happy: 'Happy', mood_laugh: 'Laughing', mood_angry: 'Angry', mood_sad: 'Sad',
    mood_scared: 'Scared', mood_skeptical: 'Skeptical', mood_confused: 'Confused', mood_curious: 'Curious',
    mood_smug: 'Smug', mood_shy: 'Shy', mood_bored: 'Bored', mood_sleepy: 'Sleepy',
    color_ink: 'Ink', color_cream: 'Cream', color_brown: 'Brown', color_red: 'Red',
    color_orange: 'Orange', color_amber: 'Amber', color_green: 'Green', color_teal: 'Teal',
    color_blue: 'Blue', color_purple: 'Purple', color_pink: 'Pink', color_gray: 'Gray',
  },
  fr: {
    label: 'Français', flag: '🇫🇷',
    customize: 'Personnaliser', animate: 'Animer', settings: 'Réglages',
    shapes: 'Formes', moods: 'Humeurs', colors: 'Couleurs',
    language: 'Langue', about: 'À propos',
    viewOnGitHub: 'Voir le projet sur GitHub',
    madeBy: (a) => `Réalisé avec ❤️ par ${a}`,
    exportPng: 'Exporter PNG', exportGif: 'Télécharger le GIF', exportWebm: 'Enregistrer en WebM',
    copyImage: 'Copier l’image',
    moreFormats: 'Autres formats',
    gifTransparentNote: 'La transparence GIF est tout ou rien : sans fond, les bords paraissent un peu durs.',
    whiteBg: 'Fond blanc', whiteBgNote: 'Bords lisses, idéal sur fond clair',
    transparentBg: 'Fond transparent', transparentBgNote: 'S’adapte à tout, bords un peu durs',
    download: 'Télécharger', cancel: 'Annuler', copy: 'Copier',
    exporting: 'Export en cours…', exported: 'Exporté', copied: 'Copié', exportFailed: 'Échec de l’export',
    webmHint: 'La vidéo est plus légère et fluide, lisible partout',
    gifHint: 'Le GIF exige un fond, fichier plus lourd',
    pngHint: 'Image fixe, à saisir tel quel',
    animations: 'Animations', timeline: 'Piste', addHint: 'Cliquez une animation pour l’ajouter à la piste',
    play: 'Lire', stop: 'Arrêter', exportSequence: 'Exporter la séquence',
    newSequence: 'Nouvelle séquence', renameSequence: 'Renommer', sequenceName: 'Nom de la séquence',
    create: 'Créer', rename: 'Renommer', delete: 'Supprimer',
    deleteConfirm: (n, c) => `« ${n} » sera supprimée, et ses ${c} animations perdues.`,
    defaultSeq: 'Séquence par défaut', mySeq: 'Mes séquences',
    seconds: 's', duration: 'Durée', remove: 'Retirer',
    idle: 'Repos', think: 'Réflexion', blink: 'Clin d’œil', wide: 'Yeux écarquillés',
    alert: 'Alerte', notice: 'Notification', exclaim: 'Exclamation', sleep: 'Sommeil',
    egg: 'Œuf', play: 'Lecture', orbit: 'Orbite', burst: 'Explosion',
    comet: 'Comète', vortex: 'Vortex',
    shape_circle: 'Cercle', shape_pebble: 'Galet', shape_roundedSquare: 'Carré arrondi',
    shape_capsule: 'Capsule', shape_triangle: 'Triangle', shape_hexagon: 'Hexagone',
    shape_cloud: 'Nuage', shape_drop: 'Goutte',
    mood_calm: 'Calme', mood_focus: 'Concentré', mood_surprised: 'Surpris', mood_excited: 'Excité',
    mood_happy: 'Heureux', mood_laugh: 'Fou rire', mood_angry: 'Fâché', mood_sad: 'Triste',
    mood_scared: 'Effrayé', mood_skeptical: 'Sceptique', mood_confused: 'Perplexe', mood_curious: 'Curieux',
    mood_smug: 'Smug', mood_shy: 'Timide', mood_bored: 'Blasé', mood_sleepy: 'Somnolent',
    color_ink: 'Encre', color_cream: 'Crème', color_brown: 'Brun', color_red: 'Rouge',
    color_orange: 'Orange', color_amber: 'Ambre', color_green: 'Vert', color_teal: 'Turquoise',
    color_blue: 'Bleu', color_purple: 'Violet', color_pink: 'Rose', color_gray: 'Gris',
  },
};

const STORAGE_KEY = 'bloub.lang';

export function detectLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LOCALES[saved]) return saved;
  const langs = navigator.languages || [navigator.language];
  for (const l of langs) {
    const low = (l || '').toLowerCase();
    if (low.startsWith('zh')) return 'zh-Hans';
    if (low.startsWith('fr')) return 'fr';
    if (low.startsWith('en')) return 'en';
  }
  return 'en';
}

export function setLocale(id) {
  localStorage.setItem(STORAGE_KEY, id);
}

export const t = (key) => LOCALES[currentLocale][key] ?? key;
export let currentLocale = 'en';
export function initLocale() {
  currentLocale = detectLocale();
  return currentLocale;
}
