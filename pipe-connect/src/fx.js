window.PC=window.PC||{};
PC.FX=(()=>{
'use strict';
// 接水管 canvas 特效层：水花爆点 / 过关纸屑 / 背景气泡
// 色板取 classic：水 #58B7EC｜管白 #EEF0F6｜法兰 khaki #E9E9BE｜纯白 #fff
var MAXP=160;                                   // 总粒子上限（对象池定容）
var C_WATER='#58B7EC', C_PIPE='#EEF0F6', C_FLANGE='#E9E9BE', C_WHITE='#FFFFFF';
var pool=[], cur=0, live=0, i;
for(i=0;i<MAXP;i++)pool.push({on:false,kind:'',x:0,y:0,bx:0,vx:0,vy:0,g:0,t:0,life:1,
  size:2,size2:0,color:C_WHITE,rgb:'',a:1,rot:0,vr:0,sway:0,ph:0,fr:0});
var cv=null, ctx=null, W=0, H=0, dpr=1;
var running=false, rafId=0, ivId=0, idleT=0, lastT=0;
var ambOn=false, ambW=0, ambH=0, ambNext=0;
var glowCache={};

function rnd(a,b){return a+Math.random()*(b-a);}
function acquire(){                       // 池满则丢弃新粒子，绝不超 160
  for(var n=0;n<MAXP;n++){cur=(cur+1)%MAXP;var p=pool[cur];if(!p.on)return p;}
  return null;
}
function kill(p){if(p.on){p.on=false;live--;}}
// 预渲染径向渐变光点贴图（代替 shadowBlur，绘制时配合 lighter 叠色）
function glow(rgb){
  var s=glowCache[rgb]; if(s)return s;
  s=document.createElement('canvas'); s.width=s.height=64;
  var g=s.getContext('2d');
  var gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba('+rgb+',0.85)');
  gr.addColorStop(0.4,'rgba('+rgb+',0.30)');
  gr.addColorStop(1,'rgba('+rgb+',0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  glowCache[rgb]=s; return s;
}

// ---- 双驱动：rAF 60fps + setInterval(120ms) 兜底（后台/遮挡节流时仍前进）----
function ensure(){
  if(!ctx)return false;
  if(idleT){clearTimeout(idleT);idleT=0;}
  if(!running){
    running=true; lastT=performance.now();
    rafId=requestAnimationFrame(loop);
    ivId=setInterval(tick,120);
  }
  return true;
}
function halt(){
  running=false;
  if(rafId){cancelAnimationFrame(rafId);rafId=0;}
  if(ivId){clearInterval(ivId);ivId=0;}
  if(idleT){clearTimeout(idleT);idleT=0;}
}
function loop(ts){ rafId=0; if(!running)return; step(ts); if(running&&!rafId)rafId=requestAnimationFrame(loop); }
function tick(){ if(running)step(performance.now()); }

function step(now){
  var dt=(now-lastT)/1000; lastT=now;
  if(!(dt>0))dt=0; else if(dt>0.12)dt=0.12;      // 防节流恢复后大跳帧
  if(ambOn&&now>=ambNext&&live<MAXP-2){spawnBubble();ambNext=now+rnd(650,1500);}
  var n=pool.length,p,k;
  for(var idx=0;idx<n;idx++){
    p=pool[idx]; if(!p.on)continue;
    p.t+=dt;
    if(p.t>=p.life){kill(p);continue;}
    k=p.kind;
    if(k==='drop'||k==='spark'){                  // 重力抛物线水滴
      p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.y>H+24||p.x<-24||p.x>W+24){kill(p);continue;}
    }else if(k==='flake'||k==='cdrop'){           // 纸屑/落水滴：缓降+正弦横摆
      p.y+=p.vy*dt; p.ph+=p.fr*dt;
      p.x=p.bx+Math.sin(p.ph)*p.sway; p.rot+=p.vr*dt;
      if(p.y>H+12){kill(p);continue;}
    }else if(k==='bubble'){                       // 气泡：缓升+摇摆
      p.y+=p.vy*dt; p.ph+=p.fr*dt;
      p.x=p.bx+Math.sin(p.ph)*p.sway;
      if(p.y<-p.size-4){kill(p);continue;}
    }else if(k==='ring'){                         // 冲击环：扩张
      p.size+=p.vr*dt;
    }
  }
  draw();
  if(live===0){                                   // 无粒子自动停表省电
    ctx.clearRect(0,0,W,H); halt();
    if(ambOn){
      var wake=Math.max(60,ambNext-performance.now());
      idleT=setTimeout(function(){idleT=0;if(ambOn&&ctx)ensure();},wake);
    }
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);
  for(var idx=0;idx<pool.length;idx++){
    var p=pool[idx]; if(!p.on)continue;
    var k=p.t/p.life;
    var al=p.a*(k>0.72?1-(k-0.72)/0.28:1);
    if(p.kind==='drop'){
      ctx.globalAlpha=al; ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832); ctx.fill();
    }else if(p.kind==='spark'){
      var r=p.size*3;
      ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=al;
      ctx.drawImage(glow(p.rgb),p.x-r,p.y-r,r*2,r*2);
      ctx.globalCompositeOperation='source-over';
    }else if(p.kind==='flake'){
      ctx.globalAlpha=al;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.scale(1,0.35+0.65*Math.abs(Math.sin(p.ph*1.7)));   // 翻面飘动
      ctx.fillStyle=p.color;
      ctx.fillRect(-p.size/2,-p.size2/2,p.size,p.size2);
      ctx.restore();
    }else if(p.kind==='cdrop'){
      ctx.globalAlpha=al; ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832); ctx.fill();
    }else if(p.kind==='bubble'){
      ctx.globalAlpha=al;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832);
      ctx.fillStyle='rgba(238,240,246,0.22)'; ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.stroke();
    }else if(p.kind==='ring'){
      ctx.globalAlpha=al*0.8;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,6.2832);
      ctx.lineWidth=2; ctx.strokeStyle=p.color; ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
}

