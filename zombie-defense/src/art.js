/* 僵尸防线·孤哨重制 —— art.js（子代理 A）
   主题「末日孤哨」：冷蓝黑夜空 / 军用琥珀 #e8a33d / 血红 #d9483f / 骨白 #e8e4d8 / 军绿 #79a852
   红线：逐帧路径禁 shadowBlur；发光一律 radial-gradient + 'lighter' 合成；零外部资源。 */
(function(){
'use strict';
window.ZD=window.ZD||{};
const A={};
const TAU=Math.PI*2;

/* ---------- 工具 ---------- */
// 确定性伪随机（仅背景离屏生成时使用，保证同尺寸结果稳定）
function rng(seed){return function(){seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
// 圆角矩形路径（不依赖 ctx.roundRect，兼容更稳）
function rrect(c,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

/* ---------- 整幅背景（同尺寸缓存） ---------- */
let _bg=null,_bgK='';
A.bg=function(w,h){
  const key=w+'x'+h;
  if(_bg&&_bgK===key)return _bg;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const b=c.getContext('2d');
  const R=rng(w*7349+h*971+13);
  const gY=h-150;                       // 地平线（泥土/战壕起始）
  // 1) 多层深夜天空：顶 #05080d → 地平 #1a2230
  let g=b.createLinearGradient(0,0,0,gY);
  g.addColorStop(0,'#05080d');g.addColorStop(0.45,'#0a0f16');g.addColorStop(0.78,'#121a26');g.addColorStop(1,'#1a2230');
  b.fillStyle=g;b.fillRect(0,0,w,gY);
  // 地平线冷光晕
  g=b.createLinearGradient(0,gY-84,0,gY);
  g.addColorStop(0,'rgba(90,115,140,0)');g.addColorStop(1,'rgba(90,115,140,0.16)');
  b.fillStyle=g;b.fillRect(0,gY-84,w,84);
  // 2) 星空
  const mx=w*0.76,my=h*0.13,mr=Math.max(14,w*0.045);
  for(let i=0;i<120;i++){
    const sx=R()*w,sy=R()*gY*0.8;
    const dx=sx-mx,dy=sy-my;
    if(dx*dx+dy*dy<(mr+30)*(mr+30))continue;        // 让开月亮
    const sz=R()<0.12?2:1;
    b.fillStyle='rgba(214,224,234,'+(0.12+R()*0.55).toFixed(2)+')';
    b.fillRect(sx,sy,sz,sz);
    if(sz===2&&R()<0.5){                            // 亮星十字微光
      b.fillStyle='rgba(214,224,234,0.12)';
      b.fillRect(sx-3,sy,7,1);b.fillRect(sx,sy-3,1,7);
    }
  }
  // 3) 月亮 + 柔和月晕
  g=b.createRadialGradient(mx,my,mr*0.5,mx,my,mr*4.4);
  g.addColorStop(0,'rgba(214,228,238,0.20)');g.addColorStop(0.45,'rgba(190,210,225,0.07)');g.addColorStop(1,'rgba(0,0,0,0)');
  b.fillStyle=g;b.fillRect(mx-mr*5,my-mr*5,mr*10,mr*10);
  g=b.createRadialGradient(mx-mr*0.35,my-mr*0.35,mr*0.15,mx,my,mr);
  g.addColorStop(0,'#f2efe2');g.addColorStop(0.7,'#d9dcd2');g.addColorStop(1,'#a7b3b1');
  b.fillStyle=g;b.beginPath();b.arc(mx,my,mr,0,TAU);b.fill();
  b.fillStyle='rgba(150,160,158,0.38)';             // 环形山
  const CR=[[-0.3,-0.15,0.2],[0.25,0.2,0.15],[-0.05,0.35,0.12],[0.4,-0.3,0.1]];
  for(const cr of CR){b.beginPath();b.arc(mx+cr[0]*mr,my+cr[1]*mr,cr[2]*mr,0,TAU);b.fill();}
  // 4) 缓慢云带（离屏静态）
  for(let i=0;i<4;i++){
    const cy=h*(0.16+i*0.085)+R()*10,cw=w*(0.35+R()*0.4),ch=6+R()*9,cx=R()*w-cw*0.2;
    b.fillStyle='rgba(150,172,192,'+(0.05+R()*0.045).toFixed(3)+')';
    b.beginPath();b.ellipse(cx,cy,cw,ch,0,0,TAU);b.fill();
  }
  b.fillStyle='rgba(9,13,19,0.42)';                 // 掠过月亮的暗云
  b.beginPath();b.ellipse(mx-mr*1.5,my+mr*0.55,mr*2.6,mr*0.55,-0.12,0,TAU);b.fill();
  // 5) 远层城市废墟剪影（更暗更淡）
  b.fillStyle='#131a24';
  let x=-10;
  while(x<w){
    const bw=20+R()*34,bh=26+R()*58;
    b.fillRect(x,gY-bh,bw,bh+4);
    if(R()<0.3)b.fillRect(x+bw*0.4,gY-bh-8,1.5,8);  // 细天线
    b.fillStyle='rgba(160,180,200,0.07)';           // 极淡窗点
    for(let wy=gY-bh+6;wy<gY-6;wy+=9)
      for(let wx=x+4;wx<x+bw-5;wx+=8)if(R()<0.12)b.fillRect(wx,wy,2,3);
    b.fillStyle='#131a24';
    x+=bw+3+R()*8;
  }
  // 6) 近层废墟剪影：断楼/斜塔/天线 + 少量亮窗
  x=-16;
  while(x<w+10){
    const bw=26+R()*44,bh=44+R()*82,bx=x;
    b.save();
    if(R()<0.25){b.translate(bx+bw/2,gY);b.rotate((R()-0.5)*0.09);b.translate(-bx-bw/2,-gY);} // 斜塔
    b.fillStyle='#0a0e14';
    let sy0=gY-bh,sx0=bx,sw=bw;                     // 断楼：顶缘阶梯状崩塌
    for(let s2=0,seg=2+((R()*3)|0);s2<seg;s2++){
      b.fillRect(sx0,sy0,sw,gY-sy0+3);
      sy0+=4+R()*12;
      const cut=sw*(0.2+R()*0.4);
      if(R()<0.5){sx0+=cut*0.3;sw-=cut;}else{sw-=cut*0.2;}
      if(sw<6)break;
    }
    if(R()<0.4){                                    // 天线+航空警示灯
      const ax=bx+bw*(0.2+R()*0.6),ah=14+R()*14;
      b.fillRect(ax,gY-bh-ah,1.5,ah);
      b.fillStyle='rgba(217,72,63,0.55)';b.fillRect(ax-1,gY-bh-ah-3,3,3);
    }
    b.restore();
    b.fillStyle='#0a0e14';
    for(let wy=gY-bh+8;wy<gY-10;wy+=10)             // 亮窗：稀疏暗琥珀/冷白
      for(let wx=bx+4;wx<bx+bw-6;wx+=9){
        const q=R();
        if(q<0.05){b.fillStyle='rgba(232,163,61,0.30)';b.fillRect(wx,wy,3,4);}
        else if(q<0.09){b.fillStyle='rgba(205,215,205,0.14)';b.fillRect(wx,wy,3,4);}
      }
    x+=bw+4+R()*10;
  }
  // 楼基瓦砾
  b.fillStyle='#0c0f15';
  for(let rx=0;rx<w;rx+=14+R()*22){
    const rh=3+R()*9;
    b.beginPath();b.moveTo(rx,gY+2);b.lineTo(rx+5,gY+2-rh);b.lineTo(rx+11,gY+2);b.closePath();b.fill();
  }
  // 7) 低空雾带（两层）
  g=b.createLinearGradient(0,gY-52,0,gY+4);
  g.addColorStop(0,'rgba(148,168,188,0)');g.addColorStop(0.7,'rgba(148,168,188,0.09)');g.addColorStop(1,'rgba(148,168,188,0.02)');
  b.fillStyle=g;b.fillRect(0,gY-52,w,56);
  g=b.createLinearGradient(0,gY-4,0,gY+30);
  g.addColorStop(0,'rgba(148,168,188,0.07)');g.addColorStop(1,'rgba(148,168,188,0)');
  b.fillStyle=g;b.fillRect(0,gY-4,w,34);
  // 8) 地面战壕质感：泥土分层
  g=b.createLinearGradient(0,gY,0,h);
  g.addColorStop(0,'#262117');g.addColorStop(0.45,'#1b1812');g.addColorStop(1,'#11100c');
  b.fillStyle=g;b.fillRect(0,gY,w,h-gY);
  b.fillStyle='rgba(0,0,0,0.32)';b.fillRect(0,gY,w,7);   // 沟沿暗边
  for(let yy=gY+14;yy<h;yy+=12){                          // 压痕横线+车辙
    b.strokeStyle='rgba(0,0,0,'+(0.14+R()*0.14).toFixed(2)+')';b.lineWidth=1;
    b.beginPath();b.moveTo(0,yy);b.lineTo(w,yy+(R()-0.5)*2);b.stroke();
    if(R()<0.3){b.fillStyle='rgba(0,0,0,0.16)';b.fillRect(R()*w*0.6,yy+2,40+R()*90,2.5);}
  }
  const GC=['#3a352a','#2f2a21','#453f2f','#26221b'];
  for(let i=0;i<170;i++){                                 // 细碎石
    b.fillStyle=GC[(R()*4)|0];
    b.fillRect(R()*w,gY+5+R()*(h-gY-8),R()<0.3?2:1,1);
  }
  b.fillStyle='#0d0b08';                                  // 角落残骸剪影
  b.beginPath();b.moveTo(0,h);b.lineTo(0,h-26);b.lineTo(26,h-12);b.lineTo(44,h-22);b.lineTo(70,h);b.closePath();b.fill();
  b.beginPath();b.moveTo(w,h);b.lineTo(w-58,h);b.lineTo(w-34,h-18);b.lineTo(w-12,h-8);b.lineTo(w,h-24);b.closePath();b.fill();
  b.fillStyle='#171310';                                  // 断梁
  b.save();b.translate(w*0.3,gY+34);b.rotate(0.35);b.fillRect(0,0,34,4);b.restore();
  b.save();b.translate(w*0.72,gY+58);b.rotate(-0.5);b.fillRect(0,0,26,3.5);b.restore();
  _bg=c;_bgK=key;return c;
};

/* ---------- 四周暗角（同尺寸缓存） ---------- */
let _vg=null,_vgK='';
A.vignette=function(w,h){
  const key=w+'x'+h;
  if(_vg&&_vgK===key)return _vg;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const b=c.getContext('2d');
  let g=b.createRadialGradient(w/2,h*0.46,Math.min(w,h)*0.42,w/2,h*0.5,Math.hypot(w,h)*0.62);
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(0.72,'rgba(0,0,0,0.16)');g.addColorStop(1,'rgba(0,0,0,0.5)');
  b.fillStyle=g;b.fillRect(0,0,w,h);
  g=b.createLinearGradient(0,0,0,50);
  g.addColorStop(0,'rgba(0,0,0,0.22)');g.addColorStop(1,'rgba(0,0,0,0)');
  b.fillStyle=g;b.fillRect(0,0,w,50);
  g=b.createLinearGradient(0,h-70,0,h);
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0.26)');
  b.fillStyle=g;b.fillRect(0,h-70,w,70);
  _vg=c;_vgK=key;return c;
};

/* ---------- 沙袋工事 + 铁丝网 + 警示灯 ---------- */
A.wall=function(ctx,W,wallY,frame,hpRatio){
  hpRatio=(hpRatio==null)?1:hpRatio;
  // 顶部铁丝网：双股锯齿 + 立桩
  const wy=wallY+7;
  ctx.fillStyle='#2c333c';
  for(let sx=28;sx<W;sx+=110)ctx.fillRect(sx,wy-5,3,26);
  ctx.strokeStyle='#7e8894';ctx.lineWidth=1.4;ctx.lineJoin='miter';
  ctx.beginPath();
  for(let x=0;x<=W;x+=10){const yy=wy+(((x/10)|0)%2?3.2:-3.2);x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}
  ctx.stroke();
  ctx.strokeStyle='#59626d';
  ctx.beginPath();
  for(let x=5;x<=W+5;x+=10){const yy=wy+6+(((x/10)|0)%2?2.6:-2.6);x===5?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}
  ctx.stroke();
  // 沙袋两排错缝（交替色+顶光+底影+缝线）
  function bag(bx,by,tint){
    ctx.fillStyle=tint?'#7a6e50':'#6b5f45';
    rrect(ctx,bx+1,by,30,14,5.5);ctx.fill();
    ctx.strokeStyle='rgba(26,22,14,0.55)';ctx.lineWidth=1;
    rrect(ctx,bx+1,by,30,14,5.5);ctx.stroke();
    ctx.fillStyle='rgba(255,248,225,0.10)';rrect(ctx,bx+4,by+2,24,3.5,2);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.26)';ctx.fillRect(bx+3,by+10.5,26,2.5);
  }
  let i=0;
  for(let bx=-16;bx<W;bx+=32,i++){
    bag(bx,wallY+12,i%2===0);
    bag(bx+16,wallY+26,(i+1)%2===0);
  }
  // 压顶土层
  ctx.fillStyle='#3d3625';ctx.fillRect(0,wallY+40,W,5);
  ctx.fillStyle='rgba(0,0,0,0.32)';ctx.fillRect(0,wallY+45,W,4);
  // 左端军用警示灯：低血红色闪烁（frame 驱动），平时暗琥珀常亮
  const lx=12,ly=wallY-12;
  ctx.fillStyle='#232a32';rrect(ctx,lx-4.5,ly,9,20,2);ctx.fill();
  ctx.fillStyle='#39424e';ctx.fillRect(lx-7,ly-2,14,4);
  const low=hpRatio<0.3,on=low?(((frame/9)|0)%2===0):true;
  if(on){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const gg=ctx.createRadialGradient(lx,ly+7,0,lx,ly+7,low?15:8);
    gg.addColorStop(0,low?'rgba(255,86,64,0.55)':'rgba(232,163,61,0.26)');
    gg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gg;ctx.beginPath();ctx.arc(lx,ly+7,low?15:8,0,TAU);ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle=low?(on?'#ff5040':'#4a1c18'):'#e8a33d';
  ctx.beginPath();ctx.arc(lx,ly+7,3.2,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.5)';ctx.beginPath();ctx.arc(lx-1,ly+6,1,0,TAU);ctx.fill();
};

/* ---------- 僵尸：四型差异剪影 + 走路动画 + 状态特效 ---------- */
const ZC={ // normal 病绿 / fast 枯黄 / tank 锈铁 / boss 暗红
  normal:{b:'#6a9a4a',d:'#48702f',h:'#7fae5c',eye:'#ff5140'},
  fast:{b:'#b09a3e',d:'#7f6c24',h:'#c9b354',eye:'#ffd24a'},
  tank:{b:'#8a7f6d',d:'#5b5346',h:'#9c917e',eye:'#ff7b40'},
  boss:{b:'#a83a3a',d:'#6f2121',h:'#c74f4f',eye:'#ff3b30'}
};
A.zombie=function(ctx,z,frame){
  const w=z.w||36,h=z.h||44,t=frame*0.15+(z.x||0),s=Math.sin(t);
  const C=ZC[z.type]||ZC.normal,hurt=z.hurt>0;
  const B=hurt?'#f2f2f2':C.b,D=hurt?'#d6d6d6':C.d,Hd=hurt?'#fafafa':C.h;
  // 姿态：fast 前倾疾奔 / normal 摇曳 / boss 微晃 / tank 敦实
  // 多通道步态（慢频倾斜+弹跳+摆腿+摆头），保证任意帧取样都有明显动作差
  const tilt=Math.sin(t*0.5+1)*(z.type==='tank'?0.03:0.055);
  const lean=(z.type==='fast'?-0.17:0)+tilt+s*(z.type==='fast'?0.03:z.type==='tank'?0.015:0.04);
  const bob=Math.abs(s)*h*0.055;            // 支撑相身体起伏
  ctx.save();
  ctx.translate(z.x,z.y);
  ctx.translate(0,h*0.95);ctx.rotate(lean);ctx.translate(0,-h*0.95); // 以脚为轴
  ctx.translate(0,-bob);
  // 腿：摆动步态
  const amp=z.type==='tank'?0.22:z.type==='fast'?0.6:0.44;
  const hipY=h*0.70,legL=h*0.30,legW=z.type==='tank'?w*0.19:z.type==='boss'?w*0.12:w*0.13;
  ctx.strokeStyle=D;ctx.lineCap='round';ctx.lineWidth=legW;
  for(const sd of[-1,1]){
    const ang=sd*s*amp;
    const kx=sd*w*0.12+Math.sin(ang)*legL*0.5,ky=hipY+Math.cos(ang)*legL;
    ctx.beginPath();ctx.moveTo(sd*w*0.12,hipY);ctx.lineTo(kx,ky);ctx.stroke();
    ctx.fillStyle=hurt?'#d0d0d0':C.d;
    ctx.fillRect(kx-legW*0.5,ky-2,legW,4);  // 脚
    ctx.strokeStyle=D;
  }
  // 躯干
  const tw=z.type==='tank'?w*0.94:z.type==='fast'?w*0.58:z.type==='boss'?w*0.86:w*0.68;
  const ty=h*0.32,th=h*0.42;
  rrect(ctx,-tw/2,ty,tw,th,tw*0.24);ctx.fillStyle=B;ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.22)';rrect(ctx,-tw/2+1,ty+2,tw*0.26,th-4,tw*0.18);ctx.fill(); // 侧影
  ctx.fillStyle='rgba(255,255,255,0.10)';rrect(ctx,-tw*0.3,ty+2,tw*0.6,3,2);ctx.fill();     // 顶光
  if(!hurt){
    if(z.type==='normal'){                       // 破衣补丁 + 腐斑
      ctx.fillStyle=C.d;rrect(ctx,tw*0.04,ty+th*0.36,tw*0.3,th*0.3,3);ctx.fill();
      ctx.fillStyle='rgba(30,45,20,0.5)';
      ctx.beginPath();ctx.arc(-tw*0.18,ty+th*0.3,2.4,0,TAU);ctx.fill();
      ctx.beginPath();ctx.arc(tw*0.22,ty+th*0.62,1.8,0,TAU);ctx.fill();
    }else if(z.type==='tank'){                   // 锈铁肩甲板 + 胸板 + 铆钉
      ctx.fillStyle='#57503f';
      rrect(ctx,-tw*0.52,ty-2,tw*0.32,h*0.13,3);ctx.fill();
      rrect(ctx,tw*0.20,ty-2,tw*0.32,h*0.13,3);ctx.fill();
      ctx.fillStyle='#2e2a20';
      ctx.fillRect(-tw*0.46,ty+2,2,2);ctx.fillRect(-tw*0.28,ty+2,2,2);
      ctx.fillRect(tw*0.26,ty+2,2,2);ctx.fillRect(tw*0.44,ty+2,2,2);
      ctx.fillStyle='#6a6152';rrect(ctx,-tw*0.2,ty+th*0.32,tw*0.4,th*0.32,3);ctx.fill();
      ctx.strokeStyle='rgba(40,34,24,0.8)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(-tw*0.2,ty+th*0.32);ctx.lineTo(tw*0.2,ty+th*0.64);ctx.stroke(); // 焊缝
    }else if(z.type==='boss'){                   // 暗红胸甲 + 金饰 + 肩刺
      ctx.fillStyle='#4f1818';rrect(ctx,-tw*0.32,ty+th*0.14,tw*0.64,th*0.62,4);ctx.fill();
      ctx.strokeStyle='rgba(232,193,74,0.75)';ctx.lineWidth=1.4;
      rrect(ctx,-tw*0.30,ty+th*0.17,tw*0.60,th*0.56,3);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-tw*0.26,ty+th*0.22);ctx.lineTo(0,ty+th*0.52);ctx.lineTo(tw*0.26,ty+th*0.22);ctx.stroke();
      ctx.fillStyle='#5f1c1c';
      ctx.beginPath();ctx.moveTo(-tw*0.48,ty+3);ctx.lineTo(-tw*0.70,ty-5);ctx.lineTo(-tw*0.28,ty+3);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(tw*0.48,ty+3);ctx.lineTo(tw*0.70,ty-5);ctx.lineTo(tw*0.28,ty+3);ctx.closePath();ctx.fill();
    }
  }
  // 手臂：双臂相位交替（fast 后摆 / tank 垂探 / 其余前扑）
  const shY=ty+th*0.18;
  const armW=z.type==='tank'?w*0.15:z.type==='boss'?w*0.11:z.type==='fast'?w*0.08:w*0.085;
  ctx.strokeStyle=D;ctx.lineWidth=armW;ctx.lineCap='round';
  for(const sd of[-1,1]){
    const sw=Math.sin(t+(sd>0?0:Math.PI));
    let ex,ey;
    if(z.type==='fast'){ex=sd*tw*0.30;ey=shY-th*0.22+sw*3;}
    else if(z.type==='tank'){ex=sd*tw*0.40;ey=shY+th*0.62+sw*2;}
    else{ex=sd*tw*0.26+sw*w*0.06;ey=shY+th*0.80+sw*3;}
    ctx.beginPath();ctx.moveTo(sd*tw*0.42,shY);
    ctx.quadraticCurveTo((sd*tw*0.40+ex)/2+sw*2,(shY+ey)/2+2,ex,ey);ctx.stroke();
    ctx.fillStyle=D;ctx.beginPath();ctx.arc(ex,ey,armW*0.62,0,TAU);ctx.fill();
    if(z.type==='boss'){                          // 利爪
      ctx.strokeStyle=hurt?'#d6d6d6':'#e0d6c2';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(ex-2,ey+2);ctx.lineTo(ex-4,ey+6);
      ctx.moveTo(ex+2,ey+2);ctx.lineTo(ex+3,ey+6.5);ctx.stroke();
      ctx.strokeStyle=D;ctx.lineWidth=armW;
    }
  }
  // 头部（boss 金色骨角先画，被头压根部）
  const hr=z.type==='tank'?w*0.20:z.type==='boss'?w*0.23:w*0.27;
  const hx=Math.sin(t*1.3+2)*w*0.10,hy=h*0.17+Math.sin(t*2);
  if(z.type==='boss'){
    for(const sd of[-1,1]){
      ctx.fillStyle=hurt?'#e8e8e8':'#e8c14a';
      ctx.beginPath();
      ctx.moveTo(sd*hr*0.45,hy-hr*0.5);
      ctx.quadraticCurveTo(sd*hr*1.85,hy-hr*0.9,sd*hr*1.35,hy-hr*2.1);
      ctx.quadraticCurveTo(sd*hr*1.15,hy-hr*1.0,sd*hr*0.7,hy-hr*0.55);
      ctx.closePath();ctx.fill();
      ctx.fillStyle=hurt?'#fff':'#f6ecc9';
      ctx.beginPath();ctx.arc(sd*hr*1.3,hy-hr*2.0,1.4,0,TAU);ctx.fill();
    }
  }
  ctx.fillStyle=Hd;ctx.beginPath();ctx.arc(hx,hy,hr,0,TAU);ctx.fill();
  ctx.fillStyle=hurt?'#e4e4e4':C.d;               // 张开下颚
  rrect(ctx,hx-hr*0.6,hy+hr*0.30,hr*1.2,hr*0.52,2);ctx.fill();
  if((z.type==='boss'||z.type==='tank')&&!hurt){  // 牙
    ctx.fillStyle='#e8e4d8';
    for(let i=-1;i<=1;i++){
      ctx.beginPath();ctx.moveTo(hx+i*hr*0.34-1.4,hy+hr*0.34);
      ctx.lineTo(hx+i*hr*0.34,hy+hr*0.60);
      ctx.lineTo(hx+i*hr*0.34+1.4,hy+hr*0.34);ctx.closePath();ctx.fill();
    }
  }
  const er=z.type==='boss'?2.6:1.8;               // 红眼
  ctx.fillStyle=hurt?'#b04038':C.eye;
  ctx.fillRect(hx-hr*0.5-er/2,hy-hr*0.15,er,er*1.2);
  ctx.fillRect(hx+hr*0.5-er/2,hy-hr*0.15,er,er*1.2);
  if(z.type==='boss'&&!hurt){                     // boss 眼神压迫感
    ctx.fillStyle='rgba(255,59,48,0.25)';
    ctx.beginPath();ctx.arc(hx-hr*0.5,hy-hr*0.1,er*2.4,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(hx+hr*0.5,hy-hr*0.1,er*2.4,0,TAU);ctx.fill();
  }
  // 燃烧：橙红余烬光斑（radial gradient，禁 shadowBlur）
  if(z.burn>0){
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){
      const ph=frame*0.21+i*2.4+(z.x||0)*0.13;
      const ex2=Math.sin(ph)*w*0.24;
      const ey2=h*(0.30+i*0.18)-((frame*1.2+i*17)%12);
      const er2=w*(0.24+0.07*Math.sin(ph*1.7));
      const g=ctx.createRadialGradient(ex2,ey2,0,ex2,ey2,er2);
      g.addColorStop(0,'rgba(255,160,60,0.55)');g.addColorStop(0.55,'rgba(215,70,25,0.22)');g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(ex2,ey2,er2,0,TAU);ctx.fill();
      ctx.fillStyle='rgba(255,215,120,0.85)';ctx.fillRect(ex2-1,ey2-1,2,2);
    }
    ctx.globalCompositeOperation='source-over';
  }
  // 冰冻：冰蓝描边 + 霜面 + 晶棱
  if(z.slow>0){
    ctx.fillStyle='rgba(140,215,255,0.10)';rrect(ctx,-w/2-3,-3,w+6,h+4,7);ctx.fill();
    ctx.strokeStyle='rgba(143,216,255,0.9)';ctx.lineWidth=1.8;
    rrect(ctx,-w/2-3,-3,w+6,h+4,7);ctx.stroke();
    ctx.strokeStyle='rgba(200,240,255,0.8)';ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.moveTo(-w/2-3,6);ctx.lineTo(-w/2-7,2);
    ctx.moveTo(w/2+3,h*0.4);ctx.lineTo(w/2+7,h*0.34);
    ctx.stroke();
  }
  ctx.restore();
  // 头顶血条：黑底 + 血红比例条
  const r=Math.max(0,Math.min(1,(z.hp||0)/((z.max||1)||1)));
  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(z.x-w/2-1,z.y-10,w+2,5);
  ctx.fillStyle='#d9483f';ctx.fillRect(z.x-w/2,z.y-9,w*r,3);
};

/* ---------- 士兵：头盔/护甲/步枪随 ang 旋转 + 后坐 + 呼吸 ---------- */
A.player=function(ctx,px,py,ang,recoil,flash,frame){
  const br=Math.sin(frame*0.07)*1.2;   // 呼吸起伏
  ctx.save();ctx.translate(px,py);
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath();ctx.ellipse(0,3,17,4,0,0,TAU);ctx.fill();
  // 双腿 + 护膝 + 军靴
  ctx.fillStyle='#39424f';
  rrect(ctx,-10.5,-27,8,23,3);ctx.fill();
  rrect(ctx,2.5,-27,8,23,3);ctx.fill();
  ctx.fillStyle='#252c36';
  ctx.fillRect(-10,-16,7,4);ctx.fillRect(3,-16,7,4);
  ctx.fillStyle='#1b212a';
  rrect(ctx,-13,-7,12,6,2);ctx.fill();rrect(ctx,1,-7,12,6,2);ctx.fill();
  ctx.fillStyle='#0d1116';ctx.fillRect(-13,-2,12,1.6);ctx.fillRect(1,-2,12,1.6);
  // 躯干护甲（呼吸 bob）
  const ty=-58+br;
  let g=ctx.createLinearGradient(0,ty,0,ty+30);
  g.addColorStop(0,'#66754f');g.addColorStop(1,'#3d4933');
  ctx.fillStyle=g;rrect(ctx,-13,ty,26,31,5);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.10)';rrect(ctx,-11,ty+2,22,4,2);ctx.fill();
  // 胸挂弹匣袋
  ctx.fillStyle='#2c3526';rrect(ctx,-10,ty+9,20,11,2);ctx.fill();
  ctx.fillStyle='#20281c';
  ctx.fillRect(-9,ty+11,5,8);ctx.fillRect(-2.5,ty+11,5,8);ctx.fillRect(4,ty+11,5,8);
  // 肩甲
  ctx.fillStyle='#4c5a41';
  ctx.beginPath();ctx.arc(-13,ty+3,5,Math.PI*0.9,Math.PI*1.9);ctx.fill();
  ctx.beginPath();ctx.arc(13,ty+3,5,Math.PI*1.1,Math.PI*0.1);ctx.fill();
  // 琥珀指示灯（脉冲）
  const pl=0.55+0.45*Math.sin(frame*0.12);
  ctx.save();ctx.globalCompositeOperation='lighter';
  ctx.fillStyle='rgba(232,163,61,'+(0.30*pl).toFixed(2)+')';
  ctx.beginPath();ctx.arc(8,ty+5,4.5,0,TAU);ctx.fill();ctx.restore();
  ctx.fillStyle='#e8a33d';ctx.beginPath();ctx.arc(8,ty+5,1.8,0,TAU);ctx.fill();
  ctx.fillStyle='#ffd9a0';ctx.beginPath();ctx.arc(7.4,ty+4.4,0.7,0,TAU);ctx.fill();
  // 头部：战术头盔沿口 + 护目镜条
  const hy=ty-13;
  ctx.fillStyle='#d3ad85';ctx.beginPath();ctx.arc(Math.sin(ang)*1.5,hy,6.6,0,TAU);ctx.fill();
  ctx.fillStyle='#151c24';ctx.fillRect(-7.5,hy-2.5,15,5);
  ctx.fillStyle='rgba(140,160,180,0.35)';ctx.fillRect(-7.5,hy-2.5,15,1.2);
  ctx.fillStyle='#2a323c';ctx.fillRect(-8.6,hy-2,2,4.4);ctx.fillRect(6.6,hy-2,2,4.4);
  ctx.fillStyle='#49573f';
  ctx.beginPath();ctx.arc(0,hy-0.5,8.3,Math.PI,0);ctx.fill();
  rrect(ctx,-9.4,hy-2.6,18.8,3,1.4);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.13)';
  ctx.beginPath();ctx.arc(-2.6,hy-4.6,3,Math.PI*0.9,Math.PI*1.7);ctx.fill();
  // 步枪：随 ang 旋转，后坐沿枪轴回拉
  const shY=ty+11,rec=-Math.min(recoil||0,5);
  ctx.save();ctx.translate(0,shY);ctx.rotate(ang);ctx.translate(rec,0);
  ctx.strokeStyle='#3f4c37';ctx.lineWidth=5;ctx.lineCap='round';   // 后臂
  ctx.beginPath();ctx.moveTo(0,2);ctx.lineTo(9.5,1);ctx.stroke();
  ctx.fillStyle='#232c36';rrect(ctx,-10,-2.6,8,6,2);ctx.fill();    // 枪托
  ctx.fillStyle='#161d26';rrect(ctx,-3,-3.6,20,7.2,2);ctx.fill();  // 机匣
  g=ctx.createLinearGradient(16,0,29,0);
  g.addColorStop(0,'#8b97a6');g.addColorStop(1,'#59636f');
  ctx.fillStyle=g;ctx.fillRect(16,-2.1,12,4.2);                    // 枪管
  ctx.fillStyle='#39424e';rrect(ctx,27,-3,5,6,1);ctx.fill();       // 消焰器
  ctx.save();ctx.translate(6,3.4);ctx.rotate(0.12);                // 弹匣
  ctx.fillStyle='#232c36';rrect(ctx,-3,0,6,9,1.5);ctx.fill();ctx.restore();
  ctx.fillStyle='#39424e';ctx.fillRect(2,-6.2,7,2.6);              // 瞄具
  ctx.fillStyle='#2c3641';ctx.fillRect(16,1.2,9,2);                // 下护木
  ctx.strokeStyle='#3f4c37';ctx.lineWidth=5;                       // 前臂
  ctx.beginPath();ctx.moveTo(1,4);ctx.lineTo(17,2);ctx.stroke();
  ctx.fillStyle='#3d4636';                                         // 双手套
  ctx.beginPath();ctx.arc(9,2.8,3.2,0,TAU);ctx.fill();
  ctx.beginPath();ctx.arc(19,1.6,2.9,0,TAU);ctx.fill();
  if(flash>0)A.muzzle(ctx,31.5,0,Math.max(flash*1.1,2));           // 枪口火光
  ctx.restore();
  ctx.restore();
};

