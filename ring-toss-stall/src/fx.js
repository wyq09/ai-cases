/* ============================================================
 * 地摊套圈 · RT.FX — Canvas2D 粒子特效层（零依赖）
 * 夜市红金喜庆：confetti 红黄绿纸屑 / spark 金色小星 / coinBurst 金币翻转
 *               dust 落地灰尘 / flash 全屏闪光 / bigText DOM 金渐变大字 / popLabel 漂浮小字
 * 工程：对象池总量上限 600 / DPR≤2 / 禁 shadowBlur（发光=径向渐变+lighter 叠色）
 *       document.hidden 暂停恢复 / 空闲自动停 rAF / resize 同步
 * 注意：init 收到的 hostEl 的 width 属性可能是主线按 dpr 放大过的设备像素，
 *       故 CSS 尺寸优先取 clientWidth（同为宿主元素读取，语义即“CSS 尺寸”）。
 * ============================================================ */
window.RT=window.RT||{}; RT.FX=(()=>{
'use strict';

const POOL=600, TAU=Math.PI*2, R=Math.random;
const T_CONF=0, T_SPARK=1, T_COIN=2, T_DUST=3, T_LABEL=4;

/* 红黄绿纸屑色板（夜市喜庆，允许少量同族深浅变体） */
const CONF_COLS=['#ff4433','#ff2d20','#ffd23f','#ffc61a','#ffdf6b','#3fc24d','#2fae43','#7ed957'];
const DUST_COLS=['#ded7cc','#c9c2b8','#efe8dd'];

/* ---------- 状态 ---------- */
let host=null, ctx=null, cssW=320, cssH=240, dpr=1;
let raf=0, running=false, last=0;
let flashOn=false, flashCol='#fff6dd', flashA=0, flashT=0, flashDur=0.3;
const bigs=[];                       /* 存活中的 bigText DOM 节点 {el,anim} */

/* ---------- 对象池（总量上限 600，池满覆盖最旧） ---------- */
const P=new Array(POOL);
for(let i=0;i<POOL;i++){
  P[i]={on:false,t:0,life:1,ty:0,x:0,y:0,vx:0,vy:0,g:0,
    w:0,h:0,r:0,rot:0,vr:0,sway:0,swf:0,phase:0,flip:0,vf:0,tw:0,twf:0,
    col:'',text:'',size:0};
}
let cur=0;
function alloc(ty){
  for(let k=0;k<POOL;k++){
    const i=(cur+k)%POOL, p=P[i];
    if(!p.on){ cur=(i+1)%POOL; p.on=true; p.t=0; p.ty=ty; return p; }
  }
  const p=P[cur]; cur=(cur+1)%POOL; p.on=true; p.t=0; p.ty=ty; return p;
}

/* ---------- 小工具 ---------- */
function clampN(v,d,lo,hi){ v=+v; if(!isFinite(v))v=d; return v<lo?lo:(v>hi?hi:v); }
function rgba(hex,a){
  let h=String(hex||'#fff').replace('#','');
  if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n=parseInt(h,16);
  if(isNaN(n)||h.length!==6)return 'rgba(255,255,255,'+a+')';
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}
function shade(hex,amt){ /* amt∈[-1,1] 往黑/白调，用于金渐变端点 */
  let h=String(hex||'#ffd257').replace('#','');
  if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n=parseInt(h,16); if(isNaN(n))return hex;
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  if(amt>=0){ r+=(255-r)*amt; g+=(255-g)*amt; b+=(255-b)*amt; }
  else{ r*=1+amt; g*=1+amt; b*=1+amt; }
  return 'rgb('+(r|0)+','+(g|0)+','+(b|0)+')';
}

/* ---------- 尺寸（DPR≤2，内部像素 + setTransform） ---------- */
function applySize(){
  if(!host)return;
  host.width=Math.max(1,Math.round(cssW*dpr));
  host.height=Math.max(1,Math.round(cssH*dpr));
  if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
}

/* ---------- 主循环（空闲自动停；hidden 暂停） ---------- */
function kick(){
  if(!ctx||running)return;
  running=true; last=performance.now();
  raf=requestAnimationFrame(frame);
}
function frame(ts){
  raf=0;
  if(document.hidden){ running=false; return; }
  let dt=(ts-last)/1000; last=ts;
  if(dt>0.05)dt=0.05; if(dt<0)dt=0;
  const live=step(dt);
  draw();
  if(live>0){ raf=requestAnimationFrame(frame); }
  else{ running=false; ctx.clearRect(0,0,cssW,cssH); }
}
function onVis(){
  if(document.hidden){ if(raf){cancelAnimationFrame(raf);raf=0;} running=false; }
  else kick();
}

/* ---------- 物理 ---------- */
function step(dt){
  let live=0;
  for(let i=0;i<POOL;i++){
    const p=P[i]; if(!p.on)continue;
    p.t+=dt;
    if(p.t>=p.life){ p.on=false; continue; }
    switch(p.ty){
      case T_CONF:{ /* 重力 + 空气阻尼 + 左右摇摆 + 自旋/翻面 */
        p.vy+=p.g*dt; if(p.vy>520)p.vy=520;
        p.vx+=(0-p.vx)*Math.min(1,1.6*dt);
        p.x+=p.vx*dt+Math.sin(p.phase+p.t*p.swf)*p.sway*dt;
        p.y+=p.vy*dt;
        p.rot+=p.vr*dt; p.flip+=p.vf*dt;
        break; }
      case T_SPARK:{ /* 径向迸射 + 阻尼 + 微重力 */
        const d=Math.min(1,2.5*dt);
        p.vx-=p.vx*d; p.vy-=p.vy*d; p.vy+=p.g*dt;
        p.x+=p.vx*dt; p.y+=p.vy*dt;
        break; }
      case T_COIN:{ /* 抛物线 + scaleX 翻面 */
        p.vy+=p.g*dt;
        p.vx-=p.vx*Math.min(1,0.7*dt);
        p.x+=p.vx*dt; p.y+=p.vy*dt;
        p.flip+=p.vf*dt; p.rot+=p.vr*dt;
        break; }
      case T_DUST:{ /* 上飘 + 减速 + 微胀 */
        p.vx-=p.vx*Math.min(1,2.2*dt);
        p.vy-=p.vy*Math.min(1,2.0*dt);
        p.x+=p.vx*dt; p.y+=p.vy*dt; p.size+=6*dt;
        break; }
      case T_LABEL:{ /* 上浮渐缓 */
        p.vy+=34*dt;
        p.x+=p.vx*dt; p.y+=p.vy*dt;
        break; }
    }
    live++;
  }
  if(flashOn){ flashT+=dt; if(flashT>=flashDur)flashOn=false; else live++; }
  return live;
}

/* ---------- 绘制 ---------- */
function draw(){
  ctx.clearRect(0,0,cssW,cssH);
  for(let i=0;i<POOL;i++){
    const p=P[i]; if(!p.on)continue;
    if(p.ty===T_CONF)drawConf(p);
    else if(p.ty===T_COIN)drawCoin(p);
    else if(p.ty===T_DUST)drawDust(p);
    else if(p.ty===T_LABEL)drawLabel(p);
  }
  /* 发光粒子统一 lighter 叠色（禁 shadowBlur，径向渐变代替发光） */
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<POOL;i++){
    const p=P[i]; if(p.on&&p.ty===T_SPARK)drawSpark(p);
  }
  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;
  if(flashOn){
    const a=Math.max(0,flashA*(1-flashT/flashDur));
    ctx.globalAlpha=a; ctx.fillStyle=flashCol;
    ctx.fillRect(0,0,cssW,cssH); ctx.globalAlpha=1;
  }
}
function drawConf(p){
  const rem=p.life-p.t, a=rem<0.5?rem/0.5:1;
  const hs=0.3+0.7*Math.abs(Math.cos(p.flip));   /* 翻面时的纸片透视 */
  ctx.globalAlpha=a;
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.scale(1,hs);
  ctx.fillStyle=p.col; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
  ctx.fillStyle='rgba(0,0,0,.18)'; ctx.fillRect(-p.w/2,0,p.w,p.h/2); /* 暗半面=厚度 */
  ctx.restore();
}
function drawSpark(p){
  const a=1-p.t/p.life;
  const twk=0.55+0.45*Math.sin(p.tw+p.t*p.twf);  /* 闪烁 */
  const A=a*twk; if(A<=0.02)return;
  const r=p.size, gr=r*3.2;
  const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,gr); /* 光晕 */
  g.addColorStop(0,rgba(p.col,0.55*A));
  g.addColorStop(1,rgba(p.col,0));
  ctx.globalAlpha=1; ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(p.x,p.y,gr,0,TAU); ctx.fill();
  ctx.globalAlpha=A; ctx.fillStyle=p.col;        /* 四芒星本体 */
  const s=r*0.32;
  ctx.beginPath();
  ctx.moveTo(p.x,p.y-r); ctx.lineTo(p.x+s,p.y-s); ctx.lineTo(p.x+r,p.y);
  ctx.lineTo(p.x+s,p.y+s); ctx.lineTo(p.x,p.y+r); ctx.lineTo(p.x-s,p.y+s);
  ctx.lineTo(p.x-r,p.y); ctx.lineTo(p.x-s,p.y-s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='#fff';                          /* 白芯 */
  ctx.beginPath(); ctx.arc(p.x,p.y,r*0.32,0,TAU); ctx.fill();
}
function drawCoin(p){
  const rem=p.life-p.t, a=rem<0.3?rem/0.3:1;
  const ax=Math.max(Math.abs(Math.cos(p.flip)),0.14), r=p.r;
  ctx.globalAlpha=a;
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.scale(ax,1);
  const g=ctx.createRadialGradient(-r*0.35,-r*0.4,r*0.1,0,0,r);
  g.addColorStop(0,'#ffeeb0'); g.addColorStop(0.45,'#ffd257');
  g.addColorStop(0.8,'#f2a83a'); g.addColorStop(1,'#d98a1f');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
  ctx.lineWidth=Math.max(1.2,r*0.16); ctx.strokeStyle='#a06414';
  ctx.beginPath(); ctx.arc(0,0,r*0.86,0,TAU); ctx.stroke();
  if(ax>0.6){                                    /* 方孔铜钱芯 */
    ctx.fillStyle='rgba(150,90,14,.9)';
    const q=r*0.3; ctx.fillRect(-q/2,-q/2,q,q);
  }
  ctx.restore();
}
function drawDust(p){
  ctx.globalAlpha=(1-p.t/p.life)*0.85;
  ctx.fillStyle=p.col;
  ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,TAU); ctx.fill();
}
function drawLabel(p){
  const k=p.t/p.life;
  const s=p.t<0.12?0.55+0.45*(p.t/0.12):1;       /* 出现时小弹 */
  ctx.globalAlpha=1-k*k;
  ctx.font='900 '+Math.max(9,Math.round(p.size*s))+'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.lineWidth=4; ctx.lineJoin='round';
  ctx.strokeStyle='rgba(46,8,4,.92)';
  ctx.strokeText(p.text,p.x,p.y);
  ctx.fillStyle=p.col;
  ctx.fillText(p.text,p.x,p.y);
}

