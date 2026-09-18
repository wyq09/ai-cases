window.PC=window.PC||{}; PC.AUDIO=(()=>{
'use strict';

/* ============================================================
   接水管 · AUDIO 子系统（WebAudio 程序化合成，零外部音频）
   - unlock(): 幂等，须在首次用户手势内调用（恢复/创建 AudioContext）
   - play(name,opts) / startLoop / stopLoop / duck(ms)
   - setBGMVolume / setSFXVolume / setMasterVolume（实时生效）
   - applyOverrides(map)：{cue:dataURL} 自定义音效优先，解码失败回落合成
   - 无 AudioContext 环境（如 node 自测）全程静默降级，不抛异常
   ============================================================ */

const NAMES=['rotate','flow','splash','win','lose','tick','click','start','bgm'];

/* ---------- 能力检测 ---------- */
let AC=null;
try{
  if(typeof window!=='undefined') AC=window.AudioContext||window.webkitAudioContext||null;
}catch(e){ AC=null; }

/* ---------- 内部状态 ---------- */
let ctx=null, master=null, sfxBus=null, bgmBus=null, bgmDuck=null, noiseBuf=null;
let masterVol=1, sfxVol=0.8, bgmVol=0.35;          // 与 DEFAULT_CFG 对齐
const DUCK_LVL=0.3;                                 // duck 时 BGM 压到 30%
let duckTimer=0, bgmAutoPaused=false;
const ov={ raw:{}, buf:{} };                        // 自定义音效：原始 dataURL / 解码后 buffer
const loops={
  flow:{ on:false, wanted:false, nodes:null },
  bgm :{ on:false, wanted:false, timer:0, step:0, nextT:0 }
};

function now(){ return ctx?ctx.currentTime:0; }
function clamp01(v){ v=+v; if(!(v>=0)) return 0; return v>1?1:v; }

/* ---------- 图构建（unlock 时一次） ---------- */
function buildGraph(){
  master=ctx.createGain(); master.gain.value=masterVol; master.connect(ctx.destination);
  bgmDuck=ctx.createGain(); bgmDuck.gain.value=(loops.flow.on?DUCK_LVL:1); bgmDuck.connect(master);
  bgmBus=ctx.createGain(); bgmBus.gain.value=bgmVol; bgmBus.connect(bgmDuck);
  sfxBus=ctx.createGain(); sfxBus.gain.value=sfxVol; sfxBus.connect(master);
  const len=Math.floor(ctx.sampleRate*1.2);
  noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=noiseBuf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
}

/* ---------- 合成小工具 ---------- */
function noiseSrc(t,dur){
  const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
  s.start(t); s.stop(t+dur+0.06); return s;
}
function envG(t,a,peak,hold,rel){
  const g=ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(peak,t+a);
  if(hold>0) g.gain.setValueAtTime(peak,t+a+hold);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+hold+rel);
  return g;
}
function tone(t,type,f0,f1,dur,peak,dest){
  const o=ctx.createOscillator(); o.type=type;
  o.frequency.setValueAtTime(f0,t);
  if(f1&&f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
  const g=envG(t,0.004,peak,0,dur);
  o.connect(g); g.connect(dest||sfxBus);
  o.start(t); o.stop(t+dur+0.1);
  return o;
}
function clickNoise(t,hpF,peak,rel){
  const n=noiseSrc(t,rel+0.01);
  const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=hpF;
  const g=envG(t,0.001,peak,0,rel);
  n.connect(hp); hp.connect(g); g.connect(sfxBus);
}

/* ---------- cue 合成器 ---------- */
const SYNTH={
  /* rotate 金属棘轮「咔」~70ms：噪声瞬态 + 方波速降 + 二次弱嗒 */
  rotate(t,v){
    clickNoise(t,2500,0.5*v,0.02);
    tone(t,'square',1500,650,0.045,0.18*v);
    tone(t+0.032,'square',1100,520,0.03,0.1*v);
  },
  /* flow 单发水泡（循环请用 startLoop('flow')） */
  flow(t,v){
    tone(t,'sine',180,430,0.12,0.12*v);
    tone(t+0.1,'sine',430,240,0.1,0.1*v);
    tone(t+0.2,'sine',260,520,0.09,0.08*v);
  },
  /* splash 噗通水花 ~300ms：低频下落 + 带通噪声扫频 + 水滴回弹 */
  splash(t,v){
    tone(t,'sine',300,70,0.13,0.5*v);
    const t2=t+0.02;
    const n=noiseSrc(t2,0.26);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=0.8;
    bp.frequency.setValueAtTime(2600,t2);
    bp.frequency.exponentialRampToValueAtTime(500,t2+0.26);
    const g=envG(t2,0.006,0.4*v,0,0.25);
    n.connect(bp); bp.connect(g); g.connect(sfxBus);
    tone(t+0.14,'sine',520,180,0.1,0.15*v);
  },
  /* win 上行三音 fanfare ~800ms（C5-E5-G5，三角波柔和） */
  win(t,v){
    const seq=[[0,523.25,0.30],[0.17,659.25,0.30],[0.34,783.99,0.46]];
    for(let i=0;i<seq.length;i++){
      const dt=seq[i][0], f=seq[i][1], d=seq[i][2];
      const o1=ctx.createOscillator(); o1.type='triangle'; o1.frequency.value=f;
      const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2;
      const g=envG(t+dt,0.008,0.22*v,0.08,d);
      const g2=ctx.createGain(); g2.gain.value=0.12;
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(sfxBus);
      o1.start(t+dt); o1.stop(t+dt+d+0.3);
      o2.start(t+dt); o2.stop(t+dt+d+0.3);
    }
  },
  /* lose 下行两音 ~500ms（A3→D3，三角波+低通，闷而不刺） */
  lose(t,v){
    const seq=[[0,220,0.2],[0.22,146.83,0.3]];
    for(let i=0;i<seq.length;i++){
      const dt=seq[i][0], f=seq[i][1], d=seq[i][2];
      const o=ctx.createOscillator(); o.type='triangle';
      o.frequency.setValueAtTime(f,t+dt);
      o.frequency.exponentialRampToValueAtTime(f*0.92,t+dt+d);
      const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900;
      const g=envG(t+dt,0.01,0.2*v,0.05,d);
      o.connect(lp); lp.connect(g); g.connect(sfxBus);
      o.start(t+dt); o.stop(t+dt+d+0.25);
    }
  },
  /* tick 秒针嗒 ~50ms */
  tick(t,v){
    tone(t,'sine',1900,1400,0.03,0.12*v);
    clickNoise(t,5000,0.08*v,0.012);
  },
  /* click UI 轻嗒 ~40ms */
  click(t,v){
    tone(t,'sine',850,600,0.028,0.16*v);
    clickNoise(t,3000,0.06*v,0.01);
  },
  /* start 汽笛短鸣 ~250ms：锯齿波上扬 + 颤音 + 气息噪声 */
  start(t,v){
    const o=ctx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(520,t);
    o.frequency.linearRampToValueAtTime(700,t+0.05);
    o.frequency.setValueAtTime(700,t+0.18);
    o.frequency.linearRampToValueAtTime(655,t+0.25);
    const lfo=ctx.createOscillator(); lfo.frequency.value=7;
    const lg=ctx.createGain(); lg.gain.value=12;
    lfo.connect(lg); lg.connect(o.frequency);
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1800;
    const g=envG(t,0.03,0.16*v,0.12,0.09);
    o.connect(lp); lp.connect(g); g.connect(sfxBus);
    const n=noiseSrc(t,0.25);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1400; bp.Q.value=1.2;
    const ng=envG(t,0.04,0.05*v,0.1,0.1);
    n.connect(bp); bp.connect(ng); ng.connect(sfxBus);
    o.start(t); o.stop(t+0.32);
    lfo.start(t); lfo.stop(t+0.32);
  }
  /* bgm 仅作循环（startLoop('bgm')），无单发形态 */
};

/* ---------- BGM：96bpm C 大调五声音阶 马林巴+轻打击 ---------- */
const BPM=96, STEP=60/BPM/2;                        // 八分音符步长 0.3125s
const P={G2:98.00,A2:110.00,C3:130.81,D3:146.83,E3:164.81,G3:196.00,A3:220.00,
         C4:261.63,D4:293.66,E4:329.63,G4:392.00,A4:440.00,
         C5:523.25,D5:587.33,E5:659.25,G5:783.99,A5:880.00};
const MEL=[                                         // 4 乐句 ×16 步，null=休止
  ['C5',null,'E5',null,'G4',null,'A4',null,'E5',null,'D5',null,'C5',null,'G4',null],
  ['E5',null,'G5',null,'E5',null,'D5',null,'C5',null,'A4',null,'G4',null,'E4',null],
  ['C5',null,'D5',null,'E5',null,'G5',null,'A5',null,'G5',null,'E5',null,'D5',null],
  ['A4',null,'C5',null,'D5',null,'E5',null,'D5',null,'C5',null,'A4',null,'G4',null]
];
const BASS=['C3','A2','C3','G2'];                   // 每小节根音
const FIFTH={C3:'G3',A2:'E3',G2:'D3'};

function marimba(t,f,vel){
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2200;
  const g=envG(t,0.005,vel,0,0.38);
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*3.98;
  const g2=ctx.createGain();
  g2.gain.setValueAtTime(vel*0.35,t);
  g2.gain.exponentialRampToValueAtTime(0.0001,t+0.09);
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bgmBus);
  o1.start(t); o1.stop(t+0.5);
  o2.start(t); o2.stop(t+0.15);
}
function hat(t,vel){
  const n=noiseSrc(t,0.04);
  const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=7000;
  const g=envG(t,0.001,vel,0,0.035);
  n.connect(hp); hp.connect(g); g.connect(bgmBus);
}
function woodblock(t,vel){
  const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=820;
  const g=envG(t,0.001,vel,0,0.06);
  o.connect(g); g.connect(bgmBus);
  o.start(t); o.stop(t+0.09);
}
function schedStep(step,t){
  const ph=Math.floor(step/16)%4, pos=step%16;
  const bar=Math.floor(step/8)%4, bp=step%8;
  const m=MEL[ph][pos];
  if(m) marimba(t,P[m],(pos%8===0)?0.17:0.12);
  if(bp===0) marimba(t,P[BASS[bar]],0.2);
  if(bp===4) marimba(t,P[FIFTH[BASS[bar]]],0.09);
  if(bp===2||bp===6) hat(t,0.045);
  if(ph%2===1&&bp===4) woodblock(t,0.05);
}
function bgmPump(){                                 // 前瞻调度器
  const horizon=now()+0.22;
  let guard=0;
  while(loops.bgm.nextT<horizon&&guard++<128){
    schedStep(loops.bgm.step,loops.bgm.nextT);
    loops.bgm.nextT+=STEP;
    loops.bgm.step=(loops.bgm.step+1)%64;
  }
}
function startBgmSched(){
  loops.bgm.step=0; loops.bgm.nextT=now()+0.08;
  bgmPump();
  loops.bgm.timer=setInterval(bgmPump,60);
}

/* ---------- flow 水流循环：白噪声低通+LFO + 低频汩汩滑音 ---------- */
function startFlowNodes(){
  const t=now();
  const src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=420; lp.Q.value=1.1;
  const lfo=ctx.createOscillator(); lfo.frequency.value=1.3;
  const lg=ctx.createGain(); lg.gain.value=240;
  lfo.connect(lg); lg.connect(lp.frequency);
  const g=ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(0.5,t+0.18);
  src.connect(lp); lp.connect(g); g.connect(sfxBus);
  const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=95;
  const wl=ctx.createOscillator(); wl.frequency.value=0.7;
  const wg=ctx.createGain(); wg.gain.value=38;
  wl.connect(wg); wg.connect(o.frequency);
  const og=ctx.createGain();
  og.gain.setValueAtTime(0.0001,t);
  og.gain.linearRampToValueAtTime(0.07,t+0.2);
  o.connect(og); og.connect(sfxBus);
  src.start(t); lfo.start(t); o.start(t); wl.start(t);
  loops.flow.nodes={src:[src,lfo,o,wl],gains:[g,og]};
}

/* ---------- 自定义音效 dataURL 解码（失败回落合成） ---------- */
function decodeRaw(k){
  try{
    const raw=ov.raw[k];
    if(!raw||!ctx||typeof atob!=='function') return;
    const b64=String(raw).split(',').pop()||'';
    const bin=atob(b64);
    const u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    const done=(buf)=>{ try{ if(buf&&buf.duration>0) ov.buf[k]=buf; else fail(); }catch(e){} };
    const fail=()=>{ try{ delete ov.raw[k]; }catch(e){} };
    const p=ctx.decodeAudioData(u8.buffer,done,fail);
    if(p&&p.then) p.then(done,fail);
  }catch(e){ try{ delete ov.raw[k]; }catch(e2){} }
}

/* ---------- duck 与 BGM 压低 ---------- */
function applyDuck(){
  try{
    if(!ctx||!bgmDuck||duckTimer) return;
    const t=now(), target=(loops.flow.on?DUCK_LVL:1);
    bgmDuck.gain.cancelScheduledValues(t);
    bgmDuck.gain.setTargetAtTime(target,t,0.1);
  }catch(e){}
}

/* ============================================================
   对外 API
   ============================================================ */
function unlock(){
  try{
    if(!AC) return false;
    if(!ctx){ ctx=new AC(); buildGraph(); }
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    for(const k in ov.raw) decodeRaw(k);
    for(const k in loops){ if(loops[k].wanted&&!loops[k].on) startLoop(k); }
  }catch(e){}
  return !!ctx;
}

function play(name,opts){
  try{
    if(NAMES.indexOf(name)<0||name==='bgm') return;
    if(!ctx) return;
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    opts=opts||{};
    const v=(opts.vol==null?1:Math.max(0,Math.min(2,+opts.vol||0)));
    const t=now()+0.02;
    if(ov.buf[name]){                               // 自定义音效优先
      const s=ctx.createBufferSource(); s.buffer=ov.buf[name];
      s.playbackRate.value=(opts.rate>0?opts.rate:1);
      s.connect(sfxBus); s.start(t);
      return;
    }
    const f=SYNTH[name];
    if(f) f(t,v);                                   // 合成回落
  }catch(e){}
}

function startLoop(name){
  try{
    if(name!=='flow'&&name!=='bgm') return;
    const L=loops[name];
    if(L.on) return;                                // 重复 start 幂等
    if(!ctx){ L.wanted=true; return; }              // 未解锁：记意图，unlock 后补启
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    L.on=true;
    if(ov.buf[name]){                               // 自定义循环音频
      const s=ctx.createBufferSource(); s.buffer=ov.buf[name]; s.loop=true;
      const t=now();
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(1,t+0.15);
      s.connect(g); g.connect(name==='bgm'?bgmBus:sfxBus);
      s.start(t);
      L.nodes={src:[s],gains:[g]};
    }else if(name==='flow'){
      startFlowNodes();
    }else{
      startBgmSched();
    }
    if(name==='flow') applyDuck();                  // 水流灌充期间压低 BGM
  }catch(e){}
}

function stopLoop(name){
  try{
    const L=loops[name];
    if(!L) return;
    L.wanted=false;
    if(!L.on) return;                               // 重复 stop 幂等
    L.on=false;
    if(name==='bgm'&&L.timer){ clearInterval(L.timer); L.timer=0; }
    const N=L.nodes; L.nodes=null;
    if(N){
      const t=now();
      (N.gains||[]).forEach((g)=>{ try{
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value,t);
        g.gain.linearRampToValueAtTime(0.0001,t+0.12);
      }catch(e){} });
      (N.src||[]).forEach((s)=>{ try{ s.stop(t+0.16); }catch(e){} });
    }
    if(name==='flow') applyDuck();
  }catch(e){}
}

