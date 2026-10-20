/* =====================================================================
   splat-portal · WebGPU 渲染器
   ---------------------------------------------------------------------
   数据用 storage buffer（比纹理省去 unpack），排序沿用 CPU 计数排序
   后写进索引 buffer——26 万点每帧排序约 3~5ms，比 GPU 基数排序更省
   工程复杂度，且排序与 WebGL2 后端共享同一份代码路径，行为一致。

   渲染管线：instance_index → 索引 buffer → 属性 buffer，投影协方差，
   片元做高斯衰减与传送门裁剪。
   ===================================================================== */
(function (global) {
  'use strict';

  const COMMON = `
  struct Camera {
    viewProj : mat4x4<f32>,
    view : mat4x4<f32>,
    camPos : vec4<f32>,
    camRight : vec4<f32>,
    camUp : vec4<f32>,
    camFwd : vec4<f32>,
    viewport : vec4<f32>,
    params : vec4<f32>,
    render : vec4<f32>,
    portalCenter : vec4<f32>,
    portalNormal : vec4<f32>,
    portalShape : vec4<f32>,
    portalColor : vec4<f32>,
    morphCenter : vec4<f32>,
  };

  @group(0) @binding(0) var<uniform> cam : Camera;
  @group(0) @binding(1) var<storage, read> tPos : array<vec4<f32>>;
  @group(0) @binding(2) var<storage, read> tScale : array<vec4<f32>>;
  @group(0) @binding(3) var<storage, read> tQuat : array<vec4<f32>>;
  @group(0) @binding(4) var<storage, read> tColor : array<vec4<f32>>;
  @group(0) @binding(5) var<storage, read> order : array<u32>;
  `;

  const VS = COMMON + `
  struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0) color : vec4<f32>,
    @location(1) quad : vec2<f32>,
  };

  @vertex
  fn vs(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> VSOut {
    var out : VSOut;
    let n = u32(cam.render.z);
    if (ii >= n) {
      out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
      out.color = vec4<f32>(0.0);
      out.quad = vec2<f32>(0.0);
      return out;
    }
    let idx = order[ii];
    let p0 = tPos[idx];
    let s = tScale[idx];
    let q = tQuat[idx];
    let c = tColor[idx];

    var pos = p0.xyz;
    var fade = 1.0;
    let morph = cam.params.z;
    if (morph > 0.0001) {
      let dir = normalize(pos - cam.morphCenter.xyz + vec3<f32>(0.0001));
      pos = pos + dir * (morph * cam.params.w) * (0.5 + p0.w);
      fade = 1.0 - morph * 0.9;
    }

    let clip = cam.viewProj * vec4<f32>(pos, 1.0);
    if (clip.w <= 0.02) {
      out.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
      out.color = vec4<f32>(0.0);
      out.quad = vec2<f32>(0.0);
      return out;
    }

    let camPos = (cam.view * vec4<f32>(pos, 1.0)).xyz;
    let depth = max(-camPos.z, 0.05);

    // .splat 四元数为 (w, x, y, z)
    let w = q.x; let x = q.y; let y = q.z; let z = q.w;
    // 与 WebGL2 版一致：三列即三根本体轴，乘以尺度后组成 M
    let ax0 = vec3<f32>(1.0 - 2.0*(y*y + z*z), 2.0*(x*y + w*z),     2.0*(x*z - w*y));
    let ax1 = vec3<f32>(2.0*(x*y - w*z),       1.0 - 2.0*(x*x + z*z), 2.0*(y*z + w*x));
    let ax2 = vec3<f32>(2.0*(x*z + w*y),       2.0*(y*z - w*x),     1.0 - 2.0*(x*x + y*y));
    let M = mat3x3<f32>(ax0 * s.x, ax1 * s.y, ax2 * s.z);
    let Sigma = M * transpose(M);
    let V3 = mat3x3<f32>(cam.view[0].xyz, cam.view[1].xyz, cam.view[2].xyz);
    let Vrk = V3 * Sigma * transpose(V3);

    let invZ = 1.0 / depth;
    let fx = cam.params.x;
    let fy = cam.params.x;
    let J = mat3x3<f32>(
      fx*invZ, 0.0, 0.0,
      0.0, fy*invZ, 0.0,
      -fx*camPos.x*invZ*invZ, -fy*camPos.y*invZ*invZ, 0.0
    );
    let cov = J * Vrk * transpose(J);

    let a = cov[0][0] + 0.3;
    let b = cov[0][1];
    let cc = cov[1][1] + 0.3;

    let mid = 0.5 * (a + cc);
    let rad = sqrt(max(0.05, 0.25*(a-cc)*(a-cc) + b*b));
    let l1 = mid + rad;
    let l2 = max(0.05, mid - rad);
    let maxAxis = max(6.0, cam.render.w * 40.0);
    let s1 = min(sqrt(l1), maxAxis);
    let s2 = min(sqrt(l2), maxAxis);

    var v1 = vec2<f32>(b, l1 - a);
    if (dot(v1, v1) < 1e-12) { v1 = vec2<f32>(1.0, 0.0); }
    v1 = normalize(v1);
    let v2 = vec2<f32>(-v1.y, v1.x);

    let ps = cam.params.y;
    let axis1 = v1 * s1 * ps;
    let axis2 = v2 * s2 * ps;

    var off = vec2<f32>(-1.0, -1.0);
    if (vi == 1u) { off = vec2<f32>(1.0, -1.0); }
    else if (vi == 2u) { off = vec2<f32>(-1.0, 1.0); }
    else if (vi == 3u) { off = vec2<f32>(-1.0, 1.0); }
    else if (vi == 4u) { off = vec2<f32>(1.0, -1.0); }
    else { off = vec2<f32>(1.0, 1.0); }

    out.quad = off;
    let ndc = clip.xy / clip.w;
    let delta = (axis1 * off.x + axis2 * off.y) * (2.0 / cam.viewport.xy);
    out.pos = vec4<f32>(ndc + delta, 0.0, 1.0);
    out.color = vec4<f32>(c.rgb, c.a * fade);
    return out;
  }
  `;

  const FS = COMMON + `
  struct FSIn {
    @location(0) color : vec4<f32>,
    @location(1) quad : vec2<f32>,
  };

  @fragment
  fn fs(in : FSIn, @builtin(position) fc : vec4<f32>) -> @location(0) vec4<f32> {
    let r2 = dot(in.quad, in.quad);
    if (r2 > 1.0) { discard; }
    let g = exp(-cam.render.w * r2);
    var alpha = in.color.a * g * cam.render.y;
    if (alpha < cam.render.x) { discard; }

    var col = in.color.rgb;
    let mode = u32(cam.portalShape.z);
    if (mode != 0u) {
      // 世界空间门盘：中心 + 半径，法线朝向相机。
      let vp = cam.viewport;
      let ndcX = (fc.x / (vp.x * 0.5) - 1.0) * vp.z * vp.w;
      let ndcY = (fc.y / (vp.y * 0.5) - 1.0) * vp.z;
      let dir = normalize(cam.camFwd.xyz + cam.camRight.xyz * ndcX + cam.camUp.xyz * ndcY);

      let denom = dot(dir, cam.portalNormal.xyz);
      // 默认「不在门内」：只有确实命中门盘才置 1。
      var inDoor = 0.0;
      var ring = 0.0;
      if (abs(denom) > 1e-3) {
        let t = dot(cam.portalCenter.xyz - cam.camPos.xyz, cam.portalNormal.xyz) / denom;
        if (t > 0.0) {
          let hit = cam.camPos.xyz + dir * t;
          let dist = length(hit - cam.portalCenter.xyz);
          let edge = cam.portalNormal.w;
          let soft = cam.portalShape.x;
          inDoor = 1.0 - smoothstep(edge - soft, edge + soft * 0.2, dist);
          ring = smoothstep(edge - soft * 2.4, edge - soft * 0.5, dist) * (1.0 - inDoor);
        }
      }

      if (mode == 1u) {
        if (inDoor > 0.002) { discard; }
        col = col + cam.portalColor.rgb * ring * cam.portalShape.y;
      } else {
        if (inDoor < 0.998) { discard; }
      }
    }
    let c = max(col, vec3<f32>(0.0));
    let knee = vec3<f32>(0.72) + (vec3<f32>(1.0) - vec3<f32>(0.72)) *
      (vec3<f32>(1.0) - exp(-(c - vec3<f32>(0.72)) / (1.0 - 0.72)));
    c = mix(c, knee, step(vec3<f32>(0.72), c));
    return vec4<f32>(c * alpha, alpha);
  }
  `;

  class RendererGPU {
    constructor(device, context, format) {
      this.device = device;
      this.context = context;
      this.format = format;
      this.scenes = new Map();
      this.cameraBuffer = device.createBuffer({
        size: 320,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.cameraData = new Float32Array(80);
      this.pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: device.createShaderModule({ code: VS }), entryPoint: 'vs' },
        fragment: {
          module: device.createShaderModule({ code: FS }), entryPoint: 'fs',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });
    }

    get name() { return 'WebGPU'; }

    upload(slot, splat) {
      const dev = this.device;
      const n = splat.count;
      const prev = this.scenes.get(slot);
      if (prev) {
        [prev.tPos, prev.tScale, prev.tQuat, prev.tColor, prev.orderBuf].forEach(b => b.destroy());
      }
      const mk = (arr) => {
        const b = dev.createBuffer({
          size: Math.max(16, arr.byteLength),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        dev.queue.writeBuffer(b, 0, arr);
        return b;
      };
      const pos = new Float32Array(n * 4);
      const scale = new Float32Array(n * 4);
      const quat = new Float32Array(n * 4);
      const color = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        pos[i * 4] = splat.pos[i * 3];
        pos[i * 4 + 1] = splat.pos[i * 3 + 1];
        pos[i * 4 + 2] = splat.pos[i * 3 + 2];
        pos[i * 4 + 3] = SplatGL.hash01(i * 2654435761);
        scale[i * 4] = splat.scale[i * 3];
        scale[i * 4 + 1] = splat.scale[i * 3 + 1];
        scale[i * 4 + 2] = splat.scale[i * 3 + 2];
        quat[i * 4] = splat.quat[i * 4];
        quat[i * 4 + 1] = splat.quat[i * 4 + 1];
        quat[i * 4 + 2] = splat.quat[i * 4 + 2];
        quat[i * 4 + 3] = splat.quat[i * 4 + 3];
        color[i * 4] = splat.color[i * 4] / 255;
        color[i * 4 + 1] = splat.color[i * 4 + 1] / 255;
        color[i * 4 + 2] = splat.color[i * 4 + 2] / 255;
        color[i * 4 + 3] = splat.color[i * 4 + 3] / 255;
      }
      const scene = {
        n,
        tPos: mk(pos), tScale: mk(scale), tQuat: mk(quat), tColor: mk(color),
        orderBuf: dev.createBuffer({
          size: Math.max(16, n * 4),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        posArr: splat.pos,
        order: new Uint32Array(n),
        orderF: new Float32Array(n),
        depths: new Float32Array(n),
        buckets: new Uint16Array(n),
        counts: new Uint32Array(2048),
        starts: new Uint32Array(2048),
      };
      scene.bindGroup = dev.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: { buffer: scene.tPos } },
          { binding: 2, resource: { buffer: scene.tScale } },
          { binding: 3, resource: { buffer: scene.tQuat } },
          { binding: 4, resource: { buffer: scene.tColor } },
          { binding: 5, resource: { buffer: scene.orderBuf } },
        ],
      });
      this.scenes.set(slot, scene);
    }

    resize(w, h, dpr) {
      this.width = w; this.height = h; this.dpr = dpr;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (this.canvasWidth !== pw || this.canvasHeight !== ph) {
        this.canvasWidth = pw; this.canvasHeight = ph;
        this.context.canvas.width = pw;
        this.context.canvas.height = ph;
      }
    }

    begin() {
      this.encoder = this.device.createCommandEncoder();
      this.pass = this.encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.026, g: 0.025, b: 0.028, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      this.pass.setPipeline(this.pipeline);
    }

    drawScene(slot, view, limit) {
      const s = this.scenes.get(slot);
      if (!s || !this.pass) return;
      const n = Math.min(s.n, limit || s.n);
      this.sort(s, view.eye, view.fwd, n);

      const d = this.cameraData;
      d.set(view.viewProj, 0);
      d.set(view.view, 16);
      d.set([view.eye[0], view.eye[1], view.eye[2], 0], 32);
      d.set([view.right[0], view.right[1], view.right[2], 0], 36);
      d.set([view.up[0], view.up[1], view.up[2], 0], 40);
      d.set([view.fwd[0], view.fwd[1], view.fwd[2], 0], 44);
      d.set([view.widthPx, view.heightPx, view.tanHalfFov, view.widthPx / view.heightPx], 48);
      d.set([view.focalPx, view.pointScale, view.morph, view.morphAmount], 52);
      d.set([view.alphaCut, view.opacity, n, view.kernel], 56);
      const p = view.portal;
      if (p) {
        d.set([p.center[0], p.center[1], p.center[2], 0], 60);
        d.set([p.normal[0], p.normal[1], p.normal[2], p.radius], 64);
        d.set([p.soft, p.ring, p.mode, 0], 68);
        d.set([p.color[0], p.color[1], p.color[2], 0], 72);
      } else {
        d.set([0, 0, 0, 0], 60);
        d.set([0, 0, 1, 1], 64);
        d.set([0, 0, 0, 0], 68);
        d.set([0, 0, 0, 0], 72);
      }
      d.set([view.morphCenter[0], view.morphCenter[1], view.morphCenter[2], 0], 76);
      this.device.queue.writeBuffer(this.cameraBuffer, 0, d);
      this.device.queue.writeBuffer(s.orderBuf, 0, s.order, 0, n);
      this.pass.setBindGroup(0, s.bindGroup);
      this.pass.draw(6, n);
    }

    sort(s, eye, fwd, limit) {
      const n = limit;
      const p = s.posArr;
      const depths = s.depths;
      let minD = Infinity, maxD = -Infinity;
      for (let i = 0; i < n; i++) {
        const d = (p[i * 3] - eye[0]) * fwd[0] + (p[i * 3 + 1] - eye[1]) * fwd[1] + (p[i * 3 + 2] - eye[2]) * fwd[2];
        depths[i] = d > 0 ? d : 1e6;
        if (d > 0) { if (d < minD) minD = d; if (d > maxD) maxD = d; }
      }
      if (!isFinite(minD)) { minD = 0; maxD = 1; }
      const B = 2048;
      const counts = s.counts;
      counts.fill(0);
      const span = Math.max(maxD - minD, 1e-5);
      const k = (B - 1) / span;
      const buckets = s.buckets;
      for (let i = 0; i < n; i++) {
        let b = ((depths[i] - minD) * k) | 0;
        if (b < 0) b = 0; else if (b >= B) b = B - 1;
        buckets[i] = b;
        counts[b]++;
      }
      const starts = s.starts;
      let acc = 0;
      for (let b = B - 1; b >= 0; b--) { starts[b] = acc; acc += counts[b]; }
      const order = s.order;
      for (let i = 0; i < n; i++) {
        const b = buckets[i];
        order[starts[b]++] = i;
      }
    }

    end() {
      this.pass.end();
      this.device.queue.submit([this.encoder.finish()]);
    }
  }

  global.SplatGPU = { RendererGPU };
})(window);
