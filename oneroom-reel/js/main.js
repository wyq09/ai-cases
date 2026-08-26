/* ═══════════════════════════════════════════════════════════════
   ONEROOM Motion Reel · 网页复刻引擎
   原始动效 © @studio_oneroom —— 本文件为从零实现的代码复刻练习
   架构：audio.currentTime 主时钟（音画同步）→ 纯函数式逐帧渲染
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────── 工具 ───────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp   = (v,a,b)=> v<a?a : v>b?b : v;
const lerp    = (a,b,k)=> a+(b-a)*k;
const norm    = (v,a,b)=> clamp((v-a)/(b-a||1e-6),0,1);
/* 可复现随机数（保证每轮循环几何一致） */
function mulberry32(seed){ let a=seed>>>0; return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;} }
const R  = mulberry32(20240926);
const rr = (rng=R,a=1,b)=> b===undefined ? rng()*a : a+rng()*(b-a);

const Ease = {
  outExpo : k => k===1?1:1-Math.pow(2,-10*k),
  outCubic: k => 1-Math.pow(1-k,3),
  inCubic : k => k*k*k,
  inQuad  : k => k*k,
  inOutCubic: k => k<.5 ? 4*k*k*k : 1-Math.pow(-2*k+2,3)/2,
  outBack : k => { const c=1.70158*1.24; return 1+(c+1)*Math.pow(k-1,3)+c*Math.pow(k-1,2); },
  outQuart: k => 1-Math.pow(1-k,4),
};

const CREAM='#f1efe6', PAPER='#e5e4dd', INK='#161616', ORANGE='#e84a08';

/* ───────────────────── 全局尺寸状态 ───────────────────── */
const view = { w:innerWidth, h:innerHeight, dpr:Math.min(devicePixelRatio||1,2) };
addEventListener('resize', ()=>{ view.w=innerWidth; view.h=innerHeight; layoutAll(); });

function fitCanvas(cv){
  const d=view.dpr;
  cv.width=Math.round(view.w*d); cv.height=Math.round(view.h*d);
  const ctx=cv.getContext('2d');
  ctx.setTransform(d,0,0,d,0,0);
  return ctx;
}

/* ═══════════════════ 主时钟（音频驱动） ═══════════════════ */
const DUR = 15.168;
const audio = $('#reelAudio');
let started=false;            // 是否已真正起播
let fallbackClockT0=0;        // 无声预览用的内部钟

/* 调试：?freeze=2.4 把时钟钉在 2.4s，用于逐场景截图验证 */
const FREEZE = (()=>{ const v=new URLSearchParams(location.search).get('freeze'); return v==null?null:Math.max(0,Math.min(DUR-.001,parseFloat(v))); })();

function getClock(){
  if(FREEZE!=null) return FREEZE;
  if(started && audio && !audio.paused) return audio.currentTime % DUR;
  return (performance.now()/1000 - fallbackClockT0) % DUR;
}

/* ═══════════════════ 全局图层：水印墙 ═══════════════════ */
const wmLayer=$('#watermark');
(function buildWatermark(){
  const offs=[-7,13,35,57,79];
  offs.forEach((top,i)=>{
    const el=document.createElement('div');
    el.className='wm-row';
    el.textContent='ONEROOM'.repeat(3);
    el.style.top=top+'%';
    el.dataset.dir=i%2?'1':'-1';
    wmLayer.appendChild(el);
  });
})();
function updWatermark(t){
  for(const el of wmLayer.children){
    const dir=+el.dataset.dir;
    const x=Math.sin(t*.13*dir + el.offsetTop)* .6;      /* 微幅横漂 */
    const y=(t*dir*7)%40;                                 /* 缓慢纵漂 */
    el.style.transform=`translate(${x}vw, ${y}px)`;
  }
}

