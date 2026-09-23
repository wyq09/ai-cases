/* sheep-a-sheep game —— canvas 渲染 / 输入 / 状态机 / 道具 / demo / 持久化 / 钩子 */
window.SH = window.SH || {};
SH.game = (function () {
  'use strict';

  var C = SH.core, L = SH.logic;
  function ART() { return SH.ART || null; }
  function AUDIO() { return SH.AUDIO || null; }
  function FX() { return SH.FX || null; }
  function PANEL() { return SH.PANEL || null; }

  var TILE_RATIO = 1.25;
  var KIND_FALLBACK = ['#E8823C', '#9CC26A', '#E8C34C', '#C75B45', '#9FAEBC', '#D95438', '#6FA84E', '#3E6B3A', '#F0EBDC', '#6C8FA8', '#7A8899', '#9A7248', '#D9B45C', '#A67B54'];

  /* ---------------- 存档 ---------------- */
  var cfg = C.deepMerge(L.DEFAULT_CFG, C.loadJSON(C.LS_CFG) || {});
  var st = C.deepMerge({ lv: 1, best: 0, revUsedThis: 0, tryN: 0 }, C.loadJSON(C.LS_ST) || {});
  var Q = C.Q;
  if (Q.level && +Q.level > 0) st.lv = +Q.level;
  var DEMO = Q.demo === '1';
  var SNAP = Q.snap === '1';
  function saveCfg() { C.saveJSON(C.LS_CFG, cfg); }
  function saveState() { C.saveJSON(C.LS_ST, st); }

  /* ---------------- 运行时 ---------------- */
  var cv, ctx, W = 0, H = 0, DPR = 1;
  var board = null;
  var tiles = [], coversFull = null, blockersFull = null;
  var alive = null, remBlk = null, left = 0, leftTotal = 0;
  var slot = [];            // {idx, kind, flying, anim}
  var props = null;
  var mode = 'boot';        // title | playing | win | lose | pause
  var hist = [];
  var anims = [];
  var matchFx = [];         // 消除演出 {kind,x,y,t}
  var flashT = 0;           // 洗牌白闪
  var slotPulse = 0;
  var snd = {}, bgImg = null, iconsKey = '', bgKey = '';
  var hudLv, hudLeft, overlay, toastEl, propBtns = {};
  var demoTimer = null, demoStep = 0;

  /* ---------------- 布局 ---------------- */
  var tw = 48, th = 60, ox = 0, oy = 0;
  var slotRect = { x: 0, y: 0, w: 0, h: 0 };
  var tw2 = 40, gap = 6;

  function layout() {
    var rect = cv.getBoundingClientRect();
    W = Math.round(rect.width); H = Math.round(rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (FX()) FX().resize(W, H);
    if (!board) return;

    var hudBottom = document.getElementById('hud').getBoundingClientRect().bottom;
    var propTop = document.getElementById('propBar').getBoundingClientRect().top;
    tw2 = 0; // 依赖 tw，先估
    var estTw = Math.min(60, (W - 14) / (((board.box.maxX2 - board.box.minX2) / 2) + 1));
    var slotH = estTw * 0.86 * TILE_RATIO + 14;
    var playTop = hudBottom + 6;
    var playBottom = propTop - slotH - 16;
    var playH = playBottom - playTop;
    var unitsW = (board.box.maxX2 - board.box.minX2) / 2 + 1;
    var unitsH = ((board.box.maxY2 - board.box.minY2) / 2 + 1) * TILE_RATIO;
    tw = Math.max(24, Math.min(estTw, playH / unitsH));
    th = tw * TILE_RATIO;
    tw2 = tw * 0.86;
    gap = Math.max(4, Math.round(tw2 * 0.14));
    var slotW = board.slots * tw2 + (board.slots + 1) * gap;
    slotH = tw2 * TILE_RATIO + 14;
    slotRect = { x: (W - slotW) / 2, y: playBottom + 8, w: slotW, h: slotH };
    // X()/Y() 已按 (gx2-minX2) 相对化，ox/oy 即整体包围盒左上角
    ox = (W - unitsW * tw) / 2;
    oy = playTop + Math.max(0, (playH - ((board.box.maxY2 - board.box.minY2) / 2 + 1) * th)) / 2;
  }

  function X(t) { return ox + (t.gx2 - board.box.minX2) * tw / 2 + tw / 2; }
  function Y(t) { return oy + (t.gy2 - board.box.minY2) * th / 2 + th / 2; }
  function slotX(i) { return slotRect.x + gap + tw2 / 2 + i * (tw2 + gap); }
  function slotY() { return slotRect.y + slotRect.h / 2; }

  /* ---------------- 素材 ---------------- */
  function loadArt() {
    var A = ART();
    var kKey = JSON.stringify(cfg.icons);
    if (kKey !== iconsKey || !Object.keys(snd).length) {
      iconsKey = kKey;
      snd = {};
      var kinds = (A && A.KINDS) || ['carrot','cabbage','corn','mushroom','scissors','flame','grass','pine','cotton','bucket','sickle','fork','hat','glove'];
      // 牌面 kind 是数字索引，snd 按数字 key 存；cfg.icons 按种类 id 字符串存用户上传
      kinds.forEach(function (k, i) {
        var uri = A ? A.icon(k, cfg.icons[k]) : '';
        if (!uri) return;
        var im = new Image();
        im.src = uri;
        snd[i] = im;
      });
    }
    var bKey = cfg.bgCustom || '';
    if (bKey !== bgKey || !bgImg) {
      bgKey = bKey;
      var buri = A ? A.bg(0, cfg.bgCustom) : '';
      if (buri) { bgImg = new Image(); bgImg.src = buri; }
      else bgImg = null;
    }
  }

  function skin() {
    var A = ART();
    return (A && A.tileSkin) ? A.tileSkin(cfg.tileSkin) : { fill: '#FDF8EE', edge: '#D8C9A8', line: '#B49F78' };
  }

  /* ---------------- 开局 ---------------- */
  function startLevel(n, reRng) {
    st.revUsedThis = 0;
    if (n !== st.lv) { st.lv = n; saveState(); }
    var rng = reRng || null;
    board = L.genLevel(n, cfg, rng);
    tiles = board.tiles.slice().sort(function (a, b) {
      return a.z - b.z || a.gy2 - b.gy2 || a.gx2 - b.gx2;
    });
    var cvr = L.buildCover(tiles);
    coversFull = cvr.covers; blockersFull = cvr.blockers;
    alive = []; remBlk = [];
    for (var i = 0; i < tiles.length; i++) { alive.push(1); remBlk.push(blockersFull[i].length); }
    left = leftTotal = tiles.length;
    slot = []; hist = []; anims = []; matchFx = []; flashT = 0;
    props = { out: board.props.out, undo: board.props.undo, shuf: board.props.shuf, revives: board.props.revives };
    mode = 'playing';
    loadArt();
    layout();
    updateHUD(); updateProps();
    hideDlg();
    var AU = AUDIO();
    if (AU) { AU.unlock(); AU.startBGM(); }
    startDemoLoop();
  }

  /* ---------------- HUD ---------------- */
  function updateHUD() {
    hudLv.textContent = DEMO ? 'AI 演示 · 第 ' + st.lv + ' 关' : '第 ' + st.lv + ' 关';
    hudLeft.textContent = leftTotal ? '剩 ' + left + ' / ' + leftTotal + ' 张' : '';
  }
  function updateProps() {
    var map = { btnOut: props && props.out, btnUndo: props && props.undo, btnShuffle: props && props.shuf };
    for (var id in map) {
      var b = document.getElementById(id);
      if (!b) continue;
      var n = map[id] || 0;
      b.querySelector('.cnt').textContent = n;
      if (n <= 0) b.setAttribute('disabled', ''); else b.removeAttribute('disabled');
    }
  }
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  /* ---------------- 渲染 ---------------- */
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawTile(c, cx, cy, w, h, kind, covered, alpha) {
    var sk = skin();
    c.save();
    if (alpha !== undefined) c.globalAlpha = alpha;
    var r = w * 0.18, x = cx - w / 2, y = cy - h / 2;
    // 厚度
    c.fillStyle = sk.edge;
    rr(c, x, y + h * 0.055, w, h, r); c.fill();
    // 面
    c.fillStyle = sk.fill;
    rr(c, x, y, w, h - h * 0.055, r); c.fill();
    c.strokeStyle = sk.line; c.lineWidth = Math.max(1, w * 0.028);
    rr(c, x, y, w, h - h * 0.055, r); c.stroke();
    // 图标
    var img = snd[kind];
    if (img && img.complete && img.naturalWidth) {
      var isz = w * 0.62;
      c.drawImage(img, cx - isz / 2, cy - isz / 2 + h * 0.02, isz, isz);
    } else {
      var kIdx = (typeof kind === 'number') ? kind : 0;
      c.fillStyle = KIND_FALLBACK[kIdx % 14];
      c.beginPath(); c.arc(cx, cy - h * 0.02, w * 0.24, 0, 6.3); c.fill();
    }
    // 被压罩暗
    if (covered) {
      c.fillStyle = 'rgba(48,36,18,0.45)';
      rr(c, x, y, w, h - h * 0.055, r); c.fill();
      c.strokeStyle = 'rgba(40,30,14,0.5)';
      rr(c, x, y, w, h - h * 0.055, r); c.stroke();
    }
    c.restore();
  }

  function drawBg(c) {
    if (bgImg && bgImg.complete && bgImg.naturalWidth) {
      var s = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
      var bw = bgImg.naturalWidth * s, bh = bgImg.naturalHeight * s;
      c.drawImage(bgImg, (W - bw) / 2, (H - bh) / 2, bw, bh);
    } else {
      c.fillStyle = '#EFE6CE'; c.fillRect(0, 0, W, H);
    }
  }

  function drawSlotBar(c) {
    if (!board) return;
    var x = slotRect.x, y = slotRect.y, w = slotRect.w, h = slotRect.h;
    var crit = slot.length >= board.slots - 1 && mode === 'playing';
    if (crit) slotPulse += 0.08; else slotPulse = 0;
    c.save();
    // 外条
    c.fillStyle = 'rgba(74,56,32,0.88)';
    rr(c, x - 5, y - 5, w + 10, h + 10, 14); c.fill();
    if (crit) {
      var a = 0.45 + Math.sin(slotPulse * 2.2) * 0.3;
      c.strokeStyle = 'rgba(233,88,58,' + a.toFixed(2) + ')';
      c.lineWidth = 3;
      rr(c, x - 5, y - 5, w + 10, h + 10, 14); c.stroke();
    }
    // 凹槽
    c.fillStyle = '#4E3A22';
    rr(c, x, y, w, h, 10); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5;
    rr(c, x + 1, y + 1, w - 2, h - 2, 9); c.stroke();
    c.restore();
  }

  function render(now) {
    if (!ctx) return;
    drawBg(ctx);
    if (!board || mode === 'boot') return;
    drawSlotBar(ctx);

    var flyingIdx = {};
    for (var f = 0; f < slot.length; f++) if (slot[f].flying) flyingIdx[slot[f].idx] = 1;

    // 场上牌（数组已按 z,y,x 升序）
    for (var i = 0; i < tiles.length; i++) {
      if (!alive[i] || flyingIdx[i]) continue;
      drawTile(ctx, X(tiles[i]), Y(tiles[i]), tw, th, tiles[i].kind, remBlk[i] > 0);
    }

    // 飞行动画（含回场）
    for (var a = 0; a < anims.length; a++) {
      var an = anims[a];
      var p = SNAP ? 1 : Math.min(1, an.t / an.dur);
      var e = 1 - Math.pow(1 - p, 3);
      var cx = an.from.x + (an.to.x - an.from.x) * e;
      var cy = an.from.y + (an.to.y - an.from.y) * e - Math.sin(p * Math.PI) * 46;
      var sc = an.scaleFrom + (an.scaleTo - an.scaleFrom) * e;
      drawTile(ctx, cx, cy, tw * sc, th * sc, an.kind, false);
    }

    // 槽内牌
    for (var s2 = 0; s2 < slot.length; s2++) {
      var sp = slot[s2];
      if (sp.flying) continue;
      drawTile(ctx, slotX(s2), slotY(), tw2, tw2 * TILE_RATIO, sp.kind, false);
    }

    // 消除演出
    for (var m = 0; m < matchFx.length; m++) {
      var mf = matchFx[m];
      var mp = SNAP ? 1 : Math.min(1, mf.t / 0.32);
      var gather = mf.x + (slotRect.x + slotRect.w / 2 - mf.x) * mp;
      var gathy = mf.y + (slotRect.y + slotRect.h / 2 - mf.y) * mp;
      var sc2 = 1 + mp * 0.5;
      ctx.save();
      ctx.globalAlpha = 1 - mp * mp;
      drawTile(ctx, gather, gathy, tw2 * sc2, tw2 * TILE_RATIO * sc2, mf.kind, false);
      ctx.restore();
    }

    if (flashT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, flashT * 1.8);
      ctx.fillStyle = '#FFF7E2';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (FX()) FX().draw(ctx);
  }

  /* ---------------- 步进 ---------------- */
  function step(dt) {
    if (FX()) FX().step(dt);
    if (flashT > 0) flashT = Math.max(0, flashT - dt * 2.4);
    for (var i = anims.length - 1; i >= 0; i--) {
      var an = anims[i];
      an.t += dt;
      if (an.t >= an.dur) {
        anims.splice(i, 1);
        if (an.onDone) an.onDone();
      }
    }
    for (var m = matchFx.length - 1; m >= 0; m--) {
      matchFx[m].t += dt;
      if (matchFx[m].t >= 0.32) matchFx.splice(m, 1);
    }
  }

  /* ---------------- 核心操作 ---------------- */
  function restoreTile(i, gx2, gy2, z) {
    var t = tiles[i];
    t.gx2 = gx2; t.gy2 = gy2; t.z = z;
    alive[i] = 1; left++;
    remBlk[i] = 0;
    for (var b = 0; b < blockersFull[i].length; b++) {
      var bi = blockersFull[i][b];
      if (alive[bi] && tiles[bi].z > z) remBlk[i]++;
    }
    for (var j = 0; j < tiles.length; j++) {
      if (j === i || !alive[j]) continue;
      if (L.overlap(t, tiles[j]) && z > tiles[j].z) remBlk[j]++;
    }
  }

  function takeIdx(i, silentCheck) {
    var t = tiles[i];
    if (!silentCheck && remBlk[i] > 0) {
      var AUd = AUDIO(); if (AUd) AUd.play('deny');
      return false;
    }
    var AU = AUDIO(); if (AU) AU.play('pick');
    alive[i] = 0; left--;
    var cs = coversFull[i];
    for (var c = 0; c < cs.length; c++) remBlk[cs[c]]--;
    hist.push({ idx: i, gx2: t.gx2, gy2: t.gy2, z: t.z });

    var from = { x: X(t), y: Y(t) };
    var entry = { idx: i, kind: t.kind, flying: true };
    slot.push(entry);
    var an = {
      from: from, to: { x: slotX(slot.length - 1), y: slotY() },
      kind: t.kind, scaleFrom: 1, scaleTo: 0.86,
      t: 0, dur: SNAP ? 0.001 : 0.26,
      onDone: function () { landTile(entry); },
    };
    entry.anim = an;
    anims.push(an);
    updateHUD();
    return true;
  }

  function landTile(entry) {
    if (mode !== 'playing') { entry.flying = false; return; }
    entry.flying = false;
    var AU = AUDIO(); if (AU) AU.play('place');
    // 消除判定
    var same = [];
    for (var i = 0; i < slot.length; i++) if (!slot[i].flying && slot[i].kind === entry.kind) same.push(i);
    if (same.length >= 3) {
      var three = same.slice(same.length - 3);
      var rem = [];
      for (var d = 0; d < three.length; d++) {
        var sp = slot[three[d]];
        rem.push({ kind: sp.kind, x: slotX(three[d]), y: slotY() });
      }
      for (var r = rem.length - 1; r >= 0; r--) slot.splice(three[r], 1);
      for (var e2 = 0; e2 < rem.length; e2++) matchFx.push({ kind: rem[e2].kind, x: rem[e2].x, y: rem[e2].y, t: 0 });
      hist = [];  // 消除后禁撤销
      if (AUDIO()) { AUDIO().play('match'); AUDIO().duck(500); }
      if (FX()) {
        FX().ring(slotRect.x + slotRect.w / 2, slotRect.y + slotRect.h / 2, '#FFE9B8');
        FX().burst(slotRect.x + slotRect.w / 2, slotRect.y + slotRect.h / 2, '#E8B84B', 16);
        FX().float(slotRect.x + slotRect.w / 2, slotRect.y - 8, '消除!', '#FFF3C4', 20);
      }
      if (left === 0) { setTimeout(winLevel, SNAP ? 30 : 520); return; }
      updateHUD();
      return;
    }
    // 槽满判定
    if (slot.length >= board.slots) {
      setTimeout(loseLevel, SNAP ? 30 : 380);
      return;
    }
    updateHUD();
  }

  function winLevel() {
    if (mode !== 'playing') return;
    mode = 'win';
    stopDemoLoop();
    if (AUDIO()) { AUDIO().play('win'); }
    if (FX()) FX().confetti();
    st.best = Math.max(st.best, st.lv);
    st.lv++; st.tryN = 0; saveState();
    setTimeout(function () {
      if (DEMO) { startLevel(st.lv); return; }  // AI 演示跨关自续
      showDlg(
        '<h2>羊圈清空！</h2><div class="sub">第 ' + (st.lv - 1) + ' 关通过' + (st.best > 1 ? ' · 最佳第 ' + st.best + ' 关' : '') + '</div>' +
        '<div class="btns"><button class="mbtn primary" id="dNext">下一关 →</button>' +
        '<button class="mbtn" id="dMenu">设置</button></div>'
      );
      bindDlg('dNext', function () { startLevel(st.lv); });
      bindDlg('dMenu', openPanel);
    }, SNAP ? 60 : 900);
  }

  function loseLevel() {
    if (mode !== 'playing') return;
    mode = 'lose';
    stopDemoLoop();
    if (AUDIO()) AUDIO().play('lose');
    var canRevive = props.revives > 0 && !st.revUsedThis;
    setTimeout(function () {
      if (DEMO) {  // AI 演示失败换种子重试本关
        st.tryN++; saveState();
        startLevel(st.lv, C.mulberry32((C.levelSeed(st.lv) + st.tryN * 7919) >>> 0));
        return;
      }
      showDlg(
        '<h2>槽位满了…</h2><div class="sub">还剩 ' + left + ' 张没消完</div>' +
        '<div class="btns">' +
        (canRevive ? '<button class="mbtn warn" id="dRevive">复活 · 清空槽位（剩 ' + props.revives + ' 次）</button>' : '') +
        '<button class="mbtn primary" id="dRetry">再试一次</button>' +
        '<button class="mbtn" id="dMenu">设置</button></div>'
      );
      if (canRevive) bindDlg('dRevive', doRevive);
      bindDlg('dRetry', function () { startLevel(st.lv); });
      bindDlg('dMenu', openPanel);
    }, SNAP ? 60 : 500);
  }

  /* ---------------- 道具 ---------------- */
  function landedSlot() { var a = []; for (var i = 0; i < slot.length; i++) if (!slot[i].flying) a.push(i); return a; }

  function maxAliveZ() {
    var mz = 0;
    for (var i = 0; i < tiles.length; i++) if (alive[i] && tiles[i].z > mz) mz = tiles[i].z;
    return mz;
  }

  function flyBack(entry, gx2, gy2, z) {
    var i = entry.idx;
    slot.splice(slot.indexOf(entry), 1);
    restoreTile(i, gx2, gy2, z);
    var t = tiles[i];
    var an = {
      from: { x: slotX(0), y: slotY() }, to: { x: X(t), y: Y(t) },
      kind: t.kind, scaleFrom: 0.86, scaleTo: 1,
      t: 0, dur: SNAP ? 0.001 : 0.3,
    };
    anims.push(an);
  }

  function useOut() {
    if (mode !== 'playing' || !props.out) return;
    var landed = landedSlot();
    if (landed.length < 3) { toast('槽内不足 3 张，用不了'); return; }
    props.out--; updateProps();
    hist = [];
    var AU = AUDIO(); if (AU) AU.play('out');
    var mz = maxAliveZ();
    // 先收集引用再逐个移出（flyBack 会 splice 槽数组，下标会失效）
    var entries = [];
    for (var d = 0; d < 3; d++) entries.push(slot[landed[d]]);
    for (var d2 = 0; d2 < entries.length; d2++) {
      var entry = entries[d2];
      var refI = -1;
      for (var tr = 0; tr < tiles.length; tr++) { if (alive[tr]) { refI = tr; break; } }
      if (refI < 0) refI = entry.idx;
      var ref = tiles[refI];
      var off = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, 2], [1, 2], [-1, 2]][(Math.random() * 7) | 0];
      flyBack(entry, ref.gx2 + off[0], ref.gy2 + off[1], mz + 1);
    }
    updateHUD();
  }

  function useUndo() {
    if (mode !== 'playing' || !props.undo) return;
    if (!hist.length) { toast('没有可撤销的操作'); return; }
    var h = hist[hist.length - 1];
    // 找到该牌在槽内（已落地）
    var entry = null;
    for (var i = 0; i < slot.length; i++) if (slot[i].idx === h.idx && !slot[i].flying) entry = slot[i];
    if (!entry) { toast('没有可撤销的操作'); return; }
    props.undo--; updateProps();
    hist.pop();
    var AU = AUDIO(); if (AU) AU.play('undo');
    flyBack(entry, h.gx2, h.gy2, h.z);
    updateHUD();
  }

  function useShuffle() {
    if (mode !== 'playing' || !props.shuf) return;
    props.shuf--; updateProps();
    var AU = AUDIO(); if (AU) { AU.play('shuffle'); AU.duck(600); }
    // 收集场上牌 kind 多重集，洗后重赋
    var ks = [];
    for (var i = 0; i < tiles.length; i++) if (alive[i]) ks.push(tiles[i].kind);
    for (var s2 = ks.length - 1; s2 > 0; s2--) {
      var j = (Math.random() * (s2 + 1)) | 0;
      var tmp = ks[s2]; ks[s2] = ks[j]; ks[j] = tmp;
    }
    var p = 0;
    for (var i2 = 0; i2 < tiles.length; i2++) if (alive[i2]) tiles[i2].kind = ks[p++];
    flashT = 0.5;
    if (FX()) {
      FX().burst(W / 2, H * 0.4, '#F5EDD6', 24);
      for (var f = 0; f < 6; f++) FX().burst(Math.random() * W, H * 0.25 + Math.random() * H * 0.4, '#E8B84B', 6);
    }
  }

  function doRevive() {
    if (mode !== 'lose') return;
    props.revives--; st.revUsedThis = 1; saveState();
    mode = 'playing';
    hideDlg();
    var AU = AUDIO(); if (AU) AU.play('revive');
    var landed = landedSlot();
    var mz = maxAliveZ();
    var entries = [];
    for (var d = 0; d < landed.length; d++) entries.push(slot[landed[d]]);
    for (var d2 = 0; d2 < entries.length; d2++) {
      var entry = entries[d2];
      var refI = 0;
      for (var tr = 0; tr < tiles.length; tr++) { if (alive[tr]) { refI = tr; break; } }
      var ref = tiles[refI];
      var off = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, 2]][(Math.random() * 5) | 0];
      flyBack(entry, ref.gx2 + off[0], ref.gy2 + off[1], mz + 1 + d2);
    }
    hist = [];
    updateHUD(); updateProps();
    if (FX()) FX().burst(W / 2, H * 0.6, '#FFD98A', 22);
  }

  /* ---------------- demo（AI 演示）---------------- */
  function slotKinds() {
    var a = [];
    for (var i = 0; i < slot.length; i++) if (!slot[i].flying) a.push(slot[i].kind);
    return a;
  }
  function startDemoLoop() {
    stopDemoLoop();
    if (!DEMO || mode !== 'playing') return;
    demoTimer = setInterval(function () {
      if (mode !== 'playing' || !board) return;
      if (anims.length > 5) return;
      demoStep++;
      var idx = L.pick({ tiles: tiles, kinds: board.kinds, slots: board.slots }, board.slots, slotKinds(), alive);
      if (idx == null || idx < 0) {
        // 走死了：换种子重开本关
        st.tryN++;
        saveState();
        startLevel(st.lv, C.mulberry32((C.levelSeed(st.lv) + st.tryN * 7919) >>> 0));
        return;
      }
      takeIdx(idx, true);
    }, SNAP ? 40 : 330);
  }
  function stopDemoLoop() { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } }

  /* ---------------- 弹窗 ---------------- */
  var SHEEP_SVG = '<svg class="logo-sheep" width="120" height="86" viewBox="0 0 120 86">' +
    '<ellipse cx="60" cy="78" rx="34" ry="4" fill="rgba(74,59,42,0.14)"/>' +
    '<g stroke="#8A7156" stroke-width="5" stroke-linecap="round"><line x1="46" y1="60" x2="46" y2="74"/><line x1="56" y1="62" x2="56" y2="76"/><line x1="70" y1="60" x2="70" y2="74"/><line x1="80" y1="62" x2="80" y2="76"/></g>' +
    '<g fill="#FBF7EC" stroke="#D9CBB0" stroke-width="2"><circle cx="52" cy="44" r="16"/><circle cx="66" cy="36" r="18"/><circle cx="82" cy="44" r="15"/><circle cx="60" cy="52" r="14"/><circle cx="76" cy="53" r="13"/></g>' +
    '<circle cx="88" cy="34" r="13" fill="#C9A67E" stroke="#A9855E" stroke-width="2"/>' +
    '<path d="M96 26 q8 -6 9 2" fill="none" stroke="#A9855E" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="92" cy="32" r="1.9" fill="#3A2C1C"/><circle cx="85" cy="31" r="1.9" fill="#3A2C1C"/>' +
    '<circle cx="93.5" cy="38" r="2.6" fill="#E8A98F" opacity="0.75"/>' +
    '<ellipse cx="89" cy="40" rx="3.4" ry="2.4" fill="#8A6242"/></svg>';

  function showDlg(inner) {
    overlay.innerHTML = '<div class="dlg">' + inner + '</div>';
    overlay.classList.add('show');
  }
  function hideDlg() { overlay.classList.remove('show'); overlay.innerHTML = ''; }
  function bindDlg(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function () { var A = AUDIO(); if (A) A.play('click'); fn(); });
  }

  function showTitle() {
    mode = 'title';
    var hasProg = st.lv > 1 || st.best > 0;
    showDlg(
      SHEEP_SVG +
      '<h1>羊了个羊</h1><div class="sub">三消羊圈 · 经典复刻<br>点牌入槽 · 三同消除 · 清空过关</div>' +
      '<div class="btns">' +
      (hasProg ? '<button class="mbtn primary" id="dGo">继续 · 第 ' + st.lv + ' 关</button>' : '') +
      '<button class="mbtn ' + (hasProg ? '' : 'primary') + '" id="dNew">' + (hasProg ? '从第 1 关开始' : '开始游戏') + '</button>' +
      '<button class="mbtn" id="dSet">设置</button></div>'
    );
    if (hasProg) bindDlg('dGo', function () { startLevel(st.lv); });
    bindDlg('dNew', function () { st.lv = 1; st.tryN = 0; saveState(); startLevel(1); });
    bindDlg('dSet', openPanel);
  }

  function showPause() {
    if (mode !== 'playing') return;
    mode = 'pause';
    showDlg(
      '<h2>暂停</h2><div class="sub">第 ' + st.lv + ' 关 · 剩 ' + left + ' 张</div>' +
      '<div class="btns"><button class="mbtn primary" id="dGo">继续</button>' +
      '<button class="mbtn" id="dRetry">重开本关</button>' +
      '<button class="mbtn" id="dSet">设置</button></div>'
    );
    bindDlg('dGo', function () { mode = 'playing'; hideDlg(); });
    bindDlg('dRetry', function () { startLevel(st.lv); });
    bindDlg('dSet', openPanel);
  }

  function openPanel() {
    var P = PANEL();
    if (!P) { toast('面板模块未就绪'); return; }
    P.open();
  }

  /* ---------------- 输入 ---------------- */
  function onCvTap(e) {
    var AU = AUDIO();
    if (AU) { AU.unlock(); }
    if (mode !== 'playing' || !board) return;
    var rect = cv.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    // z 降序（同层 y 降序——数组升序的倒序即渲染顶层优先）
    for (var i = tiles.length - 1; i >= 0; i--) {
      if (!alive[i]) continue;
      var t = tiles[i];
      var cx = X(t), cy = Y(t);
      if (Math.abs(mx - cx) < tw / 2 && Math.abs(my - cy) < th / 2) {
        if (remBlk[i] > 0) { if (AU) AU.play('deny'); return; }
        takeIdx(i);
        return;
      }
    }
  }

  /* ---------------- 面板接线 ---------------- */
  function mountPanel() {
    var P = PANEL();
    if (!P) return;
    P.mount({
      root: document.getElementById('panelHost'),
      get: function () { return cfg; },
      onChange: function (next) {
        cfg = C.deepMerge(L.DEFAULT_CFG, next);
        saveCfg();
        var AU = AUDIO();
        if (AU) {
          AU.setSFXVolume(cfg.sfxVol);
          AU.setBGMVolume(cfg.bgmVol);
          if (cfg.muted !== mutedApplied) applyMuted();
        }
        loadArt();
      },
      stats: function () { return { lv: st.lv, best: st.best }; },
      onClearProgress: function () {
        st = { lv: 1, best: 0, revUsedThis: 0, tryN: 0 };
        saveState();
        startLevel(1);
      },
      audioNames: (AUDIO() && AUDIO().names) || [],
      onAudioOverride: function (map) {
        cfg.audioOverrides = map || {};
        saveCfg();
        var AU = AUDIO();
        if (AU) AU.applyOverrides(cfg.audioOverrides);
      },
    });
  }

  var mutedApplied = null;
  function applyMuted() {
    mutedApplied = cfg.muted;
    var AU = AUDIO();
    if (AU) AU.setMasterVolume(cfg.muted ? 0 : 1);
  }

  /* ---------------- 启动 ---------------- */
  var lastT = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    step(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  function boot() {
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    hudLv = document.getElementById('hudLv');
    hudLeft = document.getElementById('hudLeft');
    overlay = document.getElementById('overlay');
    toastEl = document.getElementById('toast');

    if (SNAP) {
      var stl = document.createElement('style');
      stl.textContent = '.snap *{transition:none!important;animation:none!important}';
      document.head.appendChild(stl);
      document.documentElement.classList.add('snap');
    }

    window.addEventListener('resize', function () { setTimeout(layout, 60); });
    window.addEventListener('orientationchange', function () { setTimeout(layout, 250); });
    cv.addEventListener('pointerdown', onCvTap);
    document.getElementById('btnMenu').addEventListener('click', function () { showPause(); });
    document.getElementById('btnOut').addEventListener('click', useOut);
    document.getElementById('btnUndo').addEventListener('click', useUndo);
    document.getElementById('btnShuffle').addEventListener('click', useShuffle);
    document.body.addEventListener('pointerdown', function () { var A = AUDIO(); if (A) A.unlock(); }, { once: true });

    if (Q.muted === '1') { cfg.muted = true; }
    applyMuted();
    var AU = AUDIO();
    if (AU) { AU.init(); AU.setSFXVolume(cfg.sfxVol); AU.setBGMVolume(cfg.bgmVol); if (cfg.audioOverrides) AU.applyOverrides(cfg.audioOverrides); }
    loadArt();
    mountPanel();

    var ready = (ART() && ART().ready) ? Promise.race([ART().ready, new Promise(function (r) { setTimeout(r, 3000); })]) : Promise.resolve();
    ready.then(function () {
      loadArt();
      layout();
      if (DEMO) {
        setTimeout(function () { startLevel(st.lv); }, 400);
      } else {
        showTitle();
      }
    });

    requestAnimationFrame(frame);
    setInterval(function () {
      // 遮挡节流兜底驱动
      if (performance.now() - lastT > 240) {
        var now = performance.now();
        var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
        lastT = now;
        step(dt);
        render(now);
      }
    }, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ---------------- 测试钩子 ---------------- */
  window.__sh = {
    get mode() { return mode; },
    get cfg() { return cfg; },
    get st() { return st; },
    get left() { return left; },
    get busy() { return anims.length; },
    board() { return board; },
    pos(i) { if (!tiles[i]) return null; return { x: X(tiles[i]), y: Y(tiles[i]), covered: remBlk[i] > 0, kind: tiles[i].kind }; },
    slotArr() { return slot.map(function (s) { return s.kind; }); },
    props() { return props; },
    solve() { return L.solve({ tiles: tiles }, board ? board.slots : 7, { nodes: 3000, slotKinds: slotKinds(), alive: alive }); },
    pick() { return L.pick({ tiles: tiles }, board ? board.slots : 7, slotKinds(), alive); },
    startLevel: startLevel,
    demo(on) { DEMO = !!on; if (on) startDemoLoop(); else stopDemoLoop(); },
    // 测试构造：把槽直接填成给定 kind 序列（对应牌从场上取走），用于临界/失败流程
    rig(kinds) {
      if (!board) return 0;
      slot = [];
      for (var ri = 0; ri < kinds.length; ri++) {
        var found = -1;
        for (var fi = 0; fi < tiles.length; fi++) {
          if (alive[fi] && tiles[fi].kind === kinds[ri]) { found = fi; break; }
        }
        if (found < 0) continue;
        alive[found] = 0; left--;
        var cs = coversFull[found];
        for (var ci = 0; ci < cs.length; ci++) remBlk[cs[ci]]--;
        slot.push({ idx: found, kind: tiles[found].kind, flying: false });
      }
      hist = [];
      updateHUD();
      return slot.length;
    },
    useOut: useOut, useUndo: useUndo, useShuffle: useShuffle,
    revive() { doRevive(); },
    tap: onCvTap,
  };

  return {};
})();