// ---- 粒子工厂 ----
function spawnBubble(){
  var aw=ambW||W, ah=ambH||H;
  var p=acquire(); if(!p)return;
  p.on=true; live++;
  p.kind='bubble'; p.t=0; p.life=rnd(9,16); p.a=0.9;
  p.size=rnd(2,5.5); if(Math.random()<0.15)p.size=rnd(6,8);
  p.bx=rnd(10,Math.max(11,aw-10));
  p.y=ah+p.size+rnd(0,30); p.x=p.bx;
  p.vy=-rnd(16,42); p.sway=rnd(3,10); p.ph=rnd(0,6.28); p.fr=rnd(0.8,2);
}
function burst(x,y,opts){
  if(!ctx)return; opts=opts||{};
  var n=Math.min(opts.count||22,40);
  var pow=opts.power||1;
  ensure();
  for(var j=0;j<n;j++){
    var p=acquire(); if(!p)return;
    var ang=-Math.PI/2+rnd(-1.15,1.15);           // 上半扇形喷溅
    var sp=rnd(120,360)*pow;
    p.on=true; live++;
    p.kind='drop'; p.t=0; p.life=rnd(0.55,1.15); p.a=1;
    p.x=x+rnd(-4,4); p.y=y+rnd(-3,3);
    p.vx=Math.cos(ang)*sp; p.vy=Math.sin(ang)*sp; p.g=rnd(760,1000);
    var r=Math.random();
    p.color=r<0.5?C_WATER:(r<0.8?C_WHITE:C_PIPE);
    p.size=rnd(1.6,4.2); p.rgb='';
    if(j%6===0){                                  // 少量柔光水珠
      p.kind='spark'; p.rgb=r<0.5?'88,183,236':'255,255,255';
      p.size=rnd(3,6); p.vx*=0.8; p.vy*=0.8; p.g*=0.85;
    }
  }
  var q=acquire();                                // 中心冲击环
  if(q){
    q.on=true; live++;
    q.kind='ring'; q.t=0; q.life=0.32; q.a=0.9;
    q.x=x; q.y=y; q.size=4; q.vr=90; q.color='rgba(255,255,255,0.9)';
  }
}
function confetti(x,y,w){
  if(!ctx)return; ensure();
  var x0=Math.max(0,x-w/2), x1=Math.min(W,x+w/2);
  for(var j=0;j<34;j++){
    var p=acquire(); if(!p)return;
    p.on=true; live++;
    p.kind=(j%5===0)?'cdrop':'flake'; p.t=0; p.life=rnd(1.55,1.95); p.a=1;
    p.bx=rnd(x0,x1); p.y=y+rnd(-14,14); p.x=p.bx;
    p.sway=rnd(8,26); p.ph=rnd(0,6.28); p.fr=rnd(1.2,2.6);
    p.vy=rnd(55,120); p.rot=rnd(0,6.28); p.vr=rnd(-3.5,3.5);
    if(p.kind==='cdrop'){
      p.color=Math.random()<0.6?C_WATER:C_WHITE; p.size=rnd(1.8,3.4);
    }else{
      var r=Math.random();
      p.color=r<0.34?C_FLANGE:(r<0.62?C_PIPE:(r<0.8?C_WHITE:C_WATER));
      p.size=rnd(5,9); p.size2=rnd(3,5.5);
    }
  }
}
function ambient(w,h){
  ambW=w; ambH=h; ambOn=true;
  if(!ctx)return;
  ensure(); ambNext=performance.now()+rnd(200,600);
}
function stop(){
  halt(); ambOn=false;
  if(ctx&&W)ctx.clearRect(0,0,W,H);
}
function clear(){
  for(var idx=0;idx<pool.length;idx++)pool[idx].on=false;
  live=0;
  if(ctx&&W)ctx.clearRect(0,0,W,H);
}

return {
  init:function(canvas){
    cv=canvas||null; ctx=cv?cv.getContext('2d'):null;
    if(cv&&cv.width&&!W){W=cv.width;H=cv.height;}
    if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    return !!ctx;
  },
  resize:function(w,h,d){
    W=Math.max(1,Math.round(w)); H=Math.max(1,Math.round(h));
    dpr=Math.max(1,Math.min(2,d||1));             // dpr≤2
    if(!cv)return;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
  },
  burst:burst,
  confetti:confetti,
  ambient:ambient,
  stop:stop,
  clear:clear
};
})();