/* ═══════════════════ 全局图层：条形码 ═══════════════════ */
const bcLayer=$('#barcodes');
/* 真实感条码贴图：按显示尺寸×dpr 生成，避免缩放糊成色块 */
function barcodeURL(rng,W,H){
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='#fff';
  let x=6;
  while(x<W-8){
    const seg=W*rr(rng,.14,.3);
    const sliceN=4;
    for(let s=0;s<sliceN;s++){                 /* 每段横向切成条并错位 */
      const sh=H/sliceN, oy=s*sh, dx=rr(rng,-2.5,2.5);
      let cx=x+dx; const end=x+seg;
      while(cx<end){
        const bw=rr(rng,.9,3.6);
        g.fillRect(cx,oy+.5,bw,sh-rr(rng,.5,1.6)); cx+=bw+rr(rng,1.8,6.5);
      }
    }
    x+=seg+rr(rng,10,30);
  }
  return c.toDataURL('image/png');
}
function rulerURL(rng,W,H){
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');g.fillStyle='#fff';let x=4,i=0;
  while(x<W){ const hh=(i%4===0)?H:H*.45; g.fillRect(x,H-hh,1.2,hh); x+=rr(rng,5,8); i++; }
  return c.toDataURL('image/png');
}
const BC_SPOTS=[           /* 与原片近似的散布位（vw,vh,w,h,opacity） */
  {x:-2,y:20,w:26,h:9,o:.95},{x:-2,y:41,w:16,h:9,o:.85},
  {x:12,y:72,w:17,h:8,o:.75},{x:96,y:47,w:22,h:9,o:.95},
  {x:82,y:28,w:18,h:9,o:.85},{x:40,y:88,w:14,h:7,o:.6},
  {x:63,y:3 ,w:20,h:8,o:.8},
];
function buildBarcodes(){
  bcLayer.innerHTML='';
  const dpr=view.dpr, vwx=view.w/100, vhx=view.h/100;
  BC_SPOTS.forEach(s=>{
    const d=document.createElement('div');d.className='bc';
    d.style.setProperty('--h',s.h); d.style.setProperty('--w',s.w);
    d.style.setProperty('--o',s.o);
    d.style.left=s.x+'vw'; d.style.top=s.y+'vh';
    const i=document.createElement('i');
    i.style.backgroundImage=`url(${barcodeURL(R,Math.round(s.w*vwx*dpr),Math.round(s.h*vhx*dpr))})`;
    i.style.backgroundSize='100% 100%';
    d.appendChild(i); d._base={x:s.x,y:s.y};
    bcLayer.appendChild(d);
  });
  /* 两把刻度尺 */
  [[26,57],[71,12]].forEach(([x,y])=>{
    const d=document.createElement('div');d.className='bc';
    d.style.cssText=`--h:${3};--w:${16};--o:${.5}`;
    d.style.left=x+'vw'; d.style.top=y+'vh';
    const i=document.createElement('i');
    i.style.backgroundImage=`url(${rulerURL(R,Math.round(16*vwx*dpr),Math.round(3*vhx*dpr))})`;
    i.style.backgroundSize='100% 100%';
    d.appendChild(i); d._base={x,y}; bcLayer.appendChild(d);
  });
}
buildBarcodes();

let glitchUntil=0, glitchIdx=-1;
function updBarcodes(t,now){
  /* 周期性挑一条做横向毛刺位移 */
  if(now>glitchUntil){
    const hop=(t*1.31)%1;
    if(hop<.06){ glitchIdx=(Math.random()*bcLayer.children.length)|0; glitchUntil=now+.09; }
    else glitchIdx=-1;
  }
  let n=0;
  for(const d of bcLayer.children){
    if(!d._base)continue;
    const bx=d._base.x, by=d._base.y;
    const jx = Math.sin(t*7+n*2.7)*.06;
    const gx = (n===glitchIdx)? rr(Math.random,-22,22):0;
    d.style.transform=`translate3d(calc(${bx}vw + ${(jx+gx).toFixed(2)}px), ${by}vh, 0)`;
    n++;
  }
}

/* ═══════════════════ 线状粒子系统（刮痕/速度线） ═══════════════════ */
class LineFX{
  constructor(cv){ this.cv=cv; this.ctx=fitCanvas(cv); this.ps=[]; this.mode=null; }
  /* 每帧按密度生成；density = 每秒期望条数 */
  emit(mode,t,dt){
    const push=n=>{for(let i=0;i<n;i++)this.ps.push(mode==='scratch'?this.mkScratch():this.mkWarp());};
    if(mode==='scratch')   push(Math.round(dt*80));   /* S1 多向长刮痕 */
    else if(mode==='warp') push(Math.round(dt*330));  /* S8 过灭点速度线 */
  }
  mkScratch(){
    return {m:'s',
      x:rr(Math.random,-60,view.w+60), y:rr(Math.random,-40,view.h+40),
      ang:rr(Math.random,0,Math.PI)+(Math.random()<.5?0:Math.PI/2)+rr(Math.random,-.25,.25),
      sp:rr(Math.random,1900,2900), len:rr(Math.random,160,430), life:1,
      decay:rr(Math.random,1.6,2.6), wd:rr(Math.random,.8,2)};
  }
  mkWarp(){
    return {m:'w',vp:{x:view.w/2,y:view.h*.5},
      b:rr(Math.random,-view.h*.75,view.h*.75),          /* 直线截距 → 网格感 */
      k:rr(Math.random,-1.15,1.15),                      /* 斜率方向 */
      sp:(Math.random()<.5?-1:1)*rr(Math.random,1500,2600),
      len:rr(Math.random,650,1450), life:1, decay:rr(Math.random,.8,1.5),
      wd:rr(Math.random,1.1,2.6)};
  }
  update(dt){
    const g=this.ctx; g.clearRect(0,0,view.w,view.h);
    g.lineCap='round'; g.globalCompositeOperation='screen';
    for(let i=this.ps.length-1;i>=0;i--){
      const p=this.ps[i]; p.life-=p.decay*dt;
      if(p.life<=0){ this.ps.splice(i,1); continue; }
      let vx,vy,x=p.x,y=p.y;
      if(p.m==='s'){ vx=Math.cos(p.ang)*p.sp; vy=Math.sin(p.ang)*p.sp; }
      else{ const L=Math.hypot(1,p.k); vx=(1/L)*p.sp; vy=(p.k/L)*p.sp; x=view.w/2; y=p.vp.y+p.b; p.x=x;p.y=y; }
      p.x+=vx*dt; p.y+=vy*dt;
      const vl=Math.hypot(vx,vy)||1;
      const tx=x-vx/vl*p.len*Math.max(p.life,.35), ty=y-vy/vl*p.len*Math.max(p.life,.35);
      g.strokeStyle=`rgba(241,239,230,${(.72*p.life).toFixed(3)})`;
      g.lineWidth=p.wd;
      g.beginPath(); g.moveTo(tx,ty); g.lineTo(x+vx/vl*p.len*.4, y+vy/vl*p.len*.4); g.stroke();
    }
  }
  setMode(m,t,dt){ this.mode=m; if(m&&dt>0)this.emit(m,t,dt); this.update(dt); }
}

