/* 鹈鹕骑车 · 游戏主控 —— 渲染循环、输入（键盘 / 指针 / 触屏）、镜头、事件字幕、时间流速、存档、测试钩子 */
(function () {
  'use strict';
  window.PM = window.PM || {};
  var PM = window.PM, S = PM.SIM, T = PM.TERRAIN, K = S.K;
  var STORE = 'pm_moon_v1', RATIO = S.ratio();
  var CAM_PRESETS = ['cine', 'chase', 'side', 'front', 'wide', 'earth'];
  var CAM_NAME = { cine: '环绕', chase: '追尾', side: '侧面', front: '前方', wide: '远景', earth: '地球' };
  var TIME_MODES = [['实时', 1], ['1 秒 = 1 小时', 3600], ['1 秒 = 1 天', 86400]];
  var CAM_KEYS = { '1': 'cine', '2': 'chase', '3': 'side', '4': 'front', '5': 'wide', '6': 'earth' };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var wrapA = function (a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  var fmt = function (v, d) { return v.toFixed(d === undefined ? 1 : d); };
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* 隐私模式 */ } }

  function Game(opts) {
    opts = opts || {};
    var g = this;
    g.opts = opts;
    var q = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = p[1] === undefined ? true : decodeURIComponent(p[1]); });
    g.query = q;
    if (q.reset) { try { localStorage.removeItem(STORE); } catch (e) {} }
    g.store = load();

    var canvas = document.getElementById('view');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    var basePR = q.q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(basePR);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
    g.renderer = renderer; g.canvas = canvas; g.basePR = basePR;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
    g.scene = scene; g.camera = camera;

    PM.UI.loading(0.15, '正在生成月面');
    var field = g.field = T.generate((parseInt(q.seed, 10) || T.SEED) >>> 0);
    PM.UI.loading(0.45, '正在点亮地球');
    var world = g.world = new PM.World(renderer, scene, camera, field, { low: q.q === 'low' });
    if (q.time !== undefined) { world.clock = (parseFloat(q.time) - S.DEFAULT_PHASE) * S.DAY * 86400; }
    PM.UI.loading(0.8, '鹈鹕正在上车');
    var bike = g.bike = new S.Bike(T.adapter(field), { seed: 7 });
    var ap = g.autopilot = new S.Autopilot(bike);
    var rider = g.rider = PM.createRider(world.uSunVis, world.uSunDir);
    scene.add(rider.group);

    // 存档：已发现的知识牌、纪录、里程、静音
    var st = g.store;
    if (st.found) st.found.forEach(function (id) { var p = field.plaques[id]; if (p && !p.found) { p.found = true; bike.discovered[id] = true; bike.foundCount++; } });
    if (st.records) Object.assign(bike.records, st.records);
    if (st.odo) bike.dist = st.odo;
    if (st.maxNoHands) bike.maxNoHands = st.maxNoHands;
    g.dirty = false;
    g.persist = function () {
      var cur = load();
      save({ found: field.plaques.filter(function (p) { return p.found; }).map(function (p) { return p.id; }), records: bike.records, odo: bike.dist, maxNoHands: bike.maxNoHands, muted: !!cur.muted });
      g.dirty = false;
    };

    /* ── 状态 ── */
    g.mode = 'auto'; g.idleLeft = 8; g.blend = 0;
    g.keys = {}; g.touch = {}; g.handsToggle = false; g.handsBlend = 0;
    g.slow = false; g.timeIdx = 0; g.preset = CAM_PRESETS.indexOf(q.cam) >= 0 ? q.cam : 'cine';
    g.cam = { az: 0, el: 0.045, dist: 6.3, azOff: 0, elOff: 0, distMul: 1, tx: 0, ty: 1, tz: 0 };
    g.prevVy = 0; g.prevV = 0; g.aUp = K.G_MOON; g.aFore = 0;
    g.t = 0; g.frameMs = 16; g.caps = {}; g.fps = 60; g.fpsAcc = 0; g.fpsN = 0;
    g.manual = { throttle: 0, brake: 0, steer: 0, handsOff: false };
    g.input = { throttle: 0, brake: 0, steer: 0, pitch: 0, handsOff: false };
    g.paused = false;

    /* ── 尺寸 ── */
    g.resize = function () {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = g.portrait() ? 58 : (g.preset === 'wide' || g.preset === 'earth' ? 52 : 50);
      camera.updateProjectionMatrix();
      world.resize(w, h);
    };
    g.portrait = function () { return window.innerHeight > window.innerWidth * 1.15; };
    window.addEventListener('resize', g.resize);
    g.resize();

    /* ── 输入 ── */
    var DRIVE = { w: 1, s: 1, a: 1, d: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
    g.driveDown = function () {
      var k = g.keys, t = g.touch;
      return !!(k.w || k.s || k.a || k.d || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight || t.pedal || t.brake || t.left || t.right);
    };
    g.takeControl = function () { if (g.mode !== 'manual') { g.mode = 'manual'; g.handsToggle = false; } g.idleLeft = 8; };
    g.bell = function () {
      rider.bell(); PM.AUDIO.play('bell');
      PM.UI.caption('车铃：真空里 <b>0 dB</b> —— 只有握着车把的翅膀能感觉到它在震', 4200);
    };
    g.hop = function () { g.takeControl(); bike.hop(); };
    g.toggleHands = function () {
      g.takeControl(); g.handsToggle = !g.handsToggle;
      if (g.handsToggle) PM.UI.caption('撒把。没有人往倒的方向打车把了，车会慢慢倾 —— 月面上慢 2.46 倍', 3800);
      PM.UI.touchState('hands', g.handsToggle);
    };
    window.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (PM.UI.panelVisible() && k === 'Escape') { PM.UI.setPanel(false); e.preventDefault(); return; }
      if (k in DRIVE) { g.keys[k] = true; g.takeControl(); e.preventDefault(); return; }
      switch (k) {
        case ' ': g.hop(); e.preventDefault(); break;
        case 'f': if (!g.keys.f) g.toggleHands(); g.keys.f = true; break;
        case 'b': if (!g.keys.b) g.bell(); g.keys.b = true; break;
        case 'c': g.setPreset(CAM_PRESETS[(g.presetIdx() + 1) % CAM_PRESETS.length]); break;
        case 'e': g.setPreset('earth'); break;
        case 'm': g.setMuted(!PM.AUDIO.isMuted()); break;
        case 'h': case '?': PM.UI.setPanel(PM.UI.panelVisible() ? false : true); break;
        case 't': g.setTime(g.timeIdx + 1); break;
        case 'k': g.slow = !g.slow; PM.UI.caption(g.slow ? '慢动作 0.3×：看看低重力下落有多慢' : '恢复正常速度', 1800); break;
        case 'r': g.resetRide(); break;
        case 'Escape': PM.UI.hideCard(); break;
      }
      if (CAM_KEYS[k]) g.setPreset(CAM_KEYS[k]);
    });
    window.addEventListener('keyup', function (e) { var k = e.key.length === 1 ? e.key.toLowerCase() : e.key; g.keys[k] = false; });
    window.addEventListener('blur', function () { g.keys = {}; });

    // 指针：拖动环绕、滚轮缩放、双指捏合
    var ptrs = {}, lastPinch = 0;
    canvas.addEventListener('pointerdown', function (e) {
      PM.AUDIO.unlock();
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
      var ids = Object.keys(ptrs); if (ids.length === 2) lastPinch = pinchDist();
    });
    function pinchDist() { var ids = Object.keys(ptrs); return Math.hypot(ptrs[ids[0]].x - ptrs[ids[1]].x, ptrs[ids[0]].y - ptrs[ids[1]].y); }
    canvas.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return;
      var p = ptrs[e.pointerId], ids = Object.keys(ptrs);
      if (ids.length === 2) { p.x = e.clientX; p.y = e.clientY; var d = pinchDist(); if (lastPinch) g.cam.distMul = clamp(g.cam.distMul * lastPinch / d, 0.5, 4.5); lastPinch = d; return; }
      g.cam.azOff -= (e.clientX - p.x) * 0.005; g.cam.elOff = clamp(g.cam.elOff + (e.clientY - p.y) * 0.004, -0.1, 1.25);
      p.x = e.clientX; p.y = e.clientY;
      g.userCamT = 0;
    });
    function endPtr(e) { delete ptrs[e.pointerId]; if (!Object.keys(ptrs).length) canvas.classList.remove('dragging'); lastPinch = 0; }
    canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); g.cam.distMul = clamp(g.cam.distMul * Math.exp(e.deltaY * 0.0012), 0.5, 4.5); }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    PM.UI.init({
      onMute: function () { g.setMuted(!PM.AUDIO.isMuted()); },
      onCam: function () { g.setPreset(CAM_PRESETS[(g.presetIdx() + 1) % CAM_PRESETS.length]); },
      onTime: function () { g.setTime(g.timeIdx + 1); },
      onTouch: function (name, down) {
        PM.AUDIO.unlock();
        g.touch[name] = down;
        if (!down) return;
        if (name === 'hop') g.hop();
        else if (name === 'hands') g.toggleHands();
        else if (name === 'bell') g.bell();
        else g.takeControl();
      }
    });
    PM.UI.touchState('hands', false);

    g.presetIdx = function () { return CAM_PRESETS.indexOf(g.preset); };
    g.cycleCam = function () { return CAM_PRESETS[(g.presetIdx() + 1) % CAM_PRESETS.length]; };
    g.setPreset = function (p) {
      g.preset = CAM_PRESETS.indexOf(p) >= 0 ? p : 'cine'; PM.AUDIO.play('click');
      PM.UI.caption('镜头 · ' + CAM_NAME[p], 1500);
      g.resize();
    };
    g.setTime = function (i) {
      g.timeIdx = ((i % TIME_MODES.length) + TIME_MODES.length) % TIME_MODES.length; PM.AUDIO.play('click');
      var tip = ['时间按真实流速走：太阳每个地球日只移动 12°', '时间加速：1 秒 = 1 小时。看影子慢慢转', '时间加速：1 秒 = 1 天，约 30 秒过完一个昼夜。夜里只剩地球照和车灯（亮度已放大）'][g.timeIdx];
      PM.UI.caption(tip, 3600);
    };
    g.setMuted = function (m) { PM.AUDIO.setMuted(m); PM.UI.setMuted(m); g.muted = m; var cur = load(); cur.muted = m; save(cur); };
    g.setMuted(q.muted ? true : !!load().muted);
    g.resetRide = function () {
      bike.reset(0, 0, Math.PI / 2); ap.reset(); world.lastCell = null; g.mode = 'auto'; g.handsToggle = false; g.camReady = false;
      PM.UI.caption('回到营地', 1500);
    };

    /* ── 事件 → 字幕 / 音效 ── */
    function once(key, cool) { var now = g.t; if (g.caps[key] && now - g.caps[key] < cool) return false; g.caps[key] = now; return true; }
    g.onEvents = function (evs) {
      for (var i = 0; i < evs.length; i++) {
        var e = evs[i];
        switch (e.type) {
          case 'land':
            PM.AUDIO.play('land', { volume: clamp(e.impact / 1.5, 0.25, 1) });
            if (e.air > 0.45 && once('land', 3)) {
              var big = e.air >= bike.records.air - 1e-6 && e.air > 1.2;
              PM.UI.caption((big ? '<b>新纪录</b> · ' : '') + '腾空 <b>' + fmt(e.air, 2) + ' s</b> · 最高 <b>' + fmt(e.apex, 2) + ' m</b> · 飞了 <b>' + fmt(e.jump, 1) + ' m</b><br>' +
                '同样的起跳放在地球上：' + fmt(e.air / RATIO, 2) + ' s · ' + fmt(e.apex / RATIO, 2) + ' m · ' + fmt(e.jump / RATIO, 1) + ' m', 5200);
            }
            break;
          case 'takeoff': if (e.hop) { PM.AUDIO.play('hop'); if (once('hop', 20)) PM.UI.caption('起跳速度只取决于腿的冲量；滞空多久由 g 决定 —— 月面是地球的 6 倍', 3600); } break;
          case 'discover': PM.AUDIO.play('discover'); PM.UI.card(field.plaques[e.id], field.plaques.length); g.dirty = true; break;
          case 'slip': PM.AUDIO.play('slip'); if (once('slip', 14)) PM.UI.caption('后轮空转：腿力 90 N > 月壤抓地 60 N（正压力只有地球的 1/6）', 3800); break;
          case 'skid': if (once('skid', 14)) PM.UI.caption('后轮抱死 —— 月面刹车距离是地球的 6 倍，拖痕会留几百万年', 3800); break;
          case 'release': PM.UI.caption('撒把。倒下的快慢由 √(L/g) 决定，月面上慢 2.46 倍', 3000); break;
          case 'grab':
            if (e.held > 0.5) PM.UI.caption('撒把坚持了 <b>' + fmt(e.held, 2) + ' s</b> —— 同样的反应时间，在地球上只剩一半', 3200);
            PM.AUDIO.play('grab'); break;
          case 'fall':
            PM.AUDIO.play('thud', { volume: 0.4 });
            PM.UI.caption(e.cause === 'rock' ? '撞上石块：月面刹车距离是地球的 6 倍，躲不及' : '倒啦 —— 月面上倒得慢，摔得也轻：动能只有地球的 1/6', 4200, true);
            break;
          case 'thud': PM.AUDIO.play('thud'); break;
          case 'bump': PM.AUDIO.play('land', { volume: 0.5 }); if (once('bump', 10)) PM.UI.caption('压到石头，当跳台了', 2400); break;
        }
      }
    };

    /* ── 相机 ── */
    var target = new THREE.Vector3(0, 1, 0), viewDir = new THREE.Vector3(), camPos = new THREE.Vector3();
    g.updateCamera = function (dt) {
      var c = g.cam, yaw = bike.yaw, locked = !!g.camLock;
      var fx = Math.cos(yaw), fz = -Math.sin(yaw), lx = -Math.sin(yaw), lz = -Math.cos(yaw);
      var wantAz, wantEl, wantDist;
      g.userCamT = (g.userCamT || 0) + dt;
      switch (g.preset) {
        case 'chase': wantAz = -yaw + 0.42; wantEl = 0.26; wantDist = 7.4; break;                 // 后侧 3/4，偏向受光的一面
        case 'side': wantAz = Math.atan2(lz, lx) + Math.PI; wantEl = 0.10; wantDist = 8.2; break;  // 与车并行，看受光的左侧
        case 'front': wantAz = Math.atan2(fz, fx) + Math.PI - 0.55; wantEl = 0.12; wantDist = 7.6; break;
        case 'wide': wantAz = (g.userCamT > 6 ? 0.14 * Math.sin(g.t * 0.1) : 0); wantEl = 0.14; wantDist = 17; break;
        case 'earth': wantAz = Math.atan2(S.EARTH_DIR[2], S.EARTH_DIR[0]); wantEl = -0.12; wantDist = 8.6; break;    // 微仰视：地球落在天空中部，不顶到顶部 HUD
        default: wantAz = (g.userCamT > 6 ? 0.16 * Math.sin(g.t * 0.11) : 0) + (g.portrait() ? S.EARTH_AZ : 0); wantEl = 0.045; wantDist = g.portrait() ? 6.8 : 6.3;   // 低机位：地平线上方留给地球；竖屏视场窄，镜头转向地球方位
      }
      if (locked) wantAz = c.az;                                            // 自动化：相机完全由外部指定
      var k1 = locked ? 1 : 1 - Math.exp(-dt * 2.6), k2 = locked ? 1 : 1 - Math.exp(-dt * 10);
      if (locked) { wantAz = c.az - c.azOff; wantEl = c.el - c.elOff; wantDist = c.dist / c.distMul; }
      c.az += wrapA(wantAz + c.azOff - c.az) * k1;
      c.el += (wantEl + c.elOff - c.el) * k1;
      c.dist += (wantDist * c.distMul - c.dist) * k1;
      target.set(bike.x + (locked ? c.lookX || 0 : 0), bike.y + (locked && c.lookY !== undefined ? c.lookY : 1.0), bike.z + (locked ? c.lookZ || 0 : 0));
      if (!g.camReady) { c.tx = target.x; c.ty = target.y; c.tz = target.z; g.camReady = true; }   // 第一帧直接对准车：别从世界原点飞过来
      c.tx += (target.x - c.tx) * k2; c.ty += (target.y - c.ty) * k2; c.tz += (target.z - c.tz) * k2;
      var ce = Math.cos(c.el);
      viewDir.set(Math.cos(c.az) * ce, -Math.sin(c.el), Math.sin(c.az) * ce);     // el > 0：镜头高于目标向下看
      camPos.set(c.tx, c.ty, c.tz).addScaledVector(viewDir, -c.dist);
      var minY = T.heightMesh(field, camPos.x, camPos.z) + 0.45;
      if (camPos.y < minY) camPos.y = minY;
      camera.position.copy(camPos);
      camera.lookAt(c.tx, c.ty + 0.12, c.tz);
    };

    /* ── 主循环 ── */
    var last = performance.now(), saveT = 0, tmp = new THREE.Vector3();
    g.tick = function (dt) { g.stepFrame(dt, dt); };
    g.frame = function (now) {
      var dtRaw = clamp((now - last) / 1000, 0, 0.06); last = now;
      g.stepFrame(dtRaw, dtRaw);
      if (!g.stopped && !g.noRAF) requestAnimationFrame(g.frame);
    };
    g.stepFrame = function (dtRaw, dt) {
      g.frameMs = g.frameMs * 0.9 + (dtRaw * 1000) * 0.1;
      var dt = g.paused ? 0 : dtRaw;
      g.t += dt;
      var dtSim = dt * (g.slow ? 0.3 : 1);

      // 输入：手动 / 自动驾驶，带过渡
      if (g.driveDown()) g.takeControl();
      ap.noHop = g.mode === 'manual';
      ap.decide(dtSim);
      if (g.mode === 'manual') {
        if (!g.driveDown()) { g.idleLeft -= dt; if (g.idleLeft <= 0) { g.mode = 'auto'; g.handsToggle = false; ap.reset(); PM.UI.touchState('hands', false); } }
        else g.idleLeft = 8;
        if (g.testManual) g.idleLeft = 8;                     // 自动化：手动模式不交还
      }
      g.blend += ((g.mode === 'manual' ? 1 : 0) - g.blend) * Math.min(1, dt * 6);
      var k = g.keys, tc = g.touch, m = g.manual;
      m.throttle = (k.w || k.ArrowUp || tc.pedal) ? 1 : 0;
      m.brake = (k.s || k.ArrowDown || tc.brake) ? 1 : 0;
      m.steer = ((k.d || k.ArrowRight || tc.right) ? 1 : 0) - ((k.a || k.ArrowLeft || tc.left) ? 1 : 0);
      m.pitch = m.throttle - m.brake;
      m.handsOff = g.handsToggle;
      var a = ap.input, inp = g.input;
      inp.throttle = a.throttle + (m.throttle - a.throttle) * g.blend;
      inp.brake = a.brake + (m.brake - a.brake) * g.blend;
      inp.steer = a.steer + (m.steer - a.steer) * g.blend;
      inp.pitch = m.pitch * g.blend;
      inp.handsOff = g.mode === 'manual' && g.handsToggle;
      ap.noHop = g.mode === 'manual';                     // 手动时不许自动驾驶自己跳
      if (g.paused) inp.throttle = inp.brake = 0;

      // 物理（固定步长）
      var v0 = bike.v, vy0 = bike.vy;
      bike.update(dtSim, inp);
      if (dtSim > 0) {
        var aUpRaw = bike.grounded ? ((bike.vy - vy0) / dtSim + K.G_MOON) : 0;
        g.aUp += (aUpRaw - g.aUp) * Math.min(1, dt * 12);
        g.aFore += (-(bike.v - v0) / dtSim - g.aFore) * Math.min(1, dt * 8);
      }
      if (bike.jumpX || bike.jumpZ) { g.cam.tx += bike.jumpX; g.cam.tz += bike.jumpZ; world.shift(bike.jumpX, bike.jumpZ); }   // 跨过坐标边界：相机和车辙跟着世界一起挪
      var evs = bike.drain();
      g.onEvents(evs);
      g.dirty = g.dirty || evs.some(function (e) { return e.type === 'land' || e.type === 'discover' || e.type === 'grab'; });

      // 姿态
      g.handsBlend += ((inp.handsOff ? 1 : 0) - g.handsBlend) * Math.min(1, dt * 5);
      rider.pose(dtSim, bike, {
        drive: bike.driveF, air: !bike.grounded, handsOff: g.handsBlend, aUp: g.aUp, aFore: g.aFore,
        lookYaw: g.lookYaw(), lookPitch: bike.grounded ? -0.10 : 0.08
      });
      var night = world.sky.sunAlt < 0.03;
      rider.setLamp(night);

      g.updateCamera(dt);
      world.update(dt, bike, bike, TIME_MODES[g.timeIdx][1], renderer.getPixelRatio());
      world.addTracks(bike.trackQueue.splice(0, bike.trackQueue.length));
      world.render();

      // 音频 / HUD
      PM.AUDIO.update(dt, { v: bike.v, grounded: bike.grounded, drive: bike.driveF, crank: bike.crank, effort: inp.throttle }, g.t);
      g.hud(dt);

      // 自适应分辨率：连续掉帧就降像素比
      g.fpsAcc += dtRaw; g.fpsN++;
      if (g.fpsN >= 45) {
        g.fps = g.fpsN / Math.max(g.fpsAcc, 1e-3);
        if (g.fps < 34 && renderer.getPixelRatio() > 1 && q.q !== 'high') { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25)); g.resize(); }
        g.fpsAcc = 0; g.fpsN = 0;
      }
      saveT += dtRaw;
      if (g.dirty && saveT > 5) { g.persist(); saveT = 0; }
    };

    // 鹈鹕朝镜头张望：取镜头在鹈鹕坐标系里的方位角
    g.lookYaw = function () {
      rider.pelican.updateWorldMatrix(true, false);
      tmp.copy(camera.position); rider.pelican.worldToLocal(tmp);
      if (tmp.x < 0.25 || tmp.z > 0.45 || Math.abs(tmp.y - 0.9) > 0.8) return 0;
      return clamp(Math.atan2(-tmp.z, tmp.x), -0.62, 0.62);
    };

    g.hud = function (dt) {
      var v = bike.v, heading = -bike.yaw;
      var next = null, nd = 1e18;
      for (var i = 0; i < field.plaques.length; i++) { var p = field.plaques[i]; if (p.found) continue; var d = bike.gap(p.x, p.z, bike.x, bike.z); if (d < nd) { nd = d; next = p; } }
      var marks = [];
      if (next) marks.push({ b: Math.atan2(T.dWrap(next.z - bike.z), T.dWrap(next.x - bike.x)), color: '#ffa21f', shape: 'd', label: nd >= 1000 ? (nd / 1000).toFixed(1) + 'k' : String(Math.round(nd / 10) * 10) });
      var cd = bike.gap(T.CAMP.x, T.CAMP.z, bike.x, bike.z);
      if (cd > 14) marks.push({ b: Math.atan2(T.dWrap(T.CAMP.z - bike.z), T.dWrap(T.CAMP.x - bike.x)), color: 'rgba(236,235,230,0.75)', shape: 's', label: '营' });
      marks.push({ b: Math.atan2(S.EARTH_DIR[2], S.EARTH_DIR[0]), color: '#8fc3ff', shape: 'o', label: '地球' });
      var sky = world.sky, alt = sky.sunAlt * 180 / Math.PI, day = world.phase;
      var live = {
        jump: '最近一跳：滞空 <em>' + fmt(bike.records.air, 2) + ' s</em> · 最高 <em>' + fmt(bike.records.apex, 2) + ' m</em> · 飞了 <em>' + fmt(bike.records.jump, 1) + ' m</em>　——　在地球上 ' + fmt(bike.records.air / RATIO, 2) + ' s · ' + fmt(bike.records.apex / RATIO, 2) + ' m · ' + fmt(bike.records.jump / RATIO, 1) + ' m',
        crest: v > 0.3 ? '当前 ' + fmt(v * 3.6, 0) + ' km/h：曲率半径小于 <em>' + fmt(v * v / K.G_MOON, 1) + ' m</em> 的坡顶就会起飞 —— 同一个坡在地球上要快 ' + fmt(Math.sqrt(S.ratio()), 2) + ' 倍才飞得起来' : '速度越高，能把你抛起来的坡越缓（临界半径 = v²/g）',
        brake: v > 0.2 ? '此刻 ' + fmt(v * 3.6, 0) + ' km/h 刹停要 <em>' + fmt(S.brakeDistance(v, K.G_MOON), 0) + ' m</em>（地球 ' + fmt(S.brakeDistance(v, K.G_EARTH), 1) + ' m）· 减速度上限 ' + fmt(S.brakeDecel(K.G_MOON), 2) + ' m/s²' : '停着。月面刹停距离 = 地球的 6.05 倍',
        turn: '此刻倾角 ' + Math.round(Math.abs(bike.lean * 180 / Math.PI)) + '° → 半径 <em>' + fmt(S.turnRadius(Math.max(v, 0.1), K.G_MOON, Math.abs(bike.lean) || 0.01), 0) + ' m</em>（地球 ' + fmt(S.turnRadius(Math.max(v, 0.1), K.G_EARTH, Math.abs(bike.lean) || 0.01), 0) + ' m）',
        cone: '侧向加速度上限 μg = <em>' + fmt(K.MU * K.G_MOON, 2) + ' m/s²</em>（地球 ' + fmt(K.MU * K.G_EARTH, 2) + '）· 此刻横向 ' + fmt(Math.abs(v * bike.omega) / K.G_MOON, 2) + ' g',
        coast: v > 0.2 ? '不踩能滑 <em>' + fmt(S.coastDistance(v, K.G_MOON), 0) + ' m</em> · ' + fmt(S.coastTime(v, K.G_MOON), 0) + ' s（地球 ' + fmt(S.coastDistance(v, K.G_EARTH), 0) + ' m）· 平地极速 ' + fmt(K.CADENCE_MAX * S.development() * 3.6, 0) + ' km/h' : '滚动阻力只有 Crr·mg = ' + (K.CRR * K.MASS * K.G_MOON).toFixed(1) + ' N',
        climb: '起步时腿力 90 N > 后轮抓地 60 N → 空转。10° 坡：月面蹬得上去，地球蹬不动',
        hands: '撒把最长坚持 <em>' + fmt(bike.maxNoHands, 2) + ' s</em> · 从 2° 倒到 23°：月面 ' + fmt(S.fallTime(0.035, 0.4, K.G_MOON), 2) + ' s，地球 ' + fmt(S.fallTime(0.035, 0.4, K.G_EARTH), 2) + ' s',
        bell: '车铃声压级：<em>0 dB</em>（真空）· 骨传导 "嗒"',
        sky: '太阳高度 <em>' + fmt(alt, 1) + '°</em> · 月表 ' + (sky.tempK - 273.15 > 0 ? '+' : '') + fmt(sky.tempK - 273.15, 0) + ' °C · 太阳颜色恒定',
        earth: '此刻地球 <em>' + fmt(sky.earthLit * 100, 0) + '%</em> 被照亮 · 角直径 1.90°',
        day: '月昼第 <em>' + fmt(day * S.DAY, 1) + '</em> 天 / ' + fmt(S.DAY, 1) + ' 天 · 流速：' + TIME_MODES[g.timeIdx][0]
      };
      PM.UI.update(dt, {
        speed: v * 3.6, agl: bike.heightAGL, air: !bike.grounded, lean: bike.lean * 180 / Math.PI, latg: Math.abs(v * bike.omega) / 9.80665,
        odo: bike.dist, found: bike.foundCount, mode: g.mode, idleLeft: Math.max(0, Math.ceil(g.idleLeft)),
        timeMain: (alt >= 0 ? '月昼 ' : '月夜 ') + String(Math.floor(day * S.DAY)).padStart(2, '0') + '.' + String(Math.floor((day * S.DAY % 1) * 10)) + ' 天 · 太阳 ' + (alt >= 0 ? '+' : '') + fmt(alt, 0) + '°',
        timeSub: TIME_MODES[g.timeIdx][0],
        brake: S.brakeDistance(Math.max(v, 0), K.G_MOON), brakeE: S.brakeDistance(Math.max(v, 0), K.G_EARTH),
        coast: S.coastDistance(Math.max(v, 0), K.G_MOON), coastE: S.coastDistance(Math.max(v, 0), K.G_EARTH),
        heading: heading, camBearing: g.cam.az, camHalf: Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect),
        marks: marks, live: live
      });
    };

    g.snapshot = function () {
      return {
        mode: g.mode, preset: g.preset, timeIdx: g.timeIdx, slow: g.slow, fps: g.fps, pr: renderer.getPixelRatio(),
        cam: { az: g.cam.az, el: g.cam.el, dist: g.cam.dist }, bike: bike.snapshot(), dust: bike.dust.n, phase: world.phase,
        tracks: world.ribbons.r.n + world.ribbons.f.n, rocks: world.rocks.count, info: renderer.info.render, errs: window.__errs.slice()
      };
    };
    g.step = function (seconds, input) {                      // 测试：不渲染，纯推进物理
      var n = Math.round(seconds / K.DT);
      for (var i = 0; i < n; i++) { ap.decide(K.DT); if (input) { ap.input.throttle = input.throttle || 0; ap.input.brake = input.brake || 0; ap.input.steer = input.steer || 0; } bike.step(K.DT, ap.input); }
      g.onEvents(bike.drain());
      return bike.snapshot();
    };
    g.start = function () {
      PM.UI.loading(1, '出发');
      PM.UI.ready();
      window.addEventListener('pointerdown', function () { PM.AUDIO.unlock(); }, { once: true });
      window.addEventListener('keydown', function () { PM.AUDIO.unlock(); }, { once: true });
      last = performance.now();
      requestAnimationFrame(g.frame);
    };
  }

  PM.Game = Game;
  PM.CAM_PRESETS = CAM_PRESETS;
})();
