/* Flower · 渲染器：原生 WebGL2，零依赖。
   管线：HDR 场景（花盘不透明写深度 → 加色粒子/雾团/丝线/散景）
        → 反馈拖尾（上一帧按时间常数衰减后叠加，能量归一）
        → 5 级降采样 + 帐篷上采样 bloom
        → 调色输出到画布 */
(function (root) {
  'use strict';
  var TF = root.TF;
  var SH = TF.SHADERS;
  var STRIDE = TF.STRIDE;
  var KIND = TF.KIND;

  function compile(gl, type, src, label) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s) || '';
      var lines = src.split('\n'), m = /ERROR:\s*\d+:(\d+)/.exec(log), where = '';
      if (m) where = ' | near line ' + m[1] + ': ' + lines.slice(Math.max(0, +m[1] - 2), +m[1] + 1).join(' / ');
      throw new Error('shader compile failed [' + label + ']: ' + log + where);
    }
    return s;
  }
  function program(gl, vs, fs, label) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, label));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, label));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program link failed [' + label + ']: ' + gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i), name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { prog: p, u: u, label: label };
  }

  TF.createRenderer = function (canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer, powerPreference: 'high-performance'
    });
    if (!gl) return null;
    var hdr = !!gl.getExtension('EXT_color_buffer_float');
    var enc = hdr ? 1 : 0.14;          // 无浮点渲染目标时：场景先压进 0~1，调色时解回
    gl.getExtension('OES_texture_float_linear');

    var P = {
      point: program(gl, SH.pointVS, SH.pointFS, 'point'),
      disc: program(gl, SH.discVS, SH.discFS, 'disc'),
      quad: program(gl, SH.quadVS, SH.quadFS, 'quad'),
      line: program(gl, SH.lineVS, SH.lineFS, 'line'),
      feedback: program(gl, SH.fsVS, SH.feedbackFS, 'feedback'),
      down: program(gl, SH.fsVS, SH.downFS, 'down'),
      up: program(gl, SH.fsVS, SH.upFS, 'up'),
      grade: program(gl, SH.fsVS, SH.gradeFS, 'grade')
    };

    /* 全屏三角形 VAO（无属性，靠 gl_VertexID） */
    var fsq = gl.createVertexArray();

    /* 单位花盘网格：10 环 × 48 段，凹面 z = −0.16·(1−r²) */
    var discVao = gl.createVertexArray(), discCount = 0;
    (function buildDisc() {
      var RINGS = 10, SEG = 48, v = [], idx = [];
      for (var r = 0; r <= RINGS; r++) {
        var rr = r / RINGS;
        for (var s = 0; s <= SEG; s++) {
          var a = (s / SEG) * Math.PI * 2, x = rr * Math.cos(a), y = rr * Math.sin(a);
          var l = Math.hypot(0.32 * x, 0.32 * y, 1);
          v.push(x, y, -0.16 * (1 - rr * rr), -0.32 * x / l, -0.32 * y / l, 1 / l);
        }
      }
      for (var r2 = 0; r2 < RINGS; r2++) for (var s2 = 0; s2 < SEG; s2++) {
        var a0 = r2 * (SEG + 1) + s2, b0 = a0 + SEG + 1;
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
      gl.bindVertexArray(discVao);
      var vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      var ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      discCount = idx.length;
    })();

    /* ---------- 几何批次 ---------- */
    var batches = { points: [], quads: [], marginQuads: [], lines: null, sprites: null };

    function freeQuads() {
      batches.quads.forEach(disposeBatch);
      batches.quads = [];
    }

    function uploadPoints(res, tag) {
      var vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, res.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE * 4, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 28);
      gl.bindVertexArray(null);
      var objs = res.objects.map(function (o) {
        return {
          type: o.type, id: o.id, start: o.start, count: o.count, color: o.color,
          pos: o.pos, quat: o.quat, scale: o.scale, spin: o.type === 'flower' ? (o.spin * Math.PI / 180) : 0,
          jitter: o.type === 'flower' ? 1.5 : o.type === 'leaf' ? 2.2 : 0,
          wispLife: 2.0 + ((o.start * 0.618) % 1) * 2.2,
          gain: o.gain || 1, R: o.R || 0,
          model: TF.mat4FromQuatPosScale(o.quat, o.pos[0], o.pos[1], o.pos[2], o.scale)
        };
      });
      return { tag: tag, vao: vao, buf: buf, objs: objs, total: res.total, flowers: objs.filter(function (o) { return o.type === 'flower'; }) };
    }

    function uploadQuads(arr, isSprite) {
      // 入参每片 12 浮点：雾团 [x,y,z,r,tone,k,seed,…]，散景 [x,y,z,r,r,g,b,I,seed,…]
      var n = arr.length / 12, vert = new Float32Array(n * 6 * 12), k = 0;   // 每顶点 12 浮点
      var CORN = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      var GOLD = TF.gen.GOLD, GREEN = TF.gen.GREEN;
      for (var i = 0; i < n; i++) {
        var b = i * 12, col;
        if (isSprite) col = [arr[b + 4], arr[b + 5], arr[b + 6]];
        else col = [GREEN[0] + (GOLD[0] - GREEN[0]) * arr[b + 4], GREEN[1] + (GOLD[1] - GREEN[1]) * arr[b + 4], GREEN[2] + (GOLD[2] - GREEN[2]) * arr[b + 4]];
        for (var c = 0; c < 6; c++) {
          vert[k++] = arr[b]; vert[k++] = arr[b + 1]; vert[k++] = arr[b + 2];
          vert[k++] = CORN[c][0]; vert[k++] = CORN[c][1];
          vert[k++] = arr[b + 3]; vert[k++] = isSprite ? 0 : arr[b + 6];
          vert[k++] = isSprite ? arr[b + 7] : arr[b + 5];
          vert[k++] = isSprite ? 1 : 0;
          vert[k++] = col[0]; vert[k++] = col[1]; vert[k++] = col[2];
        }
      }
      var vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, vert, gl.STATIC_DRAW);
      // 每顶点 12 浮点 = 48 字节：center(3) corner(2) P0(4) color(3)
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 48, 36);
      gl.bindVertexArray(null);
      return { vao: vao, buf: buf, count: n * 6 };
    }

    function uploadLines(arr) {
      // 入参每段 8 浮点：x0,y0,z0,x1,y1,z1,b,seed → 4 顶点 + 6 索引
      var n = arr.length / 8, vert = new Float32Array(n * 4 * 10), idx = new Uint32Array(n * 6), k = 0;
      for (var i = 0; i < n; i++) {
        var b = i * 8;
        for (var e = 0; e < 2; e++) {
          var ax = arr[b + e * 3], ay = arr[b + e * 3 + 1], az = arr[b + e * 3 + 2];
          var ox = arr[b + (1 - e) * 3], oy = arr[b + (1 - e) * 3 + 1], oz = arr[b + (1 - e) * 3 + 2];
          for (var s = 0; s < 2; s++) {
            vert[k++] = ax; vert[k++] = ay; vert[k++] = az;
            vert[k++] = ox; vert[k++] = oy; vert[k++] = oz;
            vert[k++] = s ? 1 : -1; vert[k++] = e; vert[k++] = arr[b + 6]; vert[k++] = arr[b + 7];
          }
        }
        var v0 = i * 4;
        idx[i * 6] = v0; idx[i * 6 + 1] = v0 + 2; idx[i * 6 + 2] = v0 + 1; idx[i * 6 + 3] = v0 + 1; idx[i * 6 + 4] = v0 + 2; idx[i * 6 + 5] = v0 + 3;
      }
      var vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, vert, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao: vao, count: idx.length };
    }

    /* ---------- 渲染目标 ---------- */
    function makeTarget(w, h, withDepth) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var rb = null;
      if (withDepth) {
        rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      }
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + w + 'x' + h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fb: fb, tex: tex, rb: rb, w: w, h: h };
    }
    function freeTarget(t) {
      if (!t) return;
      gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex);
      if (t.rb) gl.deleteRenderbuffer(t.rb);
    }

    var W = 0, H = 0, scene = null, accum = [null, null], ping = 0, down = [], up = [], levels = 5;

    function setSize(w, h) {
      w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
      if (w === W && h === H) return false;
      W = w; H = h;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      freeTarget(scene); freeTarget(accum[0]); freeTarget(accum[1]);
      down.forEach(freeTarget); up.forEach(freeTarget);
      down = []; up = [];
      scene = makeTarget(W, H, true);
      accum = [makeTarget(W, H, false), makeTarget(W, H, false)];
      levels = Math.min(5, Math.max(3, Math.floor(Math.log2(Math.min(W, H))) - 3));
      var bw = W, bh = H;
      for (var i = 0; i < levels; i++) {
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
        down.push(makeTarget(bw, bh, false));
        if (i < levels - 1) up.push(makeTarget(bw, bh, false));
      }
      // 清空反馈缓冲，避免首帧残留
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum[0].fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum[1].fb); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return true;
    }

    function blit(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
      gl.bindVertexArray(fsq);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function bindTex(unit, tex, loc) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    }

    var tmpQ = [0, 0, 0, 1], tmpModel = TF.mat4();
    var lastDrawn = 0;

    function drawScene(st) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
      gl.viewport(0, 0, W, H);
      gl.colorMask(true, true, true, true);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 1);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var pxDev = st.pxPerRef * (W / st.cssW);      // 每参考像素 = 多少设备像素
      var i, o, b;

      /* 花盘（不透明，写深度） */
      gl.useProgram(P.disc.prog);
      gl.uniformMatrix4fv(P.disc.u.uViewProj, false, st.vp);
      gl.uniform3fv(P.disc.u.uCamPos, st.camPos);
      gl.uniform1f(P.disc.u.uScale, enc);
      gl.bindVertexArray(discVao);
      var discModel = TF.mat4();
      for (i = 0; i < batches.points.length; i++) {
        b = batches.points[i];
        for (var f = 0; f < b.flowers.length; f++) {
          o = b.flowers[f];
          // 单位花盘 × 花盘半径（参考像素）× 深度缩放
          var sR = o.R;
          for (var e = 0; e < 11; e++) discModel[e] = o.model[e] * sR;
          discModel[11] = o.model[11];
          discModel.set(o.model.subarray(12, 16), 12);
          gl.uniformMatrix4fv(P.disc.u.uModel, false, discModel);
          gl.uniform1f(P.disc.u.uR, o.R);
          gl.uniform1f(P.disc.u.uGain, o.gain);
          gl.drawElements(gl.TRIANGLES, discCount, gl.UNSIGNED_SHORT, 0);
        }
      }
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      /* 雾团 + 散景面片 */
      gl.useProgram(P.quad.prog);
      gl.uniformMatrix4fv(P.quad.u.uViewProj, false, st.vp);
      gl.uniform4f(P.quad.u.uCam, st.camPos[0], st.camPos[1], st.camPos[2], TF.FRAME.focal);
      gl.uniform4f(P.quad.u.uScreen, pxDev, W, H, st.haze);
      gl.uniform1f(P.quad.u.uTime, st.time);
      gl.uniform1f(P.quad.u.uScale, enc);
      var quadSets = batches.quads.concat(batches.marginQuads);
      for (i = 0; i < quadSets.length; i++) {
        b = quadSets[i];
        gl.bindVertexArray(b.vao);
        gl.uniform4f(P.quad.u.uScreen, pxDev, W, H, b.sprite ? 1 : st.haze);
        gl.drawArrays(gl.TRIANGLES, 0, b.count);
      }
      /* 粒子 */
      gl.useProgram(P.point.prog);
      gl.uniformMatrix4fv(P.point.u.uViewProj, false, st.vp);
      gl.uniform4f(P.point.u.uCam, st.camPos[0], st.camPos[1], st.camPos[2], TF.FRAME.focal);
      gl.uniform4f(P.point.u.uScreen, pxDev, H, st.focus, st.dof);
      gl.uniform1f(P.point.u.uScale, enc);
      lastDrawn = 0;
      var anim = [0, 0, 0, 0];
      for (i = 0; i < batches.points.length; i++) {
        b = batches.points[i];
        gl.bindVertexArray(b.vao);
        for (var j = 0; j < b.objs.length; j++) {
          o = b.objs[j];
          var n = Math.floor(o.count * st.frac) || (o.count ? 1 : 0);
          if (!n) continue;
          if (o.spin) {
            var q = TF.quatAxisAngle(0, 0, 1, o.spin * st.time);
            tmpQ = TF.quatMul(o.quat, q);
            o.model = TF.mat4FromQuatPosScale(tmpQ, o.pos[0], o.pos[1], o.pos[2], o.scale, o.model);
          }
          anim[0] = st.time; anim[1] = o.jitter; anim[2] = o.wispLife;
          gl.uniformMatrix4fv(P.point.u.uModel, false, o.model);
          gl.uniform3fv(P.point.u.uColor, o.color);
          gl.uniform4fv(P.point.u.uAnim, anim);
          gl.drawArrays(gl.POINTS, o.start, n);
          lastDrawn += n;
        }
      }

      /* 丝线 */
      if (batches.lines) {
        gl.useProgram(P.line.prog);
        gl.uniformMatrix4fv(P.line.u.uViewProj, false, st.vp);
        gl.uniform4f(P.line.u.uScreen, pxDev, W, H, st.lineW);
        gl.uniform1f(P.line.u.uTime, st.time);
        gl.uniform1f(P.line.u.uScale, enc);
        gl.uniform1f(P.line.u.uBright, st.lineB);
        gl.bindVertexArray(batches.lines.vao);
        gl.drawElements(gl.TRIANGLES, batches.lines.count, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function frame(st) {
      if (!scene) return;
      drawScene(st);

      /* 反馈拖尾：按实时衰减（trail = 60fps 下每帧保留比例） */
      var trail = Math.max(0, Math.min(0.985, st.trail));
      var tau = trail > 0.001 ? -1 / (60 * Math.log(trail)) : 0;
      var decay = tau > 0 ? Math.exp(-st.dt / tau) : 0;
      var src = accum[1 - ping], dst = accum[ping];
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(P.feedback.prog);
      bindTex(0, scene.tex, P.feedback.u.uScene);
      bindTex(1, src.tex, P.feedback.u.uPrev);
      gl.uniform1f(P.feedback.u.uDecay, decay);
      blit(dst);
      ping = 1 - ping;

      /* bloom */
      gl.useProgram(P.down.prog);
      for (var i = 0; i < levels; i++) {
        bindTex(0, i === 0 ? dst.tex : down[i - 1].tex, P.down.u.uTex);
        gl.uniform2f(P.down.u.uTexel, 1 / (i === 0 ? W : down[i - 1].w), 1 / (i === 0 ? H : down[i - 1].h));
        blit(down[i]);
      }
      gl.useProgram(P.up.prog);
      gl.uniform1f(P.up.u.uRadius, st.bloomRadius);
      for (var k = levels - 2; k >= 0; k--) {
        bindTex(0, k === levels - 2 ? down[levels - 1].tex : up[k + 1].tex, P.up.u.uTex);
        gl.uniform2f(P.up.u.uTexel, 1 / down[k].w, 1 / down[k].h);
        bindTex(1, down[k].tex, P.up.u.uBase);
        blit(up[k]);
      }

      /* 调色 → 画布 */
      gl.useProgram(P.grade.prog);
      bindTex(0, dst.tex, P.grade.u.uAcc);
      bindTex(1, up[0].tex, P.grade.u.uBloom);
      gl.uniform2f(P.grade.u.uRes, W, H);
      gl.uniform1f(P.grade.u.uTime, st.time);
      gl.uniform1f(P.grade.u.uDecode, 1 / enc);
      gl.uniform4f(P.grade.u.uP0, st.exposure, st.bloom, st.grain, st.vignette);
      gl.uniform4f(P.grade.u.uP1, st.lift, st.aberration, 0, 0);
      blit(null);
      gl.activeTexture(gl.TEXTURE0);
    }

    function clearTrails() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum[0].fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum[1].fb); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function disposeBatch(b) {
      if (!b) return;
      gl.deleteVertexArray(b.vao);
      if (b.buf) gl.deleteBuffer(b.buf);
    }

    return {
      gl: gl,
      hdr: hdr,
      programs: P,
      get size() { return { w: W, h: H }; },
      get drawn() { return lastDrawn; },
      setSize: setSize,
      frame: frame,
      clearTrails: clearTrails,
      setPoints: function (index, res, tag) {
        if (batches.points[index]) disposeBatch(batches.points[index]);
        batches.points[index] = uploadPoints(res, tag);
        return batches.points[index];
      },
      /* 核心画幅的雾团面片 / 散景 / 丝线 */
      setExtras: function (core) {
        freeQuads();
        var hz = uploadQuads(core.haze, false), sp = uploadQuads(core.sprites, true);
        hz.sprite = false; sp.sprite = true;
        batches.quads = [hz, sp];
        if (batches.lines) { gl.deleteVertexArray(batches.lines.vao); }
        batches.lines = uploadLines(core.lines);
      },
      /* 画幅外的雾团面片（随视口宽高比重建） */
      setMarginQuads: function (arr) {
        batches.marginQuads.forEach(disposeBatch);
        batches.marginQuads = arr && arr.length ? [Object.assign(uploadQuads(arr, false), { sprite: false })] : [];
      },
      stats: function () {
        var tot = 0, objs = 0;
        batches.points.forEach(function (b) { tot += b.total; objs += b.objs.length; });
        return { particles: tot, objects: objs, hdr: hdr, w: W, h: H, levels: levels, bytes: tot * STRIDE * 4, quads: batches.quads.length + batches.marginQuads.length };
      },
      dispose: function () {
        batches.points.forEach(disposeBatch);
        freeQuads();
        batches.marginQuads.forEach(disposeBatch);
        if (batches.lines) { gl.deleteVertexArray(batches.lines.vao); }
        freeTarget(scene); freeTarget(accum[0]); freeTarget(accum[1]);
        down.forEach(freeTarget); up.forEach(freeTarget);
        Object.keys(P).forEach(function (k) { gl.deleteProgram(P[k].prog); });
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