/* ═══════════════════ 漩涡粒子系统 ═══════════════════ */
class Vortex{
  constructor(cv,N=250){
    this.cv=cv; this.ctx=fitCanvas(cv);
    this.buf=document.createElement('canvas'); fitInto(this.buf);
    this.bctx=this.buf.getContext('2d');
    this.N=N; this.reset();
    function fitInto(c){ c.width=cv.width;c.height=cv.height; }
  }
  reset(){
    const g=this.bctx,d=view.dpr;
    g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,this.buf.width,this.buf.height); g.setTransform(d,0,0,d,0,0);
    this.ps=[];
    for(let i=0;i<this.N;i++)this.ps.push(this.spawn(true));
  }
  spawn(init){
    return { th:rr(Math.random,0,Math.PI*2),
             r: init? Math.pow(rr(Math.random,0,1),.6):1,
             sp:rr(Math.random,.85,1.25), size:rr(Math.random,.6,1.6),
             px:null, py:null };
  }
  resize(){ fitCanvas(this.cv); const c=this.buf; c.width=this.cv.width;c.height=this.cv.height; this.reset(); }
  update(cx,cy,rMax,intensity,rot){
    if(intensity<=0)return;
    const b=this.bctx, d=view.dpr;
    b.setTransform(1,0,0,1,0,0);
    b.globalCompositeOperation='destination-out';
    b.fillStyle='rgba(0,0,0,.13)';
    b.fillRect(0,0,this.buf.width,this.buf.height);
    b.setTransform(d,0,0,d,0,0);
    b.globalCompositeOperation='source-over';
    const squash=.94, dt=1/60, SUB=2, h=dt/SUB;      /* 细分子步：更连贯的螺旋弧线 */
    for(const p of this.ps){
      for(let k=0;k<SUB;k++){
        const rn=p.r*rMax, om=(.8/(rn/rMax+.14))*p.sp;
        p.th+=om*h; p.r-=h*(.12+p.r*.2)*p.sp*(0.5+intensity);
        if(p.r<=.03){ Object.assign(p,this.spawn(false)); break; }
        const a=p.th+rot, nx=cx+Math.cos(a)*rn, ny=cy+Math.sin(a)*rn*squash;
        if(p.px!==null){
          b.strokeStyle=`rgba(255,255,255,${(.3+p.size*.14).toFixed(2)})`;
          b.lineWidth=p.size*.6;
          b.beginPath(); b.moveTo(p.px,p.py); b.lineTo(nx,ny); b.stroke();
        }
        p.px=nx; p.py=ny;
      }
    }
    const g=this.ctx; g.clearRect(0,0,view.w,view.h);
    g.save(); g.globalAlpha=intensity;
    g.drawImage(this.buf,0,0,view.w,view.h); g.restore();
  }
}

