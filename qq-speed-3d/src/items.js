import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Item catalogue. `weight` is the neutral draw weight; placement shifts the odds
// so back markers get catch-up tools and the leader gets defensive ones.
export const ITEMS = {
  boost: {
    id: 'boost', name: '氮气引擎', en: 'TURBO', short: 'TURBO',
    color: '#ffb02e', glow: 0xffb02e, weight: 22,
    desc: '立即爆发加速 1.6 秒',
  },
  missile: {
    id: 'missile', name: '追踪导弹', en: 'HOMING MISSILE', short: 'MISSILE',
    color: '#ff5a4a', glow: 0xff5a4a, weight: 20,
    desc: '锁定前方最近的对手',
  },
  mine: {
    id: 'mine', name: '燃油地雷', en: 'OIL MINE', short: 'MINE',
    color: '#ffd23f', glow: 0xffb02e, weight: 20,
    desc: '在身后布雷，命中对手打滑',
  },
  shield: {
    id: 'shield', name: '能量护盾', en: 'ENERGY SHIELD', short: 'SHIELD',
    color: '#4fe8ff', glow: 0x4fe8ff, weight: 20,
    desc: '8 秒内抵挡一次攻击',
  },
  shock: {
    id: 'shock', name: '电磁风暴', en: 'EMP STORM', short: 'EMP',
    color: '#b06bff', glow: 0xb06bff, weight: 18,
    desc: '干扰全部对手，打乱节奏',
  },
};

