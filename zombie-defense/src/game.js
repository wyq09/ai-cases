/* ==== game.js ==== 核心逻辑：状态机 / 战斗 / 波次 / 局内技能 / 局外养成 —— 数值与原版 1:1 */
(function(){
'use strict';
const ZD = window.ZD, CFG = ZD.CFG;
const G = ZD.game = {};

/* ---------- 事件 ---------- */
const L = {};
G.on = (n,f)=> (L[n]=L[n]||[]).push(f);
G.emit = function(n){ (L[n]||[]).forEach(f=>{ try{ f(); }catch(e){ console.error(e); } }); };
function sfx(n){ try{ ZD.audio && ZD.audio.play(n); }catch(e){} }

/* ---------- 存档（局外累积） ---------- */
function defaultSave(){ return { coins:0, dia:0, gems:[], up:{atk:0,rate:0,hp:0,coin:0}, paid:{}, vipPts:0 }; }
G.save = (function(){
  try{ const s = JSON.parse(localStorage.getItem(CFG.SAVE_KEY)); if(s && s.up) return Object.assign(defaultSave(), s); }catch(e){}
  return defaultSave();
})();
G.persist = ()=>{ try{ localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(G.save)); }catch(e){} };

let cfg = { muted:false };
try{ const c = JSON.parse(localStorage.getItem(CFG.CFG_KEY)); if(c) cfg = Object.assign(cfg, c); }catch(e){}
G.persistCfg = ()=>{ try{ localStorage.setItem(CFG.CFG_KEY, JSON.stringify(cfg)); }catch(e){} };
G.setMuted = b=>{ cfg.muted=!!b; G.persistCfg(); try{ ZD.audio && ZD.audio.setMuted(cfg.muted); }catch(e){} };
G.muted = ()=> !!cfg.muted;

/* ---------- 宝石 / 局外加成 ---------- */
G.gemBonus = id => G.save.gems.reduce((s,g)=>{
  const t = CFG.GEM_TYPES.find(t=>t.id===g.id);
  return (g.id===id && t) ? s + t.base*CFG.GEM_QUALITY[g.q].m : s;
},0);
G.gemPower = ()=> G.save.gems.reduce((s,g)=>s+g.q,0);
G.vipLv = ()=> Math.floor(G.save.vipPts/CFG.VIP_STEP);
G.metaBonus = function(){
  const up = G.save.up;
  return {
    atk: 1 + up.atk*0.10 + G.gemBonus('atk'),
    rate: 1 + up.rate*0.06 + G.gemBonus('rate'),
    hp: 1 + up.hp*0.10,
    coin: up.coin*0.08 + G.vipLv()*CFG.VIP_COIN + G.gemBonus('coin'),
    exe: G.gemBonus('exe'),
  };
};

/* ---------- 布局 ---------- */
G.W=480; G.H=800; G.wallY=690; G.playerY=730; G.coinTarget={x:190,y:26};
G.resize = function(w,h){
  G.W=w; G.H=h;
  const off = Math.max(CFG.LAYOUT.wallMin, Math.min(CFG.LAYOUT.wallMax, h*CFG.LAYOUT.wallFromBottom));
  G.wallY = Math.round(h - off);
  G.playerY = G.wallY + 38;
  if(player){ player.x = clamp(player.x, 24, w-24); player.targetX = clamp(player.targetX, 24, w-24); }
};
const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));

/* ---------- 运行状态 ---------- */
G.state='menu';           // menu | shop | play | pause | levelup | over
G.shop = { view:'up', chestView:'shop', chestResults:[], paidGain:0 };
G.speed=1; G.frame=0; G.wave=0; G.kills=0; G.runCoins=0; G.runDia=0;
G.xp=0; G.level=1; G.xpNeed=8; G.runSkills={}; G.levelupOptions=[];
let stats=null, player=null, wall=null, laserTarget=null;
let bullets=[], zombies=[], parts=[], drones=[], bolts=[], bossShots=[], floatTexts=[], effects=[], coinsFly=[], spawnQueue=[];
let flashMuzzle=0, barrageTimer=480, chainTimer=240, waveTimer=90, shake=0;
['stats','player','wall','zombies','laserTarget'].forEach(k=>{
  Object.defineProperty(G, k, { get(){ return ({stats,player,wall,zombies,laserTarget})[k]; }, configurable:true });
});
Object.defineProperty(G, 'shakeAmt', { get(){ return shake; }, configurable:true });
const ZCOLOR = { normal:'#6a9a4a', fast:'#b09a3e', tank:'#8a7f6d', boss:'#a83a3a' };

