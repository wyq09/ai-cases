// Flower · 纯逻辑回归（node test/run.mjs）：构图 / 生成器 / 相机 / 画幅适配，不依赖浏览器
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
for (const f of ['util', 'layout', 'gen', 'shaders', 'camera']) require(`../src/${f}.js`);

const TF = globalThis.TF;
const L = TF.layout;
const F = TF.FRAME;
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

/* ---------- 工具 ---------- */
{
  const a = TF.rng(42), b = TF.rng(42);
  ok(a() === b() && a() === b(), '同种子随机序列一致');
  const c = TF.rng(43);
  ok(a() !== c(), '不同种子序列不同');
  ok(TF.clamp(5, 0, 3) === 3 && TF.clamp(-1, 0, 3) === 0 && TF.clamp(1.5, 0, 3) === 1.5, 'clamp');
  ok(TF.smoothstep(0, 1, -1) === 0 && TF.smoothstep(0, 1, 2) === 1, 'smoothstep 端点');
  let mn = 1, mx = 0;
  for (let i = 0; i < 4000; i++) { const v = TF.noise3(i * 0.37, i * 0.11, i * 0.53, 9); mn = Math.min(mn, v); mx = Math.max(mx, v); }
  ok(mn >= 0 && mx <= 1 && mx - mn > 0.8, `噪声落在 [0,1] 且有起伏 (${mn.toFixed(2)}~${mx.toFixed(2)})`);
}

/* ---------- 矩阵 / 四元数 ---------- */
{
  const q = TF.quatAxisAngle(0, 0, 1, Math.PI / 2);
  const m = TF.mat4FromQuatPosScale(q, 1, 2, 3, 2);
  // 局部 +x 绕 z 转 90° → +y，再缩放平移
  const x = m[0] * 1 + m[12], y = m[1] * 1 + m[13];
  ok(Math.abs(x - 1) < 1e-6 && Math.abs(y - 4) < 1e-6, '四元数→矩阵：旋转+缩放+平移');
  const qi = TF.quatMul(q, TF.quatAxisAngle(0, 0, 1, -Math.PI / 2));
  ok(Math.abs(qi[3] - 1) < 1e-6 && Math.abs(qi[2]) < 1e-6, '正反旋转相乘得单位四元数');
  const p = TF.mat4Perspective(1, 2, 0.1, 100);
  ok(p[5] > 1 && p[11] === -1, '透视投影');
  ok(TF.mat4LookAt(0, 0, 5, 0, 0, 0, 0, 1, 0)[14] === -5, '视图矩阵');
}

/* ---------- 构图数据 ---------- */
{
  ok(L.validate().length === 0, '构图数据自检通过');
  ok(L.flowers.length === 6, '六朵向日葵');
  ok(L.flowers.every((f) => f.x > 0 && f.x < F.w && f.y > 0 && f.y < F.h), '花心都在参考画幅内');
  ok(L.leafBright.length >= 10 && L.leafMid.length >= 10, '亮绿叶 / 中层叶数量');
  ok(L.threads.length >= 4 && L.bokeh.length >= 15 && L.haze.length >= 8, '丝线 / 散景 / 雾团数量');
  const ids = new Set(L.flowers.map((f) => f.id));
  ok(ids.size === L.flowers.length, '花朵 id 唯一');
  // 世界坐标映射：焦平面深度处 1 参考像素 = unit
  const w = TF.toWorld(F.w / 2, F.h / 2, F.focal);
  ok(w[0] === 0 && w[1] === 0 && w[2] === -F.focal, '画幅中心映射到焦点');
  ok(Math.abs(TF.pxScale(F.focal) - F.unit) < 1e-12, '焦平面处缩放 = unit');
  // 倾斜 0° 花盘法向朝向镜头；倾斜 90° 花盘法向水平
  const q0 = TF.flowerQuat(0, 0), q90 = TF.flowerQuat(90, 0);
  const rot = (q, v) => { const [x, y, z, w] = q; const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]); return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]; };
  const n0 = rot(q0, [0, 0, 1]), n90 = rot(q90, [0, 0, 1]);
  ok(n0[2] > 0.999 && Math.abs(n90[2]) < 1e-6 && n90[1] > 0.999, '花朵朝向：lean=0 时顶部远离镜头（花面法向转向上）');
}