export const ITEM_IDS = Object.keys(ITEMS);

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class ItemSystem {
  constructor({ scene, textures, player, ais, track, addPool, dustPool, audio, hud, fx }) {
    this.scene = scene;
    this.textures = textures;
    this.player = player;
    this.ais = ais;
    this.track = track;
    this.addPool = addPool;
    this.dustPool = dustPool;
    this.audio = audio;
    this.hud = hud;
    this.fx = fx || {};
    this.held = null;
    this.mines = [];
    this.missiles = [];
    this.stats = { picked: 0, used: 0, hits: 0, gotHit: 0 };
    this.aiMineTimers = ais.map(() => 7 + Math.random() * 9);
    this.flashTime = 0;
    this.shieldPulse = 0;

    this.buildSharedAssets();
    this.buildShield();
  }

  // ------------------------------------------------------------------ assets
  buildSharedAssets() {
    this.mineGeo = new THREE.CylinderGeometry(0.44, 0.5, 0.68, 12);
    this.mineBandGeo = new THREE.TorusGeometry(0.46, 0.055, 6, 16);
    this.mineMat = new THREE.MeshStandardMaterial({
      color: 0x252b33, roughness: 0.55, metalness: 0.5,
    });
    this.mineBandMat = new THREE.MeshBasicMaterial({ color: 0xffb02e, toneMapped: false });
    this.mineGlowMat = new THREE.SpriteMaterial({
      map: this.textures.glow, color: 0xff8a2a, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });

    this.missileBodyGeo = new THREE.CapsuleGeometry(0.19, 0.9, 4, 8);
    this.missileBodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a3442, roughness: 0.32, metalness: 0.7,
    });
    this.missileTipGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
    this.missileTipMat = new THREE.MeshBasicMaterial({ color: 0xff6a3a, toneMapped: false });
    this.missileGlowMat = new THREE.SpriteMaterial({
      map: this.textures.glow, color: 0xff8a3a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.missileCone = new THREE.ConeGeometry(0.2, 0.5, 8);
    this.missileFinGeo = new THREE.BoxGeometry(0.52, 0.04, 0.26);
    this.missileFinMat = new THREE.MeshStandardMaterial({ color: 0xff5a3a, roughness: 0.5 });
  }

  buildShield() {
    const geo = new THREE.IcosahedronGeometry(1.38, 2);
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: 0x6ff4ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.shieldMesh = new THREE.Mesh(geo, this.shieldMat);
    this.shieldMesh.position.y = 0.72;
    this.shieldMesh.visible = false;
    this.shieldMesh.renderOrder = 5;
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.4, 1),
      new THREE.MeshBasicMaterial({
        color: 0xbffaff, wireframe: true, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })
    );
    this.shieldWire = wire;
    this.shieldMesh.add(wire);
    this.player.kart.group.add(this.shieldMesh);
  }

  // ------------------------------------------------------------------ state
  setTrack(track) {
    this.clearProjectiles();
    this.track = track;
    this.resetTimers();
  }

  resetTimers() {
    this.aiMineTimers = this.ais.map(() => 8 + Math.random() * 10);
  }

  reset(keepStats = false) {
    this.clearProjectiles();
    this.held = null;
    this.player.stun = 0;
    this.player.stunSpin = 0;
    this.player.shieldTime = 0;
    this.shieldMesh.visible = false;
    for (const ai of this.ais) {
      ai.stun = 0;
      ai.stunSpin = 0;
    }
    if (!keepStats) this.stats = { picked: 0, used: 0, hits: 0, gotHit: 0 };
    this.hud.setItem(null);
    this.hud.setShield(0);
  }

  clearProjectiles() {
    for (const mine of this.mines) this.scene.remove(mine.group);
    for (const m of this.missiles) this.scene.remove(m.group);
    this.mines.length = 0;
    this.missiles.length = 0;
  }

  // ------------------------------------------------------------------ draw
  pickWeightedId() {
    const place = this.player.place || 6;
    const weights = {};
    for (const id of ITEM_IDS) weights[id] = ITEMS[id].weight;
    if (place >= 5) {
      weights.boost += 10;
      weights.missile += 8;
      weights.shock += 6;
      weights.mine = Math.max(2, weights.mine - 10);
    } else if (place === 4) {
      weights.boost += 5;
      weights.missile += 4;
      weights.shield += 2;
    } else if (place === 1) {
      weights.mine += 10;
      weights.shield += 8;
      weights.missile = Math.max(3, weights.missile - 8);
      weights.shock = Math.max(3, weights.shock - 5);
    } else if (place === 2) {
      weights.mine += 6;
      weights.shield += 6;
      weights.missile = Math.max(4, weights.missile - 4);
    }
    let total = 0;
    for (const id of ITEM_IDS) total += weights[id];
    let roll = Math.random() * total;
    for (const id of ITEM_IDS) {
      roll -= weights[id];
      if (roll <= 0) return id;
    }
    return 'boost';
  }

  pickup() {
    if (this.held) return null;
    const id = this.pickWeightedId();
    const item = ITEMS[id];
    this.held = id;
    this.stats.picked += 1;
    this.audio.itemPickup?.();
    this.hud.setItem(id);
    this.hud.itemToast(item);
    return item;
  }

  give(id) {
    if (!ITEMS[id]) return null;
    this.held = id;
    this.hud.setItem(id);
    return ITEMS[id];
  }

  // ------------------------------------------------------------------ use
  use() {
    if (!this.held) return null;
    const id = this.held;
    this.held = null;
    this.stats.used += 1;
    this.hud.setItem(null);
    const p = this.player;
    this.audio.itemUse?.(id);

    switch (id) {
      case 'boost': {
        p.boostTime = Math.max(p.boostTime, 1.6);
        p.speed += 12;
        p.nitro = Math.min(3, p.nitro + 0.25);
        this.hud.showCallout('氮气引擎', 'ITEM TURBO', 'boost1');
        this.hud.flashBoost('boost');
        this.audio.boost(3);
        this.burstAtKartRear(p, 0xffb02e, 0xff5a14, 30, 1.2);
        break;
      }
      case 'missile': {
        this.fireMissile();
        this.hud.showCallout('追踪导弹', 'MISSILE AWAY', 'missile');
        this.audio.missile?.();
        break;
      }
      case 'mine': {
        this.dropMineFromKart(p.kart.group, 'player', 3.2);
        this.hud.showCallout('燃油地雷', 'MINE DEPLOYED', 'mine');
        this.audio.mineDrop?.();
        break;
      }
      case 'shield': {
        p.shieldTime = 8;
        this.hud.showCallout('能量护盾', 'SHIELD UP', 'shield');
        this.hud.flashBoost('shield');
        this.audio.shield?.();
        this.burstAtKartRear(p, 0x4fe8ff, 0x0a7dff, 26, 1.0);
        break;
      }
      case 'shock': {
        this.shockAll();
        this.hud.showCallout('电磁风暴', 'EMP STORM', 'shock');
        this.hud.flashBoost('shock');
        this.audio.shock?.();
        break;
      }
      default:
        break;
    }
    return id;
  }

  // ------------------------------------------------------------------ attacks
  fireMissile() {
    const p = this.player;
    const alive = this.ais.filter((a) => !a.finished);
    const ahead = alive.filter((a) => a.dist > p.progress + 6).sort((a, b) => a.dist - b.dist);
    // 领跑时也把导弹丢给最近的追兵，避免抽到导弹却完全空放
    const behind = alive.filter((a) => a.dist <= p.progress + 6).sort((a, b) => b.dist - a.dist);
    const target = ahead[0] || behind[0] || null;

    const group = new THREE.Group();
    const body = new THREE.Mesh(this.missileBodyGeo, this.missileBodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);
    const tip = new THREE.Mesh(this.missileTipGeo, this.missileTipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.72;
    group.add(tip);
    for (const [rx, ry] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const fin = new THREE.Mesh(this.missileFinGeo, this.missileFinMat);
      fin.position.z = -0.42;
      fin.rotation.z = rx * Math.PI / 4;
      fin.rotation.y = ry * Math.PI / 4;
      group.add(fin);
    }
    const glow = new THREE.Sprite(this.missileGlowMat);
    glow.scale.set(2.3, 2.3, 1);
    glow.position.z = -0.55;
    group.add(glow);

    p.kart.group.updateMatrixWorld(true);
    group.position.copy(p.kart.group.localToWorld(tmpV.set(0, 0.75, 1.8)));
    const aim = target
      ? target.kart.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(group.position).normalize()
      : tmpV2.set(Math.sin(p.heading), 0.04, Math.cos(p.heading)).normalize().clone();
    group.lookAt(group.position.clone().add(aim));
    this.scene.add(group);
    this.missiles.push({
      group, target, life: 4.2, speed: 62, trail: 0,
      dir: aim.clone(),
    });
    if (target) this.sendMissileToTargetName(target);
    else this.hud.itemToast({ name: '前方没有目标 · 导弹空放', color: '#8fa9c4' });
  }

  sendMissileToTargetName(target) {
    if (!target) return;
    // tiny HUD nudge so the player knows who is being locked
    const idx = this.ais.indexOf(target);
    if (idx >= 0) this.hud.itemToast({ name: '锁定前方对手', color: '#ff5a4a' });
  }

  dropMineFromKart(kart, owner, distance = 3.0) {
    const fwd = tmpV.set(0, 0, -1);
    kart.updateMatrixWorld(true);
    const pos = kart.localToWorld(fwd.clone().multiplyScalar(distance));
    this.spawnMine(pos, owner);
  }

  spawnMine(pos, owner = 'ai') {
    if (this.mines.length >= 14) {
      const old = this.mines.shift();
      this.scene.remove(old.group);
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.mineGeo, this.mineMat);
    body.position.y = 0.34;
    g.add(body);
    const bandA = new THREE.Mesh(this.mineBandGeo, this.mineBandMat);
    bandA.rotation.x = Math.PI / 2;
    bandA.position.y = 0.3;
    g.add(bandA);
    const bandB = bandA.clone();
    bandB.position.y = 0.55;
    g.add(bandB);
    const glow = new THREE.Sprite(this.mineGlowMat);
    glow.position.y = 0.85;
    glow.scale.set(2.2, 2.2, 1);
    g.add(glow);
    const near = this.track.nearest(pos, -1);
    g.position.set(pos.x, near.y + 0.02, pos.z);
    this.scene.add(g);
    this.mines.push({
      group: g, owner, life: 22, armed: 0.45,
      phase: Math.random() * Math.PI * 2,
      baseY: g.position.y,
    });
  }

  shockAll() {
    this.fx.flash?.(0.45);
    for (const ai of this.ais) {
      if (ai.finished) continue;
      this.stunAI(ai, 0.9 + Math.random() * 0.4, true);
      ai.speed *= 0.55;
      const p = ai.kart.group.position;
      this.addPool.burst(p.clone().add(new THREE.Vector3(0, 0.9, 0)), 22, {
        speed: 7, spread: 1.4, up: 0.9, life: 0.55, size: 0.34,
        color: 0xb06bff, colorEnd: 0x34e6ff, gravity: 2, drag: 1.6,
      });
    }
    this.fx.shake?.(0.5);
    this.fx.hitstop?.(0.04);
  }

  stunAI(ai, duration = 1.1, quiet = false) {
    ai.stun = Math.max(ai.stun || 0, duration);
    ai.stunSpin = ai.stunSpin || 0;
    ai.speed *= 0.6;
    if (!quiet) {
      const p = ai.kart.group.position;
      this.addPool.burst(p.clone().add(new THREE.Vector3(0, 0.7, 0)), 26, {
        speed: 8, spread: 1.3, up: 0.8, life: 0.6, size: 0.3,
        color: 0xffd166, colorEnd: 0xff4b1a, gravity: 8, drag: 1.4,
      });
      this.dustPool.spawn({
        pos: p.clone().add(new THREE.Vector3(0, 0.8, 0)),
        vel: new THREE.Vector3(0, 1.6, 0),
        life: 0.9, size: 0.9, sizeEnd: 2.6,
        color: 0x2a2a2a, colorEnd: 0x555555, alpha: 0.32, gravity: -0.4, drag: 0.8,
      });
    }
  }

  hitPlayer(power = 1) {
    const p = this.player;
    if (p.shieldTime > 0) {
      p.shieldTime = 0;
      this.hud.showCallout('护盾抵挡', 'SHIELD BLOCK', 'shield');
      this.audio.shieldBreak?.();
      this.burstAtKartRear(p, 0x6ff4ff, 0xffffff, 34, 1.4);
      this.fx.shake?.(0.4);
      return false;
    }
    if (p.stun > 0) return false;
    p.stun = 1.15;
    p.stunSpin = 0;
    p.speed *= 0.42;
    p.drifting = false;
    p.driftCharge = 0;
    p.driftLevel = 0;
    p.doubleWindow = 0;
    this.stats.gotHit += 1;
    this.hud.showCallout('被击中', 'SPUN OUT', 'hit');
    this.hud.flashBoost('hit');
    this.audio.stun?.();
    this.fx.shake?.(1.0 * power);
    this.fx.hitstop?.(0.05);
    const pos = p.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.addPool.burst(pos, 30, {
      speed: 9, spread: 1.4, up: 0.9, life: 0.65, size: 0.34,
      color: 0xffd166, colorEnd: 0xff4b1a, gravity: 8, drag: 1.4,
    });
    return true;
  }

  shieldBroken() {
    const p = this.player;
    this.burstAtKartRear(p, 0x6ff4ff, 0xffffff, 30, 1.3);
  }

  burstAtKartRear(p, color, colorEnd, count, power) {
    p.kart.group.updateMatrixWorld(true);
    const rear = p.kart.group.localToWorld(tmpV.set(0, 0.5, -1.25));
    this.addPool.burst(rear, count, {
      speed: 7 * power, spread: 1.2, up: 0.7, life: 0.55, size: 0.45 * power,
      color, colorEnd, gravity: 2, drag: 1.8, jitter: 0.4,
    });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const p = this.player;
    if (p.stun > 0) {
      p.stun -= dt;
      p.stunSpin = (p.stunSpin || 0) + dt * 13;
      if (p.stun <= 0) {
        p.stun = 0;
        p.stunSpin = 0;
      }
    }
    if (p.shieldTime > 0) p.shieldTime = Math.max(0, p.shieldTime - dt);
    // shield bubble (also hides immediately if an attack consumed the shield)
    this.shieldMesh.visible = p.shieldTime > 0;
    if (p.shieldTime > 0) {
      this.shieldPulse += dt;
      const k = clamp(p.shieldTime / 8, 0, 1);
      const pulse = 0.08 + 0.07 * Math.sin(this.shieldPulse * 6);
      this.shieldMat.opacity = pulse * (0.5 + k * 0.7);
      this.shieldWire.material.opacity = 0.11 + 0.08 * Math.sin(this.shieldPulse * 4);
      this.shieldMesh.rotation.y += dt * 0.6;
    }
    this.hud.setShield(p.shieldTime > 0 ? p.shieldTime : 0);

    // AI stun timers / smoke
    for (const ai of this.ais) {
      if (ai.stun > 0) {
        ai.stun -= dt;
        ai.stunSpin = (ai.stunSpin || 0) + dt * (8 + (ai.speed || 0) * 0.05);
        if (ai.stun <= 0) {
          ai.stun = 0;
          ai.stunSpin = 0;
        }
      }
      if (ai.stun > 0 && Math.random() < dt * 16) {
        const pos = ai.kart.group.position;
        this.dustPool.spawn({
          pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4, (Math.random() - 0.5) * 1.2)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.2 + Math.random(), (Math.random() - 0.5) * 2),
          life: 0.55, size: 0.5, sizeEnd: 1.6,
          color: 0x9aa4ad, colorEnd: 0x5a646d, alpha: 0.28, gravity: -0.2, drag: 0.9,
        });
      }
    }

    // AI lays mines when the player is closing in from behind
    const raceOn = p.laps >= -1 && !p.finished;
    if (raceOn && this.track) {
      for (let i = 0; i < this.ais.length; i++) {
        const ai = this.ais[i];
        this.aiMineTimers[i] -= dt;
        if (this.aiMineTimers[i] > 0 || ai.finished || ai.stun > 0) continue;
        this.aiMineTimers[i] = 11 + Math.random() * 12;
        const gap = ai.dist - p.progress;
        if (gap > 2 && gap < 70 && Math.random() < 0.6) {
          this.dropMineFromKart(ai.kart.group, 'ai', 2.8);
        }
      }
    }

    // mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      mine.life -= dt;
      mine.armed -= dt;
      mine.group.position.y = mine.baseY + Math.sin(performance.now() * 0.003 + mine.phase) * 0.05;
      mine.group.rotation.y += dt * 1.4;
      let dead = mine.life <= 0;
      if (!dead && mine.armed <= 0) {
        // AI targets
        for (const ai of this.ais) {
          if (ai.finished) continue;
          const ap = ai.kart.group.position;
          const dx = ap.x - mine.group.position.x;
          const dz = ap.z - mine.group.position.z;
          if (dx * dx + dz * dz < 2.4 * 2.4) {
            this.stunAI(ai, 1.25);
            this.audio.explosion?.();
            this.addPool.burst(mine.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 30, {
              speed: 9, spread: 1.4, up: 0.9, life: 0.6, size: 0.36,
              color: 0xffd166, colorEnd: 0xff4b1a, gravity: 8, drag: 1.4,
            });
            this.stats.hits += 1;
            dead = true;
            break;
          }
        }
        if (!dead && mine.owner !== 'player') {
          const dx = p.pos.x - mine.group.position.x;
          const dz = p.pos.z - mine.group.position.z;
          if (dx * dx + dz * dz < 2.0 * 2.0) {
            const hit = this.hitPlayer(1);
            if (hit) this.audio.explosion?.();
            this.addPool.burst(mine.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 26, {
              speed: 8, spread: 1.4, up: 0.9, life: 0.6, size: 0.34,
              color: 0xffd166, colorEnd: 0xff4b1a, gravity: 8, drag: 1.4,
            });
            dead = true;
          }
        }
      }
      if (dead) {
        this.scene.remove(mine.group);
        this.mines.splice(i, 1);
      }
    }

    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      let targetPos = null;
      if (m.target && !m.target.finished) {
        targetPos = m.target.kart.group.position.clone();
        targetPos.y += 0.85;
      }
      if (targetPos) {
        const dir = targetPos.sub(m.group.position);
        const dist = dir.length();
        if (dist < 6) {
          this.fx.shake?.(0.25);
        }
        dir.normalize();
        m.dir.lerp(dir, Math.min(1, dt * 10)).normalize();
        m.group.position.addScaledVector(m.dir, m.speed * dt);
        const near = this.track.nearest(m.group.position, -1);
        if (m.group.position.y < near.y + 0.7) m.group.position.y = near.y + 0.7;
        m.group.lookAt(tmpV.copy(m.group.position).add(m.dir));
        if (m.group.position.distanceTo(m.target.kart.group.position) < 3) {
          this.stunAI(m.target, 1.35);
          this.stats.hits += 1;
          this.audio.explosion?.();
          this.fx.shake?.(0.55);
          this.addPool.burst(m.group.position.clone(), 40, {
            speed: 12, spread: 1.6, up: 1.1, life: 0.7, size: 0.42,
            color: 0xfff0a8, colorEnd: 0xff3b1a, gravity: 8, drag: 1.2,
          });
          m.life = 0;
        }
      } else {
        m.group.position.addScaledVector(m.dir, m.speed * dt);
        m.group.lookAt(tmpV.copy(m.group.position).add(m.dir));
      }
      m.trail += dt;
      if (m.trail > 0.025) {
        m.trail = 0;
        this.addPool.spawn({
          pos: m.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2)),
          vel: m.dir.clone().multiplyScalar(-6).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2)),
          life: 0.36, size: 0.42, sizeEnd: 0.05,
          color: 0xffb02e, colorEnd: 0xff3b1a, gravity: 0, drag: 1.8,
        });
      }
      if (m.life <= 0) {
        {
          this.addPool.burst(m.group.position.clone(), 10, {
            speed: 4, spread: 1, up: 0.6, life: 0.35, size: 0.24,
            color: 0xffb02e, colorEnd: 0x555555, gravity: 3, drag: 2,
          });
        }
        this.scene.remove(m.group);
        this.missiles.splice(i, 1);
      }
    }
  }

  get shieldTime() {
    return this.player.shieldTime || 0;
  }
}