/* ============================================================
 * 对外接口
 * ============================================================ */

/* 纸屑：带 opt{x,y} 从点位向上扇形迸发；不带则从顶部全宽撒落 */
function confetti(n,opt){
  if(!ctx)return;
  opt=opt||{};
  n=clampN(n,42,1,240)|0;
  const hasX=typeof opt.x==='number';
  const cx=hasX?opt.x:cssW/2;
  const cy=typeof opt.y==='number'?opt.y:(hasX?cssH*0.35:-30);
  const spread=typeof opt.spread==='number'?opt.spread:(hasX?1.9:0);
  for(let i=0;i<n;i++){
    const p=alloc(T_CONF);
    p.col=CONF_COLS[(R()*CONF_COLS.length)|0];
    p.w=7+R()*7; p.h=4.5+R()*4.5;
    p.rot=R()*TAU; p.vr=(R()-0.5)*11;
    p.flip=R()*TAU; p.vf=4+R()*7;
    p.sway=16+R()*26; p.swf=1.4+R()*2.6; p.phase=R()*TAU;
    p.life=2.1+R()*1.0;
    if(hasX){
      const ang=-Math.PI/2+(R()-0.5)*spread, sp=180+R()*330;
      p.x=cx+(R()-0.5)*14; p.y=cy+(R()-0.5)*10;
      p.vx=Math.cos(ang)*sp; p.vy=Math.sin(ang)*sp;
      p.g=560+R()*240;
    }else{ /* 顶部撒落 */
      p.x=R()*cssW; p.y=-20-R()*cssH*0.25;
      p.vx=(R()-0.5)*70; p.vy=70+R()*140;
      p.g=300+R()*160; p.life+=0.4;
    }
  }
  kick();
}

