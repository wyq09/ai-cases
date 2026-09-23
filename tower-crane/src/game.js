/* ===== tower-crane game：状态机 + 渲染主循环 + 镜头 + 输入 + DOM 接线 + 测试钩子 ===== */
window.TC = window.TC || {};
TC.GAME = (() => {
  const core = TC.core;
  const LOGIC = TC.LOGIC;
  const Q = core.Q;
  const clamp = core.clamp, lerp = core.lerp;

  /* ---------- 视图 ---------- */
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  let dpr = 1, scale = 1, vw = 390, vh = 844, cx = 195;
  let skyC = null, cityFarC = null, cityNearC = null, bgImg = null;
  let clouds = [];

  /* ---------- 精灵 ---------- */
  let roomSprites = [], hookImg = null, cloudImgs = [], heartImg = null, menuImg = null;

  /* ---------- 状态 ---------- */
  const S = {
    mode: 'title',          // title | play | over | win
    phase: 'swing',         // swing | fall | miss | settle
    phaseT: 0,
    swingT: 0,
    hanging: true,
    tower: [],              // {x: 相对基座中心偏移, c: 调色板序号, born}
    floors: 0,
    score: 0, lives: 3, combo: 0, endless: false,
    target: 40,
    drop: null,
    rig: Q.rig || null,     // 'perfect' | 'miss' 强制下一次
    stats: { perfects: 0, greats: 0, goods: 0, misses: 0 },
    pendingOver: false,
    usage: 0, warned: false, noRespawn: false,
    debris: [],
    targetOv: Q.target ? +Q.target : null,
    livesOv: Q.lives ? +Q.lives : null,
  };
  const cam = { screen: 0, off: 0 }; // screen: 世界y=0映射到的屏幕y
  let cfg = TC.cfg;

  const $ = id => document.getElementById(id);

  /* ---------- 可缺模块安全调用 ---------- */
  function A0(mod, m, ...a) {
    const M = TC[mod];
    if (M && typeof M[m] === 'function') { try { return M[m](...a); } catch (e) { return null; } }
    return null;
  }
  const FXm = (m, ...a) => A0('FX', m, ...a);
  const AUm = (m, ...a) => A0('AUDIO', m, ...a);

  /* ---------- 工具 ---------- */
  function mkCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function imgFrom(src) {
    const im = new Image();
    im._ok = false;
    im.onload = () => { im._ok = true; };
    im.src = src;
    return im;
  }
  function drawCover(c, im, w, h) {
    const r = Math.max(w / im.width, h / im.height);
    const dw = im.width * r, dh = im.height * r;
    c.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  /* ---------- 几何 ---------- */
  const hookTopY = () => -30 + cfg.cableLen;
  const hookBlockCY = () => hookTopY() + 36 + cfg.blockH / 2;
  const stackTopScreen = () => cam.screen - S.floors * cfg.blockH;
  const topXRel = () => (S.floors === 0 ? 0 : S.tower[S.floors - 1].x);
  const camTarget = () => 0.66 * vh + S.floors * cfg.blockH;

  /* ---------- 静态层 ---------- */
  function rebuildStatic() {
    skyC = mkCanvas(vw, vh);
    const sc = skyC.getContext('2d');
    if (bgImg && bgImg._ok) drawCover(sc, bgImg, vw, vh);
    else if (TC.ART && TC.ART.paintSky) TC.ART.paintSky(sc, vw, vh);
    else {
      const g = sc.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, '#2e8fe0'); g.addColorStop(0.55, '#6fc0ee'); g.addColorStop(1, '#c9ecfa');
      sc.fillStyle = g; sc.fillRect(0, 0, vw, vh);
    }
    cityFarC = cityNearC = null;
    if (!(bgImg && bgImg._ok) && TC.ART && TC.ART.paintCity) {
      const ch = Math.round(vh * 0.45); // 只取屏幕下方条带，底对齐绘制
      cityFarC = mkCanvas(vw, ch);
      const t1 = mkCanvas(vw / 6, ch / 6);
      TC.ART.paintCity(t1.getContext('2d'), t1.width, t1.height, 0);
      const c1 = cityFarC.getContext('2d');
      c1.imageSmoothingEnabled = true; c1.drawImage(t1, 0, 0, vw, ch);
      cityNearC = mkCanvas(vw, ch);
      const t2 = mkCanvas(vw / 3, ch / 3);
      TC.ART.paintCity(t2.getContext('2d'), t2.width, t2.height, 1);
      const c2 = cityNearC.getContext('2d');
      c2.imageSmoothingEnabled = true; c2.drawImage(t2, 0, 0, vw, ch);
    }
  }
  function initClouds() {
    clouds = [];
    if (bgImg && bgImg._ok) return;
    const n = Math.round(clamp(vw / 80, 4, 8));
    for (let i = 0; i < n; i++) {
      clouds.push({
        v: i % 3,
        x: Math.random() * (vw + 200) - 100,
        y: vh * (0.03 + Math.random() * 0.2),
        s: 0.5 + Math.random() * 0.95,
        sp: 3 + Math.random() * 9,
      });
    }
  }
  function rebuildSprites() {
    roomSprites = []; hookImg = null;
    const pal = cfg.roomColors && cfg.roomColors.length ? cfg.roomColors : core.defaultCfg().roomColors;
    if (cfg.icons.room) {
      roomSprites = [imgFrom(cfg.icons.room)];
    } else if (TC.ART && TC.ART.room) {
      for (let i = 0; i < pal.length; i++) roomSprites.push(imgFrom(TC.ART.room(i)));
    }
    hookImg = cfg.icons.hook ? imgFrom(cfg.icons.hook)
      : (TC.ART && TC.ART.hook ? imgFrom(TC.ART.hook()) : null);
  }
  function roomSprite(i) {
    if (cfg.icons.room) return roomSprites[0];
    return roomSprites[i % Math.max(1, roomSprites.length)] || null;
  }
  function loadCustom() {
    bgImg = cfg.icons.bg ? imgFrom(cfg.icons.bg) : null;
    if (bgImg) bgImg.onload = () => { bgImg._ok = true; rebuildStatic(); initClouds(); };
    rebuildStatic(); initClouds();
  }

  /* ---------- 尺寸 ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    scale = Math.min(w / 390, h / 620);
    vw = w / scale; vh = h / scale; cx = vw / 2;
    cam.screen = cam.screen || camTarget();
    rebuildStatic(); initClouds();
    A0('FX', 'resize', Math.round(vw), Math.round(vh), 1);
  }

  /* ---------- HUD ---------- */
  let lastTgtKey = '';
  function updateHUD() {
    const row = document.querySelector('#panel .row');
    const key = S.endless ? 'endless' : 't' + S.target;
    if (row && key !== lastTgtKey) {
      lastTgtKey = key;
      row.innerHTML = S.endless
        ? '无尽挑战模式'
        : `目标 <b id="tgtNum">${S.target}</b> 层`;
    }
    $('curNum').textContent = S.floors;
    $('scoreNum').textContent = S.score;
    const hb = $('livesBox');
    if (heartImg && heartImg._ok) {
      let h = '';
      for (let i = 0; i < S.lives; i++) h += '<img src="' + heartImg.src + '" alt="命">';
      hb.innerHTML = h;
    } else hb.textContent = '♥'.repeat(Math.max(0, S.lives));
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------- 存档 ---------- */
  function saveRun() {
    if (S.mode !== 'play') return;
    TC.state.run = {
      xs: S.tower.map(b => b.x),
      cs: S.tower.map(b => b.c),
      score: S.score, lives: S.lives, combo: S.combo,
      endless: S.endless, target: S.target,
    };
    core.saveState(TC.state);
  }
  function clearRun() { TC.state.run = null; core.saveState(TC.state); }

  /* ---------- 流程 ---------- */
  function startRun(resume) {
    const run = resume ? TC.state.run : null;
    S.tower = [];
    if (run && Array.isArray(run.xs)) {
      run.xs.forEach((x, i) => S.tower.push({ x, c: (run.cs && run.cs[i]) || i, born: 0 }));
    }
    S.floors = S.tower.length;
    S.score = run ? run.score : 0;
    S.lives = Math.min(run ? run.lives : (S.livesOv || cfg.startLives), cfg.maxLives);
    S.combo = run ? run.combo : 0;
    S.endless = run ? !!run.endless : false;
    S.target = S.targetOv || (run && run.target) || cfg.targetFloors;
    S.stats = { perfects: 0, greats: 0, goods: 0, misses: 0 };
    S.pendingOver = false;
    S.debris = []; S.usage = 0; S.warned = false; S.noRespawn = false;
    S.rig = Q.rig || null;
    S.mode = 'play';
    S.phase = 'swing'; S.phaseT = 0; S.hanging = true;
    S.swingT = LOGIC.ramp(cfg, S.floors).period * 0.17;
    cam.screen = camTarget();
    hideOverlays();
    updateHUD();
    saveRun();
    AUm('setMuted', !!cfg.muted);
    AUm('setBGMVolume', cfg.bgmVolume); AUm('setSFXVolume', cfg.sfxVolume);
    AUm('startLoop', 'bgm');
  }
  function hideOverlays() {
    ['startOverlay', 'helpModal', 'overOverlay', 'winOverlay'].forEach(id => $(id).classList.remove('show'));
  }
  function refreshTitleUI() {
    const hasRun = TC.state.run && Array.isArray(TC.state.run.xs) && TC.state.run.xs.length > 0;
    $('btnResume').style.display = hasRun ? 'block' : 'none';
    if (hasRun) $('btnResume').textContent = `继续上楼（${TC.state.run.xs.length} 层）`;
    $('bestLine').textContent = `最高纪录 ${TC.state.best || 0} 分 · ${TC.state.bestFloors || 0} 层`;
  }
  function showTitle() {
    S.mode = 'title'; S.phase = 'swing'; S.hanging = true;
    S.tower = []; S.floors = 0; S.score = 0; S.lives = cfg.startLives; S.combo = 0; S.endless = false;
    cam.screen = camTarget();
    refreshTitleUI();
    hideOverlays();
    $('startOverlay').classList.add('show');
    updateHUD();
    AUm('stopLoop', 'bgm');
  }
  function gameOver() {
    S.mode = 'over';
    TC.state.games = (TC.state.games || 0) + 1;
    TC.state.best = Math.max(TC.state.best || 0, S.score);
    TC.state.bestFloors = Math.max(TC.state.bestFloors || 0, S.floors);
    clearRun();
    $('overStats').innerHTML =
      `本次成绩 <b>${S.score}</b> 分 · <b>${S.floors}</b> 层<br>完美落块 ${S.stats.perfects} 次 · 最高连击 ×${S.maxCombo || 1}<br>历史最佳 ${TC.state.best} 分 · ${TC.state.bestFloors} 层`;
    hideOverlays();
    $('overOverlay').classList.add('show');
    AUm('stopLoop', 'bgm'); AUm('play', 'over');
    updateHUD();
  }
  function winReached() {
    S.mode = 'win';
    TC.state.best = Math.max(TC.state.best || 0, S.score);
    TC.state.bestFloors = Math.max(TC.state.bestFloors || 0, S.floors);
    clearRun();
    $('winStats').innerHTML =
      `<b>${S.target}</b> 层达成！<br>本次 <b>${S.score}</b> 分 · 完美 ${S.stats.perfects} 次 · 剩余 ${S.lives} 命`;
    FXm('confetti', 90);
    AUm('play', 'win'); AUm('duck', 1500);
    setTimeout(() => { if (S.mode === 'win') { hideOverlays(); $('winOverlay').classList.add('show'); } }, 750);
    AUm('stopLoop', 'bgm');
    updateHUD();
  }

  /* ---------- 落块 ---------- */
  function release() {
    if (S.mode !== 'play' || S.phase !== 'swing') return;
    const topX = topXRel();
    const sw = LOGIC.swingX(cfg, S.floors, S.swingT);
    let x = sw.x;
    if (S.rig === 'perfect') x = topX;
    else if (S.rig === 'miss') x = topX + cfg.blockW * 0.8;
    S.rig = null;
    S.drop = {
      x: cx + x, y: hookBlockCY(),
      vx: cfg.carryVelocity ? sw.vx : 0,
      vy: 0, rot: 0,
      rotV: cfg.carryVelocity ? clamp(sw.vx * 0.004, -0.05, 0.05) : 0,
      c: S.tower.length,
    };
    S.phase = 'fall'; S.phaseT = 0; S.hanging = false;
    AUm('play', 'release');
  }

  /* ---------- 重心倒塌 ---------- */
  function topplingFX(st) {
    const dir = Math.sign(
      st.remain.length ? S.tower[S.tower.length - 1].x - S.tower[st.remain.length - 1].x : 1
    ) || 1;
    const now = performance.now();
    const n0 = S.tower.length;
    for (let i = st.remain.length; i < n0; i++) {
      const b = S.tower[i];
      S.debris.push({
        x: cx + b.x, y: cam.screen - (i + 0.5) * cfg.blockH,
        vx: dir * (60 + Math.random() * 140), vy: -(30 + Math.random() * 90),
        rot: 0, rotV: dir * (1.6 + Math.random() * 3), c: b.c,
      });
    }
    const lost = n0 - st.remain.length;
    S.tower.length = st.remain.length;
    S.floors = S.tower.length;
    S.combo = 0;
    S.lives--;
    FXm('shake', 14);
    FXm('dust', cx, cam.screen - S.floors * cfg.blockH, 14, '#cfc8b8');
    FXm('bigText', '楼塌了一截！', { sub: `掉落 ${lost} 层 · 剩 ${Math.max(0, S.lives)} 命`, color: '#e2574c' });
    AUm('play', 'miss', { pitch: 0.55 });
    AUm('duck', 900);
    S.warned = false;
    if (S.endlessPending && S.floors < S.target) S.endlessPending = false;
    if (S.lives <= 0) {
      S.noRespawn = true;
      setTimeout(() => { if (S.mode === 'play') gameOver(); }, 1100);
    }
  }

  function resolveLanding() {
    const d = S.drop;
    d.y = stackTopScreen() - cfg.blockH / 2;
    const res = LOGIC.resolveDrop(cfg, d.x - cx, topXRel());
    if (res.grade === 'miss') {
      S.phase = 'miss'; S.phaseT = 0;
      S.stats.misses++;
      S.combo = 0;
      S.lives--;
      FXm('shake', 12);
      FXm('bigText', '偏了！', { sub: S.lives > 0 ? `剩余 ${S.lives} 命` : '楼塌了…', color: '#5b7a9d' });
      AUm('play', 'miss');
      AUm('duck', 700);
      if (S.lives <= 0) S.pendingOver = true;
      updateHUD(); saveRun();
      return;
    }
    // 落块成功
    const comboWas = S.combo;
    if (res.grade === 'perfect') { S.combo++; S.stats.perfects++; } else { S.combo = 0; }
    if (res.grade === 'great') S.stats.greats++;
    if (res.grade === 'good') S.stats.goods++;
    S.tower.push({ x: res.landX, c: d.c, born: performance.now() });
    S.floors++;
    const pts = LOGIC.scoreFor(cfg, res.grade, S.combo);
    S.score += pts;
    const topSy = stackTopScreen() + cfg.blockH; // 落块前的楼顶线
    FXm('dust', cx + res.landX - cfg.blockW * 0.38, topSy, 7, '#e8e2d2');
    FXm('dust', cx + res.landX + cfg.blockW * 0.38, topSy, 7, '#e8e2d2');
    FXm('floatText', cx + res.landX, topSy - cfg.blockH, '+' + pts, { color: '#fff', size: 20 });
    if (res.grade === 'perfect') {
      FXm('confetti', 18 + Math.min(30, S.combo * 6));
      FXm('bigText', '完美！', { sub: S.combo > 1 ? `${S.combo} 连击` : '', color: '#ffb43a' });
      AUm('play', 'perfect');
      if (S.combo > 1) AUm('play', 'combo', { pitch: 1 + Math.min(1, S.combo * 0.08) });
    } else if (res.grade === 'great') {
      AUm('play', 'great');
    } else {
      AUm('play', 'good');
    }
    S.maxCombo = Math.max(S.maxCombo || 1, S.combo);
    // 重心物理：任一接口上方重心越出支撑面 → 上面整截翻倒坠落
    let toppled = false;
    if (cfg.topple) {
      const st = LOGIC.stability(cfg, S.tower.map(b => b.x));
      S.usage = st.usage;
      if (!st.stable) { topplingFX(st); toppled = true; }
    }
    if (!toppled) {
      if (S.usage > 0.8 && !S.warned) {
        S.warned = true;
        FXm('bigText', '重心不稳…', { sub: '再偏就要塌了', color: '#f2b53d' });
      }
      if (S.usage < 0.6) S.warned = false;
      if (!S.endless && S.floors % cfg.milestoneEvery === 0) {
        S.score += cfg.milestoneBonus;
        S.lives = Math.min(S.lives + cfg.milestoneLife, cfg.maxLives);
        FXm('bigText', `第 ${S.floors} 层！`, { sub: `+${cfg.milestoneBonus} 分${cfg.milestoneLife ? ' · +1 命' : ''}`, color: '#7cdcb4' });
        AUm('play', 'milestone');
      }
    }
    S.phase = 'settle'; S.phaseT = 0;
    updateHUD(); saveRun();
    if (!toppled && !S.endless && S.floors >= S.target) {
      S.endlessPending = true;
      setTimeout(() => { if (S.mode === 'play') winReached(); }, 800);
    }
  }

  /* ---------- 步进 ---------- */
  function step(dt) {
    S.phaseT += dt;
    // 坠落碎块（全模式都更新，楼塌演出在 game over 后继续落完）
    for (let i = S.debris.length - 1; i >= 0; i--) {
      const db = S.debris[i];
      db.vy += cfg.gravity * dt / 1000;
      db.x += db.vx * dt / 1000;
      db.y += db.vy * dt / 1000;
      db.rot += db.rotV * dt / 1000;
      if (db.y - cfg.blockH > vh + 160) S.debris.splice(i, 1);
    }
    // 云漂移
    for (const c of clouds) {
      c.x += c.sp * dt / 1000;
      if (c.x > vw + 140) c.x = -140;
    }
    if (S.mode !== 'play') { FXm('update', dt / 1000); return; }
    S.swingT += dt;
    // 相机：fall/miss 期间冻结
    if (S.phase !== 'fall' && S.phase !== 'miss') {
      cam.screen = lerp(cam.screen, camTarget(), clamp(cfg.camLerp * dt / 16.7, 0, 1));
    }
    // 下落物理（子步）
    if ((S.phase === 'fall' || S.phase === 'miss') && S.drop) {
      let left = dt;
      while (left > 0) {
        const h = Math.min(left, 16) / 1000;
        S.drop.vy += cfg.gravity * h;
        S.drop.y += S.drop.vy * h;
        S.drop.x += S.drop.vx * h;
        S.drop.rot += S.drop.rotV * h * 60;
        left -= 16;
      }
      if (S.phase === 'fall' && S.drop.y + cfg.blockH / 2 >= stackTopScreen()) resolveLanding();
      else if (S.phase === 'miss') {
        if (S.drop.y - cfg.blockH > vh + 120 || S.phaseT > 1400) {
          S.drop = null;
          if (S.pendingOver) { S.pendingOver = false; gameOver(); return; }
          S.phase = 'settle'; S.phaseT = -cfg.dropSpawnDelay * 0.6;
        }
      }
    }
    // settle → 回摆
    if (S.phase === 'settle' && S.phaseT >= cfg.dropSpawnDelay && !S.endlessPending && !S.noRespawn) {
      S.phase = 'swing'; S.phaseT = 0; S.hanging = true; S.drop = null;
    }
    // 托管 AI（带 0.3 回中习惯，防随机游走把塔摆到振幅边缘够不着）
    if (cfg.demo && S.phase === 'swing' && S.phaseT > 300) {
      const sw = LOGIC.swingX(cfg, S.floors, S.swingT);
      const aim = topXRel() * 0.7;
      if (Math.abs(sw.x - aim) <= cfg.perfectPct * cfg.blockW * 0.95) release();
    }
    FXm('update', dt / 1000);
  }

  /* ---------- 渲染 ---------- */
  function drawBlockSprite(spr, x, y, w, h, rot, squashT) {
    let sy = 1, sx = 1;
    if (squashT !== undefined && squashT < 1) {
      const k = Math.sin(Math.PI * squashT) * 0.2;
      sy = 1 - k; sx = 1 + k * 0.7;
    }
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.translate(0, h / 2);
    ctx.scale(sx, sy);
    ctx.translate(0, -h / 2);
    if (spr && spr._ok) ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    else {
      const pal = cfg.roomColors;
      ctx.fillStyle = pal && pal.length ? pal[0].body : '#ef6a5e';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function render() {
    const sh = FXm('shakeOffset') || { x: 0, y: 0 };
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.save();
    ctx.translate(sh.x / scale, sh.y / scale);
    // 1 天空
    if (skyC) ctx.drawImage(skyC, 0, 0, vw, vh);
    // 2 云（视差 0.12）
    const camOff = cam.screen - 0.66 * vh;
    for (const c of clouds) {
      const im = cloudImgs[c.v % Math.max(1, cloudImgs.length)];
      if (im && im._ok) {
        const w = 130 * c.s;
        ctx.globalAlpha = 0.92;
        ctx.drawImage(im, c.x, c.y + camOff * 0.12, w, w * 0.55);
        ctx.globalAlpha = 1;
      }
    }
    // 3 城市（视差 0.4，画布底对齐屏幕底）
    if (cityFarC) {
      const cy = vh - cityFarC.height + camOff * 0.4;
      ctx.drawImage(cityFarC, 0, cy, vw, cityFarC.height);
      if (cityNearC) ctx.drawImage(cityNearC, 0, cy + 26, vw, cityNearC.height);
    }
    // 4 基座
    const baseY = cam.screen;
    const bw = cfg.blockW + 46;
    ctx.fillStyle = '#b9c2cc';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(cx - bw / 2, baseY, bw, 64, 8); } else { ctx.rect(cx - bw / 2, baseY, bw, 64); }
    ctx.fill();
    ctx.fillStyle = '#d7dee6';
    ctx.fillRect(cx - bw / 2 + 5, baseY + 4, bw - 10, 12);
    // 警示斜纹
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - bw / 2 + 5, baseY + 40, bw - 10, 18); ctx.clip();
    ctx.fillStyle = '#f2c53d';
    ctx.fillRect(cx - bw / 2 + 5, baseY + 40, bw - 10, 18);
    ctx.fillStyle = '#3a3f45';
    for (let x0 = cx - bw / 2 - 20; x0 < cx + bw / 2 + 20; x0 += 22) {
      ctx.beginPath();
      ctx.moveTo(x0, baseY + 58); ctx.lineTo(x0 + 11, baseY + 58);
      ctx.lineTo(x0 + 22, baseY + 40); ctx.lineTo(x0 + 11, baseY + 40);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 5 塔块（重心失衡时整塔绕基座小幅摇摆，顶部摆幅≈swayMax px）
    const now = performance.now();
    const swayPx = cfg.topple ? Math.min(1, S.usage) * (cfg.swayMax || 0) : 0;
    const swayA = S.floors ? Math.sin(now * 0.0028) * swayPx / (S.floors * cfg.blockH) : 0;
    const cosA = Math.cos(swayA), sinA = Math.sin(swayA);
    for (let i = 0; i < S.tower.length; i++) {
      const b = S.tower[i];
      const rx = b.x, ry = -(i + 0.5) * cfg.blockH;
      const bx = cx + rx * cosA - ry * sinA;
      const bcy = cam.screen + rx * sinA + ry * cosA;
      if (bcy < -cfg.blockH * 2 || bcy > vh + cfg.blockH * 2) continue;
      const sq = b.born ? (now - b.born) / 190 : 2;
      drawBlockSprite(roomSprite(b.c), bx, bcy, cfg.blockW, cfg.blockH, swayA, sq);
    }
    // 5b 坠落碎块
    for (const db of S.debris) {
      drawBlockSprite(roomSprite(db.c), db.x, db.y, cfg.blockW, cfg.blockH, db.rot);
    }
    // 6 下落/坠塔块
    if (S.drop && (S.phase === 'fall' || S.phase === 'miss')) {
      drawBlockSprite(roomSprite(S.drop.c), S.drop.x, S.drop.y, cfg.blockW, cfg.blockH, S.drop.rot);
    }
    // 7 吊钩 + 悬挂块
    if (S.mode === 'play' && S.hanging) {
      const sw = LOGIC.swingX(cfg, S.floors, S.swingT);
      const hx = cx + sw.x, hy = hookTopY();
      const ang = Math.asin(clamp(sw.x / Math.max(1, cfg.cableLen), -1, 1)) * 0.22;
      ctx.strokeStyle = '#5a6470';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, -30); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(ang);
      if (hookImg && hookImg._ok) ctx.drawImage(hookImg, -18, 0, 36, 36);
      else { ctx.fillStyle = '#f2b53d'; ctx.fillRect(-12, 4, 24, 20); }
      const spr = roomSprite(S.tower.length);
      drawBlockSprite(spr, 0, 36 + cfg.blockH / 2, cfg.blockW, cfg.blockH, 0);
      ctx.restore();
    }
    // 8 FX
    const F = TC.FX;
    if (F && typeof F.draw === 'function') { try { F.draw(ctx); } catch (e) {} }
    ctx.restore();
  }

  /* ---------- 主循环（rAF + setInterval 双驱动） ---------- */
  let lastTs = performance.now(), lastRaf = performance.now(), stepping = false;
  function frame() {
    const now = performance.now();
    const dt = Math.min(now - lastTs, 100);
    lastTs = now; lastRaf = now;
    if (!stepping) { stepping = true; try { step(dt); render(); } finally { stepping = false; } }
    requestAnimationFrame(frame);
  }
  setInterval(() => {
    const now = performance.now();
    if (now - lastRaf > 250 && !stepping) { // rAF 被遮挡节流，interval 兜底
      stepping = true;
      try {
        const dt = Math.min(now - lastTs, 250);
        lastTs = now;
        step(dt); render();
      } finally { stepping = false; }
    }
  }, 120);

  /* ---------- 输入 ---------- */
  function onPress(e) {
    AUm('unlock');
    if (e && e.target !== cv) return;
    if (S.mode === 'play' && S.phase === 'swing') release();
  }
  window.addEventListener('pointerdown', onPress, { passive: true });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (S.mode === 'play' && S.phase === 'swing') { e.preventDefault(); release(); }
    }
  });

  /* ---------- DOM 接线 ---------- */
  function wire() {
    $('btnStart').addEventListener('click', () => { AUm('play', 'click'); startRun(false); });
    $('btnResume').addEventListener('click', () => { AUm('play', 'click'); startRun(true); });
    $('btnHelp').addEventListener('click', () => { AUm('play', 'click'); $('helpModal').classList.add('show'); });
    $('btnHelpClose').addEventListener('click', () => { AUm('play', 'click'); $('helpModal').classList.remove('show'); });
    $('btnSettings').addEventListener('click', () => { AUm('play', 'click'); A0('CFGP', 'open'); });
    $('menuBtn').addEventListener('click', () => { AUm('play', 'click'); A0('CFGP', 'open'); });
    $('btnRetry').addEventListener('click', () => { AUm('play', 'click'); startRun(false); });
    $('btnOverHome').addEventListener('click', () => { AUm('play', 'click'); showTitle(); });
    $('btnEndless').addEventListener('click', () => {
      AUm('play', 'click');
      S.endless = true; S.endlessPending = false; S.mode = 'play';
      S.phase = 'swing'; S.phaseT = 0; S.hanging = true;
      hideOverlays(); updateHUD(); saveRun();
      AUm('startLoop', 'bgm');
    });
    $('btnWinRetry').addEventListener('click', () => { AUm('play', 'click'); startRun(false); });
    // 配置面板回调整份快照
    if (TC.CFGP && TC.CFGP.onChange) {
      TC.CFGP.onChange(snap => {
        cfg = TC.cfg = snap;
        core.saveCfg(cfg);
        AUm('setMuted', !!cfg.muted);
        AUm('setBGMVolume', cfg.bgmVolume); AUm('setSFXVolume', cfg.sfxVolume);
        AUm('applyOverrides', cfg.sounds);
        rebuildSprites(); loadCustom(); updateHUD();
      });
    }
  }

  /* ---------- 启动 ---------- */
  function boot() {
    rebuildSprites();
    loadCustom();
    if (TC.ART && TC.ART.icon) {
      menuImg = imgFrom(TC.ART.icon('menu'));
      heartImg = imgFrom(TC.ART.icon('heart'));
      cloudImgs = [0, 1, 2].map(i => imgFrom(TC.ART.cloud(i)));
      $('menuBtn').innerHTML = '<img id="menuImgEl" alt="菜单" style="width:20px;height:20px">';
      $('menuImgEl').src = TC.ART.icon('menu');
      // 标题 LOGO 三块房间
      const ls = $('logoStack');
      ls.innerHTML = '';
      [2, 1, 0].forEach(i => {
        const im = document.createElement('img');
        const s = roomSprite(i);
        if (s && s.src) im.src = s.src;
        ls.appendChild(im);
      });
    }
    resize();
    wire();
    cam.screen = camTarget();
    updateHUD();
    refreshTitleUI();
    // URL 预置楼层（测试镜头/缩放）
    if (Q.floors) {
      const n = clamp(+Q.floors || 0, 0, 300);
      for (let i = 0; i < n; i++) S.tower.push({ x: 0, c: i, born: 0 });
      S.floors = n;
      startRun(false);
    }
    AUm('setMuted', !!cfg.muted);
    AUm('setBGMVolume', cfg.bgmVolume); AUm('setSFXVolume', cfg.sfxVolume);
    AUm('applyOverrides', cfg.sounds);
    requestAnimationFrame(frame);
  }

  /* ---------- 测试钩子 ---------- */
  window.__tc = {
    version: '1.0',
    get state() { return S; },
    get cfg() { return cfg; },
    get mode() { return S.mode; },
    get phase() { return S.phase; },
    get busy() { return S.mode === 'play' && (S.phase === 'fall' || S.phase === 'miss'); },
    drop: () => release(),
    setFloors(n, xs) {
      const arr = Array.isArray(xs) && xs.length ? xs : null;
      const count = arr ? arr.length : n;
      S.tower = [];
      for (let i = 0; i < count; i++) S.tower.push({ x: arr ? arr[i] : 0, c: i, born: 0 });
      S.floors = count;
      S.usage = cfg.topple && count >= 2 ? LOGIC.stability(cfg, S.tower.map(b => b.x)).usage : 0;
      cam.screen = camTarget(); updateHUD();
    },
    rig(g) { S.rig = g; },
    demo(on) { cfg.demo = !!on; },
    stats() { return JSON.parse(JSON.stringify(S.stats)); },
    save: () => { saveRun(); core.saveState(TC.state); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { startRun, showTitle, release, toast };
})();