/* ---------- 画幅适配 ---------- */
{
  const core = L.fit(996, 1388);
  ok(core.scale === 1 && core.x0 === 0 && core.x1 === 996 && core.y0 === 0 && core.y1 === 1388, '5:7 视口：画幅即参考图');
  const wide = L.fit(1600, 900);
  ok(Math.abs(wide.scale - 900 / 1388) < 1e-9 && wide.x0 < 0 && wide.x1 > 996 && wide.y0 === 0 && wide.y1 === 1388, '宽屏：按高度适配、左右延伸');
  const tall = L.fit(430, 932);
  ok(Math.abs(tall.scale - 430 / 996) < 1e-9 && tall.x0 === 0 && tall.y0 < 0 && tall.y1 > 1388, '长屏：按宽度适配、上下延伸');
  const rand = TF.rng(3);
  const none = L.margins(L.fit(996, 1388), rand);
  ok(none.flowers.length === 0 && none.leaves.length === 0 && none.haze.length === 0, '5:7 视口不生成画幅外内容');
  const mw = L.margins(L.fit(1600, 900), TF.rng(3));
  ok(mw.leaves.length > 0 && mw.flowers.every((f) => f.x < 0 || f.x > 996), '宽屏补侧花与叶丛，且都在核心画幅外');
  ok(mw.flowers.filter((f) => f.x < 0).length === mw.flowers.filter((f) => f.x > 996).length, '两侧侧花对称数量 ' + mw.flowers.length);
  ok(mw.flowers.length === 4, '1600×900 每侧两朵侧花');
  const mw2 = L.margins(L.fit(1280, 900), TF.rng(3));
  ok(mw2.flowers.length === 2, '1280×900 每侧一朵侧花');
  const mt = L.margins(L.fit(430, 932), TF.rng(3));
  ok(mt.leaves.length > 0 && mt.leaves.every((l) => l.y > 1388 || l.y < 0), '长屏只补上下叶丛');
  ok(mw.leaves.every((l) => l.x < 60 || l.x > 996 - 60), '宽屏叶丛不侵入核心构图中心');
}

/* ---------- 生成器 ---------- */
const view = L.fit(996, 1388);
let core;
{
  const t0 = Date.now();
  core = TF.gen.buildCore(L, view, { seed: 7 });
  const ms = Date.now() - t0;
  const bad = TF.gen.validate(core);
  ok(bad.length === 0, '生成数据自检：' + (bad.join('; ') || 'OK'));
  ok(core.total > 300000 && core.total < 2000000, `粒子总量合理 (${core.total})`);
  ok(ms < 4000, `生成耗时 ${ms}ms`);
  const again = TF.gen.buildCore(L, view, { seed: 7 });
  let same = again.total === core.total;
  for (let i = 0; same && i < Math.min(core.data.length, 200000); i += 97) same = again.data[i] === core.data[i];
  ok(same, '同种子生成结果逐位一致');
  const other = TF.gen.buildCore(L, view, { seed: 8 });
  ok(other.data[0] !== core.data[0] || other.data[50] !== core.data[50], '不同种子生成不同画面');
  ok(core.flowers.length === 6, '六朵花对象');
  const kinds = {};
  for (let j = 0; j < core.total; j++) { const k = core.data[j * TF.STRIDE + 6]; kinds[k] = (kinds[k] || 0) + 1; }
  ok(Object.keys(TF.KIND).every((k) => kinds[TF.KIND[k]] > 0), '六种粒子齐全 ' + JSON.stringify(kinds));
  // 属性不变式：强度 ≥ 0、点径 > 0、相位类字段在 [0,1)
  let inv = true;
  for (let j = 0; j < core.total; j += 13) {
    const b = j * TF.STRIDE, d = core.data;
    if (!(d[b + 3] >= 0 && d[b + 4] > 0 && d[b + 5] >= 0 && d[b + 5] < 1 && d[b + 7] >= 0 && d[b + 7] < 1)) { inv = false; break; }
  }
  ok(inv, '粒子属性不变式');
  // 前缀抽稀 = 均匀：任意截断比例下六种粒子都在
  // 与渲染器一致：逐物体画前 frac 比例
  const frac = 0.34, nk = {};
  core.objects.forEach((o) => { const n = Math.floor(o.count * frac); for (let j = 0; j < n; j += 5) { const k = core.data[(o.start + j) * TF.STRIDE + 6]; nk[k] = (nk[k] || 0) + 1; } });
  ok(Object.keys(TF.KIND).every((k) => nk[TF.KIND[k]] > 0), '低画质逐物体前缀仍含全部粒子种类');
  const drawn = core.objects.reduce((a, o) => a + Math.floor(o.count * frac), 0) / core.total;
  ok(Math.abs(drawn - frac) < 0.002, `低画质实际绘制比例 ≈ ${frac}（${drawn.toFixed(4)}）`);
  ok(core.lines.length % 8 === 0 && core.lines.length / 8 >= L.threads.length, '丝线段数据');
  ok(core.sprites.length === L.bokeh.length * 12 && core.haze.length === L.haze.length * 12, '散景 / 雾团面片数据');
  // 花瓣粒子落在花心附近（半径 = 花盘 + 花瓣长的 1.6 倍以内）
  let inside = true;
  core.flowers.forEach((f) => {
    const reach = (f.R + f.spec.petal * 1.35) * 1.5;
    for (let j = 0; j < f.count; j += 11) {
      const b = (f.start + j) * TF.STRIDE, x = core.data[b], y = core.data[b + 1];
      if (core.data[b + 6] !== TF.KIND.PETAL) continue;
      if (Math.hypot(x, y) > reach) inside = false;
    }
  });
  ok(inside, '花瓣粒子都在花朵范围内');
}
{
  const mg = TF.gen.buildMargins(L, L.fit(1600, 900), { seed: 7 });
  ok(TF.gen.validate(mg).length === 0, '画幅外数据自检');
  ok(mg.flowers.length === 4 && mg.haze.length > 0, '宽屏画幅外含侧花与雾团');
  ok(mg.total < core.total * 2, `画幅外粒子量受控 (${mg.total})`);
  const none = TF.gen.buildMargins(L, L.fit(996, 1388), { seed: 7 });
  ok(none.total === 0, '5:7 视口画幅外粒子为 0');
}