function baseStats(){
  const m = G.metaBonus();
  return { dmg:10*m.atk, rate:2.4*m.rate, multi:1, pierce:0, boom:0, ice:0, drone:0,
           crit:Math.min(0.95, G.gemBonus('critR')), critD:2.5+G.gemBonus('critD'),
           laser:0, burn:0, chain:0, barrage:0, exe:0,
           wall:100*m.hp, exeGem:m.exe };
}
G.baseStats = baseStats;

function reset(){
  stats = baseStats();
  waveTimer = CFG.WAVE_FIRST;
  player = { x:G.W/2, targetX:G.W/2, cd:0, ang:0, recoil:0 };
  wall = { hp:stats.wall, max:stats.wall };
  bullets=[]; zombies=[]; parts=[]; drones=[]; bolts=[]; bossShots=[]; floatTexts=[]; effects=[]; coinsFly=[];
  G.wave=0; spawnQueue=[]; G.kills=0; G.runCoins=0; G.runDia=0;
  G.xp=0; G.level=1; G.xpNeed=8; G.runSkills={}; shake=0;
  barrageTimer=480; chainTimer=240; flashMuzzle=0; laserTarget=null;
  G.lastRun = null;
}
G.reset = reset;

/* ---------- 局内技能 ---------- */
function offerSkills(){
  const owned = Object.keys(G.runSkills).filter(k=>G.runSkills[k]>0);
  let pool = CFG.SKILL_POOL.filter(s => (G.runSkills[s.id]||0) < s.max);
  if(owned.length >= CFG.MAX_DISTINCT) pool = pool.filter(s => G.runSkills[s.id] > 0);
  const picks = [];
  while(picks.length<3 && pool.length){
    const i = Math.floor(Math.random()*pool.length);
    picks.push(pool.splice(i,1)[0]);
  }
  if(picks.length===0){
    G.runCoins += 100;
    floatText(player.x, G.playerY-90, '技能全满级 · +100金币', '#f2c14e');
    return;
  }
  G.levelupOptions = picks;
  G.state='levelup'; G.emit('state');
}
G.pickSkill = function(i){
  const s = G.levelupOptions[i]; if(!s || G.state!=='levelup') return;
  applySkill(s);
};
function applySkill(s){
  G.runSkills[s.id]=(G.runSkills[s.id]||0)+1;
  ring(player.x, G.playerY-30, 90, '#e8a33d', 4, 20);
  floatText(player.x, G.playerY-90, s.name+' Lv.'+G.runSkills[s.id], '#ffc966');
  sfx('lvl');
  switch(s.id){
    case 'dmg': stats.dmg*=1.35; break;
    case 'rate': stats.rate*=1.25; break;
    case 'multi': stats.multi+=1; break;
    case 'pierce': stats.pierce+=1; break;
    case 'boom': stats.boom+=1; break;
    case 'ice': stats.ice+=1; break;
    case 'drone': stats.drone+=1; drones.push({x:player.x,y:G.playerY,cd:0}); break;
    case 'crit': stats.crit=Math.min(0.95, stats.crit+0.12); break;
    case 'wall': wall.max=Math.round(wall.max*1.15); wall.hp=Math.min(wall.max, wall.hp+wall.max*0.3); break;
    case 'laser': stats.laser+=1; break;
    case 'burn': stats.burn+=1; break;
    case 'chain': stats.chain+=1; break;
    case 'barrage': stats.barrage+=1; break;
    case 'exe': stats.exe+=1; break;
  }
  G.state='play'; G.emit('state');
}