/* 金色小星：径向迸射 + 闪烁光晕（lighter） */
function spark(x,y,color,n){
  if(!ctx)return;
  n=clampN(n,14,1,120)|0;
  const col=color||'#ffd257';
  for(let i=0;i<n;i++){
    const p=alloc(T_SPARK);
    const ang=R()*TAU, sp=70+R()*330;
    p.x=x; p.y=y;
    p.vx=Math.cos(ang)*sp; p.vy=Math.sin(ang)*sp-60;
    p.g=150; p.size=3+R()*4;
    p.life=0.6+R()*0.5; p.tw=R()*TAU; p.twf=7+R()*9;
    p.col=col;
  }
  kick();
}

/* 金币：向上抛 + scaleX 翻面（方孔铜钱） */
function coinBurst(x,y,n){
  if(!ctx)return;
  n=clampN(n,9,1,60)|0;
  for(let i=0;i<n;i++){
    const p=alloc(T_COIN);
    const ang=-Math.PI/2+(R()-0.5)*1.2, sp=230+R()*300;
    p.x=x; p.y=y;
    p.vx=Math.cos(ang)*sp; p.vy=Math.sin(ang)*sp;
    p.g=780; p.r=7+R()*5.5;
    p.rot=(R()-0.5)*0.35; p.vr=(R()-0.5)*1.6;
    p.flip=R()*TAU; p.vf=6.5+R()*7;
    p.life=1.25+R()*0.4;
  }
  kick();
}

