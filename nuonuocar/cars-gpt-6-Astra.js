/* Layered chassis, raised cabin, sloping windows and visible rubber wheels. */
(function () {
  const E = window.ParkingEngine;
  Object.assign(window.ParkingRenderer.prototype, {
    roofHeight() {
      return Math.max(10, this.u * 0.55);
    },
    car(v, options = {}) {
      const c = this.ctx,
        color = E.COLORS[v.color],
        horizontal = v.dir % 2 === 0;
      const x = v.x + 0.12,
        y = v.y + 0.12;
      const w = horizontal ? v.len - 0.24 : 0.76,
        h = horizontal ? 0.76 : v.len - 0.24;
      const z = Math.max(5, this.u * 0.27),
        roof = this.roofHeight();
      const p = (a, b, height) => this.project(a, b, height);
      c.save();
      c.shadowColor = "#31463755";
      c.shadowBlur = 5;
      c.shadowOffsetY = 4;
      this.plane(x + 0.09, y + 0.09, w, h, 0, "#47594435");
      c.restore();
      if (options.highlight) {
        c.save();
        c.shadowColor = "#ffe89e";
        c.shadowBlur = 15;
        this.plane(x - 0.06, y - 0.06, w + 0.12, h + 0.12, 1, "#fff0a8", "#fffbd5");
        c.restore();
      }
      this.box(x, y, w, h, z, color.top, color.dark, color.body);
      // Lower rocker panel makes the body sit above the tires.
      this.polygon([p(x, y + h, 1), p(x + w, y + h, 1), p(x + w, y + h, 3), p(x, y + h, 3)], color.dark);
      const forward = v.dir < 2;
      const baseX = horizontal ? x + w * 0.2 : x + 0.06,
        baseY = horizontal ? y + 0.06 : y + h * 0.2;
      const baseW = horizontal ? w * 0.6 : w - 0.12,
        baseH = horizontal ? h - 0.12 : h * 0.6;
      const rx = baseX + (horizontal ? w * 0.08 : 0.08),
        ry = baseY + (horizontal ? 0.08 : h * 0.08);
      const rw = baseW - (horizontal ? w * 0.16 : 0.16),
        rh = baseH - (horizontal ? 0.16 : h * 0.16);
      const bottom = [
        p(baseX, baseY, z),
        p(baseX + baseW, baseY, z),
        p(baseX + baseW, baseY + baseH, z),
        p(baseX, baseY + baseH, z),
      ];
      const top = [p(rx, ry, roof), p(rx + rw, ry, roof), p(rx + rw, ry + rh, roof), p(rx, ry + rh, roof)];
      this.polygon([bottom[1], bottom[2], top[2], top[1]], "#355963");
      this.polygon([bottom[3], bottom[2], top[2], top[3]], "#517d87");
      this.polygon([bottom[0], bottom[1], top[1], top[0]], "#759c9f");
      this.polygon([bottom[0], bottom[3], top[3], top[0]], "#688f98");
      // Metallic pillars, roof highlight and a split side window.
      c.strokeStyle = color.body;
      c.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(...bottom[i]);
        c.lineTo(...top[i]);
        c.stroke();
      }
      const midA = horizontal ? p(baseX + baseW * 0.53, baseY + baseH, z) : p(baseX + baseW, baseY + baseH * 0.53, z);
      const midB = horizontal ? p(rx + rw * 0.53, ry + rh, roof) : p(rx + rw, ry + rh * 0.53, roof);
      c.beginPath();
      c.moveTo(...midA);
      c.lineTo(...midB);
      c.stroke();
      this.polygon(top, color.top, "#ffffff45");
      this.plane(rx + 0.03, ry + 0.03, Math.max(0.1, rw - 0.06), Math.max(0.1, rh - 0.06), roof + 0.2, color.body);
      for (const t of [0.22, 0.78]) {
        const q = p(horizontal ? x + w * t : x + w, horizontal ? y + h : y + h * t, 1);
        c.fillStyle = "#24373c";
        c.beginPath();
        c.ellipse(q[0], q[1], 2.8, 4, -0.3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#aebbbb";
        c.beginPath();
        c.ellipse(q[0], q[1], 1.25, 2.1, -0.3, 0, Math.PI * 2);
        c.fill();
      }
      const frontX = horizontal ? (forward ? x + w - 0.08 : x + 0.02) : x + 0.04;
      const frontY = horizontal ? y + 0.04 : forward ? y + h - 0.08 : y + 0.02;
      for (const t of [0, 0.52])
        this.plane(
          frontX + (horizontal ? 0 : t),
          frontY + (horizontal ? t : 0),
          horizontal ? 0.06 : 0.13,
          horizontal ? 0.13 : 0.06,
          z + 0.5,
          "#fff3bb",
        );
      const center = [rx + rw / 2, ry + rh / 2],
        [dx, dy] = E.DIRS[v.dir];
      const tail = p(center[0] - dx * 0.22, center[1] - dy * 0.22, roof + 1),
        head = p(center[0] + dx * 0.25, center[1] + dy * 0.25, roof + 1);
      c.save();
      c.lineCap = "round";
      c.lineJoin = "round";
      const a = Math.atan2(head[1] - tail[1], head[0] - tail[0]);
      const arrow = () => {
        c.beginPath();
        c.moveTo(...tail);
        c.lineTo(...head);
        c.moveTo(head[0] - 4 * Math.cos(a - 0.7), head[1] - 4 * Math.sin(a - 0.7));
        c.lineTo(...head);
        c.lineTo(head[0] - 4 * Math.cos(a + 0.7), head[1] - 4 * Math.sin(a + 0.7));
        c.stroke();
      };
      c.strokeStyle = "#35555b77";
      c.lineWidth = 3.4;
      arrow();
      c.strokeStyle = "#fffef5";
      c.lineWidth = 1.8;
      arrow();
      c.restore();
      if (!options.ghost)
        this.hitAreas.push({
          id: v.id,
          points: top,
          body: [p(x, y, z), p(x + w, y, z), p(x + w, y + h, 0), p(x, y + h, 0)],
          box: { x, y, w, h },
        });
    },
    miniCar(c, v, x, y, w, h, alpha = 1, door = false) {
      const color = E.COLORS[v.color];
      c.save();
      c.globalAlpha = alpha;
      const rr = (a, b, width, height, r, fill) => {
        c.fillStyle = fill;
        c.beginPath();
        c.roundRect(a, b, width, height, r);
        c.fill();
      };
      c.save();
      c.shadowColor = "#324d3b50";
      c.shadowBlur = 7;
      c.shadowOffsetY = 5;
      rr(x + 2, y + 5, w, h, 7, "#38564320");
      c.restore();
      rr(x - 2, y + h * 0.17, 5, 11, 2, "#293e42");
      rr(x + w - 3, y + h * 0.17, 5, 11, 2, "#293e42");
      rr(x - 2, y + h * 0.7, 5, 10, 2, "#293e42");
      rr(x + w - 3, y + h * 0.7, 5, 10, 2, "#293e42");
      rr(x, y + 4, w, h - 1, 7, color.dark);
      rr(x, y, w, h - 2, 7, color.body);
      rr(x + 1, y - 2, w - 2, h - 5, 7, color.top);
      rr(x + 4, y + h * 0.15, w - 8, h * 0.63, 4, "#426d78");
      rr(x + 6, y + h * 0.24 - 3, w - 12, h * 0.38, 4, color.dark);
      rr(x + 5, y + h * 0.24 - 5, w - 10, h * 0.38, 4, color.top);
      c.strokeStyle = "#ffffff55";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 7, y + h * 0.18);
      c.lineTo(x + w - 6, y + h * 0.2);
      c.stroke();
      rr(x + 3, y + 1, 5, 3, 1, "#fff6c5");
      rr(x + w - 8, y + 1, 5, 3, 1, "#fff6c5");
      rr(x + 3, y + h - 7, 4, 2, 1, "#d45048");
      rr(x + w - 7, y + h - 7, 4, 2, 1, "#d45048");
      c.fillStyle = "#ffffff";
      c.font = "bold 11px sans-serif";
      c.textAlign = "center";
      c.fillText(color.mark, x + w / 2, y + h * 0.48);
      if (door) {
        c.fillStyle = color.body;
        c.beginPath();
        c.moveTo(x, y + h * 0.35);
        c.lineTo(x - 9, y + h * 0.42);
        c.lineTo(x - 9, y + h * 0.64);
        c.lineTo(x, y + h * 0.58);
        c.closePath();
        c.fill();
        c.strokeStyle = color.dark;
        c.lineWidth = 1;
        c.stroke();
      }
      c.restore();
    },
    person(c, x, y, color, scale = 1, walk = 0) {
      const palette = E.COLORS[color];
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);
      c.fillStyle = "#516d5725";
      c.beginPath();
      c.ellipse(1, 8, 5, 2, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = palette.dark;
      c.lineWidth = 2.6;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-2, 3);
      c.lineTo(-2 - walk * 2, 7);
      c.moveTo(2, 3);
      c.lineTo(2 + walk * 2, 7);
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
    },
    hit(x, y) {
      const inside = (points) => {
        let b = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i],
            [xj, yj] = points[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) b = !b;
        }
        return b;
      };
      return [...this.hitAreas].reverse().find((a) => inside(a.points) || inside(a.body))?.id ?? null;
    },
  });
})();
