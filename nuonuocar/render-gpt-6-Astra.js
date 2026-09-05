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
      this.departures = [];
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
    car(v, options = {}) {
      const c = this.ctx,
        color = E.COLORS[v.color],
        horizontal = v.dir % 2 === 0;
      const x = v.x + 0.13,
        y = v.y + 0.13,
        w = horizontal ? v.len - 0.26 : 0.74,
        h = horizontal ? 0.74 : v.len - 0.26,
        z = Math.max(7, this.u * 0.36);
      const floor = [
        [x + 0.12, y + 0.13],
        [x + w + 0.12, y + 0.13],
        [x + w + 0.12, y + h + 0.13],
        [x + 0.12, y + h + 0.13],
      ].map((p) => this.project(...p, -2));
      this.polygon(floor, "#344a3f27");
      const highlight = options.highlight;
      if (highlight) {
        c.save();
        c.shadowColor = "#fef9d0";
        c.shadowBlur = 14;
        this.plane(x - 0.07, y - 0.07, w + 0.14, h + 0.14, 1, "#f9f0b4", "#fffceb");
        c.restore();
      }
      for (const t of [0.22, 0.78]) {
        const [px, py] = this.project(horizontal ? x + w * t : x + w, horizontal ? y + h : y + h * t, 2);
        c.fillStyle = "#374c49";
        c.beginPath();
        c.ellipse(px, py, 3, 4, -0.5, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#8c9e97";
        c.beginPath();
        c.arc(px, py, 1.25, 0, Math.PI * 2);
        c.fill();
      }
      const top = this.box(x, y, w, h, z, color.top, color.dark, color.body);
      const forward = v.dir === 0 || v.dir === 1;
      const roofStart = forward ? 0.23 : 0.32;
      if (horizontal) {
        this.plane(x + w * roofStart, y + 0.1, w * 0.44, h - 0.2, z + 0.8, color.body);
        this.plane(x + w * (forward ? 0.66 : 0.15), y + 0.09, w * 0.16, h - 0.18, z + 1, "#456b6a");
        this.plane(x + w * (forward ? 0.2 : 0.76), y + 0.1, w * 0.08, h - 0.2, z + 1, "#6b8e86");
        this.plane(x + w * (forward ? 0.88 : 0.03), y + 0.07, w * 0.06, 0.12, z + 1, "#fff4c3");
        this.plane(x + w * (forward ? 0.88 : 0.03), y + h - 0.19, w * 0.06, 0.12, z + 1, "#fff4c3");
      } else {
        this.plane(x + 0.1, y + h * roofStart, w - 0.2, h * 0.44, z + 0.8, color.body);
        this.plane(x + 0.09, y + h * (forward ? 0.66 : 0.15), w - 0.18, h * 0.16, z + 1, "#456b6a");
        this.plane(x + 0.1, y + h * (forward ? 0.2 : 0.76), w - 0.2, h * 0.08, z + 1, "#6b8e86");
        this.plane(x + 0.07, y + h * (forward ? 0.88 : 0.03), 0.12, h * 0.06, z + 1, "#fff4c3");
        this.plane(x + w - 0.19, y + h * (forward ? 0.88 : 0.03), 0.12, h * 0.06, z + 1, "#fff4c3");
      }
      const center = [x + w / 2, y + h / 2],
        [dx, dy] = E.DIRS[v.dir],
        tail = this.project(center[0] - dx * 0.3, center[1] - dy * 0.3, z + 2),
        head = this.project(center[0] + dx * 0.32, center[1] + dy * 0.32, z + 2);
      c.save();
      c.strokeStyle = "#365a5266";
      c.lineWidth = 3.8;
      c.lineCap = "round";
      c.lineJoin = "round";
      const arrow = () => {
        c.beginPath();
        c.moveTo(...tail);
        c.lineTo(...head);
        const a = Math.atan2(head[1] - tail[1], head[0] - tail[0]);
        c.moveTo(head[0] - 5 * Math.cos(a - 0.65), head[1] - 5 * Math.sin(a - 0.65));
        c.lineTo(...head);
        c.lineTo(head[0] - 5 * Math.cos(a + 0.65), head[1] - 5 * Math.sin(a + 0.65));
        c.stroke();
      };
      arrow();
      c.strokeStyle = "#fffdf1";
      c.lineWidth = 2;
      arrow();
      c.restore();
      // Color-identifying symbol on the front side supplements the color cue.
      const mark = this.project(x + w * 0.7, y + h, z * 0.43);
      c.fillStyle = "#fff8e5cc";
      c.font = `bold ${Math.max(5, this.u * 0.25)}px sans-serif`;
      c.textAlign = "center";
      c.fillText(color.mark, ...mark);
      if (!options.ghost)
        this.hitAreas.push({ id: v.id, points: top.map(([px, py]) => [px, py + z * 0.3]), box: { x, y, w, h } });
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
          const distance = (s.cols + s.rows) * 1.15;
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
    person(c, x, y, color, scale = 1) {
      const palette = E.COLORS[color];
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);
      c.fillStyle = "#647c6d15";
      c.beginPath();
      c.ellipse(1, 8, 5, 2, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = palette.dark;
      c.lineWidth = 2.6;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-2, 3);
      c.lineTo(-2, 7);
      c.moveTo(2, 3);
      c.lineTo(2, 7);
      c.stroke();
      c.fillStyle = palette.body;
      c.beginPath();
      c.roundRect(-4, -3, 8, 8, 3);
      c.fill();
      c.fillStyle = palette.top;
      c.beginPath();
      c.arc(0, -7, 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = palette.dark;
      c.fillRect(0, -9, 1, 1);
      c.restore();
    }
    miniCar(c, v, x, y, w, h, alpha = 1) {
      const color = E.COLORS[v.color];
      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = "#344f3824";
      c.beginPath();
      c.roundRect(x + 2, y + 3, w, h, 6);
      c.fill();
      c.fillStyle = color.dark;
      c.beginPath();
      c.roundRect(x, y + 2, w, h, 5);
      c.fill();
      c.fillStyle = color.top;
      c.beginPath();
      c.roundRect(x, y - 2, w, h - 2, 5);
      c.fill();
      c.fillStyle = color.body;
      c.beginPath();
      c.roundRect(x + 4, y + 4, w - 8, h - 15, 3);
      c.fill();
      c.fillStyle = "#50726b";
      c.beginPath();
      c.roundRect(x + 4, y + 1, w - 8, 5, 2);
      c.fill();
      c.fillStyle = "#fff9e7";
      c.font = "bold 11px sans-serif";
      c.textAlign = "center";
      c.fillText(color.mark, x + w / 2, y + h * 0.6);
      c.fillStyle = "#fffbe9";
      c.fillRect(x + 3, y + h - 8, 4, 2);
      c.fillRect(x + w - 7, y + h - 8, 4, 2);
      c.restore();
    }
    drawStation(now) {
      const s = this.getState(),
        c = this.sc,
        w = this.sw,
        h = this.sh;
      if (!s || !w) return;
      c.clearRect(0, 0, w, h);
      this.slotAreas = [];
      const count = Math.floor((w - 77) / 15),
        queue = s.queue.slice(0, count);
      c.fillStyle = "#e6ecde";
      c.beginPath();
      c.roundRect(12, 8, w - 24, 30, 6);
      c.fill();
      c.fillStyle = "#819279";
      c.font = "8px sans-serif";
      c.textAlign = "left";
      c.fillText("队首", 19, 20);
      c.fillText("←", 24, 30);
      queue.forEach((color, i) => this.person(c, 57 + i * 15, 23, color, 0.77));
      c.fillStyle = "#9cac90";
      c.font = "bold 13px sans-serif";
      c.textAlign = "right";
      c.fillText(s.queue.length > count ? "···" : "", w - 17, 26);
      const gaps = 8,
        slotW = (w - 38 - gaps * (s.slots.length - 1)) / s.slots.length,
        top = 47,
        slotH = h - top - 8;
      s.slots.forEach((v, i) => {
        const x = 19 + i * (slotW + gaps);
        c.fillStyle = "#e9edde";
        c.beginPath();
        c.roundRect(x, top, slotW, slotH, 6);
        c.fill();
        c.strokeStyle = v ? "#cfdbc7" : "#ced7c5";
        c.lineWidth = 1;
        c.setLineDash([3, 3]);
        c.stroke();
        c.setLineDash([]);
        this.slotAreas.push({ index: i, id: v?.id, x, y: top, w: slotW, h: slotH });
        if (v) {
          const mw = Math.min(27, slotW - 14),
            mh = Math.min(37, slotH - 14);
          this.miniCar(c, v, x + (slotW - mw) / 2, top + 3, mw, mh);
          c.fillStyle = "#748669";
          c.font = "8px sans-serif";
          c.textAlign = "center";
          c.fillText(`${v.loaded}/${v.capacity}`, x + slotW / 2, top + slotH - 3);
        } else {
          c.fillStyle = "#bdc9ae";
          c.font = "600 19px sans-serif";
          c.textAlign = "center";
          c.fillText("P", x + slotW / 2, top + slotH / 2 + 4);
          c.font = "7px sans-serif";
          c.fillStyle = "#98a68a";
          c.fillText("空闲", x + slotW / 2, top + slotH - 5);
        }
      });
      this.departures = this.departures.filter((d) => now - d.start < 650);
      for (const d of this.departures) {
        const t = (now - d.start) / 650,
          x = 19 + d.slot * (slotW + gaps) + (slotW - 27) / 2;
        this.miniCar(c, d, x + t * t * w, top + 4, 27, 36, 1 - t);
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
    hit(x, y) {
      const s = this.getState();
      if (!s) return null;
      const gx = ((x - this.ox) / this.u + (y + 6 - this.oy) / this.v) / 2,
        gy = ((y + 6 - this.oy) / this.v - (x - this.ox) / this.u) / 2;
      return (
        [...this.hitAreas]
          .reverse()
          .find(
            (a) =>
              gx >= a.box.x - 0.13 &&
              gx <= a.box.x + a.box.w + 0.13 &&
              gy >= a.box.y - 0.13 &&
              gy <= a.box.y + a.box.h + 0.13,
          )?.id ?? null
      );
    }
    animate(result) {
      const duration = this.reduce ? 60 : result.type === "blocked" ? 230 : 460;
      this.motion = { ...result, start: performance.now(), duration };
      return new Promise((resolve) =>
        setTimeout(() => {
          this.motion = null;
          this.depart(result.departed);
          resolve();
        }, duration),
      );
    }
    depart(cars = []) {
      this.departures.push(...cars.map((v) => ({ ...v, start: performance.now() })));
    }
  }
  window.ParkingRenderer = Renderer;
})();
