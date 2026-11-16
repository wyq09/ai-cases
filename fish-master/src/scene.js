/* 捕鱼达人 · Three.js 场景层：水体、炮台、鱼群、渔网、粒子 */
(function () {
  'use strict';
  window.FM = window.FM || {};
  var CFG = window.FM.CONFIG;
  var LOGIC = window.FM.LOGIC;

  var BG_VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  var BG_FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uTime;',
    'uniform vec2 uRes;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }',
    'float noise(vec2 p){',
    '  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y);',
    '}',
    'float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }',
    'void main(){',
    '  vec2 uv = vUv; float t = uTime;',
    '  vec3 deep=vec3(0.006,0.028,0.072), mid=vec3(0.018,0.14,0.24), top=vec3(0.055,0.34,0.40);',
    '  vec3 col = mix(deep, mid, smoothstep(0.0,0.6,uv.y));',
    '  col = mix(col, top, smoothstep(0.52,1.0,uv.y));',
    '  vec2 p = uv * vec2(uRes.x/max(uRes.y,1.0),1.0) * 3.2;',
    '  float c1=fbm(p+vec2(t*0.055,-t*0.028));',
    '  float c2=fbm(p*1.65-vec2(t*0.037,t*0.046));',
    '  float caus=pow(clamp(1.0-abs(c1-c2)*2.3,0.0,1.0),3.0);',
    '  col += vec3(0.16,0.58,0.62)*caus*smoothstep(0.02,0.92,uv.y)*0.34;',
    '  float rays=0.0;',
    '  for(int i=0;i<6;i++){',
    '    float fi=float(i);',
    '    float x=fract(0.08+fi*0.173+sin(t*0.06+fi*1.7)*0.035);',
    '    float w=0.028+0.018*sin(t*0.27+fi*2.1);',
    '    float d=abs(uv.x-x);',
    '    rays += smoothstep(w,0.0,d)*smoothstep(0.0,0.42,uv.y)*(0.55+0.45*sin(t*0.42+fi));',
    '  }',
    '  col += vec3(0.10,0.34,0.39)*rays*0.22;',
    '  vec2 duv=uv*vec2(uRes.x/max(uRes.y,1.0),1.0)*9.0+vec2(0.0,-t*0.55);',
    '  vec2 cell=floor(duv); vec2 lp=fract(duv)-0.5;',
    '  vec2 off=(vec2(hash(cell+vec2(1.7,9.2)),hash(cell+vec2(7.1,3.4)))-0.5)*0.7;',
    '  float dust=smoothstep(0.055,0.0,length(lp-off))*step(0.90,hash(cell));',
    '  col += vec3(0.55,0.92,1.0)*dust*(0.35+0.35*sin(t*2.2+cell.x));',
    '  float vig=smoothstep(1.18,0.28,length(uv-0.5));',
    '  col*=mix(0.5,1.0,vig);',
    '  gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  function radialTexture(THREE, inner, outer, ring) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (ring) {
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.58, 'rgba(255,255,255,0)');
      grad.addColorStop(0.76, 'rgba(255,255,255,' + inner + ')');
      grad.addColorStop(0.9, 'rgba(255,255,255,' + outer + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      grad.addColorStop(0, 'rgba(255,255,255,' + inner + ')');
      grad.addColorStop(0.35, 'rgba(255,255,255,' + outer + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function netTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    g.translate(128, 128);
    g.strokeStyle = 'rgba(130,245,255,0.85)';
    g.lineWidth = 2;
    for (var r = 26; r < 126; r += 22) {
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    }
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
      g.lineTo(Math.cos(a) * 126, Math.sin(a) * 126); g.stroke();
    }
    var grd = g.createRadialGradient(0, 0, 70, 0, 0, 128);
    grd.addColorStop(0, 'rgba(80,220,255,0)');
    grd.addColorStop(1, 'rgba(80,220,255,0.28)');
    g.fillStyle = grd; g.fillRect(-128, -128, 256, 256);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function coinTexture(THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 8, 0, 56);
    grd.addColorStop(0, '#fff3a8'); grd.addColorStop(0.45, '#ffc93f');
    grd.addColorStop(1, '#d9861a');
    g.fillStyle = grd;
    g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a4d0c'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(138,77,12,0.75)'; g.font = 'bold 24px serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', 32, 33);
    var tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }

  function Scene(host) {
    var THREE = window.THREE;
    this.THREE = THREE;
    this.host = host;
    this.time = 0;
    this.fish = [];
    this.nets = [];
    this.parts = [];
    this.trauma = 0;
    this.fishId = 0;
    this.cannonAngle = 0;
    this.aimX = 0; this.aimY = 8;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    host.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.canvas = renderer.domElement;

    // 背景层
    this.bgScene = new THREE.Scene();
    this.bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bgUniforms = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } };
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT, fragmentShader: BG_FRAG,
      uniforms: this.bgUniforms, depthTest: false, depthWrite: false
    });
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat));

    // 主场景
    var scene = new THREE.Scene();
    this.scene = scene;
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 0, 32);
    this.camera = camera;
    this.camBase = new THREE.Vector3(0, 0, 32);

    scene.add(new THREE.AmbientLight(0x8fd6e8, 0.85));
    var sun = new THREE.DirectionalLight(0xdffcff, 1.15);
    sun.position.set(-6, 14, 12); scene.add(sun);
    var fill = new THREE.DirectionalLight(0x2f7fa8, 0.65);
    fill.position.set(9, -8, 6); scene.add(fill);

    this.texGlow = (window.FM.ART && window.FM.ART.glowTexture) ? window.FM.ART.glowTexture() : radialTexture(THREE, 0.95, 0.0, false);
    this.texBubble = radialTexture(THREE, 0.05, 0.55, true);
    this.texNet = netTexture(THREE);
    this.texCoin = coinTexture(THREE);

    this.buildCannon();
    this.buildBubbles();
    this.resize();
  }

  Scene.prototype.buildCannon = function () {
    var THREE = this.THREE;
    var g = new THREE.Group();
    var brass = new THREE.MeshStandardMaterial({ color: 0xe8bb5c, metalness: 0.35, roughness: 0.34, emissive: 0x4a3004, emissiveIntensity: 0.55 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x243b45, metalness: 0.6, roughness: 0.42 });
    var glow = new THREE.MeshStandardMaterial({ color: 0x0d3a40, emissive: 0x27e6d0, emissiveIntensity: 1.7, metalness: 0.2, roughness: 0.35 });

    var base = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.75, 0.9, 28), dark);
    base.position.y = -0.45; g.add(base);
    var collar = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.42, 28), brass);
    collar.position.y = 0.14; g.add(collar);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.16, 12, 32), brass);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.42; g.add(ring);
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 16), glow);
    core.position.y = 0.55; g.add(core);
    this.core = core;

    var barrel = new THREE.Group();
    var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.9, 24), brass);
    tube.position.y = 1.75; barrel.add(tube);
    var muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.48, 0.34, 24), dark);
    muzzle.position.y = 3.22; barrel.add(muzzle);
    var lip = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 10, 24), glow);
    lip.rotation.x = Math.PI / 2; lip.position.y = 3.4; barrel.add(lip);
    g.add(barrel);
    this.barrel = barrel;

    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texGlow, color: 0x49f5dc, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(3.2, 3.2, 1); halo.position.y = 0.6; g.add(halo);
    this.halo = halo;

    var b = this.bounds();
    g.position.set(0, b.bottom + 3.0, 1.5);
    g.scale.setScalar(0.92);
    this.cannon = g;
    this.scene.add(g);
  };

  Scene.prototype.buildBubbles = function () {
    var THREE = this.THREE;
    var N = 130;
    var pos = new Float32Array(N * 3);
    var seed = new Float32Array(N);
    var b = this.bounds();
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (b.right - b.left);
      pos[i * 3 + 1] = Math.random() * (b.top - b.bottom) + b.bottom;
      pos[i * 3 + 2] = -5 + Math.random() * 10;
      seed[i] = Math.random() * 6.28;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      map: this.texBubble, color: 0x9fe8ff, size: 0.5, transparent: true,
      opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.bubbles = new THREE.Points(geo, mat);
    this.bubbleSeed = seed;
    this.scene.add(this.bubbles);
  };

  Scene.prototype.bounds = function () {
    var h = 2 * Math.tan((this.camera.fov * Math.PI / 180) / 2) * this.camera.position.z;
    var w = h * this.camera.aspect;
    return { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2, w: w, h: h };
  };

  Scene.prototype.screenToWorld = function (cx, cy) {
    var THREE = this.THREE;
    var rect = this.canvas.getBoundingClientRect();
    var nx = ((cx - rect.left) / rect.width) * 2 - 1;
    var ny = -((cy - rect.top) / rect.height) * 2 + 1;
    var ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    var pt = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), pt);
    return pt;
  };

  Scene.prototype.setAim = function (x, y) {
    var b = this.bounds();
    this.aimX = Math.max(b.left, Math.min(b.right, x));
    this.aimY = Math.max(b.bottom, Math.min(b.top, y));
    var dx = this.aimX - this.cannon.position.x;
    var dy = this.aimY - this.cannon.position.y;
    this.cannonAngle = Math.atan2(-dx, Math.max(0.2, dy));
  };

  Scene.prototype.muzzlePos = function () {
    var d = this.cannonAngle;
    var dirX = -Math.sin(d), dirY = Math.cos(d);
    return {
      x: this.cannon.position.x + dirX * 3.05 * this.cannon.scale.x,
      y: this.cannon.position.y + dirY * 3.05 * this.cannon.scale.x
    };
  };

  Scene.prototype.spawnFish = function (key, opts) {
    var THREE = this.THREE;
    var spec = CFG.species[key] || CFG.species.clown;
    var ART = window.FM.ART;
    if (!ART) return null;
    var group = ART.createFish(key);
    if (!group) return null;
    opts = opts || {};
    var b = this.bounds();
    var dir = opts.dir || (Math.random() < 0.5 ? 1 : -1);
    var z = opts.z !== undefined ? opts.z : (-5 + Math.random() * 10);
    var y = opts.y !== undefined ? opts.y : (b.bottom + 2.5 + Math.random() * (b.h - 5));
    var x = opts.x !== undefined ? opts.x : (dir > 0 ? b.left - 3 - Math.random() * 4 : b.right + 3 + Math.random() * 4);
    group.position.set(x, y, z);
    group.rotation.y = dir > 0 ? 0 : Math.PI;
    // fish-art 已按 spec.size 设基准缩放，这里只追加景深微调
    group.scale.multiplyScalar(0.92 + (z + 5) / 10 * 0.26);
    this.scene.add(group);
    var f = {
      id: ++this.fishId, key: key, spec: spec, group: group,
      x: x, y: y, z: z, dir: dir, speed: spec.speed * (0.85 + Math.random() * 0.3),
      phase: Math.random() * 6.28, amp: 0.35 + Math.random() * 0.7, alive: true, caught: false
    };
    this.fish.push(f);
    return f;
  };

  Scene.prototype.removeFish = function (f, burst) {
    if (!f || !f.alive) return;
    f.alive = false;
    if (burst) {
      this.coinBurst(f.group.position.x, f.group.position.y, 6 + Math.floor(f.spec.value / 14), f.spec.color);
      this.ring(f.group.position.x, f.group.position.y, f.spec.accent || 0x9fffe0, Math.max(1.6, f.spec.size * 2.2));
    }
    if (window.FM.ART && window.FM.ART.disposeFish) window.FM.ART.disposeFish(f.group);
    this.scene.remove(f.group);
    var i = this.fish.indexOf(f);
    if (i >= 0) this.fish.splice(i, 1);
  };

  Scene.prototype.clearFish = function () {
    var arr = this.fish.slice();
    for (var i = 0; i < arr.length; i++) this.removeFish(arr[i], false);
  };

  Scene.prototype.fireNet = function (power, onCatch) {
    var THREE = this.THREE;
    var m = this.muzzlePos();
    var tx = this.aimX, ty = this.aimY;
    var dx = tx - m.x, dy = ty - m.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var net = {
      x: m.x, y: m.y, sx: m.x, sy: m.y, tx: tx, ty: ty,
      dx: dx / len, dy: dy / len, dist: len, travelled: 0,
      radius: CFG.netRadius[power - 1], power: power, state: 'fly',
      timer: 0, onCatch: onCatch, resolved: false
    };
    var proj = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texGlow, color: 0x7fffe8, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    proj.scale.set(1.1, 1.1, 1); proj.position.set(m.x, m.y, 2);
    this.scene.add(proj);
    net.proj = proj;

    var disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: this.texNet, color: 0x9ff4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    disc.position.set(tx, ty, 1.6); disc.scale.setScalar(0.01); disc.visible = false;
    this.scene.add(disc);
    net.disc = disc;
    this.nets.push(net);
    this.pulse(0.35);
    var A = window.FM.AUDIO;
    if (A && A.play) A.play('shoot', { volume: 0.5 + power * 0.06 });
    return net;
  };

  Scene.prototype.resolveNet = function (net) {
    if (net.resolved) return;
    net.resolved = true;
    var r = net.radius;
    var targets = this.fish.slice();
    for (var i = 0; i < targets.length; i++) {
      var f = targets[i];
      if (!f.alive || f.caught) continue;
      var dx = f.x - net.tx, dy = f.y - net.ty;
      if (dx * dx + dy * dy > r * r) continue;
      var ok = LOGIC ? LOGIC.resolveCatch(net.power, f) : true;
      if (!ok) continue;
      f.caught = true;
      if (net.onCatch) net.onCatch({ key: f.key, spec: f.spec, x: f.x, y: f.y });
      this.removeFish(f, true);
    }
    var A = window.FM.AUDIO;
    if (A && A.play) A.play('catch', { volume: 0.7 });
    this.ring(net.tx, net.ty, 0x7fffe8, r * 1.05);
  };

  Scene.prototype.bomb = function (onCatch) {
    var b = this.bounds();
    var cx = 0, cy = 0, r = CFG.bombRadius;
    var arr = this.fish.slice();
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      if (!f.alive || f.caught) continue;
      var dx = f.x - cx, dy = f.y - cy;
      if (dx * dx + dy * dy <= r * r * 2.2) {
        f.caught = true;
        if (onCatch) onCatch({ key: f.key, spec: f.spec, x: f.x, y: f.y });
        this.removeFish(f, true);
      }
    }
    this.coinBurst(cx, cy, 40, 0xffd23f);
    this.ring(cx, cy, 0xffd23f, r);
    this.ring(cx, cy, 0x7fffe8, r * 1.5);
    this.pulse(1.0);
    var A = window.FM.AUDIO;
    if (A && A.play) A.play('bomb');
  };

  Scene.prototype.ring = function (x, y, color, maxR) {
    var THREE = this.THREE;
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texBubble, color: color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    spr.position.set(x, y, 2.4); spr.scale.set(0.2, 0.2, 1);
    this.scene.add(spr);
    this.parts.push({ spr: spr, kind: 'ring', x: x, y: y, life: 0, max: 0.6, maxR: maxR });
  };

  Scene.prototype.coinBurst = function (x, y, n, color) {
    var THREE = this.THREE;
    n = Math.min(n, 26);
    for (var i = 0; i < n; i++) {
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.texCoin, color: color || 0xffd23f, transparent: true, opacity: 1,
        depthWrite: false
      }));
      var s = 0.42 + Math.random() * 0.3;
      spr.scale.set(s, s, 1); spr.position.set(x, y, 2.6);
      this.scene.add(spr);
      var a = Math.random() * 6.28, sp = 3 + Math.random() * 5;
      this.parts.push({
        spr: spr, kind: 'coin', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2.5,
        life: 0, max: 0.9 + Math.random() * 0.4, spin: Math.random() * 6.28
      });
    }
    var A = window.FM.AUDIO;
    if (A && A.play) A.play('coin', { volume: 0.45 });
  };

  Scene.prototype.spark = function (x, y, color, n) {
    var THREE = this.THREE;
    for (var i = 0; i < Math.min(n, 18); i++) {
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.texGlow, color: color, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      spr.scale.setScalar(0.3 + Math.random() * 0.4);
      spr.position.set(x, y, 2.3);
      this.scene.add(spr);
      var a = Math.random() * 6.28, sp = 2 + Math.random() * 7;
      this.parts.push({ spr: spr, kind: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.45 + Math.random() * 0.35 });
    }
  };

  Scene.prototype.pulse = function (v) { this.trauma = Math.min(1, this.trauma + v); };

  Scene.prototype.update = function (dt) {
    var THREE = this.THREE;
    this.time += dt;
    var t = this.time;
    this.bgUniforms.uTime.value = t;

    // 炮台瞄准平滑
    this.barrel.rotation.z += (this.cannonAngle - this.barrel.rotation.z) * Math.min(1, dt * 14);
    this.core.material.emissiveIntensity = 1.5 + Math.sin(t * 3.4) * 0.45;
    this.halo.material.opacity = 0.42 + Math.sin(t * 2.6) * 0.12;
    this.cannon.position.y = this.bounds().bottom + 3.0 + Math.sin(t * 1.6) * 0.06;

    // 鱼
    var b = this.bounds();
    for (var i = this.fish.length - 1; i >= 0; i--) {
      var f = this.fish[i];
      if (!f.alive) { this.fish.splice(i, 1); continue; }
      f.x += f.dir * f.speed * dt;
      f.y += Math.sin(t * 1.1 + f.phase) * f.amp * dt * 0.55;
      f.group.position.set(f.x, f.y, f.z);
      f.group.rotation.z = Math.sin(t * 1.7 + f.phase) * 0.07;
      if (f.group.userData.animate) f.group.userData.animate(t, f.speed / 2);
      if ((f.dir > 0 && f.x > b.right + 5) || (f.dir < 0 && f.x < b.left - 5)) this.removeFish(f, false);
    }

    // 渔网
    for (var j = this.nets.length - 1; j >= 0; j--) {
      var n = this.nets[j];
      n.timer += dt;
      if (n.state === 'fly') {
        var step = CFG.netTravelSpeed * dt;
        n.travelled += step;
        var p = Math.min(1, n.travelled / n.dist);
        n.x = n.sx + (n.tx - n.sx) * p;
        n.y = n.sy + (n.ty - n.sy) * p;
        n.proj.position.set(n.x, n.y, 2);
        n.proj.material.opacity = 0.65 + 0.35 * Math.sin(t * 22);
        if (p >= 1) {
          n.state = 'open'; n.timer = 0; n.proj.visible = false; n.disc.visible = true;
        }
      } else if (n.state === 'open') {
        var grow = Math.min(1, n.timer / 0.14);
        n.disc.scale.setScalar(n.radius * (0.2 + 0.8 * (1 - Math.pow(1 - grow, 3))));
        n.disc.material.opacity = 0.92;
        n.disc.rotation.z += dt * 0.9;
        if (grow >= 1 && !n.resolved) this.resolveNet(n);
        if (n.timer > CFG.netHoldTime) { n.state = 'close'; n.timer = 0; }
      } else {
        var k = Math.min(1, n.timer / 0.22);
        n.disc.scale.setScalar(n.radius * (1 - 0.4 * k));
        n.disc.material.opacity = 0.9 * (1 - k);
        if (k >= 1) {
          this.scene.remove(n.proj); this.scene.remove(n.disc);
          n.proj.material.dispose(); n.disc.material.dispose(); n.disc.geometry.dispose();
          this.nets.splice(j, 1);
        }
      }
    }

    // 粒子
    for (var q = this.parts.length - 1; q >= 0; q--) {
      var p2 = this.parts[q];
      p2.life += dt;
      var u = p2.life / p2.max;
      if (p2.kind === 'ring') {
        var rr = p2.maxR * (0.2 + 0.8 * (1 - Math.pow(1 - Math.min(1, u), 2)));
        p2.spr.scale.set(rr * 2, rr * 2, 1);
        p2.spr.material.opacity = 0.9 * (1 - u);
      } else if (p2.kind === 'coin') {
        p2.vy -= 9 * dt;
        p2.x += p2.vx * dt; p2.y += p2.vy * dt;
        p2.spin += dt * 10;
        p2.spr.position.set(p2.x, p2.y, 2.6);
        p2.spr.scale.x = Math.max(0.08, Math.abs(Math.cos(p2.spin))) * 0.6;
        p2.spr.material.opacity = 1 - Math.pow(u, 2);
      } else {
        p2.x += p2.vx * dt; p2.y += p2.vy * dt;
        p2.vx *= 0.95; p2.vy *= 0.95;
        p2.spr.position.set(p2.x, p2.y, 2.3);
        p2.spr.material.opacity = 0.95 * (1 - u);
      }
      if (p2.life >= p2.max) {
        this.scene.remove(p2.spr);
        p2.spr.material.dispose();
        this.parts.splice(q, 1);
      }
    }

    // 气泡
    var bp = this.bubbles.geometry.attributes.position.array;
    var bb = this.bounds();
    for (var m = 0; m < this.bubbleSeed.length; m++) {
      bp[m * 3 + 1] += (0.6 + (m % 5) * 0.16) * dt;
      bp[m * 3] += Math.sin(t * 1.2 + this.bubbleSeed[m]) * dt * 0.28;
      if (bp[m * 3 + 1] > bb.top + 1) {
        bp[m * 3 + 1] = bb.bottom - 1;
        bp[m * 3] = (Math.random() - 0.5) * bb.w;
      }
    }
    this.bubbles.geometry.attributes.position.needsUpdate = true;

    // 震屏
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    var sh = this.trauma * this.trauma;
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * sh * 1.1,
      this.camBase.y + (Math.random() - 0.5) * sh * 1.1,
      this.camBase.z
    );
  };

  Scene.prototype.render = function () {
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  };

  Scene.prototype.resize = function () {
    var w = this.host.clientWidth || window.innerWidth;
    var h = this.host.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.bgUniforms.uRes.value.set(w, h);
    if (this.cannon) this.cannon.position.y = this.bounds().bottom + 3.0;
  };

  window.FM.Scene = Scene;
})();