/* ---------- 波次 ---------- */
function buildWave(n){
  spawnQueue = [];
  const boss = n % 5 === 0;
  let count = CFG.WAVE_BASE + Math.floor(n*CFG.WAVE_PER);
  if(boss) count = Math.floor(count*0.6);
  for(let i=0;i<count;i++){
    let type = 'normal';
    const r = Math.random();
    if(n>=3 && r<0.22) type='fast';
    else if(n>=4 && r<0.34) type='tank';
    spawnQueue.push({ type, delay: i*(boss?CFG.WAVE_GAP_BOSS:CFG.WAVE_GAP) });
  }
  if(boss) spawnQueue.push({ type:'boss', delay: count*CFG.WAVE_GAP + 40 });
}
function spawn(type){
  const b = CFG.ZTYPES[type];
  const hp = b.hp + G.wave*b.hpw;
  zombies.push({ type, x: 50+Math.random()*(G.W-100), y:-b.h, hurt:0,
    hp, max:hp, spd:b.spd+G.wave*b.spw, w:b.w, h:b.h, dmg:b.dmg, coin:b.coin, dia:b.dia,
    xpv:b.xpv!==undefined?b.xpv:b.xp, slow:0, atkCd:0, burn:0, shotCd:240 });
  if(type==='boss'){ sfx('bossWarn'); shake=Math.max(shake,8); }
}

/* ---------- 射击 ---------- */
function fireBullet(x,y,t,dmgMul,isDrone){
  const crit = Math.random()<stats.crit;
  bullets.push({ x,y, vx:0, vy:isDrone?-13:-16,
    dmg:stats.dmg*dmgMul*(crit?stats.critD:1), crit, pierce:isDrone?0:stats.pierce,
    hitSet:new Set(), drone:!!isDrone, target:t, spd:isDrone?13:16 });
  if(crit) sfx('shootCrit'); else sfx('shoot');
}
function nearestZombie(){
  return zombies.filter(z=>z.hp>0 && z.y>-z.h).sort((a,b)=>b.y-a.y)[0] || null;
}
function shoot(){
  const t = nearestZombie();
  if(!t) return;
  const tipX = player.x + Math.sin(player.ang)*(32-player.recoil);
  const tipY = (G.playerY-18) - Math.cos(player.ang)*(32-player.recoil);
  for(let i=0;i<stats.multi;i++){
    const off = (i-(stats.multi-1)/2);
    fireBullet(tipX + Math.cos(player.ang)*off*8, tipY + Math.sin(player.ang)*off*8, t, 1, false);
  }
  flashMuzzle = 4;
  player.recoil = 7;
  player.cd = 60/stats.rate;
}

/* ---------- 特效 ---------- */
function burst(x,y,color,n){
  n=n||8;
  for(let i=0;i<n;i++) parts.push({ x,y, vx:(Math.random()-0.5)*5, vy:(Math.random()-0.5)*5,
    life:20+Math.random()*15, maxLife:35, color });
}
function boomArea(x,y,r,dmg){
  burst(x,y,'#e86a3a',14);
  effects.push({x,y,r:8,maxR:r,life:13,maxLife:13,color:'#e86a3a',lw:5});
  sfx('explode');
  zombies.forEach(z=>{ const dx=z.x-x, dy=(z.y+z.h/2)-y;
    if(dx*dx+dy*dy < r*r){ z.hp-=dmg; z.hurt=8; } });
}
function ring(x,y,maxR,color,lw,life){
  effects.push({x,y,r:6,maxR,life,maxLife:life,color,lw:lw||3});
}
function floatText(x,y,txt,color){ floatTexts.push({x,y,txt,color,life:40,maxLife:40}); }

