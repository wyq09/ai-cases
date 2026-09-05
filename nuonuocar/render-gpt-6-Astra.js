(function () {
  "use strict";
  const E = window.ParkingEngine;
  class Renderer {
    constructor(board, station, getState) {
      this.canvas = board;
      this.station = station;
      this.getState = getState;
      this.ctx = board.getContext("2d");
      this.sc = station.getContext("2d");
      this.motion = null;
      this.highlight = null;
      this.mode = null;
      this.selected = null;
      this.hitAreas = [];
      this.slotAreas = [];
      this.lastFrame = 0;
      this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(board);
      this.resizeObserver.observe(station);
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }
    resize() {
      for (const canvas of [this.canvas, this.station]) {
        const r = canvas.getBoundingClientRect(),
          dpr = Math.min(devicePixelRatio || 1, 2.5);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      this.w = this.canvas.clientWidth;
      this.h = this.canvas.clientHeight;
      this.sw = this.station.clientWidth;
      this.sh = this.station.clientHeight;
      // Resizing clears the backing stores; redraw immediately, including hidden-tab previews.
      this.drawBoard(performance.now());
      this.drawStation(performance.now());
    }
    project(x, y, z = 0) {
      return [this.ox + (x - y) * this.u, this.oy + (x + y) * this.v - z];
    }
    polygon(points, color, stroke = null, width = 1) {
      const c = this.ctx;
      c.beginPath();
      points.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
      c.closePath();
      if (color) {
        c.fillStyle = color;
        c.fill();
      }
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = width;
        c.stroke();
      }
    }
    plane(x, y, w, h, z, color, stroke) {
      const ps = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ].map((p) => this.project(...p, z));
      this.polygon(ps, color, stroke);
      return ps;
    }
    box(x, y, w, h, z, color, side, front) {
      const p = (a, b, c) => this.project(a, b, c);
      this.polygon([p(x + w, y, 1), p(x + w, y + h, 1), p(x + w, y + h, z), p(x + w, y, z)], side);
      this.polygon([p(x, y + h, 1), p(x + w, y + h, 1), p(x + w, y + h, z), p(x, y + h, z)], front);
      return this.plane(x, y, w, h, z, color);
    }
    tree(x, y, size = 1) {
      const c = this.ctx,
        [px, py] = this.project(x, y);
      c.save();
      c.translate(px, py);
      c.fillStyle = "#9eb49c35";
      c.beginPath();
      c.ellipse(3, 5, 13 * size, 6 * size, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#adad8e";
      c.fillRect(-2, -15 * size, 4, 18 * size);
      c.fillStyle = "#8fac89";
      c.beginPath();
      c.ellipse(0, -20 * size, 11 * size, 15 * size, -0.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#abc39b";
      c.beginPath();
      c.ellipse(-4 * size, -25 * size, 7 * size, 10 * size, -0.2, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    drawBoard(now) {
      const s = this.getState(),
        c = this.ctx;
      if (!s || !this.w) return;
      c.clearRect(0, 0, this.w, this.h);
      this.hitAreas = [];
      this.u = Math.min((this.w - 45) / (s.cols + s.rows + 1), (this.h - 32) / ((s.cols + s.rows) * 0.51 + 1.3));
      this.v = this.u * 0.51;
      this.ox = this.w / 2 + ((s.rows - s.cols) * this.u) / 2;
      this.oy = (this.h - (s.cols + s.rows) * this.v) / 2 + 3;
      this.plane(-0.35, -0.35, s.cols + 0.7, s.rows + 0.7, -7, "#bed0b953");
      this.box(-0.18, -0.18, s.cols + 0.36, s.rows + 0.36, 0, "#d3ddce", "#b7c8b1", "#becfb7");
      this.plane(0, 0, s.cols, s.rows, 1, "#dce3d5", "#eef2e6");
      c.save();
      c.setLineDash([3, 5]);
      c.lineWidth = 0.75;
      c.strokeStyle = "#f6f8eb";
      for (let x = 1; x < s.cols; x++) {
        c.beginPath();
        c.moveTo(...this.project(x, 0, 1));
        c.lineTo(...this.project(x, s.rows, 1));
        c.stroke();
      }
      for (let y = 1; y < s.rows; y++) {
        c.beginPath();
        c.moveTo(...this.project(0, y, 1));
        c.lineTo(...this.project(s.cols, y, 1));
        c.stroke();
      }
      c.restore();
      for (const vehicle of s.vehicles) {
        const horizontal = vehicle.dir % 2 === 0;
        this.plane(
          vehicle.x + 0.03,
          vehicle.y + 0.03,
          horizontal ? vehicle.len - 0.06 : 0.94,
          horizontal ? 0.94 : vehicle.len - 0.06,
          1.2,
          null,
          "#fffdf0",
        );
      }
      for (let i = 0; i < 4; i++) {
        this.plane(s.cols * 0.5 - 0.5 + i * 0.27, -0.18, 0.13, 0.36, 2, "#f7f5dd");
        this.plane(s.cols * 0.5 - 0.5 + i * 0.27, s.rows - 0.18, 0.13, 0.36, 2, "#f7f5dd");
      }
      this.tree(-0.75, 0.5, 0.8);
      this.tree(s.cols + 0.65, s.rows - 1, 0.7);
      const [px, py] = this.project(-0.7, s.rows - 1);
      c.save();
      c.translate(px, py);
      c.fillStyle = "#bdc9af";
      c.fillRect(-1, -24, 2, 24);
      c.fillStyle = "#91aa92";
      c.beginPath();
      c.roundRect(-8, -33, 16, 16, 3);
      c.fill();
      c.font = "bold 11px sans-serif";
      c.fillStyle = "#f6f8ec";
      c.textAlign = "center";
      c.fillText("P", 0, -21);
      c.restore();
      const motion = this.motion;
      const cars = s.vehicles
        .filter((v) => !motion || v.id !== motion.before?.id)
        .sort((a, b) => a.x + a.y - (b.x + b.y));
      for (const v of cars) {
        const active =
          this.highlight === v.id ||
          this.selected === v.id ||
          this.mode === "flip" ||
          this.mode === "remove" ||
          (this.debug && E.path(v, s.vehicles, s.cols, s.rows).clear);
        this.car(v, { highlight: active });
      }
      if (motion) {
        const t = Math.min(1, (now - motion.start) / motion.duration),
          ease = 1 - Math.pow(1 - t, 3),
          v = E.clone(motion.before);
        if (motion.type === "blocked") {
          v.x += (motion.after.x - v.x) * ease;
          v.y += (motion.after.y - v.y) * ease;
          const shake = Math.sin(t * Math.PI * 6) * (1 - t) * 0.08;
          v.x += shake;
          v.y += shake;
          this.car(v, { ghost: true });
        } else {
          const distance = motion.distance;
          v.x += E.DIRS[v.dir][0] * distance * t * t;
          v.y += E.DIRS[v.dir][1] * distance * t * t;
          c.save();
          c.globalAlpha = 1 - Math.max(0, t - 0.65) / 0.35;
          this.car(v, { ghost: true });
          c.restore();
          if (!this.reduce) {
            const p = this.project(v.x + 0.5, v.y + 0.5);
            c.fillStyle = "#fffcee80";
            for (let i = 0; i < 5; i++) {
              c.beginPath();
              c.arc(p[0] - i * 5, p[1] + i * 3, 2 + i * 0.5, 0, Math.PI * 2);
              c.fill();
            }
          }
        }
      }
    }
    frame(now) {
      if (!document.hidden && now - this.lastFrame > 30) {
        this.drawBoard(now);
        this.drawStation(now);
        this.lastFrame = now;
      }
      requestAnimationFrame(this.frame);
    }
  }
  window.ParkingRenderer = Renderer;
})();
