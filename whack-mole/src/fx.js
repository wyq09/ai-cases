/* ============================================================
 * whack-mole · FX 特效模块（src/fx.js）
 * Canvas2D 粒子，草地游园会印刷风：锤击星 / 尘土草屑 / 红金草绿纸屑
 * 规约：禁 shadowBlur（径向渐变 + globalCompositeOperation='lighter' 叠色）
 *      粒子对象池 + 总量上限 ~400 保护 · DPR<=2
 *      resize/orientationchange 自适应 · document.hidden 暂停/可见恢复
 *      时间戳驱动物理 · rAF 单循环、无粒子休眠 · 零依赖 · 不碰 localStorage
 *      未 init 时全部接口安全 no-op
 * ============================================================ */
window.WM=window.WM||{}; WM.FX=(()=> {
  'use strict';

  var TAU=Math.PI*2;
  var RED='#B93A2B', DRED='#8F2B20', GOLD='#C99A3C', LGOLD='#E4B95B',
      CREAM='#FFF9EE', BROWN='#3A2E24', GRASS='#7DA45B', EARTH='#C9A96A';
  var POOL_MAX=400;

  var host=null, canvas=null, ctx=null, W=0, H=0, dpr=1;
  var pool=[], nAlive=0, rafId=0, lastT=0, hidden=false, bound=false;
  var glowCache={};
  var shakeTok=0;

  /* ---------------- 小工具 ---------------- */
  function num(v,d){ v=+v; return isFinite(v)?v:d; }
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function rand(a,b){ return a+Math.random()*(b-a); }
  function pick(a){ return a[(Math.random()*a.length)|0]; }
  function safeColor(c,d){
    if(typeof c!=='string') return d;
    var s=c.charAt(0)==='#'?c.slice(1):c;
    if(s.length===3) s=s.charAt(0)+s.charAt(0)+s.charAt(1)+s.charAt(1)+s.charAt(2)+s.charAt(2);
    return /^[0-9a-fA-F]{6}$/.test(s)?('#'+s.toLowerCase()):d;
  }
  function rgba(hex,a){
    var n=parseInt(hex.slice(1),16);
    return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+(+a).toFixed(3)+')';
  }
  function easeOutCubic(t){ return 1-Math.pow(1-t,3); }

  /* ---------------- 预渲染精灵 ---------------- */
  function glowSprite(color){
    var hit=glowCache[color];
    if(hit) return hit;
    if(Object.keys(glowCache).length>16) glowCache={};
    var s=64, cv=document.createElement('canvas');
    cv.width=cv.height=s;
    var g=cv.getContext('2d');
    var gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    gr.addColorStop(0,rgba(color,0.85));
    gr.addColorStop(0.35,rgba(color,0.32));
    gr.addColorStop(1,rgba(color,0));
    g.fillStyle=gr; g.fillRect(0,0,s,s);
    glowCache[color]=cv;
    return cv;
  }
  // 白星精灵（锤击命中核心闪光）：四角星形实色
  function starSprite(){
    if(starSprite._c) return starSprite._c;
    var s=56, cv=document.createElement('canvas');
    cv.width=cv.height=s;
    var g=cv.getContext('2d');
    g.translate(s/2,s/2);
    var R=s/2-3, r=R*0.38;
    g.beginPath();
    for(var i=0;i<8;i++){
      var ang=i/8*TAU-Math.PI/2, rad=(i%2===0)?R:r;
      var x=Math.cos(ang)*rad, y=Math.sin(ang)*rad;
      if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.closePath();
    g.fillStyle=CREAM; g.fill();
    g.lineWidth=2; g.strokeStyle=rgba(BROWN,0.55); g.stroke();
    starSprite._c=cv;
    return cv;
  }

  /* ---------------- 对象池 ---------------- */
  function spawn(type){
    if(!ctx||nAlive>=POOL_MAX) return null;
    var cell=null;
    for(var i=0;i<pool.length;i++){ if(!pool[i].on){ cell=pool[i]; break; } }
    if(!cell){ if(pool.length>=POOL_MAX+64) return null; cell={}; pool.push(cell); }
    var p=cell;
    p.on=true; p.type=type; p.age=0;
    p.x=0; p.y=0; p.vx=0; p.vy=0; p.g=0; p.drag=0;
    p.size=6; p.h=0; p.color=LGOLD; p.alpha=1; p.life=1;
    p.rot=0; p.vr=0; p.flip=0; p.vflip=0;
    p.swA=0; p.swF=0; p.seed=rand(0,TAU);
    p.x0=0; p.y0=0; p.cx=0; p.cy=0; p.tx=0; p.ty=0;
    p.delay=0; p.dur=1; p.turns=2; p.img=null; p.grp=null;
    p.r0=0; p.r1=0; p.rCur=0; p.a0=0; p.n=6;
    nAlive++;
    return p;
  }
  function kill(p){ p.on=false; nAlive--; }

  /* ---------------- 主循环 ---------------- */
  function ensureLoop(){
    if(!ctx||rafId||hidden) return;
    lastT=performance.now();
    rafId=requestAnimationFrame(tick);
  }
  function tick(now){
    rafId=0;
    if(hidden||!ctx) return;
    var dt=clamp((now-lastT)/1000,0,0.05);
    lastT=now;
    step(dt);
    render();
    if(nAlive>0) rafId=requestAnimationFrame(tick);
    else ctx.clearRect(0,0,W,H);
  }
  function step(dt){
    for(var i=0;i<pool.length;i++){
      var p=pool[i];
      if(!p.on) continue;
      p.age+=dt;
      switch(p.type){
        case 'bit':
          p.vy+=p.g*dt;
          p.vx-=p.vx*p.drag*dt; p.vy-=p.vy*p.drag*0.3*dt;
          p.x+=p.vx*dt+Math.sin(p.age*p.swF+p.seed)*p.swA*dt;
          p.y+=p.vy*dt;
          p.rot+=p.vr*dt; p.flip+=p.vflip*dt;
          if(p.age>=p.life||p.y>H+28){ kill(p); }
          else { var t=p.age/p.life; p.alpha=t>0.72?(1-t)/0.28:1; }
          break;
        case 'dot':
          p.vx-=p.vx*p.drag*dt; p.vy-=p.vy*p.drag*dt;
          p.vy+=p.g*dt;
          p.x+=p.vx*dt; p.y+=p.vy*dt;
          if(p.age>=p.life){ kill(p); }
          else { var k=p.age/p.life; p.alpha=Math.pow(1-k,1.4); }
          break;
        case 'star':                           // 锤击星：放射线扩张 + 白星缩放淡出
          if(p.age>=p.life){ kill(p); break; }
          break;
        case 'dust':                           // 尘土：钝重上抛小落
          p.vy+=p.g*dt; p.vx-=p.vx*p.drag*dt;
          p.x+=p.vx*dt; p.y+=p.vy*dt;
          p.rot+=p.vr*dt;
          if(p.age>=p.life){ kill(p); }
          else { var d=p.age/p.life; p.alpha=d>0.55?(1-d)/0.45:1; }
          break;
        case 'coin': {
          var u=(p.age-p.delay)/p.dur;
          if(u<0) break;
          if(u>=1){
            kill(p);
            var g0=p.grp;
            if(g0){ g0.left--;
              if(g0.left<=0&&!g0.fired){ g0.fired=true; var cb=g0.done; if(cb){ try{cb();}catch(e){} } } }
            break;
          }
          var e=u*u*(3-2*u), v=1-e;
          p.x=v*v*p.x0+2*v*e*p.cx+e*e*p.tx;
          p.y=v*v*p.y0+2*v*e*p.cy+e*e*p.ty;
          p.flip=e*p.turns*TAU;
          break;
        }
        case 'ring': {
          if(p.age>=p.life){ kill(p); break; }
          var rt=p.age/p.life;
          p.rCur=p.r0+(p.r1-p.r0)*easeOutCubic(rt);
          p.alpha=1-rt;
          break;
        }
      }
    }
  }
  function render(){
    ctx.clearRect(0,0,W,H);
    var i,p;
    ctx.globalCompositeOperation='lighter';
    for(i=0;i<pool.length;i++){ p=pool[i]; if(p.on&&p.type==='dot') drawDot(p); }
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
    for(i=0;i<pool.length;i++){
      p=pool[i]; if(!p.on) continue;
      if(p.type==='bit') drawBit(p);
      else if(p.type==='coin') drawCoinP(p);
      else if(p.type==='ring') drawRing(p);
      else if(p.type==='dust') drawDust(p);
      else if(p.type==='star') drawStar(p);
    }
    ctx.globalAlpha=1;
  }
  function drawDot(p){
    var sp=glowSprite(p.color);
    var d=p.size*(1-0.35*(p.age/p.life))*2;
    ctx.globalAlpha=p.alpha;
    ctx.drawImage(sp,p.x-d/2,p.y-d/2,d,d);
  }
  function drawBit(p){
    var sx=Math.abs(Math.cos(p.flip)); if(sx<0.12) sx=0.12;
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
    ctx.fillRect(-p.size*sx/2,-p.h/2,p.size*sx,p.h);
    if(p.hi){ ctx.fillStyle='rgba(255,249,238,.5)'; ctx.fillRect(-p.size*sx/2,-p.h/2,p.size*sx,1); }
    ctx.restore();
  }
  // 锤击星：白色四角星 + 放射短线（实色印刷感，不用发光）
  function drawStar(p){
    var t=p.age/p.life, q=1-t;
    var sc=(0.55+easeOutCubic(t)*0.9)*p.size/14;
    var sp=starSprite(), d=sp.width*sc;
    ctx.globalAlpha=Math.min(1,q*1.6);
    ctx.drawImage(sp,p.x-d/2,p.y-d/2,d,d);
    // 放射线
    var n=p.n, len=p.size*(0.9+t*1.6);
    ctx.strokeStyle=rgba(p.color,q*0.9);
    ctx.lineWidth=Math.max(1,3*q);
    ctx.lineCap='round';
    for(var i=0;i<n;i++){
      var a=i/n*TAU+p.seed;
      var r1=p.size*0.5+t*8, r2=r1+len*q;
      ctx.beginPath();
      ctx.moveTo(p.x+Math.cos(a)*r1,p.y+Math.sin(a)*r1);
      ctx.lineTo(p.x+Math.cos(a)*r2,p.y+Math.sin(a)*r2);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  function drawDust(p){
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.globalAlpha=p.alpha*0.9;
    ctx.fillStyle=p.color;
    ctx.beginPath();
    ctx.ellipse(0,0,p.size,p.size*0.72,0,0,TAU);
    ctx.fill();
    ctx.restore();
  }
  function drawCoinP(p){
    if(p.age<p.delay) return;
    ctx.globalAlpha=1;
    var img=p.img;
    if(img&&img.complete&&img.naturalWidth>0){
      var sx=Math.abs(Math.cos(p.flip));
      ctx.save();
      ctx.translate(p.x,p.y); ctx.scale(Math.max(sx,0.08),1);
      ctx.drawImage(img,-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
      return;
    }
    // 兜底：金色圆点+描边（本作无铜钱默认，gift 飞行默认画金圆）
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.beginPath(); ctx.arc(0,0,p.size/2,0,TAU);
    ctx.fillStyle=GOLD; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle=BROWN; ctx.stroke();
    ctx.restore();
  }
  function drawRing(p){
    ctx.globalAlpha=p.alpha;
    ctx.strokeStyle=p.color;
    ctx.lineWidth=1+5*(1-p.age/p.life);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.rCur,0,TAU); ctx.stroke();
    ctx.globalAlpha=p.alpha*0.45;
    ctx.lineWidth=Math.max(1,ctx.lineWidth*0.5);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.rCur*0.62,0,TAU); ctx.stroke();
    ctx.globalAlpha=1;
  }

  /* ---------------- 尺寸 / 可见性 ---------------- */
  function resize(){
    if(!host||!canvas) return;
    var r=host.getBoundingClientRect?host.getBoundingClientRect():null;
    W=Math.max(1,Math.round((r&&r.width)||host.clientWidth||0));
    H=Math.max(1,Math.round((r&&r.height)||host.clientHeight||0));
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(W*dpr);
    canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function onVis(){
    hidden=!!document.hidden;
    if(hidden){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
    else ensureLoop();
  }
  function bindGlobal(){
    if(bound) return; bound=true;
    window.addEventListener('resize',resize);
    window.addEventListener('orientationchange',function(){ resize(); setTimeout(resize,260); });
    document.addEventListener('visibilitychange',onVis);
  }

  /* ---------------- 对外接口 ---------------- */
  function init(hostEl){
    if(!hostEl||typeof hostEl.appendChild!=='function') return;
    if(canvas&&canvas.parentNode===hostEl) return;
    if(canvas&&canvas.parentNode) canvas.parentNode.removeChild(canvas);
    host=hostEl;
    canvas=document.createElement('canvas');
    canvas.setAttribute('data-wm-fx','');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    hostEl.appendChild(canvas);
    ctx=canvas.getContext('2d');
    if(!ctx){ host=null; canvas=null; return; }
    resize(); bindGlobal();
  }

  // 锤击命中第一反馈：白四角星 + 彩色放射线 + 金粉（星在打击点上方爆开，不遮挡 hit 态地鼠）
  function whackStar(x,y,color){
    if(!ctx) return;
    x=num(x,W/2); y=num(y,H/2)-24;
    var p=spawn('star'); if(p){
      p.x=x; p.y=y;
      p.size=rand(10,12);
      p.color=safeColor(color,LGOLD);
      p.n=6+((Math.random()*3)|0);
      p.life=0.28;
    }
    for(var i=0;i<6;i++){
      var d=spawn('dot'); if(!d) break;
      var a=rand(0,TAU), sp2=rand(70,220);
      d.x=x; d.y=y;
      d.vx=Math.cos(a)*sp2; d.vy=Math.sin(a)*sp2-40;
      d.g=300; d.drag=3; d.life=rand(0.25,0.45); d.size=rand(3,6);
      d.color=pick([LGOLD,CREAM,GOLD]);
    }
    ensureLoop();
  }

  // 敲空：土黄尘土/草屑小喷
  function dust(x,y){
    if(!ctx) return;
    x=num(x,W/2); y=num(y,H/2);
    var want=clamp(7+((Math.random()*3)|0),1,16);
    for(var i=0;i<want;i++){
      var p=spawn(Math.random()<0.35?'bit':'dust'); if(!p) break;
      var a=-Math.PI/2+rand(-0.9,0.9), sp=rand(70,190);
      p.x=x+rand(-8,8); p.y=y+rand(-3,3);
      p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp;
      p.g=rand(560,760); p.drag=1.4;
      p.life=rand(0.4,0.66);
      p.size=rand(2.6,5); p.h=p.size*0.7;
      p.color=pick([EARTH,'#8A5A33',GRASS,'#6B9350']);
      p.rot=rand(0,TAU); p.vr=rand(-8,8);
    }
    ensureLoop();
  }

  // 纸屑/光点爆开；opt{n,colors}
  function burst(x,y,opt){
    if(!ctx) return;
    opt=opt||{};
    x=num(x,W/2); y=num(y,H/2);
    var colors=(opt.colors&&opt.colors.length)
      ?[].map.call(opt.colors,function(c){ return safeColor(c,GOLD); })
      :[RED,GOLD,LGOLD,CREAM];
    var want=clamp(num(opt.n,26)|0,1,64);
    for(var i=0;i<want;i++){
      var isDot=Math.random()<0.45;
      var p=spawn(isDot?'dot':'bit'); if(!p) break;
      var a=rand(0,TAU);
      if(isDot){
        var sp=rand(110,400);
        p.x=x; p.y=y;
        p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp-rand(0,110);
        p.g=260; p.drag=2.4; p.life=rand(0.45,0.9); p.size=rand(5,11);
        p.color=pick([LGOLD,GOLD,CREAM]);
      }else{
        var sp2=rand(130,430);
        p.x=x; p.y=y;
        p.vx=Math.cos(a)*sp2; p.vy=Math.sin(a)*sp2-90;
        p.g=rand(720,950); p.drag=1.0; p.life=rand(0.7,1.15);
        p.size=rand(5,9); p.h=rand(3,5.5);
        p.rot=rand(0,TAU); p.vr=rand(-9,9);
        p.flip=rand(0,TAU); p.vflip=rand(5,11)*(Math.random()<0.5?-1:1);
        p.swA=rand(6,18); p.swF=rand(2,4);
        p.color=pick(colors); p.hi=Math.random()<0.35;
      }
    }
    ensureLoop();
  }

  // 飘分（DOM）：+100 / -200! 弹起淡出自毁
  function floatScore(x,y,text,opt){
    if(!host) return;
    opt=opt||{};
    var el=document.createElement('div');
    el.className='wm-float';
    el.setAttribute('data-wm-fs','');
    el.textContent=(text==null?'':String(text));
    var size=clamp(num(opt.size,17),11,42);
    var color=safeColor(opt.color,RED);
    el.style.cssText+=';left:'+num(x,W/2)+'px;top:'+num(y,H/2)+'px;'
      +'font-size:'+size+'px;color:'+color+';';
    host.appendChild(el);
    var gone=false;
    function rm(){ if(gone) return; gone=true; if(el.parentNode) el.parentNode.removeChild(el); }
    try{
      var anim=el.animate([
        {transform:'translate(-50%,-50%) scale(.5)',opacity:0,offset:0},
        {transform:'translate(-50%,-88%) scale(1.12)',opacity:1,offset:.22,easing:'cubic-bezier(.2,.9,.35,1)'},
        {transform:'translate(-50%,-150%) scale(1)',opacity:1,offset:.6},
        {transform:'translate(-50%,-210%) scale(.94)',opacity:0,offset:1}
      ],{duration:clamp(num(opt.dur,900),300,2000),fill:'forwards'});
      anim.onfinish=rm;
    }catch(e){}
    setTimeout(rm,2600);
  }

  // n 枚奖品（opt.icon dataURI）沿贝塞尔 A→B，全数抵达回调 done 一次
  function coinFly(x1,y1,x2,y2,opt){
    if(!ctx) return;
    opt=opt||{};
    x1=num(x1,W/2); y1=num(y1,H/2); x2=num(x2,W/2); y2=num(y2,H/2);
    var done=(typeof opt.done==='function')?opt.done:null;
    var grp={left:0,fired:false,done:done};
    var img=null;
    if(opt.icon&&typeof Image!=='undefined'){ img=new Image(); img.src=opt.icon; }
    var dx=x2-x1, dy=y2-y1, dist=Math.sqrt(dx*dx+dy*dy)||1;
    var px=-dy/dist, py=dx/dist;
    var want=clamp(num(opt.n,6)|0,1,48);
    for(var i=0;i<want;i++){
      var p=spawn('coin'); if(!p) break;
      var off=clamp(rand(0.15,0.45)*dist*(Math.random()<0.5?-1:1),-H*0.45,H*0.45);
      p.x0=x1; p.y0=y1; p.tx=x2; p.ty=y2;
      p.cx=(x1+x2)/2+px*off; p.cy=(y1+y2)/2+py*off;
      p.delay=i*rand(0.05,0.085);
      p.dur=rand(0.55,0.8);
      p.size=rand(13,17);
      p.turns=rand(1.5,3.2);
      p.img=img; p.grp=grp;
      grp.left++;
    }
    if(grp.left===0){ grp.fired=true; if(done){ try{done();}catch(e){} } }
    ensureLoop();
  }

  // 全屏彩带雨：红金+草绿
  function confetti(n){
    if(!ctx) return;
    var want=clamp(num(n,80)|0,1,POOL_MAX);
    var colors=[RED,DRED,GOLD,LGOLD,CREAM,GRASS,EARTH];
    for(var i=0;i<want;i++){
      var p=spawn('bit'); if(!p) break;
      p.x=rand(0,W); p.y=rand(-H*0.12,-8);
      p.vx=rand(-40,40); p.vy=rand(40,140);
      p.g=rand(240,420); p.drag=0.5;
      p.life=rand(2.2,3.2);
      p.size=rand(5,9); p.h=rand(3,5.5);
      p.rot=rand(0,TAU); p.vr=rand(-7,7);
      p.flip=rand(0,TAU); p.vflip=rand(4,9)*(Math.random()<0.5?-1:1);
      p.swA=rand(10,26); p.swF=rand(2,4.5);
      p.color=pick(colors); p.hi=Math.random()<0.3;
    }
    ensureLoop();
  }

  // 扩散圆环
  function ring(x,y,color){
    if(!ctx) return;
    x=num(x,W/2); y=num(y,H/2);
    var p=spawn('ring'); if(!p) return;
    p.x=x; p.y=y;
    p.color=safeColor(color,LGOLD);
    p.r0=6; p.r1=clamp(Math.min(W,H)*0.24,48,96);
    p.life=0.5;
    ensureLoop();
  }

  // 金渐变大字 + 深描边（DOM），WAAPI 弹入停留淡出自毁
  function bigText(text,opt){
    if(!host) return;
    opt=opt||{};
    var txt=(text==null?'':String(text));
    if(!txt) return;
    var olds=host.querySelectorAll('[data-wm-bt]');
    for(var i=0;i<olds.length;i++){ if(olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]); }

    var w=W||host.clientWidth||390;
    var scale=clamp(num(opt.scale,1),0.4,3);
    var dur=clamp(num(opt.dur,1500),600,6000);
    var color=safeColor(opt.color,LGOLD);
    var fs=Math.round(clamp(w*0.16,36,80)*scale);
    fs=Math.max(18,Math.min(fs,Math.floor(w*0.92/Math.max(2,txt.length))));
    var strokeW=Math.round(clamp(fs*0.16,6,14));
    var FONT='system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

    var wrap=document.createElement('div');
    wrap.setAttribute('data-wm-bt','');
    wrap.style.cssText='position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;'
      +'align-items:center;justify-content:center;pointer-events:none;';

    var box=document.createElement('div');
    box.style.cssText='position:relative;text-align:center;';
    var base='font-family:'+FONT+';font-weight:900;font-size:'+fs+'px;line-height:1.1;letter-spacing:.02em;white-space:nowrap;';

    var st=document.createElement('div');
    st.textContent=txt;
    st.style.cssText=base+'color:'+BROWN+';-webkit-text-stroke:'+strokeW+'px '+BROWN+';'
      +'text-shadow:'+Math.max(3,Math.round(fs*0.06))+'px '+Math.max(3,Math.round(fs*0.06))+'px 0 rgba(58,46,36,.85);';

    var fl=document.createElement('div');
    fl.textContent=txt;
    fl.style.cssText=base+'position:absolute;left:0;top:0;width:100%;'
      +'background:linear-gradient(180deg,#F6E2A8 0%,'+color+' 46%,'+GOLD+' 74%,'+LGOLD+' 100%);'
      +'-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;';

    box.appendChild(st); box.appendChild(fl); wrap.appendChild(box);

    if(opt.sub){
      var sub=document.createElement('div');
      sub.textContent=String(opt.sub);
      var sfs=Math.max(12,Math.round(fs*0.26));
      sub.style.cssText='margin-top:'+Math.round(fs*0.12)+'px;font-family:'+FONT+';font-weight:700;'
        +'font-size:'+sfs+'px;line-height:1;color:'+CREAM+';background:'+RED+';'
        +'border:2px solid '+BROWN+';border-radius:4px;box-shadow:2px 2px 0 rgba(58,46,36,.9);'
        +'padding:'+Math.round(sfs*0.32)+'px '+Math.round(sfs*0.7)+'px;letter-spacing:.08em;';
      wrap.appendChild(sub);
    }
    host.appendChild(wrap);

    var tIn=Math.min(420,Math.round(dur*0.32));
    var tOut=Math.min(460,Math.round(dur*0.34));
    var kf=[
      {transform:'scale(0.6)',opacity:0,offset:0,easing:'cubic-bezier(.2,.85,.3,1.1)'},
      {transform:'scale(1.05)',opacity:1,offset:Math.min(0.45,tIn/dur*0.8)},
      {transform:'scale(1)',opacity:1,offset:Math.min(0.5,tIn/dur)},
      {transform:'scale(1)',opacity:1,offset:Math.max(0.55,(dur-tOut)/dur)},
      {transform:'scale(1.06)',opacity:0,offset:1}
    ];
    var gone=false;
    function gone_(){ if(gone) return; gone=true; if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    try{
      var anim=wrap.animate(kf,{duration:dur,fill:'forwards'});
      anim.onfinish=gone_;
    }catch(e){}
    setTimeout(gone_,dur+250);
  }

  // 抖动宿主元素（bomb 抖屏）：WAAPI 随机位移，结束精确复位
  function shake(el, ms){
    if(!el||!el.animate) return;
    var dur=clamp(num(ms,320),80,1200);
    var tok=++shakeTok;
    try{
      var anim=el.animate([
        {transform:'translate(0,0)'},
        {transform:'translate(-6px,3px)'},
        {transform:'translate(6px,-3px)'},
        {transform:'translate(-5px,-2px)'},
        {transform:'translate(4px,2px)'},
        {transform:'translate(0,0)'}
      ],{duration:dur,easing:'linear'});
      anim.onfinish=function(){ if(tok===shakeTok) el.style.transform=''; };
    }catch(e){}
  }

  function stopAll(){
    for(var i=0;i<pool.length;i++) pool[i].on=false;
    nAlive=0;
    if(rafId){ cancelAnimationFrame(rafId); rafId=0; }
    if(ctx) ctx.clearRect(0,0,W,H);
    if(host){
      var olds=host.querySelectorAll('[data-wm-bt],[data-wm-fs]');
      for(var j=0;j<olds.length;j++){ if(olds[j].parentNode) olds[j].parentNode.removeChild(olds[j]); }
    }
    shakeTok++;
  }

  return {
    init:init,
    whackStar:whackStar,
    dust:dust,
    burst:burst,
    floatScore:floatScore,
    coinFly:coinFly,
    confetti:confetti,
    ring:ring,
    bigText:bigText,
    shake:shake,
    stopAll:stopAll
  };
})();