/* ---------- 主循环（单步，60fps 基准） ---------- */
G.update = function(){
  G.frame++;
  // 玩家移动 + 炮管转向
  player.x += (player.targetX-player.x)*0.25;
  player.x = clamp(player.x, 24, G.W-24);
  {
    const tgt = nearestZombie();
    let desired = 0;
    if(tgt){
      const dx = tgt.x - player.x, dy = (tgt.y+tgt.h/2) - (G.playerY-10);
      desired = clamp(Math.atan2(dx, -dy), -1.15, 1.15);
    }
    player.ang += (desired - player.ang)*0.22;
  }
  if(player.recoil>0) player.recoil*=0.8;
  if(--player.cd<=0) shoot();
  if(flashMuzzle>0) flashMuzzle--;

  // 无人机
  drones.forEach((d,i)=>{
    d.x += ((player.x + Math.sin(G.frame*0.05+i*2)*70) - d.x)*0.1;
    d.y = G.playerY - 60 + Math.cos(G.frame*0.06+i)*10;
    if(--d.cd<=0){
      const t = nearestZombie();
      if(t){ fireBullet(d.x,d.y,t,0.5,true); d.cd=45; }
    }
  });

  // 波次推进
  if(--waveTimer<=0 && spawnQueue.length===0){
    G.wave++; buildWave(G.wave);
    if(G.wave%5===0) shake=12;
    G.emit('wave');
  }
  spawnQueue.forEach(s=>s.delay--);
  spawnQueue.filter(s=>s.delay<=0).forEach(s=>spawn(s.type));
  spawnQueue = spawnQueue.filter(s=>s.delay>0);
  if(spawnQueue.length===0 && zombies.length===0){
    G.runDia += 2; waveTimer = CFG.WAVE_REST;
    G.wave++; buildWave(G.wave);
    G.emit('wave');
  }

  // 弹幕风暴
  if(stats.barrage>0 && --barrageTimer<=0){
    barrageTimer = 480 - stats.barrage*60;
    for(let i=0;i<14;i++){
      const a = Math.PI + (i/13)*Math.PI;
      bullets.push({ x:player.x, y:G.playerY-24, vx:Math.cos(a)*9, vy:Math.sin(a)*9,
        dmg:stats.dmg*0.6, crit:false, pierce:1, hitSet:new Set(), drone:false });
    }
    floatText(player.x, G.playerY-60, '弹幕风暴!', '#7dd3e0');
    sfx('barrage');
  }
  // 雷电链
  if(stats.chain>0 && --chainTimer<=0){
    chainTimer = 300 - stats.chain*25;
    const alive = zombies.filter(z=>z.hp>0 && z.y>-z.h);
    if(alive.length){
      let cur = alive[Math.floor(Math.random()*alive.length)];
      const chainSet = [cur]; const pts=[{x:cur.x,y:cur.y+cur.h/2}];
      for(let j=0;j<2+stats.chain;j++){
        const next = alive.filter(z=>!chainSet.includes(z))
          .sort((a,b)=>Math.hypot(a.x-cur.x,a.y-cur.y)-Math.hypot(b.x-cur.x,b.y-cur.y))[0];
        if(!next) break;
        chainSet.push(next); pts.push({x:next.x,y:next.y+cur.h/2}); cur=next;
      }
      chainSet.forEach(z=>{ z.hp-=stats.dmg*1.2; z.hurt=8; });
      bolts.push({pts, life:14, maxLife:14});
      sfx('zap');
    }
  }

  // 子弹（飞行中持续锁定转向）
  bullets.forEach(b=>{
    if(b.target && b.target.hp>0 && !b.target.deadTag){
      const tx=b.target.x, ty=b.target.y+b.target.h/2;
      const dx=tx-b.x, dy=ty-b.y, d=Math.hypot(dx,dy)||1;
      b.vx=dx/d*b.spd; b.vy=dy/d*b.spd;
    }
    b.x+=b.vx; b.y+=b.vy;
    zombies.forEach(z=>{
      if(b.hitSet.has(z) || z.hp<=0) return;
      if(b.x>z.x-z.w/2-4 && b.x<z.x+z.w/2+4 && b.y>z.y && b.y<z.y+z.h){
        b.hitSet.add(z);
        z.hp-=b.dmg; z.hurt=8;
        sfx('hitZ');
        burst(b.x,b.y, b.crit?'#f2c14e':'#d9483f', b.crit?6:3);
        if(stats.exe && z.type!=='boss' && Math.random() < 0.02*stats.exe + stats.exeGem){
          z.hp=0; floatText(z.x,z.y,'处决!','#ff5ce1');
        }
        if(stats.boom) boomArea(b.x,b.y, 40+stats.boom*10, stats.dmg*0.4*stats.boom);
        if(stats.ice) z.slow = 120;
        if(stats.burn) z.burn = 180;
        if(b.pierce>0) b.pierce--; else b.dead=true;
      }
    });
  });
  bullets = bullets.filter(b=>!b.dead && b.y>-20 && b.x>-20 && b.x<G.W+20);

  // 制导激光
  if(stats.laser>0){
    const t = nearestZombie();
    laserTarget = t || null;
    if(t){ t.hp -= 0.3*stats.laser; t.hurt = 4; }
  } else laserTarget = null;

  // 僵尸行为
  zombies.forEach(z=>{
    if(z.hp<=0) return;
    const spd = z.spd * (z.slow>0?0.6:1);
    if(z.slow>0) z.slow--;
    if(z.hurt>0) z.hurt--;
    if(z.burn>0){
      z.burn--; z.hp -= 0.08*stats.burn;
      if(G.frame%6===0) parts.push({x:z.x+(Math.random()-0.5)*z.w,y:z.y+z.h*0.5,vx:0,vy:-1.5,life:14,maxLife:14,color:'#e87a3a'});
    }
    if(z.y + z.h < G.wallY + 30){ z.y += spd; }
    else {
      if(--z.atkCd<=0){
        wall.hp -= z.dmg; z.atkCd=50;
        burst(z.x, G.wallY, '#d9483f', 5); shake=Math.max(shake,4); sfx('wallHit');
      }
    }
    if(z.type==='boss' && z.y>60 && --z.shotCd<=0){
      z.shotCd = 200;
      bossShots.push({ x:z.x, y:z.y+z.h, vx:(player.x-z.x)*0.004, vy:4.5 });
    }
  });
  bossShots.forEach(s=>{ s.x+=s.vx; s.y+=s.vy;
    if(s.y>G.wallY+20){ wall.hp-=12; burst(s.x,s.y,'#d9483f',8); shake=Math.max(shake,6); sfx('wallHit'); s.dead=true; } });
  bossShots = bossShots.filter(s=>!s.dead && s.y<G.H+20);

  // 死亡结算
  zombies.forEach(z=>{
    if(z.hp<=0 && !z.deadTag){
      z.deadTag=true; G.kills++;
      G.runCoins+=z.coin; G.runDia+=z.dia; G.xp+=z.xpv;
      burst(z.x,z.y+z.h/2, ZCOLOR[z.type], z.type==='boss'?30:8);
      const nCoins = z.type==='boss'?12:(z.type==='tank'?5:3);
      for(let i=0;i<nCoins;i++)
        coinsFly.push({x:z.x,y:z.y+z.h/2, vx:(Math.random()-0.5)*7, vy:-Math.random()*5-2});
      if(z.type==='boss'){
        ring(z.x,z.y+z.h/2,120,'#f2c14e',6,26);
        wall.hp=Math.min(wall.max, wall.hp+20); shake=14;
        floatText(z.x,z.y,'BOSS击破 +20钻','#f2c14e');
        sfx('dieBoss');
      } else sfx('dieZ');
    }
  });
  zombies = zombies.filter(z=>!z.deadTag);

  // 粒子 / 金币飞行 / 特效衰减
  parts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--; });
  parts = parts.filter(p=>p.life>0);
  const tx=G.coinTarget.x, ty=G.coinTarget.y;
  coinsFly.forEach(c=>{
    c.vx += (tx-c.x)*0.0016; c.vy += (ty-c.y)*0.0016;
    c.vx*=0.93; c.vy*=0.93;
    const sp=Math.hypot(c.vx,c.vy), max=15;
    if(sp>max){ c.vx*=max/sp; c.vy*=max/sp; }
    c.x+=c.vx; c.y+=c.vy;
    if(Math.hypot(tx-c.x,ty-c.y)<22){ c.got=true; G.runCoins++; sfx('coinIn'); }
  });
  coinsFly = coinsFly.filter(c=>!c.got);
  effects.forEach(e=>{ e.life--; e.r += (e.maxR-e.r)*0.25; });
  effects = effects.filter(e=>e.life>0);
  bolts.forEach(b=>b.life--); bolts = bolts.filter(b=>b.life>0);
  floatTexts.forEach(f=>{f.y-=0.6;f.life--;}); floatTexts = floatTexts.filter(f=>f.life>0);
  if(shake>0) shake-=0.5;

  if(G.xp>=G.xpNeed){ G.xp-=G.xpNeed; G.level++; G.xpNeed=Math.round(G.xpNeed*1.5); offerSkills(); }
  if(wall.hp<=0 && G.state==='play'){ settleRun(); G.lastRun={wave:G.wave,kills:G.kills}; G.state='over'; sfx('lose'); G.emit('state'); }
};

