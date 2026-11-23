/* Flower · 相机：绕焦点的阻尼轨道 + 指针视差 + 滚轮缩放；闲置 5 秒后缓慢回到参考构图。
   默认位姿下，参考图像素坐标 == 画布核心画幅坐标（见 layout.fit）。 */
(function (root) {
  'use strict';
  var TF = root.TF;
  var clamp = TF.clamp;

  TF.createCamera = function () {
    var F = TF.FRAME;
    var fovY = 2 * Math.atan((F.h * F.unit) / 2 / F.focal);
    var st = {
      yaw: 0, pitch: 0, zoom: 1, tYaw: 0, tPitch: 0, tZoom: 1, vYaw: 0, vPitch: 0,
      parX: 0, parY: 0, tParX: 0, tParY: 0, dragging: false, idle: 99, focus: 22
    };
    var LIM = { yaw: 0.62, pitch: 0.40, zoomMin: 0.72, zoomMax: 1.7 };
    var view = TF.mat4(), proj = TF.mat4(), vp = TF.mat4(), pos = [0, 0, F.focal];

    var api = {
      st: st, fovY: fovY, view: view, proj: proj, vp: vp, pos: pos, aspect: 1, limits: LIM,
      startDrag: function () { st.dragging = true; st.vYaw = 0; st.vPitch = 0; st.idle = 0; },
      /* 拖动：画面跟着手走（像素位移） */
      drag: function (dx, dy, dt) {
        var k = 0.0032;
        st.tYaw = clamp(st.tYaw - dx * k, -LIM.yaw, LIM.yaw);
        st.tPitch = clamp(st.tPitch + dy * k, -LIM.pitch, LIM.pitch);
        st.idle = 0;
        var d = Math.max(dt, 1 / 240);
        st.vYaw = st.vYaw * 0.5 - (dx * k / d) * 0.5;
        st.vPitch = st.vPitch * 0.5 + (dy * k / d) * 0.5;
      },
      endDrag: function () { st.dragging = false; st.idle = 0; },
      wheel: function (deltaY) {
        st.tZoom = clamp(st.tZoom * Math.exp(-deltaY * 0.0012), LIM.zoomMin, LIM.zoomMax);
        st.idle = Math.min(st.idle, 4.4);
      },
      pinch: function (ratio) { st.tZoom = clamp(st.tZoom * ratio, LIM.zoomMin, LIM.zoomMax); st.idle = Math.min(st.idle, 4.4); },
      /* 指针视差：nx ∈ [−1,1] 右为正，ny ∈ [−1,1] 上为正 */
      pointer: function (nx, ny) { st.tParX = nx; st.tParY = ny; },
      reset: function () { st.tYaw = 0; st.tPitch = 0; st.tZoom = 1; st.vYaw = 0; st.vPitch = 0; },
      update: function (dt) {
        st.idle += dt;
        if (!st.dragging) {
          if (Math.abs(st.vYaw) > 1e-4 || Math.abs(st.vPitch) > 1e-4) {
            st.tYaw = clamp(st.tYaw + st.vYaw * dt, -LIM.yaw, LIM.yaw);
            st.tPitch = clamp(st.tPitch + st.vPitch * dt, -LIM.pitch, LIM.pitch);
            var damp = Math.exp(-dt * 3.2);
            st.vYaw *= damp; st.vPitch *= damp;
          }
          if (st.idle > 5) {
            var back = 1 - Math.exp(-dt * 0.55);
            st.tYaw += (0 - st.tYaw) * back;
            st.tPitch += (0 - st.tPitch) * back;
            st.tZoom += (1 - st.tZoom) * back;
          }
        }
        var k = 1 - Math.exp(-dt * (st.dragging ? 16 : 7));
        st.yaw += (st.tYaw - st.yaw) * k;
        st.pitch += (st.tPitch - st.pitch) * k;
        st.zoom += (st.tZoom - st.zoom) * k;
        var kp = 1 - Math.exp(-dt * 3.0);
        st.parX += (st.tParX - st.parX) * kp;
        st.parY += (st.tParY - st.parY) * kp;
        api.layout();
      },
      layout: function () {
        var yaw = st.yaw + st.parX * 0.042, pitch = st.pitch + st.parY * 0.028;
        var D = F.focal / st.zoom;
        pos[0] = D * Math.sin(yaw) * Math.cos(pitch);
        pos[1] = D * Math.sin(pitch);
        pos[2] = -F.focal + D * Math.cos(yaw) * Math.cos(pitch);
        TF.mat4LookAt(pos[0], pos[1], pos[2], 0, 0, -F.focal, 0, 1, 0, view);
        TF.mat4Perspective(fovY, api.aspect, 1, 120, proj);
        TF.mat4Mul(proj, view, vp);
        st.focus = 22 * (D / F.focal);
      }
    };
    api.layout();
    return api;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
