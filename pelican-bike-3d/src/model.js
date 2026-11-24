/* 鹈鹕骑车 · 主角 —— 程序化建模的自行车 + 鹈鹕宇航员（零外部模型 / 贴图）
 *
 * 车体局部坐标：+X 前、+Y 上、+Z 右（骑手视角）。根节点在"轮心连线中点沿车体 up 轴向下 R"，与物理参考点一致。
 * 动画全部由物理状态驱动：轮子转角 = 路程 / 半径，曲柄按齿比联动，踏板保持水平，
 * 脚用两段 IK 钉在踏板上，翅尖 IK 钉在车把上；喉囊是受 proper 加速度驱动的弹簧（失重时会飘起来）。 */
(function () {
  'use strict';
  window.PM = window.PM || {};
  var PM = window.PM;
  var V3 = function (x, y, z) { return new window.THREE.Vector3(x, y, z); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var UP = V3(0, 1, 0);

  /* ───────── 几何工具 ───────── */
  // 参数曲面 fn(u, v, out[3])；color(u, v, out[3]) 可选。有机曲面一律 DoubleSide，与绕序无关
  function surface(fn, us, vs, color) {
    var pos = [], col = [], idx = [], p = [0, 0, 0], c = [1, 1, 1], cols = vs + 1, i, j;
    for (i = 0; i <= us; i++) for (j = 0; j <= vs; j++) {
      var u = i / us, v = j / vs;
      fn(u, v, p); pos.push(p[0], p[1], p[2]);
      if (color) { color(u, v, c); col.push(c[0], c[1], c[2]); }
    }
    for (i = 0; i < us; i++) for (j = 0; j < vs; j++) {
      var a = i * cols + j, b = a + cols, d = b + 1, e = a + 1;
      idx.push(a, b, d, a, d, e);
    }
    var g = new window.THREE.BufferGeometry();
    g.setAttribute('position', new window.THREE.Float32BufferAttribute(pos, 3));
    if (color) g.setAttribute('color', new window.THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    var n = g.attributes.normal;                              // v 向闭合：接缝两侧法线取平均
    for (i = 0; i <= us; i++) {
      var a0 = (i * cols) * 3, a1 = (i * cols + vs) * 3;
      var nx = n.array[a0] + n.array[a1], ny = n.array[a0 + 1] + n.array[a1 + 1], nz = n.array[a0 + 2] + n.array[a1 + 2], L = Math.hypot(nx, ny, nz) || 1;
      n.array[a0] = n.array[a1] = nx / L; n.array[a0 + 1] = n.array[a1 + 1] = ny / L; n.array[a0 + 2] = n.array[a1 + 2] = nz / L;
    }
    return g;
  }
  function tube(points, segs, radial, r0, r1) {                // 变半径圆管
    var THREE = window.THREE, curve = new THREE.CatmullRomCurve3(points);
    var g = new THREE.TubeGeometry(curve, segs, 1, radial, false), pa = g.attributes.position, v = V3(0, 0, 0), c = V3(0, 0, 0), k = 0;
    for (var i = 0; i <= segs; i++) {
      var r = lerp(r0, r1, i / segs); curve.getPointAt(i / segs, c);
      for (var j = 0; j <= radial; j++, k++) { v.fromBufferAttribute(pa, k).sub(c).multiplyScalar(r).add(c); pa.setXYZ(k, v.x, v.y, v.z); }
    }
    g.computeVertexNormals();
    return g;
  }
  function cyl(a, b, r0, r1, segs) {                           // 从 a 到 b 的（锥形）圆柱
    var THREE = window.THREE, d = b.clone().sub(a);
    var g = new THREE.CylinderGeometry(r1, r0, d.length(), segs || 10, 1, false);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  }
  function box(w, h, d, x, y, z) { var g = new window.THREE.BoxGeometry(w, h, d); g.translate(x || 0, y || 0, z || 0); return g; }
  function merge(list) {                                       // 合并成一整块，减少 draw call
    var THREE = window.THREE, parts = [], n = 0, i;
    for (i = 0; i < list.length; i++) { var g = list[i].index ? list[i].toNonIndexed() : list[i]; parts.push(g); n += g.attributes.position.count; }
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
    for (i = 0; i < parts.length; i++) {
      pos.set(parts[i].attributes.position.array, o); nor.set(parts[i].attributes.normal.array, o);
      o += parts[i].attributes.position.count * 3;
    }
    var g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g2.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g2;
  }
  // 两段 IK：根 a、目标 t、骨长 l1/l2，pole 指定中间关节的朝向 → out = 中间关节
  var _ikD = V3(0, 0, 0), _ikP = V3(0, 0, 0);
  function solveIK(a, t, l1, l2, pole, out) {
    _ikD.copy(t).sub(a);
    var dist = clamp(_ikD.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    _ikD.normalize();
    var cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _ikP.copy(pole).addScaledVector(_ikD, -pole.dot(_ikD));
    if (_ikP.lengthSq() < 1e-6) _ikP.set(0, 0, 1);
    _ikP.normalize();
    return out.copy(a).addScaledVector(_ikD, cosA * l1).addScaledVector(_ikP, sinA * l1);
  }
  var _wa = V3(0, 0, 0), _wb = V3(0, 0, 0);
  function placeSegment(mesh, a, b) {                          // 单位骨段（沿 +Y 0..1）摆到 a→b（输入世界坐标）
    _wa.copy(a); _wb.copy(b);
    mesh.parent.worldToLocal(_wa); mesh.parent.worldToLocal(_wb);
    var d = _wb.sub(_wa), L = d.length();
    mesh.position.copy(_wa); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); mesh.scale.set(1, L, 1);
  }
  function placePoint(obj, worldPos) { var v = worldPos.clone(); obj.parent.worldToLocal(v); obj.position.copy(v); }

  /* ───────── 尺寸（m） ───────── */
  var R = 0.342, WB = 1.05, BB = V3(-0.10, 0.272, 0), HUB_R = V3(-0.525, R, 0), HUB_F = V3(0.525, R, 0);
  var HEAD_B = V3(0.394, 0.580, 0), HEAD_T = V3(0.332, 0.760, 0), AX = HEAD_T.clone().sub(HEAD_B).normalize();   // 转向轴
  var SEAT = V3(-0.265, 0.975, 0);                              // 鹈鹕坐点（鞍座顶）
  var CRANK = 0.17, PEDAL_Z = 0.097, RING_R = 0.099, COG_R = 0.045, PITCH = 0.0127, LINKS = 104;
  var CHAIN = { up: 0.428, ring: Math.PI * RING_R, down: 0.428, cog: Math.PI * COG_R };
  CHAIN.total = CHAIN.up + CHAIN.ring + CHAIN.down + CHAIN.cog;

  /* ═══════════════ 组装 ═══════════════ */
  PM.createRider = function (sunVis, sunDir) {
    var THREE = window.THREE, M = PM.withSunVis, k, s;
    var root = new THREE.Group(); root.rotation.order = 'YZX';
    var frame = new THREE.Group(); root.add(frame);
    var rider = { group: root, frame: frame, disposables: [] };

    /* 材质 */
    var mat = function (m) { rider.disposables.push(m); return M(m, sunVis); };
    var paint = mat(new THREE.MeshPhysicalMaterial({ color: 0xc8402e, roughness: 0.34, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.14 }));
    var chrome = mat(new THREE.MeshStandardMaterial({ color: 0xe2e2e2, metalness: 1, roughness: 0.2 }));
    var steel = mat(new THREE.MeshStandardMaterial({ color: 0xc4c4c4, metalness: 1, roughness: 0.38 }));
    var rubber = mat(new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.92 }));
    var dark = mat(new THREE.MeshStandardMaterial({ color: 0x26262a, roughness: 0.6, metalness: 0.3 }));
    var black = mat(new THREE.MeshStandardMaterial({ color: 0x232328, roughness: 0.82 }));
    var leather = mat(new THREE.MeshPhysicalMaterial({ color: 0x6e4224, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.4, side: THREE.DoubleSide }));
    var brass = mat(new THREE.MeshStandardMaterial({ color: 0xd9aa4c, metalness: 1, roughness: 0.2 }));
    var feather = mat(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, sheen: 0.55, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.75, side: THREE.DoubleSide }));
    var featherPlain = mat(new THREE.MeshPhysicalMaterial({ color: 0xf3f0e9, roughness: 0.85, sheen: 0.55, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.75 }));
    var beakMat = mat(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide }));
    var pouchMat = mat(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color(0xffd0c0), sheenRoughness: 0.5, side: THREE.DoubleSide }));
    var skin = mat(new THREE.MeshStandardMaterial({ color: 0xef9a62, roughness: 0.55 }));
    var skinDark = mat(new THREE.MeshStandardMaterial({ color: 0xd9824c, roughness: 0.6 }));
    var suit = mat(new THREE.MeshStandardMaterial({ color: 0xe6e4de, roughness: 0.62 }));
    var accent = mat(new THREE.MeshStandardMaterial({ color: 0xe2652c, roughness: 0.5 }));
    var eyeMat = mat(new THREE.MeshStandardMaterial({ color: 0x140c08, roughness: 0.12 }));
    var eyePatch = mat(new THREE.MeshStandardMaterial({ color: 0xf3c877, roughness: 0.6 }));
    var lens = mat(new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.15, metalness: 0.2, emissive: 0x000000 }));
    var glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4, depthWrite: false });
    // 头盔的玻璃边：菲涅尔高光 + 一枚太阳 specular 亮点（真空中没有散射，玻璃只在掠射角和反射方向上可见）
    var glassRim = new THREE.ShaderMaterial({
      uniforms: { uSunDir: sunDir || { value: V3(0, 1, 0) }, uSunVis: sunVis || { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vWN;\nvoid main(){ vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( - mv.xyz ); vWN = normalize( ( modelMatrix * vec4( normal, 0.0 ) ).xyz ); gl_Position = projectionMatrix * mv; }',
      fragmentShader: [
        'uniform vec3 uSunDir; uniform float uSunVis; varying vec3 vN; varying vec3 vV; varying vec3 vWN;',
        'void main(){',
        '  vec3 N = normalize( vN ), V = normalize( vV );',
        '  float ndv = abs( dot( N, V ) ), f = pow( 1.0 - ndv, 4.6 );',
        '  vec3 L = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );',
        '  float lit = smoothstep( - 0.2, 0.55, dot( normalize( vWN ), uSunDir ) ) * uSunVis;',
        '  float spec = pow( max( dot( reflect( - L, N ), V ), 0.0 ), 110.0 ) * 1.8 + pow( max( dot( reflect( - L, N ), V ), 0.0 ), 14.0 ) * 0.10;',
        '  vec3 col = vec3( 0.93, 0.96, 1.0 ) * ( f * ( 0.05 + 0.62 * lit ) + spec * 0.8 * lit );',
        '  gl_FragColor = vec4( col, 1.0 );',
        '#include <tonemapping_fragment>',
        '#include <colorspace_fragment>',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var glint = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    var reflector = new THREE.MeshBasicMaterial({ color: 0xff9a2a, toneMapped: false });
    rider.disposables.push(glass, glassRim, glint, reflector);

    function add(geo, m, parent, shadow) {
      var mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = shadow !== false; mesh.receiveShadow = true;
      (parent || frame).add(mesh); return mesh;
    }

    /* ── 车轮 ── */
    function wheel() {
      var g = new THREE.Group();
      add(new THREE.TorusGeometry(R - 0.028, 0.028, 10, 56), rubber, g);
      var rim = add(new THREE.TorusGeometry(0.283, 0.017, 6, 56), chrome, g); rim.scale.z = 0.75;
      var spokes = [];
      for (var i = 0; i < 32; i++) {                           // 交叉编法：左右交替、切向偏置
        var a = i / 32 * Math.PI * 2, side = i % 2 ? 0.034 : -0.034, ta = a + (i % 4 < 2 ? 0.42 : -0.42);
        spokes.push(cyl(V3(Math.cos(a) * 0.026, Math.sin(a) * 0.026, side), V3(Math.cos(ta) * 0.278, Math.sin(ta) * 0.278, side * 0.25), 0.0013, 0.0013, 4));
      }
      add(merge(spokes), steel, g, false);
      var hub = add(new THREE.CylinderGeometry(0.026, 0.026, 0.095, 14), chrome, g); hub.rotation.x = Math.PI / 2;
      var axle = add(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 8), steel, g); axle.rotation.x = Math.PI / 2;
      return g;
    }
    var wheelR = wheel(); wheelR.position.copy(HUB_R); frame.add(wheelR);
    var wheelF = wheel();

    /* ── 车架 ── */
    var tubes = [
      cyl(BB, HEAD_B, 0.019, 0.019, 10),                                                     // 下管
      cyl(V3(-0.222, 0.795, 0), V3(0.338, 0.752, 0), 0.016, 0.016, 10),                       // 上管
      cyl(BB, V3(-0.238, 0.862, 0), 0.017, 0.015, 10)                                        // 座管
    ];
    for (s = -1; s <= 1; s += 2) {
      tubes.push(cyl(V3(-0.222, 0.792, s * 0.014), V3(HUB_R.x, HUB_R.y, s * 0.062), 0.010, 0.007, 8));   // 座撑
      tubes.push(cyl(V3(BB.x, BB.y, s * 0.036), V3(HUB_R.x, HUB_R.y, s * 0.062), 0.012, 0.008, 8));       // 后下叉
    }
    add(merge(tubes), paint);
    var bbShell = add(new THREE.CylinderGeometry(0.027, 0.027, 0.075, 14), paint); bbShell.position.copy(BB); bbShell.rotation.x = Math.PI / 2;
    add(cyl(HEAD_B.clone().addScaledVector(AX, -0.004), HEAD_B.clone().addScaledVector(AX, 0.03), 0.0215, 0.0215, 12), chrome);
    var binder = add(new THREE.CylinderGeometry(0.0185, 0.0185, 0.022, 12), chrome); binder.position.set(-0.236, 0.842, 0); binder.rotation.z = -0.23;
    add(cyl(V3(-0.238, 0.862, 0), V3(-0.262, 0.938, 0), 0.0138, 0.0138, 10), chrome);
    add(surface(function (u, v, p) {                           // 鞍座：后宽前窄的皮座
      var w = 0.078 * Math.pow(1 - u, 0.62) + 0.014, th = 0.017 * Math.sin(Math.PI * Math.pow(1 - u, 0.5)) + 0.004, vv = v * Math.PI * 2;
      p[0] = -0.395 + 0.275 * u; p[1] = 0.966 + 0.004 * Math.sin(u * Math.PI) + th * Math.cos(vv) - 0.012 * u * u; p[2] = w * Math.sin(vv);
    }, 18, 14), leather);
    add(merge([cyl(V3(-0.36, 0.945, 0.02), V3(-0.17, 0.95, 0.012), 0.004, 0.004, 5), cyl(V3(-0.36, 0.945, -0.02), V3(-0.17, 0.95, -0.012), 0.004, 0.004, 5)]), chrome, frame, false);
    var fendR = add(new THREE.TorusGeometry(R + 0.024, 0.03, 6, 40, 0.74 * Math.PI), chrome); fendR.position.copy(HUB_R); fendR.rotation.z = 0.12 * Math.PI; fendR.scale.z = 2.1;
    add(merge([cyl(V3(HUB_R.x, HUB_R.y, 0.064), V3(-0.46, 0.70, 0.02), 0.004, 0.004, 5), cyl(V3(HUB_R.x, HUB_R.y, -0.064), V3(-0.46, 0.70, -0.02), 0.004, 0.004, 5)]), steel, frame, false);

    /* ── 传动 ── */
    function ring(r, teeth, z) {
      var parts = [new THREE.TorusGeometry(r, 0.006, 6, 40)];
      for (var i = 0; i < teeth; i++) { var a = i / teeth * Math.PI * 2; parts.push(box(0.009, 0.007, 0.0035, Math.cos(a) * (r + 0.006), Math.sin(a) * (r + 0.006), 0)); }
      var g = merge(parts); g.translate(0, 0, z); return g;
    }
    var spider = [];
    for (k = 0; k < 5; k++) { var sa = k / 5 * Math.PI * 2; spider.push(box(0.088, 0.013, 0.004, Math.cos(sa) * 0.048, Math.sin(sa) * 0.048, 0.052)); }
    spider.push(ring(RING_R - 0.007, 44, 0.052));
    var chainring = add(merge(spider), steel); chainring.position.copy(BB);
    var crankArmGeo = merge([box(0.185, 0.026, 0.014, 0.082, 0, 0), new THREE.CylinderGeometry(0.022, 0.022, 0.016, 14)]); crankArmGeo.rotateX(Math.PI / 2);
    var crankR = new THREE.Group(), crankL = new THREE.Group(); crankR.position.copy(BB); crankL.position.copy(BB);
    add(crankArmGeo, dark, crankR).position.z = 0.072; add(crankArmGeo, dark, crankL).position.z = -0.072;
    frame.add(crankR, crankL);
    function pedal(side) {                                      // 脚踏：踏板在曲柄外侧，带橙色反光片
      var g = new THREE.Group();
      add(box(0.098, 0.016, 0.072, 0, 0, side * 0.018), dark, g);
      add(box(0.006, 0.010, 0.040, 0.051, 0, side * 0.018), reflector, g, false);
      add(box(0.006, 0.010, 0.040, -0.051, 0, side * 0.018), reflector, g, false);
      var axle = add(new THREE.CylinderGeometry(0.006, 0.006, 0.036, 8), steel, g); axle.rotation.x = Math.PI / 2; axle.position.z = side * -0.012;
      return g;
    }
    var pedalR = pedal(1), pedalL = pedal(-1); pedalR.position.set(CRANK, 0, PEDAL_Z); pedalL.position.set(-CRANK, 0, -PEDAL_Z);
    crankR.add(pedalR); crankL.add(pedalL);
    var cog = add(ring(COG_R - 0.005, 18, 0.046), steel); cog.position.copy(HUB_R);
    // 链条：104 节沿闭环路径排列，逐帧平移
    var chain = new THREE.InstancedMesh(box(PITCH * 0.86, 0.0075, 0.0085), steel, LINKS);
    chain.instanceMatrix.setUsage(THREE.DynamicDrawUsage); chain.castShadow = false; chain.receiveShadow = true; chain.frustumCulled = false;
    frame.add(chain);
    var _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cs = V3(1, 1, 1), _cp = V3(0, 0, 0), _cz = V3(0, 0, 1);
    function updateChain(travel) {
      var L = CHAIN, x, y, ang;
      for (var i = 0; i < LINKS; i++) {
        var ss = (i * L.total / LINKS + travel) % L.total;
        if (ss < L.up) { var t = ss / L.up; x = lerp(HUB_R.x, BB.x, t); y = lerp(HUB_R.y + COG_R, BB.y + RING_R, t); ang = Math.atan2(RING_R - COG_R, BB.x - HUB_R.x); }
        else if (ss < L.up + L.ring) { var a = Math.PI / 2 - (ss - L.up) / RING_R; x = BB.x + Math.cos(a) * RING_R; y = BB.y + Math.sin(a) * RING_R; ang = a - Math.PI / 2; }
        else if (ss < L.up + L.ring + L.down) { var t2 = (ss - L.up - L.ring) / L.down; x = lerp(BB.x, HUB_R.x, t2); y = lerp(BB.y - RING_R, HUB_R.y - COG_R, t2); ang = Math.atan2(COG_R - RING_R, HUB_R.x - BB.x); }
        else { var a2 = -Math.PI / 2 - (ss - L.up - L.ring - L.down) / COG_R; x = HUB_R.x + Math.cos(a2) * COG_R; y = HUB_R.y + Math.sin(a2) * COG_R; ang = a2 + Math.PI / 2; }
        _cp.set(x, y, 0.049); _cq.setFromAxisAngle(_cz, ang); _cm.compose(_cp, _cq, _cs); chain.setMatrixAt(i, _cm);
      }
      chain.instanceMatrix.needsUpdate = true;
    }

    /* ── 转向组件：绕转向轴转动（局部 Y = 转向轴，前轴有 4.6 cm 拖距） ── */
    var steer = new THREE.Group(); steer.position.copy(HEAD_B);
    var toLocalQ = new THREE.Quaternion().setFromUnitVectors(UP, AX);
    steer.quaternion.copy(toLocalQ); frame.add(steer);
    var toLocal = function (v) { return v.clone().sub(HEAD_B).applyQuaternion(new THREE.Quaternion().copy(toLocalQ).invert()); };
    add(cyl(V3(0, -0.004, 0), V3(0, 0.19, 0), 0.021, 0.021, 12), paint, steer);
    add(box(0.05, 0.024, 0.10, 0.012, -0.038, 0), chrome, steer);
    var blades = [];
    for (s = -1; s <= 1; s += 2) blades.push(tube([V3(0.012, -0.05, s * 0.03), V3(0.03, -0.12, s * 0.042), V3(0.045, -0.20, s * 0.05), toLocal(HUB_F).setZ(s * 0.052)], 14, 8, 0.013, 0.009));
    add(merge(blades), paint, steer);
    wheelF.position.copy(toLocal(HUB_F)); steer.add(wheelF);
    var fendF = add(new THREE.TorusGeometry(R + 0.024, 0.03, 6, 32, 0.5 * Math.PI), chrome, steer); fendF.position.copy(wheelF.position); fendF.rotation.z = 0.06 * Math.PI; fendF.scale.z = 2.1;
    add(cyl(V3(0, 0.19, 0), V3(0, 0.30, 0), 0.013, 0.013, 10), chrome, steer);
    add(new THREE.CylinderGeometry(0.017, 0.017, 0.04, 12), chrome, steer).position.set(0, 0.30, 0);
    var barEnd = V3(-0.13, 0.457, 0.267);                      // 握把外端（steer 局部）
    var bars = [], gripL, gripR;
    for (s = -1; s <= 1; s += 2) {
      var pts = [V3(barEnd.x, barEnd.y, s * barEnd.z), V3(-0.122, 0.455, s * 0.20), V3(-0.085, 0.45, s * 0.10), V3(-0.03, 0.40, s * 0.03), V3(0, 0.30, 0)];
      bars.push(tube(pts, 20, 8, 0.0115, 0.0115));
      var gdir = pts[0].clone().sub(pts[1]).normalize();
      add(cyl(pts[0].clone().addScaledVector(gdir, -0.095), pts[0].clone().addScaledVector(gdir, 0.006), 0.0175, 0.0175, 12), rubber, steer);
      add(cyl(V3(-0.085, 0.432, s * 0.232), V3(-0.03, 0.405, s * 0.212), 0.005, 0.004, 6), dark, steer);
      var grip = new THREE.Object3D(); grip.position.copy(pts[0]).addScaledVector(gdir, -0.05); steer.add(grip);
      if (s < 0) gripL = grip; else gripR = grip;
      var tips = [];                                           // 握在车把上的黑色翅尖羽
      for (k = 0; k < 4; k++) tips.push(box(0.085, 0.011, 0.016, -0.012 - k * 0.011, -0.004 - k * 0.004, s * (0.012 + k * 0.004)));
      var hand = add(merge(tips), black, grip); hand.rotation.x = -s * 0.35; hand.rotation.y = -s * 0.25; hand.rotation.z = -0.22;
    }
    add(merge(bars), chrome, steer);
    var bell = new THREE.Group(); bell.position.set(-0.075, 0.468, -0.215); steer.add(bell);      // 车铃：真空里只会动，不会响
    add(new THREE.SphereGeometry(0.028, 18, 10, 0, Math.PI * 2, 0, 1.45), brass, bell);
    add(new THREE.CylinderGeometry(0.029, 0.029, 0.004, 18), brass, bell, false).position.y = 0.003;
    add(new THREE.SphereGeometry(0.005, 8, 6), dark, bell, false).position.y = 0.03;
    add(box(0.03, 0.005, 0.008, 0.022, 0.012, 0), dark, bell, false);
    var lampBody = add(new THREE.SphereGeometry(0.046, 14, 10), chrome, steer); lampBody.position.set(0.035, -0.02, 0); lampBody.scale.set(1.35, 1, 1);
    var lampLens = add(new THREE.CircleGeometry(0.037, 20), lens, steer, false); lampLens.position.set(0.097, -0.02, 0); lampLens.rotation.y = Math.PI / 2;
    var lamp = new THREE.SpotLight(0xfff2dc, 0, 36, 0.46, 0.55, 1.1); lamp.position.set(0.10, -0.02, 0); steer.add(lamp);
    var lampTarget = new THREE.Object3D(); lampTarget.position.set(9, -1.6, 0); steer.add(lampTarget); lamp.target = lampTarget;
    rider.lamp = lamp; rider.lampLens = lens;
    // 车灯照到月面后散射回乘员的微弱补光：夜里车和鹈鹕不至于全黑
    var fill = new THREE.PointLight(0xfff2dc, 0, 4.5, 1.7); fill.position.set(0.25, 1.25, 0); frame.add(fill);

    /* ═════════ 鹈鹕 ═════════ */
    var pelican = new THREE.Group(); pelican.position.copy(SEAT); frame.add(pelican);
    var bodyG = new THREE.Group(); pelican.add(bodyG);
    rider.pelican = pelican; rider.body = bodyG;
    var C = function (hex) { return new THREE.Color(hex); };
    var cTop = C(0xe9e6df), cBelly = C(0xf8f5ec), cWing = C(0xddd9d1), cTip = C(0x24242a);
    function mixc(a, b, t, out) {                                  // a / b 可以是 THREE.Color，也可以是 [r, g, b] 数组（比如 out 自己）
      var ar = a.r === undefined ? a[0] : a.r, ag = a.g === undefined ? a[1] : a.g, ab = a.b === undefined ? a[2] : a.b;
      var br = b.r === undefined ? b[0] : b.r, bg = b.g === undefined ? b[1] : b.g, bb = b.b === undefined ? b[2] : b.b;
      out[0] = lerp(ar, br, t); out[1] = lerp(ag, bg, t); out[2] = lerp(ab, bb, t);
    }
    var bodyA = 0.30, bodyXC = -0.02, bodyRY = 0.235, bodyRZ = 0.195, bodyYC = 0.215;
    add(surface(function (u, v, p) {                            // 蛋形身体：前圆后尖，腹部略压扁坐在鞍座上
      var ct = Math.cos(u * Math.PI), r = Math.sin(u * Math.PI) * (1 + 0.16 * ct), vv = v * Math.PI * 2, cy = Math.cos(vv);
      p[0] = bodyXC + bodyA * ct;
      p[1] = bodyYC + 0.015 * (1 - ct) + bodyRY * r * cy * (cy < 0 ? 0.86 : 1) + 0.006 * Math.sin(u * 31) * r;
      p[2] = bodyRZ * r * Math.sin(vv);
    }, 40, 28, function (u, v, c) { mixc(cBelly, cTop, clamp((Math.cos(v * Math.PI * 2) + 0.5) / 1.2, 0, 1), c); }), feather, bodyG);
    function sm(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
    var cShaft = C(0x5c5c64);
    for (s = -1; s <= 1; s += 2) {
      // 收拢的翅膀贴在体侧。美洲白鹈鹕的次级飞羽是白的，只有初级飞羽是黑的：
      // 所以整片覆羽都是白/浅灰，黑色只做成从白色覆羽后下方探出来的一束细楔形（末端带羽轴线）
      add(surface(function (u, v, p) {
        var t = u * 1.25, tm = Math.min(t, 1), tp = Math.max(t - 1, 0), k = clamp((t - 0.35) / 0.55, 0, 1);
        var yT = 0.375 - 0.10 * tm - 0.06 * tm * tm + 0.03 * tp;
        var H = t < 0.35 ? 0.27 * Math.sqrt(Math.max(0, 1 - Math.pow((0.35 - t) / 0.40, 2)))
          : 0.27 * (0.14 + 0.43 * (1 + Math.cos(Math.PI * k))) * (1 - 0.55 * sm(1.0, 1.25, t));
        var black = sm(0.70, 0.93, t);                                           // 这个位置上，下缘有多少比例是黑羽
        var yB = yT - H + (0.012 * Math.abs(Math.sin(t * 26)) * (1 - black) + 0.003 * Math.abs(Math.sin(t * 150)) * black) * Math.min(1, H / 0.05);
        p[0] = 0.15 - 0.52 * tm - 0.42 * tp;
        p[1] = lerp(yT, yB, v);
        p[2] = s * (0.19 + 0.025 * Math.sin(Math.PI * Math.min(t / 0.85, 1)) + 0.012 * Math.sin(Math.PI * v) - 0.06 * tm * tm);
      }, 50, 10, function (u, v, c) {
        var t = u * 1.25, black = sm(0.70, 0.93, t);
        mixc(cWing, cTop, 0.5 * v, c);                                            // 覆羽：上白下灰
        mixc(c, cBelly, 0.5 * clamp((v - 0.75) / 0.25, 0, 1) * (1 - clamp((t - 0.45) / 0.3, 0, 1)), c);
        mixc(c, cTip, clamp((v - (1 - black)) / 0.10 + 0.5, 0, 1), c);            // 黑色初级飞羽从覆羽后下方探出
        mixc(c, cShaft, 0.55 * black * sm(0.7, 1.0, Math.abs(Math.sin(t * 150))), c);
      }), feather, bodyG);
    }
    var tail = add(new THREE.ConeGeometry(0.085, 0.17, 8), featherPlain, bodyG);              // 尾羽：向后下方压扁的扇形
    tail.position.set(-0.376, 0.208, 0); tail.scale.set(0.3, 1, 1.5); tail.rotation.z = Math.PI / 2 + 0.38;
    var segGeo = function (rt, rb) { var g = new THREE.CylinderGeometry(rt, rb, 1, 12, 1, false); g.translate(0, 0.5, 0); return g; };
    function limb(rt1, rb1, rt2, rb2, m1, m2, jr) {
      return { up: add(segGeo(rt1, rb1), m1, frame), lo: add(segGeo(rt2, rb2), m2, frame), joint: add(new THREE.SphereGeometry(jr, 10, 8), m2, frame) };
    }
    var armR = limb(0.046, 0.06, 0.027, 0.046, featherPlain, featherPlain, 0.045), armL = limb(0.046, 0.06, 0.027, 0.046, featherPlain, featherPlain, 0.045);
    var legR = limb(0.042, 0.06, 0.022, 0.031, featherPlain, skin, 0.032), legL = limb(0.042, 0.06, 0.022, 0.031, featherPlain, skin, 0.032);
    var shoulderL = new THREE.Object3D(), shoulderR = new THREE.Object3D(), hipL = new THREE.Object3D(), hipR = new THREE.Object3D();
    shoulderL.position.set(0.10, 0.34, -0.172); shoulderR.position.set(0.10, 0.34, 0.172);
    hipL.position.set(-0.05, 0.085, -0.105); hipR.position.set(-0.05, 0.085, 0.105);
    bodyG.add(shoulderL, shoulderR, hipL, hipR);
    (function () {                                              // 蹼足：扁蹼 + 三根前趾 + 后趾
      var sh = new THREE.Shape();
      sh.moveTo(-0.034, 0.03); sh.lineTo(0.078, 0.056); sh.lineTo(0.126, 0.034); sh.lineTo(0.142, 0); sh.lineTo(0.126, -0.034); sh.lineTo(0.078, -0.056); sh.lineTo(-0.034, -0.03); sh.closePath();
      var web = new THREE.ExtrudeGeometry(sh, { depth: 0.011, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, steps: 1 });
      web.rotateX(Math.PI / 2);
      var fg = merge([web,
        cyl(V3(-0.02, 0.004, 0), V3(0.13, 0.003, 0), 0.009, 0.005, 6),
        cyl(V3(-0.015, 0.004, 0), V3(0.115, 0.003, -0.05), 0.008, 0.004, 6),
        cyl(V3(-0.015, 0.004, 0), V3(0.115, 0.003, 0.05), 0.008, 0.004, 6),
        cyl(V3(-0.02, 0.002, 0), V3(-0.05, 0.002, 0), 0.009, 0.006, 6)]);
      rider.footL = add(fg, skin, frame); rider.footR = add(fg, skin, frame);
    })();
    // 颈（动态 TubeGeometry）、头
    var NECK_S = 30, NECK_R = 22;
    var neckPts = [V3(0.155, 0.335, 0), V3(0.245, 0.47, 0), V3(0.215, 0.64, 0), V3(0.26, 0.775, 0), V3(0.30, 0.84, 0)];
    var neckGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neckPts), NECK_S, 1, NECK_R, false);
    var neck = add(neckGeo, featherPlain, bodyG);
    neck.receiveShadow = false;                                   // 细圆柱上的阴影贴图只会出自遮挡条纹；处在地形阴影里时由 uSunVis 整体压暗
    var NECK_W = [0, 0.3, 0.58, 0.82, 1], NECK_OFF = [[0, 0], [0.0465, -0.0165], [-0.024, 0.011], [-0.0137, 0.024], [0, 0]], NECK_Z = [0, 0.012, 0.03, 0.05, 0.045];
    var head = new THREE.Group(); bodyG.add(head);
    var skull = add(new THREE.SphereGeometry(1, 22, 16), featherPlain, head); skull.scale.set(0.094, 0.074, 0.068);
    var crest = add(new THREE.ConeGeometry(0.022, 0.05, 7), featherPlain, head); crest.position.set(-0.075, 0.02, 0); crest.rotation.z = 1.1;
    rider.lids = [];
    for (s = -1; s <= 1; s += 2) {
      var patch = add(new THREE.SphereGeometry(0.031, 14, 10), eyePatch, head, false); patch.position.set(0.022, 0.012, s * 0.058); patch.scale.set(1, 1, 0.35);
      var eye = add(new THREE.SphereGeometry(0.0138, 14, 10), eyeMat, head, false); eye.position.set(0.026, 0.013, s * 0.0675);
      add(new THREE.SphereGeometry(0.0042, 6, 6), glint, head, false).position.set(0.033, 0.019, s * 0.0775);
      var lid = add(new THREE.SphereGeometry(0.0148, 12, 8), skinDark, head, false); lid.position.copy(eye.position); lid.scale.set(1, 0.02, 1);
      rider.lids.push(lid);
    }
    var BEAK_X0 = 0.075, BEAK_Y0 = -0.004, BEAK_L = 0.37, POUCH_D = 0.088;
    function mouthY(u) { return BEAK_Y0 - 0.030 * Math.pow(u, 1.7) - 0.010 * u; }
    function beakWidth(u) { return 0.046 * (1 - 0.80 * Math.pow(u, 1.7)) + 0.004; }
    add(surface(function (u, v, p) {                            // 上喙：长而扁，顶有棱，末端带钩
      var w = beakWidth(u), vv = v * Math.PI * 2, cy = Math.cos(vv), hook = u > 0.93 ? 0.022 * Math.pow((u - 0.93) / 0.07, 2) : 0;
      var hT = 0.015 * (1 - 0.45 * u) + 0.0055;
      p[0] = BEAK_X0 + BEAK_L * u - hook * 0.5;
      p[1] = mouthY(u) + (cy >= 0 ? hT * Math.pow(Math.abs(cy), 1.5) : 0.0045 * cy) - hook;
      p[2] = w * Math.sin(vv) * (cy >= 0 ? 1 : 0.92);
    }, 34, 16, function (u, v, c) { mixc(C(0xf5b440), C(0xe2702a), clamp((u - 0.82) / 0.14, 0, 1), c); }), beakMat, head);
    var rami = [];
    for (s = -1; s <= 1; s += 2) rami.push(cyl(V3(BEAK_X0, BEAK_Y0 - 0.008, s * 0.04), V3(BEAK_X0 + BEAK_L, mouthY(1) - 0.004, s * 0.006), 0.0068, 0.005, 7));
    add(merge(rami), skinDark, head);
    var pouchGeo = surface(function (u, v, p) {                 // 喉囊：两条下颌骨之间的皮囊
      var uu = 0.03 + 0.95 * u, ph = v * Math.PI, D = POUCH_D * Math.pow(Math.sin(Math.PI * Math.pow(uu, 0.8)), 0.9);
      p[0] = BEAK_X0 + BEAK_L * uu + 0.012 * Math.sin(ph) * (1 - uu);
      p[1] = mouthY(uu) - D * Math.pow(Math.sin(ph), 0.85) + 0.0005 * Math.sin(uu * 70) * Math.sin(ph);
      p[2] = beakWidth(uu) * 0.98 * Math.cos(ph);
    }, 34, 12, function (u, v, c) { mixc(C(0xf39a74), C(0xf9c3a6), clamp(Math.sin(v * Math.PI) * 0.9, 0, 1), c); });
    (function () {                                              // 记录每个顶点的"口线"高度：下坠量按它缩放
      var pa = pouchGeo.attributes.position, am = new Float32Array(pa.count);
      for (var i = 0; i < pa.count; i++) am[i] = mouthY(clamp((pa.getX(i) - BEAK_X0) / BEAK_L, 0, 1));
      pouchGeo.setAttribute('aMouth', new THREE.BufferAttribute(am, 1));
    })();
    var uSag = { value: 1 }, baseOC = pouchMat.onBeforeCompile;
    pouchMat.onBeforeCompile = function (shader) {
      baseOC(shader); shader.uniforms.uSag = uSag;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMouth; uniform float uSag;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ); transformed.y = aMouth + ( position.y - aMouth ) * uSag;');
    };
    pouchMat.customProgramCacheKey = function () { return 'pouch-sag'; };
    add(pouchGeo, pouchMat, head);
    // 头盔：罩住头和整张嘴；颈环 + 锁扣；生命维持背包 + 天线 + 氧气管
    var helmet = add(new THREE.SphereGeometry(1, 36, 26), glass, head, false); helmet.position.set(0.245, 0.006, 0); helmet.scale.set(0.355, 0.212, 0.194); helmet.renderOrder = 6;
    var helmRim = add(helmet.geometry, glassRim, head, false); helmRim.position.copy(helmet.position); helmRim.scale.copy(helmet.scale).multiplyScalar(1.004); helmRim.renderOrder = 7;
    var neckDir = V3(0.61, 0.79, 0).normalize(), rim = add(new THREE.TorusGeometry(0.072, 0.012, 8, 36), suit, head);
    rim.position.set(-0.082, -0.085, 0); rim.quaternion.setFromUnitVectors(V3(0, 0, 1), neckDir);
    add(box(0.028, 0.028, 0.04, -0.025, -0.129, 0), accent, head);
    var pack = add(new THREE.SphereGeometry(1, 18, 14), suit, bodyG); pack.position.set(-0.215, 0.505, 0); pack.scale.set(0.135, 0.195, 0.08);
    add(box(0.012, 0.26, 0.012, -0.265, 0.51, -0.035), dark, bodyG); add(box(0.012, 0.26, 0.012, -0.265, 0.51, 0.035), dark, bodyG);
    add(box(0.05, 0.03, 0.13, -0.2, 0.655, 0), accent, bodyG);
    add(cyl(V3(-0.27, 0.67, 0.05), V3(-0.3, 0.98, 0.07), 0.004, 0.0025, 5), steel, bodyG);
    add(new THREE.SphereGeometry(0.009, 8, 6), reflector, bodyG, false).position.set(-0.3, 0.985, 0.07);
    add(tube([V3(-0.095, 0.575, -0.082), V3(0.03, 0.625, -0.163), V3(0.16, 0.725, -0.142), V3(0.222, 0.782, -0.092)], 22, 8, 0.0088, 0.0088), dark, bodyG);

    /* ───────── 每帧姿态 ───────── */
    var _a = V3(0, 0, 0), _b = V3(0, 0, 0), _c = V3(0, 0, 0), _e = V3(0, 0, 0), _q = new THREE.Quaternion();
    var headOff = V3(0, 0, 0), headVel = V3(0, 0, 0), sag = 0.85, sagV = 0, lookYaw = 0, lookPitch = 0;
    var blinkT = 2.2, blinkP = -1, bellT = 0, scanT = 0;

    function rebuildNeck() {
      var curve = new THREE.CatmullRomCurve3(neckPts), fr = curve.computeFrenetFrames(NECK_S, false), pa = neckGeo.attributes.position, k = 0;
      for (var i = 0; i <= NECK_S; i++) {
        var u = i / NECK_S, P = curve.getPointAt(u), r = lerp(0.098, 0.06, u);
        for (var j = 0; j <= NECK_R; j++, k++) {
          var a = j / NECK_R * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          pa.setXYZ(k, P.x + r * (ca * fr.normals[i].x + sa * fr.binormals[i].x), P.y + r * (ca * fr.normals[i].y + sa * fr.binormals[i].y), P.z + r * (ca * fr.normals[i].z + sa * fr.binormals[i].z));
        }
      }
      pa.needsUpdate = true; neckGeo.computeVertexNormals();
      var nn = neckGeo.attributes.normal;                       // v 向闭合：接缝两侧法线取平均，否则会有一条纵向亮线
      for (i = 0; i <= NECK_S; i++) {
        var n0 = i * (NECK_R + 1), n1 = n0 + NECK_R, mx = nn.getX(n0) + nn.getX(n1), my = nn.getY(n0) + nn.getY(n1), mz = nn.getZ(n0) + nn.getZ(n1), L = Math.hypot(mx, my, mz) || 1;
        nn.setXYZ(n0, mx / L, my / L, mz / L); nn.setXYZ(n1, mx / L, my / L, mz / L);
      }
      nn.needsUpdate = true;
    }

    // st: 物理快照；ex: { drive, throttle, handsOff 0..1, bell 0..1, aUp, aFore, lookYaw, lookPitch }
    rider.pose = function (dt, st, ex) {
      ex = ex || {};
      dt = Math.min(dt, 0.05);
      root.position.set(st.x, st.y, st.z);
      root.rotation.set(st.lean, st.yaw, st.pitch);
      wheelR.rotation.z = -st.wheelR; wheelF.rotation.z = -st.wheelF;
      crankR.rotation.z = -st.crank; crankL.rotation.z = -st.crank + Math.PI;
      pedalR.rotation.z = st.crank; pedalL.rotation.z = st.crank;         // 脚踏保持水平
      steer.rotation.y = -st.steer;
      chainring.rotation.z = -st.crank;
      updateChain(st.wheelR * COG_R);
      var effort = clamp((ex.drive || 0) / 90, 0, 1);
      bodyG.rotation.x = -Math.sin(st.crank) * 0.03 * effort;             // 蹬踏的反作用力矩让身体左右摇
      bodyG.rotation.z = -(0.02 + 0.07 * effort) + (ex.air ? 0.05 : 0);   // 用力时前倾，腾空时略后仰
      bellT = Math.max(0, bellT - dt * 1.5);
      bell.rotation.y = bellT > 0 ? Math.sin(bellT * 46) * 0.7 * bellT : 0;
      blinkT -= dt;
      if (blinkT < 0 && blinkP < 0) { blinkP = 0; blinkT = 2.2 + Math.random() * 4; }
      if (blinkP >= 0) { blinkP += dt / 0.16; if (blinkP > 1) blinkP = -1; }
      var lid = blinkP < 0 ? 0.02 : (blinkP < 0.5 ? 0.02 + blinkP * 2 * 1.05 : 0.02 + (1 - blinkP) * 2 * 1.05);
      rider.lids[0].scale.y = rider.lids[1].scale.y = Math.max(0.02, lid);
      root.updateMatrixWorld(true);

      // 腿：髋 → 膝 → 踝（踝在脚踏上方）
      for (var side = 0; side < 2; side++) {
        var sg = side ? 1 : -1, hip = side ? hipR : hipL, leg = side ? legR : legL, foot = side ? rider.footR : rider.footL;
        var ang = st.crank + (side ? 0 : Math.PI);
        _a.set(BB.x + Math.cos(ang) * CRANK, BB.y - Math.sin(ang) * CRANK, sg * (PEDAL_Z + 0.018));      // 踏板中心（车架系）
        foot.position.set(_a.x, _a.y + 0.023, _a.z); foot.rotation.set(0, 0, -0.10 + 0.10 * Math.sin(ang));
        _a.y += 0.037; _a.x -= 0.01;
        frame.localToWorld(_a);
        hip.getWorldPosition(_b);
        solveIK(_b, _a, 0.50, 0.50, _c.set(0.9, -0.1, sg * 0.55), _c);
        placeSegment(leg.up, _b, _c); placeSegment(leg.lo, _c, _a); placePoint(leg.joint, _c);
      }
      // 翅臂：肩 → 肘 → 车把；撒把时抬起来拍（真空里拍不出升力，只是拍）
      var hands = clamp(ex.handsOff || 0, 0, 1);
      root.getWorldQuaternion(_q);
      for (side = 0; side < 2; side++) {
        var sg2 = side ? 1 : -1, sh = side ? shoulderR : shoulderL, arm = side ? armR : armL, gr = side ? gripR : gripL;
        gr.getWorldPosition(_a);
        if (hands > 0) {
          _e.set(0, 1, 0).applyQuaternion(_q); _a.addScaledVector(_e, hands * (0.15 + 0.09 * Math.sin(st.time * 9 + side * 1.5)));
          _e.set(0, 0, sg2).applyQuaternion(_q); _a.addScaledVector(_e, hands * 0.11);
          _e.set(1, 0, 0).applyQuaternion(_q); _a.addScaledVector(_e, -hands * 0.05);
        }
        sh.getWorldPosition(_b);
        solveIK(_b, _a, 0.25, 0.25, _c.set(-0.75, -0.45, sg2 * 0.5), _c);
        placeSegment(arm.up, _b, _c); placeSegment(arm.lo, _c, _a); placePoint(arm.joint, _c);
      }

      // 头 / 颈：proper 加速度驱动的弹簧（颠簸时头会滞后，失重时轻轻上浮），外加张望
      var aUp = ex.aUp === undefined ? 1.62 : ex.aUp, aFore = ex.aFore || 0;
      var ty = clamp(-(aUp - 1.62) * 0.010, -0.045, 0.045), tx = clamp(aFore * 0.010, -0.04, 0.04);
      headVel.y += (-90 * (headOff.y - ty) - 9 * headVel.y) * dt; headOff.y = clamp(headOff.y + headVel.y * dt, -0.06, 0.06);
      headVel.x += (-70 * (headOff.x - tx) - 8 * headVel.x) * dt; headOff.x = clamp(headOff.x + headVel.x * dt, -0.05, 0.05);
      scanT += dt;
      var wy = (ex.lookYaw || 0) + 0.10 * Math.sin(scanT * 0.6) + 0.05 * Math.sin(scanT * 1.7);
      lookYaw += (clamp(wy, -0.75, 0.75) - lookYaw) * Math.min(1, dt * 3);
      lookPitch += (clamp((ex.lookPitch || 0) + 0.04 * Math.sin(scanT * 0.9), -0.55, 0.35) - lookPitch) * Math.min(1, dt * 3);
      head.position.set(0.30 + headOff.x, 0.87 + headOff.y + 0.006 * Math.sin(scanT * 1.3), 0);
      head.rotation.set(0, lookYaw, lookPitch);
      _e.set(-0.045, -0.05, 0).applyQuaternion(head.quaternion).add(head.position);         // 颈顶接在头的后下方
      for (var i = 1; i < 4; i++) {
        neckPts[i].set(lerp(0.155, _e.x, NECK_W[i]) + NECK_OFF[i][0], lerp(0.335, _e.y, NECK_W[i]) + NECK_OFF[i][1], Math.sin(lookYaw) * NECK_Z[i]);
      }
      neckPts[4].copy(_e);
      rebuildNeck();
      // 喉囊：正比于它感受到的 proper 加速度。地面 0.85，空中（失重）飘到 0.2
      var sagT = 0.2 + 0.62 * clamp(aUp / 1.62, 0, 2.2);
      sagV += (-50 * (sag - sagT) - 4.5 * sagV) * dt; sag = clamp(sag + sagV * dt, 0.08, 1.7);
      uSag.value = sag;
    };
    rider.bell = function () { bellT = 1; };
    rider.setLamp = function (on) {
      lamp.intensity = on ? 60 : 0; fill.intensity = on ? 2.4 : 0;
      lens.emissive.setHex(on ? 0xfff0d0 : 0x000000); lens.emissiveIntensity = on ? 2.2 : 0;
    };
    rider.dispose = function () { root.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); };
    return rider;
  };
})();