/* 落地灰白小尘：快速淡出上飘 */
function dust(x,y,n){
  if(!ctx)return;
  n=clampN(n,10,1,80)|0;
  for(let i=0;i<n;i++){
    const p=alloc(T_DUST);
    p.x=x+(R()-0.5)*26; p.y=y+(R()-0.5)*10;
    p.vx=(R()-0.5)*80; p.vy=-(18+R()*60);
    p.size=1.8+R()*3; p.life=0.4+R()*0.45;
    p.col=DUST_COLS[(R()*DUST_COLS.length)|0];
  }
  kick();
}

/* 全屏闪光：color 一闪而过 */
function flash(color,alpha){
  if(!ctx)return;
  flashOn=true;
  flashCol=color||'#fff6dd';
  flashA=clampN(alpha,0.45,0,1);
  flashT=0; flashDur=0.3;
  kick();
}

/* 大字：DOM 金渐变 + 深描边 + WAAPI 弹入→停留→淡出→自毁 */
function bigText(text,opt){
  opt=opt||{};
  const parent=host?(host.parentNode||document.body):document.body;
  if(!parent)return;
  const txt=String(text==null?'':text);
  const sc=clampN(opt.scale,1,0.3,3);
  const fs=Math.max(30,Math.min(110,Math.round(Math.min(cssW,cssH)*0.115*sc)));
  const base=opt.color||'#ffd257';
  const el=document.createElement('div');
  el.style.cssText='position:absolute;left:50%;top:38%;z-index:7;pointer-events:none;'
    +'max-width:92%;transform:translate(-50%,-50%);text-align:center;white-space:nowrap;'
    +'font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-weight:900;';
  const line=document.createElement('div');
  line.style.cssText='position:relative;display:inline-block;line-height:1.12;letter-spacing:2px;'
    +'font-size:'+fs+'px;'
    +'filter:drop-shadow(0 3px 0 rgba(58,10,4,.95)) drop-shadow(0 9px 16px rgba(0,0,0,.55));';
  const st=document.createElement('span');        /* 深描边层（垫底） */
  st.textContent=txt;
  st.style.cssText='position:absolute;left:0;top:0;width:100%;color:#4a0f08;'
    +'-webkit-text-stroke:'+(fs*0.13).toFixed(1)+'px #4a0f08;';
  const fl=document.createElement('span');        /* 金渐变填充层 */
  fl.textContent=txt;
  fl.style.cssText='position:relative;background:linear-gradient(180deg,'
    +shade(base,0.55)+' 0%,'+base+' 42%,'+shade(base,-0.28)+' 78%,'+shade(base,-0.45)+' 100%);'
    +'-webkit-background-clip:text;background-clip:text;color:transparent;';
  line.appendChild(st); line.appendChild(fl);
  el.appendChild(line);
  if(opt.sub){
    const sb=document.createElement('div');
    sb.textContent=String(opt.sub);
    sb.style.cssText='font-size:'+Math.round(fs*0.32)+'px;color:#ffe9b8;font-weight:800;'
      +'letter-spacing:'+(fs*0.06).toFixed(1)+'px;margin-top:'+Math.round(fs*0.08)+'px;'
      +'text-shadow:0 2px 0 #4a0f08,0 4px 10px rgba(0,0,0,.6);';
    el.appendChild(sb);
  }
  parent.appendChild(el);
  const rec={el,anim:null};
  bigs.push(rec);
  const done=()=>{
    const i=bigs.indexOf(rec); if(i>=0)bigs.splice(i,1);
    if(el.parentNode)el.parentNode.removeChild(el);
  };
  if(el.animate){
    rec.anim=el.animate([
      {opacity:0,transform:'translate(-50%,-50%) scale(.22)'},
      {opacity:1,transform:'translate(-50%,-50%) scale(1.16)',offset:0.16,easing:'cubic-bezier(.18,1.5,.4,1)'},
      {transform:'translate(-50%,-50%) scale(1)',offset:0.3,easing:'ease-out'},
      {opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:0.7},
      {opacity:0,transform:'translate(-50%,-44%) scale(1.06)'}
    ],{duration:1750,fill:'forwards'});
    rec.anim.onfinish=done;
    rec.anim.oncancel=done;
  }else{
    setTimeout(done,1750);
  }
}

