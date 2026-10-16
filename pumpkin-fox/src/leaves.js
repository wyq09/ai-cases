// 彩蛋枫叶：单片叶形程序化画进 CanvasTexture（暖橙红棕、带叶脉），双面小面片循环飘落。
// 池化：setCount 只增删可见数量，不销毁已建 mesh，画质切换零重建成本。
export function createLeaves(THREE, opts = {}) {
  const PAL = [
    { f: '#d4622a', v: '#8a3d18' }, // 橙红
    { f: '#e08a32', v: '#9c5a1e' }, // 橙黄
    { f: '#a84f24', v: '#6e3014' }, // 棕红
  ];
  const texes = PAL.map((p) => leafTex(THREE, p));
  const geo = new THREE.PlaneGeometry(0.14, 0.14);
  const group = new THREE.Group();
  const pool = [];
  let active = 0;
  const R = opts.radius ?? 1.8;
  const TOP = opts.top ?? 3.4;
  const rnd = (r) => (Math.random() * 2 - 1) * r;

  function spawn(i) {
    const mat = new THREE.MeshBasicMaterial({
      map: texes[i % texes.length],
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(0.8 + Math.random() * 0.7);
    const L = {
      m,
      x: rnd(R), z: rnd(R), y: Math.random() * TOP,
      v: 0.16 + Math.random() * 0.22,            // 下落速度
      amp: 0.12 + Math.random() * 0.16,          // 摇摆幅度
      fq: 0.5 + Math.random() * 0.8,             // 摇摆频率
      ph: Math.random() * 6.283,
      wx: (Math.random() - 0.5) * 1.6,           // 自转角速度
      wy: (Math.random() - 0.5) * 2.0,
      wz: (Math.random() - 0.5) * 1.2,
    };
    m.visible = false;
    group.add(m);
    pool.push(L);
    return L;
  }
  for (let i = 0; i < Math.max(1, opts.count ?? 14); i++) spawn(i);

  function setCount(n) {
    n = Math.max(0, n | 0);
    while (pool.length < n) spawn(pool.length);
    active = n;
    for (let i = 0; i < pool.length; i++) pool[i].m.visible = i < n;
  }

  function update(dt, t) {
    for (let i = 0; i < active; i++) {
      const L = pool[i];
      L.y -= L.v * dt;
      if (L.y < 0.05) { L.y = TOP; L.x = rnd(R); L.z = rnd(R); } // 落地即回顶重生
      L.m.position.set(L.x + Math.sin(t * L.fq + L.ph) * L.amp, L.y, L.z + Math.cos(t * L.fq * 0.8 + L.ph) * L.amp);
      L.m.rotation.x += L.wx * dt;
      L.m.rotation.y += L.wy * dt;
      L.m.rotation.z += L.wz * dt;
    }
  }

  function dispose() {
    geo.dispose();
    texes.forEach((t) => t.dispose());
    pool.forEach((L) => L.m.material.dispose());
    group.clear();
  }

  return { group, update, setCount, dispose };
}

// 128² 画布：5 瓣枫叶轮廓（瓣尖 + 缺刻 + 深凹），叶基放射主脉 + 侧脉，叶柄。
function leafTex(THREE, pal) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const cx = S / 2, cy = S * 0.44, R = S * 0.4, d = Math.PI / 180;
  g.beginPath();
  let first = true;
  for (let i = 0; i < 5; i++) { // 胖瓣枫叶：宽瓣尖 + 浅缺刻，小尺寸下轮廓才读得出叶形
    const a0 = (-90 + i * 72) * d;
    for (const [a, r] of [[a0 - 22 * d, R * 0.66], [a0, R], [a0 + 22 * d, R * 0.66], [a0 + 36 * d, R * 0.40]]) {
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      first ? g.moveTo(x, y) : g.lineTo(x, y);
      first = false;
    }
  }
  g.closePath();
  g.fillStyle = pal.f;
  g.fill();
  const bx = cx, by = cy + R * 0.1; // 叶基（叶柄与叶片交点）
  g.strokeStyle = pal.v;
  g.lineCap = 'round';
  g.lineWidth = S * 0.03;
  g.beginPath();
  g.moveTo(cx, cy + R * 0.13);
  g.lineTo(cx, cy + R * 0.47);
  g.stroke();
  g.lineWidth = S * 0.014;
  for (let i = 0; i < 5; i++) {
    const a = (-90 + i * 72) * d;
    const tx = cx + Math.cos(a) * R * 0.88, ty = cy + Math.sin(a) * R * 0.88;
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(tx, ty);
    g.stroke();
    const mx = (bx + tx) / 2, my = (by + ty) / 2;
    for (const s of [-1, 1]) {
      const ba = a + s * 40 * d;
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(mx + Math.cos(ba) * R * 0.16, my + Math.sin(ba) * R * 0.16);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
