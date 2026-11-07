/* ============================================================
 * 地摊套圈 · RT.CONFIG_PANEL — 设置面板（玩法 / 音效 / 数据）
 * 移动端底部抽屉（贴底、大点击区、overscroll-behavior:contain），
 * 桌面端居中弹窗；样式内联注入，类名前缀 rtcp-。
 * open() 深拷贝当前 cfg（window.__rt.cfg，缺省用默认值）为 work；
 * 任何编辑立即 onChange(完整 cfg 深拷贝快照)。
 * 数据页导出 cfg+state（state 读 window.__rt，存在才带上）；
 * 恢复出厂是唯一允许直接动 localStorage 的路径（清两个 key）。
 * ============================================================ */
window.RT=window.RT||{}; RT.CONFIG_PANEL=(()=>{
'use strict';

var DEFAULTS={aimGuide:true,powerSens:1.0,talk:true,vols:{bgm:0.35,sfx:1,master:1},sound:true};
var STATE_KEY='ringtoss_state_v1', CFG_KEY='ringtoss_config_v1';

var host=null, root=null, work=null, opened=false, curTab='play';
var closeTimer=0, armTimer=0;
var cbs=[];
var tgl={}, rng={}, val={}, panes={}, tabBtns={};
var statusEl=null, restoreBtn=null, fileInput=null;

/* ---------- 工具 ---------- */
function deep(o){ return JSON.parse(JSON.stringify(o)); }
function clamp(v,a,b){ v=+v; if(!isFinite(v))return a; return v<a?a:(v>b?b:v); }
function el(tag,cls,txt){
  var n=document.createElement(tag);
  if(cls)n.className=cls;
  if(txt!=null)n.textContent=txt;
  return n;
}
function powFmt(v){ return (+v).toFixed(2)+'×'; }
function pctFmt(v){ return Math.round(v*100)+'%'; }
function status(msg){ if(statusEl)statusEl.textContent=msg||''; }

/* ---------- 读取（存在性兜底：window.__rt 可能缺） ---------- */
function readCfg(){
  var base=deep(DEFAULTS);
  try{
    var c=window.__rt&&window.__rt.cfg;
    if(c&&typeof c==='object'){
      if(typeof c.aimGuide==='boolean')base.aimGuide=c.aimGuide;
      if(typeof c.talk==='boolean')base.talk=c.talk;
      if(typeof c.sound==='boolean')base.sound=c.sound;
      if(typeof c.powerSens==='number'&&isFinite(c.powerSens))base.powerSens=clamp(c.powerSens,0.5,2);
      if(c.vols&&typeof c.vols==='object'){
        ['bgm','sfx','master'].forEach(function(k){
          if(typeof c.vols[k]==='number'&&isFinite(c.vols[k]))base.vols[k]=clamp(c.vols[k],0,1);
        });
      }
    }
  }catch(e){}
  return base;
}
function readState(){
  try{
    var s=window.__rt&&window.__rt.state;
    if(s&&typeof s==='object')return JSON.parse(JSON.stringify(s));
  }catch(e){}
  return null;
}

/* ---------- 样式（内联注入，前缀 rtcp-） ---------- */
var CSS=`
.rtcp-root{position:absolute;inset:0;z-index:30;display:flex;align-items:flex-end;justify-content:center;font-family:inherit;}
.rtcp-root.rtcp-hide{display:none;}
.rtcp-mask{position:absolute;inset:0;background:rgba(10,3,2,.62);opacity:0;transition:opacity .22s;}
.rtcp-sheet{position:relative;width:min(430px,100%);max-height:82%;display:flex;flex-direction:column;
  background:#7c1410;border:2px solid #e8b25c;border-bottom:none;border-radius:14px 14px 0 0;color:#ffe9b8;
  transform:translateY(26px);opacity:0;transition:transform .22s ease-out,opacity .22s ease-out;}
.rtcp-in .rtcp-mask{opacity:1;}
.rtcp-in .rtcp-sheet{transform:none;opacity:1;}
.rtcp-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px;flex:none;}
.rtcp-title{font-size:18px;color:#ffd257;letter-spacing:3px;}
.rtcp-x{width:32px;height:32px;background:none;border:1.5px solid #e8b25c;color:#ffd257;border-radius:6px;font-size:14px;line-height:1;cursor:pointer;flex:none;}
.rtcp-tabs{display:flex;margin:4px 14px 2px;border:1.5px solid #c98f3f;border-radius:8px;overflow:hidden;flex:none;}
.rtcp-tab{flex:1;height:40px;background:#5f110d;border:none;color:#e8b25c;font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;padding:0;}
.rtcp-tab+.rtcp-tab{border-left:1.5px solid #c98f3f;}
.rtcp-tab.rtcp-on{background:#ffd257;color:#7c1410;}
.rtcp-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 16px calc(16px + env(safe-area-inset-bottom));}
.rtcp-row{display:flex;align-items:center;justify-content:space-between;min-height:52px;border-bottom:1px solid rgba(232,178,92,.28);}
.rtcp-row2{padding:10px 0 12px;border-bottom:1px solid rgba(232,178,92,.28);}
.rtcp-row2 .rtcp-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
.rtcp-lab{font-size:15px;font-weight:600;color:#ffe9b8;}
.rtcp-num{font-size:13px;color:#ffd257;font-weight:700;font-variant-numeric:tabular-nums;}
.rtcp-range{-webkit-appearance:none;appearance:none;width:100%;height:34px;margin:0;background:none;cursor:pointer;touch-action:none;}
.rtcp-range::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:#4a0d0a;border:1px solid #a06a2c;}
.rtcp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:50%;background:#ffd257;border:2px solid #8f1a14;margin-top:-9px;}
.rtcp-range::-moz-range-track{height:6px;border-radius:3px;background:#4a0d0a;border:1px solid #a06a2c;}
.rtcp-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#ffd257;border:2px solid #8f1a14;}
.rtcp-tg{width:66px;height:40px;padding:0;background:none;border:none;display:flex;align-items:center;justify-content:flex-end;cursor:pointer;flex:none;}
.rtcp-tg i{display:block;width:52px;height:28px;border-radius:14px;background:#4a0d0a;border:1.5px solid #a06a2c;position:relative;transition:background .18s,border-color .18s;}
.rtcp-tg i::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#b98a4a;transition:left .18s,background .18s;}
.rtcp-tg.rtcp-on i{background:#c9271d;border-color:#ffd257;}
.rtcp-tg.rtcp-on i::after{left:27px;background:#ffd257;}
.rtcp-act{display:block;width:100%;min-height:48px;margin-top:12px;background:#c9271d;border:2px solid #ffd257;border-radius:8px;color:#fff3cf;font-size:16px;font-weight:800;letter-spacing:2px;cursor:pointer;padding:0 14px;}
.rtcp-act:active{background:#a01d15;}
.rtcp-danger{background:none;border-color:#d8604a;color:#ffb3a3;font-weight:700;}
.rtcp-danger.rtcp-armed{background:#ffd257;border-color:#ffd257;color:#7c1410;}
.rtcp-status{min-height:20px;margin-top:10px;text-align:center;color:#d9a96f;font-size:12px;}
.rtcp-pane.rtcp-off{display:none;}
@media (min-width:768px) and (min-height:560px){
  .rtcp-root{align-items:center;}
  .rtcp-sheet{border-radius:12px;border-bottom:2px solid #e8b25c;max-height:86%;}
}
`;
function injectStyle(){
  if(document.getElementById('rtcp-style'))return;
  var s=document.createElement('style');
  s.id='rtcp-style';
  s.textContent=CSS;
  document.head.appendChild(s);
}

/* ---------- 行构造 ---------- */
function syncToggle(b,on){
  b.classList.toggle('rtcp-on',!!on);
  b.setAttribute('aria-checked',on?'true':'false');
}
function rowToggle(label,key){
  var r=el('div','rtcp-row');
  r.appendChild(el('div','rtcp-lab',label));
  var b=el('button','rtcp-tg');
  b.type='button';
  b.setAttribute('role','switch');
  b.setAttribute('data-rtcp-key',key);
  b.appendChild(el('i'));
  b.addEventListener('click',function(){
    if(!work)return;
    work[key]=!work[key];
    syncToggle(b,work[key]);
    fire();
  });
  tgl[key]=b;
  r.appendChild(b);
  return r;
}
function rowRange(label,key,min,max,step,fmt){
  var r=el('div','rtcp-row2');
  var top=el('div','rtcp-top');
  top.appendChild(el('div','rtcp-lab',label));
  var num=el('span','rtcp-num');
  val[key]=num;
  top.appendChild(num);
  r.appendChild(top);
  var inp=document.createElement('input');
  inp.type='range';
  inp.className='rtcp-range';
  inp.min=String(min); inp.max=String(max); inp.step=String(step);
  inp.setAttribute('data-rtcp-key',key);
  inp.addEventListener('input',function(){
    if(!work)return;
    var v=clamp(parseFloat(inp.value),min,max);
    if(key==='powerSens')work.powerSens=v; else work.vols[key]=v;
    num.textContent=fmt(v);
    fire();
  });
  rng[key]=inp;
  r.appendChild(inp);
  return r;
}
function paneData(){
  var p=el('div','rtcp-pane');
  fileInput=document.createElement('input');
  fileInput.type='file';
  fileInput.accept='.json,application/json';
  fileInput.style.display='none';
  fileInput.addEventListener('change',onImportFile);
  var be=el('button','rtcp-act','导出存档');
  be.type='button';
  be.setAttribute('data-rtcp-key','export');
  be.addEventListener('click',doExport);
  var bi=el('button','rtcp-act','导入存档');
  bi.type='button';
  bi.setAttribute('data-rtcp-key','import');
  bi.addEventListener('click',function(){ fileInput.click(); });
  var br=el('button','rtcp-act rtcp-danger','恢复出厂');
  br.type='button';
  br.setAttribute('data-rtcp-key','reset');
  restoreBtn=br;
  br.addEventListener('click',tapRestore);
  statusEl=el('div','rtcp-status');
  p.appendChild(fileInput);
  p.appendChild(be);
  p.appendChild(bi);
  p.appendChild(br);
  p.appendChild(statusEl);
  return p;
}

/* ---------- 数据操作 ---------- */
function doExport(){
  var payload={app:'ring-toss-stall',version:1,time:new Date().toISOString(),cfg:deep(work)};
  var st=readState();
  if(st)payload.state=st;
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  var d=new Date();
  function pad(x){ return (x<10?'0':'')+x; }
  a.href=url;
  a.download='ringtoss-save-'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+'.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); },4000);
  status(st?'已导出存档（设置+进度）':'已导出存档（设置）');
}
function mergeImport(obj){
  var src=(obj.cfg&&typeof obj.cfg==='object')?obj.cfg:obj;
  var n=0;
  ['aimGuide','talk','sound'].forEach(function(k){
    if(typeof src[k]==='boolean'){ work[k]=src[k]; n++; }
  });
  if(typeof src.powerSens==='number'&&isFinite(src.powerSens)){ work.powerSens=clamp(src.powerSens,0.5,2); n++; }
  if(src.vols&&typeof src.vols==='object'){
    ['bgm','sfx','master'].forEach(function(k){
      if(typeof src.vols[k]==='number'&&isFinite(src.vols[k])){ work.vols[k]=clamp(src.vols[k],0,1); n++; }
    });
  }
  return n;
}
function onImportFile(){
  var f=fileInput.files&&fileInput.files[0];
  fileInput.value='';
  if(!f)return;
  var rd=new FileReader();
  rd.onload=function(){
    var obj=null;
    try{ obj=JSON.parse(String(rd.result)); }catch(e){ obj=null; }
    if(!obj||typeof obj!=='object'){ status('导入失败：不是有效的存档文件'); return; }
    var n=mergeImport(obj);
    if(n===0){ status('文件里没有可识别的设置项'); return; }
    render();
    fire();
    status('已导入 '+n+' 项设置');
  };
  rd.onerror=function(){ status('导入失败：文件读取出错'); };
  rd.readAsText(f);
}
function disarmRestore(){
  clearTimeout(armTimer);
  if(restoreBtn){
    restoreBtn.classList.remove('rtcp-armed');
    restoreBtn.textContent='恢复出厂';
  }
}
function tapRestore(){
  var b=restoreBtn;
  if(!b)return;
  if(b.classList.contains('rtcp-armed')){
    disarmRestore();
    /* 恢复出厂：唯一允许直接动 localStorage 的路径 */
    try{
      localStorage.removeItem(STATE_KEY);
      localStorage.removeItem(CFG_KEY);
    }catch(e){}
    work=deep(DEFAULTS);
    render();
    fire();
    status('已恢复出厂设置');
  }else{
    b.classList.add('rtcp-armed');
    b.textContent='再点一次，确认清空';
    clearTimeout(armTimer);
    armTimer=setTimeout(disarmRestore,6000);
  }
}

/* ---------- 渲染 ---------- */
function switchTab(t){ curTab=t; render(); }
function render(){
  if(!root||!work)return;
  Object.keys(tgl).forEach(function(k){ syncToggle(tgl[k],!!work[k]); });
  rng.powerSens.value=String(work.powerSens);
  val.powerSens.textContent=powFmt(work.powerSens);
  ['bgm','sfx','master'].forEach(function(k){
    rng[k].value=String(work.vols[k]);
    val[k].textContent=pctFmt(work.vols[k]);
  });
  Object.keys(tabBtns).forEach(function(k){ tabBtns[k].classList.toggle('rtcp-on',k===curTab); });
  Object.keys(panes).forEach(function(k){ panes[k].classList.toggle('rtcp-off',k!==curTab); });
}

/* ---------- 构建 ---------- */
function build(){
  injectStyle();
  if(root&&root.parentNode===host)return;
  if(root&&root.parentNode)root.parentNode.removeChild(root);
  root=el('div','rtcp-root rtcp-hide');
  var mask=el('div','rtcp-mask');
  mask.addEventListener('click',close);
  var sheet=el('div','rtcp-sheet');
  sheet.setAttribute('role','dialog');
  sheet.setAttribute('aria-modal','true');
  sheet.setAttribute('aria-label','设置');
  var head=el('div','rtcp-head');
  head.appendChild(el('b','rtcp-title','设置'));
  var x=el('button','rtcp-x','✕');
  x.type='button';
  x.setAttribute('aria-label','关闭');
  x.addEventListener('click',close);
  head.appendChild(x);
  var tabs=el('div','rtcp-tabs');
  [['play','玩法'],['sound','音效'],['data','数据']].forEach(function(p){
    var b=el('button','rtcp-tab',p[1]);
    b.type='button';
    b.setAttribute('data-rtcp-tab',p[0]);
    b.addEventListener('click',function(){ switchTab(p[0]); });
    tabBtns[p[0]]=b;
    tabs.appendChild(b);
  });
  var body=el('div','rtcp-body');
  panes.play=el('div','rtcp-pane');
  panes.play.appendChild(rowToggle('辅助瞄准线','aimGuide'));
  panes.play.appendChild(rowRange('力度灵敏度','powerSens',0.5,2,0.05,powFmt));
  panes.play.appendChild(rowToggle('老板台词','talk'));
  panes.sound=el('div','rtcp-pane');
  panes.sound.appendChild(rowToggle('声音总开关','sound'));
  panes.sound.appendChild(rowRange('BGM 音量','bgm',0,1,0.05,pctFmt));
  panes.sound.appendChild(rowRange('音效音量','sfx',0,1,0.05,pctFmt));
  panes.sound.appendChild(rowRange('总音量','master',0,1,0.05,pctFmt));
  panes.data=paneData();
  Object.keys(panes).forEach(function(k){ body.appendChild(panes[k]); });
  sheet.appendChild(head);
  sheet.appendChild(tabs);
  sheet.appendChild(body);
  root.appendChild(mask);
  root.appendChild(sheet);
  host.appendChild(root);
  document.addEventListener('keydown',onKey);
}
function onKey(e){ if(opened&&e.key==='Escape')close(); }

/* ---------- 对外动作 ---------- */
function mapTab(t){
  if(t==null)return null;
  t=String(t).toLowerCase();
  if(t==='play'||t==='玩法'||t==='game')return 'play';
  if(t==='sound'||t==='audio'||t==='音效')return 'sound';
  if(t==='data'||t==='数据')return 'data';
  return null;
}
function mount(elm){
  if(!elm)return;
  host=elm;
  build();
}
function open(tabName){
  if(!host){
    var p=document.getElementById('panel');
    if(p)mount(p);
  }
  if(!host)return;
  work=readCfg();
  var t=mapTab(tabName);
  if(t)curTab=t;
  disarmRestore();
  clearTimeout(closeTimer);
  root.classList.remove('rtcp-hide');
  void root.offsetWidth;   /* 强制回流，保证入场过渡 */
  root.classList.add('rtcp-in');
  render();
  opened=true;
}
function close(){
  if(!opened)return;
  opened=false;
  disarmRestore();
  root.classList.remove('rtcp-in');
  clearTimeout(closeTimer);
  closeTimer=setTimeout(function(){ root.classList.add('rtcp-hide'); },240);
}
function fire(){
  if(!cbs.length)return;
  var snap=deep(work);
  for(var i=0;i<cbs.length;i++){
    try{ cbs[i](deep(snap)); }catch(e){}
  }
}
function onChange(cb){
  if(typeof cb==='function')cbs.push(cb);
  return function(){
    var i=cbs.indexOf(cb);
    if(i>=0)cbs.splice(i,1);
  };
}

return {
  mount:mount,
  open:open,
  close:close,
  isOpen:function(){ return opened; },
  onChange:onChange
};
})();
