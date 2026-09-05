/* Arrival, parking, one-at-a-time boarding and departure share the real game state. */
(function () {
  const E = window.ParkingEngine;
  Object.assign(window.ParkingRenderer.prototype, {
    slotGeometry(i) {
      const gaps = 8,
        width = (this.sw - 38 - gaps * (this.getState().slots.length - 1)) / this.getState().slots.length;
      const x = 19 + i * (width + gaps),
        y = 57,
        height = this.sh - y - 6;
      const carW = Math.min(33, width - 19),
        carH = Math.min(58, height - 18);
      return { x, y, w: width, h: height, carX: x + (width - carW) / 2, carY: y + 6, carW, carH };
    },
    phaseProgress(now) {
      return this.stationPhase ? Math.min(1, (now - this.stationPhase.start) / this.stationPhase.duration) : 0;
    },
    drawStation(now) {
      const s = this.getState(),
        c = this.sc,
        w = this.sw,
        h = this.sh;
      if (!s || !w) return;
      c.clearRect(0, 0, w, h);
      this.slotAreas = [];
      const phase = this.stationPhase,
        t = this.phaseProgress(now),
        boarding = phase?.kind === "boarding";
      c.fillStyle = "#e4ebd9";
      c.beginPath();
      c.roundRect(12, 7, w - 24, 31, 6);
      c.fill();
      c.fillStyle = "#839376";
      c.font = "8px sans-serif";
      c.textAlign = "left";
      c.fillText("队首", 19, 19);
      c.fillText("↓", 24, 30);
      const count = Math.floor((w - 73) / 15);
      s.queue.slice(0, count + 1).forEach((color, i) => {
        if (boarding && i === 0) return;
        const x = 57 + i * 15 - (boarding ? 15 * t : 0);
        if (x < w - 14) this.person(c, x, 23, color, 0.8);
      });
      c.fillStyle = "#f7f8e9";
      c.fillRect(12, 38, w - 24, 12);
      c.strokeStyle = "#cbd6bd";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(12, 49);
      c.lineTo(w - 12, 49);
      c.stroke();
      for (let x = 18; x < w - 18; x += 16) {
        c.fillStyle = "#dfd8b4";
        c.fillRect(x, 47, 7, 3);
      }
      s.slots.forEach((v, i) => {
        const g = this.slotGeometry(i),
          active = boarding && phase.slot === i;
        c.fillStyle = active ? "#e0ebcd" : "#e7ecde";
        c.beginPath();
        c.roundRect(g.x, g.y, g.w, g.h, 5);
        c.fill();
        c.strokeStyle = active ? "#a8bf7c" : "#fcfcef";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(g.x + 3, g.y + g.h - 5);
        c.lineTo(g.x + 3, g.y + 3);
        c.lineTo(g.x + g.w - 3, g.y + 3);
        c.lineTo(g.x + g.w - 3, g.y + g.h - 5);
        c.stroke();
        c.fillStyle = "#b8c6a6";
        c.fillRect(g.x + g.w * 0.3, g.y + 3, g.w * 0.4, 3);
        this.slotAreas.push({ index: i, id: v?.id, x: g.x, y: g.y, w: g.w, h: g.h });
        const hidden = Boolean(v) && (this.arrivingId === v.id || (phase?.kind === "departing" && phase.slot === i));
        if (v && !hidden) {
          this.miniCar(c, v, g.carX, g.carY, g.carW, g.carH, 1, active);
          const dots = Math.min(v.capacity, 6),
            step = 5,
            base = g.x + g.w / 2 - ((dots - 1) * step) / 2;
          for (let j = 0; j < dots; j++) {
            c.fillStyle = j < v.loaded ? E.COLORS[v.color].body : "#cbd5bf";
            c.beginPath();
            c.arc(base + j * step, g.y + g.h - 10, 1.6, 0, Math.PI * 2);
            c.fill();
          }
          c.font = "bold 8px sans-serif";
          c.textAlign = "center";
          c.fillStyle = "#748568";
          c.fillText(`${v.loaded}/${v.capacity}`, g.x + g.w / 2, g.y + g.h - 1);
        } else {
          c.fillStyle = "#b7c5a7";
          c.font = "600 21px sans-serif";
          c.textAlign = "center";
          c.fillText("P", g.x + g.w / 2, g.y + g.h * 0.56);
          c.font = "7px sans-serif";
          c.fillStyle = "#8b9d7c";
          c.fillText(
            hidden ? (phase?.kind === "departing" ? "驶离中" : "驶入中") : `0${i + 1} · 空闲`,
            g.x + g.w / 2,
            g.y + g.h - 5,
          );
        }
      });
      if (boarding) {
        const g = this.slotGeometry(phase.slot),
          points = [
            [57, 23],
            [47, 42],
            [g.carX - 7, 51],
            [g.carX - 7, g.carY + g.carH * 0.46],
            [g.carX + 3, g.carY + g.carH * 0.46],
          ];
        const p = this.alongPath(points, t);
        c.save();
        c.globalAlpha = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
        this.person(c, p[0], p[1], phase.color, 0.86, Math.sin(t * Math.PI * 8));
        c.restore();
      }
      this.drawJourney(now);
    },
    alongPath(points, t) {
      const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
      let travel = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, t));
      for (let i = 0; i < lengths.length; i++) {
        if (travel <= lengths[i] || i === lengths.length - 1) {
          const f = lengths[i] ? travel / lengths[i] : 0;
          return [
            points[i][0] + (points[i + 1][0] - points[i][0]) * f,
            points[i][1] + (points[i + 1][1] - points[i][1]) * f,
            Math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]) + Math.PI / 2,
          ];
        }
        travel -= lengths[i];
      }
      return [...points[0], 0];
    },
    drawJourney(now) {
      const canvas = document.querySelector("#journey");
      if (!canvas) return;
      const root = canvas.parentElement,
        rect = root.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      if (
        canvas.width !== Math.round(root.clientWidth * dpr) ||
        canvas.height !== Math.round(root.clientHeight * dpr)
      ) {
        canvas.width = Math.round(root.clientWidth * dpr);
        canvas.height = Math.round(root.clientHeight * dpr);
      }
      const c = canvas.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, root.clientWidth, root.clientHeight);
      const phase = this.stationPhase;
      if (!phase || !["arriving", "departing"].includes(phase.kind)) return;
      const station = this.station.getBoundingClientRect(),
        board = this.canvas.getBoundingClientRect(),
        road = document.querySelector(".road").getBoundingClientRect();
      const sx = station.left - rect.left - root.clientLeft,
        sy = station.top - rect.top - root.clientTop;
      const roadY = road.top - rect.top - root.clientTop + road.height / 2,
        g = this.slotGeometry(phase.slot);
      const parked = [sx + g.carX + g.carW / 2, sy + g.carY + g.carH / 2];
      let points;
      if (phase.kind === "arriving") {
        const end = phase.boardEnd,
          x = Math.max(18, Math.min(root.clientWidth - 18, board.left - rect.left + end[0]));
        const y = Math.max(roadY + 26, Math.min(board.bottom - rect.top - 20, board.top - rect.top + end[1]));
        const side = x < root.clientWidth / 2 ? 17 : root.clientWidth - 17;
        points = [[x, y], [side, y], [side, roadY], [parked[0], roadY], parked];
      } else points = [parked, [parked[0], roadY], [root.clientWidth + 45, roadY]];
      const t = this.phaseProgress(now),
        ease = phase.kind === "arriving" ? 1 - Math.pow(1 - t, 1.6) : t * t;
      const [x, y, angle] = this.alongPath(points, ease);
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      this.miniCar(c, phase.vehicle, -g.carW / 2, -g.carH / 2, g.carW, g.carH);
      c.restore();
    },
    playPhase(kind, duration, data = {}) {
      const actual = this.reduce ? Math.min(duration, 90) : duration;
      this.stationPhase = { kind, duration: actual, start: performance.now(), ...data };
      const status = document.querySelector("#station-status");
      status.textContent =
        {
          arriving: "小车正在停入车位",
          parked: "已停稳，准备开门",
          boarding: "车门已开，乘客上车中",
          departing: "乘客已坐好，出发！",
        }[kind] || "同色上车 · 满员出发";
      this.drawStation(performance.now());
      return new Promise((resolve) =>
        setTimeout(() => {
          this.stationPhase = null;
          this.drawStation(performance.now());
          resolve();
        }, actual),
      );
    },
    async animate(result) {
      const duration = this.reduce ? 80 : result.type === "blocked" ? 230 : 350;
      this.arrivingId = result.type === "exit" ? result.before.id : null;
      const s = this.getState(),
        v = result.before;
      const distance = E.path(v, s.vehicles, s.cols, s.rows).steps + v.len + 0.4;
      this.motion = { ...result, start: performance.now(), duration, distance };
      await new Promise((resolve) => setTimeout(resolve, duration));
      this.motion = null;
      if (result.type === "exit") {
        const boardEnd = this.project(v.x + 0.5 + E.DIRS[v.dir][0] * distance, v.y + 0.5 + E.DIRS[v.dir][1] * distance);
        await this.playPhase("arriving", 850, { slot: result.slot, vehicle: v, boardEnd });
        this.arrivingId = null;
        await this.playPhase("parked", 220, { slot: result.slot, vehicle: v });
      }
    },
    boardPassenger(passenger) {
      return this.playPhase("boarding", 340, passenger);
    },
    async departVehicle(slot) {
      const vehicle = E.clone(this.getState().slots[slot]);
      await this.playPhase("parked", 180, { slot, vehicle });
      await this.playPhase("departing", 550, { slot, vehicle });
    },
    resetStation() {
      this.stationPhase = null;
      this.arrivingId = null;
      document.querySelector("#station-status").textContent = "同色上车 · 满员出发";
      this.drawStation(performance.now());
    },
  });
})();