/* 漂浮小字：canvas 绘制，上浮淡出（坐标由调用方从世界坐标换算后传入） */
function popLabel(x,y,text,color){
  if(!ctx)return;
  const p=alloc(T_LABEL);
  p.x=x; p.y=y; p.vx=0; p.vy=-64;
  p.life=1.05; p.size=17;
  p.col=color||'#ffd257';
  p.text=String(text==null?'':text);
  kick();
}

/* 全停：清粒子/闪光/大字 DOM */
function stopAll(){
  for(let i=0;i<POOL;i++)P[i].on=false;
  flashOn=false;
  while(bigs.length){
    const b=bigs.pop();
    if(b.anim&&b.anim.cancel)b.anim.cancel();
    if(b.el&&b.el.parentNode)b.el.parentNode.removeChild(b.el);
  }
  if(ctx)ctx.clearRect(0,0,cssW,cssH);
}

/* ---------- 初始化 / 同步 ---------- */
function init(hostEl){
  if(!hostEl)return;
  host=hostEl;
  ctx=hostEl.getContext('2d');
  dpr=Math.min(2,window.devicePixelRatio||1);
  /* width 属性可能是主线放大过的设备像素，clientWidth 才是 CSS 尺寸 */
  cssW=hostEl.clientWidth||hostEl.width||320;
  cssH=hostEl.clientHeight||hostEl.height||240;
  applySize();
  document.addEventListener('visibilitychange',onVis);
}
function resize(w,h){
  cssW=Math.max(1,+w||cssW);
  cssH=Math.max(1,+h||cssH);
  applySize();
}

return { init, resize, confetti, spark, coinBurst, dust, flash, bigText, popLabel, stopAll };
})();