function duck(ms){
  try{
    if(!ctx||!bgmDuck) return;
    const d=Math.max(80,Number(ms)||600);
    if(duckTimer){ clearTimeout(duckTimer); duckTimer=0; }
    const t=now();
    bgmDuck.gain.cancelScheduledValues(t);
    bgmDuck.gain.setTargetAtTime(DUCK_LVL,t,0.05);
    duckTimer=setTimeout(()=>{
      duckTimer=0;
      try{
        if(ctx&&bgmDuck){
          const t2=now();
          bgmDuck.gain.cancelScheduledValues(t2);
          bgmDuck.gain.setTargetAtTime(loops.flow.on?DUCK_LVL:1,t2,0.15);
        }
      }catch(e){}
    },d);
  }catch(e){}
}

function setMasterVolume(v){
  masterVol=clamp01(v);
  try{ if(master){ const t=now(); master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(masterVol,t,0.03); } }catch(e){}
}
function setSFXVolume(v){
  sfxVol=clamp01(v);
  try{ if(sfxBus){ const t=now(); sfxBus.gain.cancelScheduledValues(t); sfxBus.gain.setTargetAtTime(sfxVol,t,0.03); } }catch(e){}
}
function setBGMVolume(v){
  bgmVol=clamp01(v);
  try{ if(bgmBus){ const t=now(); bgmBus.gain.cancelScheduledValues(t); bgmBus.gain.setTargetAtTime(bgmVol,t,0.03); } }catch(e){}
}

function applyOverrides(map){
  try{
    ov.raw={}; ov.buf={};                           // 整表替换语义
    if(!map) return;
    for(const k in map){
      if(NAMES.indexOf(k)<0) continue;
      const v=map[k];
      if(!v||typeof v!=='string') continue;
      ov.raw[k]=v;
      if(ctx) decodeRaw(k);
    }
  }catch(e){}
}

/* ---------- 页面隐藏时停 BGM，回前台恢复 ---------- */
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('visibilitychange',()=>{
    try{
      if(document.hidden){
        if(loops.bgm.on){ bgmAutoPaused=true; stopLoop('bgm'); }
      }else{
        if(bgmAutoPaused){ bgmAutoPaused=false; startLoop('bgm'); }
        if(ctx&&ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
      }
    }catch(e){}
  });
}

return {
  unlock, play, startLoop, stopLoop, duck,
  setBGMVolume, setSFXVolume, setMasterVolume,
  applyOverrides,
  names: NAMES.slice()
};

})();