/* ═══════════════════ 碎裂 shard 系统 ═══════════════════ */
const Shards={
  gen(){
    const rng=mulberry32(77); this.list=[]; const A=Math.max(view.w/view.h,1);
    const sectors=17, arcs=[];
    for(let i=0;i<sectors;i++)arcs.push(i/sectors*Math.PI*2+rr(rng,-.06,.06));
    for(let s=0;s<sectors;s++){
      const a0=arcs[s], a1=arcs[(s+1)%sectors]+(s===sectors-1?Math.PI*2:0);
      const rings=2+((rng()*3)|0); let rPrev=0;
      const bounds=[0]; for(let k=1;k<=rings;k++)bounds.push(Math.pow(k/rings,1.22)*(1+rr(rng,-.1,.1)));
      for(let k=0;k<rings;k++){
        const r0=bounds[k]*1.06, r1=bounds[k+1];
        if(r1<=r0+.02)continue;
        const mid=(k/rings);
        /* 四边形一分为二 */
        const tri=(p,q,rc)=>{
          const cen={x:(p.x+q.x+rc.x)/3,y:(p.y+q.y+rc.y)/3};
          const w=rng(); const fill= w<.5?ORANGE : w<.76?PAPER : INK;
          this.list.push({pts:[p,q,rc],cen,fill,
            dir:{x:cen.x/(Math.hypot(cen.x,cen.y)||1),y:cen.y/(Math.hypot(cen.x,cen.y)||1)},
            nd:clamp(Math.hypot(cen.x/A,cen.y),0,1),
            delay:clamp(Math.hypot(cen.x/A,cen.y),0,1)*.10+rr(rng,0,.03),
            dur:rr(rng,.5,.95), rot:(rng()<.5?-1:1)*rr(rng,50,175),
            travel:rr(rng,.75,1.65), stay:false});
        };
        const rc={x:Math.cos((a0+a1)/2)*(r0+r1)/2*A, y:Math.sin((a0+a1)/2)*(r0+r1)/2};
        const p0={x:Math.cos(a0)*r0*A,y:Math.sin(a0)*r0}, p1={x:Math.cos(a1)*r0*A,y:Math.sin(a1)*r0};
        const p2={x:Math.cos(a1)*r1*A,y:Math.sin(a1)*r1}, p3={x:Math.cos(a0)*r1*A,y:Math.sin(a0)*r1};
        tri(p0,p1,rc); tri(p1,p2,rc); tri(p2,p3,rc); tri(p0,rc,p3);
        rPrev=r1;
      }
    }
    /* 少量远端碎片保留漂移，衔接黑场场景 */
    for(const s of this.list) if(s.nd>.62 && Math.random()<.16){s.stay=true;s.delay=0;s.travel=rr(Math.random,.18,.4);}
  },
  draw(g,tLocal,burstAt){
    if(!burstAt)return;
    const bt=tLocal-burstAt; if(bt<0)return;
    const cx=view.w/2, cy=view.h/2, MAX=Math.max(view.w,view.h);
    g.clearRect(0,0,view.w,view.h);
    for(const s of this.list){
      const k=norm(bt,s.delay,s.delay+s.dur);
      let ox=0,oy=0,rot=0,al=1;
      if(s.stay){                                  /* 慢速滞留碎屑 */
        const kk=norm(bt,s.delay+.35,s.delay+1.55);
        ox=s.dir.x*kk*MAX*.28; oy=s.dir.y*kk*MAX*.28+kk*MAX*.1; rot=s.rot*Ease.inQuad(kk)*.4; al=1-kk;
      }else{
        const e=Ease.inQuad(k);
        const dist=e*e*Math.pow(s.travel,1.05)*MAX*1.35+ e*MAX*.12;
        ox=s.dir.x*dist; oy=s.dir.y*dist; rot=s.rot*e;
        al= k>.72 ? 1-norm(k,.72,1) : 1;
      }
      if(al<=0)continue;
      g.save();
      g.translate(cx+s.cen.x*view.w+ox, cy+s.cen.y*view.h+oy);
      g.rotate(rot*Math.PI/180);
      g.globalAlpha=al;
      g.beginPath();
      const pts=s.pts.map(p=>[p.x*view.w-s.cen.x*view.w, p.y*view.h-s.cen.y*view.h]);
      g.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);
      g.closePath();
      g.fillStyle=s.fill; g.fill();
      g.lineWidth=2.6; g.strokeStyle=CREAM; g.stroke();
      g.restore();
    }
  }
};

/* ═══════════════════ 场景表 ═══════════════════ */
const SCENES=[
  {id:'sc-intro'     ,start:0.00 ,end:0.30},
  {id:'sc-disc'      ,start:0.30 ,end:1.08},
  {id:'sc-minim'     ,start:1.08 ,end:1.72},
  {id:'sc-lockup'    ,start:1.72 ,end:4.55},
  {id:'sc-bars'      ,start:4.55 ,end:4.85},
  {id:'sc-motion'    ,start:4.85 ,end:5.90},
  {id:'sc-motion-one',start:5.90 ,end:6.52},
  {id:'sc-gfx'       ,start:6.52 ,end:7.72},
  {id:'sc-tags'      ,start:7.72 ,end:9.44},
  {id:'sc-jp'        ,start:9.44 ,end:10.32},
  {id:'sc-shatter'   ,start:10.32,end:11.16},
  {id:'sc-hero'      ,start:11.00,end:12.60},
  {id:'sc-end'       ,start:12.60,end:DUR+0.001},
].map(s=>({...s,el:$('#'+s.id),cur:false}));

