window.SH=window.SH||{}; SH.AUDIO=(()=>{
'use strict';

/* ============================================================
   羊了个羊 · AUDIO 子系统（WebAudio 程序化合成，零外部音频文件）
   - init()：能力探测（仅探测不实例化）；unlock()：首手势内调用，幂等
   - play(name, vol)：cue 即发（vol 数字或 {vol,rate}）
   - startBGM()/stopBGM()/duck(ms)：BGM 走 bgmBus，duck 压到 30%
   - setBGMVolume / setSFXVolume / setMasterVolume（实时生效）
   - applyOverrides(map)：{cue:dataURL} 整表替换；解码成功走 buffer，失败回落合成
   - document.visibilitychange：隐藏停 BGM，回前台续播（unlock 补启 wanted 循环）
   - 无 AudioContext 环境（node 自测）全程静默降级；非有限 freq/vol 一律静默跳过
   ============================================================ */

const NAMES=['pick','place','match','deny','out','undo','shuffle','win','lose','click','revive','bgm'];

/* ---------- 能力检测（仅探测，不实例化；首次 unlock 才 new，避免 autoload 告警） ---------- */
let AC=null;
try{
  if(typeof window!=='undefined') AC=window.AudioContext||window.webkitAudioContext||null;
}catch(e){ AC=null; }

/* ---------- 内部状态 ---------- */
let ctx=null, master=null, sfxBus=null, bgmBus=null, bgmDuck=null, noiseBuf=null;
let masterVol=1, sfxVol=0.9, bgmVol=0.45;           // 默认值与 DEFAULT_CFG 音画字段一致
const DUCK_LVL=0.3;                                 // duck 时 BGM 压到 30%
let duckTimer=0, bgmAutoPaused=false;
const ov={ raw:{}, buf:{} };                        // 自定义音效：dataURL / 解码后 buffer
const loops={
  bgm:{ on:false, wanted:false, timer:0, step:0, nextT:0, nodes:null }
};

function fin(v){ return typeof v==='number'&&isFinite(v); }
function now(){ return ctx?ctx.currentTime:0; }
function clamp01(v){
  v=+v; if(!isFinite(v)||!(v>=0)) return 0;
  return v>1?1:v;
}

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

/* ---------- 合成小工具（全部带非有限参数防御） ---------- */
function noiseSrc(t,dur){
  const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
  s.start(t); s.stop(t+dur+0.06); return s;
}
function envG(t,a,peak,hold,rel){
  if(!(fin(peak)&&peak>0)) peak=0.0001;             // 坏峰值 → 静默
  a=fin(a)&&a>0?a:0.005; hold=fin(hold)&&hold>0?hold:0; rel=fin(rel)&&rel>0?rel:0.05;
  const g=ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(peak,t+a);
  if(hold>0) g.gain.setValueAtTime(peak,t+a+hold);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+hold+rel);
  return g;
}
function tone(t,type,f0,f1,dur,peak,dest){
  if(!fin(f0)||f0<=0) return null;                  // 坏 freq → 静默跳过
  if(!fin(dur)||dur<=0) return null;
  if(!fin(peak)||peak<=0) return null;              // 坏 vol → 静默跳过
  const o=ctx.createOscillator(); o.type=type;
  o.frequency.setValueAtTime(f0,t);
  if(fin(f1)&&f1>0&&f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
  const g=envG(t,0.004,peak,0,dur);
  o.connect(g); g.connect(dest||sfxBus);
  o.start(t); o.stop(t+dur+0.1);
  return o;
}
function clickNoise(t,hpF,peak,rel){
  if(!fin(hpF)||hpF<=0) return;
  const n=noiseSrc(t,rel+0.01);
  const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=hpF;
  const g=envG(t,0.001,peak,0,rel);
  n.connect(hp); hp.connect(g); g.connect(sfxBus);
}
/* 铃/亮铃双分音：基音 + 2.01 倍微失谐泛音，清脆 */
function bell(t,f,vel,dur,dest){
  if(!fin(f)||f<=0) return;
  if(!(fin(vel)&&vel>0)) return;
  if(!fin(dur)||dur<=0) dur=0.3;
  const g=envG(t,0.003,vel,0,dur);
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2.01;
  const g2=ctx.createGain(); g2.gain.value=0.3;
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest||sfxBus);
  o1.start(t); o1.stop(t+dur+0.15);
  o2.start(t); o2.stop(t+dur*0.5);
}
/* 马林巴：正弦基音 + 快衰 4 倍泛音（共鸣管特征），温润木质 */
function marimba(t,f,vel,dur,dest){
  if(!fin(f)||f<=0) return;
  if(!(fin(vel)&&vel>0)) return;
  if(!fin(dur)||dur<=0) dur=0.3;
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=3800;
  const g=envG(t,0.004,vel,0,dur);
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*4.02;
  const g2=ctx.createGain();
  g2.gain.setValueAtTime(vel*0.28,t);
  g2.gain.exponentialRampToValueAtTime(0.0001,t+0.09);
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(dest||sfxBus);
  o1.start(t); o1.stop(t+dur+0.2);
  o2.start(t); o2.stop(t+0.14);
}
/* 口哨：正弦 + 轻颤音 + 极轻呼气噪声；f1 有限且不同则滑音 */
function whistle(t,f0,f1,dur,vel){
  if(!fin(f0)||f0<=0) return;
  if(!fin(dur)||dur<=0) return;
  if(!(fin(vel)&&vel>0)) return;
  const o=ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(f0,t);
  const slide=fin(f1)&&f1>0&&f1!==f0;
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur*0.85);
  const vib=ctx.createOscillator(); vib.frequency.value=5.8;
  const vg=ctx.createGain(); vg.gain.value=Math.min(30,f0*0.013);
  vib.connect(vg); vg.connect(o.frequency);
  const g=envG(t,0.03,vel,0.08,dur);
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t+dur+0.2);
  vib.start(t); vib.stop(t+dur+0.2);
  const n=noiseSrc(t,dur*0.9);                      // 呼气感
  const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=2.5;
  bp.frequency.setValueAtTime(Math.max(400,f0*1.5),t);
  if(slide) bp.frequency.exponentialRampToValueAtTime(Math.max(400,f1*1.5),t+dur*0.85);
  const ng=envG(t,0.03,vel*0.12,0.04,dur*0.7);
  n.connect(bp); bp.connect(ng); ng.connect(sfxBus);
}