/* 结算带出（防线失守 & 中途退出共用） */
function settleRun(){
  const m = G.metaBonus();
  G.lastGained = Math.round(G.runCoins*(1+m.coin));
  G.save.coins += G.lastGained;
  G.save.dia += G.runDia;
  G.persist();
}

/* ---------- 场景控制 ---------- */
G.startRun = function(){ reset(); G.state='play'; G.emit('state'); G.emit('wave'); };
G.pause = function(){ if(G.state==='play'){ G.state='pause'; G.emit('state'); } };
G.resume = function(){ if(G.state==='pause'){ G.state='play'; G.emit('state'); } };
G.restart = function(){ reset(); G.state='play'; G.emit('state'); G.emit('wave'); };
G.exitAndSettle = function(){ if(G.state==='play'||G.state==='pause'){ settleRun(); G.lastRun={wave:G.wave,kills:G.kills}; G.toMenu(); } };
G.toMenu = function(){ G.state='menu'; G.emit('state'); };
G.openShop = function(view){ G.shop.view=view||'up'; G.shop.chestView='shop'; G.state='shop'; G.emit('state'); };
G.setSpeed = n=>{ G.speed = (n===1||n===2||n===3)?n:1; G.emit('speed'); };
G.cycleSpeed = function(){ G.setSpeed(G.speed===1?2:(G.speed===2?3:1)); G.emit('speed'); };