const paletteOf=id=>({
  'sc-intro':'dark','sc-disc':'dark','sc-minim':'dark','sc-lockup':'light',
  'sc-bars':'light','sc-motion':'light','sc-motion-one':'light','sc-gfx':'dark',
  'sc-tags':'light','sc-jp':'light','sc-shatter':'orange','sc-hero':'dark','sc-end':'light'
})[id];

/* 剪切白闪（模拟剪辑帧） */
const FLASHES=[
  {at:1.72,d:.085,c:'#f1efe6'},{at:4.55,d:.06,c:'#f1efe6'},{at:4.85,d:.05,c:'#f1efe6'},
  {at:5.90,d:.05,c:'#f1efe6'},{at:6.52,d:.07,c:'#f1efe6'},{at:7.72,d:.05,c:'#e84a08'},
  {at:9.44,d:.06,c:'#f1efe6'},{at:10.32,d:.05,c:'#f1efe6'},
  {at:10.56,d:.075,c:'#ffffff'},{at:12.60,d:.07,c:'#f1efe6'},
];
const flashEl=$('#flash');
function updFlash(t){
  let a=0,col='';
  for(const f of FLASHES){ if(t<f.at)continue; const k=1-norm(t,f.at,f.at+f.d); if(k>a){a=k;col=f.c;} }
  flashEl.style.opacity=a.toFixed(3);
  flashEl.style.background=col||'#000';
}

/* ═══════════════════ 各场景渲染器 ═══════════════════ */
const rnd2=()=>Math.random()*2-1;

/* —— S2/S3 漩涡（共用参数化实例）—— */
const vortexA=new Vortex($('#cvVortexA'),270);
const vortexB=new Vortex($('#cvVortexB'),190);

function renderDisc(lt){
  /* lt ∈ [0, end-start]；圆盘最大 0.42×(230vmax)，四角留出暗边（贴近原片构图） */
  const grow=Ease.outCubic(norm(lt,0,.26));
  const s=grow*.42;
  $('#bigDisc').style.transform=`scale(${s.toFixed(4)})`;
  const inten=Ease.inQuad(norm(lt,.05,.45));
  vortexA.update(view.w/2, view.h*.475, Math.min(view.w,view.h)*.30, inten, lt*1.15);
  const dot=$('#vortexDot');
  const dk=norm(lt,.62,.95);
  dot.style.opacity=dk>0?(.55+.45*dk):0;
  dot.style.transform=`translate(-50%,-50%) scale(${(0.4+dk*1.1).toFixed(2)})`;
}
function renderMinim(lt){
  const letters=$$('#minimType .gl');
  const times=[.02,.10,.19,.29,.40];
  letters.forEach((el,i)=>{ const k=Ease.outBack(norm(lt,times[i],times[i]+.13));
    el.style.opacity=k; el.style.transform=`translateY(${(1-k)*14}%)`; });
  const wrap=$('#minimType').parentElement.getBoundingClientRect();
  const lastR=letters[4]?letters[letters.length-1].getBoundingClientRect():wrap;
  const cx=Math.min(lastR.right+Math.min(view.w*.07,90), view.w*.7);
  const cy=lastR.top+lastR.height*.44;
  vortexB.update(cx,cy,Math.min(view.w,view.h)*.105,norm(lt,.12,.5),lt*2.1);
  const d=$('#vortexDotSm');
  d.style.opacity=norm(lt,.3,.55);
  d.style.transform=`translate(-50%,-50%) scale(${(.5+norm(lt,.3,.6)).toFixed(2)})`;
}

/* —— S4 字标 —— */
let lockGlitch={next:2.06,on:false};
function renderLockup(lt){
  const ZOOM_AT=1.56;                       /* 相对场内时刻（4.55-1.72=2.83 → 留 1.27s 放大） */
  const zk=norm(lt,ZOOM_AT,ZOOM_AT+1.25);
  const wrap=$('#lockup');
  if(zk<=0){
    /* 入场弹入 */
    const ek=Ease.outBack(norm(lt,.02,.16));
    wrap.style.transformOrigin='36% 58%';
    /* 毛刺抖动 */
    if(lt>lockGlitch.next){ lockGlitch.on=!lockGlitch.on; lockGlitch.next=lt+ (lockGlitch.on? .07 : rr(Math.random,.22,.5)); }
    const jx=lockGlitch.on?rnd2()*6:0, jy=lockGlitch.on?rnd2()*3:0;
    wrap.style.transform=`translate(-52%,-50%) scale(${lerp(.93,1,ek).toFixed(4)}) translate(${jx}px,${jy}px)`;
  }else{
    const e=Ease.inCubic(zk);
    const sc=1+e*e*4.1;
    wrap.style.transformOrigin='30% 62%';
    wrap.style.transform=`translate(-52%,-50%) scale(${sc.toFixed(3)}) rotate(${(-zk*1.6).toFixed(2)}deg)`;
  }
}