/* ---------- cue 合成器 ---------- */
const SYNTH={
  /* pick 拾取牌 ~55ms：木鱼短哒，短促不吵（高频出现） */
  pick(t,v){
    tone(t,'sine',980,620,0.05,0.34*v);
    tone(t,'triangle',1960,1500,0.03,0.06*v);
    clickNoise(t,2600,0.1*v,0.014);
  },
  /* place 落槽 ~80ms：木质轻叩，比 pick 略低沉 */
  place(t,v){
    tone(t,'sine',640,380,0.07,0.3*v);
    tone(t+0.006,'sine',240,170,0.06,0.14*v);
    clickNoise(t,1800,0.08*v,0.016);
  },
  /* match 三消 ~0.55s：马林巴上行三音（C6-E6-G6）+ 轻刷弦，清脆悦耳 */
  match(t,v){
    marimba(t,1046.5,0.3*v,0.34);
    marimba(t+0.08,1318.5,0.28*v,0.34);
    marimba(t+0.16,1568.0,0.3*v,0.42);
    const n=noiseSrc(t,0.3);                        // 轻刷弦：带通噪声上扫
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.4;
    bp.frequency.setValueAtTime(1600,t);
    bp.frequency.exponentialRampToValueAtTime(4600,t+0.26);
    const g=envG(t,0.05,0.055*v,0.08,0.16);
    n.connect(bp); bp.connect(g); g.connect(sfxBus);
  },
  /* deny 点被压住的牌 ~110ms：低哑短噗，温和否定不刺耳 */
  deny(t,v){
    tone(t,'sine',185,105,0.09,0.26*v);
    tone(t+0.012,'sine',120,88,0.07,0.1*v);
    const n=noiseSrc(t,0.06);                       // 软噗：低通噪声极轻
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=520;
    const g=envG(t,0.008,0.09*v,0,0.05);
    n.connect(lp); lp.connect(g); g.connect(sfxBus);
  },
  /* out 移出道具 ~0.3s：滑哨上滑 */
  out(t,v){
    whistle(t,560,1480,0.26,0.2*v);
  },
  /* undo 撤销 ~0.28s：滑哨下滑 */
  undo(t,v){
    whistle(t,1250,480,0.24,0.19*v);
  },
  /* shuffle 洗牌 ~0.42s：噪声簇（带通摆频）+ 随机小叩 */
  shuffle(t,v){
    const n=noiseSrc(t,0.42);
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=0.9;
    bp.frequency.setValueAtTime(900,t);
    bp.frequency.exponentialRampToValueAtTime(2600,t+0.18);
    bp.frequency.exponentialRampToValueAtTime(1100,t+0.4);
    const g=envG(t,0.03,0.14*v,0.16,0.2);
    n.connect(bp); bp.connect(g); g.connect(sfxBus);
    for(let i=0;i<6;i++){                           // 随机小叩簇
      const dt=0.02+Math.random()*0.3;
      tone(t+dt,'sine',700+Math.random()*900,420+Math.random()*300,0.04,0.09*v);
    }
  },
  /* win 过关 ~1.5s：口哨旋律（G5-C6-E6-G6 长音）+ 马林巴琶音垫底 + 亮点铃 */
  win(t,v){
    whistle(t,783.99,0,0.24,0.16*v);
    whistle(t+0.27,1046.5,0,0.24,0.16*v);
    whistle(t+0.54,1318.5,0,0.24,0.16*v);
    whistle(t+0.81,1568.0,0,0.52,0.18*v);
    const A=[523.25,659.25,783.99,1046.5,1318.5];   // C5 E5 G5 C6 E6 琶音
    for(let i=0;i<A.length;i++) marimba(t+0.02+i*0.07,A[i],0.13*v,0.3);
    bell(t+0.86,2093.0,0.09*v,0.5);
  },
  /* lose 失败 ~0.9s：温和下行三音（E5-C5-G4）+ 小滑尾，滑稽不沮丧 */
  lose(t,v){
    marimba(t,659.25,0.2*v,0.28);
    marimba(t+0.2,523.25,0.18*v,0.28);
    marimba(t+0.4,392.0,0.2*v,0.4);
    tone(t+0.68,'sine',330,262,0.2,0.08*v);
  },
  /* click UI 按键 ~40ms：轻嗒 */
  click(t,v){
    tone(t,'sine',1250,900,0.024,0.18*v);
    clickNoise(t,4400,0.05*v,0.01);
  },
  /* revive 复活 ~0.8s：亮铃上行（C6-E6-G6-C7） */
  revive(t,v){
    bell(t,1046.5,0.2*v,0.35);
    bell(t+0.09,1318.5,0.2*v,0.35);
    bell(t+0.18,1568.0,0.22*v,0.5);
    bell(t+0.27,2093.0,0.16*v,0.6);
  }
  /* bgm 仅作循环（startBGM），无单发形态 */
};

