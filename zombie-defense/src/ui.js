/* ==== ui.js ==== DOM HUD + 全部界面（菜单/研究所/宝箱/充值/升级/暂停/结算） */
(function(){
'use strict';
const ZD=window.ZD, CFG=ZD.CFG, G=ZD.game;
const ui = window.ZD.ui = window.ZD.ui || {};
const $=(s,r)=>(r||document).querySelector(s);
const sfx=n=>{ try{ ZD.audio&&ZD.audio.play(n); }catch(e){} };

/* ---------- 技能图标（内联 SVG，24×24 线性风） ---------- */
const S='<svg viewBox="0 0 24 24">';
const SK_ICON={
  dmg:  S+'<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v3.4M12 18.1v3.4M2.5 12h3.4M18.1 12h3.4M5.3 5.3l2.4 2.4M16.3 16.3l2.4 2.4M18.7 5.3l-2.4 2.4M7.7 16.3l-2.4 2.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  rate: S+'<path d="M13.2 2.2 5.6 13.4h4.9L8.8 21.8l9.6-12.4h-5.2Z" fill="currentColor"/></svg>',
  multi:S+'<path d="M12 21V10M12 10 5.5 3.8M12 10l6.5-6.2" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/><path d="M3.6 6.6 5.5 3.8l3 .9M14.5 4.7l3-.9 1.9 2.8" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pierce:S+'<rect x="9" y="5" width="4.4" height="14" fill="none" stroke="currentColor" stroke-width="1.7" transform="rotate(18 11 12)"/><path d="M2.5 15.5 21 12 2.5 8.5l3 3.5Z" fill="currentColor"/></svg>',
  boom: S+'<circle cx="11" cy="14.4" r="6.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M14 9.4l2.6-4M17.6 4.2l2-.8M17 6.8l2.6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ice:  S+'<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 6.4 9.8 4.6M12 6.4l2.2-1.8M12 17.6l-2.2 1.8M12 17.6l2.2 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  drone:S+'<circle cx="6" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="6" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M8 8l2.2 2.2M16 8l-2.2 2.2M8 16l2.2-2.2M16 16l-2.2-2.2" stroke="currentColor" stroke-width="1.6"/></svg>',
  crit: S+'<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  wall: S+'<path d="M12 3 19 6v5.2c0 4.8-2.9 7.6-7 9.8-4.1-2.2-7-5-7-9.8V6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 7.5v7M8.5 11h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  laser:S+'<path d="M3 10.5v3l5-1.2v-.6Z" fill="currentColor"/><path d="M8 12h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 12l2.5-2M19 12l2.9.9M19 12l2 2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  burn: S+'<path d="M12.4 2.6c.6 3.8 5.4 5.2 5.4 10.2a5.8 5.8 0 0 1-11.6 0c0-2.8 1.8-4.2 2.9-6.3.6 1.9 2 2.6 2.3-.4.2-1.6.6-2.6 1-3.5Z" fill="currentColor"/></svg>',
  chain:S+'<path d="M13.8 2.5 7.5 11h4L9.6 21.5 18 10.2h-4.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4.5 6.5 2.8 9.4M21 15l-1.7 2.9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  barrage:S+'<path d="M12 21 6.5 6.5M12 21V4.5M12 21l5.5-14.5" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/><path d="M4.9 8.9 6.5 6.5l2.5 1M10.6 6.7 12 4.5l1.4 2.2M15 7.5l2.5-1 1.6 2.4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  exe:  S+'<path d="M12 3.2c4.3 0 7.4 2.9 7.4 7 0 2.4-1.1 4-2.6 5l-.4 3a1.3 1.3 0 0 1-1.3 1.1H8.9a1.3 1.3 0 0 1-1.3-1.1l-.4-3c-1.5-1-2.6-2.6-2.6-5 0-4.1 3.1-7 7.4-7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9.2" cy="11" r="1.7" fill="currentColor"/><circle cx="14.8" cy="11" r="1.7" fill="currentColor"/><path d="M12 13.4 11.1 15.6h1.8Z" fill="currentColor"/></svg>',
};
const skIcon = id => (SK_ICON[id] ? SK_ICON[id] : S+'</svg>');

/* ---------- 引用 ---------- */
let ov, hud, skillDock, banner, wallBar, lastSkillSig='', bannerT=0;
const soundSvg = ()=> (G.muted()
  ? '<svg class="ic"><use href="#i-mute"/></svg>'
  : '<svg class="ic"><use href="#i-sound"/></svg>');

/* ---------- HUD ---------- */
ui.updateHUD = function(){
  $('#hwWave').textContent = Math.max(1,G.wave);
  $('#hwKills').textContent = G.kills;
  $('#hwCoin').textContent = G.runCoins;
  $('#hwDia').textContent = G.runDia;
  $('#hwLv').textContent = G.level;
  $('#xpfill').style.width = Math.min(100, G.xp/G.xpNeed*100)+'%';
  const sp=$('#btnSpeed');
  sp.textContent='×'+G.speed;
  sp.classList.toggle('on', G.speed>1);
  // 技能坞
  const sig = Object.keys(G.runSkills).map(k=>k+G.runSkills[k]).join(',');
  if(sig!==lastSkillSig){
    lastSkillSig=sig;
    const owned=Object.keys(G.runSkills).filter(k=>G.runSkills[k]>0);
    if(!owned.length){ skillDock.classList.add('hidden'); }
    else{
      skillDock.classList.remove('hidden');
      skillDock.innerHTML = owned.map(id=>{
        const s=CFG.SKILL_POOL.find(x=>x.id===id);
        const maxed=G.runSkills[id]>=s.max;
        return '<div class="sk'+(maxed?' max':'')+'" title="'+s.name+'">'+skIcon(id)+'<b>'+G.runSkills[id]+'</b></div>';
      }).join('');
    }
  }
};
ui.layout = function(){
  const cv=$('#cv'), cell=$('#hwCoin');
  if(!cv||!cell) return;
  const sr=cv.getBoundingClientRect(), cr=cell.getBoundingClientRect();
  G.coinTarget.x = cr.left - sr.left + 14;
  G.coinTarget.y = cr.top - sr.top + 14;
  if(wallBar) wallBar.style.top = (G.wallY + 46) + 'px';
};

/* ---------- 防线血条（贴在墙下地面） ---------- */
ui.updateWallBar = function(){
  if(!wallBar){
    wallBar = document.createElement('div');
    wallBar.id = 'wallBar';
    wallBar.innerHTML = '<i>防线</i><span><u id="wbFill"></u></span><b id="wbTxt"></b>';
    document.getElementById('stage').appendChild(wallBar);
  }
  const w = G.wall, vis = G.state==='play'||G.state==='pause'||G.state==='levelup'||G.state==='over';
  wallBar.classList.toggle('hidden', !vis || !w);
  if(!w) return;
  const r = Math.max(0, w.hp/w.max);
  wallBar.style.top = (G.wallY + 46) + 'px';
  $('#wbFill', wallBar).style.width = (r*100)+'%';
  wallBar.classList.toggle('low', r < 0.3);
  $('#wbTxt', wallBar).textContent = Math.max(0,Math.ceil(w.hp))+'/'+Math.ceil(w.max);
};

/* ---------- 横幅 ---------- */
function showBanner(txt, cls){
  banner.textContent=txt;
  banner.className='show'+(cls?' '+cls:'');
  clearTimeout(bannerT);
  bannerT=setTimeout(()=>banner.className='', cls==='boss'?2200:1500);
}

/* ---------- 覆盖层 ---------- */
function bind(sel,fn,snd){
  const b=$(sel,ov); if(!b) return;
  b.addEventListener('click',e=>{ e.stopPropagation(); sfx(snd||'click'); fn(e); });
}
function currency(class_,v){ return '<span class="res '+class_+'"><svg class="ic"><use href="#'+(class_==='gold'?'i-coin':class_==='dia'?'i-dia':'i-gem')+'"/></svg>'+v+'</span>'; }
function vipTag(){ const v=G.vipLv(); return v? '<span class="res vip">VIP'+v+'</span>':''; }
function show(html,cls){ ov.className=cls||''; ov.innerHTML=html; }

ui.enter = function(){
  lastSkillSig='';   // 强制技能坞刷新
  hud.classList.toggle('hidden', G.state==='menu'||G.state==='shop');
  switch(G.state){
    case 'menu': drawMenu(); break;
    case 'shop': drawShop(); break;
    case 'levelup': drawLevelup(); break;
    case 'pause': drawPause(); break;
    case 'over': drawOver(); break;
    default: hide();
  }
};
function hide(){ ov.className='hidden'; ov.innerHTML=''; }

/* ---------- 主菜单 ---------- */
function drawMenu(){
  const s=G.save, canUp=CFG.UPGRADES.some(u=> s.up[u.id]<CFG.UP_MAX_LV && s.coins>=CFG.upCost(u,s.up[u.id]));
  const canChest=s.dia>=CFG.CHEST.single.cost;
  show(
  '<div class="scr menu">'
  +'<div class="menu-head"><button class="icon-btn" id="mSound">'+soundSvg()+'</button></div>'
  +'<div class="menu-hero">'
    +'<div class="tag-line">LAST OUTPOST · 无尽波次防御</div>'
    +'<h1 class="m-title">僵尸防线</h1>'
    +'<div class="m-sub">孤哨重制 <i>/</i> 至尊版玩法 1:1</div>'
  +'</div>'
  +'<div class="res-strip">'+currency('gold',s.coins)+currency('dia',s.dia)+currency('gem',s.gems.length)+vipTag()+'</div>'
  +'<button class="btn-primary big" id="mStart">开始游戏</button>'
  +'<div class="entries">'
    +'<button class="entry" id="mUp"><span class="eic amber"><svg class="ic"><use href="#i-up"/></svg></span><span class="etxt"><b>军备研究所</b><i>金币购买永久属性</i></span>'+(canUp?'<span class="dot"></span>':'')+'</button>'
    +'<button class="entry" id="mChest"><span class="eic dia-c"><svg class="ic"><use href="#i-chest"/></svg></span><span class="etxt"><b>至尊宝箱</b><i>钻石抽宝石 · 属性自动生效</i></span>'+(canChest?'<span class="dot cyan"></span>':'')+'</button>'
    +'<button class="entry" id="mPay"><span class="eic red-c"><svg class="ic"><use href="#i-pay"/></svg></span><span class="etxt"><b>充值中心</b><i>模拟充值 · 0 元到手</i></span>'+(!s.paid._seen?'<span class="dot red"></span>':'')+'</button>'
  +'</div>'
  +(!s.paid._seen?'<button class="fc-banner" id="mFc">首充 ¥6 双倍送 888 钻 + VIP 进度<span class="arr">→</span></button>':'')
  +'<div class="hint">击杀 Boss 必掉钻石 · 每波通关 +2 钻 · 数据自动存档</div>'
  +'<button class="tiny-link" id="mReset">重置存档</button>'
  +'</div>','menu-scr');
  bind('#mStart', ()=>G.startRun());
  bind('#mUp', ()=>G.openShop('up'));
  bind('#mChest', ()=>G.openShop('chest'));
  bind('#mPay', ()=>{ G.save.paid._seen=1; G.persist(); G.openShop('pay'); });
  bind('#mFc', ()=>{ G.save.paid._seen=1; G.persist(); G.openShop('pay'); });
  bind('#mSound', toggleSound);
  bind('#mReset', ()=>{
    if(confirm('确定清空全部存档（金币/钻石/宝石/充值记录）？')){ G.resetSave(); ui.enter(); }
  },'clickSoft');
}
function toggleSound(){
  G.setMuted(!G.muted());
  const b=$('#mSound',ov)||$('#pSound',ov);
  if(b) b.innerHTML=soundSvg();
}

/* ---------- 商店页骨架 ---------- */
function shopFrame(title,sub,body){
  show(
  '<div class="scr shop">'
  +'<div class="shop-head"><button class="icon-btn" id="shBack"><svg class="ic"><use href="#i-back"/></svg></button>'
  +'<div class="sh-title"><b>'+title+'</b><i>'+sub+'</i></div>'
  +'<button class="icon-btn" id="shSound">'+soundSvg()+'</button></div>'
  +'<div class="shop-body">'+body+'</div></div>','shop-scr');
  bind('#shBack', ()=>G.toMenu());
  bind('#shSound', toggleSound);
}

/* ---------- 军备研究所 ---------- */
function drawShop(){
  const g=G.shop;
  if(g.view==='up'){
    const s=G.save, m=G.metaBonus();
    const rows=CFG.UPGRADES.map(u=>{
      const lv=s.up[u.id], cost=CFG.upCost(u,lv), maxed=lv>=CFG.UP_MAX_LV, can=!maxed&&s.coins>=cost;
      return '<div class="uprow'+(maxed?' maxed':'')+'">'
        +'<div class="upinfo"><b>'+u.name+' <em class="lv">Lv.'+lv+'</em></b><i>'+u.desc(lv)+'</i>'
        +'<span class="track"><u style="width:'+(lv/CFG.UP_MAX_LV*100)+'%"></u></span></div>'
        +'<button class="cost-btn'+(can?' ok':'')+'" data-up="'+u.id+'" '+(can?'':'disabled')+'>'
        +(maxed?'已满级':'<svg class="ic sm"><use href="#i-coin"/></svg>'+cost)+'</button></div>';
    }).join('');
    shopFrame('军备研究所','永久生效 · 越买越强',
      '<div class="res-strip top">'+currency('gold',s.coins)+currency('dia',s.dia)+'</div>'
      +rows
      +'<div class="bonus-note">当前战力：攻击 +'+Math.round((m.atk-1)*100)+'% · 射速 +'+Math.round((m.rate-1)*100)+'% · 防线 +'+Math.round((m.hp-1)*100)+'% · 金币 +'+Math.round(m.coin*100)+'%'+(G.vipLv()?'（含 VIP'+G.vipLv()+'）':'')+'</div>');
    ov.querySelectorAll('[data-up]').forEach(b=>b.addEventListener('click',()=>{
      if(G.buyUpgrade(b.dataset.up)){ sfx('buy'); ui.enter(); }
      else sfx('clickSoft');
    }));
  }
  else if(g.view==='chest'){
    let body;
    if(g.chestView==='result'){
      const cards=g.chestResults.map((r,i)=>{
        const t=CFG.GEM_TYPES.find(x=>x.id===r.id), q=CFG.GEM_QUALITY[r.q];
        return '<div class="gem-card q'+r.q+'" style="animation-delay:'+(i*0.16)+'s">'
          +'<em class="gq">'+q.n+'</em><b>'+t.name+'</b><i>'+t.fmt(t.base*q.m)+'</i></div>';
      }).join('');
      body='<div class="chest-title">开启结果</div><div class="gem-grid">'+cards+'</div>'
        +'<button class="btn-primary" id="chestOk">收下</button>'
        +'<div class="hint">宝石永久叠加生效 · 战力 '+G.gemPower()+' 点 · 共 '+G.save.gems.length+' 颗</div>';
    }else{
      const c1=CFG.CHEST.single, c3=CFG.CHEST.triple;
      body='<div class="res-strip top">'+currency('dia',G.save.dia)+'</div>'
        +'<div class="uprow"><div class="upinfo"><b>普通宝箱</b><i>1 颗宝石 · 传说/绝世/至尊 70/25/5</i></div>'
        +'<button class="cost-btn'+(G.save.dia>=c1.cost?' ok':'')+'" id="ch1" '+(G.save.dia>=c1.cost?'':'disabled')+'><svg class="ic sm"><use href="#i-dia"/></svg>'+c1.cost+'</button></div>'
        +'<div class="uprow hot"><div class="upinfo"><b class="rose">至尊宝箱</b><i>一次 3 颗 · 至尊概率 15%</i></div>'
        +'<button class="cost-btn'+(G.save.dia>=c3.cost?' ok':'')+'" id="ch3" '+(G.save.dia>=c3.cost?'':'disabled')+'><svg class="ic sm"><use href="#i-dia"/></svg>'+c3.cost+'</button></div>'
        +'<div class="hint">已有宝石 '+G.save.gems.length+' 颗 · 战力 '+G.gemPower()+' 点<br>宝石属性全局自动生效，无需镶嵌</div>';
    }
    shopFrame('至尊宝箱','Boss 必掉钻石',body);
    bind('#ch1', ()=>{ G.buyChest(1)&&ui.enter(); });
    bind('#ch3', ()=>{ G.buyChest(3)&&ui.enter(); });
    bind('#chestOk', ()=>{ G.shop.chestView='shop'; ui.enter(); });
  }
  else if(g.view==='pay'){
    const rows=CFG.PAY_TIERS.map(t=>{
      const doubled=!G.save.paid[t.id];
      return '<div class="uprow"><div class="upinfo"><b>'+t.p+' <em class="dia-t">'+t.d+' 钻</em></b>'
        +'<i>'+(doubled?'<span class="hot-tag">首购双倍</span> 首购额外送 '+t.d+' 钻':'已购 · 可重复购买')+'</i></div>'
        +'<button class="cost-btn ok" data-pay="'+t.id+'">购买</button></div>';
    }).join('');
    shopFrame('充值中心','VIP '+G.vipLv()+' · 每级金币收益 +8%',
      '<div class="res-strip top">'+currency('dia',G.save.dia)+'</div>'+rows
      +'<div class="hint">本游戏为纯单机模拟，不产生任何真实扣费<br>点击即到账（模拟支付），只为还原充值手感</div>');
    ov.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>{
      sfx('click'); G.pay(b.dataset.pay); ui.enter();
    }));
  }
  else if(g.view==='paid'){
    show(
    '<div class="scr paid"><div class="paid-card">'
    +'<div class="paid-ok"><svg viewBox="0 0 24 24"><path d="M4.5 12.5 10 18 19.5 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
    +'<b>模拟支付成功</b><em class="dia-t">钻石 +'+G.shop.paidGain+'</em>'
    +'<i>已到账 · 当前钻石 '+G.save.dia+'（0 元真实支付）</i>'
    +'<button class="btn-primary" id="paidOk">好的</button></div></div>','paid-scr');
    bind('#paidOk', ()=>{ G.shop.view='pay'; ui.enter(); });
  }
}