/* —— S5 竖条 —— */
(function buildBars(){
  const cols=[{x:13,w:8,c:INK},{x:24,w:15,c:PAPER},{x:47,w:21,c:INK},{x:50.5,w:16,c:ORANGE},{x:73,w:9,c:INK}];
  const box=$('#barsWipe');
  cols.forEach(c=>{ const d=document.createElement('div');d.className='bar-col';
    d.style.cssText=`left:${c.x}%;width:${c.w}%;background:${c.c}`;box.appendChild(d);});
})();
function renderBars(lt){
  const kids=$('#barsWipe').children, T=.16;
  for(let i=0;i<kids.length;i++){
    const k=Ease.outExpo(norm(lt,i*.012,i*.012+T));
    kids[i].style.transform=`scaleY(${k.toFixed(3)})`;
  }
}

/* —— S6 MOTION 双行 —— */
const TILE='<b>MOTION</b>';
function buildMarquee(){
  $('#moTop').innerHTML=TILE.repeat(6);
  $('#moBot').innerHTML=TILE.repeat(6);
}
let tileW=0;
function measureMarquee(){
  const b=$('#moTop').querySelector('b'); tileW=b?b.offsetWidth:400;
}
function renderMotion(lt){
  const sp=1400;
  const top=$('#moTop'), bot=$('#moBot');
  top.style.transform=`translate3d(${-((lt*sp)%tileW)}px,0,0)`;
  bot.style.transform=`translate3d(${((lt*sp*1.12)%tileW)-tileW}px,0,0)`;
}

/* —— S7 单行 MOTION —— */
function renderMotionOne(lt){
  const inK=Ease.outCubic(norm(lt,0,.22));
  const wob=Math.sin(lt*10.5)*1.2+Math.sin(lt*3.7)*1.8;
  $('#motionOne').style.transform=`translate(-50%,-54%) scale(${lerp(1.10,1.015,inK).toFixed(4)}) translateX(${wob.toFixed(1)}px)`;
}

/* —— S8 GRAPHICS 房间 —— */
function buildGfx(){
  const mk=(el,n)=>{
    const stack=el.querySelector('.gfx-stack'); stack.innerHTML='';
    for(let i=0;i<n;i++){const c=document.createElement('div');c.className='gfx-cell';
      c.innerHTML='<span>GRAPHICS</span><span>GRAPHICS</span><span>GRAPHICS</span>';stack.appendChild(c);}
  };
  mk($('#gfxFloor'),10);mk($('#gfxCeil'),10);
  const hz=$('#hzScroll');hz.innerHTML=('GRAPHICS&nbsp;&nbsp;GRAPHICS&nbsp;&nbsp;GRAPHICS&nbsp;&nbsp;GRAPHICS&nbsp;&nbsp;').repeat(8);
}
function renderGfx(lt,dt){
  const cellH=$('.gfx-cell')?.offsetHeight||90;
  const floorStack=$('#gfxFloor').querySelector('.gfx-stack');
  const ceilStack=$('#gfxCeil').querySelector('.gfx-stack');
  const fy=(lt*420)%cellH;
  floorStack.style.transform=`translate3d(0,${(-fy).toFixed(1)}px,0)`;
  const cy2=(lt*340)%cellH;
  ceilStack.style.transform=`translate3d(0,${(cy2-cellH).toFixed(1)}px,0)`;
  const hw=$('#hzScroll').offsetWidth/2||600;
  $('#hzScroll').style.transform=`translate3d(${-((lt*900)%(hw))+hw*.5}px,0,0)`;
  $('#sc-gfx').style.opacity=Ease.outCubic(norm(lt,0,.12))*(1-Ease.inQuad(norm(lt,1.06,1.2)));
}

