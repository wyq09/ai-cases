window.WS=window.WS||{};
WS.FX=(()=>{
'use strict';
// 倒水挑战 · canvas 粒子特效层
// droplets 倒水落点液滴（重力弧线回落）｜sparkle 一色完成瓶口星火小爆｜confetti 过关全屏彩带雨 2.2s
// 红线：禁 shadowBlur——发光一律预渲染径向渐变贴图 + globalCompositeOperation='lighter'
var LIQ=['#F5C542','#E2483D','#3FA0D8','#59B35B','#F08A3C','#EF7FA4','#8E6FC8','#4EC8C0'];
var WHITE='#FFFFFF';
var MAXP=288;                    // 池总容：彩带≤160 + 单次液滴≤64 + 星火/环余量
var CONF_MAX=160, DROP_MAX=64;   // 单次调用粒子数上限

var pool=[], cur=0, live=0, i;
for(i=0;i<MAXP;i++)pool.push({on:false,kind:'',x:0,y:0,bx:0,vx:0,vy:0,g:0,t:0,life:1,
  size:2,size2:0,color:WHITE,rgb:'',a:1,rot:0,vr:0,sway:0,ph:0,fr:0});

var cv=null, ctx=null, W=0, H=0, dpr=1;
var running=false, rafId=0, lastT=0, errRun=0;
var glowCache={}, rgbCache={};

function rnd(a,b){return a+Math.random()*(b-a);}
function acquire(){                        // 池满则丢弃新粒子，绝不超上限
  for(var n=0;n<MAXP;n++){cur=(cur+1)%MAXP;var p=pool[cur];if(!p.on)return p;}
  return null;
}
function kill(p){if(p.on){p.on=false;live--;}}
function hex2rgb(hex){                     // '#RRGGBB' -> 'r,g,b'
  var s=rgbCache[hex]; if(s)return s;
  var v=0;
  try{v=parseInt(String(hex).replace('#',''),16)||0;}catch(e){v=0;}
  s=((v>>16)&255)+','+((v>>8)&255)+','+(v&255);
  rgbCache[hex]=s; return s;
}
// 预渲染径向渐变光斑贴图（代替 shadowBlur），绘制时配 lighter 叠色
function glow(rgb){
  var s=glowCache[rgb]; if(s)return s;
  s=document.createElement('canvas'); s.width=s.height=64;
  var g=s.getContext('2d');
  var gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+rgb+',0.9)');
  gr.addColorStop(0.35,'rgba('+rgb+',0.35)');
  gr.addColorStop(1,'rgba('+rgb+',0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  glowCache[rgb]=s; return s;
}

// ---- rAF 自驱：有粒子才跑，帧空自动停表不空转 ----
function ensure(){
  if(!ctx)return false;
  if(running)return true;
  running=true; errRun=0; lastT=0;
  rafId=requestAnimationFrame(loop);
  return true;
}
function halt(){
  running=false;
  if(rafId){cancelAnimationFrame(rafId);rafId=0;}
}
function loop(ts){
  rafId=0;
  if(!running)return;
  try{ step(ts); errRun=0; }
  catch(e){ if(++errRun>90){halt();return;} }      // 单帧异常不终止循环
  if(running&&!rafId)rafId=requestAnimationFrame(loop);
}

function step(ts){
  if(!lastT)lastT=ts;
  var dt=(ts-lastT)/1000; lastT=ts;
  if(!(dt>0))dt=0.016; else if(dt>0.1)dt=0.1;      // 防节流恢复大跳帧
  var BH=H||1200, BW=W||800;
  for(var idx=0;idx<MAXP;idx++){
    var p=pool[idx]; if(!p.on)continue;
    p.t+=dt;
    if(p.t>=p.life){kill(p);continue;}
    var k=p.kind;
    if(k==='drop'){                                // 液滴：重力抛物线
      p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.y>BH+30||p.x<-30||p.x>BW+30){kill(p);continue;}
    }else if(k==='ember'){                         // 星火光斑：放射+阻尼
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      p.vx-=p.vx*2.6*dt; p.vy-=p.vy*2.6*dt; p.vy+=90*dt;
    }else if(k==='flake'||k==='bit'){              // 彩带/屑：缓降+正弦横摆+翻面
      p.y+=p.vy*dt; p.ph+=p.fr*dt;
      p.x=p.bx+Math.sin(p.ph)*p.sway; p.rot+=p.vr*dt;
      if(p.y>BH+14){kill(p);continue;}
    }else if(k==='ring'){                          // 冲击环：扩张
      p.size+=p.vr*dt;
    }
  }
  draw();
  if(live===0){                                    // 无粒子自动停表省电
    if(W&&H)ctx.clearRect(0,0,W,H);
    halt();
  }
}

function draw(){
  if(W&&H)ctx.clearRect(0,0,W,H);
  for(var idx=0;idx<MAXP;idx++){
    var p=pool[idx]; if(!p.on)continue;
    var k=p.t/p.life;
    var al=p.a*(k>0.7?1-(k-0.7)/0.3:1);
    if(p.kind==='drop'){
      ctx.globalAlpha=al; ctx.fillStyle=p.color;
      var sp=p.vx<0?-p.vx:p.vx, sv=p.vy<0?-p.vy:p.vy;
      sp=sp+sv;
      var st=sp>230?((sp-230)/520):0; if(st>0.85)st=0.85;   // 高速拉成短流线
      if(st>0.06){
        ctx.save(); ctx.translate(p.x,p.y);
        ctx.rotate(Math.atan2(p.vy,p.vx));
        ctx.scale(1+st,1);
        ctx.beginPath(); ctx.arc(0,0,p.size,0,6.2832); ctx.fill();
        ctx.restore();
      }else{
        ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832); ctx.fill();
      }
      if(p.size>2.6){                              // 大珠点白高光（扁平克制）
        ctx.globalAlpha=al*0.8; ctx.fillStyle='rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(p.x-p.size*0.32,p.y-p.size*0.32,p.size*0.3,0,6.2832); ctx.fill();
      }
    }else if(p.kind==='ember'){
      var r=p.size*(1+k*1.5);
      ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=al;
      ctx.drawImage(glow(p.rgb),p.x-r,p.y-r,r*2,r*2);
      ctx.globalCompositeOperation='source-over';
    }else if(p.kind==='ring'){
      ctx.globalAlpha=al;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832);
      ctx.lineWidth=2.5*(1-k)+0.6; ctx.strokeStyle=p.color; ctx.stroke();
    }else if(p.kind==='flake'){
      ctx.globalAlpha=al;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.scale(1,0.3+0.7*Math.abs(Math.sin(p.ph)));   // 翻面飘动
      ctx.fillStyle=p.color;
      ctx.fillRect(-p.size/2,-p.size2/2,p.size,p.size2);
      ctx.restore();
    }else if(p.kind==='bit'){
      ctx.globalAlpha=al; ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832); ctx.fill();
    }
  }
  ctx.globalAlpha=1;
}

