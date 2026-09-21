/* =========================================================================
 * GP.FX — 《重力弹球王》轻量粒子特效（打击感负责）
 *   burst(x,y,color,n)      发光火花四散（重力+阻尼+闪烁, lighter）
 *   floatText(x,y,str,color) 浮动分数（上飘+淡出, 800 字重, 深描边+亮填充, 置顶层）
 *   swallow(x,y)            漩涡吞噬（内旋碎片 + 收缩环 + 星尘, 灰紫/暖白）
 *   ring(x,y,color)         扩散冲击环（线宽随寿命变细, lighter）
 *   shake(mag)              只存震动强度, 偏移由主循环自算（本模块不碰 ctx）
 *   update(dt)/draw(ctx)/clear()
 * 纪律: 禁 shadowBlur —— 发光一律「离屏径向渐变精灵(64px 圆盘, 按色缓存)
 *       + globalCompositeOperation='lighter' 叠色」
 *       对象池 + 硬上限 320 · 池满优先回收低价值最老粒子 · swap-pop 回收
 *       update 与 draw 严格分离（draw 不推进）· dt>0.05 钳制 · hidden 不积累
 *       ctx 已由游戏层变换到场地逻辑坐标(宽 390): 本模块不做 setTransform/清屏/DPR
 *       无 DOM 环境(node)全部安全 NOOP, require 不炸
 * ========================================================================= */
