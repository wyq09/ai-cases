(function () {
  'use strict';
  const JJ = window.JJ, L = JJ.LOGIC, Q = new URLSearchParams(location.search);
  const CFG_KEY = 'jj_config_v1', SAVE_KEY = 'jj_state_v1';
  if (Q.get('reset') === '1') { try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(SAVE_KEY); } catch (_) {} }
  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  let cfg = L.sanitize(load(CFG_KEY, L.defaultCfg()));
  const saved = load(SAVE_KEY, {});
  let best = Number.isFinite(saved.best) ? Math.max(0, saved.best) : 0;
  let history = Array.isArray(saved.history) ? saved.history.filter(Number.isFinite).slice(0, 10) : [];
  let resumeData = saved.run;
  Object.defineProperty(JJ, 'cfg', { get: () => cfg });
  const $ = id => document.getElementById(id), canvas = $('game'), ctx = canvas.getContext('2d');
  const audio = new Proxy({}, { get: (_, k) => (...args) => JJ.AUDIO?.[k]?.(...args) });
  let vw, vh, dpr, scale, ox, oy, texture = null, pointer = null;
  let paused = false, pauseAt = 0, auto = false, lastFrame = 0;
  const S = { mode: 'menu', cur: 0, score: 0, combo: 0, seed: 0, platforms: [], pawn: {}, cam: {x:0,y:0}, charge: 0, chargeT0: 0, fly: null, stayT0: 0, stayDone: false, deadT0: 0, landedAt: 0, fx: [], rings: [] };
  function resize() {
    vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    scale = Math.min(vw / 430, vh / 730, 1.5);
  }
  resize(); addEventListener('resize', resize);
  function project(x, y, z = 0) { return {x: (x-y)*.86, y: -(x+y)*.5-z}; }
  function store(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { toast('存储空间不足，本次设置未保存'); return false; } }
  function stableRun() {
    if (auto || !['idle','charge','air'].includes(S.mode)) return null;
    return { seed:S.seed, cur:S.cur, score:S.score, combo:S.combo, pawn: S.fly ? S.fly.from : {x:S.pawn.x,y:S.pawn.y}, stayDone:S.stayDone, difficulty:S.runDifficulty };
  }
  function save(run = stableRun()) { store(SAVE_KEY, {v:1,best,history,run}); }
  function toast(text) { $('toast').textContent=text; $('toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').classList.remove('show'),2200); }
  function hud() {
    $('score').textContent=S.score;
    $('best').textContent='最高纪录 '+best;
    $('combo').textContent=S.combo>1 ? '连续命中中心 × '+S.combo : '';
    $('combo').style.display=S.combo>1?'block':'none';
    $('hiscoreLine').textContent='最高纪录 '+best;
    $('historyLine').textContent=history.length?'最近战绩  '+history.slice(0,5).join(' / '):'每一跳，都是新的开始';
    $('score').style.visibility=S.mode==='menu'?'hidden':'visible';
  }
  function setup(seed, difficulty) {
    S.seed=seed; S.runDifficulty=difficulty; S.platforms=L.genPlatforms(1200,seed,difficulty);
    S.cur=0; S.score=0; S.combo=0; S.charge=0; S.fly=null; S.fx=[]; S.rings=[];
    S.pawn={x:0,y:0,z:S.platforms[0].height,squash:0,rotation:0,opacity:1};
    S.cam={x:0,y:0}; S.stayDone=false; S.stayT0=0; S.landedAt=performance.now();
  }
  function start(demo = false, restore = false) {
    audio.unlock(); audio.chargeStop(); pointer=null; auto=demo;
    const r=restore ? resumeData : null;
    setup(r?.seed ?? (Q.has('seed') ? Number(Q.get('seed'))>>>0 : Date.now()>>>0), r?.difficulty ?? cfg.difficulty);
    if (r && Number.isInteger(r.cur) && r.cur>=0 && r.cur<S.platforms.length-1 && Number.isFinite(r.score) && Number.isFinite(r.pawn?.x) && Number.isFinite(r.pawn?.y)) {
      S.cur=r.cur; S.score=Math.max(0,r.score); S.combo=Math.max(0,Number(r.combo)||0);
      const p=S.platforms[S.cur]; S.pawn.x=r.pawn.x; S.pawn.y=r.pawn.y; S.pawn.z=p.height;
      S.cam={x:p.x,y:p.y}; S.stayDone=!!r.stayDone; S.stayT0=performance.now();
    }
    resumeData=null; S.mode='idle'; S.landedAt=performance.now();
    $('startScreen').hidden=true; $('endScreen').hidden=true;
    $('exitDemoBtn').hidden=!auto; $('hint').textContent=auto?'自动演示 · 不计入个人纪录':'按住屏幕任意空白处，松手起跳';
    document.body.dataset.playing='true'; hud(); if(!auto) save();
  }
  function aim() {
    const next=S.platforms[S.cur+1];
    if (!next) return {x:1,y:0,dist:200};
    const dx=next.x-S.pawn.x,dy=next.y-S.pawn.y,dist=Math.hypot(dx,dy);
    return {x:dx/dist,y:dy/dist,dist};
  }
  function press(internal=false) {
    if(paused||S.mode!=='idle'||(auto&&!internal)) return false;
    audio.unlock(); S.mode='charge'; S.charge=0; S.chargeT0=performance.now(); S.direction=aim(); audio.chargeStart(); return true;
  }
  function release(power) {
    if(paused||S.mode!=='charge') return false;
    S.charge=Number.isFinite(power)?Math.max(0,power):Math.min(cfg.maxCharge,(performance.now()-S.chargeT0)*cfg.chargeRate);
    audio.chargeStop(); const jump=L.chargeToJump(S.charge,cfg),d=S.direction||aim();
    const from={x:S.pawn.x,y:S.pawn.y,z:S.pawn.z};
    S.fly={t0:performance.now(),airMs:jump.airMs,from,to:{x:from.x+d.x*jump.dist,y:from.y+d.y*jump.dist},peak:Math.min(165,64+jump.dist*.18)};
    S.mode='air'; S.pawn.squash=0; audio.jump(); pointer=null; return true;
  }
  function addPoints(points, label, now) {
    S.score+=points; if(!auto) best=Math.max(best,S.score);
    S.fx.push({x:S.pawn.x,y:S.pawn.y,z:S.pawn.z+76,text:label||'+'+points,t0:now});
    hud(); if(!auto)save();
  }
  function land(now) {
    const f=S.fly; S.fly=null; S.pawn.x=f.to.x; S.pawn.y=f.to.y; S.pawn.rotation=0;
    const next=S.platforms[S.cur+1], current=S.platforms[S.cur];
    const hit=next?L.judge(f.to,next):'miss';
    if(hit==='miss') {
      if(L.judge(f.to,current)!=='miss') {
        S.pawn.z=current.height; S.pawn.squash=.25; S.mode='idle'; S.landedAt=now; S.combo=0; hud(); audio.land(0); return;
      }
      S.mode='dead'; S.deadT0=now; S.deadZ=S.pawn.z; S.stayT0=0; audio.fall(); if(!auto)save(null); return;
    }
    S.cur++; S.pawn.z=next.height; S.pawn.squash=.36; S.mode='idle'; S.landedAt=now;
    S.stayT0=now; S.stayDone=false; S.combo=hit==='center'?S.combo+1:0;
    const points=hit==='center'?L.comboScore(S.combo):1;
    S.rings.push({x:next.x,y:next.y,z:next.height+1,t0:now});
    addPoints(points,hit==='center'?'+'+points+'  正中中心':'+1',now); audio.land(S.combo);
  }
  function finish() {
    S.mode='over'; auto=false; $('exitDemoBtn').hidden=true;
    if(!S.demoRun) { history.unshift(S.score); history=history.slice(0,10); save(null); }
    $('finalScore').textContent=S.score; $('endScreen').hidden=false; $('endTitle').textContent=S.demoRun?'演示结束':'本局得分'; hud();
  }
  function update(now, dt) {
    if(paused) return;
    if(S.mode==='charge') {
      S.charge=Math.min(cfg.maxCharge,(now-S.chargeT0)*cfg.chargeRate);
      S.pawn.squash=Math.min(.58,S.charge/400*.5);
      if(auto&&S.charge>=S.direction.dist/L.PHYS.K) release(S.direction.dist/L.PHYS.K);
    }
    if(S.mode==='air'&&S.fly) {
      const f=S.fly,t=Math.min(1,(now-f.t0)/f.airMs),next=S.platforms[S.cur+1];
      S.pawn.x=f.from.x+(f.to.x-f.from.x)*t; S.pawn.y=f.from.y+(f.to.y-f.from.y)*t;
      S.pawn.z=f.from.z+((next?.height||f.from.z)-f.from.z)*t+4*f.peak*t*(1-t);
      S.pawn.rotation=-Math.PI*2*t;
      if(t>=1)land(now);
    }
    if(S.mode==='idle') {
      S.pawn.squash*=Math.exp(-dt*16);
      const pl=S.platforms[S.cur];
      if(S.stayT0&&!S.stayDone&&L.BONUS[pl.type]&&now-S.stayT0>=L.BONUS_STAY_MS) {
        S.stayDone=true; addPoints(L.BONUS[pl.type],null,now); audio.bonus();
      }
      if(auto&&now-S.landedAt>(L.BONUS[pl.type]&&!S.stayDone?2300:480))press(true);
    }
    if(S.mode==='dead') {
      const t=(now-S.deadT0)/1000;
      S.pawn.z=S.deadZ-500*t*t; S.pawn.rotation=t*2.8; S.pawn.opacity=Math.max(0,1-t*1.5);
      if(t>1.05)finish();
    }
    const cur=S.platforms[S.cur],next=S.platforms[S.cur+1];
    if(cur&&next) {
      const target={x:cur.x+(next.x-cur.x)*.32,y:cur.y+(next.y-cur.y)*.32};
      const k=1-Math.exp(-dt*6); S.cam.x+=(target.x-S.cam.x)*k; S.cam.y+=(target.y-S.cam.y)*k;
    }
    S.fx=S.fx.filter(f=>now-f.t0<1100); S.rings=S.rings.filter(r=>now-r.t0<550);
  }
  function render(now) {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.fillStyle=cfg.background;ctx.fillRect(0,0,vw,vh);
    const c=project(S.cam.x,S.cam.y);ox=vw/2-c.x*scale;oy=vh*(S.mode==='menu'?.57:.60)-c.y*scale;
    ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
    const vis=S.platforms.slice(Math.max(0,S.cur-2),S.cur+(S.mode==='menu'?5:3));
    vis.sort((a,b)=>(b.x+b.y)-(a.x+a.y));
    let pawnDrawn=false;
    for(const p of vis) {
      if(!pawnDrawn&&S.pawn.x+S.pawn.y>p.x+p.y+p.size*.6&&S.pawn.z<p.height+5) { JJ.ART?.pawn(ctx,S.pawn,project,now);pawnDrawn=true; }
      JJ.ART?.platform(ctx,texture?{...p,texture}:p,project,now);
    }
    if(S.mode==='air') {
      const p=project(S.pawn.x,S.pawn.y,42);ctx.fillStyle='rgba(30,35,31,.13)';ctx.beginPath();ctx.ellipse(p.x,p.y,18,8,0,0,Math.PI*2);ctx.fill();
    }
    if(!pawnDrawn)JJ.ART?.pawn(ctx,S.pawn,project,now);
    for(const r of S.rings) {
      const t=(now-r.t0)/550,p=project(r.x,r.y,r.z);ctx.strokeStyle='rgba(255,255,255,'+(1-t)+')';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(p.x,p.y,18+t*35,9+t*18,0,0,Math.PI*2);ctx.stroke();
    }
    if(cfg.showGuide&&['idle','charge'].includes(S.mode)) {
      const next=S.platforms[S.cur+1],a=project(S.pawn.x,S.pawn.y,S.pawn.z+2),b=project(next.x,next.y,next.height+2);
      ctx.strokeStyle='rgba(38,66,47,.35)';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
      if(S.mode==='charge') {
        const d=S.direction,j=L.chargeToJump(S.charge,cfg),p=project(S.pawn.x+d.x*j.dist,S.pawn.y+d.y*j.dist,next.height+3);
        ctx.strokeStyle='#268c5a';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,8,4,0,0,Math.PI*2);ctx.stroke();
      }
    }
    for(const f of S.fx) {
      const t=(now-f.t0)/1100,p=project(f.x,f.y,f.z+t*30);ctx.globalAlpha=Math.min(1,(1-t)*2);ctx.fillStyle='#253c2c';ctx.font='500 19px "PingFang SC",sans-serif';ctx.textAlign='center';ctx.fillText(f.text,p.x,p.y);
    }
    ctx.globalAlpha=1;
    const pl=S.platforms[S.cur];
    if(pl&&S.mode==='idle'&&L.BONUS[pl.type]&&!S.stayDone&&S.stayT0) {
      const p=project(pl.x,pl.y,pl.height-4),t=Math.min(1,(now-S.stayT0)/L.BONUS_STAY_MS);
      ctx.strokeStyle='#fafaf6';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y,23,12,0,-Math.PI/2,-Math.PI/2+t*Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
  function tick(now) {
    if(now-lastFrame<8)return;const dt=Math.min(.08,(now-lastFrame)/1000);lastFrame=now;
    update(now,dt);render(now);
  }
  function frame(now) { requestAnimationFrame(frame);tick(now); }
  requestAnimationFrame(frame);
  setInterval(()=>{const now=performance.now();if(now-lastFrame>100&&!document.hidden)tick(now);},100);
  JJ.pause=()=>{
    if(paused)return;
    if(S.mode==='charge'){audio.chargeStop();S.mode='idle';S.pawn.squash=0;}
    pointer=null;paused=true;pauseAt=performance.now();
  };
  JJ.resume=()=>{
    if(!paused)return;const dt=performance.now()-pauseAt;
    if(S.fly)S.fly.t0+=dt;S.landedAt+=dt;if(S.stayT0)S.stayT0+=dt;if(S.deadT0)S.deadT0+=dt;
    S.fx.forEach(f=>f.t0+=dt);S.rings.forEach(f=>f.t0+=dt);paused=false;
  };
  canvas.addEventListener('pointerdown',e=>{if(pointer!==null||e.button!==0)return;e.preventDefault();if(press()){pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);}});
  canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;e.preventDefault();release();});
  canvas.addEventListener('pointercancel',()=>{if(S.mode==='charge'){S.mode='idle';S.pawn.squash=0;audio.chargeStop();}pointer=null;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat||paused||/INPUT|TEXTAREA|BUTTON|SELECT/.test(e.target.tagName))return;e.preventDefault();if(S.mode==='menu'||S.mode==='over')start();else press();});
  addEventListener('keyup',e=>{if(e.code==='Space'&&S.mode==='charge'&&!auto){e.preventDefault();release();}});
  addEventListener('blur',()=>{if(S.mode==='charge'){S.mode='idle';S.pawn.squash=0;audio.chargeStop();pointer=null;}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){save();JJ.pause();}else if(!JJ.CONFIG_PANEL?.isOpen())JJ.resume();});
  addEventListener('pagehide',()=>save());
  function syncSound(){audio.setMuted(!cfg.sound);$('soundBtn').setAttribute('aria-pressed',String(cfg.sound));$('soundBtn').textContent=cfg.sound?'声音 开':'声音 关';}
  function loadTexture(){texture=null;if(!cfg.platformTexture)return;const img=new Image();img.onload=()=>{texture=img;};img.onerror=()=>toast('图片无法读取，请重新上传');img.src=cfg.platformTexture;}
  $('startBtn').onclick=()=>{S.demoRun=false;start();};$('retryBtn').onclick=()=>{S.demoRun=false;start();};
  $('resumeBtn').onclick=()=>{S.demoRun=false;start(false,true);};
  $('demoBtn').onclick=()=>{S.demoRun=true;start(true);};
  $('exitDemoBtn').onclick=()=>{S.demoRun=false;start();};
  $('soundBtn').onclick=()=>{audio.unlock();cfg.sound=!cfg.sound;syncSound();store(CFG_KEY,cfg);};
  $('settingsBtn').onclick=()=>JJ.CONFIG_PANEL?.open();
  $('homeBtn').onclick=()=>{auto=false;S.mode='menu';$('endScreen').hidden=true;$('startScreen').hidden=false;$('resumeBtn').hidden=true;document.body.dataset.playing='false';setup(Date.now()>>>0,cfg.difficulty);S.mode='menu';hud();};
  JJ.CONFIG_PANEL?.mount($('cfgHost'));JJ.CONFIG_PANEL?.onChange(next=>{cfg=L.sanitize(next);store(CFG_KEY,cfg);syncSound();audio.applyOverrides(cfg.audio);loadTexture();toast('设置已保存，难度在新一局生效');});
  if(Q.get('muted')==='1')cfg.sound=false;
  syncSound();audio.applyOverrides(cfg.audio);loadTexture();setup(37,cfg.difficulty);S.mode='menu';
  $('resumeBtn').hidden=!(resumeData&&Number.isInteger(resumeData.cur));hud();
  if(Q.get('autoplay')==='1'){S.demoRun=true;start(true);}
  window.__errs=[];addEventListener('error',e=>window.__errs.push(e.message));addEventListener('unhandledrejection',e=>window.__errs.push(String(e.reason)));
  window.__jj={
    state:()=>({mode:S.mode,cur:S.cur,score:S.score,combo:S.combo,charge:S.charge,best,auto,paused,stayDone:S.stayDone}),
    getConfig:()=>JSON.parse(JSON.stringify(cfg)),start:()=>{S.demoRun=false;start();},press,release,
    jumpFor:ms=>{if(!press(true))return false;return release(ms*cfg.chargeRate);},
    setAuto:value=>{if(value){S.demoRun=true;start(true);}else{auto=false;$('exitDemoBtn').hidden=true;}},
    snapshot:()=>({platforms:S.platforms.slice(0,S.cur+3).map(p=>({...p})),pawn:{...S.pawn},history:[...history]}),
    targetMs:()=>aim().dist/L.PHYS.K/cfg.chargeRate,
    setNextType:type=>{if(['plain','cylinder','rubik','manhole','shop','record'].includes(type))S.platforms[S.cur+1].type=type;}
  };
})();
