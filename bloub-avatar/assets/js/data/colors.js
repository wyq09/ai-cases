/**
 * colors.js — 12 色色盘 + 主题色
 */
export const COLORS = [
  { id: 'ink',      value: '#0a0a0c' },
  { id: 'cream',    value: '#f1efe9' },
  { id: 'brown',    value: '#8b5e3c' },
  { id: 'red',      value: '#e8483f' },
  { id: 'orange',   value: '#f08a24' },
  { id: 'amber',    value: '#f0b429' },
  { id: 'green',    value: '#3ecf8e' },
  { id: 'teal',     value: '#2fbfa0' },
  { id: 'blue',     value: '#3b93f0' },
  { id: 'purple',   value: '#8b5cf6' },
  { id: 'pink',     value: '#e152b0' },
  { id: 'gray',     value: '#a3a3a3' },
];

export const COLOR_ORDER = COLORS.map((c) => c.id);
export const colorValue = (id) => COLORS.find((c) => c.id === id)?.value ?? COLORS[0].value;

/** 奶油白等浅色身体需要深色眼洞描边感?不需要 —— 洞透出页面纸色即可,但浅色身体在浅背景上要一圈细描边保证可见性 */
export function needsOutline(hex) {
  // 相对亮度 > 0.8 视为浅色
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.8;
}