/* ---------- BGM：96bpm C 大调五声音阶（马林巴伴奏 + 口哨感正弦旋律，田园轻快，8 小节循环） ---------- */
const BPM=96, STEP=60/BPM/2;                        // 八分音符步长 0.3125s
const P={G2:98.00,A2:110.00,C3:130.81,D3:146.83,E3:164.81,G3:196.00,
         A4:440.00,C5:523.25,D5:587.33,E5:659.25,G5:783.99,A5:880.00};
const MEL=[                                         // 4 乐句 ×16 步，null=休止（C 宫五声：C D E G A）
  ['E5',null,'G5',null,'A5',null,'G5','E5','D5',null,'C5',null,'D5',null,null,null],
  ['C5',null,'D5',null,'E5',null,'D5','C5','A4',null,'C5',null,null,null,'A4',null],
  ['A4',null,'C5',null,'D5',null,'E5',null,'G5',null,'A5','G5','E5',null,'D5',null],
  ['C5',null,'D5',null,'E5',null,'G5',null,'E5',null,'D5','C5','C5',null,null,null]
];
const BASS=['C3','G2','A2','G2','C3','A2','G2','C3']; // 每小节根音（8 小节循环）
const FIFTH={C3:'G3',G2:'D3',A2:'E3'};

function marBgm(t,f,vel){                           // 马林巴伴奏音色（走 bgmBus）
  if(!fin(f)||f<=0||!(fin(vel)&&vel>0)) return;
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=3000;
  const g=envG(t,0.004,vel,0,0.3);
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=f*4.01;
  const g2=ctx.createGain();
  g2.gain.setValueAtTime(vel*0.25,t);
  g2.gain.exponentialRampToValueAtTime(0.0001,t+0.07);
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bgmBus);
  o1.start(t); o1.stop(t+0.42);
  o2.start(t); o2.stop(t+0.1);
}
function whBgm(t,f,vel,dur){                        // 口哨感正弦旋律（走 bgmBus）
  if(!fin(f)||f<=0||!(fin(vel)&&vel>0)) return;
  const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
  const vib=ctx.createOscillator(); vib.frequency.value=5.2;
  const vg=ctx.createGain(); vg.gain.value=f*0.011;
  vib.connect(vg); vg.connect(o.frequency);
  const g=envG(t,0.04,vel,0.06,dur);
  o.connect(g); g.connect(bgmBus);
  o.start(t); o.stop(t+dur+0.25);
  vib.start(t); vib.stop(t+dur+0.25);
}
function shk(t,vel){                                // 轻沙锤（弱拍点缀）
  const n=noiseSrc(t,0.05);
  const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=7000;
  const g=envG(t,0.001,vel,0,0.04);
  n.connect(hp); hp.connect(g); g.connect(bgmBus);
}
function schedStep(step,t){
  const ph=Math.floor(step/16)%4, pos=step%16;
  const bar=Math.floor(step/8)%8, bp=step%8;
  const m=MEL[ph][pos];
  if(m){
    whBgm(t,P[m],(pos%8===0)?0.13:0.1,STEP*1.8);
    if(pos%8===0) marBgm(t,P[m]/2,0.06);            // 乐句起音低八度马林巴同步点缀
  }
  if(bp===0) marBgm(t,P[BASS[bar]],0.12);
  if(bp===4) marBgm(t,P[FIFTH[BASS[bar]]],0.055);
  if(bp===2||bp===6) shk(t,0.018);
}
function bgmPump(){                                 // 前瞻调度器
  const horizon=now()+0.22;
  let guard=0;
  while(loops.bgm.nextT<horizon&&guard++<128){
    schedStep(loops.bgm.step,loops.bgm.nextT);
    loops.bgm.nextT+=STEP;
    loops.bgm.step=(loops.bgm.step+1)%64;           // 64 步 = 8 小节循环
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
function init(){
  /* 预留接口：仅能力探测。AudioContext 惰性创建于首次 unlock()（首手势内），避免 autoload 告警 */
  return !!AC;
}

function unlock(){
  try{
    if(!AC) return false;
    if(!ctx){ ctx=new AC(); buildGraph(); }
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    for(const k in ov.raw) decodeRaw(k);
    for(const k in loops){ if(loops[k].wanted&&!loops[k].on) startLoop(k); }  // 补启 wanted 未启循环
  }catch(e){}
  return !!ctx;
}

function play(name,vol){
  try{
    if(NAMES.indexOf(name)<0||name==='bgm') return;
    if(!ctx) return;
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    let v=1, rate=1;
    if(fin(vol)){                                   // play(name, 0.6) 契约签名
      v=Math.max(0,Math.min(2,vol));
    }else if(vol&&typeof vol==='object'){           // 兼容 {vol, rate}
      if(fin(vol.vol)) v=Math.max(0,Math.min(2,vol.vol));
      if(fin(vol.rate)&&vol.rate>0) rate=vol.rate;
    }
    const t=now()+0.02;
    if(ov.buf[name]){                               // 自定义音效优先（走 sfxBus 受 SFX 音量控）
      const s=ctx.createBufferSource(); s.buffer=ov.buf[name];
      s.playbackRate.value=rate;
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

function startBGM(){ startLoop('bgm'); }
function stopBGM(){ stopLoop('bgm'); }

function duck(ms){
  try{
    if(!ctx||!bgmDuck) return;
    const d=Math.max(80,(fin(ms)&&ms>0)?ms:600);
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
  init, unlock, play, startLoop, stopLoop, startBGM, stopBGM, duck,
  setBGMVolume, setSFXVolume, setMasterVolume,
  applyOverrides,
  names: NAMES.slice()
};

})();
