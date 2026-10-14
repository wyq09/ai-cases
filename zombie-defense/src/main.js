/* ==== main.js ==== 启动 / 双驱动主循环 / 输入 / 自适应 */
(function(){
'use strict';
const ZD=window.ZD, G=ZD.game;
const cv=document.getElementById('cv');
const ctx=cv.getContext('2d');
const Q=window.__Q||{};
let cssW=480, cssH=800;

function resize(){
  const stage=document.getElementById('stage');
  cssW=stage.clientWidth||window.innerWidth;
  cssH=stage.clientHeight||window.innerHeight;
  const dpr=Math.min(2, window.devicePixelRatio||1);
  cv.width=Math.round(cssW*dpr); cv.height=Math.round(cssH*dpr);
  cv.style.width=cssW+'px'; cv.style.height=cssH+'px';
  G.resize(cssW,cssH);
  ZD.ui.layout();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,120));

/* ---------- 输入 ---------- */
// 音频解锁挂 document 捕获段：第一次点 DOM 按钮（如开始游戏）也能解锁
document.addEventListener('pointerdown', ()=>{ try{ ZD.audio&&ZD.audio.unlock(); }catch(e){} }, true);
function stageX(e){ const r=cv.getBoundingClientRect(); return e.clientX-r.left; }
cv.addEventListener('pointerdown', e=>{
  e.preventDefault();
  try{ ZD.audio&&ZD.audio.unlock(); }catch(err){}
  if(G.state==='play'){ playerTo(stageX(e)); }
},{passive:false});
cv.addEventListener('pointermove', e=>{
  if(G.state!=='play') return;
  if(e.buttons || e.pointerType==='touch') playerTo(stageX(e));
},{passive:true});
function playerTo(x){ const p=G.player; if(p){ p.targetX=Math.max(24,Math.min(G.W-24,x)); } }

/* ---------- BGM 随场景 ---------- */
G.on('state', ()=>{
  try{
    if(!ZD.audio) return;
    const s=G.state;
    ZD.audio.bgm(s==='menu'||s==='shop' ? 'menu' : s==='over' ? null : 'battle');
  }catch(e){}
});

/* ---------- 可见性 ---------- */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && G.state==='play' && !(window.__zd&&window.__zd.__noAutoPause)) G.pause();
});

/* ---------- 主循环：rAF + setInterval 双驱动定步长 ---------- */
const STEP=1000/60;
let acc=0, lastPump=performance.now();
function pump(now){
  if(now-lastPump<6) return;
  let dt=now-lastPump; lastPump=now;
  if(dt>250) dt=250;
  if(G.state!=='play'){ acc=0; return; }
  acc+=dt*G.speed;
  let steps=0;
  while(acc>=STEP && steps<10){
    G.update(); acc-=STEP; steps++;
    if(G.state!=='play'){ acc=0; break; }
  }
  if(acc>STEP*10) acc=0;
}
let fps=60, fpsN=0, fpsT=performance.now(), devEl=null;
function raf(now){
  requestAnimationFrame(raf);
  pump(now);
  // 绘制（非战斗态也画：菜单背后是活的哨站场景）
  const dpr=Math.min(2, window.devicePixelRatio||1);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  G.render(ctx);
  if(G.state==='play'||G.state==='pause'||G.state==='levelup'||G.state==='over') ZD.ui.updateHUD();
  ZD.ui.updateWallBar();
  if(window.__Q&&window.__Q.dev){
    fpsN++;
    if(now-fpsT>500){ fps=Math.round(fpsN*1000/(now-fpsT)); fpsN=0; fpsT=now;
      if(!devEl){ devEl=document.createElement('div'); devEl.id='fps'; document.getElementById('stage').appendChild(devEl); }
      devEl.textContent=fps+'fps · '+cssW+'×'+cssH;
    }
  }
}
setInterval(()=>pump(performance.now()),120);

/* ---------- 启动 ---------- */
ZD.ui.init();
resize();
if(Q.muted) G.setMuted(true);
try{ ZD.audio&&ZD.audio.setMuted(G.muted()); }catch(e){}
G.emit('state');           // 渲染菜单
requestAnimationFrame(raf);
})();
