/* =========================================================================
 * TF.FX — 《雷霆战机》Canvas2D 粒子特效引擎（打击感负责）
 * 覆盖: 击中火花 / 爆炸层次 / 冲击环 / 屏幕震动 / 全屏闪光 / 伤害数字 /
 *       炮口闪光 / 引擎尾焰 / 低血晕影
 * 纪律: 禁 shadowBlur(发光一律径向渐变 + globalCompositeOperation='lighter')
 *       预渲染发光 sprite 缓存 · 对象池 + 硬上限 420 · DPR<=2
 *       document.hidden 不积累 · 色板克制(白/黄白火花·橙红爆·青玩家·红敌)
 * ========================================================================= */
window.TF=window.TF||{}; TF.FX=(()=>{ 'use strict';

// ---------- 色板（军事科幻，禁彩虹） ----------
const C={
  sparkW:'#ffffff', sparkY:'#ffe9c0',            // 白 / 黄白火花
  fireHot:'#ffd0a0', fireMid:'#ff7a3c',          // 爆炸橙红两阶
  ember:'#b23a20',                               // 余烬暗红
  player:'#35e0c8', starCW:'#d8fff6',            // 玩家青 / 青白闪星
  crit:'#ffd050',                                // 暴击数字
  hull:['#46586c','#2a3542','#ff7a3c'],          // 碎片: 舰体灰蓝 + 灼热橙
  smokeRGB:'154,162,174'
};

// ---------- 粒子类型（type<=2 为低价值，池满优先回收最老者） ----------
const T_SMOKE=0,T_TRAIL=1,T_FIRE=2,T_SPARK=3,T_STAR=4,
      T_DEBRIS=5,T_RING=6,T_TEXT=7,T_MUZZLE=8,T_CORE=9;

const DEF={
  spark :{t:T_SPARK ,n:8,spd:190,size:2.2,life:0.30,grav:40 ,drag:5.5,c:[C.sparkY,C.sparkW]},
  fire  :{t:T_FIRE  ,n:8,spd:75 ,size:11 ,life:0.50,grav:-26,drag:2.2,c:[C.fireHot,C.fireMid]},
  debris:{t:T_DEBRIS,n:6,spd:150,size:4  ,life:0.85,grav:520,drag:0.6,c:C.hull},
  smoke :{t:T_SMOKE ,n:6,spd:34 ,size:9  ,life:0.95,grav:0  ,drag:1.2,c:['#969eaa']},
  star  :{t:T_STAR  ,n:5,spd:100,size:6  ,life:0.26,grav:0  ,drag:3.0,c:[C.starCW]}
};
const MAXP=420;

// ---------- 状态 ----------
let W=420,H=760,DPR=1;
let list=[],pool=[];                 // 活动粒子 / 回收池
let trauma=0;                        // 震屏累积 0..1
let flashA=0,flashRate=0,flashRGB='255,255,255';
let lowHpV=0,vigPhase=0;
let autoQ=true,capMul=1,lowQ=false,badN=0,goodT=0,trailTick=0;

// ---------- 小工具 ----------
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

const _rgbCache={};
function rgbStr(col){                // '#rrggbb'/'#rgb'/'rgb(..)' -> 'r,g,b'
  let v=_rgbCache[col]; if(v) return v;
  let r=255,g=255,b=255,m;
  if(col&&col.charAt(0)==='#'){
    const hex=col.length===4? col.slice(1).replace(/./g,'$&$&'):col.slice(1);
    r=parseInt(hex.slice(0,2),16)||0; g=parseInt(hex.slice(2,4),16)||0; b=parseInt(hex.slice(4,6),16)||0;
  }else if((m=String(col).match(/[\d.]+/g))){ r=+m[0]|0; g=+m[1]|0; b=+m[2]|0; }
  v=r+','+g+','+b; _rgbCache[col]=v; return v;
}

// ---------- 预渲染发光 sprite 缓存（径向渐变圆盘，按色 key） ----------
const _sprites={}; let _smokeSpr=null;
function glow(col){
  let s=_sprites[col]; if(s) return s;
  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d'),rgb=rgbStr(col);
  const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+rgb+',1)');
  gr.addColorStop(0.22,'rgba('+rgb+',0.72)');
  gr.addColorStop(0.55,'rgba('+rgb+',0.20)');
  gr.addColorStop(1,'rgba('+rgb+',0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  return _sprites[col]=c;
}
function smokeSpr(){
  if(_smokeSpr) return _smokeSpr;
  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+C.smokeRGB+',0.85)');
  gr.addColorStop(0.6,'rgba('+C.smokeRGB+',0.36)');
  gr.addColorStop(1,'rgba('+C.smokeRGB+',0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  return _smokeSpr=c;
}

// ---------- 对象池（硬上限 420，满时优先杀最老 smoke/trail/fire） ----------
function cap(){ return capMul<1? MAXP>>1 : MAXP; }
function acquire(){
  if(list.length<cap()){ const p=pool.pop()||{}; list.push(p); return p; }
  for(let i=0;i<list.length;i++){ const q=list[i]; if(q.type<=T_FIRE) return q; }
  return list[0];
}

// ---------- 生成器 ----------
function burst(x,y,o){
  o=o||{}; const k=o.kind||'spark',d=DEF[k]||DEF.spark;
  const n=Math.max(1,Math.round((o.n!==undefined?o.n:d.n)*(lowQ?0.6:1)));
  const cols=o.colors||(o.color?[o.color]:d.c);
  for(let i=0;i<n;i++){
    const p=acquire();
    const a=(o.ang!==undefined)
      ? o.ang+(Math.random()-0.5)*(o.spread!==undefined?o.spread:6.2832)
      : Math.random()*6.2832;
    const sp=(o.spd!==undefined?o.spd:d.spd)*(0.35+Math.random()*0.95);
    p.type=d.t; p.x=x; p.y=y; p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp;
    if(k==='smoke') p.vy-=30+Math.random()*18;            // 烟上飘
    p.size=(o.size!==undefined?o.size:d.size)*(0.7+Math.random()*0.7);
    p.life=(o.life!==undefined?o.life:d.life)*(0.7+Math.random()*0.6);
    p.age=0; p.grav=o.grav!==undefined?o.grav:d.grav; p.drag=d.drag;
    p.color=cols[(Math.random()*cols.length)|0];
    p.rot=Math.random()*6.2832; p.vr=(Math.random()-0.5)*14;
  }
}

function ring(x,y,o){
  o=o||{}; const p=acquire();
  p.type=T_RING; p.x=x; p.y=y;
  p.r0=o.r0!==undefined?o.r0:6; p.r1=o.r1!==undefined?o.r1:72;
  p.life=o.life||0.42; p.age=0; p.color=o.color||C.fireHot; p.w=o.width||5;
}

function core(x,y,color,size,life){
  const p=acquire();
  p.type=T_CORE; p.x=x; p.y=y; p.size=size; p.life=life; p.age=0; p.color=color;
}

// 组合拳: 短白闪 + 双环(快/慢) + 火×n + 碎片×n + 烟×n + 中心光斑 (+少量火花)
function explosion(x,y,scale,o){
  scale=clamp(scale||1,0.5,3); o=o||{};
  const s=scale;
  if(!o.quiet) addShake(0.1+0.12*s);
  core(x,y,'#ffffff',14+12*s,0.07+0.03*s);                       // 短白闪
  core(x,y,o.glow||C.fireMid,18+18*s,0.20+0.08*s);               // 中心光斑
  ring(x,y,{r0:4*s,r1:50+30*s,life:0.26,color:o.ring||C.fireHot,width:5*s});    // 快环
  ring(x,y,{r0:4*s,r1:86+44*s,life:0.55,color:o.ring2||C.fireMid,width:3.2*s}); // 慢环
  burst(x,y,{kind:'fire'  ,n:Math.round(8+9*s),size:6+7*s,spd:60+120*s,colors:o.colors});
  burst(x,y,{kind:'debris',n:Math.round(5+4*s),size:2.6+2.6*s,spd:90+150*Math.min(s,1.7),colors:o.colors});
  burst(x,y,{kind:'smoke' ,n:Math.round(4+3*s),size:8+9*s,spd:26+30*s});
  burst(x,y,{kind:'spark' ,n:Math.round(5+6*s),size:2+1.2*s,spd:170+160*s});
}

// 锥形短命闪光 + 3-5 spark
function muzzle(x,y,ang,s){
  s=s||1;
  const p=acquire();
  p.type=T_MUZZLE; p.x=x; p.y=y; p.ang=ang; p.size=20*s;
  p.life=0.055+Math.random()*0.025; p.age=0; p.color='#fff2d8';
  burst(x,y,{kind:'spark',n:3+((Math.random()*3)|0),ang:ang,spread:0.75,
             spd:260+160*s,size:1.8,life:0.18});
}

// 引擎尾焰小拖影点（默认青 #35e0c8；降档时隔帧生成减拖影）
function trail(x,y,o){
  o=o||{};
  if(lowQ){ trailTick^=1; if(trailTick) return; }
  const p=acquire();
  p.type=T_TRAIL; p.x=x; p.y=y; p.size=o.size||2.6; p.life=o.life||0.26;
  p.age=0; p.color=o.color||C.player;
}

// 伤害数字: 军用等宽白字+深描边；crit 放大1.4×+#ffd050+额外震
function floatText(x,y,str,o){
  o=o||{}; const crit=!!o.crit;
  const p=acquire();
  p.type=T_TEXT; p.x=x; p.y=y; p.txt=''+str;
  p.size=(o.size||15)*(crit?1.4:1);
  p.color=o.color||(crit?C.crit:'#ffffff');
  p.vy=46+Math.random()*10; p.life=o.life||0.85; p.age=0;
  if(crit) addShake(0.13);
}

function flash(color,alpha,ms){
  flashRGB=rgbStr(color||'#ffffff');
  flashA=clamp(alpha===undefined?0.5:alpha,0,1);
  flashRate=flashA/Math.max(0.03,(ms||180)/1000);
}

function lowHp(v){ lowHpV=clamp(v||0,0,1); }

// ---------- 震屏: trauma 累积(clamp 0..1)，偏移=trauma²×12px+微旋转，指数衰减 ----------
function addShake(p){ if(p>0) trauma=Math.min(1,trauma+p); }
const _off={x:0,y:0,r:0};
function camOffset(){
  const t2=trauma*trauma;
  if(t2<0.0004){ _off.x=_off.y=_off.r=0; return _off; }
  const a=Math.random()*6.2832,m=t2*12;
  _off.x=Math.cos(a)*m; _off.y=Math.sin(a)*m;
  _off.r=(Math.random()*2-1)*t2*0.03;
  return _off;
}

// ---------- 自适应降档: >22ms 连续 30 帧 → 上限减半+减拖影；持续 6s 良好则恢复 ----------
function setLow(v){
  if(v){ capMul=0.5; lowQ=true; goodT=0; }
  else { capMul=1; lowQ=false; badN=0; }
}
function setQuality(q){
  autoQ=(q!=='high'&&q!=='low');
  setLow(q==='low');
}

function init(o){
  o=o||{};
  W=o.W||420; H=o.H||760;
  const d=o.dpr!==undefined?o.dpr:(typeof devicePixelRatio!=='undefined'?devicePixelRatio:1);
  DPR=clamp(d||1,1,2);                       // DPR<=2
  if(o.quality) setQuality(o.quality);
  stopAll();
}

function stopAll(){
  while(list.length) pool.push(list.pop());
  trauma=0; flashA=0; flashRate=0; lowHpV=0;
}

// ---------- 更新（dt 单位: 秒；document.hidden 直接返回不积累） ----------
function update(dt){
  if(typeof document!=='undefined'&&document.hidden) return;
  if(!(dt>0)) return;
  if(dt>0.05) dt=0.05;
  vigPhase+=dt;
  if(autoQ){
    if(dt>0.022){ badN++; if(badN>=30) setLow(true); }
    else { badN=0; if(lowQ){ goodT+=dt; if(goodT>6) setLow(false); } }
  }
  trauma*=Math.exp(-3.2*dt); if(trauma<0.002) trauma=0;
  if(flashA>0){ flashA-=flashRate*dt; if(flashA<0) flashA=0; }
  for(let i=list.length-1;i>=0;i--){
    const p=list[i]; p.age+=dt;
    if(p.age>=p.life){ pool.push(p); const last=list.pop(); if(i<list.length) list[i]=last; continue; }
    switch(p.type){
      case T_SPARK:{ const e=Math.exp(-p.drag*dt); p.vx*=e; p.vy=p.vy*e+p.grav*dt;
                     p.x+=p.vx*dt; p.y+=p.vy*dt; break; }
      case T_FIRE:{ const e=Math.exp(-p.drag*dt); p.vx*=e; p.vy=p.vy*e+p.grav*dt;
                    p.x+=p.vx*dt; p.y+=p.vy*dt; break; }
      case T_DEBRIS:{ p.vy+=p.grav*dt; const e=Math.exp(-p.drag*dt); p.vx*=e;
                      p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt; break; }
      case T_SMOKE:{ const e=Math.exp(-1.6*dt); p.vx*=e; p.x+=p.vx*dt; p.y+=p.vy*dt; break; }
      case T_TEXT:{ p.vy*=Math.exp(-2.3*dt); p.y-=p.vy*dt; break; }   // 上浮减速
      case T_STAR:{ p.rot+=p.vr*dt; break; }
    }
  }
}

// ---------- 绘制（save/restore 自理，零全局状态残留） ----------
function render(ctx,layer){
  if(!ctx) return;
  ctx.save();
  if(layer==='screen') drawScreen(ctx); else drawWorld(ctx);
  ctx.restore();
}

function drawWorld(ctx){
  let i,p; const n=list.length;
  // pass1: 普通混合 — 烟 / 碎片
  ctx.globalCompositeOperation='source-over';
  for(i=0;i<n;i++){ p=list[i];
    if(p.type===T_SMOKE) dSmoke(ctx,p);
    else if(p.type===T_DEBRIS) dDebris(ctx,p);
  }
  // pass2: 加色发光 — 火/火花/闪星/拖影/冲击环/炮口/光斑
  ctx.globalCompositeOperation='lighter';
  for(i=0;i<n;i++){ p=list[i];
    switch(p.type){
      case T_FIRE:   dFire(ctx,p); break;
      case T_SPARK:  dSpark(ctx,p); break;
      case T_STAR:   dStar(ctx,p); break;
      case T_TRAIL:  dTrail(ctx,p); break;
      case T_RING:   dRing(ctx,p); break;
      case T_MUZZLE: dMuzzle(ctx,p); break;
      case T_CORE:   dCore(ctx,p); break;
    }
  }
  // pass3: 伤害数字置于最上层
  ctx.globalCompositeOperation='source-over';
  for(i=0;i<n;i++) if(list[i].type===T_TEXT) dText(ctx,list[i]);
  ctx.globalAlpha=1;
}

function dSmoke(ctx,p){
  const t=p.age/p.life;
  const a=0.17*(1-t)*(t<0.18? t/0.18:1);
  const s=p.size*(1+1.7*t);
  ctx.globalAlpha=a;
  ctx.drawImage(smokeSpr(),p.x-s,p.y-s,s*2,s*2);
}
function dDebris(ctx,p){
  const t=p.age/p.life;
  ctx.globalAlpha=t>0.6?1-(t-0.6)/0.4:1;
  const s=p.size;
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
  ctx.fillStyle=p.color;
  ctx.beginPath(); ctx.moveTo(s,0); ctx.lineTo(-s*0.7,s*0.62); ctx.lineTo(-s*0.45,-s*0.7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function dFire(ctx,p){
  const t=p.age/p.life;
  const a=Math.pow(1-t,1.15)*0.95, s=p.size*(1+1.15*t);
  ctx.globalAlpha=a;
  ctx.drawImage(glow(p.color),p.x-s,p.y-s,s*2,s*2);
  if(t>0.3){                                   // 晚期叠暗红余烬
    const s2=s*0.8;
    ctx.globalAlpha=a*Math.min(1,(t-0.3)*2.2)*0.9;
    ctx.drawImage(glow(C.ember),p.x-s2,p.y-s2,s2*2,s2*2);
  }
}
function dSpark(ctx,p){
  const t=p.age/p.life, k=0.03;
  let dx=p.vx*k,dy=p.vy*k;
  const L=Math.sqrt(dx*dx+dy*dy),minL=2.2+p.size;
  if(L<minL){ const sc=L>0.001?minL/L:minL; dx*=sc; dy*=sc; }   // 低速也保线段长度
  ctx.globalAlpha=Math.pow(1-t,0.65);
  ctx.strokeStyle=p.color; ctx.lineCap='round';
  ctx.lineWidth=Math.max(1,p.size*(1-t*0.55));
  ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-dx,p.y-dy); ctx.stroke();
}
function dStar(ctx,p){
  const t=p.age/p.life, a=1-t, l=p.size*(1-0.45*t);
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
  const s=l*0.9;
  ctx.globalAlpha=a*0.5; ctx.drawImage(glow(p.color),-s,-s,s*2,s*2);
  ctx.globalAlpha=a; ctx.strokeStyle=p.color; ctx.lineCap='round'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(-l,0); ctx.lineTo(l,0); ctx.moveTo(0,-l); ctx.lineTo(0,l); ctx.stroke();
  const l2=l*0.42;
  ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-l2,-l2); ctx.lineTo(l2,l2); ctx.moveTo(-l2,l2); ctx.lineTo(l2,-l2); ctx.stroke();
  ctx.restore();
}
function dTrail(ctx,p){
  const t=p.age/p.life, s=p.size*(1-0.75*t)+0.4;
  ctx.globalAlpha=(1-t)*0.85;
  ctx.drawImage(glow(p.color),p.x-s,p.y-s,s*2,s*2);
}
function dRing(ctx,p){
  const t=p.age/p.life, e=1-Math.pow(1-t,3);
  const r=p.r0+(p.r1-p.r0)*e, w=Math.max(0.6,p.w*(1-t*0.72));   // 线宽随 life 变细
  const a=Math.pow(1-t,0.75), rgb=rgbStr(p.color);
  const gr=ctx.createRadialGradient(p.x,p.y,Math.max(0.1,r-w*1.8),p.x,p.y,r+w*1.8);
  gr.addColorStop(0,'rgba('+rgb+',0)');
  gr.addColorStop(0.5,'rgba('+rgb+','+(a*0.45).toFixed(3)+')');
  gr.addColorStop(1,'rgba('+rgb+',0)');
  ctx.globalAlpha=1; ctx.fillStyle=gr;
  ctx.beginPath(); ctx.arc(p.x,p.y,r+w*1.8,0,6.2832); ctx.fill();
  ctx.globalAlpha=a; ctx.strokeStyle='rgba('+rgb+',1)'; ctx.lineWidth=w;
  ctx.beginPath(); ctx.arc(p.x,p.y,r,0,6.2832); ctx.stroke();
}
function dMuzzle(ctx,p){
  const t=p.age/p.life, a=1-t, s=p.size*0.62;
  ctx.globalAlpha=a*0.85;
  ctx.drawImage(glow('#fff7e2'),p.x-s,p.y-s,s*2,s*2);
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.ang);
  const L=p.size*(1.3-0.5*t);
  const gr=ctx.createRadialGradient(0,0,0,0,0,L);
  gr.addColorStop(0,'rgba(255,255,255,'+(0.95*a).toFixed(3)+')');
  gr.addColorStop(0.45,'rgba(255,210,160,'+(0.6*a).toFixed(3)+')');
  gr.addColorStop(1,'rgba(255,150,70,0)');
  ctx.fillStyle=gr; ctx.globalAlpha=a;
  ctx.beginPath(); ctx.moveTo(0,0);
  ctx.quadraticCurveTo(L*0.45,-L*0.26,L,-L*0.12);
  ctx.lineTo(L*1.16,0);
  ctx.lineTo(L,L*0.12);
  ctx.quadraticCurveTo(L*0.45,L*0.26,0,0);
  ctx.fill();
  ctx.restore();
}
function dCore(ctx,p){
  const t=p.age/p.life;
  const a=Math.pow(1-t,1.3), s=p.size*(0.55+0.75*t);
  ctx.globalAlpha=a;
  ctx.drawImage(glow(p.color),p.x-s,p.y-s,s*2,s*2);
}
function dText(ctx,p){
  const t=p.age/p.life;
  ctx.globalAlpha=t<0.55?1:1-(t-0.55)/0.45;
  const sz=p.size;
  ctx.font='700 '+sz+'px Consolas,Menlo,"Courier New",monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
  ctx.lineWidth=Math.max(2,sz*0.14);                     // ~2px 深描边
  ctx.strokeStyle='rgba(7,11,15,0.9)';
  ctx.strokeText(p.txt,p.x,p.y);
  ctx.fillStyle=p.color;
  ctx.fillText(p.txt,p.x,p.y);
}

// screen 层: 全屏闪光淡出 + 低血红色晕影（在游戏 restore 之后调用）
function drawScreen(ctx){
  const cw=ctx.canvas.width,ch=ctx.canvas.height;
  ctx.globalCompositeOperation='source-over';
  if(flashA>0.002){
    ctx.globalAlpha=1;
    ctx.fillStyle='rgba('+flashRGB+','+flashA.toFixed(3)+')';
    ctx.fillRect(-2,-2,cw+4,ch+4);
  }
  if(lowHpV>0.004){
    const a=lowHpV*(0.30+0.10*Math.sin(vigPhase*5.5));
    const gr=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*0.36,cw/2,ch/2,Math.max(cw,ch)*0.72);
    gr.addColorStop(0,'rgba(255,70,48,0)');
    gr.addColorStop(1,'rgba(255,70,48,'+a.toFixed(3)+')');
    ctx.globalAlpha=1; ctx.fillStyle=gr;
    ctx.fillRect(-2,-2,cw+4,ch+4);
  }
  ctx.globalAlpha=1;
}

return {
  init,addShake,camOffset,
  burst,ring,explosion,muzzle,trail,floatText,flash,lowHp,
  update,render,stopAll,setQuality
};
})();
