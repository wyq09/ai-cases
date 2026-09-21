window.WS=window.WS||{}; WS.AUDIO=(()=>{
'use strict';

/* ============================================================
   倒水挑战 · AUDIO 子系统（WebAudio 程序化合成，零外部音频）
   - unlock()：幂等，须在首次用户手势内调用（惰性创建 AudioContext）
   - play(name,opts) / startLoop('bgm') / stopLoop('bgm') / duck(ms)
   - setBGMVolume / setSFXVolume / setMasterVolume（实时生效）
   - applyOverrides(map)：{cue:dataURL} 自定义音效优先，解码失败回落合成
   - 无 AudioContext 环境（如 node 自测）全程静默降级，不抛异常
   ============================================================ */

const NAMES=['pick','pour','deny','drop','colorDone','pig','win','click','start','bgm'];

/* ---------- 能力检测（仅探测，不实例化；首次 unlock 才 new，避免 autoload 告警） ---------- */
let AC=null;
try{
  if(typeof window!=='undefined') AC=window.AudioContext||window.webkitAudioContext||null;
}catch(e){ AC=null; }

/* ---------- 内部状态 ---------- */
let ctx=null, master=null, sfxBus=null, bgmBus=null, bgmDuck=null, noiseBuf=null;
let masterVol=1, sfxVol=0.8, bgmVol=0.32;           // BGM 音量天然压低
const DUCK_LVL=0.3;                                 // duck 时 BGM 压到 30%
let duckTimer=0, bgmAutoPaused=false;
const ov={ raw:{}, buf:{} };                        // 自定义音效：dataURL / 解码后 buffer
const loops={
  bgm:{ on:false, wanted:false, timer:0, step:0, nextT:0 }
};

function now(){ return ctx?ctx.currentTime:0; }
function clamp01(v){ v=+v; if(!(v>=0)) return 0; return v>1?1:v; }

/* ---------- 图构建（unlock 时一次） ---------- */
function buildGraph(){
  master=ctx.createGain(); master.gain.value=masterVol; master.connect(ctx.destination);
  bgmDuck=ctx.createGain(); bgmDuck.gain.value=1; bgmDuck.connect(master);
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
/* 铃/八音盒双分音：基音 + 2.01 倍微失谐泛音，清脆 */
function bell(t,f,vel,dur){
  const g=envG(t,0.003,vel,0,dur);
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2.01;
  const g2=ctx.createGain(); g2.gain.value=0.3;
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(sfxBus);
  o1.start(t); o1.stop(t+dur+0.15);
  o2.start(t); o2.stop(t+dur*0.5);
}
/* 猪哼：锯齿滑音过窄带通 = 鼻音闷哼 */
function oink(t,f0,f1,dur,bpF,vel){
  const o=ctx.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=bpF; bp.Q.value=2.2;
  const g=envG(t,0.01,vel,0.02,dur*0.8);
  o.connect(bp); bp.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t+dur+0.12);
}

/* ---------- cue 合成器 ---------- */
const SYNTH={
  /* pick 拿起瓶子 ~80ms：木质/玻璃轻 pop（上扬 chirp + 高频轻嗒） */
  pick(t,v){
    tone(t,'sine',380,860,0.06,0.42*v);
    clickNoise(t,3200,0.12*v,0.016);
  },
  /* pour 倒水咕嘟 ~700ms：窄带噪声咕噜(LFO 摆频) + 一串气泡上滑音 + 低频水身，一次性 */
  pour(t,v){
    const n=noiseSrc(t,0.72);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=4.5;
    bp.frequency.setValueAtTime(680,t);
    const lfo=ctx.createOscillator(); lfo.frequency.value=4.2;
    const lg=ctx.createGain(); lg.gain.value=160;
    lfo.connect(lg); lg.connect(bp.frequency);
    const ng=envG(t,0.05,0.17*v,0.42,0.22);
    n.connect(bp); bp.connect(ng); ng.connect(sfxBus);
    lfo.start(t); lfo.stop(t+0.78);
    tone(t,'sine',150,95,0.6,0.1*v);
    const B=[[0.02,300],[0.10,390],[0.175,330],[0.26,470],[0.345,410],
             [0.43,560],[0.51,480],[0.59,640],[0.665,560]];
    for(let i=0;i<B.length;i++){
      const dt=B[i][0], f=B[i][1], vel=(i%2?0.13:0.16)*v;
      const o=ctx.createOscillator(); o.type='sine';
      o.frequency.setValueAtTime(f,t+dt);
      o.frequency.exponentialRampToValueAtTime(f*1.9,t+dt+0.07);
      const g=envG(t+dt,0.006,vel,0,0.06);
      o.connect(g); g.connect(sfxBus);
      o.start(t+dt); o.stop(t+dt+0.1);
    }
  },
  /* deny 不允许 ~120ms：闷嗒（方波下滑过低通 + 软嗒） */
  deny(t,v){
    const o=ctx.createOscillator(); o.type='square';
    o.frequency.setValueAtTime(210,t);
    o.frequency.exponentialRampToValueAtTime(135,t+0.1);
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=460;
    const g=envG(t,0.006,0.34*v,0.02,0.09);
    o.connect(lp); lp.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t+0.16);
    clickNoise(t,1200,0.08*v,0.018);
  },
  /* drop 一格液体落定 ~60ms：短促哒（下滑 blip + 低频垫 + 微嗒） */
  drop(t,v){
    tone(t,'sine',640,260,0.042,0.36*v);
    tone(t+0.008,'sine',210,150,0.05,0.16*v);
    clickNoise(t,2800,0.07*v,0.012);
  },
  /* colorDone 一色完成 ~500ms：上行小滑音 + 清脆叮 */
  colorDone(t,v){
    tone(t,'sine',784,1245,0.14,0.15*v);
    bell(t+0.1,1318.5,0.24*v,0.4);
  },
  /* pig 小猪哼欢 ~250ms：滑音双音（两声欢快鼻音哼） */
  pig(t,v){
    oink(t,210,360,0.085,620,0.3*v);
    oink(t+0.125,440,290,0.105,820,0.26*v);
  },
  /* win 过关 ~1.1s：上行四音 fanfare（C5-E5-G5-C6，三角波柔和 + 尾音亮点） */
  win(t,v){
    const seq=[[0,523.25,0.2],[0.15,659.25,0.2],[0.3,783.99,0.2],[0.46,1046.5,0.55]];
    for(let i=0;i<seq.length;i++){
      const dt=seq[i][0], f=seq[i][1], d=seq[i][2];
      const o1=ctx.createOscillator(); o1.type='triangle'; o1.frequency.value=f;
      const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2;
      const g2=ctx.createGain(); g2.gain.value=0.1;
      const g=envG(t+dt,0.01,0.2*v,0.1,d);
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(sfxBus);
      o1.start(t+dt); o1.stop(t+dt+d+0.3);
      o2.start(t+dt); o2.stop(t+dt+d+0.3);
    }
    bell(t+0.46,1567.98,0.07*v,0.5);
  },
  /* click UI 轻嗒 ~40ms */
  click(t,v){
    tone(t,'sine',1180,820,0.026,0.2*v);
    clickNoise(t,4200,0.05*v,0.01);
  },
  /* start 开始 ~300ms：whoosh（带通噪声上扫）+ 叮 */
  start(t,v){
    const n=noiseSrc(t,0.22);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.1;
    bp.frequency.setValueAtTime(450,t);
    bp.frequency.exponentialRampToValueAtTime(2800,t+0.2);
    const g=envG(t,0.03,0.2*v,0.06,0.14);
    n.connect(bp); bp.connect(g); g.connect(sfxBus);
    bell(t+0.16,1046.5,0.26*v,0.24);
  }
  /* bgm 仅作循环（startLoop('bgm')），无单发形态 */
};

/* ---------- BGM：100bpm C 大调五声音阶 八音盒（轻盈、音量天然压低） ---------- */
const BPM=100, STEP=60/BPM/2;                       // 八分音符步长 0.3s
const P={G2:98.00,A2:110.00,C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196.00,
         C4:261.63,G4:392.00,A4:440.00,
         C5:523.25,D5:587.33,E5:659.25,G5:783.99,A5:880.00,C6:1046.50,D6:1174.66};
const MEL=[                                         // 4 乐句 ×16 步，null=休止
  ['C5',null,'E5',null,'G5',null,'A5','G5','E5',null,'D5',null,'C5',null,null,null],
  ['E5',null,'G5',null,'C6',null,'D6',null,'C6','A5',null,'G5','E5',null,'G5',null],
  ['A4',null,'C5',null,'E5',null,'G5','A5','C6',null,'A5',null,'G5',null,'E5','D5'],
  ['C5',null,'E5',null,'D5',null,'C5',null,'A4',null,'C5',null,'D5',null,'C5',null]
];
const BASS=['C3','G2','A2','F3','C3','G2','F3','G3']; // 每小节根音（8 小节循环）
const FIFTH={C3:'G3',G2:'D3',A2:'E3',F3:'C4',G3:'D4'};

function box(t,f,vel){                              // 八音盒音色：正弦 + 快衰 4 倍泛音
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2600;
  const g=envG(t,0.003,vel,0,0.4);
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*3.98;
  const g2=ctx.createGain();
  g2.gain.setValueAtTime(vel*0.3,t);
  g2.gain.exponentialRampToValueAtTime(0.0001,t+0.08);
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bgmBus);
  o1.start(t); o1.stop(t+0.5);
  o2.start(t); o2.stop(t+0.12);
}
function hat(t,vel){
  const n=noiseSrc(t,0.04);
  const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=7500;
  const g=envG(t,0.001,vel,0,0.03);
  n.connect(hp); hp.connect(g); g.connect(bgmBus);
}
function schedStep(step,t){
  const ph=Math.floor(step/16)%4, pos=step%16;
  const bar=Math.floor(step/8)%8, bp=step%8;
  const m=MEL[ph][pos];
  if(m) box(t,P[m],(pos%8===0)?0.15:0.11);
  if(bp===0) box(t,P[BASS[bar]],0.15);
  if(bp===4) box(t,P[FIFTH[BASS[bar]]],0.06);
  if(bp===2||bp===6) hat(t,0.026);
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
    if(ov.buf[name]){                               // 自定义音效优先（走 sfxBus 受 SFX 音量控）
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
    if(name!=='bgm') return;
    const L=loops[name];
    if(L.on) return;                                // 重复 start 幂等
    if(!ctx){ L.wanted=true; return; }              // 未解锁：记意图，unlock 后补启
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    L.on=true;
    if(ov.buf[name]){                               // 自定义循环音频（走 bgmBus 受 BGM 音量控）
      const s=ctx.createBufferSource(); s.buffer=ov.buf[name]; s.loop=true;
      const t=now();
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(1,t+0.15);
      s.connect(g); g.connect(bgmBus);
      s.start(t);
      L.nodes={src:[s],gains:[g]};
    }else{
      startBgmSched();
    }
  }catch(e){}
}

function stopLoop(name){
  try{
    const L=loops[name];
    if(!L) return;
    L.wanted=false;
    if(!L.on) return;                               // 重复 stop 幂等
    L.on=false;
    if(L.timer){ clearInterval(L.timer); L.timer=0; }
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
          bgmDuck.gain.setTargetAtTime(1,t2,0.15);
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
