import * as T from "./vendor/three.module-gpt-6-Astra.min.js";
import {
  group,
  box,
  cylinder,
  label,
  floorLabel,
  tree,
  car,
  person,
  release,
} from "./models-gpt-6-Astra.js";
import { SceneBatcher } from "./batching-gpt-6-Astra.js";
const E = window.ParkingEngine;
export class ParkingRenderer {
  constructor(canvas, getState) {
    this.canvas = canvas;
    this.state = getState;
    this.scene = new T.Scene();
    this.scene.background = new T.Color("#e7eee3");
    this.gpu = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.gpu.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.gpu.shadowMap.enabled = true;
    this.gpu.shadowMap.type = T.PCFSoftShadowMap;
    this.gpu.outputColorSpace = T.SRGBColorSpace;
    this.gpu.toneMapping = T.ACESFilmicToneMapping;
    this.gpu.toneMappingExposure = 0.95;
    this.camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    this.yaw = this.canvas.clientWidth < 600 ? 0.18 : 0.55;
    this.pitch = 0.83;
    this.zoom = 1;
    this.scene.add(new T.HemisphereLight("#fffbed", "#a5b399", 1.5));
    const sun = new T.DirectionalLight("#fff1d3", 2.2);
    sun.position.set(-9, 17, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -13,
      right: 13,
      top: 15,
      bottom: -15,
      near: 1,
      far: 50,
    });
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0003;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    const fill = new T.DirectionalLight("#d2eaff", 0.8);
    fill.position.set(8, 7, -7);
    this.scene.add(fill);
    this.world = group();
    this.scene.add(this.world);
    this.cars = new Map();
    this.actions = new Map();
    this.phases = new Map();
    this.epoch = 0;
    this.people = group();
    this.scene.add(this.people);
    this.raycaster = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.highlight = null;
    this.selected = null;
    this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.pointers = new Map();
    this.installInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.batcher = new SceneBatcher(this.scene);
    this.rebuild();
    this.resize();
    this.lastFrame = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      document.getElementById("loading").hidden = false;
      document.getElementById("loading").innerHTML =
        '<b>画面暂时休息了</b><small>进度已保存，重新载入即可继续</small><button class="primary" onclick="location.reload()">重新载入</button>';
    });
    canvas.addEventListener("webglcontextrestored", () => location.reload());
  }
  layout() {
    const s = this.state(),
      edge = (s.cols * 1.25) / 2 + 1,
      half = Math.max(6.3, edge + 0.7);
    return {
      edge,
      north: 2 - edge,
      bay: -edge - 0.4,
      queue: -edge - 3.0,
      left: -half,
      right: half,
      back: -edge - 4.1,
      front: 2 + edge + 1,
    };
  }
  bayPoint(i) {
    return new T.Vector3((i - 2.5) * 1.7, 0, this.layout().bay);
  }
  queuePoint(i = 0) {
    return new T.Vector3(-3.5 + i * 0.42, 0, this.layout().queue);
  }
  position(v) {
    return new T.Vector3(
      (v.x + (v.dir % 2 === 0 ? v.len / 2 : 0.5) - this.state().cols / 2) *
        1.25,
      0,
      (v.y + (v.dir % 2 ? v.len / 2 : 0.5) - this.state().rows / 2) * 1.25 + 2,
    );
  }
  angle(dir) {
    return (-dir * Math.PI) / 2;
  }
  rebuild() {
    if (this.batcher) this.batcher.dirty = true;
    release(this.world);
    this.world = group();
    this.scene.add(this.world);
    const s = this.state(),
      l = this.layout();
    this.layoutKey = `${s.n}/${s.salt}/${s.slots.length}`;
    box(
      this.world,
      l.right * 2,
      0.65,
      l.front - l.back,
      "#b9cbb0",
      0,
      -0.39,
      (l.front + l.back) / 2,
      0.25,
    );
    box(
      this.world,
      l.right * 2 - 0.2,
      0.08,
      l.front - l.back - 0.15,
      "#d8e2c7",
      0,
      -0.025,
      (l.front + l.back) / 2,
      0.13,
    );
    // A perimeter road carries exiting cars; boarding bays never occupy it.
    box(
      this.world,
      s.cols * 1.25 + 2.8,
      0.04,
      s.rows * 1.25 + 2.8,
      "#667d73",
      0,
      0.01,
      2,
      0.16,
    );
    box(
      this.world,
      s.cols * 1.25 + 0.2,
      0.06,
      s.rows * 1.25 + 0.2,
      "#aebba5",
      0,
      0.044,
      2,
      0.12,
    );
    box(
      this.world,
      s.cols * 1.25,
      0.04,
      s.rows * 1.25,
      "#8b9b85",
      0,
      0.084,
      2,
      0.04,
    );
    for (
      let x = (-s.cols * 1.25) / 2 + 0.625;
      x < (s.cols * 1.25) / 2;
      x += 1.25
    )
      for (
        let z = 2 - (s.rows * 1.25) / 2 + 0.625;
        z < 2 + (s.rows * 1.25) / 2;
        z += 1.25
      )
        box(this.world, 0.025, 0.005, 0.055, "#9aaa95", x, 0.108, z);
    for (let x = (-s.cols * 1.25) / 2; x <= (s.cols * 1.25) / 2; x += 0.95)
      for (const z of [l.north, 2 + l.edge])
        box(this.world, 0.45, 0.012, 0.045, "#e9ecd5", x, 0.04, z);
    for (let z = l.north + 0.5; z < 2 + l.edge; z += 0.95)
      for (const x of [-l.edge, l.edge])
        box(this.world, 0.045, 0.012, 0.45, "#e9ecd5", x, 0.04, z);
    box(this.world, 10.7, 0.025, 3.9, "#91a38c", 0, 0.025, l.bay, 0.12);
    box(this.world, 11.4, 0.18, 1.35, "#e7e5cb", 0, 0.1, l.queue, 0.06);
    for (let i = 0; i < 6; i++) {
      const p = this.bayPoint(i),
        open = i < s.slots.length;
      box(
        this.world,
        1.48,
        0.022,
        3.8,
        open ? "#a5b59a" : "#bac5ab",
        p.x,
        0.05,
        p.z,
        0.09,
      );
      for (const x of [p.x - 0.72, p.x + 0.72])
        box(
          this.world,
          0.033,
          0.014,
          3.7,
          open ? "#f4f1d6" : "#d0d8bb",
          x,
          0.075,
          p.z,
        );
      box(this.world, 1.47, 0.014, 0.033, "#eef0d0", p.x, 0.075, p.z - 1.85);
      floorLabel(
        this.world,
        open ? String(i + 1).padStart(2, "0") : "＋",
        p.x,
        p.z + 1.57,
        0.5,
        open ? "#f6f1d9" : "#8c9c7d",
        0.35,
      );
      box(
        this.world,
        0.6,
        0.1,
        0.12,
        open ? "#e6c979" : "#abb99a",
        p.x,
        0.12,
        p.z - 1.5,
        0.03,
      );
    }
    for (const v of s.vehicles) this.parkingMark(v);
    // Small scenery sits outside every drivable lane.
    tree(this.world, -5.65, l.front - 0.65, 0.8);
    tree(this.world, 5.6, l.front - 0.8, 1);
    tree(this.world, -5.7, l.back + 0.7, 0.7);
    tree(this.world, 5.6, l.back + 0.8, 0.78);
    for (const x of [l.left + 0.2, l.right - 0.2]) {
      cylinder(this.world, 0.035, 1.55, "#6a816b", x, 0.82, 2.6);
      box(this.world, 0.34, 0.1, 0.15, "#eee9c5", x, 1.62, 2.6, 0.035);
    }
    const sign = label("PARK & GO", "#f3f1d7", "#3f7054", 2.1, 0.48);
    sign.position.set(3.9, 1.28, l.queue - 0.1);
    sign.userData.unique = true;
    this.world.add(sign);
    for (const x of [3.1, 4.7])
      box(this.world, 0.055, 1.22, 0.055, "#657e5b", x, 0.61, l.queue - 0.1);
    box(
      this.world,
      2.15,
      0.12,
      0.6,
      "#bdab7f",
      3.95,
      0.39,
      l.queue + 0.12,
      0.045,
    );
    for (const x of [3.1, 4.7])
      box(this.world, 0.12, 0.35, 0.36, "#6b8163", x, 0.18, l.queue + 0.12);
    floorLabel(
      this.world,
      "PARK A LITTLE",
      0,
      l.front - 0.42,
      3.4,
      "#718b69",
      0.32,
    );
    floorLabel(this.world, "P", -5.45, 1.25, 0.65, "#587759", 0.7);
    this.syncCars();
    this.syncQueue(true);
    this.resize();
  }
  parkingMark(v) {
    const p = this.position(v),
      g = group();
    g.position.copy(p);
    g.scale.set(1.25, 1, 1.25);
    g.rotation.y = this.angle(v.dir);
    this.world.add(g);
    for (const z of [-0.475, 0.475])
      box(g, v.len - 0.04, 0.012, 0.025, "#f1f0d7", 0, 0.111, z);
    box(g, 0.025, 0.012, 0.96, "#f1f0d7", -v.len / 2 + 0.02, 0.111, 0);
  }
  ensureCar(v) {
    let m = this.cars.get(v.id);
    if (m && m.userData.signature !== `${v.color}/${v.len}`) {
      release(m);
      this.cars.delete(v.id);
      m = null;
    }
    if (!m) {
      m = car(v);
      m.scale.setScalar(1.25);
      if (this.batcher) this.batcher.dirty = true;
      this.cars.set(v.id, m);
      this.scene.add(m);
    }
    return m;
  }
  syncCars() {
    const s = this.state(),
      all = [...s.vehicles, ...s.slots.filter(Boolean)],
      ids = new Set(all.map((v) => v.id));
    for (const [id, m] of this.cars)
      if (!ids.has(id) && !this.actions.has(id)) {
        release(m);
        this.cars.delete(id);
        if (this.batcher) this.batcher.dirty = true;
      }
    for (const v of all) {
      const m = this.ensureCar(v),
        slot = s.slots.findIndex((a) => a?.id === v.id);
      if (!this.actions.has(v.id)) {
        m.position.copy(slot < 0 ? this.position(v) : this.bayPoint(slot));
        m.rotation.y = slot < 0 ? this.angle(v.dir) : Math.PI / 2;
      }
      const badgeText = `${v.loaded}/${v.capacity}`;
      if (m.userData.badgeText !== badgeText) {
        release(m.userData.badge);
        const b = label(badgeText, "#315945", "#fffceb", 0.69, 0.22);
        b.position.set(0, 1.3, 0);
        m.add(b);
        m.userData.badge = b;
        m.userData.badgeText = badgeText;
      }
      const b = m.userData.badge;
      b.visible = slot >= 0 && !this.actions.has(v.id);
      b.quaternion.copy(m.quaternion).invert().multiply(this.camera.quaternion);
      m.userData.ring.visible =
        v.id === this.highlight || v.id === this.selected;
      m.userData.ring.material.opacity =
        0.65 + Math.sin(performance.now() * 0.006) * 0.25;
      if (!this.phases.has("boarding")) m.userData.door.visible = false;
    }
  }
  syncQueue(force = false) {
    const q = this.state().queue,
      key =
        q.slice(0, 14).join(",") +
        `/${q.length}/${this.phases.has("boarding")}`;
    if (!force && key === this.queueKey) return;
    this.queueKey = key;
    if (this.batcher) this.batcher.dirty = true;
    release(this.people);
    this.people = group();
    this.scene.add(this.people);
    q.slice(0, 14).forEach((color, i) => {
      if (i === 0 && this.phases.has("boarding")) return;
      const p = person(color);
      p.position.copy(this.queuePoint(i));
      p.position.y = 0.19;
      this.people.add(p);
    });
  }
  updateStationStatus() {
    const s = this.state(),
      full = s.slots.every(Boolean),
      boarding = this.phases.has("boarding");
    const el = document.getElementById("station-status");
    if (el)
      el.textContent = boarding
        ? "乘客上车中 · 其他小车可继续出发"
        : full
          ? "车位暂满 · 等待接客驶离"
          : `同色上车 · ${s.slots.filter((v) => !v).length} 个空位`;
    const key = s.queue.slice(0, 16).join(",") + "/" + s.queue.length;
    if (key !== this.hudQueueKey) {
      this.hudQueueKey = key;
      document.getElementById("queue-preview").innerHTML =
        s.queue
          .slice(0, 16)
          .map(
            (c, i) =>
              `<span class="queue-person" style="--color:${E.COLORS[c].body}" title="${i + 1}：${E.COLORS[c].name}" aria-label="${i === 0 ? "队首，" : ""}${E.COLORS[c].name}"></span>`,
          )
          .join("") +
        `<span class="queue-more">${s.queue.length > 16 ? "+" + (s.queue.length - 16) : s.queue.length ? "" : "全部送达"}</span>`;
    }
  }
  resize() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.gpu.setSize(w, h, false);
    this.updateCamera();
  }
  updateCamera() {
    if (!this.width) return;
    const l = this.layout(),
      target = new T.Vector3(0, 0, (l.front + l.back) / 2),
      distance = 30;
    this.camera.position.set(
      target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * distance,
      Math.sin(this.pitch) * distance,
      target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * distance,
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const x of [l.left, l.right])
      for (const z of [l.back, l.front])
        for (const y of [-0.7, 1.5]) {
          const p = new T.Vector3(x, y, z).applyMatrix4(
            this.camera.matrixWorldInverse,
          );
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
    const landscape = this.width / this.height > 1.8,
      top = landscape ? 5 : this.width > 600 ? 60 : 104,
      bottom = landscape ? 25 : 36,
      usable = Math.max(this.height * 0.45, this.height - top - bottom),
      aspect = this.width / this.height;
    const span =
      Math.max(
        (maxX - minX + 1.0) / aspect,
        ((maxY - minY + 0.4) * this.height) / usable,
      ) / this.zoom;
    const cy = (minY + maxY) / 2 + (((top - bottom) / this.height) * span) / 2;
    this.camera.left = (-span * aspect) / 2;
    this.camera.right = (span * aspect) / 2;
    this.camera.top = span / 2 + cy;
    this.camera.bottom = -span / 2 + cy;
    this.camera.updateProjectionMatrix();
  }
  resetCamera() {
    this.yaw = this.canvas.clientWidth < 600 ? 0.18 : 0.55;
    this.pitch = 0.83;
    this.zoom = 1;
    this.updateCamera();
  }
  zoomBy(factor) {
    this.zoom = T.MathUtils.clamp(this.zoom * factor, 0.75, 1.9);
    this.updateCamera();
  }
  hit(x, y) {
    this.pointer.set((x / this.width) * 2 - 1, (-y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.cars.values()], true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && o.userData.id === undefined) o = o.parent;
      if (o) {
        return o.userData.id;
      }
    }
    return null;
  }
  screenPoint(id) {
    const m = this.cars.get(id);
    if (!m) return null;
    const p = m.position.clone();
    p.y += 0.81;
    p.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + ((p.x + 1) * this.width) / 2,
      y: r.top + ((1 - p.y) * this.height) / 2,
    };
  }
  installInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      c.focus({ preventScroll: true });
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.gesture = {
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: this.pointers.size > 1,
      };
      if (this.pointers.size === 2) this.pinch = this.pointerDistance();
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = this.gesture;
      if (this.pointers.size > 1) {
        const d = this.pointerDistance();
        if (this.pinch) this.zoomBy(d / this.pinch);
        this.pinch = d;
        g.moved = true;
        return;
      }
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 7) g.moved = true;
      if (g.moved) {
        this.yaw += (e.clientX - g.lastX) * 0.006;
        this.pitch = T.MathUtils.clamp(
          this.pitch + (e.clientY - g.lastY) * 0.004,
          0.6,
          1.3,
        );
        this.updateCamera();
      }
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    });
    c.addEventListener("pointerup", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const g = this.gesture;
      this.pointers.delete(e.pointerId);
      if (!g.moved) {
        const r = c.getBoundingClientRect();
        this.onSelect?.(this.hit(e.clientX - r.left, e.clientY - r.top));
      }
      if (this.pointers.size === 1) {
        const p = [...this.pointers.values()][0];
        this.gesture = { ...p, lastX: p.x, lastY: p.y, moved: true };
      }
      this.pinch = null;
    });
    c.addEventListener("pointercancel", () => {
      this.pointers.clear();
      this.pinch = null;
      this.gesture = null;
    });
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomBy(Math.exp(-e.deltaY * 0.001));
      },
      { passive: false },
    );
  }
  pointerDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  frame(time) {
    requestAnimationFrame(this.frame);
    if (this.contextLost) return;
    if (document.hidden || time - this.lastFrame < 25) return;
    this.lastFrame = time;
    const s = this.state();
    if (this.layoutKey !== `${s.n}/${s.salt}/${s.slots.length}`) this.rebuild();
    this.syncCars();
    this.syncQueue();
    this.tickActions(time);
    this.batcher.update();
    this.gpu.render(this.scene, this.camera);
    if (!this.ready) {
      this.ready = true;
      document.getElementById("loading").hidden = true;
    }
  }
}
