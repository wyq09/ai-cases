(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const KEY = 'zuma-infinite-v1', D = 32, TAU = Math.PI * 2;
const palette = ['#ef3a35','#299fda','#edc739','#59b643','#b968cb','#ede4c8'];
const names = ['失落神庙','回环石庭','双蛇遗迹','太阳祭坛','翡翠迷宫','月影回廊'];
let save = {level:1, best:0, score:0, muted:false, aim:true, vibration:true};
try { const data = JSON.parse(localStorage.getItem(KEY)); if (data) Object.assign(save, data); } catch {}
save.level = Math.max(1, Math.min(1000000, Number(save.level) || 1));
let W=1100,H=620,scale=1,ox=0,oy=0,portrait=false,path=[],pathLength=1,staticLayer;
let balls=[],shots=[],particles=[],texts=[],rings=[],remaining=0,level=save.level,score=save.score||0,levelStartScore=score;
let phase='playing',current=0,next=1,angle=-Math.PI/2,cooldown=0,recoil=0,shake=0,slow=0,combo=0,comboGrace=0,shotsFired=0,cleared=0,hits=0;
let waveTotal=0,levelTimer=0,settleTimer=0,uid=0,rng,spawnColor=0,runLength=0,auto=false,autoClock=0,checkpointClock=0;
let pointer=null,audioCtx=null,muted=!!save.muted,tools={bomb:2,slow:2},armed=false,bannerTimer=0;
const frog={x:550,y:335};
function random(seed) { let x=seed>>>0; return () => {x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}; }
function persist(checkpoint=true) {
  save.level=phase==='won'?level+1:level;save.score=phase==='lost'?levelStartScore:score;save.best=Math.max(save.best||0,score);save.muted=muted;
  if(checkpoint && ['playing','paused','settings'].includes(phase)) save.checkpoint={level,balls:balls.map(b=>({s:b.s/pathLength,c:b.c})),remaining,current,next,score,levelStartScore,cleared,shotsFired,tools:{...tools},slow,waveTotal};
  else if(!checkpoint) delete save.checkpoint;
  try {localStorage.setItem(KEY,JSON.stringify(save));} catch {}
}
function sound(type,n=1) {
  if(muted)return;
  try {
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
    const t=audioCtx.currentTime,notes={shoot:[240,85,.085],hit:[360,130,.065],swap:[520,750,.085],pop:[560+n*70,1040+n*60,.17],bomb:[140,38,.32],slow:[760,250,.3],lose:[200,60,.65],win:[520,1040,.5]};
    const [f1,f2,d]=notes[type]||notes.hit;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type==='shoot'||type==='bomb'?'triangle':'sine';o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(f2,t+d);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(type==='bomb'?.2:.09,t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+d+.02);
    if(type==='pop'||type==='win')for(let k=1;k<=2;k++){const a=audioCtx.createOscillator(),v=audioCtx.createGain();a.frequency.value=f1*(k===1?1.25:1.5);v.gain.setValueAtTime(.0001,t+k*.04);v.gain.exponentialRampToValueAtTime(.035,t+k*.04+.005);v.gain.exponentialRampToValueAtTime(.0001,t+k*.04+.15);a.connect(v);v.connect(audioCtx.destination);a.start(t+k*.04);a.stop(t+k*.04+.18);}
  } catch {}
}
function vibrate(ms){if(save.vibration && navigator.vibrate)navigator.vibrate(ms);}
function colorCount(){return level<3?3:level<8?4:level<18?5:6;}
function availableColor(){const set=[...new Set(balls.map(b=>b.c))];return set.length?set[Math.floor(rng()*set.length)]:Math.floor(rng()*colorCount());}
function generatedColor(){if(runLength<=0){const previous=spawnColor;spawnColor=Math.floor(rng()*colorCount());if(spawnColor===previous)spawnColor=(spawnColor+1)%colorCount();runLength=1+Math.floor(rng()*2);}runLength--;return spawnColor;}
function point(s){s=Math.max(0,Math.min(pathLength,s));let a=0,b=path.length-1;while(a+1<b){let m=(a+b)>>1;if(path[m].s<s)a=m;else b=m;}const p=path[a],q=path[b],t=(s-p.s)/(q.s-p.s||1);return{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};}
function makePath(){
  path=[];pathLength=0;const type=(level-1)%6,mirror=(Math.floor((level-1)/6)%2)?-1:1;
  const cx=W/2,cy=H/2+8,rx=W/2-(portrait?55:77),ry=H/2-(portrait?137:107),turns=[1.18,1.22,1.12,1.24,1.16,1.21][type];
  frog.x=cx;frog.y=cy;
  for(let i=0;i<=1600;i++){
    const t=i/1600,a=-Math.PI/2+mirror*t*TAU*turns+(type===3?.32:type===5?-.35:0),radius=1-t*.64;
    let x=Math.cos(a),y=Math.sin(a);
    if(type===1||type===4){const p=type===1?.68:.8;x=Math.sign(x)*Math.pow(Math.abs(x),p);y=Math.sign(y)*Math.pow(Math.abs(y),p);}
    const wobble=type===2?1+.035*Math.sin(a*3):type===5?1+.03*Math.cos(a*4):1;
    const p={x:cx+rx*x*radius*wobble,y:cy+ry*y*radius*wobble,s:0};
    if(i)pathLength+=Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y);p.s=pathLength;path.push(p);
  }
}
function fallbackBackground(c){c.fillStyle='#714728';c.fillRect(0,0,W,H);for(let y=0;y<H;y+=72)for(let x=-(y%144?60:0);x<W;x+=120){c.fillStyle=`rgba(15,7,2,${.12+((x+y)%7)/100})`;c.strokeStyle='#9e7144';c.lineWidth=1;c.fillRect(x+2,y+2,116,68);c.strokeRect(x+3,y+3,114,66);}c.beginPath();path.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle='#2b190b';c.lineWidth=46;c.stroke();c.strokeStyle='#51331b';c.lineWidth=34;c.stroke();}
function buildStatic(){staticLayer=document.createElement('canvas');staticLayer.width=W;staticLayer.height=H;const c=staticLayer.getContext('2d');if(window.ZArt){ZArt.background(c,W,H,(level-1)%6);ZArt.track(c,path);}else fallbackBackground(c);}
function resize(){
  const oldLength=pathLength,oldPortrait=portrait;portrait=innerHeight>innerWidth*1.1;W=portrait?620:1100;H=portrait?1000:620;
  canvas.width=Math.round(innerWidth*Math.min(devicePixelRatio||1,2));canvas.height=Math.round(innerHeight*Math.min(devicePixelRatio||1,2));
  scale=Math.min(canvas.width/W,canvas.height/H);ox=(canvas.width-W*scale)/2;oy=(canvas.height-H*scale)/2;
  if(path.length){makePath();if(oldPortrait!==portrait){balls.forEach(b=>{b.s=b.s/oldLength*pathLength;b.x=undefined;b.y=undefined;});for(let i=1;i<balls.length;i++)balls[i].s=Math.min(balls[i].s,balls[i-1].s-D);shots=[];}buildStatic();}
  const ratio=canvas.width/innerWidth;$('board-ui').style.cssText=`left:${ox/ratio}px;top:${oy/ratio}px;width:${W}px;height:${H}px;transform:scale(${scale/ratio})`;
  $('board-ui').classList.toggle('portrait',portrait);
}
function announce(text){$('banner').textContent=text;$('banner').classList.add('show');bannerTimer=2.8;}
function start(n=level,checkpoint=null){
  level=Math.max(1,Math.floor(n));rng=random(level*196613+719);score=checkpoint?.score??levelStartScore;levelStartScore=checkpoint?.levelStartScore??score;
  balls=[];shots=[];particles=[];texts=[];rings=[];hits=0;shotsFired=0;cleared=0;combo=0;comboGrace=0;cooldown=0;slow=0;shake=0;settleTimer=0;levelTimer=0;armed=false;pointer=null;runLength=0;autoClock=0;
  tools={bomb:2,slow:2};phase='playing';waveTotal=38+Math.min(90,Math.floor((level-1)*2.8));remaining=waveTotal;makePath();
  const initial=Math.min(18,Math.floor(pathLength*.24/D));for(let i=0;i<initial;i++){balls.push({id:++uid,s:(initial-i-1)*D,c:generatedColor()});remaining--;}
  current=availableColor();next=availableColor();
  if(checkpoint?.level===level && Array.isArray(checkpoint.balls)){
    balls=checkpoint.balls.filter(b=>Number.isFinite(b.s)&&b.c>=0&&b.c<6).map(b=>({id:++uid,s:Math.max(0,Math.min(1,b.s))*pathLength,c:b.c}));
    remaining=Math.max(0,checkpoint.remaining||0);current=checkpoint.current??current;next=checkpoint.next??next;tools=checkpoint.tools||tools;cleared=checkpoint.cleared||0;waveTotal=checkpoint.waveTotal||waveTotal;shotsFired=checkpoint.shotsFired||0;slow=Math.max(0,Math.min(8,checkpoint.slow||0));
  }
  buildStatic();$('overlay').hidden=true;$('pause').textContent='Ⅱ';updateHUD();announce(`第 ${level} 关 · ${names[(level-1)%6]}`);persist();
}
function updateHUD(){
  $('level').textContent=level;$('level-name').textContent=names[(level-1)%6];$('score').textContent=String(score).padStart(6,'0');$('best').textContent=String(Math.max(score,save.best||0));
  const progress=Math.min(100,Math.max(0,(waveTotal-remaining-balls.length)/waveTotal*100));$('progress').style.width=progress+'%';$('progress').parentElement.setAttribute('aria-valuenow',Math.round(progress));
  $('remaining').textContent=`剩余 ${remaining+balls.length} 颗`;$('bomb-count').textContent=tools.bomb;$('slow-count').textContent=tools.slow;
  $('bomb').classList.toggle('selected',armed);$('bomb').disabled=tools.bomb<=0;$('slow').disabled=tools.slow<=0||slow>0;
  $('sound').textContent=muted?'声音关':'声音开';$('auto').classList.toggle('selected',auto);$('auto').textContent=auto?'停止演示':'自动演示';
}
function swap(){if(phase!=='playing')return;[current,next]=[next,current];sound('swap');recoil=.08;}
function shoot(x,y,force=false){
  if(phase!=='playing'||cooldown>0)return false;
  if(!force&&Math.hypot(x-frog.x,y-frog.y)<48){swap();return false;}
  angle=Math.atan2(y-frog.y,x-frog.x);const bomb=armed&&tools.bomb>0;
  shots.push({x:frog.x+Math.cos(angle)*44,y:frog.y+Math.sin(angle)*44,vx:Math.cos(angle)*1050,vy:Math.sin(angle)*1050,c:current,bomb,trail:[]});
  if(bomb){tools.bomb--;armed=false;}current=next;next=availableColor();cooldown=.22;recoil=1;shotsFired++;sound('shoot');vibrate(8);return true;
}
function addBurst(b,power=1){const p=point(b.s);for(let k=0;k<14*power;k++){const a=rng()*TAU,v=65+rng()*180;particles.push({x:p.x,y:p.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:.35+rng()*.35,life:.7,c:b.c,r:2+rng()*4});}rings.push({x:p.x,y:p.y,r:14,t:.25,c:b.c});}
function removeRange(a,b,chain=false,bomb=false){
  const gone=balls.splice(a,b-a+1);if(!gone.length)return false;
  combo=chain?Math.max(2,combo+1):1;comboGrace=2;settleTimer=.24;
  const points=gone.length*100*combo;score+=points;cleared+=gone.length;
  gone.forEach(g=>addBurst(g,bomb?1.3:1));const p=point(gone[Math.floor(gone.length/2)].s);
  texts.push({x:p.x,y:p.y,text:combo>1?`${combo} 连锁  +${points}`:`+${points}`,t:1.15,big:combo>1});
  shake=Math.min(7,2+combo);sound(bomb?'bomb':'pop',combo);vibrate(combo>1?[18,25,18]:15);
  if(!balls.some(b=>b.c===current))current=availableColor();if(!balls.some(b=>b.c===next))next=availableColor();
  return true;
}
function match(index,chain=false){if(!balls[index])return false;let a=index,b=index;const color=balls[index].c;
  while(a>0&&balls[a-1].c===color&&balls[a-1].s-balls[a].s<D+1)a--;
  while(b<balls.length-1&&balls[b+1].c===color&&balls[b].s-balls[b+1].s<D+1)b++;
  return b-a+1>=3?removeRange(a,b,chain):false;
}
function impact(shot,index){
  hits++;const target=balls[index],p=point(target.s);sound('hit');
  if(shot.bomb){const a=Math.max(0,index-4),b=Math.min(balls.length-1,index+4);removeRange(a,b,false,true);return;}
  const prev=point(target.s-3),nxt=point(target.s+3),forward=(shot.x-p.x)*(nxt.x-prev.x)+(shot.y-p.y)*(nxt.y-prev.y)>=0;
  const k=index+(forward?0:1),s=k<balls.length?balls[k].s+D:balls[balls.length-1].s;
  for(let j=0;j<k;j++)balls[j].s+=D;
  balls.splice(k,0,{id:++uid,s,c:shot.c,x:shot.x,y:shot.y,insert:.14});
  if(!match(k)){combo=0;comboGrace=0;}
}
function finish(win){
  if(phase!=='playing')return;phase=win?'won':'lost';pointer=null;auto=false;armed=false;
  sound(win?'win':'lose');persist(false);
  if(win){save.level=level+1;save.score=score;try{localStorage.setItem(KEY,JSON.stringify(save));}catch{}}
  openOverlay(win?'关卡完成':'遗迹失守',win?`第 ${level} 关已完成，下一段旅程正在等你。`:'珠链抵达了洞口。调整角度，再试一次。',win?'下一关':'重新挑战',false);
  $('result').textContent=`得分 ${score}  ·  消除 ${cleared} 颗  ·  发射 ${shotsFired} 次`;
}
function simulateAuto(dt){autoClock-=dt;if(!auto||autoClock>0||!balls.length)return;autoClock=.45;
  let candidates=[];
  for(let i=0;i<balls.length;i++){
    const b=balls[i];if(b.c!==current)continue;const p=point(b.s),dist=Math.hypot(p.x-frog.x,p.y-frog.y);let blocked=false;
    for(let j=0;j<balls.length;j++){if(i===j)continue;const q=point(balls[j].s),t=((q.x-frog.x)*(p.x-frog.x)+(q.y-frog.y)*(p.y-frog.y))/(dist*dist);if(t>.05&&t<.94&&Math.hypot(q.x-frog.x-(p.x-frog.x)*t,q.y-frog.y-(p.y-frog.y)*t)<D*.85){blocked=true;break;}}
    if(!blocked)candidates.push({p,rank:(balls[i-1]?.c===b.c||balls[i+1]?.c===b.c?1000:0)+b.s});
  }
  candidates.sort((a,b)=>b.rank-a.rank);if(candidates.length)shoot(candidates[0].p.x,candidates[0].p.y,true);else swap();
}
function update(dt){
  if(phase!=='playing')return;
  levelTimer+=dt;cooldown=Math.max(0,cooldown-dt);recoil=Math.max(0,recoil-dt*7);shake=Math.max(0,shake-dt*20);slow=Math.max(0,slow-dt);settleTimer=Math.max(0,settleTimer-dt);comboGrace=Math.max(0,comboGrace-dt);
  if(bannerTimer>0){bannerTimer-=dt;if(bannerTimer<=0)$('banner').classList.remove('show');}
  const speed=(17+18*(1-Math.exp(-(level-1)/25)))*(slow>0?.32:1)*(settleTimer>0?.2:1);
  balls.forEach(b=>{b.s+=speed*dt;b.insert=Math.max(0,(b.insert||0)-dt);});
  for(let i=1;i<balls.length;i++){
    const gap=balls[i-1].s-balls[i].s;
    if(gap>D+.05){
      const same=balls[i-1].c===balls[i].c,delta=Math.min(gap-D,dt*(same?260:130));
      if(same){for(let j=0;j<i;j++)balls[j].s-=delta;}
      else {for(let j=i;j<balls.length;j++)balls[j].s+=delta;}
      if(gap-delta<=D+.05&&same&&match(i,true))break;
    }
  }
  if(remaining>0&&(!balls.length||balls[balls.length-1].s>=D)){balls.push({id:++uid,s:0,c:generatedColor()});remaining--;}
  for(let j=shots.length-1;j>=0;j--){
    const s=shots[j];s.trail.unshift({x:s.x,y:s.y});s.trail.length=Math.min(5,s.trail.length);let hit=false;
    const steps=Math.max(1,Math.ceil(dt*1050/10));
    for(let step=0;step<steps&&!hit;step++){
      s.x+=s.vx*dt/steps;s.y+=s.vy*dt/steps;
      for(let i=0;i<balls.length;i++){const p=point(balls[i].s);if(Math.hypot(p.x-s.x,p.y-s.y)<D-2){impact(s,i);shots.splice(j,1);hit=true;break;}}
    }
    if(!hit&&(s.x<-40||s.x>W+40||s.y<-40||s.y>H+40))shots.splice(j,1);
  }
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=260*dt;p.t-=dt;}particles=particles.filter(p=>p.t>0).slice(-900);
  for(const t of texts){t.y-=32*dt;t.t-=dt;}texts=texts.filter(t=>t.t>0);
  for(const r of rings){r.r+=100*dt;r.t-=dt;}rings=rings.filter(r=>r.t>0);
  if(balls[0]?.s>=pathLength){finish(false);return;}
  if(!remaining&&!balls.length&&!shots.length){finish(true);return;}
  simulateAuto(dt);checkpointClock+=dt;if(checkpointClock>3){checkpointClock=0;persist();}
}
function drawBall(x,y,c,r=16,rotation=0){
  if(window.ZArt){ZArt.ball(ctx,x,y,c,r,rotation);return;}
  ctx.save();const g=ctx.createRadialGradient(x-r*.3,y-r*.4,1,x,y,r);g.addColorStop(0,'#fff0d1');g.addColorStop(.28,palette[c]);g.addColorStop(1,'#261c16');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.strokeStyle='#311b0a';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
}
function draw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#20130c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.translate(ox,oy);ctx.scale(scale,scale);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();if(shake>0&&phase==='playing')ctx.translate(Math.sin(levelTimer*100)*shake,Math.cos(levelTimer*120)*shake*.65);
  if(staticLayer)ctx.drawImage(staticLayer,0,0);
  const start=point(0),end=point(pathLength),danger=(balls[0]?.s||0)>pathLength*.83;
  if(window.ZArt){ZArt.gate(ctx,start.x,start.y,false,false);ZArt.gate(ctx,end.x,end.y,true,danger);}else{for(const p of [start,end]){ctx.fillStyle='#1e140c';ctx.beginPath();ctx.arc(p.x,p.y,26,0,TAU);ctx.fill();}}
  if(danger){ctx.fillStyle=`rgba(180,30,10,${.12+.06*Math.sin(levelTimer*6)})`;ctx.fillRect(0,0,W,6);}
  if(save.aim&&phase==='playing'){
    const dx=Math.cos(angle),dy=Math.sin(angle);let stop=650;
    for(const b of balls){const p=point(b.s),t=(p.x-frog.x)*dx+(p.y-frog.y)*dy,cross=Math.abs((p.x-frog.x)*dy-(p.y-frog.y)*dx);if(t>45&&cross<30)stop=Math.min(stop,t-20);}
    ctx.save();ctx.fillStyle=palette[current];for(let t=60;t<stop;t+=19){ctx.globalAlpha=Math.max(.15,.6-t/1100);ctx.beginPath();ctx.arc(frog.x+dx*t,frog.y+dy*t,2.1,0,TAU);ctx.fill();}ctx.restore();
  }
  for(const b of balls){const p=point(b.s);if(b.x===undefined){b.x=p.x;b.y=p.y;}b.x+=(p.x-b.x)*.38;b.y+=(p.y-b.y)*.38;drawBall(b.x,b.y,b.c,16,b.s/110);}
  if(window.ZArt)ZArt.frog(ctx,frog.x,frog.y,angle,current,next,recoil);
  else {ctx.save();ctx.translate(frog.x,frog.y);ctx.rotate(angle+Math.PI/2);ctx.fillStyle='#6c8736';ctx.strokeStyle='#c5a94f';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,37,45,0,0,TAU);ctx.fill();ctx.stroke();for(const x of [-24,24]){ctx.fillStyle='#adc15a';ctx.beginPath();ctx.arc(x,-24,13,0,TAU);ctx.fill();ctx.fillStyle='#141e0d';ctx.beginPath();ctx.arc(x,-26,5,0,TAU);ctx.fill();}drawBall(0,-30,current);drawBall(0,23,next,11);ctx.restore();}
  if(armed){ctx.strokeStyle='#f5a347';ctx.lineWidth=3;ctx.beginPath();ctx.arc(frog.x,frog.y,58,0,TAU);ctx.stroke();}
  for(const s of shots){s.trail.forEach((p,i)=>{ctx.globalAlpha=(1-i/5)*.24;drawBall(p.x,p.y,s.c,14-i);});ctx.globalAlpha=1;drawBall(s.x,s.y,s.c,s.bomb?20:16);if(s.bomb){ctx.strokeStyle='#fff0c2';ctx.lineWidth=3;ctx.beginPath();ctx.arc(s.x,s.y,23,0,TAU);ctx.stroke();}}
  for(const p of particles){ctx.globalAlpha=Math.min(1,p.t/.3);ctx.fillStyle=palette[p.c];ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.t*9);ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r);ctx.restore();}ctx.globalAlpha=1;
  for(const r of rings){ctx.globalAlpha=r.t*3;ctx.strokeStyle=palette[r.c];ctx.lineWidth=2;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.stroke();}ctx.globalAlpha=1;
  for(const t of texts){ctx.globalAlpha=Math.min(1,t.t*2);ctx.font=`bold ${t.big?29:24}px Georgia,serif`;ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#3a1a08';ctx.strokeText(t.text,t.x,t.y);ctx.fillStyle='#fff0ad';ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
  if(slow>0){ctx.fillStyle='#b8e4d3';ctx.font='bold 18px Georgia';ctx.textAlign='center';ctx.fillText(`缓行 ${Math.ceil(slow)}s`,frog.x,frog.y+80);}
  ctx.restore();
}
function coordinates(e){const r=canvas.getBoundingClientRect();return{x:((e.clientX-r.left)*canvas.width/r.width-ox)/scale,y:((e.clientY-r.top)*canvas.height/r.height-oy)/scale};}
canvas.addEventListener('pointerdown',e=>{if(phase!=='playing')return;e.preventDefault();const p=coordinates(e);pointer={id:e.pointerId,x:p.x,y:p.y};angle=Math.atan2(p.y-frog.y,p.x-frog.x);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(phase!=='playing')return;const p=coordinates(e);angle=Math.atan2(p.y-frog.y,p.x-frog.x);if(pointer){pointer.x=p.x;pointer.y=p.y;}});
canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=coordinates(e);pointer=null;shoot(p.x,p.y);});
canvas.addEventListener('pointercancel',()=>pointer=null);canvas.addEventListener('contextmenu',e=>{e.preventDefault();swap();});
function openOverlay(title,message,action,settings=false){$('overlay').hidden=false;$('dialog-title').textContent=title;$('dialog-message').textContent=message;$('resume').textContent=action;$('settings-fields').hidden=!settings;$('result').textContent='';$('restart').hidden=phase==='won'||phase==='lost';}
function pause(settings=false){if(phase!=='playing')return;phase=settings?'settings':'paused';pointer=null;persist();openOverlay(settings?'游戏设置':'暂停片刻',settings?'按自己的节奏探索遗迹。':'珠链已停住，准备好后继续。','继续游戏',settings);}
$('resume').onclick=()=>{sound('swap');if(phase==='won'){levelStartScore=score;start(level+1);}else if(phase==='lost'){score=levelStartScore;start(level);}else{phase='playing';$('overlay').hidden=true;}};
$('restart').onclick=()=>{score=levelStartScore;start(level);};
$('pause').onclick=()=>pause();$('settings').onclick=()=>pause(true);$('swap').onclick=swap;
$('sound').onclick=()=>{muted=!muted;sound('swap');persist();updateHUD();};
$('aim-toggle').checked=save.aim;$('aim-toggle').onchange=e=>{save.aim=e.target.checked;persist();};$('vibration-toggle').checked=save.vibration;$('vibration-toggle').onchange=e=>{save.vibration=e.target.checked;persist();};
$('auto').onclick=()=>{auto=!auto;updateHUD();if(auto){phase='playing';$('overlay').hidden=true;announce('自动演示 · 可随时手动接管');}};
$('bomb').onclick=()=>{if(phase==='playing'&&tools.bomb>0){armed=!armed;sound('swap');announce(armed?'爆破弹就绪 · 点击珠链发射':'已取消爆破弹');updateHUD();}};
$('slow').onclick=()=>{if(phase==='playing'&&tools.slow>0&&slow<=0){tools.slow--;slow=8;sound('slow');announce('时间缓行 · 8 秒');updateHUD();}};
addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'){e.preventDefault();swap();}else if(e.code==='Escape'){if(['paused','settings'].includes(phase))$('resume').click();else pause();}else if(e.key.toLowerCase()==='m')$('sound').click();});
addEventListener('resize',resize);addEventListener('pagehide',()=>persist(phase!=='won'&&phase!=='lost'));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='playing'&&!new URLSearchParams(location.search).has('test'))pause();if(document.hidden)audioCtx?.suspend();});
resize();start(level,save.checkpoint?.level===level?save.checkpoint:null);
let last=performance.now(),hudTimer=0;
function frame(t){const dt=Math.min(.035,Math.max(0,(t-last)/1000));last=t;update(dt);draw();hudTimer+=dt;if(hudTimer>.12){updateHUD();hudTimer=0;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.__zuma={get state(){return{level,score,phase,remaining,waveTotal,current,next,hits,cleared,shotsFired,combo,pathLength,portrait,W,H,frog:{...frog},tools:{...tools},slow,balls:balls.map(b=>({...b,...point(b.s)})),shots:shots.length};},shoot,swap,start,point,update,pause,get screen(){const ratio=canvas.width/innerWidth;return{x:ox/ratio,y:oy/ratio,scale:scale/ratio};}};
if(new URLSearchParams(location.search).has('test'))Object.assign(window.__zuma,{rig(colors,options={}){balls=colors.map((c,i)=>({id:++uid,c,s:(options.front??pathLength*.3)-i*D}));remaining=options.remaining??0;shots=[];phase='playing';$('overlay').hidden=true;current=options.current??colors[0]??0;next=current;cooldown=0;hits=0;cleared=0;score=0;combo=0;tools={bomb:2,slow:2};},match,impact:(c,i)=>{const p=point(balls[i].s);impact({c,x:p.x,y:p.y},i);},gap(i,amount){for(let j=0;j<i;j++)balls[j].s+=amount;},finish});
})();