/* —— S9 标签卡 —— */
function pop(el,tt,inDur=.15){
  const k=norm(tt,0,inDur);
  if(k<=0){el.style.opacity=0;return;}
  const e=Ease.outBack(k);
  el.style.opacity=Math.min(1,k*2.2);
  el.style.transform=`scale(${lerp(.55,1,e).toFixed(3)}) rotate(${(Ease.outCubic(k)* -1.6).toFixed(2)}deg)`;
}
function renderTags(lt){
  const ne=$('#tagNoedit'), os=$('#tagOneshot'), pr=$('#pairCards');
  const ph1=lt<.52, ph2=!ph1&&lt<1.30, ph3=lt>=1.20;
  [ne,os].forEach(el=>{el.style.opacity=0;});
  pr.style.opacity=0;
  if(ph1)pop(ne,lt); else if(ph2)pop(os,lt-.52);
  if(ph3){
    pr.style.opacity=1;
    const k=Ease.outCubic(norm(lt,1.20,1.36));
    const drift=Math.max(0,lt-1.36);
    $('#pairPaper').style.transform=`translateX(${lerp(-40,0,k)+drift*1.4}vw) scale(${lerp(.92,1,k)})`;
    $('#pairBlack').style.transform=`translateX(${lerp(38,6,k)-drift*2.2}vw) scale(${lerp(.9,1,k)})`;
  }
}

/* —— S10 日文卡 —— */
function renderJp(lt){
  const l=$('#jpLeft'), r=$('#jpRight');
  const kl=Ease.outCubic(norm(lt,.0,.2)), kr=Ease.outCubic(norm(lt,.09,.29));
  const drift=Math.sin(lt*6.5)*3;
  l.style.opacity=kl>0?1:0;
  l.style.transform=`translateX(${lerp(-26,4,kl).toFixed(2)}px) translateY(${drift}px)`;
  r.style.opacity=kr>0?1:0;
  r.style.transform=`translateX(${lerp(26,-4,kr).toFixed(2)}px) translateY(${-drift}px)`;
}

/* —— S11 碎裂 —— */
const BURST_AT=.24;                          /* 场内爆炸时刻 */
function renderShatter(lt,dt){
  /* 底盘扩展 */
  const gk=Ease.outExpo(norm(lt,0,.26));
  $('#shatterDisc').style.transform=`scale(${gk.toFixed(4)})`;
  /* 同心雷达圈 */
  const svg=$('#ringsSvg'); const cx=50,cy=50;
  let out='';
  if(lt>BURST_AT-.18){
    for(let i=0;i<5;i++){
      const rp=((lt-BURST_AT)*(46+i*10)+i*7)%70;
      const fadeA=(1-rp/70)*.5;
      out+=`<circle cx="${cx}" cy="${cy}" r="${rp.toFixed(1)}" fill="none" stroke="rgba(255,246,238,${fadeA.toFixed(2)})" stroke-width="0.22"/>`;
    }
  }
  svg.innerHTML=out;
  /* 闪白由 FLASHES 表处理；此处只画碎片 */
  Shards.draw(shardCtx,lt,BURST_AT-.06);
  const w=$('#shatterWord');
  const wk=norm(lt,BURST_AT,BURST_AT+.12);
  w.style.opacity=wk*(1-Ease.inQuad(norm(lt,1.0,1.35)));
  w.style.transform=`translate(-50%,-56%) scale(${(1-wk*.03).toFixed(3)})`;
}

/* —— S12 黑场主字 —— */
let heroGhostNext=.3;
function renderHero(lt){
  const inK=Ease.outExpo(norm(lt,0,.4));
  const w=$('#heroWord');
  const sc=lerp(1.05,1,inK);
  const jx=Math.sin(lt*9)*1.1;
  w.style.transform=`translate(-50%,-52%) scale(${sc.toFixed(4)}) translateX(${jx.toFixed(1)}px)`;
  if(lt>heroGhostNext){ w.classList.toggle('ghost'); heroGhostNext=lt+(w.classList.contains('ghost')?.06:rr(Math.random,1.1,2)); }
  /* 余留小碎屑飘过（画在自身 canvas 不必要——复用全局线层用大号粒子）
     这里省略，保持纯净。*/
  w.style.textShadow=w.classList.contains('ghost')
     ? `0.45vw 0 rgba(232,74,8,.5),-0.45vw 0 rgba(228,227,216,.28)`:'none';
}

/* —— S13 片尾 —— */
let endGhostNext=.8;
function renderEnd(lt){
  const wrap=$('#endWrap');
  const inK=Ease.outExpo(norm(lt,.02,.4));
  const jx=Math.sin(lt*7.3)*1.6+Math.sin(lt*2.9)*1.1;
  const jy=Math.cos(lt*8.1)*1.3;
  wrap.style.opacity=inK;
  wrap.style.transform=`translate(${jx.toFixed(1)}px,${jy.toFixed(1)}px)`;
  const rule=$('#endRule');
  rule.style.transform=`translateX(-50%) scaleX(${Ease.outCubic(norm(lt,.12,.5)).toFixed(3)})`;
  if(lt>endGhostNext){
    const g=wrap.classList.toggle('ghosting');
    $('.end-word').style.textShadow=g?'0.5vw 0 rgba(232,74,8,.4),-0.5vw 0 rgba(20,20,20,.25)':'none';
    endGhostNext=lt+(g?.07:rr(Math.random,1.4,2.3));
  }
}