// ---- 粒子工厂 ----
// 倒水落点：小液滴上扇喷溅→重力回落，色随倒入的液体
function droplets(x,y,color,n){
  if(!ctx)return;
  n=(n==null)?8:(n|0);
  if(n<1)n=1; else if(n>DROP_MAX)n=DROP_MAX;
  ensure();
  var col=color||LIQ[0], rgb=hex2rgb(col), p, ang, sp;
  for(var j=0;j<n;j++){
    p=acquire(); if(!p)break;
    ang=-1.5708+rnd(-1.3,1.3);                     // 上半扇形
    sp=rnd(110,330);
    p.on=true; live++;
    p.kind='drop'; p.t=0; p.life=rnd(0.45,0.9); p.a=1;
    p.x=x+rnd(-5,5); p.y=y+rnd(-3,3);
    p.vx=Math.cos(ang)*sp; p.vy=Math.sin(ang)*sp-rnd(20,90);
    p.g=rnd(1350,1750);
    p.color=(Math.random()<0.86)?col:WHITE;
    p.size=rnd(1.8,3.8); p.rgb='';
  }
  p=acquire();                                     // 落点柔光一闪
  if(p){
    p.on=true; live++;
    p.kind='ember'; p.t=0; p.life=0.28; p.a=0.8;
    p.x=x; p.y=y; p.vx=0; p.vy=0; p.size=rnd(7,11); p.rgb=rgb;
  }
}
// 一色完成：瓶口星火小爆——放射光斑+重力小珠+闪光+扩散环
function sparkle(x,y,color){
  if(!ctx)return;
  ensure();
  var col=color||LIQ[0], rgb=hex2rgb(col), p, ang, s2;
  for(var j=0;j<10;j++){                           // 放射光斑
    p=acquire(); if(!p)break;
    ang=(j/10)*6.2832+rnd(-0.25,0.25);
    s2=rnd(60,190);
    p.on=true; live++;
    p.kind='ember'; p.t=0; p.life=rnd(0.35,0.6); p.a=1;
    p.x=x; p.y=y;
    p.vx=Math.cos(ang)*s2; p.vy=Math.sin(ang)*s2-rnd(0,40);
    p.size=rnd(3,6); p.rgb=(j%3===0)?'255,255,255':rgb;
  }
  for(j=0;j<7;j++){                                // 实色小珠带重力
    p=acquire(); if(!p)break;
    ang=-1.5708+rnd(-1.5,1.5); s2=rnd(70,230);
    p.on=true; live++;
    p.kind='drop'; p.t=0; p.life=rnd(0.4,0.75); p.a=1;
    p.x=x; p.y=y;
    p.vx=Math.cos(ang)*s2; p.vy=Math.sin(ang)*s2;
    p.g=rnd(900,1300);
    p.color=(j%3===0)?WHITE:col; p.size=rnd(1.4,2.6); p.rgb='';
  }
  p=acquire();                                     // 中心白闪
  if(p){
    p.on=true; live++;
    p.kind='ember'; p.t=0; p.life=0.22; p.a=1;
    p.x=x; p.y=y; p.vx=0; p.vy=0; p.size=13; p.rgb='255,255,255';
  }
  p=acquire();                                     // 扩散环
  if(p){
    p.on=true; live++;
    p.kind='ring'; p.t=0; p.life=0.38; p.a=0.9;
    p.x=x; p.y=y; p.size=6; p.vr=120; p.color='rgba(255,255,255,0.9)';
  }
}
// 过关：全屏彩带纸屑矩形旋转飘落，整体约 2.2s
function confetti(w,h){
  if(!ctx)return;
  ensure();
  var cw=Math.max(1,w||W), ch=Math.max(1,h||H);
  if(!W)W=cw; if(!H)H=ch;                          // 未 resize 兜底
  var p;
  for(var j=0;j<CONF_MAX;j++){
    p=acquire(); if(!p)break;
    p.on=true; live++;
    p.kind=(j%6===0)?'bit':'flake'; p.t=0; p.life=rnd(1.9,2.35); p.a=1;
    p.bx=rnd(4,cw-4);
    p.y=(j<CONF_MAX*0.55)?-rnd(8,ch*0.55):rnd(-30,ch*0.12);  // 错峰入场成雨
    p.x=p.bx;
    p.vy=rnd(240,430)*((j%6===0)?1.15:1);
    p.sway=rnd(10,34); p.ph=rnd(0,6.2832); p.fr=rnd(1.6,3.4);
    p.rot=rnd(0,6.2832); p.vr=rnd(-7,7);
    p.color=(Math.random()<0.12)?WHITE:LIQ[(Math.random()*LIQ.length)|0];
    if(j%6===0){p.size=rnd(1.6,3); p.size2=0;}
    else{p.size=rnd(6,11); p.size2=rnd(3.5,6);}
  }
}

function stop(){                                   // 停表清屏，粒子保留待续
  halt();
  if(ctx&&W&&H)ctx.clearRect(0,0,W,H);
}
function clear(){                                  // 全清：粒子+画布
  for(var idx=0;idx<MAXP;idx++)pool[idx].on=false;
  live=0;
  if(ctx&&W&&H)ctx.clearRect(0,0,W,H);
}

return {
  init:function(canvas){
    cv=canvas||null;
    ctx=cv?cv.getContext('2d'):null;
    if(ctx&&!W&&cv.width)W=cv.width;
    if(ctx&&!H&&cv.height)H=cv.height;
    if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    return !!ctx;
  },
  resize:function(w,h,d){
    W=Math.max(1,Math.round(w)); H=Math.max(1,Math.round(h));
    dpr=Math.max(1,Math.min(2,d||1));              // dpr≤2
    if(!cv||!ctx)return;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
  },
  droplets:droplets,
  sparkle:sparkle,
  confetti:confetti,
  stop:stop,
  clear:clear
};
})();