/* ---------- 四旋翼无人机 ---------- */
A.drone=function(ctx,x,y,frame){
  ctx.save();ctx.translate(x,y+Math.sin(frame*0.09)*1.6);
  ctx.rotate(Math.sin(frame*0.05)*0.06);
  const HUBS=[[-10.5,-5.5],[10.5,-5.5],[-10.5,5.5],[10.5,5.5]];
  ctx.strokeStyle='#2b333c';ctx.lineWidth=2.4;                     // 机臂
  for(const hb of HUBS){
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(hb[0]*0.55,hb[1]*0.55);ctx.lineTo(hb[0],hb[1]);ctx.stroke();
  }
  for(let i=0;i<4;i++){                                            // 旋翼：半透明圆盘+旋转短线
    const hb=HUBS[i],a=frame*1.5+i*1.9;
    ctx.fillStyle='rgba(175,198,218,0.13)';
    ctx.beginPath();ctx.ellipse(hb[0],hb[1],7.5,2.6,0,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(205,225,240,0.5)';ctx.lineWidth=1.1;
    ctx.beginPath();
    ctx.moveTo(hb[0]-Math.cos(a)*7,hb[1]-Math.sin(a)*2.3);
    ctx.lineTo(hb[0]+Math.cos(a)*7,hb[1]+Math.sin(a)*2.3);ctx.stroke();
    ctx.strokeStyle='rgba(205,225,240,0.22)';
    ctx.beginPath();
    ctx.moveTo(hb[0]-Math.cos(a+1.5)*6,hb[1]-Math.sin(a+1.5)*2);
    ctx.lineTo(hb[0]+Math.cos(a+1.5)*6,hb[1]+Math.sin(a+1.5)*2);ctx.stroke();
    ctx.fillStyle='#39424e';ctx.beginPath();ctx.arc(hb[0],hb[1],1.3,0,TAU);ctx.fill();
  }
  ctx.fillStyle='#252d36';rrect(ctx,-8,-4.5,16,9,3.5);ctx.fill();  // 机身
  ctx.fillStyle='rgba(255,255,255,0.12)';rrect(ctx,-6,-3.6,12,2,1);ctx.fill();
  ctx.fillStyle='#11161c';rrect(ctx,-3,2.6,6,3,1);ctx.fill();
  const p=0.5+0.5*Math.sin(frame*0.25);                            // 琥珀传感灯+红色尾灯
  ctx.save();ctx.globalCompositeOperation='lighter';
  ctx.fillStyle='rgba(232,163,61,'+(0.35*p).toFixed(2)+')';
  ctx.beginPath();ctx.arc(0,4.4,3.8,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(217,72,63,'+((((frame>>4)&1)?0.5:0.12)).toFixed(2)+')';
  ctx.beginPath();ctx.arc(-7.5,0,2.5,0,TAU);ctx.fill();
  ctx.restore();
  ctx.fillStyle='#ffb85e';ctx.beginPath();ctx.arc(0,4.4,1.4,0,TAU);ctx.fill();
  ctx.restore();
};

/* ---------- 子弹：拖尾 + 亮核（lighter 分层光晕，无 shadowBlur） ---------- */
A.bullet=function(ctx,b){
  if(!b)return;
  const crit=!!b.crit,dr=!!b.drone;
  const col=crit?'#f2c14e':dr?'#7dd3e0':'#ffb347';
  const core=crit?'#fff3c0':dr?'#eafcff':'#ffe0a8';
  const r=crit?5:dr?3.2:3.8;
  const vx=b.vx||0,vy=b.vy||0,sp=Math.hypot(vx,vy);
  ctx.save();ctx.globalCompositeOperation='lighter';
  if(sp>0.5){                                                       // 沿 -v 渐隐拖尾
    const ux=vx/sp,uy=vy/sp,L=Math.min(22,10+sp*0.7);
    const g=ctx.createLinearGradient(b.x-ux*L,b.y-uy*L,b.x,b.y);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,col);
    ctx.strokeStyle=g;ctx.lineWidth=crit?4:dr?2.4:3;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(b.x-ux*L,b.y-uy*L);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.fillStyle='rgba(255,255,255,0.10)';                           // 外晕
  ctx.beginPath();ctx.arc(b.x,b.y,r*2.6,0,TAU);ctx.fill();
  ctx.globalAlpha=0.55;ctx.fillStyle=col;                           // 中晕
  ctx.beginPath();ctx.arc(b.x,b.y,r*1.6,0,TAU);ctx.fill();
  ctx.globalAlpha=1;ctx.fillStyle=core;                             // 亮核
  ctx.beginPath();ctx.arc(b.x,b.y,r,0,TAU);ctx.fill();
  ctx.restore();
};

/* ---------- Boss 血红能量弹 + 尾迹 ---------- */
A.bossShot=function(ctx,s){
  if(!s)return;
  const vx=s.vx||0,vy=(s.vy==null?4.5:s.vy);
  const sp=Math.hypot(vx,vy)||1,ux=vx/sp,uy=vy/sp,L=15;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const g=ctx.createLinearGradient(s.x-ux*L,s.y-uy*L,s.x,s.y);
  g.addColorStop(0,'rgba(217,72,63,0)');g.addColorStop(1,'rgba(255,120,100,0.7)');
  ctx.strokeStyle=g;ctx.lineWidth=4.5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(s.x-ux*L,s.y-uy*L);ctx.lineTo(s.x,s.y);ctx.stroke();
  ctx.fillStyle='rgba(255,80,60,0.22)';ctx.beginPath();ctx.arc(s.x,s.y,9.5,0,TAU);ctx.fill();
  ctx.fillStyle='rgba(217,72,63,0.6)';ctx.beginPath();ctx.arc(s.x,s.y,5.6,0,TAU);ctx.fill();
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#ffd2c4';ctx.beginPath();ctx.arc(s.x,s.y,2.8,0,TAU);ctx.fill();
  ctx.strokeStyle='rgba(120,30,24,0.8)';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(s.x,s.y,5.6,0,TAU);ctx.stroke();
  ctx.restore();
};

/* ---------- 激光：品红-白双层光束 + 命中点闪烁 ---------- */
A.laser=function(ctx,x1,y1,x2,y2,lvl,frame){
  const w1=2.4+(lvl||1)*1.3;
  const pu=0.72+0.28*Math.sin(frame*0.55);
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  ctx.globalAlpha=0.38*pu;ctx.strokeStyle='#ff5ce1';ctx.lineWidth=w1*2.6;
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.globalAlpha=0.85*pu;ctx.strokeStyle='#ff9de2';ctx.lineWidth=w1;
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.globalAlpha=0.95;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.1;
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  const rr=2.6+((frame>>2)%3)+(lvl||1)*0.4;                         // 命中点
  const g=ctx.createRadialGradient(x2,y2,0,x2,y2,rr*3);
  g.addColorStop(0,'rgba(255,255,255,0.85)');g.addColorStop(0.4,'rgba(255,140,225,0.4)');g.addColorStop(1,'rgba(255,92,225,0)');
  ctx.globalAlpha=1;ctx.fillStyle=g;
  ctx.beginPath();ctx.arc(x2,y2,rr*3,0,TAU);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x2,y2,rr*0.7,0,TAU);ctx.fill();
  ctx.restore();
};

/* ---------- 冲击波扩散环 ---------- */
A.ring=function(ctx,e){
  if(!e)return;
  const a=Math.max(0,Math.min(1,(e.life||0)/((e.maxLife||18)||1)));
  const lw=e.lw||3;
  ctx.save();ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=0.9*a;ctx.strokeStyle=e.color||'#e8a33d';
  ctx.lineWidth=lw*(0.35+0.65*a);
  ctx.beginPath();ctx.arc(e.x,e.y,Math.max(0.5,e.r),0,TAU);ctx.stroke();
  ctx.globalAlpha=0.35*a;ctx.lineWidth=lw*0.5;
  ctx.beginPath();ctx.arc(e.x,e.y,Math.max(0.5,e.r-lw*1.8),0,TAU);ctx.stroke();
  ctx.restore();
};

/* ---------- 锯齿闪电链（多段中点抖动，黄白双层） ---------- */
A.bolt=function(ctx,b){
  const pts=(b&&b.pts)||[];
  if(pts.length<2)return;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='lighter';
  for(let pass=0;pass<2;pass++){
    ctx.strokeStyle=pass?'#ffffff':'#ffe95c';
    ctx.lineWidth=pass?1.3:3.2;
    ctx.globalAlpha=pass?0.95:0.45;
    ctx.beginPath();
    for(let i=0;i<pts.length;i++){
      const p=pts[i];
      if(!i){ctx.moveTo(p.x,p.y);continue;}
      const q=pts[i-1];
      ctx.lineTo((q.x+p.x)/2+(Math.random()-0.5)*16,(q.y+p.y)/2+(Math.random()-0.5)*16);
      ctx.lineTo(p.x,p.y);
    }
    ctx.stroke();
  }
  const m=pts[(pts.length/2)|0];                                    // 一条随机分叉
  ctx.strokeStyle='rgba(255,233,92,0.7)';ctx.lineWidth=1.2;ctx.globalAlpha=0.7;
  ctx.beginPath();ctx.moveTo(m.x,m.y);
  ctx.lineTo(m.x+(Math.random()-0.5)*26-8,m.y+(Math.random()-0.5)*10-10);
  ctx.lineTo(m.x+(Math.random()-0.5)*30-14,m.y+(Math.random()-0.3)*14-16);
  ctx.stroke();
  ctx.restore();
};

/* ---------- 方形粒子（透明衰减） ---------- */
A.part=function(ctx,p){
  if(!p)return;
  const a=Math.max(0,Math.min(1,(p.life||0)/30));
  const s=2+2.2*a;
  ctx.globalAlpha=a;
  ctx.fillStyle=p.color||'#e8a33d';
  ctx.fillRect(p.x-s/2,p.y-s/2,s,s);
  ctx.globalAlpha=1;
};

/* ---------- 金币 ---------- */
A.coin=function(ctx,c){
  if(!c)return;
  ctx.save();ctx.translate(c.x,c.y);
  ctx.globalCompositeOperation='lighter';
  ctx.fillStyle='rgba(242,193,78,0.16)';
  ctx.beginPath();ctx.arc(0,0,9,0,TAU);ctx.fill();
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#f2c14e';ctx.beginPath();ctx.arc(0,0,5.2,0,TAU);ctx.fill();
  ctx.strokeStyle='#b8860b';ctx.lineWidth=1.4;
  ctx.beginPath();ctx.arc(0,0,5.2,0,TAU);ctx.stroke();
  ctx.strokeStyle='rgba(255,233,163,0.9)';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(0,0,3,0,TAU);ctx.stroke();
  ctx.fillStyle='#fff3c9';ctx.beginPath();ctx.arc(-1.6,-1.7,1.1,0,TAU);ctx.fill();
  ctx.restore();
};

/* ---------- 描边粗体浮动文字 ---------- */
A.floatText=function(ctx,f){
  if(!f)return;
  const maxL=f.maxLife||40;
  const a=Math.max(0,Math.min(1,f.life/Math.max(6,maxL*0.55)));
  ctx.save();
  ctx.globalAlpha=a;
  ctx.font='bold 16px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineJoin='round';ctx.lineWidth=3.5;ctx.strokeStyle='rgba(8,10,14,0.9)';
  ctx.strokeText(f.txt,f.x,f.y);
  ctx.fillStyle=f.color||'#e8e4d8';
  ctx.fillText(f.txt,f.x,f.y);
  ctx.restore();
};

/* ---------- 枪口星芒火光 ---------- */
A.muzzle=function(ctx,x,y,t){
  const k=Math.max(0,Math.min(1,t/6));
  if(k<=0)return;
  ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(0,0,0,0,0,15*k);
  g.addColorStop(0,'rgba(255,240,190,'+(0.5*k).toFixed(2)+')');
  g.addColorStop(0.45,'rgba(255,180,80,'+(0.26*k).toFixed(2)+')');
  g.addColorStop(1,'rgba(255,120,40,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,15*k,0,TAU);ctx.fill();
  const L1=(11+((t*7)%3))*k,L2=6*k,rot=(t%2)*0.4;                   // 四长芒+四短芒
  ctx.fillStyle='rgba(255,225,140,'+(0.9*k).toFixed(2)+')';
  for(let i=0;i<4;i++){
    const a=rot+i*Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a+0.22)*2.2,Math.sin(a+0.22)*2.2);
    ctx.lineTo(Math.cos(a)*L1,Math.sin(a)*L1);
    ctx.lineTo(Math.cos(a-0.22)*2.2,Math.sin(a-0.22)*2.2);
    ctx.closePath();ctx.fill();
    const a2=a+Math.PI/4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a2+0.3)*1.6,Math.sin(a2+0.3)*1.6);
    ctx.lineTo(Math.cos(a2)*L2,Math.sin(a2)*L2);
    ctx.lineTo(Math.cos(a2-0.3)*1.6,Math.sin(a2-0.3)*1.6);
    ctx.closePath();ctx.fill();
  }
  ctx.fillStyle='rgba(255,250,225,'+k.toFixed(2)+')';
  ctx.beginPath();ctx.arc(0,0,3.4*k,0,TAU);ctx.fill();
  ctx.restore();
};

window.ZD.ART=A;
})();
