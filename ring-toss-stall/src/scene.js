/* 地摊套圈 — 场景渲染：伪3D针孔投影 + 静态帐篷/横幅/地毯 + 动态凳子/奖品/圈/瞄准辅助 */
window.RT = window.RT || {};
RT.SCENE = (function () {
  'use strict';

  var L = null;                                    // 惰性解析 RT.LOGIC
  function LG() { return L || (L = (window.RT && window.RT.LOGIC) || null); }

  /* ── 相机 ── */
  var cam = { y: 1.35, z: 0.10, pitch: 10 * Math.PI / 180, f: 253, cx: 0, cy: 0, W: 0, H: 0 };
  var cosP = Math.cos(cam.pitch), sinP = Math.sin(cam.pitch);

  function resize(W, H) {
    cam.W = W; cam.H = H;
    cam.cx = W / 2;
    cam.cy = H * 0.40;
    cam.f = Math.min(W * 0.68, H * 0.62);
    if (cam.f < H * 0.30) cam.f = H * 0.30;
    if (cam.f > 620) cam.f = 620;
    staticDirty = true;
  }

  // 世界 → 屏幕。返回 null 表示在近平面之后
  function project(x, y, z) {
    var dy = y - cam.y, dz = z - cam.z;
    var zc = -dy * sinP + dz * cosP;
    if (zc < 0.06) return null;
    var s = cam.f / zc;
    return { x: cam.cx + x * s, y: cam.cy - (dy * cosP + dz * sinP) * s, s: s, zc: zc };
  }

  /* ── 静态层（帐篷/横幅/地毯/灯串）离屏缓存 ── */
  var staticCv = null, staticDirty = true;

  function img(key, fn) {
    var A = window.RT && window.RT.ART;
    if (!A || !A[key] && !fn) return null;
    return A[key];
  }

  function drawSprite(ctx, dataURI, x, y, wpx, hpx) {
    if (!dataURI) return;
    var im = SPRITES[dataURI];
    if (!im) { im = new Image(); im.src = dataURI; SPRITES[dataURI] = im; }
    if (!im.complete || !im.naturalWidth) return;
    ctx.drawImage(im, x - wpx / 2, y - hpx, wpx, hpx);
  }
  var SPRITES = {};

  function renderStatic() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!staticCv) { staticCv = document.createElement('canvas'); }
    staticCv.width = Math.round(cam.W * dpr);
    staticCv.height = Math.round(cam.H * dpr);
    var c = staticCv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = cam.W, H = cam.H;
    staticDirty = false;

    /* 夜空 + 远处楼宇剪影 */
    var sky = c.createLinearGradient(0, 0, 0, H * 0.4);
    sky.addColorStop(0, '#0c0505'); sky.addColorStop(1, '#1c0d0a');
    c.fillStyle = sky; c.fillRect(0, 0, W, H * 0.42);
    c.fillStyle = '#120707';
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var b = 0; b < 14; b++) {
      var bw = 30 + rnd() * 70, bh = 20 + rnd() * 60;
      var bx = rnd() * W;
      c.fillRect(bx, H * 0.30 - bh, bw, bh);
      c.fillStyle = 'rgba(255,190,90,0.12)';
      for (var w = 0; w < 4; w++) if (rnd() > 0.6) c.fillRect(bx + 4 + rnd() * (bw - 8), H * 0.30 - bh + 4 + rnd() * (bh - 8), 3, 4);
      c.fillStyle = '#120707';
    }

    /* 帐篷顶棚（红布斜棚） */
    var wallTop = project(0, 2.92, 4.8), wallBot = project(0, 0.0, 4.8);
    var canopyTopY = wallTop ? wallTop.y - H * 0.10 : H * 0.14;
    var leftX = project(-4.7, 0, 4.8), rightX = project(4.7, 0, 4.8);
    var lx = leftX ? leftX.x : 0, rx = rightX ? rightX.x : W;
    var wallL = project(-4.7, 2.92, 4.8), wallR = project(4.7, 2.92, 4.8);
    var wlx = wallL ? wallL.x : 0, wrx = wallR ? wallR.x : W;
    var wly = wallL ? wallL.y : H * 0.3;
    c.fillStyle = '#8f1812';
    c.beginPath();
    c.moveTo(lx - W * 0.06, canopyTopY - H * 0.035);
    c.lineTo(rx + W * 0.06, canopyTopY - H * 0.035);
    c.lineTo(wrx + 14, wly - 6);
    c.lineTo(wlx - 14, wly - 6);
    c.closePath(); c.fill();
    // 棚面褶皱
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2;
    for (var f = 1; f < 8; f++) {
      var fx = lx + (rx - lx) * f / 8;
      c.beginPath(); c.moveTo(fx - 20, canopyTopY - H * 0.03);
      c.quadraticCurveTo(fx, wly - H * 0.045, fx + 24, wly - 8); c.stroke();
    }
    // 檐口横杆
    c.fillStyle = '#5a1010';
    c.fillRect(wlx - 16, wly - 10, (wrx - wlx) + 32, 9);

    /* 背墙红布 */
    var wall = c.createLinearGradient(0, wly, 0, wallBot.y);
    wall.addColorStop(0, '#c02218'); wall.addColorStop(0.6, '#a91e15'); wall.addColorStop(1, '#8f1812');
    c.fillStyle = wall;
    c.fillRect(wlx, wly, wrx - wlx, wallBot.y - wly);
    // 竖向布褶
    c.fillStyle = 'rgba(0,0,0,0.10)';
    for (var v = 1; v < 10; v++) c.fillRect(wlx + (wrx - wlx) * v / 10 - 5, wly, 10, wallBot.y - wly);
    // 布底边
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(wlx, wallBot.y - 6, wrx - wlx, 6);

    /* 横幅（照参考图：红底黄字；宽度收窄保证手机竖屏副标题完整） */
    var bL = project(-3.3, 2.72, 4.78), bR = project(3.3, 2.72, 4.78);
    var bLb = project(-3.3, 1.18, 4.78);
    if (bL && bR && bLb) {
      var bw2 = bR.x - bL.x, bh2 = bLb.y - bL.y;
      c.fillStyle = '#c9271d';
      c.fillRect(bL.x, bL.y, bw2, bh2);
      c.strokeStyle = '#ffd257'; c.lineWidth = Math.max(2, bh2 * 0.028);
      c.strokeRect(bL.x + 3, bL.y + 3, bw2 - 6, bh2 - 6);
      c.fillStyle = '#ffd257';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      var f1 = Math.floor(bh2 * 0.42);
      c.font = '800 ' + f1 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      var cxm = bL.x + bw2 / 2;
      // 手动加字距
      var title = '地 摊 套 圈';
      c.fillText(title, cxm, bL.y + bh2 * 0.36);
      var f2 = Math.floor(bh2 * 0.185);
      c.font = '700 ' + f2 + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('20个币20个圈    60个币100个圈', cxm, bL.y + bh2 * 0.74);
      // 横幅四角绑绳
      c.strokeStyle = '#e8d9b0'; c.lineWidth = 2;
      [[bL.x + 4, bL.y], [bR.x - 4, bL.y]].forEach(function (p) {
        c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + (p[0] < W / 2 ? -14 : 14), wly - 8); c.stroke();
      });
    }

    /* 圈堆（静态层不再画；移入动态层叠在老板头顶，见 render()） */

    /* 灯串：两根横杆之间垂弧 + 灯泡 */
    var A = window.RT && window.RT.ART;
    var bulbURI = A && A.bulb ? A.bulb() : null;
    if (bulbURI) {
      var bulbIm = SPRITES[bulbURI] || (SPRITES[bulbURI] = (() => { var i = new Image(); i.src = bulbURI; return i; })());
      var poleL = project(-4.55, 2.75, 4.6), poleR = project(4.55, 2.75, 4.6);
      if (poleL && poleR) {
        c.strokeStyle = '#3a2420'; c.lineWidth = Math.max(3, 0.035 * poleL.s);
        c.beginPath(); c.moveTo(poleL.x, poleL.y); c.lineTo(poleL.x, canopyTopY - H * 0.03); c.stroke();
        c.beginPath(); c.moveTo(poleR.x, poleR.y); c.lineTo(poleR.x, canopyTopY - H * 0.03); c.stroke();
        for (var row = 0; row < 2; row++) {
          var y0 = wly - 14 - row * H * 0.055;
          c.strokeStyle = 'rgba(40,20,16,0.8)'; c.lineWidth = 1.5;
          var sag = H * (0.05 + row * 0.012);
          var steps = 22;
          var pts = [];
          for (var i2 = 0; i2 <= steps; i2++) {
            var t = i2 / steps;
            var px = poleL.x + (poleR.x - poleL.x) * t;
            var py = y0 + Math.sin(t * Math.PI) * sag;
            pts.push([px, py]);
          }
          c.beginPath(); pts.forEach(function (p, i3) { i3 ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); c.stroke();
          for (var i4 = 2; i4 < pts.length - 1; i4 += 2) {
            var bs = 0.09 * (cam.f / 4.6);
            drawSprite(c, bulbURI, pts[i4][0], pts[i4][1] + bs * 0.55, bs, bs * 1.5);
          }
        }
      }
    }

    /* 地面：地砖 + 红地毯（多边形互相重叠 0.04m，避免投影缝隙） */
    var near = project(0, 0, 0.88), far = project(0, 0, 4.8);
    if (near && far) {
      // 地砖（近处露出的一段）
      c.fillStyle = '#4a4038';
      var nl = project(-5.2, 0, 0.88), nr = project(5.2, 0, 0.88);
      c.beginPath();
      c.moveTo(nl.x, nl.y); c.lineTo(nr.x, nr.y);
      c.lineTo(nr.x, H + 40); c.lineTo(nl.x, H + 40);
      c.closePath(); c.fill();
      // 地砖缝（透视横线）
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1.5;
      var zz = 0.84;
      for (var k = 0; k < 4; k++) {
        var pp = project(0, 0, zz);
        if (!pp) break;
        var pl = project(-5.2, 0, zz), pr2 = project(5.2, 0, zz);
        c.beginPath(); c.moveTo(pl.x, pp.y); c.lineTo(pr2.x, pp.y); c.stroke();
        zz *= 0.62;
      }
      // 红地毯（主体）
      var cl = project(-4.55, 0, 4.8), cr = project(4.55, 0, 4.8);
      var fn = project(-4.55, 0, 0.80), fne = project(4.55, 0, 0.80);
      var carpet = c.createLinearGradient(0, far.y, 0, near.y);
      carpet.addColorStop(0, '#c22a1e');
      carpet.addColorStop(0.25, '#b3241c');
      carpet.addColorStop(1, '#8f1a14');
      c.fillStyle = carpet;
      c.beginPath();
      c.moveTo(cl.x, far.y); c.lineTo(cr.x, far.y);
      c.lineTo(fne.x, fne.y); c.lineTo(fn.x, fne.y);
      c.closePath(); c.fill();
      // 地毯与背墙交界暗缝
      c.fillStyle = 'rgba(60,10,8,0.5)';
      c.fillRect(cl.x, far.y - 3, cr.x - cl.x, 4);
    }
  }

  /* ── 圈绘制（扁环 billboard：外环+内孔 even-odd） ── */
  var RING_COLORS = ['#ffce4d', '#ff6b4a', '#4ac2ff', '#6fd45f', '#ff8fb3'];
  function ringColor(i) { return RING_COLORS[i % RING_COLORS.length]; }

  function drawRing(ctx, sx, sy, s, tilt, colorIdx, alpha, squash) {
    var RM = LG().RING;
    var rOut = RM.ROut * s, rIn = RM.RIn * s;
    var k = squash !== undefined ? squash : Math.abs((cam.y - 0) / Math.max(0.3, Math.hypot(cam.y, 1)));
    var flatMinor = Math.max(rIn * k * 0.55, rIn * k);
    var tube = RM.tube * s;
    // tilt: 0 平放 → 1 立起（立起时看到的椭圆更"薄"但管径变粗）
    var minor = flatMinor * (1 - tilt) + tube * 1.15 * tilt;
    var minorIn = Math.max(minor * (rIn / rOut), tube * 0.4);
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rOut, Math.max(minor, 1.2), 0, 0, Math.PI * 2);
    ctx.ellipse(sx, sy, Math.max(rIn, 0.5), Math.max(minorIn, 0.5), 0, 0, Math.PI * 2);
    ctx.fillStyle = ringColor(colorIdx);
    ctx.fill('evenodd');
    // 管身高光/暗边
    ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.35;
    ctx.beginPath();
    ctx.ellipse(sx, sy - tube * 0.18, rOut * 0.985, Math.max(minor * 0.985, 1), 0, 0, Math.PI * 2);
    ctx.ellipse(sx, sy - tube * 0.18, rIn * 1.02, Math.max(minorIn * 1.02, 0.6), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill('evenodd');
    ctx.restore();
  }

  /* ── 主渲染。state: {stools, resting[], flying, aim, t} ── */
  function render(ctx, st) {
    if (staticDirty) renderStatic();
    ctx.clearRect(0, 0, cam.W, cam.H);
    ctx.drawImage(staticCv, 0, 0, cam.W, cam.H);

    var lg = LG();
    var list = [];
    // 凳子+奖品
    st.stools.forEach(function (s2) {
      list.push({ z: s2.z, fn: function () { drawStoolPrize(ctx, s2, st.t); } });
    });
    // 老板（头顶圈堆照参考图：圈堆 z 略小于老板 → 画在前面）
    list.push({ z: 4.35, fn: function () {
      var p = project(-2.35, 0, 4.35);
      if (p) { var h2 = 1.72 * p.s, w2 = 1.72 * p.s * (220 / 300);
        drawSprite(ctx, (window.RT && window.RT.ART && window.RT.ART.vendor) ? window.RT.ART.vendor() : null, p.x, p.y, w2, h2); }
    } });
    list.push({ z: 4.30, fn: function () {
      var p = project(-2.34, 1.80, 4.30);
      if (p) { var rw = 0.58 * p.s, rh = 0.58 * p.s * (140 / 240);
        drawSprite(ctx, (window.RT && window.RT.ART && window.RT.ART.ringStack) ? window.RT.ART.ringStack() : null, p.x, p.y, rw, rh); }
    } });
    // 地上/凳上静止圈
    st.resting.forEach(function (r) {
      list.push({ z: r.z, fn: function () {
        var p = project(r.x, r.y, r.z);
        if (!p) return;
        var elev = Math.abs(cam.y - r.y) / Math.max(0.4, Math.hypot(cam.y - r.y, r.z - cam.z));
        drawRing(ctx, p.x, p.y, p.s, 0, r.ci, 1, elev * 0.92);
      } });
    });
    // 飞行圈
    if (st.flying) {
      var fr = st.flying;
      list.push({ z: fr.z, fn: function () {
        var p = project(fr.x, fr.y, fr.z);
        if (!p) return;
        // 阴影随高度（近相机 z<0.8 时 scale 爆炸，直接不画）
        var gp = project(fr.x, 0, fr.z);
        if (gp && fr.y < 2.2 && fr.z > 0.8) {
          var shR = Math.min(0.16 * gp.s * (1 + fr.y * 0.25), 90);
          var grad = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, shR);
          grad.addColorStop(0, 'rgba(40,5,5,' + Math.min(0.30 / (1 + fr.y * 1.6), 0.14) + ')');
          grad.addColorStop(1, 'rgba(40,5,5,0)');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.ellipse(gp.x, gp.y, shR, shR * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        }
        drawRing(ctx, p.x, p.y, p.s, fr.tilt, fr.ci, 1);
      } });
    }
    // 按 z 从远到近
    list.sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < list.length; i++) list[i].fn();

    /* 瞄准辅助 */
    if (st.aim && st.aim.show) drawAimGuide(ctx, st.aim);
  }

  function drawStoolPrize(ctx, s2, t) {
    var base = project(s2.x, 0, s2.z);      // 凳脚落点
    if (!base) return;
    var top = project(s2.x, LG().STOOL_H, s2.z);
    var s = base.s;
    // 地面阴影
    var shw = 0.40 * s;
    var g2 = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, shw);
    g2.addColorStop(0, 'rgba(50,8,6,0.35)'); g2.addColorStop(1, 'rgba(50,8,6,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(base.x, base.y, shw, shw * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    // 凳子
    var sw = 0.66 * s, sh = 0.66 * s * (160 / 200);
    drawSprite(ctx, stoolURI(s2.color), base.x, base.y + sh * 0.02, sw, sh);
    // 奖品（可带中奖弹跳动画）
    if (s2.prize) {
      var spec = s2.spec;
      var bob = s2.anim && s2.anim.t > 0 ? Math.sin(s2.anim.t * 14) * 0.04 * Math.min(1, s2.anim.t * 3) : 0;
      var ph = spec.h * s, pw2 = spec.h * s * (200 / 240);
      var py = top.y + bob * s;
      drawSprite(ctx, prizeURI(s2.prize), s2.x !== undefined ? top.x : top.x, py + 2, pw2, ph);
      // 套中的圈挂在颈部
      if (s2.ringOn) {
        var np = project(s2.x, s2.neckY, s2.z);
        if (np) {
          var elev = Math.abs(cam.y - s2.neckY) / Math.max(0.4, Math.hypot(cam.y - s2.neckY, s2.z - cam.z));
          drawRing(ctx, np.x, np.y, np.s, 0.15, s2.ringOn.ci, 1, Math.max(elev * 0.9, 0.34));
        }
      }
    }
  }

  var _stoolURIs = {}, _prizeURIs = {};
  function stoolURI(color) {
    var A = window.RT && window.RT.ART;
    if (!A) return null;
    if (!_stoolURIs[color]) _stoolURIs[color] = A.stool(color);
    return _stoolURIs[color];
  }
  function prizeURI(id) {
    var A = window.RT && window.RT.ART;
    if (!A) return null;
    if (!_prizeURIs[id]) _prizeURIs[id] = A.prize(id);
    return _prizeURIs[id];
  }

  /* ── 瞄准辅助：预测穿越点虚线椭圆 + 抛物线 ── */
  function drawAimGuide(ctx, aim) {
    var lg = LG();
    var ty = aim.targetY || lg.STOOL_H;
    var land = lg.predictLanding(aim.x, aim.power, ty);
    if (!land) return;
    var v = lg.throwVel(aim.power, lg.solveAim(aim.x, aim.power, ty));
    ctx.strokeStyle = 'rgba(255,220,140,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    var N = 24, prev = null;
    for (var i = 0; i <= N; i++) {
      var t = land.t * i / N;
      var wx = v.x0 + v.vx * t;
      var wy = lg.THROW_Y + v.vy * t - 0.5 * lg.G * t * t;
      var wz = lg.THROW_Z + v.vz * t;
      var p = project(wx, wy, wz);
      if (p) { if (prev) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); prev = p; }
    }
    ctx.stroke();
    var gp = project(land.x, ty, land.z);
    if (gp) {
      var rr = lg.RING.RIn * gp.s;
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255,215,110,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(gp.x, gp.y, rr, Math.max(rr * 0.36, 3), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  return {
    resize: resize, project: project, render: render,
    invalidate: function () { staticDirty = true; },
    cam: cam,
    worldToScreen: function (x, y, z) { var p = project(x, y, z); return p ? { x: p.x, y: p.y, s: p.s } : null; }
  };
})();
