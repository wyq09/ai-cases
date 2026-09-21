/* physics.js — 纯物理世界：球/线段/圆形bumper/菱形OBB/漩涡吞噬（主线负责，node 可测） */
(function () {
  'use strict';
  var GP;
  if (typeof window !== 'undefined') GP = window.GP = window.GP || {};
  else GP = global.GP = global.GP || {};

  var SQRT2 = Math.SQRT2;
  var MAX_SPEED = 2400;

  function World(opts) {
    opts = opts || {};
    this.gravity = opts.gravity != null ? opts.gravity : 1500;
    this.restWall = opts.restWall != null ? opts.restWall : 0.72;
    this.restFloor = opts.restFloor != null ? opts.restFloor : 0.55;
    this.restBumper = opts.restBumper != null ? opts.restBumper : 0.88;
    this.restBall = opts.restBall != null ? opts.restBall : 0.4;
    this.bumperKick = opts.bumperKick != null ? opts.bumperKick : 150;
    this.subH = 1 / 180;
    this.time = 0;
    this.segs = [];
    this.bumpers = [];
    this.balls = [];
    this.swallow = null;   /* {x,y,r} 触 core 即吞噬 */
    this.attract = null;   /* {x,y,yMax,halfW,k} 杯口引力区 */
    this.onBumperHit = null; /* (bumper, ball, nx, ny, impact) */
    this.onBomb = null;      /* (ball, kind) 首次碰撞 */
    this.onSwallow = null;   /* (ball) */
    this.onBounce = null;    /* (ball, impact, kind) 墙/地碰撞音效用 */
    this._bid = 0;
    this._bncT = 0;
  }

  World.prototype.addBall = function (x, y, vx, vy, r, extra) {
    var b = {
      id: ++this._bid, x: x, y: y, vx: vx || 0, vy: vy || 0,
      r: r || 11, dead: false, bomb: !!(extra && extra.bomb),
      bombDone: false, settleT: 0, speed: 0, spin: 0
    };
    this.balls.push(b);
    return b;
  };

  World.prototype.removeBall = function (b) { b.dead = true; };

  World.prototype.setStatics = function (segs) { this.segs = segs; };
  World.prototype.setBumpers = function (list) { this.bumpers = list; };

  World.prototype.step = function (dt) {
    if (dt <= 0) return;
    if (dt > 1 / 20) dt = 1 / 20;
    var n = Math.max(1, Math.ceil(dt / this.subH));
    var h = dt / n;
    for (var i = 0; i < n; i++) this._sub(h);
    /* 清尸 */
    for (var j = this.balls.length - 1; j >= 0; j--) {
      if (this.balls[j].dead) this.balls.splice(j, 1);
    }
  };

  World.prototype._sub = function (h) {
    this.time += h;
    var i, b, bs = this.balls;
    /* 移动型 bumper */
    for (i = 0; i < this.bumpers.length; i++) {
      b = this.bumpers[i];
      if (!b.alive) continue;
      if (b.moveAmp) b.x = b.baseX + Math.sin(this.time * b.moveSpd + b.phase) * b.moveAmp;
    }
    /* 引力区 + 积分 */
    var at = this.attract, g = this.gravity;
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.dead) continue;
      if (at && b.vy < 0 && b.y < at.yMax && Math.abs(b.x - at.x) < at.halfW) {
        var ddx = at.x - b.x, ddy = at.y - b.y;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        b.vx += (ddx / dd) * at.k * h;
        b.vy += (ddy / dd) * at.k * h;
      }
      b.vy += g * h;
      if (b.vx > MAX_SPEED) b.vx = MAX_SPEED; else if (b.vx < -MAX_SPEED) b.vx = -MAX_SPEED;
      if (b.vy > MAX_SPEED) b.vy = MAX_SPEED; else if (b.vy < -MAX_SPEED) b.vy = -MAX_SPEED;
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    /* 球 vs 线段 */
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (!b.dead) this._collideSegs(b);
    }
    /* 球 vs bumper */
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (!b.dead) this._collideBumpers(b);
    }
    /* 球 vs 球 */
    var j, b2;
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.dead) continue;
      for (j = i + 1; j < bs.length; j++) {
        b2 = bs[j];
        if (b2.dead) continue;
        this._collideBalls(b, b2);
      }
    }
    /* 吞噬 + 静止统计 */
    var sw = this.swallow;
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.dead) continue;
      if (sw) {
        var sx = b.x - sw.x, sy = b.y - sw.y;
        if (sx * sx + sy * sy < sw.r * sw.r) {
          b.dead = true;
          if (this.onSwallow) this.onSwallow(b);
          continue;
        }
      }
      b.speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (b.speed < 30) b.settleT += h; else b.settleT = 0;
    }
  };

  World.prototype._collideSegs = function (b) {
    for (var i = 0; i < this.segs.length; i++) {
      var s = this.segs[i];
      var abx = s.bx - s.ax, aby = s.by - s.ay;
      var len2 = abx * abx + aby * aby || 1;
      var t = ((b.x - s.ax) * abx + (b.y - s.ay) * aby) / len2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var cx = s.ax + abx * t, cy = s.ay + aby * t;
      var dx = b.x - cx, dy = b.y - cy;
      var d2 = dx * dx + dy * dy;
      if (d2 >= b.r * b.r) continue;
      var d = Math.sqrt(d2);
      var nx, ny;
      if (d > 0.0001) { nx = dx / d; ny = dy / d; }
      else { var il = 1 / Math.sqrt(len2); nx = -aby * il; ny = abx * il; }
      b.x += nx * (b.r - d);
      b.y += ny * (b.r - d);
      var vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        var rest = s.rest != null ? s.rest : this.restWall;
        var fric = s.fric != null ? s.fric : 1;
        var tx = -ny, ty = nx;
        var vt = (b.vx * tx + b.vy * ty) * fric;
        var vn2 = -vn * rest;
        b.vx = nx * vn2 + tx * vt;
        b.vy = ny * vn2 + ty * vt;
        var imp = -vn;
        if (imp > 60 && this.onBounce) this.onBounce(b, imp, s.floor ? 'floor' : 'wall');
        if (b.bomb && !b.bombDone && imp > 60) this._bomb(b, 'wall');
      }
    }
  };

  World.prototype._collideBumpers = function (b) {
    for (var i = 0; i < this.bumpers.length; i++) {
      var p = this.bumpers[i];
      if (!p.alive) continue;
      if (p.kind === 'diamond') this._hitObb(b, p);
      else this._hitCircle(b, p);
    }
  };

  World.prototype._hitCircle = function (b, p) {
    var dx = b.x - p.x, dy = b.y - p.y;
    var rr = b.r + p.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    var d = Math.sqrt(d2) || 0.0001;
    var nx = dx / d, ny = dy / d;
    b.x += nx * (rr - d);
    b.y += ny * (rr - d);
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      var rest = this.restBumper;
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
      /* 撞击加力＝弹速下限：快撞有 pachinko 活力，轻触逐级衰减可沉降 */
      if (vn < -60) {
        var kick = this.bumperKick * (0.35 + 0.65 * Math.min(1, -vn / 700));
        var cvn = b.vx * nx + b.vy * ny;
        if (cvn < kick) {
          b.vx += nx * (kick - cvn);
          b.vy += ny * (kick - cvn);
        }
      }
    }
    if (!p.cool) p.cool = {};
    if (!p.cool[b.id] || this.time - p.cool[b.id] > 0.15) {
      p.cool[b.id] = this.time;
      if (this.onBumperHit) this.onBumperHit(p, b, nx, ny, Math.max(0, -vn));
    }
    if (b.bomb && !b.bombDone) this._bomb(b, 'bumper');
  };

  World.prototype._hitObb = function (b, p) {
    /* 菱形 = 旋转 45° 的正方形，half = 半对角线 */
    var s = p.half / SQRT2;
    var c = Math.SQRT1_2, sn = Math.SQRT1_2; /* rot = π/4 */
    var dx = b.x - p.x, dy = b.y - p.y;
    var lx = c * dx + sn * dy;
    var ly = -sn * dx + c * dy;
    var qx = lx < -s ? -s : (lx > s ? s : lx);
    var qy = ly < -s ? -s : (ly > s ? s : ly);
    var nlx, nly, pen;
    if (qx === lx && qy === ly) {
      /* 圆心在方形内：沿最浅轴推出 */
      var px = s - Math.abs(lx), py = s - Math.abs(ly);
      if (px < py) { nlx = lx >= 0 ? 1 : -1; nly = 0; pen = px + b.r; }
      else { nlx = 0; nly = ly >= 0 ? 1 : -1; pen = py + b.r; }
    } else {
      var ex = lx - qx, ey = ly - qy;
      var d2 = ex * ex + ey * ey;
      if (d2 >= b.r * b.r) return;
      var d = Math.sqrt(d2) || 0.0001;
      nlx = ex / d; nly = ey / d;
      pen = b.r - d;
    }
    var nx = c * nlx - sn * nly;
    var ny = sn * nlx + c * nly;
    b.x += nx * pen;
    b.y += ny * pen;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      var rest = this.restBumper;
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
      if (vn < -60) {
        var kick = this.bumperKick * (0.35 + 0.65 * Math.min(1, -vn / 700));
        var cvn = b.vx * nx + b.vy * ny;
        if (cvn < kick) {
          b.vx += nx * (kick - cvn);
          b.vy += ny * (kick - cvn);
        }
      }
    }
    if (!p.cool) p.cool = {};
    if (!p.cool[b.id] || this.time - p.cool[b.id] > 0.15) {
      p.cool[b.id] = this.time;
      if (this.onBumperHit) this.onBumperHit(p, b, nx, ny, Math.max(0, -vn));
    }
    if (b.bomb && !b.bombDone) this._bomb(b, 'bumper');
  };

  World.prototype._collideBalls = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var rr = a.r + b.r;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return;
    var d = Math.sqrt(d2);
    var nx = dx / d, ny = dy / d;
    var pen = (rr - d) / 2;
    a.x -= nx * pen; a.y -= ny * pen;
    b.x += nx * pen; b.y += ny * pen;
    var rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rvn < 0) {
      var j = -(1 + this.restBall) * rvn / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
      if (-rvn > 120 && this.onBounce) this.onBounce(b, -rvn * 0.6, 'ball');
      if (a.bomb && !a.bombDone && -rvn > 60) this._bomb(a, 'ball');
      if (b.bomb && !b.bombDone && -rvn > 60) this._bomb(b, 'ball');
    }
  };

  World.prototype._bomb = function (b, kind) {
    b.bombDone = true;
    b.dead = true;
    if (this.onBomb) this.onBomb(b, kind);
  };

  /* 测试探针：场上是否有球与圆重叠（node 自检用） */
  World.prototype.anyOverlapCircle = function (x, y, r) {
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      var dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < (r + b.r) * (r + b.r)) return true;
    }
    return false;
  };

  GP.PHY = { World: World };

  if (typeof module !== 'undefined' && module.exports) module.exports = GP.PHY;
})();
