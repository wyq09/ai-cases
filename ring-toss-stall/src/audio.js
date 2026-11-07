/* ============================================================
 * 地摊套圈 · RT.AUDIO — WebAudio 全程序化合成（零外部音频资源）
 * 夜市喜庆但克制：宫调五声(C D E G A)三角波弹拨 + 低音量锣鼓点 BGM
 * 引擎：惰性 AudioContext / 首手势 unlock 幂等 / 循环注册表干净启停
 *       节点用完 stop+disconnect / duck 压 BGM / 页面隐藏停 BGM
 *       applyOverrides 解码 dataURL，失败回落内置合成
 * ============================================================ */
window.RT=window.RT||{}; RT.AUDIO=(()=>{
'use strict';

/* ---------- 宫调五声音高表（C 宫：C D E G A） ---------- */
const NOTE={
  G2:98.00,A2:110.00,C3:130.81,D3:146.83,E3:164.81,
  C4:261.63,D4:293.66,E4:329.63,G4:392.00,A4:440.00,
  C5:523.25,D5:587.33,E5:659.25,G5:783.99,A5:880.00,C6:1046.50
};

/* BGM 节拍：96 BPM，一小节 8 拍 = 16 个八分音符位 */
const BEAT=0.625, E=BEAT/2, BAR=BEAT*8;

/* cue 清单（11 个 SFX + 1 个循环） */
const NAMES=['throw','swoosh','bounceWood','bounceGround','ringSettle','win','rare',
  'missSoft','coin','prizeCollect','talk','loop:bgm'];

/* ---------- 状态 ---------- */
let actx=null,master=null,sfx=null,bgmOut=null,noiseBuf=null;
let vBGM=0.35,vSFX=1,vMaster=1;
const overrides=Object.create(null);   /* name -> AudioBuffer */
let pending={};                        /* 未建 ctx 前缓存的 override dataURL */
const loops=Object.create(null);       /* 循环注册表 */
let bgmWanted=false,deferStart=false,duckT=null;

const clamp01=(v)=>{v=+v;return isNaN(v)?0:(v<0?0:(v>1?1:v));};

/* ---------- 惰性上下文 ---------- */
function ensureCtx(){
  if(actx)return actx;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  try{actx=new AC();}catch(e){return null;}
  master=actx.createGain();master.gain.value=vMaster;master.connect(actx.destination);
  sfx=actx.createGain();sfx.gain.value=vSFX;sfx.connect(master);
  bgmOut=actx.createGain();bgmOut.gain.value=vBGM;bgmOut.connect(master);
  flushPending();
  return actx;
}

/* iOS 首手势解锁：幂等，可反复调用 */
function unlock(){
  if(!actx){const c=ensureCtx();if(!c)return false;}
  if(actx.state!=='running'){
    try{const p=actx.resume();if(p&&p.catch)p.catch(()=>{});}catch(e){}
  }
  if(actx.state==='running'&&deferStart){deferStart=false;startLoop('bgm');}
  return true;
}

/* ---------- 共享噪声源 ---------- */
function getNoise(){
  if(noiseBuf)return noiseBuf;
  const len=Math.floor(actx.sampleRate*1.2);
  noiseBuf=actx.createBuffer(1,len,actx.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  return noiseBuf;
}

/* ---------- 基础发声器（每个自带 onended 清理：stop 后 disconnect） ---------- */
/* 弹拨：短促衰减三角波 + 低通 */
function pluck(out,t0,f,dur,vol,reg){
  const c=actx;
  const o=c.createOscillator();o.type='triangle';
  o.frequency.setValueAtTime(f,t0);
  const lp=c.createBiquadFilter();lp.type='lowpass';
  lp.frequency.value=Math.min(4200,f*4.5);lp.Q.value=0.7;
  const g=c.createGain();
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(vol,t0+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(lp);lp.connect(g);g.connect(out);
  o.start(t0);o.stop(t0+dur+0.03);
  o.onended=()=>{try{o.disconnect();lp.disconnect();g.disconnect();}catch(e){}};
  if(reg)reg.push({src:o,end:t0+dur+0.05});
  return o;
}
/* 振荡音：可选上滑(f1)、保持(sus)、低通(lp)、起始偏移(at) */
function tone(out,t0,opt,reg){
  const c=actx,t=t0+(opt.at||0);
  const o=c.createOscillator();o.type=opt.type||'sine';
  o.frequency.setValueAtTime(opt.f0,t);
  if(opt.f1)o.frequency.exponentialRampToValueAtTime(opt.f1,t+(opt.glide!=null?opt.glide:opt.dur*0.6));
  const g=c.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(opt.vol,t+(opt.atk||0.008));
  if(opt.sus)g.gain.setValueAtTime(opt.vol,t+(opt.atk||0.008)+opt.sus);
  g.gain.exponentialRampToValueAtTime(0.0001,t+opt.dur);
  let head=o;
  if(opt.lp){const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=opt.lp;o.connect(lp);head=lp;}
  head.connect(g);g.connect(out);
  o.start(t);o.stop(t+opt.dur+0.03);
  o.onended=()=>{try{o.disconnect();head.disconnect();g.disconnect();}catch(e){}};
  if(reg)reg.push({src:o,end:t+opt.dur+0.05});
  return o;
}
/* 滤波噪声脉冲：带通/高通/低通 + 可选频率扫掠 */
function noise(out,t0,opt,reg){
  const c=actx;
  const s=c.createBufferSource();s.buffer=getNoise();s.loop=true;
  const f=c.createBiquadFilter();f.type=opt.type||'bandpass';
  f.Q.value=opt.q!=null?opt.q:1;
  f.frequency.setValueAtTime(opt.f,t0);
  if(opt.fEnd)f.frequency.exponentialRampToValueAtTime(opt.fEnd,t0+opt.dur);
  const g=c.createGain();
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.linearRampToValueAtTime(opt.vol,t0+(opt.atk||0.01));
  g.gain.exponentialRampToValueAtTime(0.0001,t0+opt.dur);
  s.connect(f);f.connect(g);g.connect(out);
  s.start(t0);s.stop(t0+opt.dur+0.02);
  s.onended=()=>{try{s.disconnect();f.disconnect();g.disconnect();}catch(e){}};
  if(reg)reg.push({src:s,end:t0+opt.dur+0.05});
  return s;
}

/* ---------- SFX 合成表（t=起点秒，m=音量系数） ---------- */
const SYNTH={
  /* 圈出手：短 whoosh（带通噪声上扫） */
  throw(t,m,o){const r=(o&&o.rate)||1;
    noise(sfx,t,{f:600*r,fEnd:2600*r,q:0.9,dur:0.20/r,vol:0.45*m,atk:0.045});
    noise(sfx,t,{type:'highpass',f:1500,q:0.7,dur:0.14/r,vol:0.15*m,atk:0.02});
  },
  /* 高速风声变体：更长更宽的双层扫掠 */
  swoosh(t,m,o){const r=(o&&o.rate)||1;
    noise(sfx,t,{f:300*r,fEnd:3400*r,q:0.7,dur:0.40/r,vol:0.55*m,atk:0.09});
    noise(sfx,t,{type:'highpass',f:900,q:0.6,dur:0.32/r,vol:0.20*m,atk:0.06});
    noise(sfx,t+0.12/r,{f:1400*r,fEnd:500*r,q:1.1,dur:0.20/r,vol:0.16*m,atk:0.05});
  },
  /* 磕凳面：木咚（三角波急降 + 敲击噪声） */
  bounceWood(t,m,o){const r=(o&&o.rate)||1;
    tone(sfx,t,{type:'triangle',f0:175*r,f1:92*r,glide:0.09,dur:0.14,vol:0.65*m,atk:0.004});
    tone(sfx,t,{type:'sine',f0:260*r,f1:130*r,glide:0.05,dur:0.09,vol:0.22*m,atk:0.002});
    noise(sfx,t,{type:'bandpass',f:1500,q:0.8,dur:0.03,vol:0.28*m,atk:0.002});
  },
  /* 塑料地弹：偏高更脆的短弹 */
  bounceGround(t,m,o){const r=(o&&o.rate)||1;
    tone(sfx,t,{type:'triangle',f0:330*r,f1:170*r,glide:0.045,dur:0.08,vol:0.5*m,atk:0.003});
    noise(sfx,t,{type:'bandpass',f:1000,q:1,dur:0.035,vol:0.3*m,atk:0.002});
  },
  /* 圈落地滚停：4 次递减摇摆撞击 + 摩擦噪声尾 */
  ringSettle(t,m){
    const off=[0,0.11,0.23,0.33],vv=[0.36,0.26,0.16,0.10];
    for(let i=0;i<4;i++){
      tone(sfx,t+off[i],{type:'triangle',f0:150-8*i,f1:95,glide:0.05,dur:0.07,vol:vv[i]*m,atk:0.003});
      noise(sfx,t+off[i],{type:'bandpass',f:850,q:1.5,dur:0.03,vol:vv[i]*0.55*m,atk:0.002});
    }
    noise(sfx,t+0.05,{type:'lowpass',f:650,q:0.5,dur:0.42,vol:0.18*m,atk:0.06});
    noise(sfx,t+0.08,{type:'bandpass',f:1600,q:2,dur:0.30,vol:0.06*m,atk:0.05});
  },
  /* 套中：上行五声琶音 + 欢呼合音垫（约 0.8s） */
  win(t,m){
    const seq=[523.25,587.33,659.25,783.99,880.00,1046.50];
    for(let i=0;i<seq.length;i++)pluck(sfx,t+i*0.07,seq[i],0.32,0.38*m);
    const ch=[261.63,329.63,392.00,523.25];
    for(let i=0;i<ch.length;i++)tone(sfx,t+0.10,{type:'sine',f0:ch[i],dur:0.70,vol:0.11*m,atk:0.05,sus:0.35});
    noise(sfx,t+0.05,{type:'bandpass',f:1100,q:0.5,dur:0.55,vol:0.07*m,atk:0.15});
  },
  /* 稀有中奖：锣 + 双八度五声快跑 + 收束和弦 */
  rare(t,m){
    const pa=[196,294,392.5,523,660];
    for(let i=0;i<pa.length;i++)tone(sfx,t,{type:'sine',f0:pa[i],dur:1.1,vol:(0.20-0.03*i)*m,atk:0.004});
    noise(sfx,t,{type:'bandpass',f:2600,q:0.7,dur:0.35,vol:0.28*m,atk:0.005});
    noise(sfx,t,{type:'lowpass',f:300,q:0.5,dur:0.40,vol:0.22*m,atk:0.004});
    const seq=[523.25,587.33,659.25,783.99,880.00,1046.50,1174.66,1318.51];
    for(let i=0;i<seq.length;i++)pluck(sfx,t+0.10+i*0.05,seq[i],0.30,0.36*m);
    const ch=[1046.50,1318.51,1567.98];
    for(let i=0;i<ch.length;i++)tone(sfx,t+0.55,{type:'sine',f0:ch[i],dur:0.50,vol:0.12*m,atk:0.02,sus:0.20});
  },
  /* 轻落 miss：低通噪声噗 + 低频下滑 */
  missSoft(t,m){
    noise(sfx,t,{type:'lowpass',f:320,q:0.4,dur:0.10,vol:0.30*m,atk:0.01});
    tone(sfx,t,{type:'sine',f0:130,f1:70,glide:0.07,dur:0.12,vol:0.20*m,atk:0.005});
  },
  /* 买圈：金属叮当 ×2（非谐分音簇） */
  coin(t,m){
    const strike=(t0,base)=>{
      const ps=[1,1.34,1.83,2.52];
      for(let i=0;i<ps.length;i++)tone(sfx,t0,{type:'sine',f0:base*ps[i],dur:0.12-i*0.02,vol:(0.26-0.06*i)*m,atk:0.002});
      noise(sfx,t0,{type:'highpass',f:5000,q:0.7,dur:0.02,vol:0.08*m,atk:0.001});
    };
    strike(t,2093);strike(t+0.10,2093);
  },
  /* 收奖品：叮-咚 上滑 + 亮尾 */
  prizeCollect(t,m){
    tone(sfx,t,{type:'sine',f0:880,dur:0.16,vol:0.38*m,atk:0.004});
    tone(sfx,t+0.13,{type:'sine',f0:740,f1:1480,glide:0.26,dur:0.34,vol:0.38*m,atk:0.02});
    pluck(sfx,t+0.36,1567.98,0.22,0.22*m);
  },
  /* 老板短哼两音：三角波 + 低通，哼感下滑 */
  talk(t,m){
    tone(sfx,t,{type:'triangle',f0:233,f1:196,glide:0.06,dur:0.13,vol:0.30*m,atk:0.02,lp:650});
    tone(sfx,t+0.16,{type:'triangle',f0:196,f1:165,glide:0.06,dur:0.15,vol:0.28*m,atk:0.02,lp:600});
  }
};

/* ---------- BGM：宫调五声弹拨 + 低音量锣鼓点 ---------- */
/* 旋律模式：[八分音符位, 音, 时值(八分), 音量] */
const PAT_A=[
  [0,'C5',1,.42],[1,'E5',1,.36],[2,'G5',1,.40],[3,'A5',1,.32],[4,'G5',2,.42],
  [6,'E5',1,.36],[7,'D5',1,.32],[8,'C5',2,.42],[10,'D5',1,.34],[11,'E5',1,.36],
  [12,'G4',2,.36],[14,'C5',2,.38]];
const PAT_B=[
  [0,'A4',1,.40],[1,'C5',1,.36],[2,'D5',1,.38],[4,'E5',2,.42],[6,'D5',1,.34],
  [8,'C5',1,.40],[9,'A4',1,.34],[10,'G4',2,.40],[12,'E4',2,.34],[14,'G4',2,.36]];
const PAT_C=[
  [0,'C5',1,.40],[2,'D5',1,.36],[4,'E5',1,.40],[5,'G5',1,.36],[6,'A5',1,.40],
  [8,'C6',3,.44],[12,'G5',2,.36],[14,'A5',2,.38]];
const BASS_A=[[0,'C3',3,.46],[8,'G2',3,.44],[14,'C3',2,.30]];
const BASS_B=[[0,'A2',3,.46],[8,'E3',3,.44]];
const BASS_C=[[0,'C3',3,.46],[8,'G2',3,.44]];

function drum(out,t,reg){
  tone(out,t,{type:'sine',f0:150,f1:60,glide:0.09,dur:0.16,vol:0.30,atk:0.003},reg);
  noise(out,t,{type:'lowpass',f:220,q:0.5,dur:0.10,vol:0.20,atk:0.003},reg);
}
function tick(out,t,reg){noise(out,t,{type:'bandpass',f:3400,q:2,dur:0.045,vol:0.09,atk:0.002},reg);}
function cym(out,t,reg){noise(out,t,{type:'bandpass',f:6500,q:1,dur:0.18,vol:0.05,atk:0.003},reg);}
function gong(out,t,reg){
  noise(out,t,{type:'bandpass',f:750,q:3,dur:0.6,vol:0.08,atk:0.004},reg);
  tone(out,t,{type:'sine',f0:392,f1:380,glide:0.5,dur:0.55,vol:0.05,atk:0.004},reg);
}
/* 排一小节 */
function schedBar(t0,idx){
  const L=loops.bgm;if(!L)return;
  const out=bgmOut,reg=L.reg;
  let pat,bass;
  if(idx%8===7){pat=PAT_C;bass=BASS_C;}
  else if(idx%2===0){pat=PAT_A;bass=BASS_A;}
  else{pat=PAT_B;bass=BASS_B;}
  for(let i=0;i<pat.length;i++)
    pluck(out,t0+pat[i][0]*E,NOTE[pat[i][1]],Math.min(0.9,pat[i][2]*E),pat[i][3],reg);
  for(let i=0;i<bass.length;i++)
    pluck(out,t0+bass[i][0]*E,NOTE[bass[i][1]],Math.min(1.0,bass[i][2]*E),bass[i][3],reg);
  drum(out,t0,reg);drum(out,t0+8*E,reg);
  tick(out,t0+4*E,reg);tick(out,t0+12*E,reg);
  cym(out,t0+14*E,reg);
  if(idx%4===0)gong(out,t0+0.02,reg);
}
/* 前瞻调度：每 400ms 补排未来 0.7s 内的小节，并清理已结束的登记 */
function bgmTick(){
  const L=loops.bgm;
  if(!L||!L.on||!actx)return;
  const ahead=actx.currentTime+0.7;
  let guard=0;
  while(L.next<ahead&&guard++<8){schedBar(L.next,L.bar++);L.next+=BAR;}
  for(let i=L.reg.length-1;i>=0;i--)
    if(L.reg[i].end<=actx.currentTime)L.reg.splice(i,1);
}

/* ---------- 循环注册表 ---------- */
function startLoop(name){
  const key=String(name||'').replace(/^loop:/,'');
  if(key!=='bgm')return false;
  const c=ensureCtx();if(!c)return false;
  if(c.state!=='running'){ /* 尚未解锁：挂起，等 statechange/unlock 后自动起 */
    bgmWanted=true;deferStart=true;
    try{c.onstatechange=()=>{if(actx&&actx.state==='running'&&deferStart){deferStart=false;startLoop('bgm');}};}catch(e){}
    return false;
  }
  let L=loops[key];
  if(L&&L.on)return true;
  if(!L)L=loops[key]={on:false,reg:[],timer:null,next:0,bar:0};
  L.on=true;L.reg.length=0;L.bar=0;L.next=c.currentTime+0.06;
  bgmWanted=true;
  bgmTick();
  L.timer=setInterval(bgmTick,400);
  return true;
}
function stopLoop(name,keepWanted){
  const key=String(name||'').replace(/^loop:/,'');
  const L=loops[key];if(!L)return false;
  const was=L.on;
  if(L.timer){clearInterval(L.timer);L.timer=null;}
  L.on=false;
  for(let i=0;i<L.reg.length;i++){try{L.reg[i].src.stop(0);}catch(e){}}
  L.reg.length=0;
  if(key==='bgm'&&!keepWanted)bgmWanted=false;
  return was;
}

/* ---------- 页面隐藏停 BGM、回来续播 ---------- */
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('visibilitychange',()=>{
    const L=loops.bgm;
    if(document.hidden){if(L&&L.on)stopLoop('bgm',true);}
    else if(bgmWanted)startLoop('bgm');
  });
}
/* 兜底首手势（main 也会显式调 unlock；幂等无副作用） */
if(typeof window!=='undefined'&&window.addEventListener){
  const g=()=>{unlock();};
  try{
    window.addEventListener('pointerdown',g,{passive:true});
    window.addEventListener('touchend',g,{passive:true});
    window.addEventListener('keydown',g,{passive:true});
  }catch(e){}
}

/* ---------- 播放入口 ---------- */
function play(name,opts){
  if(!name||String(name).slice(0,5)==='loop:')return;
  const c=ensureCtx();if(!c)return;
  if(c.state!=='running'){try{c.resume();}catch(e){}return;}
  const t0=c.currentTime+Math.max(0,(opts&&opts.delay)||0);
  const m=(opts&&opts.volume!=null)?clamp01(opts.volume):1;
  if(overrides[name]){playBuffer(name,t0,opts||{});return;}
  const fn=SYNTH[name];
  if(!fn)return;
  fn(t0,m,opts||{});
}
function playBuffer(name,t0,opts){
  const c=actx,s=c.createBufferSource();
  s.buffer=overrides[name];
  const r=(opts&&opts.rate)?Math.max(0.25,Math.min(4,opts.rate)):1;
  s.playbackRate.value=r;
  let pan=null;
  if(opts&&opts.pan&&c.createStereoPanner){
    pan=c.createStereoPanner();pan.pan.value=Math.max(-1,Math.min(1,opts.pan));
    s.connect(pan);pan.connect(sfx);
  }else s.connect(sfx);
  const dur=(s.buffer.duration||0.5)/r;
  s.onended=()=>{try{s.disconnect();if(pan)pan.disconnect();}catch(e){}};
  s.start(t0);s.stop(t0+dur+0.02);
}

/* ---------- duck：压 BGM 再恢复 ---------- */
function clearDuck(){if(duckT){clearTimeout(duckT);duckT=null;}}
function duck(ms){
  if(!bgmOut)return;
  clearDuck();
  const t=actx.currentTime;
  bgmOut.gain.cancelScheduledValues(t);
  bgmOut.gain.setValueAtTime(Math.max(0.0001,bgmOut.gain.value),t);
  bgmOut.gain.linearRampToValueAtTime(Math.max(0.0001,vBGM*0.25),t+0.08);
  duckT=setTimeout(()=>{
    duckT=null;if(!bgmOut)return;
    const t2=actx.currentTime;
    bgmOut.gain.cancelScheduledValues(t2);
    bgmOut.gain.setValueAtTime(Math.max(0.0001,bgmOut.gain.value),t2);
    bgmOut.gain.linearRampToValueAtTime(vBGM,t2+0.35);
  },Math.max(1,ms||600));
}

/* ---------- 音量控制 ---------- */
function rampTo(node,v,tc){
  const t=actx.currentTime;
  node.gain.cancelScheduledValues(t);
  node.gain.setValueAtTime(Math.max(0.0001,node.gain.value),t);
  node.gain.setTargetAtTime(Math.max(0.0001,v),t,tc);
}
function setMasterVolume(v){vMaster=clamp01(v);if(master)rampTo(master,vMaster,0.02);}
function setSFXVolume(v){vSFX=clamp01(v);if(sfx)rampTo(sfx,vSFX,0.02);}
function setBGMVolume(v){vBGM=clamp01(v);clearDuck();if(bgmOut)rampTo(bgmOut,vBGM,0.02);}

/* ---------- override：dataURL 解码，失败回落合成 ---------- */
function decodeCompat(c,ab){
  return new Promise((res,rej)=>{
    let p=null;
    try{p=c.decodeAudioData(ab,res,rej);}catch(e){rej(e);return;}
    if(p&&p.then)p.then(res,rej);
  });
}
function decodeInto(name,url){
  if(!actx)return;
  delete overrides[name];
  try{
    fetch(url).then(r=>r.arrayBuffer())
      .then(ab=>decodeCompat(actx,ab))
      .then(b=>{if(actx)overrides[name]=b;})
      .catch(()=>{delete overrides[name];});
  }catch(e){delete overrides[name];}
}
function flushPending(){
  for(const k in pending)decodeInto(k,pending[k]);
  pending={};
}
function applyOverrides(map){
  if(!map||typeof map!=='object')return;
  for(const k in map){
    const url=map[k];
    if(typeof url!=='string')continue;
    if(actx)decodeInto(k,url);
    else pending[k]=url;
  }
}

return {
  unlock,play,startLoop,stopLoop,duck,
  setBGMVolume,setSFXVolume,setMasterVolume,
  applyOverrides,names:NAMES
};
})();
