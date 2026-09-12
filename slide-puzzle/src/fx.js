window.SP=window.SP||{};

// SP.FX — 落叶爆发 Canvas2D 粒子特效（契约：禁止 shadowBlur）
// 叶片离屏预渲染：3 色 3 形贝塞尔叶形 × 4 旋转帧；对象池上限 300；DPR≤2；
// resize/orientationchange 自适应；document.hidden 暂停恢复；无粒子时停 rAF 节能。
SP.FX=(()=>{
  'use strict';

  /* ---------- 调色（契约锁死 #e8912a #d96b1f #f2b23a #b5541c） ---------- */
  // 3 个叶身色：浅→深渐变对；#b5541c 兼作叶脉/叶柄/描边细节色
  var COLORS=[
    ['#f2b23a','#e8912a'],
    ['#e8912a','#d96b1f'],
    ['#d96b1f','#b5541c']
  ];
  var VEIN='rgba(181,84,28,.8)';
  var STEM='#b5541c';
  var EDGE='rgba(122,74,34,.35)';

  /* ---------- 3 种贝塞尔叶形参数 ---------- */
  // w:半宽/叶长 比；c1/c2w/c2:上段控制点；stem:柄长比例
  var SHAPES=[
    {w:.40,c1:.14,c2w:.98,c2:.30,stem:.16},  // 尖椭圆叶
    {w:.52,c1:-.02,c2w:.92,c2:.36,stem:.12}, // 圆桃形叶（最宽偏下）
    {w:.28,c1:.22,c2w:.96,c2:.24,stem:.22}   // 细长柳叶
  ];
  var FRAMES=4;              // 预渲染旋转帧数（45°/帧，配合镜像=8 视角，循环无缝）
  var STEP=Math.PI/4;
  var SPR=72;                // 精灵画布边长(px)
  var MAX_P=300;             // 粒子池上限（契约）
  var TAU=Math.PI*2;

  /* ---------- 离屏预渲染 ---------- */
  var SPRITES=null;          // SPRITES[color][shape][frame] -> canvas

  function leafPath(c,L,s){
    var hw=L*s.w;
    c.beginPath();
    c.moveTo(0,-L*0.5);                                   // 叶尖
    c.bezierCurveTo( hw,-L*s.c1,  hw*s.c2w, L*s.c2, 0, L*0.5); // 右缘
    c.bezierCurveTo(-hw*s.c2w, L*s.c2, -hw,-L*s.c1, 0,-L*0.5); // 左缘
    c.closePath();
  }

  function drawLeaf(c,L,s,ci){
    // 叶柄（先画，被叶身压住根部）
    c.strokeStyle=STEM; c.lineWidth=Math.max(1.5,L*0.045); c.lineCap='round';
    c.beginPath();
    c.moveTo(0,L*0.42);
    c.quadraticCurveTo(L*0.05,L*(0.5+s.stem*0.5),L*0.09,L*(0.5+s.stem));
    c.stroke();
    // 叶身：浅→深线性渐变
    var g=c.createLinearGradient(0,-L/2,0,L/2);
    g.addColorStop(0,COLORS[ci][0]);
    g.addColorStop(1,COLORS[ci][1]);
    leafPath(c,L,s);
    c.fillStyle=g; c.fill();
    c.strokeStyle=EDGE; c.lineWidth=1.4; c.stroke();
    // 叶脉：主脉 + 三对侧脉
    c.strokeStyle=VEIN; c.lineWidth=Math.max(1,L*0.028);
    c.beginPath();
    c.moveTo(0,-L*0.42); c.lineTo(0,L*0.44);
    for(var i=0;i<3;i++){
      var t=-0.24+i*0.22, y=L*t, len=L*(0.17-i*0.02)*(s.w/0.4);
      c.moveTo(0,y+L*0.04); c.lineTo( len,y-L*0.10);
      c.moveTo(0,y+L*0.04); c.lineTo(-len,y-L*0.10);
    }
    c.stroke();
  }

  function buildSprites(){
    if(SPRITES||typeof document==='undefined')return;
    SPRITES=[];
    for(var ci=0;ci<COLORS.length;ci++){
      var byColor=[];
      for(var si=0;si<SHAPES.length;si++){
        var byShape=[];
        for(var f=0;f<FRAMES;f++){
          var cv=document.createElement('canvas');
          cv.width=SPR; cv.height=SPR;
          var c=cv.getContext('2d');
          c.translate(SPR/2,SPR/2);
          c.rotate(f*STEP);
          drawLeaf(c,SPR*0.62,SHAPES[si],ci);
          byShape.push(cv);
        }
        byColor.push(byShape);
      }
      SPRITES.push(byColor);
    }
  }

  /* ---------- 画布 / 宿主 ---------- */
  var cv=null, ctx=null, hostW=1, hostH=1;
  var bound=false, resizeRaf=0;

  function resize(){
    if(!cv)return;
    var el=cv.parentNode||document.body;
    var dpr=Math.min(2,window.devicePixelRatio||1);   // DPR ≤ 2（契约）
    hostW=Math.max(1,el.clientWidth||window.innerWidth);
    hostH=Math.max(1,el.clientHeight||window.innerHeight);
    cv.width=Math.round(hostW*dpr);
    cv.height=Math.round(hostH*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function onResize(){
    if(resizeRaf)return;
    resizeRaf=requestAnimationFrame(function(){resizeRaf=0;resize();});
  }

  function onVis(){
    // 恢复：有活粒子且循环未在跑 → 重启（last 清零避免大 dt 跳变）
    if(!document.hidden&&aliveCount>0&&!rafId){last=0;rafId=requestAnimationFrame(frame);}
  }

  function bind(){
    if(bound)return;
    bound=true;
    window.addEventListener('resize',onResize,{passive:true});
    window.addEventListener('orientationchange',onResize,{passive:true});
    document.addEventListener('visibilitychange',onVis);
  }

  function init(hostEl){
    var host=hostEl||document.body;
    buildSprites();
    if(!cv){
      cv=document.createElement('canvas');
      cv.setAttribute('aria-hidden','true');
      ctx=cv.getContext('2d');
    }
    cv.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;'
      +'pointer-events:none;z-index:9999;';
    if(cv.parentNode!==host)host.appendChild(cv);   // appendChild 自动搬移节点
    // 宿主无定位且无 transform 时补 relative，保证 canvas 全覆盖 host
    var cs=getComputedStyle(host);
    if(cs.position==='static'&&cs.transform==='none')host.style.position='relative';
    bind();
    resize();
  }

  function ensure(){
    if(!cv)init(document.body);
  }

  /* ---------- 粒子池 ---------- */
  var pool=new Array(MAX_P);
  for(var i=0;i<MAX_P;i++){
    pool[i]={alive:false,x:0,y:0,vx:0,vy:0,g:0,t:0,ttl:1,ci:0,si:0,
      rot:0,spin:0,sc:1,sa:0,sf:0,sp:0};
  }
  var aliveCount=0, rafId=0, last=0;

  /* ---------- 主循环 ---------- */
  function frame(ts){
    rafId=0;
    if(!ctx)return;
    if(document.hidden){last=0;return;}   // 隐藏时挂起，恢复由 onVis 接管
    var dt=last?Math.min((ts-last)/1000,.05):.016;  // dt 钳制防跳变
    last=ts;
    ctx.clearRect(0,0,hostW,hostH);
    var n=0,p;
    for(var i=0;i<MAX_P;i++){
      p=pool[i];
      if(!p.alive)continue;
      step(p,dt);
      if(p.alive){draw(p);n++;}
    }
    ctx.globalAlpha=1;
    aliveCount=n;
    if(n)rafId=requestAnimationFrame(frame);  // 无粒子即停 rAF（节能）
  }

  function step(p,dt){
    p.t+=dt;
    if(p.t>=p.ttl){p.alive=false;return;}
    p.vy+=p.g*dt;                    // 重力
    if(p.vy>330)p.vy=330;            // 落叶终端速度
    p.vx-=p.vx*1.5*dt;               // 空气阻尼
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.rot+=p.spin*dt;                // 自转
    if(p.y>hostH+90||p.x<-140||p.x>hostW+140){p.alive=false;return;}  // 出界回收
  }

  function draw(p){
    var k=p.t/p.ttl, a=p.t<0.08?p.t/0.08:1;    // 淡入
    var remain=1-k;
    if(remain<0.32)a*=remain/0.32;             // 末段 2~2.6s 内淡出
    var sx=p.x+Math.sin(p.t*p.sf+p.sp)*p.sa;   // 水平正弦摇摆
    var ang=p.rot%TAU; if(ang<0)ang+=TAU;
    var fi=Math.round((ang%Math.PI)/STEP)%FRAMES;  // 4 旋转帧 + 镜像=无缝翻滚
    var mir=ang>=Math.PI?-1:1;
    var s=SPR*p.sc, dw=s*mir;
    ctx.globalAlpha=a;
    ctx.drawImage(SPRITES[p.ci][p.si][fi],sx-dw/2,p.y-s/2,dw,s);
  }

  function ensureLoop(){
    if(rafId)return;
    last=0;
    rafId=requestAnimationFrame(frame);
  }

  /* ---------- API ---------- */

  // leafBurst(x, y[, n[, opt]])
  // x,y: 相对 host 的 CSS 像素坐标；n: 粒子数（受池上限约束）
  // opt: {power=1 初速倍率, gravity=640, angle, arc=TAU 扇形, ttl=2.0, ttlMax=2.6}
  function leafBurst(x,y,n,opt){
    ensure();
    buildSprites();
    opt=opt||{};
    n=(n==null?48:n)|0;
    if(n<1)n=1;
    var g=opt.gravity!=null?opt.gravity:640;
    var pw=opt.power!=null?opt.power:1;
    var base=opt.angle, arc=opt.arc!=null?opt.arc:TAU;
    var ttl0=opt.ttl!=null?opt.ttl:2.0;
    var ttl1=opt.ttlMax!=null?opt.ttlMax:ttl0+0.6;
    var spawned=0,p;
    for(var i=0;i<MAX_P&&spawned<n;i++){
      p=pool[i];
      if(p.alive)continue;
      var a=base!=null?base+(Math.random()-.5)*arc:Math.random()*TAU;  // 四散
      var sp=(130+Math.pow(Math.random(),0.65)*330)*pw;
      p.alive=true;
      p.x=x; p.y=y;
      p.vx=Math.cos(a)*sp;
      p.vy=Math.sin(a)*sp-60*pw;          // 轻微上抛
      p.g=g;
      p.t=0;
      p.ttl=ttl0+Math.random()*(ttl1-ttl0);   // 2~2.6s 寿命
      p.ci=(Math.random()*COLORS.length)|0;
      p.si=(Math.random()*SHAPES.length)|0;
      p.rot=Math.random()*TAU;
      p.spin=(2.2+Math.random()*4.6)*(Math.random()<.5?-1:1);
      p.sc=.32+Math.random()*.36;
      p.sa=8+Math.random()*16;            // 摇摆幅度
      p.sf=2.4+Math.random()*2.8;         // 摇摆频率
      p.sp=Math.random()*TAU;
      spawned++;
    }
    if(spawned){aliveCount+=spawned;ensureLoop();}
    return spawned;
  }

  function stopAll(){
    for(var i=0;i<MAX_P;i++)pool[i].alive=false;
    aliveCount=0;
    if(rafId){cancelAnimationFrame(rafId);rafId=0;}
    last=0;
    if(ctx)ctx.clearRect(0,0,hostW,hostH);
  }

  return {init:init,leafBurst:leafBurst,stopAll:stopAll};
})();