;(function(){
'use strict';

var HAS_DOC=(typeof document!=='undefined');
var root=(typeof window!=='undefined')?window:globalThis;
var GP=root.GP=(root.GP||{});
var FX=GP.FX=(GP.FX||{});

// ---------- 常量 ----------
var TAU=Math.PI*2;
var MAXP=320;                          // 粒子硬上限
var T_SPARK=0,T_SWIRL=1,T_RING=2,T_TEXT=3;
var VALUE=[0,0,1,2];                   // 池满回收价值: 数值小者先被回收
var WARM='255,244,220';                // 暖白（星尘/火花掺色）
var LILAC='184,168,216';               // 灰紫 #b8a8d8（吞噬专用）
var MAX_TEXT=12;                       // 浮动文字同屏上限, 超出丢最旧
var PREWARM=['#b9c93e','#8d78cf','#6fb9e6','#3cb4cc','#6fbe4e','#d99a34',
             '#d96f98','#9feaf2','#ffffff','#fff4dc','#b8a8d8']; // 关卡色板预烘焙

// ---------- 状态 ----------
var canvas=null;                       // 只存引用
var list=[],pool=[];                   // 活动粒子 / 回收池
var trauma=0;                          // 震动强度（衰减于 update, 偏移主循环自算）

// ---------- 颜色: '#rgb'/'#rrggbb'/'rgb(..)'/'rgba(..)' -> 'r,g,b'（带缓存） ----------
var _rgbCache={};
function rgbOf(col,fallback){
  var key=(col===undefined||col===null)?'':(''+col);
  var v=_rgbCache[key];
  if(v!==undefined) return v;
  var r,g,b,m;
  if(key.charAt(0)==='#'){
    var hex=key.length===4?key.slice(1).replace(/./g,'$&$&'):key.slice(1);
    r=parseInt(hex.slice(0,2),16); g=parseInt(hex.slice(2,4),16); b=parseInt(hex.slice(4,6),16);
  }else if((m=key.match(/[\d.]+/g))&&m.length>=3){
    r=+m[0]; g=+m[1]; b=+m[2];
  }else{ r=g=b=NaN; }
  if(isNaN(r)||isNaN(g)||isNaN(b)) v=fallback||WARM;
  else v=(r|0)+','+(g|0)+','+(b|0);
  _rgbCache[key]=v;
  return v;
}

// ---------- 发光精灵: 64px 径向渐变圆盘, 按 'r,g,b' 缓存（无 DOM 返回 null） ----------
var _sprites={};
function glow(rgb){
  var s=_sprites[rgb];
  if(s!==undefined) return s;
  if(!HAS_DOC){ _sprites[rgb]=null; return null; }
  var c=document.createElement('canvas'); c.width=c.height=64;
  var g=c.getContext('2d');
  if(g){
    var gr=g.createRadialGradient(32,32,0,32,32,32);
    gr.addColorStop(0,'rgba('+rgb+',1)');
    gr.addColorStop(0.25,'rgba('+rgb+',0.62)');
    gr.addColorStop(0.6,'rgba('+rgb+',0.17)');
    gr.addColorStop(1,'rgba('+rgb+',0)');
    g.fillStyle=gr; g.fillRect(0,0,64,64);
  }
  _sprites[rgb]=c;
  return c;
}

// ---------- 对象池: 硬上限 MAXP, 满时原地重用「价值最低且最老」的槽位 ----------
function acquire(){
  if(list.length<MAXP){ var p=pool.pop()||{}; list.push(p); return p; }
  var bi=0,bv=99,ba=-1;
  for(var i=0;i<list.length;i++){
    var q=list[i],v=VALUE[q.type]||0;
    if(v>bv) continue;
    if(v<bv||q.age>ba){ bi=i; bv=v; ba=q.age; }
  }
  return list[bi];                     // 原地重用, 调用方覆写全部字段
}
function oldestTextIdx(){
  var bi=-1,ba=-1;
  for(var i=0;i<list.length;i++){
    var q=list[i];
    if(q.type===T_TEXT&&q.age>ba){ ba=q.age; bi=i; }
  }
  return bi;
}

// ---------- 生成器 ----------
function burst(x,y,color,n){
  x=+x||0; y=+y||0;
  var rgb=(color===undefined||color===null||color==='')?WARM:rgbOf(color,WARM);
  var cnt=n>0?Math.min(n|0,48):(n===0?0:10);
  for(var i=0;i<cnt;i++){
    var p=acquire();
    var a=Math.random()*TAU;
    var sp=90+Math.random()*230;
    p.type=T_SPARK;
    p.x=x+(Math.random()-0.5)*4;
    p.y=y+(Math.random()-0.5)*4;
    p.vx=Math.cos(a)*sp;
    p.vy=Math.sin(a)*sp-46;            // 轻微上抛
    p.size=1.5+Math.random()*1.9;
    p.life=0.32+Math.random()*0.34;
    p.age=0;
    p.grav=760; p.drag=3.1;
    p.rgb=(Math.random()<0.72)?rgb:WARM;   // 以传入色为主, 掺少量暖白
    p.ph=Math.random()*TAU;
    p.fq=16+Math.random()*24;
  }
}

function floatText(x,y,str,color){
  x=+x||0; y=+y||0;
  var txt=String(str===undefined||str===null?'':str).slice(0,12);
  if(!txt) return;
  var rgb=(color===undefined||color===null||color==='')?'255,255,255':rgbOf(color,'255,255,255');
  var cnt=0;
  for(var i=0;i<list.length;i++) if(list[i].type===T_TEXT) cnt++;
  var p;
  if(cnt>=MAX_TEXT){                   // 同屏超限: 重用最旧一条
    var oi=oldestTextIdx();
    p=(oi>=0)?list[oi]:acquire();
  }else p=acquire();
  p.type=T_TEXT; p.x=x; p.y=y;
  p.txt=txt;
  p.size=txt.length>6?15:17;           // 长串略缩, 15px 起步
  p.life=0.9; p.age=0; p.vy=64;        // 上飘初速, update 里减速
  p.rgb=rgb;
}

function swallow(x,y){
  x=+x||0; y=+y||0;
  var i,p,a;
  for(i=0;i<11;i++){                   // 内旋碎片: 统一逆时针卷向中心
    p=acquire();
    a=Math.random()*TAU;
    var r0=26+Math.random()*30;
    p.type=T_SWIRL;
    p.cx=x; p.cy=y;
    p.ang=a; p.r=r0; p.r0=r0;
    p.vr=52+Math.random()*46;          // 径向向内速度
    p.va=-(4.6+Math.random()*2.6);     // 角速度（统一方向成涡）
    p.size=1.6+Math.random()*1.6;
    p.life=(r0/p.vr)*1.05+0.1;
    p.age=0;
    p.rgb=(Math.random()<0.8)?LILAC:WARM;
  }
  p=acquire();                         // 一圈收缩环
  p.type=T_RING; p.x=x; p.y=y;
  p.r0=46; p.r1=5; p.w=3.5; p.life=0.5; p.age=0; p.rgb=LILAC;
  for(i=0;i<5;i++){                    // 少量暖白雪尘
    p=acquire();
    a=Math.random()*TAU;
    var sp=18+Math.random()*56;
    p.type=T_SPARK;
    p.x=x+Math.cos(a)*10; p.y=y+Math.sin(a)*10;
    p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp-20;
    p.size=1.1+Math.random()*1.1;
    p.life=0.4+Math.random()*0.3;
    p.age=0; p.grav=60; p.drag=2.2;
    p.rgb=WARM; p.ph=Math.random()*TAU; p.fq=20+Math.random()*18;
  }
}

function ring(x,y,color){
  var p=acquire();
  p.type=T_RING;
  p.x=+x||0; p.y=+y||0;
  p.r0=6; p.r1=84;
  p.w=4.5; p.life=0.45; p.age=0;
  p.rgb=(color===undefined||color===null||color==='')?WARM:rgbOf(color,WARM);
}

function shake(mag){
  var m=Math.abs(+mag)||0;
  if(m>trauma) trauma=(m>1?1:m);       // 只存峰值, 主循环读 FX.getShake() 自算偏移
}
function getShake(){ return trauma; }

// ---------- API ----------
function init(cv){
  if(cv&&typeof cv==='object') canvas=cv;   // 只存引用, 可安全多次调用
  if(HAS_DOC){                              // 一次性预烘焙关卡色板发光精灵
    for(var i=0;i<PREWARM.length;i++) glow(rgbOf(PREWARM[i],WARM));
    glow(WARM); glow(LILAC); glow('255,255,255');
  }
  return FX;
}

function clear(){
  while(list.length) pool.push(list.pop());
  trauma=0;
}

function update(dt){
  if(HAS_DOC&&document.hidden) return;      // 后台不积累
  if(!(dt>0)) return;
  if(dt>0.05) dt=0.05;
  trauma*=Math.exp(-3*dt); if(trauma<0.003) trauma=0;
  for(var i=list.length-1;i>=0;i--){
    var p=list[i];
    p.age+=dt;
    var dead=(p.age>=p.life);
    if(!dead){
      if(p.type===T_SPARK){                 // 重力 + 指数阻尼
        var e=Math.exp(-p.drag*dt);
        p.vx*=e; p.vy=p.vy*e+p.grav*dt;
        p.x+=p.vx*dt; p.y+=p.vy*dt;
      }else if(p.type===T_SWIRL){           // 半径收缩 + 角向内旋
        p.r-=p.vr*dt;
        p.ang+=p.va*dt;
        p.x=p.cx+Math.cos(p.ang)*p.r;
        p.y=p.cy+Math.sin(p.ang)*p.r;
        if(p.r<=2.5) dead=true;
      }else if(p.type===T_TEXT){            // 上飘减速
        p.vy*=Math.exp(-2.4*dt);
        p.y-=p.vy*dt;
      }
      // T_RING: 半径由 age 在 draw 里推导, 无状态可推进
    }
    if(dead){                               // swap-pop 回收, 不用 splice
      pool.push(p);
      var last=list.pop();
      if(i<list.length) list[i]=last;
    }
  }
}

function draw(ctx){
  if(!ctx||typeof ctx.save!=='function'||!list.length) return;
  ctx.save();
  var i,p,n=list.length;
  // pass1: lighter 叠色发光 —— spark / swirl / ring
  ctx.globalCompositeOperation='lighter';
  for(i=0;i<n;i++){
    p=list[i];
    if(p.type===T_SPARK) dSpark(ctx,p);
    else if(p.type===T_SWIRL) dSwirl(ctx,p);
    else if(p.type===T_RING) dRing(ctx,p);
  }
  // pass2: 普通合成置顶 —— 浮动分数
  ctx.globalCompositeOperation='source-over';
  for(i=0;i<n;i++) if(list[i].type===T_TEXT) dText(ctx,list[i]);
  ctx.restore();                           // 恢复合成/透明度, 零状态残留
}

// ---------- 绘制子程 ----------
function dSpark(ctx,p){                    // 发光点: 色晕精灵 + 暖白亮核, 带闪烁
  var t=p.age/p.life;
  var flick=0.72+0.28*Math.sin(p.age*p.fq+p.ph);
  var a=Math.pow(1-t,0.7)*flick;
  if(a<=0.01) return;
  var s=p.size*3.4+2;
  var sp=glow(p.rgb);
  ctx.globalAlpha=a*0.85;
  if(sp) ctx.drawImage(sp,p.x-s,p.y-s,s*2,s*2);
  else{
    ctx.fillStyle='rgb('+p.rgb+')';
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,TAU); ctx.fill();
  }
  ctx.globalAlpha=a;
  ctx.fillStyle='rgba('+WARM+',0.95)';
  ctx.beginPath();
  ctx.arc(p.x,p.y,Math.max(0.7,p.size*(1-t*0.45)),0,TAU);
  ctx.fill();
}
function dSwirl(ctx,p){                    // 内旋碎片: 色晕 + 切向短线
  var t=p.age/p.life;
  var rr=p.r>0?p.r:0;
  var k=rr/p.r0;                           // 越近中心越小越淡
  var a=(1-t)*(0.45+0.55*k);
  if(a<=0.01) return;
  var s=p.size*2.6+1.5;
  var sp=glow(p.rgb);
  ctx.globalAlpha=a*0.7;
  if(sp) ctx.drawImage(sp,p.x-s,p.y-s,s*2,s*2);
  var ta=p.ang+(p.va<0?-1:1)*1.5708;       // 运动切向
  var L=3+6*k;
  ctx.globalAlpha=a;
  ctx.strokeStyle='rgba('+p.rgb+',1)';
  ctx.lineWidth=Math.max(1,p.size*0.9);
  ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(p.x-Math.cos(ta)*L,p.y-Math.sin(ta)*L);
  ctx.lineTo(p.x+Math.cos(ta)*L*0.4,p.y+Math.sin(ta)*L*0.4);
  ctx.stroke();
}
function dRing(ctx,p){                     // 冲击环: 双层描边当光晕, 线宽随寿命变细
  var t=p.age/p.life;
  var e=1-Math.pow(1-t,3);
  var r=p.r0+(p.r1-p.r0)*e;                // r1<r0 时即收缩环（吞噬用）
  var w=Math.max(0.6,p.w*(1-t*0.7));
  var a=Math.pow(1-t,0.85);
  if(a<=0.01) return;
  ctx.strokeStyle='rgba('+p.rgb+',1)';
  ctx.globalAlpha=a*0.22;
  ctx.lineWidth=w*2.6;
  ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.stroke();
  ctx.globalAlpha=a;
  ctx.lineWidth=w;
  ctx.beginPath(); ctx.arc(p.x,p.y,r,0,TAU); ctx.stroke();
}
function dText(ctx,p){                     // 800 字重, 深色描边 + 亮填充, 轻微放大入场
  var t=p.age/p.life;
  var a=(t<0.6)?1:1-(t-0.6)/0.4;
  if(a<=0) return;
  var sc=0.6+0.4*Math.min(1,p.age/0.08);
  var sz=p.size;
  ctx.globalAlpha=a;
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.scale(sc,sc);
  ctx.font='800 '+sz+'px -apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.lineJoin='round'; ctx.miterLimit=2;
  ctx.lineWidth=Math.max(3,sz*0.18);
  ctx.strokeStyle='rgba(24,19,13,0.9)';
  ctx.strokeText(p.txt,0,0);
  ctx.fillStyle='rgb('+p.rgb+')';
  ctx.fillText(p.txt,0,0);
  ctx.restore();
}

// ---------- 挂载 ----------
FX.init=init;
FX.burst=burst;
FX.floatText=floatText;
FX.swallow=swallow;
FX.ring=ring;
FX.shake=shake;
FX.getShake=getShake;      // 主循环可读当前震动强度自算偏移
FX.update=update;
FX.draw=draw;
FX.clear=clear;

// node 下 require 自测出口（浏览器无 module, 不影响）
if(typeof module!=='undefined'&&module.exports){ module.exports=FX; }
})();
