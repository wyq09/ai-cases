(function () {
  'use strict';
  window.FM = window.FM || {};

  // 深海生物发光 × 高级街机 —— 程序化鱼类模型工厂（零贴图文件）
  // 依赖运行时全局 THREE（r170），鱼头朝 +X，基准体长约 2 世界单位。
  window.FM.ART = (function () {
    var cache = Object.create(null);          // typeKey -> { geos, mats, refs }
    var glowTex = null;                        // 全局唯一辉光贴图
    var BACK = (typeof THREE.BackSide === 'number') ? THREE.BackSide : 1;
    var ADD = (typeof THREE.AdditiveBlending === 'number') ? THREE.AdditiveBlending : 2;

    // CONFIG 未就绪时的兜底（与契约 fish 表一致），保证独立可用。
    var DEFAULTS = {
      clown:  { color: 0xff7a3d, accent: 0xffffff, size: 0.55, pattern: 'stripes' },
      tang:   { color: 0x2f9fe0, accent: 0xffd23f, size: 0.75, pattern: 'solid' },
      gold:   { color: 0xffc23f, accent: 0xff7a3d, size: 0.9,  pattern: 'solid' },
      puffer: { color: 0xf2d06b, accent: 0x7a4a22, size: 1.1,  pattern: 'spots' },
      sword:  { color: 0x63d6c8, accent: 0x1b6e78, size: 1.5,  pattern: 'sword' },
      angler: { color: 0x8f6fd0, accent: 0x8fffe0, size: 1.2,  pattern: 'glow' },
      whale:  { color: 0x4a6fa5, accent: 0x9fd8ff, size: 3.4,  pattern: 'whale' }
    };

    function cfgFor(key) {
      var c = null;
      try {
        var FM = window.FM;
        if (FM && FM.CONFIG && FM.CONFIG.species && FM.CONFIG.species[key]) {
          c = FM.CONFIG.species[key];
        }
      } catch (e) { /* CONFIG 未就绪 */ }
      if (!c) c = DEFAULTS[key] || DEFAULTS.clown;
      return {
        key: key,
        color: c.color != null ? c.color : 0x66bbcc,
        accent: c.accent != null ? c.accent : 0xffffff,
        size: (typeof c.size === 'number' ? c.size : 1),
        pattern: c.pattern || 'solid'
      };
    }

    // ---- 资源工具 ----------------------------------------------------------
    function std(color, o) {
      o = o || {};
      return new THREE.MeshStandardMaterial({
        color: color,
        roughness: o.roughness != null ? o.roughness : 0.5,
        metalness: o.metalness != null ? o.metalness : 0.06,
        emissive: o.emissive != null ? o.emissive : 0x000000,
        emissiveIntensity: o.emissiveIntensity != null ? o.emissiveIntensity : 0.5,
        flatShading: !!o.flatShading,
        transparent: !!o.transparent,
        opacity: o.opacity != null ? o.opacity : 1,
        side: o.side
      });
    }
    function G(ctx, g) { ctx.e.geos.push(g); return g; }
    function M(ctx, m) { ctx.e.mats.push(m); return m; }
    function own(ctx, r) { ctx.owned.push(r); return r; }

    function mesh(parent, geo, mat, pos, scale, rot) {
      var m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (scale) m.scale.set(scale[0], scale[1], scale[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      parent.add(m);
      return m;
    }

    // 低多边形身躯 + 背面壳描边光晕（发光边缘）
    function addBody(ctx, scale, colorMat, accent, smooth) {
      var g = G(ctx, smooth ? new THREE.SphereGeometry(1, 12, 9)
                            : new THREE.IcosahedronGeometry(1, 1));
      mesh(ctx.group, g, colorMat, [0, 0, 0], scale);
      var rim = M(ctx, std(accent, {
        emissive: accent, emissiveIntensity: 0.5, roughness: 0.9,
        flatShading: !smooth, transparent: true, opacity: 0.26, side: BACK
      }));
      mesh(ctx.group, g, rim, [0, 0, 0],
        [scale[0] * 1.07, scale[1] * 1.07, scale[2] * 1.07]);
      return g;
    }

    // 深色眼球 + 白色高光点（两侧各一）
    function addEyes(ctx, x, y, z, r) {
      var dark = M(ctx, std(0x0a1622, {
        roughness: 0.18, metalness: 0.1, emissive: 0x081018, emissiveIntensity: 0.4
      }));
      var hi = M(ctx, std(0xffffff, {
        roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.85
      }));
      var eg = G(ctx, new THREE.SphereGeometry(1, 10, 8));
      var hg = G(ctx, new THREE.SphereGeometry(1, 6, 5));
      for (var s = -1; s <= 1; s += 2) {
        var pivot = new THREE.Group();
        pivot.position.set(x, y, z * s);
        mesh(pivot, eg, dark, [0, 0, 0], [r, r, r]);
        mesh(pivot, hg, hi, [r * 0.3, r * 0.32, s * r * 0.7],
          [r * 0.34, r * 0.34, r * 0.34]);
        ctx.group.add(pivot);
      }
    }

    // 尾鳍（pivot 用于摆尾），fork=true 时分叉成 V 形
    function addTail(ctx, mat, x, r, h, fork) {
      var pivot = new THREE.Group();
      pivot.position.set(x, 0, 0);
      var g = G(ctx, new THREE.ConeGeometry(r, h, 4));
      if (fork) {
        mesh(pivot, g, mat, [-h * 0.34, 0.1, 0], [1, 1, 0.3], [0, 0, Math.PI / 2 - 0.32]);
        mesh(pivot, g, mat, [-h * 0.34, -0.1, 0], [1, 1, 0.3], [0, 0, Math.PI / 2 + 0.32]);
      } else {
        mesh(pivot, g, mat, [-h * 0.5, 0, 0], [1, 1, 0.3], [0, 0, Math.PI / 2]);
      }
      ctx.group.add(pivot);
      return pivot;
    }

    function addDorsal(ctx, mat, x, y, h, tilt) {
      var g = G(ctx, new THREE.ConeGeometry(h * 0.34, h, 3));
      return mesh(ctx.group, g, mat, [x, y + h * 0.42, 0],
        [1, 1, 0.26], [0, 0, tilt || 0]);
    }

    function addPectoral(ctx, mat, x, y, z) {
      var pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      var g = G(ctx, new THREE.ConeGeometry(0.18, 0.5, 3));
      mesh(pivot, g, mat, [-0.2, -0.04, 0], [1, 1, 0.25], [0, 0, Math.PI / 2 + 0.25]);
      ctx.group.add(pivot);
      return pivot;
    }

    // ---- 各 pattern 建模 ---------------------------------------------------
    var builders = {
      // 小丑鱼：橙身 + 2~3 道白色竖纹 + 圆润低多边形
      stripes: function (ctx) {
        var c = ctx.cfg;
        var skin = M(ctx, std(c.color, { roughness: 0.42, metalness: 0.06, flatShading: true }));
        addBody(ctx, [0.95, 0.5, 0.42], skin, c.accent, false);
        var white = M(ctx, std(c.accent, {
          roughness: 0.35, emissive: c.accent, emissiveIntensity: 0.12
        }));
        var band = G(ctx, new THREE.SphereGeometry(1, 14, 9));
        var xs = [-0.42, 0, 0.42];
        for (var i = 0; i < xs.length; i++) {
          mesh(ctx.group, band, white, [xs[i], 0, 0], [0.11, 0.508, 0.428]);
        }
        var fin = M(ctx, std(c.color, { roughness: 0.5, flatShading: true }));
        ctx.refs.tail = addTail(ctx, fin, -0.92, 0.4, 0.72, false);
        addDorsal(ctx, fin, -0.15, 0.46, 0.34, -0.2);
        ctx.refs.fins.push(addPectoral(ctx, fin, 0.35, -0.12, 0.36));
        ctx.refs.fins.push(addPectoral(ctx, fin, 0.35, -0.12, -0.36));
        addEyes(ctx, 0.6, 0.16, 0.34, 0.11);
      },

      // 蓝吊 / 金鱼：干净流线身 + 分叉尾鳍 + 背/臀/胸鳍
      solid: function (ctx) {
        var c = ctx.cfg;
        var skin = M(ctx, std(c.color, { roughness: 0.4, metalness: 0.1, flatShading: true }));
        addBody(ctx, [1.05, 0.46, 0.4], skin, c.accent, false);
        var fin = M(ctx, std(c.accent, {
          roughness: 0.45, emissive: c.accent, emissiveIntensity: 0.12, flatShading: true
        }));
        ctx.refs.tail = addTail(ctx, fin, -1.0, 0.34, 0.78, true);
        addDorsal(ctx, fin, -0.1, 0.42, 0.4, -0.15);
        mesh(ctx.group, G(ctx, new THREE.ConeGeometry(0.14, 0.3, 3)), fin,
          [-0.35, -0.42, 0], [1, 1, 0.3], [0, 0, Math.PI + 0.2]);
        ctx.refs.fins.push(addPectoral(ctx, fin, 0.4, -0.1, 0.34));
        ctx.refs.fins.push(addPectoral(ctx, fin, 0.4, -0.1, -0.34));
        addEyes(ctx, 0.62, 0.14, 0.32, 0.1);
      },

      // 河豚：圆胖身 + 深色斑点 + 一圈小刺
      spots: function (ctx) {
        var c = ctx.cfg;
        var skin = M(ctx, std(c.color, { roughness: 0.55 }));
        addBody(ctx, [0.86, 0.78, 0.68], skin, c.accent, true);
        var spotMat = M(ctx, std(c.accent, { roughness: 0.7 }));
        var spikeMat = M(ctx, std(c.accent, { roughness: 0.5, flatShading: true }));
        var sg = G(ctx, new THREE.SphereGeometry(1, 10, 8));
        var pts = [[-0.4, 0.25], [0, 0.45], [0.38, 0.2], [-0.2, -0.3], [0.3, -0.25]];
        for (var i = 0; i < pts.length; i++) {
          for (var s = -1; s <= 1; s += 2) {
            mesh(ctx.group, sg, spotMat, [pts[i][0], pts[i][1], s * 0.62], [0.13, 0.13, 0.05]);
          }
        }
        var spikeGeo = G(ctx, new THREE.ConeGeometry(0.055, 0.2, 4));
        for (var k = 0; k < 12; k++) {
          var a = (k / 12) * Math.PI * 2;
          mesh(ctx.group, spikeGeo, spikeMat,
            [Math.cos(a) * 0.72, Math.sin(a) * 0.66, 0],
            [1, 1, 1], [0, 0, a - Math.PI / 2]);
        }
        ctx.refs.tail = addTail(ctx, skin, -0.82, 0.24, 0.42, false);
        ctx.refs.fins.push(addPectoral(ctx, spikeMat, 0.3, -0.1, 0.6));
        ctx.refs.fins.push(addPectoral(ctx, spikeMat, 0.3, -0.1, -0.6));
        addEyes(ctx, 0.56, 0.22, 0.5, 0.12);
      },

      // 旗鱼：极长吻 + 高背鳍 + 流线型
      sword: function (ctx) {
        var c = ctx.cfg;
        var skin = M(ctx, std(c.color, { roughness: 0.38, metalness: 0.12, flatShading: true }));
        addBody(ctx, [1.15, 0.34, 0.3], skin, c.accent, false);
        var dark = M(ctx, std(c.accent, { roughness: 0.4, metalness: 0.15, flatShading: true }));
        var bill = G(ctx, new THREE.ConeGeometry(0.075, 0.95, 6));
        mesh(ctx.group, bill, dark, [1.5, -0.02, 0], [1, 1, 0.7], [0, 0, -Math.PI / 2]);
        var sail = G(ctx, new THREE.ConeGeometry(0.42, 0.9, 3));
        mesh(ctx.group, sail, dark, [-0.15, 0.62, 0], [1, 1, 0.12], [0, 0, -0.12]);
        ctx.refs.tail = addTail(ctx, dark, -1.1, 0.32, 0.82, true);
        ctx.refs.fins.push(addPectoral(ctx, dark, 0.45, -0.08, 0.26));
        ctx.refs.fins.push(addPectoral(ctx, dark, 0.45, -0.08, -0.26));
        addEyes(ctx, 0.72, 0.1, 0.24, 0.085);
      },

      // 灯笼鱼：头部青绿发光小球 + 细钓竿，emissive 脉动
      glow: function (ctx) {
        var c = ctx.cfg;
        var skin = M(ctx, std(c.color, { roughness: 0.5, flatShading: true }));
        addBody(ctx, [0.82, 0.6, 0.48], skin, c.accent, false);
        var dark = M(ctx, std(0x1a1030, { roughness: 0.6 }));
        mesh(ctx.group, G(ctx, new THREE.SphereGeometry(1, 10, 8)), dark,
          [0.7, -0.12, 0], [0.16, 0.1, 0.42]);
        var rod = G(ctx, new THREE.CylinderGeometry(0.025, 0.03, 0.9, 5));
        mesh(ctx.group, rod, dark, [0.85, 0.75, 0], [1, 1, 1], [0, 0, -0.6]);
        // 发光球：每条鱼独占材质，独立脉动
        var orbMat = own(ctx, std(c.accent, {
          roughness: 0.2, emissive: c.accent, emissiveIntensity: 1.6
        }));
        var orb = G(ctx, new THREE.SphereGeometry(0.14, 12, 9));
        mesh(ctx.group, orb, orbMat, [1.28, 1.1, 0]);
        var tex = glowTexture();
        if (tex) {
          var sm = own(ctx, new THREE.SpriteMaterial({
            map: tex, color: c.accent, transparent: true,
            blending: ADD, depthWrite: false, opacity: 0.9
          }));
          var sprite = new THREE.Sprite(sm);
          sprite.position.set(1.28, 1.1, 0);
          sprite.scale.set(0.75, 0.75, 1);
          ctx.group.add(sprite);
          ctx.refs.pulses.push({
            mat: orbMat, base: 1.25, amp: 0.9, sprite: sprite, spriteBase: 0.75, f: 2.6
          });
        } else {
          ctx.refs.pulses.push({ mat: orbMat, base: 1.25, amp: 0.9, f: 2.6 });
        }
        ctx.refs.tail = addTail(ctx, skin, -0.78, 0.3, 0.55, false);
        ctx.refs.fins.push(addPectoral(ctx, skin, 0.3, -0.18, 0.42));
        ctx.refs.fins.push(addPectoral(ctx, skin, 0.3, -0.18, -0.42));
        addEyes(ctx, 0.52, 0.2, 0.4, 0.12);
      },

      // 座头鲸：庞大身躯 + 浅色腹部 + 巨大尾叶 + 长胸鳍
      whale: function (ctx) {
        var c = ctx.cfg;
        var skin = M(ctx, std(c.color, { roughness: 0.6, metalness: 0.04, flatShading: true }));
        addBody(ctx, [1.35, 0.56, 0.5], skin, c.accent, false);
        var belly = M(ctx, std(c.accent, { roughness: 0.7, transparent: true, opacity: 0.5 }));
        mesh(ctx.group, G(ctx, new THREE.SphereGeometry(1, 12, 9)), belly,
          [0.1, -0.16, 0], [1.05, 0.36, 0.42]);
        addDorsal(ctx, skin, -0.3, 0.5, 0.22, -0.35);
        var fluke = new THREE.Group();
        fluke.position.set(-1.3, 0, 0);
        var fg = G(ctx, new THREE.ConeGeometry(0.3, 1.0, 4));
        mesh(fluke, fg, skin, [-0.35, 0.32, 0], [1, 1, 0.22], [0, 0, Math.PI / 2 - 0.55]);
        mesh(fluke, fg, skin, [-0.35, -0.32, 0], [1, 1, 0.22], [0, 0, Math.PI / 2 + 0.55]);
        ctx.group.add(fluke);
        ctx.refs.tail = fluke;
        var pg = G(ctx, new THREE.ConeGeometry(0.16, 1.0, 4));
        for (var s = -1; s <= 1; s += 2) {
          var fp = new THREE.Group();
          fp.position.set(0.35, -0.1, s * 0.42);
          mesh(fp, pg, skin, [-0.42, -0.12, s * 0.1], [1, 1, 0.28], [0, 0, Math.PI / 2 + 0.2]);
          ctx.group.add(fp);
          ctx.refs.fins.push(fp);
        }
        addEyes(ctx, 0.92, 0.12, 0.4, 0.085);
      }
    };

    // 组装动画：摆尾 / 鳍扇动 / 发光脉动，每条鱼带独立相位。
    function finalize(ctx) {
      var phase = Math.random() * Math.PI * 2;
      var tailPhase = Math.random() * Math.PI * 2;
      var tail = ctx.refs.tail, fins = ctx.refs.fins, pulses = ctx.refs.pulses;
      ctx.group.userData.animate = function (t, speedFactor) {
        var sf = (typeof speedFactor === 'number' && isFinite(speedFactor)) ? speedFactor : 1;
        var tt = (typeof t === 'number' && isFinite(t)) ? t : 0;
        if (tail) tail.rotation.z = Math.sin(tt * 7 * sf + tailPhase) * 0.34;
        for (var i = 0; i < fins.length; i++) {
          fins[i].rotation.x = Math.sin(tt * 5 * sf + phase + i) * 0.32;
        }
        for (var j = 0; j < pulses.length; j++) {
          var p = pulses[j];
          var w = 0.5 + 0.5 * Math.sin(tt * p.f * sf + phase + j);
          if (p.mat) p.mat.emissiveIntensity = p.base + p.amp * w;
          if (p.sprite) {
            var s = p.spriteBase * (0.85 + 0.35 * w);
            p.sprite.scale.set(s, s, 1);
          }
        }
      };
    }

    function createFish(typeKey) {
      var cfg = cfgFor(typeKey);
      var key = cfg.key;
      var entry = cache[key] || (cache[key] = { geos: [], mats: [], refs: 0 });
      var group = new THREE.Group();
      var ctx = {
        group: group, cfg: cfg, e: entry, owned: [],
        refs: { tail: null, fins: [], pulses: [] }, key: key
      };
      var build = builders[cfg.pattern] || builders.solid;
      build(ctx);
      finalize(ctx);
      group.scale.set(cfg.size, cfg.size, cfg.size);
      group.userData.fishType = key;
      group.userData.__fmKey = key;
      group.userData.__fmOwned = ctx.owned;
      entry.refs++;
      return group;
    }

    function safeDispose(r) {
      if (r && typeof r.dispose === 'function') r.dispose();
    }

    function disposeFish(group) {
      if (!group || !group.userData) return;
      var owned = group.userData.__fmOwned;
      if (owned) {
        for (var i = 0; i < owned.length; i++) safeDispose(owned[i]);
        group.userData.__fmOwned = null;
      }
      var key = group.userData.__fmKey;
      if (key && cache[key]) {
        cache[key].refs--;
        if (cache[key].refs <= 0) {
          var e = cache[key];
          for (var g = 0; g < e.geos.length; g++) safeDispose(e.geos[g]);
          for (var m = 0; m < e.mats.length; m++) safeDispose(e.mats[m]);
          delete cache[key];
        }
      }
      group.userData.animate = null;
      if (group.parent && typeof group.parent.remove === 'function') group.parent.remove(group);
    }

    // 径向渐变白色辉光，供炮口 / 灯笼鱼 / 金币复用（缓存唯一实例）。
    function glowTexture() {
      if (glowTex) return glowTex;
      if (typeof document === 'undefined' || !document.createElement) return null;
      var size = 128;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var c = canvas.getContext('2d');
      if (!c) return null;
      var grd = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      grd.addColorStop(0.55, 'rgba(200,240,255,0.28)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grd;
      c.fillRect(0, 0, size, size);
      var tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace && tex.colorSpace !== undefined) {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      glowTex = tex;
      return tex;
    }

    return {
      createFish: createFish,
      disposeFish: disposeFish,
      glowTexture: glowTexture
    };
  })();
})();