/* ---------- 升级三选一 ---------- */
function drawLevelup(){
  const owned=Object.keys(G.runSkills).filter(k=>G.runSkills[k]>0).length;
  const cards=G.levelupOptions.map((s,i)=>{
    const isNew=!(G.runSkills[s.id]>0);
    return '<button class="lvcard" data-i="'+i+'" style="animation-delay:'+(i*0.09)+'s">'
      +'<span class="lvic">'+skIcon(s.id)+'</span>'
      +'<span class="lvt"><b>'+s.name+' '+(isNew?'<em class="new">新技能</em>':'<em class="lv">Lv.'+(G.runSkills[s.id]+1)+'</em>')+'</b><i>'+s.desc+'</i></span>'
      +'<span class="lvpick">选择</span></button>';
  }).join('');
  show('<div class="scr levelup">'
    +'<div class="lv-head">升级 · 三选一</div>'
    +'<div class="lv-sub">技能槽 '+owned+'/'+CFG.MAX_DISTINCT+(owned>=CFG.MAX_DISTINCT?' · 已满，只能升级已学技能':'')+'</div>'
    +'<div class="lv-cards">'+cards+'</div></div>','levelup-scr');
  ov.querySelectorAll('.lvcard').forEach(c=>c.addEventListener('click',()=>{
    sfx('click'); G.pickSkill(+c.dataset.i);
  }));
}