/* ---------- 局外动作 ---------- */
G.buyUpgrade = function(id){
  const u = CFG.UPGRADES.find(u=>u.id===id); if(!u) return false;
  const lv = G.save.up[id], cost = CFG.upCost(u,lv);
  if(lv>=CFG.UP_MAX_LV || G.save.coins<cost) return false;
  G.save.coins-=cost; G.save.up[id]++; G.persist(); sfx('buy');
  return true;
};
G.buyChest = function(n){
  const c = n===3?CFG.CHEST.triple:CFG.CHEST.single;
  if(G.save.dia<c.cost) return false;
  G.save.dia-=c.cost;
  const results=[];
  for(let k=0;k<c.n;k++){
    const r=Math.random();
    const q = r < c.q2 ? 2 : (r < c.q1 ? 1 : 0);
    const t = CFG.GEM_TYPES[Math.floor(Math.random()*CFG.GEM_TYPES.length)];
    results.push({id:t.id, q});
  }
  G.save.gems.push(...results);
  G.persist();
  G.shop.chestResults = results;
  G.shop.chestView='result';
  sfx(results.some(r=>r.q===2)?'gachaRare':'gacha');
  return true;
};
G.pay = function(tierId){
  const t = CFG.PAY_TIERS.find(t=>t.id===tierId); if(!t) return 0;
  const doubled = !G.save.paid[t.id];
  let gain = t.d;
  if(doubled){ gain*=2; G.save.paid[t.id]=1; }
  G.save.dia += gain; G.save.vipPts += t.d/10;
  G.persist();
  G.shop.paidGain = gain;
  G.shop.view = 'paid';
  sfx('cash');
  return gain;
};
G.resetSave = function(){
  G.save = defaultSave(); G.persist();
};