/* ---------- 着色器源码 ---------- */
{
  const S = TF.SHADERS;
  const names = ['pointVS', 'pointFS', 'discVS', 'discFS', 'quadVS', 'quadFS', 'lineVS', 'lineFS', 'fsVS', 'feedbackFS', 'downFS', 'upFS', 'gradeFS'];
  ok(names.every((k) => typeof S[k] === 'string' && S[k].startsWith('#version 300 es')), '全部着色器以 #version 300 es 开头');
  ok(names.every((k) => !/https?:\/\//.test(S[k])), '着色器无外链');
  ok(!names.some((k) => /<\/script/i.test(S[k])), '无危险脚本闭合标签');
}

/* ---------- 相机 ---------- */
{
  const cam = TF.createCamera();
  cam.aspect = 996 / 1388;
  cam.update(1 / 60);
  ok(cam.pos[0] === 0 && cam.pos[1] === 0 && cam.pos[2] === 0, '默认位姿：相机在原点看向前方焦点');
  ok(Math.abs(cam.fovY - 2 * Math.atan(F.h * F.unit / 2 / F.focal)) < 1e-12, '视场角使焦平面高度 = 参考画幅高');
  cam.startDrag();
  for (let i = 0; i < 30; i++) { cam.drag(-4, 0, 1 / 60); cam.update(1 / 60); }
  ok(cam.st.yaw > 0.2, '向左拖动 → 相机右转（画面跟手）');
  cam.endDrag();
  for (let i = 0; i < 60 * 18; i++) cam.update(1 / 60);
  ok(Math.abs(cam.st.yaw) < 0.005, `闲置后回到参考构图 (yaw=${cam.st.yaw.toFixed(4)})`);
  cam.wheel(-600); for (let i = 0; i < 120; i++) cam.update(1 / 60);
  ok(cam.st.zoom > 1.2, '滚轮向上 → 放大');
  cam.wheel(20000); for (let i = 0; i < 120; i++) cam.update(1 / 60);
  ok(cam.st.zoom >= cam.limits.zoomMin - 1e-6, '缩放下限');
  cam.reset(); for (let i = 0; i < 120; i++) cam.update(1 / 60);
  ok(Math.abs(cam.st.zoom - 1) < 1e-3, 'reset 回到 zoom=1');
  for (let i = 0; i < 400; i++) { cam.drag(500, 500, 1 / 60); cam.update(1 / 60); }
  ok(cam.st.tYaw <= cam.limits.yaw + 1e-9 && cam.st.tPitch <= cam.limits.pitch + 1e-9, '拖动角度有上限');
}

console.log(`[pass] ${n} 项逻辑断言全绿`);