/* ---------- 暂停 ---------- */
function drawPause(){
  show('<div class="scr pause"><div class="p-title">已暂停</div>'
    +'<button class="btn-primary" id="pResume">继续战斗</button>'
    +'<button class="btn-ghost" id="pRestart">重新开局</button>'
    +'<button class="btn-ghost" id="pExit">结算并回基地</button>'
    +'<button class="icon-btn sound-float" id="pSound">'+soundSvg()+'</button>'
    +'<div class="hint">结算 = 本局金币/钻石按加成带出局，不会白打</div></div>','pause-scr');
  bind('#pResume', ()=>G.resume());
  bind('#pRestart', ()=>G.restart());
  bind('#pExit', ()=>G.exitAndSettle());
  bind('#pSound', toggleSound);
}

/* ---------- 结算 ---------- */
function drawOver(){
  const r=G.lastRun||{wave:G.wave,kills:G.kills};
  show('<div class="scr over">'
    +'<div class="ov-skull"><svg viewBox="0 0 24 24"><use href="#i-skull"/></svg></div>'
    +'<div class="ov-title">防线失守</div>'
    +'<div class="ov-stats">'
    +'<div class="ovrow"><i>坚守波次</i><b>'+r.wave+'</b></div>'
    +'<div class="ovrow"><i>击杀僵尸</i><b>'+r.kills+'</b></div>'
    +'<div class="ovrow gold"><i>金币带出</i><b>+'+(G.lastGained||0)+'</b></div>'
    +'<div class="ovrow dia"><i>钻石带出</i><b>+'+G.runDia+'</b></div>'
    +'</div>'
    +'<button class="btn-primary" id="ovAgain">再来一局</button>'
    +'<div class="ov-row2"><button class="btn-ghost" id="ovUp">强化战力</button>'
    +'<button class="btn-ghost" id="ovHome">回基地</button></div>'
    +'<div class="hint">金币 → 军备研究所买永久属性 · 钻石 → 宝箱抽宝石</div></div>','over-scr');
  bind('#ovAgain', ()=>G.restart());
  bind('#ovUp', ()=>G.openShop('up'));
  bind('#ovHome', ()=>G.toMenu());
}

/* ---------- 初始化 ---------- */
ui.init = function(){
  ov=$('#overlay'); hud=$('#hud'); skillDock=$('#skillDock'); banner=$('#waveBanner');
  $('#btnSpeed').addEventListener('click',()=>{ sfx('clickSoft'); G.cycleSpeed(); });
  $('#btnPause').addEventListener('click',()=>{ sfx('click'); G.pause(); });
  G.on('state', ()=>ui.enter());
  G.on('speed', ()=>{});
  G.on('cur', ()=>{ if(G.state==='menu'||G.state==='shop') ui.enter(); });
  G.on('wave', ()=>{
    if(G.wave===0){ showBanner('防线部署 · 僵尸来袭',''); sfx('waveHorn'); return; }
    const boss=G.wave%5===0;
    showBanner(boss?'BOSS 来袭':'第 '+G.wave+' 波', boss?'boss':'');
    sfx(boss?'bossWarn':'waveHorn');
  });
};
})();