/* ═══════════════════ 装配与主循环 ═══════════════════ */
const lineFX=new LineFX($('#cvLines'));
let shardCtx=fitCanvas($('#cvShards'));

/* MiniM 打字机字块拆分 */
$('#minimType').innerHTML='MiniM'.split('').map(ch=>`<span class="gl" style="opacity:0">${ch}</span>`).join('');

buildMarquee();buildGfx();measureMarquee();
function layoutAll(){
  fitCanvas($('#cvLines')); vortexA.resize(); vortexB.resize();
  shardCtx=fitCanvas($('#cvShards')); measureMarquee();
  buildBarcodes(); Shards.gen();
}

Shards.gen();
layoutAll();

const stage=$('#stage');
let curActiveId='';

/* 每次切入新场景时重置该场景的状态变量（循环播放也要一致） */
function resetSceneState(id){
  if(id==='sc-lockup')  lockGlitch={next:.34,on:false};
  if(id==='sc-hero')    heroGhostNext=.35;
  if(id==='sc-end')     endGhostNext=.8;
}

function renderScenes(t){
  for(const s of SCENES){
    const inside=t>=s.start&&t<s.end;
    if(inside!==s.cur){ s.cur=inside; s.el.classList.toggle('on',inside); }
    if(s.cur)resetSceneState(s.id);
  }
  if(t>=0&&t<.30)lineFX.setMode('scratch',t,FRAME_DT);
  else if(t>=6.52&&t<7.72)lineFX.setMode('warp',t,FRAME_DT);
  else lineFX.setMode(null,t,FRAME_DT);
  if(t>=.30&&t<1.08)renderDisc(t-.30);
  else if(t>=1.08&&t<1.72)renderMinim(t-1.08);
  else if(t>=1.72&&t<4.55)renderLockup(t-1.72);
  else if(t>=4.55&&t<4.85)renderBars(t-4.55);
  else if(t>=4.85&&t<5.90)renderMotion(t-4.85);
  else if(t>=5.90&&t<6.52)renderMotionOne(t-5.90);
  else if(t>=6.52&&t<7.72)renderGfx(t-6.52,FRAME_DT);
  else if(t>=7.72&&t<9.44)renderTags(t-7.72);
  else if(t>=9.44&&t<10.32)renderJp(t-9.44);
  else if(t>=10.32&&t<11.16)renderShatter(t-10.32,FRAME_DT);
  else if(t>=11.00&&t<12.60)renderHero(t-11.00);
  else if(t>=12.60)renderEnd(t-12.60);
}

let FRAME_DT=1/60,lastNow=performance.now();
const progressBar=$('#progressBar');

function frame(now){
  FRAME_DT=clamp((now-lastNow)/1000,0,1/24); lastNow=now;
  const t=getClock();
  /* 当前调色板 */
  let act='sc-intro';
  for(const s of SCENES)if(t>=s.start&&t<s.end){act=s.id;break;}
  if(act!==curActiveId){
    curActiveId=act;
    const p=paletteOf(act);
    stage.dataset.palette=(p==='orange')?'dark':p;
  }
  renderScenes(t);
  updFlash(t);
  updWatermark(t);
  updBarcodes(t,now/1000);
  progressBar.style.transform=`scaleX(${(t/DUR).toFixed(4)})`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ═══════════════════ 音频与交互 ═══════════════════ */
const gate=$('#gate'), soundBtn=$('#soundBtn'), replayBtn=$('#replayBtn'), stateLbl=$('#soundState');

function syncMuteUI(){ soundBtn.classList.toggle('muted',audio.muted);
  stateLbl.textContent=audio.muted?'静音':'开声'; }

async function startReel(muted){
  try{
    audio.muted=muted; syncMuteUI();
    audio.currentTime=0;
    await audio.play();
    started=true;
    gate.classList.remove('show');
    replayBtn.classList.add('show');
  }catch(e){
    gate.classList.add('show');
  }
}
/* 首次进入：先尝试带声自动播放，被策略拦下则给出点击闸门（freeze 模式跳过） */
if(FREEZE==null)startReel(false);

gate.addEventListener('click',()=>startReel(false));
soundBtn.addEventListener('click',e=>{ e.stopPropagation();
  audio.muted=!audio.muted; syncMuteUI();
  if(audio.paused)audio.play().catch(()=>{}); });
replayBtn.addEventListener('click',e=>{ e.stopPropagation(); startReel(audio.muted); });

/* 循环由 loop 属性承担；补一重保险：若意外暂停，点击页面任意处续播 */
document.addEventListener('click',()=>{
  if(started&&audio.paused){ audio.play().catch(()=>{}); }
});