/* ---------- 渲染（ART 优先，缺模块时极简兜底） ---------- */
const FALL = {
  bg(w,h){ const c=document.createElement('canvas'); c.width=w;c.height=h;
    const b=c.getContext('2d'); const g=b.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#05080d'); g.addColorStop(1,'#1a2230'); b.fillStyle=g; b.fillRect(0,0,w,h); return c; },
  vignette(w,h){ const c=document.createElement('canvas'); c.width=w;c.height=h; return c; },
  wall(ctx,W,wallY){ ctx.fillStyle='#4a3f2a'; ctx.fillRect(0,wallY+30,W,16); },
  zombie(ctx,z){ ctx.fillStyle='#6a9a4a'; ctx.fillRect(z.x-z.w/2,z.y,z.w,z.h); },
  player(ctx,px,py){ ctx.fillStyle='#6fa8e8'; ctx.fillRect(px-10,py-30,20,30); },
  drone(){}, bullet(ctx,b){ ctx.fillStyle='#ffb347'; ctx.fillRect(b.x-2,b.y-2,4,4); },
  bossShot(ctx,s){ ctx.fillStyle='#ff7b6b'; ctx.fillRect(s.x-3,s.y-3,6,6); },
  laser(){}, ring(ctx,e){ ctx.strokeStyle=e.color; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,7); ctx.stroke(); },
  bolt(ctx,b){ ctx.strokeStyle='#ffe95c'; ctx.beginPath(); b.pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke(); },
  part(ctx,p){ ctx.fillStyle=p.color; ctx.globalAlpha=Math.min(1,p.life/35); ctx.fillRect(p.x-2,p.y-2,4,4); ctx.globalAlpha=1; },
  coin(ctx,c){ ctx.fillStyle='#f2c14e'; ctx.beginPath(); ctx.arc(c.x,c.y,4,0,7); ctx.fill(); },
  floatText(ctx,f){ ctx.fillStyle=f.color; ctx.font='bold 15px sans-serif'; ctx.textAlign='center'; ctx.fillText(f.txt,f.x,f.y); ctx.textAlign='left'; },
  muzzle(){},
};
const A = ()=> (window.ZD.ART && window.ZD.ART.zombie) ? window.ZD.ART : FALL;
let bgCache=null, vigCache=null, bgKey='';
G.render = function(ctx){
  const art = A();
  const key = G.W+'x'+G.H;
  if(bgKey!==key){ bgCache = art.bg(G.W,G.H); vigCache = art.vignette(G.W,G.H); bgKey=key; }
  ctx.save();
  if(shake>0) ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);
  ctx.drawImage(bgCache,0,0);
  art.wall(ctx, G.W, G.wallY, G.frame, wall ? Math.max(0,wall.hp/wall.max) : 1);
  zombies.forEach(z=>art.zombie(ctx,z,G.frame));
  drones.forEach(d=>art.drone(ctx,d.x,d.y,G.frame));
  if(laserTarget && stats.laser>0)
    art.laser(ctx, player.x, G.playerY-22, laserTarget.x, laserTarget.y+laserTarget.h/2, stats.laser, G.frame);
  bolts.forEach(bo=>art.bolt(ctx,bo));
  bossShots.forEach(s=>art.bossShot(ctx,s));
  bullets.forEach(b=>art.bullet(ctx,b));
  effects.forEach(e=>art.ring(ctx,e));
  coinsFly.forEach(c=>art.coin(ctx,c));
  parts.forEach(p=>art.part(ctx,p));
  floatTexts.forEach(f=>art.floatText(ctx,f));
  art.player(ctx, player.x, G.playerY, player.ang, player.recoil, flashMuzzle, G.frame);
  if(flashMuzzle>0){
    const mx = player.x + Math.sin(player.ang)*(34-player.recoil);
    const my = (G.playerY-18) - Math.cos(player.ang)*(34-player.recoil);
    art.muzzle(ctx,mx,my,flashMuzzle);
  }
  ctx.drawImage(vigCache,0,0);
  ctx.restore();
};

/* ---------- 测试钩子 ---------- */
reset();                 // 原版同款：启动即建局，菜单背后是活的哨站场景
window.__zd = {
  get state(){ return G.state; }, set state(v){ G.state=v; G.emit('state'); },
  save: G.save, get stats(){ return stats; }, get wall(){ return wall; },
  get zombies(){ return zombies; }, get wave(){ return G.wave; }, get kills(){ return G.kills; },
  get runCoins(){ return G.runCoins; }, get runDia(){ return G.runDia; },
  get level(){ return G.level; }, get runSkills(){ return G.runSkills; },
  errs: (window.__errs = window.__errs||[]),
  startRun: ()=>G.startRun(), pause: ()=>G.pause(), resume: ()=>G.resume(),
  restart: ()=>G.restart(), setSpeed: n=>G.setSpeed(n),
  toMenu: ()=>G.toMenu(), openShop: v=>G.openShop(v),
  buyUpgrade: id=>G.buyUpgrade(id), buyChest: n=>G.buyChest(n), pay: id=>G.pay(id),
  pickSkill: i=>G.pickSkill(i),
  setCur(c,d){ G.save.coins=c; if(d!==undefined) G.save.dia=d; G.persist(); G.emit('cur'); },
  giveXp(n){ G.xp += n||G.xpNeed; },
  setWallHp(v){ if(wall) wall.hp=v; },
  setMuted: b=>G.setMuted(b),
  fire: n=>G.emit(n),
};
})();
