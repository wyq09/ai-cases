/* ============================================================
 * memory-flip · FX 特效模块（src/fx.js）
 * Canvas2D 粒子，印刷喜庆：铜钱（外圆内方孔）/ 红金纸屑 / 金粉
 * 规约：禁 shadowBlur（径向渐变 + globalCompositeOperation='lighter' 叠色）
 *      铜钱离屏预渲染多帧（scaleX 翻转 + 亮度衰减）复用
 *      粒子对象池 + 总量上限 ~400 保护 · DPR<=2
 *      resize/orientationchange 自适应 · document.hidden 暂停/可见恢复
 *      时间戳驱动物理（不靠帧数）· rAF 单循环、无粒子休眠
 *      零依赖 · 不碰 localStorage · 未 init 时全部接口安全 no-op
 * ============================================================ */
window.MF=window.MF||{}; MF.FX=(()=> {
  'use strict';

  var TAU=Math.PI*2;
  var RED='#B93A2B', DRED='#8F2B20', GOLD='#C99A3C', LGOLD='#E4B95B',
      CREAM='#FFF9EE', BROWN='#3A2E24';
  var POOL_MAX=400;                       // 粒子总量上限
  var COIN_FRAME_N=10, COIN_R=18, COIN_PAD=5;

  var host=null, canvas=null, ctx=null, W=0, H=0, dpr=1;
  var pool=[], nAlive=0, rafId=0, lastT=0, hidden=false, bound=false;
  var glowCache={};                       // 预渲染径向渐变光点精灵
  var coinFrames=[];                      // 铜钱翻转预渲染帧

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

  /* ---------------- 离屏预渲染 ---------------- */
  // 单枚铜钱：外圆金身 + 内圆亮金 + 中央方孔（镂空）+ 深棕描边 + 克制亮金高光
  function paintCoin(g,R,lw){
    g.beginPath(); g.arc(0,0,R,0,TAU);
    g.fillStyle=GOLD; g.fill();
    g.lineWidth=lw; g.strokeStyle=BROWN; g.stroke();
    g.beginPath(); g.arc(0,0,R*0.74,0,TAU);
    g.fillStyle=LGOLD; g.fill();
    var h=R*0.32;                          // 方孔（镂空到透明）
    g.save(); g.globalCompositeOperation='destination-out';
    g.fillRect(-h,-h,h*2,h*2); g.restore();
    g.lineWidth=lw; g.strokeStyle=BROWN; g.strokeRect(-h,-h,h*2,h*2);
    g.beginPath(); g.arc(0,0,R*0.86,-2.35,-1.25);
    g.strokeStyle='rgba(255,249,238,.8)'; g.lineWidth=lw*0.9; g.stroke();
  }
  // 多帧：scaleX=|cos| 模拟翻转，侧缘帧叠深色（source-atop 只压 coin 像素）
  function buildCoinFrames(){
    if(coinFrames.length||typeof document==='undefined') return;
    var S=(COIN_R+COIN_PAD)*2;
    for(var i=0;i<COIN_FRAME_N;i++){
      var ax=Math.abs(Math.cos(i/COIN_FRAME_N*Math.PI));
      var c=document.createElement('canvas');
      c.width=S*2; c.height=S*2;
      var g=c.getContext('2d');
      g.setTransform(2*Math.max(ax,0.06),0,0,2,S,S);
      paintCoin(g,COIN_R,2);
      var sh=0.45*(1-ax);
      if(sh>0.02){
        g.setTransform(1,0,0,1,0,0);
        g.globalCompositeOperation='source-atop';
        g.fillStyle='rgba(43,38,34,'+sh.toFixed(3)+')';
        g.fillRect(0,0,c.width,c.height);
        g.globalCompositeOperation='source-over';
      }
      coinFrames.push({c:c,S:S});
    }
  }
  // 光点精灵：径向渐变（禁 shadowBlur，靠 lighter 叠色出光感）
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
    p.swA=0; p.swF=0; p.seed=rand(0,TAU); p.hi=false;
    p.x0=0; p.y0=0; p.cx=0; p.cy=0; p.tx=0; p.ty=0;
    p.delay=0; p.dur=1; p.turns=2; p.img=null; p.grp=null;
    p.r0=0; p.r1=0; p.rCur=0; p.a0=0;
    nAlive++;
    return p;
  }
  function kill(p){ p.on=false; nAlive--; }

  /* ---------------- 主循环（时间戳物理，无粒子休眠） ---------------- */
  function ensureLoop(){
    if(!ctx||rafId||hidden) return;
    lastT=performance.now();
    rafId=requestAnimationFrame(tick);
  }
  function tick(now){
    rafId=0;
    if(hidden||!ctx) return;
    var dt=clamp((now-lastT)/1000,0,0.05);   // 后台切回不跳帧
    lastT=now;
    step(dt);
    render();
    if(nAlive>0) rafId=requestAnimationFrame(tick);
    else ctx.clearRect(0,0,W,H);             // 全灭：清屏并休眠
  }
  function step(dt){
    for(var i=0;i<pool.length;i++){
      var p=pool[i];
      if(!p.on) continue;
      p.age+=dt;
      switch(p.type){
        case 'bit':                          // 纸屑：重力+阻力+横向摆+自转+scaleX 翻转
          p.vy+=p.g*dt;
          p.vx-=p.vx*p.drag*dt; p.vy-=p.vy*p.drag*0.3*dt;
          p.x+=p.vx*dt+Math.sin(p.age*p.swF+p.seed)*p.swA*dt;
          p.y+=p.vy*dt;
          p.rot+=p.vr*dt; p.flip+=p.vflip*dt;
          if(p.age>=p.life||p.y>H+28){ kill(p); }
          else { var t=p.age/p.life; p.alpha=t>0.72?(1-t)/0.28:1; }
          break;
        case 'dot':                          // 金粉光点
          p.vx-=p.vx*p.drag*dt; p.vy-=p.vy*p.drag*dt;
          p.vy+=p.g*dt;
          p.x+=p.vx*dt; p.y+=p.vy*dt;
          if(p.age>=p.life){ kill(p); }
          else { var k=p.age/p.life; p.alpha=Math.pow(1-k,1.4); }
          break;
        case 'coin': {                       // 铜钱：二次贝塞尔 + smoothstep 缓动
          var u=(p.age-p.delay)/p.dur;
          if(u<0) break;                     // 起飞延迟中
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
        case 'flash': {
          if(p.age>=p.life){ kill(p); break; }
          var ft=p.age/p.life, q=1-ft;
          p.alpha=p.a0*q*q;
          break;
        }
      }
    }
  }
  function render(){
    ctx.clearRect(0,0,W,H);
    var i,p;
    ctx.globalCompositeOperation='lighter';          // 叠色层：光点
    for(i=0;i<pool.length;i++){ p=pool[i]; if(p.on&&p.type==='dot') drawDot(p); }
    ctx.globalCompositeOperation='source-over';      // 实色层：纸屑/铜钱/圆环
    ctx.globalAlpha=1;                               // 防 alpha 泄漏进实色层
    for(i=0;i<pool.length;i++){
      p=pool[i]; if(!p.on) continue;
      if(p.type==='bit') drawBit(p);
      else if(p.type==='coin') drawCoinP(p);
      else if(p.type==='ring') drawRing(p);
    }
    for(i=0;i<pool.length;i++){ p=pool[i]; if(p.on&&p.type==='flash') drawFlash(p); }
    ctx.globalAlpha=1;
  }
  function drawDot(p){
    var sp=glowSprite(p.color);
    var d=p.size*(1-0.35*(p.age/p.life))*2;
    ctx.globalAlpha=p.alpha;
    ctx.drawImage(sp,p.x-d/2,p.y-d/2,d,d);
  }
  function drawBit(p){
    var sx=Math.abs(Math.cos(p.flip)); if(sx<0.12) sx=0.12;   // scaleX 翻转
    ctx.save();
    ctx.translate(p.x,p.y); ctx.rotate(p.rot);
    ctx.globalAlpha=p.alpha; ctx.fillStyle=p.color;
    ctx.fillRect(-p.size*sx/2,-p.h/2,p.size*sx,p.h);
    if(p.hi){ ctx.fillStyle='rgba(255,249,238,.5)'; ctx.fillRect(-p.size*sx/2,-p.h/2,p.size*sx,1); }
    ctx.restore();
  }
  function drawCoinP(p){
    if(p.age<p.delay) return;
    ctx.globalAlpha=1;                               // 铜钱是实色印刷物，不吃残留 alpha
    var img=p.img;
    if(img&&img.complete&&img.naturalWidth>0){       // 自定义 icon：drawImage+scaleX
      var sx=Math.abs(Math.cos(p.flip));
      ctx.save();
      ctx.translate(p.x,p.y); ctx.scale(Math.max(sx,0.08),1);
      ctx.drawImage(img,-p.size/2,-p.size/2,p.size,p.size);
      ctx.restore();
      return;
    }
    if(!coinFrames.length) return;
    var fi=Math.floor((((p.flip%TAU)+TAU)%TAU)/TAU*COIN_FRAME_N)%COIN_FRAME_N;
    var f=coinFrames[fi];
    var ds=f.S*(p.size/(2*COIN_R));                  // 显示直径 ~14-18px
    ctx.drawImage(f.c,p.x-ds/2,p.y-ds/2,ds,ds);
  }
  function drawRing(p){
    ctx.globalAlpha=p.alpha;
    ctx.strokeStyle=p.color;
    ctx.lineWidth=1+5*(1-p.age/p.life);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.rCur,0,TAU); ctx.stroke();
    ctx.globalAlpha=p.alpha*0.45;                    // 内圈回声
    ctx.lineWidth=Math.max(1,ctx.lineWidth*0.5);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.rCur*0.62,0,TAU); ctx.stroke();
    ctx.globalAlpha=1;
  }
  function drawFlash(p){
    ctx.globalAlpha=p.alpha;
    ctx.fillStyle=p.color;
    ctx.fillRect(0,0,W,H);
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
    else ensureLoop();                                // lastT 重置，无时间跳变
  }
  function bindGlobal(){
    if(bound) return; bound=true;
    window.addEventListener('resize',resize);
    window.addEventListener('orientationchange',function(){ resize(); setTimeout(resize,260); });
    document.addEventListener('visibilitychange',onVis);
  }

  /* ---------------- 对外接口 ---------------- */
  // hostEl 内建铺满 canvas（绝对定位 inset:0、pointer-events:none，zIndex 由宿主管）
  function init(hostEl){
    if(!hostEl||typeof hostEl.appendChild!=='function') return;   // 安全 no-op
    if(canvas&&canvas.parentNode===hostEl) return;                // 幂等
    if(canvas&&canvas.parentNode) canvas.parentNode.removeChild(canvas);
    host=hostEl;
    canvas=document.createElement('canvas');
    canvas.setAttribute('data-mf-fx','');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    hostEl.appendChild(canvas);
    ctx=canvas.getContext('2d');
    if(!ctx){ host=null; canvas=null; return; }
    resize(); buildCoinFrames(); bindGlobal();
  }

  // 纸屑/光点从点爆开；opt{n,colors}
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

  // n 个铜钱（或 opt.icon dataURI）沿二次贝塞尔（随机控制点偏移）A→B，全数抵达回调 done 一次
  function coinFly(x1,y1,x2,y2,opt){
    if(!ctx) return;
    opt=opt||{};
    x1=num(x1,W/2); y1=num(y1,H/2); x2=num(x2,W/2); y2=num(y2,H/2);
    var done=(typeof opt.done==='function')?opt.done:null;
    var grp={left:0,fired:false,done:done};           // stopAll 中止时 done 不回调
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
      p.delay=i*rand(0.05,0.085);                     // 逐枚错峰
      p.dur=rand(0.62,0.92);
      p.size=rand(14,18);
      p.turns=rand(1.5,3.2);
      p.img=img; p.grp=grp;
      grp.left++;
    }
    if(grp.left===0){ grp.fired=true; if(done){ try{done();}catch(e){} } }
    ensureLoop();
  }

  // 全屏红金彩带雨：矩形纸屑 rotate + scaleX 翻转
  function confetti(n){
    if(!ctx) return;
    var want=clamp(num(n,80)|0,1,POOL_MAX);
    var colors=[RED,DRED,GOLD,LGOLD,CREAM];
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

  // 单点火花（金粉）
  function spark(x,y,color,n){
    if(!ctx) return;
    x=num(x,W/2); y=num(y,H/2);
    var col=safeColor(color,LGOLD);
    var want=clamp(num(n,10)|0,1,64);
    for(var i=0;i<want;i++){
      var p=spawn('dot'); if(!p) break;
      var a=rand(0,TAU), sp=rand(60,260);
      p.x=x; p.y=y;
      p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp;
      p.g=180; p.drag=3.2; p.life=rand(0.28,0.5); p.size=rand(3,7);
      p.color=Math.random()<0.3?CREAM:col;
    }
    ensureLoop();
  }

  // 全屏闪色，快速淡出
  function flash(color,alpha){
    if(!ctx) return;
    var p=spawn('flash'); if(!p) return;
    p.color=safeColor(color,RED);
    p.a0=clamp(num(alpha,0.16),0,1);
    p.life=0.38;
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

  // 金渐变大字 + 深描边（DOM，非 canvas），WAAPI 弹入 0.6→1.05→1、停留淡出自毁，居中
  function bigText(text,opt){
    if(!host) return;
    opt=opt||{};
    var txt=(text==null?'':String(text));
    if(!txt) return;
    var olds=host.querySelectorAll('[data-mf-bt]');   // 替换上一条，避免叠字
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
    wrap.setAttribute('data-mf-bt','');
    wrap.style.cssText='position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;'
      +'align-items:center;justify-content:center;pointer-events:none;';

    var box=document.createElement('div');
    box.style.cssText='position:relative;text-align:center;';
    var base='font-family:'+FONT+';font-weight:900;font-size:'+fs+'px;line-height:1.1;letter-spacing:.02em;white-space:nowrap;';

    var st=document.createElement('div');             // 描边层：-webkit-text-stroke + 实色偏移投影
    st.textContent=txt;
    st.style.cssText=base+'color:'+BROWN+';-webkit-text-stroke:'+strokeW+'px '+BROWN+';'
      +'text-shadow:'+Math.max(3,Math.round(fs*0.06))+'px '+Math.max(3,Math.round(fs*0.06))+'px 0 rgba(58,46,36,.85);';

    var fl=document.createElement('div');             // 金渐变填充层
    fl.textContent=txt;
    fl.style.cssText=base+'position:absolute;left:0;top:0;width:100%;'
      +'background:linear-gradient(180deg,#F6E2A8 0%,'+color+' 46%,'+GOLD+' 74%,'+LGOLD+' 100%);'
      +'-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;';

    box.appendChild(st); box.appendChild(fl); wrap.appendChild(box);

    if(opt.sub){                                      // 副标题：红底米白小字，印刷印章感
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
    }catch(e){ /* WAAPI 不可用：靠兜底定时器自毁 */ }
    setTimeout(gone_,dur+250);
  }

  // 清空一切（中止中的 coinFly 不触发 done）
  function stopAll(){
    for(var i=0;i<pool.length;i++) pool[i].on=false;
    nAlive=0;
    if(rafId){ cancelAnimationFrame(rafId); rafId=0; }
    if(ctx) ctx.clearRect(0,0,W,H);
    if(host){
      var olds=host.querySelectorAll('[data-mf-bt]');
      for(var j=0;j<olds.length;j++){ if(olds[j].parentNode) olds[j].parentNode.removeChild(olds[j]); }
    }
  }

  return {
    init:init,
    burst:burst,
    coinFly:coinFly,
    confetti:confetti,
    spark:spark,
    flash:flash,
    ring:ring,
    bigText:bigText,
    stopAll:stopAll
  };
})();
