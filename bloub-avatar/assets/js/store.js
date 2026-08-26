/**
 * store.js — 配置与动画序列的本地持久化
 */

const CFG_KEY = 'bloub.config';
const SEQ_KEY = 'bloub.sequences';

export const DEFAULT_CONFIG = {
  shape: 'circle',
  mood: 'calm',
  color: 'ink',
};

export function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

/** 默认轨道:一串状态动画串联 */
export function defaultClips() {
  return [
    { anim: 'idle', duration: 3400 },
    { anim: 'blink', duration: 1150 },
    { anim: 'think', duration: 2800 },
    { anim: 'wide', duration: 1500 },
    { anim: 'orbit', duration: 3000 },
  ];
}

export function loadSequences() {
  try {
    const arr = JSON.parse(localStorage.getItem(SEQ_KEY) || 'null');
    if (Array.isArray(arr) && arr.length) return arr;
  } catch { /* 重建 */ }
  return [
    { id: 'default', name: '__default__', clips: defaultClips() },
  ];
}

export function saveSequences(seqs) {
  localStorage.setItem(SEQ_KEY, JSON.stringify(seqs));
}
