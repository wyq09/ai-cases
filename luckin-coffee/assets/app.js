/* ============================================================
   瑞幸咖啡小程序 · 交互复刻 —— 数据 / 渲染 / 路由 / 交互
   原创实现：所有图形均为 CSS/SVG 程序化绘制
   ============================================================ */
'use strict';

/* ---------- 工具 ---------- */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yuan = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
const FREEZE = new URLSearchParams(location.search).has('freeze');

/* ---------- 杯子/商品图 程序化 SVG ---------- */
let artSeq = 0;
function cupSVG(art, cls=''){
  const id = 'g' + (++artSeq);
  const [c1, c2] = art.colors;
  const fruit = art.fruit ? `<circle cx="41" cy="30" r="13" fill="#fff" opacity=".92"/><text x="41" y="36" font-size="17" text-anchor="middle">${art.fruit}</text>` : '';
  const foam = art.foam ? `<path d="M20 30 q5 -7 10.5 0 q5 -7 10.5 0 q5 -7 10.5 0 q5 -7 10.5 0 v7 h-42 z" fill="rgba(255,255,255,.55)"/>` : '';
  const ice = art.ice ? `<rect x="26" y="44" width="10" height="10" rx="2.5" fill="rgba(255,255,255,.4)" transform="rotate(12 31 49)"/><rect x="38" y="54" width="9" height="9" rx="2.5" fill="rgba(255,255,255,.34)" transform="rotate(-14 42 58)"/>` : '';
  const straw = art.straw===false ? '' : `<rect x="52" y="6" width="5.6" height="30" rx="2.8" fill="${art.strawColor||'#fff'}" transform="rotate(10 55 21)" opacity=".95"/>`;
  return `<svg class="${cls}" viewBox="0 0 82 82" width="100%" height="100%">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient></defs>
    <ellipse cx="41" cy="72" rx="26" ry="5" fill="rgba(20,30,70,.10)"/>
    <path d="M22 18 h38 l-4.5 47 a7 7 0 0 1-7 6.4 h-15 a7 7 0 0 1-7-6.4 z" fill="rgba(235,240,250,.5)" stroke="rgba(255,255,255,.75)" stroke-width="1.6"/>
    <clipPath id="${id}c"><path d="M22 18 h38 l-4.5 47 a7 7 0 0 1-7 6.4 h-15 a7 7 0 0 1-7-6.4 z"/></clipPath>
    <g clip-path="url(#${id}c)">
      <rect x="20" y="24" width="42" height="50" fill="url(#${id})"/>
      ${foam}${ice}
    </g>
    <rect x="18.5" y="12.5" width="45" height="8.5" rx="4.2" fill="#f7f4ec" stroke="rgba(120,110,90,.25)"/>
    ${straw}${fruit}
  </svg>`;
}
function boxSVG(art, cls=''){
  const id = 'g' + (++artSeq);
  const [c1, c2] = art.colors;
  const shape = art.type==='bottle'
    ? `<rect x="30" y="6" width="10" height="10" rx="3" fill="#dfe6f2"/><rect x="24" y="14" width="22" height="56" rx="8" fill="url(#${id})"/><rect x="27" y="30" width="16" height="22" rx="3" fill="rgba(255,255,255,.85)"/>`
    : art.type==='bag'
    ? `<path d="M24 22 h22 l4 6 v36 a5 5 0 0 1-5 5 H25 a5 5 0 0 1-5-5 V28 z" fill="url(#${id})"/><path d="M29 22 a6 6 0 0 1 12 0" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.4"/><rect x="27" y="34" width="14" height="18" rx="2.5" fill="rgba(255,255,255,.85)"/>`
    : `<rect x="18" y="16" width="46" height="52" rx="6" fill="url(#${id})"/><rect x="18" y="16" width="46" height="13" rx="6" fill="rgba(255,255,255,.14)"/><rect x="25" y="36" width="24" height="17" rx="2.5" fill="rgba(255,255,255,.88)"/><circle cx="56" cy="56" r="6" fill="rgba(255,255,255,.35)"/>`;
  return `<svg class="${cls}" viewBox="0 0 82 82" width="100%" height="100%">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient></defs>
    <ellipse cx="41" cy="74" rx="26" ry="4.5" fill="rgba(20,30,70,.08)"/>${shape}
  </svg>`;
}
const artSVG = (p, cls) => p.artType==='box' ? boxSVG(p.art, cls) : cupSVG(p.art, cls);
const thumbHTML = (p, extra='') => `<span class="prod-img ${extra}" style="background:linear-gradient(150deg,${p.art.bg||'#eef2f8'},${p.art.bg2||'#dfe6f2'})">${artSVG(p)}</span>`;

/* ============================================================
   数据
   ============================================================ */
const B = { /* 常用配色 */
  latte:['#e8c99a','#b07f42'], coconut:['#f2e4cd','#caa06a'], americano:['#c99a63','#5f3a1c'],
  tea:['#e9b25c','#b96f2a'], apple:['#cfe69a','#7ba84e'], orange:['#ffcf7e','#e88f33'],
  grape:['#d9b6e8','#8e56ad'], matcha:['#cfe3ae','#6f9a4a'], cocoa:['#d8b49a','#7c4a2a'],
  velvet:['#e3c8d8','#a06a8c'], dark:['#9a8c7a','#3f342a'], milk:['#f4ead8','#cbb58e'],
};
function P(id, cat, name, price, opt={}){
  return { id, cat, name, price, orig:opt.orig, est:opt.est, chips:opt.chips||[], badge:opt.badge,
           desc:opt.desc||'', art:opt.art, artType:opt.artType||'cup' };
}
const MENU_CATS = [
  { id:'top', name:'人气Top', note:'人气爆款 · 无理由购', tags:['招牌必喝','冰饮专区','今日现做'], products:[
    P('synt','top','生椰拿铁（首创）',11.3,{est:20,badge:'hot',chips:['全球销量第一','累计销量超2亿杯 · IAC金奖'],art:{colors:B.coconut,foam:1,ice:1}}),
    P('xyms','top','小黄油美式（首创）',10.9,{est:20,badge:'hot',chips:['首创黄油风味','全网话题爆款'],art:{colors:B.americano,ice:1}}),
    P('pgbc','top','杏运奇兰苹果冰茶',10.9,{orig:18,badge:'new',chips:['NFC苹果汁 · 冷萃奇兰乌龙','真实果肉'],art:{colors:B.apple,ice:1,fruit:'🍎'}}),
    P('xcgz','top','鲜橙果茶·老样子',12.9,{orig:21,badge:'hot',chips:['鲜萃鲜果 · 浏阳蜜桔','真茶真果真鲜'],art:{colors:B.orange,ice:1,fruit:'🍊'}}),
    P('jdlt','top','经典拿铁',9.9,{orig:13,chips:['大师拼配','经典之选'],art:{colors:B.latte,foam:1}}),
  ]},
  { id:'bdq', name:'百大卡专区', note:'杯杯 9.9 元起', products:[
    P('kjnd','bdq','卡布奇诺',9.9,{orig:15,chips:['绵密奶泡'],art:{colors:B.milk,foam:1}}),
    P('jtamd','bdq','焦糖玛奇朵',9.9,{orig:16,chips:['焦糖淋酱'],art:{colors:B.milk,foam:1,strawColor:'#d9924a'}}),
    P('jtlk','bdq','焦糖拿铁',9.9,{orig:16,chips:['香浓焦糖'],art:{colors:B.latte,foam:1}}),
    P('xclt9','bdq','香草拿铁',9.9,{orig:16,chips:['马达加斯加香草'],art:{colors:B.latte,foam:1}}),
  ]},
  { id:'qbqs', name:'全冰去水', note:'全冰去水 · 宝藏隐藏喝法', products:[
    P('qbqsy','qbqs','全冰去水生椰拿铁',11.3,{badge:'new',chips:['多冰更爽快','口味更浓郁'],art:{colors:B.coconut,ice:1,foam:1}}),
    P('qbqc','qbqs','全冰去水橙C美式',10.9,{chips:['果香冷萃'],art:{colors:B.orange,ice:1,fruit:'🍊'}}),
    P('qbqy','qbqs','全冰去水柚C美式',10.9,{chips:['柚香清爽'],art:{colors:B.grape,ice:1,fruit:'🍇'}}),
  ]},
  { id:'fwlt', name:'风味拿铁', note:'风味与奶香的双重奏', products:[
    P('ghlt','fwlt','桂花拿铁',13.9,{chips:['金桂入奶'],art:{colors:B.latte,foam:1}}),
    P('zglf','fwlt','榛果风味拿铁',12.9,{chips:['意式榛果'],art:{colors:B.latte,foam:1,strawColor:'#8a5a34'}}),
    P('yrzlt','fwlt','丝绒拿铁',13.9,{chips:['云绒奶沫'],art:{colors:B.velvet,foam:1}}),
  ]},
  { id:'xhy', name:'小黄油系列', note:'黄油香醇 · 首创风味', products:[
    P('xyms2','xhy','小黄油美式（首创）',10.9,{badge:'hot',chips:['首创黄油风味'],art:{colors:B.americano,ice:1}}),
    P('xhlt','xhy','小黄油拿铁',12.9,{chips:['黄油+拿铁','双重醇香'],art:{colors:B.latte,foam:1}}),
    P('xhsr','xhy','小黄油丝绒拿铁',13.9,{badge:'new',chips:['丝绒质地'],art:{colors:B.velvet,foam:1}}),
  ]},
  { id:'sy', name:'生椰家族', note:'椰香与咖啡的碰撞', products:[
    P('synt2','sy','生椰拿铁（首创）',11.3,{badge:'hot',chips:['全球销量第一'],art:{colors:B.coconut,foam:1,ice:1}}),
    P('yylt','sy','椰云拿铁',12.9,{chips:['云朵椰浆'],art:{colors:B.coconut,foam:1}}),
    P('sysr','sy','生椰丝绒拿铁',13.9,{chips:['丝绒+生椰'],art:{colors:B.velvet,foam:1}}),
  ]},
  { id:'gcms', name:'果C美式', note:'果香与美式的清爽配方', products:[
    P('cms','gcms','橙C美式',10.9,{badge:'hot',chips:['整颗鲜橙','维C满格'],art:{colors:B.orange,ice:1,fruit:'🍊'}}),
    P('ycms','gcms','柚C美式',10.9,{chips:['红柚清苦'],art:{colors:B.grape,ice:1,fruit:'🍇'}}),
    P('ptbc','gcms','葡萄冰萃茶',13.9,{badge:'new',chips:['冰萃更爽'],art:{colors:B.grape,ice:1,fruit:'🍇'}}),
  ]},
  { id:'msjz', name:'美式家族', note:'纯粹与经典的坚守', products:[
    P('ms','msjz','美式',9.9,{chips:['经典意式'],art:{colors:B.americano,ice:1}}),
    P('bms','msjz','冰美式',9.9,{chips:['冰爽纯粹'],art:{colors:B.americano,ice:1}}),
    P('nsms','msjz','浓香美式',10.9,{chips:['深度烘焙'],art:{colors:B.dark,ice:1}}),
  ]},
  { id:'bhkf', name:'不喝咖啡', note:'不喝咖啡也有好选择', products:[
    P('mclt','bhkf','抹茶拿铁',13.9,{chips:['石臼抹茶'],art:{colors:B.matcha,foam:1}}),
    P('yrmt','bhkf','宇治抹茶',11.9,{chips:[' Gunpowder','微苦回甘'],art:{colors:B.matcha,ice:1}}),
    P('kcrnb','bhkf','可可瑞纳冰',14.9,{badge:'new',chips:['冰沙绵密'],art:{colors:B.cocoa,ice:1,foam:1}}),
  ]},
  { id:'dskf', name:'大师咖啡', note:'大师级拼配与烘焙', products:[
    P('dslb','dskf','大师拿铁',15.9,{chips:['IIAC金奖豆'],art:{colors:B.latte,foam:1}}),
    P('dsms','dskf','大师美式',13.9,{chips:['中深烘'],art:{colors:B.americano,ice:1}}),
    P('dsab','dskf','大师澳白',16.9,{chips:['双份浓缩'],art:{colors:B.milk,foam:1}}),
  ]},
  { id:'soe', name:'SOE小蓝杯', note:'单一产地精品系列', products:[
    P('soeyn','soe','SOE小蓝杯·云南',15.9,{badge:'new',chips:['云南保山产区'],art:{colors:B.americano,ice:1,strawColor:'#2f57c4'}}),
    P('soeas','soe','SOE小蓝杯·埃塞',16.9,{chips:['日晒处理','花香柑橘'],art:{colors:B.americano,ice:1,strawColor:'#2f57c4'}}),
    P('dirty','soe','SOE Dirty',16.9,{chips:['冰博克厚乳'],art:{colors:B.milk,ice:1,strawColor:'#2f57c4'}}),
  ]},
];
const MENU_ALL = MENU_CATS.flatMap(c=>c.products);

const INSTANT_CATS = [
  { id:'yl',  name:'咖啡饮料', emoji:'🥤', tag:'hot' },
  { id:'fen', name:'黑咖啡粉', emoji:'🫘' },
  { id:'ye',  name:'咖啡液',   emoji:'🧋', tag:'new' },
  { id:'gj',  name:'挂耳·胶囊', emoji:'☕' },
  { id:'dou', name:'咖啡豆',   emoji:'🌰', tag:'t2' },
];
const INSTANT_PRODUCTS = [
  P('i1','yl','32杯意式黑浓缩咖啡液',61,{orig:99,artType:'box',art:{type:'box',colors:['#2c3f96','#16245c'],bg:'#dfe7fa',bg2:'#c6d4f2'},chips:[],desc:''}),
  P('i2','yl','78杯醇鲜黑咖啡（3盒）',94.9,{est:119.7,artType:'box',art:{type:'box',colors:['#1d2c5e','#101a3c'],bg:'#dde4f6',bg2:'#c3cde9'}}),
  P('i3','yl','小鼹鼠联名·冷萃咖啡液',69,{badge:'new',artType:'box',art:{type:'box',colors:['#5b4a3a','#2e241c'],bg:'#efe8df',bg2:'#ddd0bf'}}),
  P('i4','yl','生椰拿铁·即饮瓶 6瓶装',49,{artType:'box',art:{type:'bottle',colors:['#e8d5b5','#c9a875'],bg:'#f6efe2',bg2:'#ebdfc9'}}),
  P('i5','fen','醇粹黑咖啡 2.0g×30条',49,{orig:59,badge:'hot',artType:'box',art:{type:'bag',colors:['#233457','#111a2e'],bg:'#e2e8f4',bg2:'#ccd6ea'}}),
  P('i6','fen','黑金美式即溶粉 50条',59,{artType:'box',art:{type:'bag',colors:['#3a3f52','#20242f'],bg:'#e6e8f0',bg2:'#d2d5e2'}}),
  P('i7','ye','经典浓缩咖啡液 18杯',39,{badge:'new',artType:'box',art:{type:'bottle',colors:['#7a5230','#4a2e16'],bg:'#f0e6d8',bg2:'#e2d2ba'}}),
  P('i8','ye','小蓝杯意式浓缩液 32杯',69,{artType:'box',art:{type:'bottle',colors:['#2c3f96','#1b2a66'],bg:'#dfe7fa',bg2:'#c6d4f2'}}),
  P('i9','gj','挂耳咖啡礼盒 20包',59,{artType:'box',art:{type:'box',colors:['#b98a58','#8a5f34'],bg:'#f2e9db',bg2:'#e6d7bf'}}),
  P('i10','gj','意式胶囊咖啡 20颗',45,{artType:'box',art:{type:'box',colors:['#c0392b','#8e2418'],bg:'#f6e3df',bg2:'#edcdc6'}}),
  P('i11','dou','意式拼配咖啡豆 250g',39,{artType:'box',art:{type:'bag',colors:['#6d5638','#463522'],bg:'#efe8dc',bg2:'#e0d5c2'}}),
  P('i12','dou','SOE云南咖啡豆 250g',49,{badge:'new',artType:'box',art:{type:'bag',colors:['#2f6e46','#1c4229'],bg:'#e2efe6',bg2:'#cbe2d2'}}),
];

const RECOMM = ['pgbc','xyms','cms','qbqsy','synt'].map(id=>MENU_ALL.find(p=>p.id===id));

const UPSELL = [
  { id:'u1', name:'黑可可猫爪造型饼干', price:5.9, orig:9,  cls:'c-blue',  emoji:'🍪' },
  { id:'u2', name:'小黄油猫头造型饼干', price:5.9, orig:9,  cls:'c-cream', emoji:'🐈' },
  { id:'u3', name:'泰茶可可巴巴露',     price:5.9, orig:13, cls:'c-pink',  emoji:'🍮', sub:'有21人换购' },
];

const STORES = [
  { id:'s1', name:'海西金谷Plaza店',      dist:'0m',   addr:'思明区望海路12号海西金谷Plaza一层', bought:true },
  { id:'s2', name:'观音山商务区10号楼店', dist:'141m', addr:'思明区台东路168号观音山10号楼一层大堂', bought:true },
  { id:'s3', name:'软件园二期店',          dist:'680m', addr:'思明区望海路55号之2b座附近' },
  { id:'s4', name:'厦大科技园店',          dist:'1.2km', addr:'思明区南路398号科技园3号楼' },
  { id:'s5', name:'观音山营运中心店',      dist:'1.6km', addr:'思明区台东路165号营运中心B座' },
];
const SEED_ADDRS = [
  { id:'a1', text:'软件园望海路55号楼停车场 望海路55号楼之2b座附近(望海路55号之二105 新小店)', name:'吴 先生', rawName:'吴', rawPhone:'15896829682', phone:'158****9682', tag:'公司', def:true },
  { id:'a2', text:'润乡云计算有限公司 玉兰西路与阳光大街交叉口东南50米(河北省邢台市临西县云计算有限公司)', name:'张女士 女士', rawName:'张女士', rawPhone:'17762736273', phone:'177****6273', tag:'' },
  { id:'a3', text:'厦门市软件园望海路57号楼 望海路57号(57号楼之一 507（大门进门左拐走到底）)', name:'吴 先生', rawName:'吴', rawPhone:'15896829682', phone:'158****9682' },
  { id:'a4', text:'厦门市软件园望海路31号楼 望海路31号(5楼501)', name:'吴 先生', rawName:'吴', rawPhone:'15896829682', phone:'158****9682' },
];
const PICK_ADDRS = [
  '软件园望海路55号楼停车场（望海路55号之二105 新小店）',
  '观音山商务区10号楼（台东路168号一层大堂）',
  '海西金谷Plaza（望海路12号一层）',
  '厦门软件园三期·B11栋（集美区诚毅北大街56号）',
];
const COUPONS = [
  { v:9.9, n:'商品兑换券', cond:'满29元可用', valid:'2026.09.30 到期', color:'' },
  { v:9.9, n:'商品兑换券', cond:'满29元可用', valid:'2026.09.30 到期', color:'' },
  { v:4.9, n:'新品尝鲜券', cond:'新品饮品可用', valid:'2026.09.15 到期', color:'b' },
  { v:5,   n:'配送优惠券', cond:'外送订单可用', valid:'2026.09.08 到期', color:'b' },
];
const CS_CHIPS = [4.9, 9.9, 9.9, 9.9, 9.9];
const HOT_SEARCH = ['生椰拿铁','小黄油美式','苹果冰茶','橙C美式','9.9','瑞纳冰','丝绒拿铁'];

/* ============================================================
   状态
   ============================================================ */
const store = {
  load(){ try{ return JSON.parse(localStorage.getItem('luckin_replica_v1')) || null; }catch(e){ return null; } },
  save(){ try{ localStorage.setItem('luckin_replica_v1', JSON.stringify({
    cart:S.cart, addresses:S.addresses, orders:S.orders, addrId:S.addrId,
    menuStoreId:S.menuStoreId, orderStoreId:S.orderStoreId, orderType:S.orderType,
  })); }catch(e){} },
};
const S = Object.assign({
  tab:'home',
  orderType:'pickup',          // 确认订单：pickup | delivery
  menuType:'pickup',           // 菜单页：pickup | delivery
  mtab:'classic',
  instCat:'yl',
  cart:[], addresses:[], orders:[],
  addrId:null,                 // 外送选中地址
  menuStoreId:'s1', orderStoreId:'s2',
  rwkSel:false,                // 订单页瑞王卡选中
  fromAddress:false,           // 地址页来源：order
  editAddrId:null,
  stack:[],
}, store.load() || {});
if(!S.addresses.length) S.addresses = JSON.parse(JSON.stringify(SEED_ADDRS));
if(!S.addrId) S.addrId = (S.addresses.find(a=>a.def)||S.addresses[0]).id;
if(new URLSearchParams(location.search).has('reset')){ localStorage.removeItem('luckin_replica_v1'); location.replace('index.html'); }

const storeById = id => STORES.find(s=>s.id===id) || STORES[0];
const addrById  = id => S.addresses.find(a=>a.id===id);

/* ============================================================
   Toast / 弹层基础
   ============================================================ */
let toastTimer;
function toast(msg){
  const t = $('#toast'); t.innerHTML = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('on'), 1900);
}
function openSheet(id){
  $('#dim').classList.add('on'); $(id).classList.add('open');
}
function closeSheets(){
  $('#dim').classList.remove('on');
  $$('.sheet.open').forEach(s=>s.classList.remove('open'));
}

/* ============================================================
   路由：主 Tab + 子页栈
   ============================================================ */
const TAB_IDS = ['home','menu','instant','card','mine'];
function goTab(tab){
  S.tab = tab;
  $$('.tab-page').forEach(p=>p.classList.toggle('active', p.id === 'page-'+tab));
  $$('.tab-item').forEach(t=>t.classList.toggle('active', t.dataset.tab===tab));
  $('#tabbar').classList.remove('hide');
  if(tab==='order' || tab==='mine') renderMine();
}
function pushPage(id){
  S.stack.push(id);
  $('#tabbar').classList.add('hide');
  $('#'+id).classList.add('active');
}
function popPage(){
  const id = S.stack.pop();
  if(id) $('#'+id).classList.remove('active');
  if(!S.stack.length) $('#tabbar').classList.remove('hide');
}
function resetStack(){
  $$('.stack-page.active').forEach(p=>p.classList.remove('active'));
  S.stack = [];
  $('#tabbar').classList.remove('hide');
}

/* ============================================================
   首页渲染
   ============================================================ */
function renderBanner(){
  const slides = [
    `<div class="slide slide-ice">
      <span class="ice-word">Ice</span>
      <div class="ice-title">全冰去水系列</div>
      <div class="ice-sub">宝藏隐藏喝法<em>多口味随心选</em></div>
      <div class="ice-cups">
        <span class="mini-cup c1"><i></i><b class="straw"></b></span>
        <span class="mini-cup c2"><i></i><b class="straw"></b></span>
        <span class="mini-cup c3"><i></i><b class="straw"></b></span>
      </div>
      <span class="ice-cta">立即购买 ≋</span>
      <i class="ice-gal"></i>
    </div>`,
    `<div class="slide slide-cat">
      <div class="cat-title">鲜榨果莉冰茶<br>超大杯上市</div>
      <div class="cat-sub">真果真茶 · 大口畅爽</div>
      <span class="cat-emoji">🐱</span>
      <div class="cat-cups">
        <span class="mini-cup c3"><i></i></span>
        <span class="mini-cup c1"><i></i></span>
      </div>
      <span class="cat-cta">立即购买 ›</span>
      <i class="wave"></i>
    </div>`,
  ];
  $('#bannerSlides').innerHTML = slides.join('');
  $('#bannerDots').innerHTML = slides.map((_,i)=>`<span class="dot${i?'':' on'}"></span>`).join('');
  let cur = 0, timer;
  const go = i => {
    cur = (i+slides.length)%slides.length;
    $('#bannerSlides').style.transform = `translateX(-${cur*100}%)`;
    $$('#bannerDots .dot').forEach((d,k)=>d.classList.toggle('on', k===cur));
  };
  if(!FREEZE) timer = setInterval(()=>go(cur+1), 3600);
  // 触摸拖动
  let sx=null;
  const el = $('#homeBanner');
  el.addEventListener('touchstart', e=>{ sx=e.touches[0].clientX; clearInterval(timer); },{passive:true});
  el.addEventListener('touchend', e=>{
    if(sx===null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if(Math.abs(dx)>40) go(cur + (dx<0?1:-1));
    sx=null;
    if(!FREEZE) timer = setInterval(()=>go(cur+1), 3600);
  });
}
function renderRecomm(){
  const bg = ['#dfe9fb','#fbe9dd','#fdf3d9','#e3f2e5','#efe3f6'];
  $('#recommScroll').innerHTML = RECOMM.map((p,i)=>`
    <div class="recomm-card" data-prod="${p.id}">
      <div class="rc-img" style="background:linear-gradient(160deg,${bg[i%bg.length]},#fff 130%)">
        ${artSVG(p)}
        ${p.badge==='new'?'<span class="rc-tag">新品</span>':p.badge==='hot'?'<span class="rc-tag">爆款</span>':''}
      </div>
      <div class="rc-name">${esc(p.name)}</div>
      <div class="rc-meta"><span class="rc-price">¥${yuan(p.price)}<i>起</i></span><span style="font-size:10px;color:#9aa1b2">去点单 ›</span></div>
    </div>`).join('');
}

/* ============================================================
   菜单页渲染
   ============================================================ */
function renderChipCoupons(){
  const chips = [
    {t:'<b>9.9元</b> 商品兑换券', u:'使用'},
    {t:'<b>9.9元</b> 商品兑换券', u:'使用'},
    {t:'<b>4.9元</b> 新品尝鲜券', u:'使用'},
  ];
  $('#chipCoupons').innerHTML =
    chips.map(c=>`<span class="chip-coupon">${c.t}<u>${c.u}</u></span>`).join('') +
    `<span class="chip-coupon more">更多优惠 ›</span>`;
}
function renderSideCats(){
  const cats = visibleCats();
  $('#sideCats').innerHTML = cats.map((c,i)=>`
    <div class="side-cat${i===0?' on':''}" data-cat="${c.id}">
      <b>${esc(c.name)}</b>
      ${c.tags?`<span class="sc-tags">${c.tags.map((t,k)=>`<span class="sc-tag${k===0?' on':''}">${esc(t)}</span>`).join('')}</span>`:''}
    </div>`).join('');
}
function visibleCats(){
  if(S.mtab==='classic') return MENU_CATS;
  if(S.mtab==='weekly'){
    const cheap = MENU_ALL.filter(p=>p.price<=9.9);
    return [{ id:'weekly', name:'每周99起', note:'本周 9.9 元专区', products:cheap }];
  }
  const mine = (S.orders.length? S.orders[0].items.map(i=>MENU_ALL.find(p=>p.id===i.pid)).filter(Boolean) : [])
    .concat([MENU_ALL.find(p=>p.id==='xyms'), MENU_ALL.find(p=>p.id==='synt')]);
  const uniq = [...new Map(mine.map(p=>[p.id,p])).values()];
  return [{ id:'mine', name:'我的常点', note:'常点的好味道', products:uniq }];
}
function renderProdList(scrollTo){
  const cats = visibleCats();
  $('#prodWrap').innerHTML = cats.map(c=>`
    <div class="cat-block" data-block="${c.id}">
      <div class="cat-title"><b>${esc(c.name)}</b><span>${esc(c.note||'')}</span></div>
      ${c.products.map(p=>prodRow(p)).join('')}
    </div>`).join('');
  if(scrollTo){
    const block = $(`#prodWrap [data-block="${scrollTo}"]`);
    if(block) $('#prodWrap').scrollTop = Math.max(0, block.offsetTop - 8);
  }
}
function prodRow(p){
  return `<div class="prod-row" data-prod="${p.id}">
    ${thumbHTML(p)}
    <div class="prod-info">
      <div class="prod-name">${esc(p.name)}</div>
      ${p.chips.length?`<div class="prod-chips">${p.chips.map(c=>`<span class="prod-chip">${esc(c)}</span>`).join('')}</div>`:''}
      <div class="prod-price">
        <span class="pp-now"><i>¥</i>${yuan(p.price)}</span>
        ${p.est?`<span class="pp-est">预估到手¥${yuan(p.est)}</span>`:''}
        ${p.orig?`<span class="pp-orig">¥${yuan(p.orig)}</span>`:''}
      </div>
    </div>
    <span class="add-btn" data-add="${p.id}">＋</span>
  </div>`;
}
/* 侧栏滚动联动：程序滚动期间锁定 spy，点击分类直接落位高亮 */
let spyLock = false, listAnim = null;
function smoothScrollList(target){
  const wrap = $('#prodWrap');
  const top = Math.max(0, Math.min(target, wrap.scrollHeight - wrap.clientHeight));
  const from = wrap.scrollTop, dist = top - from;
  if(Math.abs(dist) < 2) return;
  spyLock = true;
  if(listAnim) cancelAnimationFrame(listAnim);
  const t0 = performance.now();
  const dur = Math.min(500, 240 + Math.abs(dist) * .22);   // 固定时长缓动，长距离不扫屏
  const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    wrap.scrollTop = from + dist * ease(p);
    if(p < 1) listAnim = requestAnimationFrame(step);
    else { listAnim = null; spyLock = false; }
  };
  listAnim = requestAnimationFrame(step);
}
function bindScrollSpy(){
  const wrap = $('#prodWrap');
  const cancelAnim = () => {
    if(listAnim){ cancelAnimationFrame(listAnim); listAnim = null; spyLock = false; }
  };
  wrap.addEventListener('wheel', cancelAnim, {passive:true});
  wrap.addEventListener('touchstart', cancelAnim, {passive:true});
  wrap.addEventListener('scroll', ()=>{
    if(spyLock) return;
    const blocks = $$('#prodWrap [data-block]');
    if(!blocks.length) return;
    let curId = blocks[0].dataset.block;
    for(const b of blocks){ if(b.offsetTop - wrap.scrollTop <= 40) curId = b.dataset.block; }
    if(wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 4) curId = blocks[blocks.length-1].dataset.block;
    $$('#sideCats .side-cat').forEach(c=>c.classList.toggle('on', c.dataset.cat===curId));
  }, {passive:true});
}

/* ---------- 购物车 ---------- */
function cartCount(){ return S.cart.reduce((n,i)=>n+i.qty,0); }
function cartTotal(){ return S.cart.reduce((n,i)=>n+i.price*i.qty,0); }
function cartSaved(){ return S.cart.reduce((n,i)=>n+(i.orig?(i.orig-i.price)*i.qty:0),0); }
function refreshBadges(fly){
  const n = cartCount();
  [['#cartCnt','#cartFab'],['#instCnt','#instFab']].forEach(([c,f])=>{
    const el=$(c); if(!el) return;
    el.textContent = n; el.classList.toggle('hide', !n);
    if(n && (fly||fly===0)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
}
function addToCart(entry, fromEl){
  const key = entry.pid + '|' + entry.spec;
  const found = S.cart.find(i=>i.key===key);
  if(found) found.qty += entry.qty;
  else S.cart.push({ key, ...entry });
  store.save(); refreshBadges(true);
  if(fromEl) flyToCart(fromEl);
  toast(`${esc(entry.name)} 已加入购物车`);
}
function flyToCart(fromEl){
  const layer = $('#flyLayer'), fab = ($('#tabbar').classList.contains('hide')?$('#instFab'):$('#cartFab'));
  if(!fab) return;
  const r1 = fromEl.getBoundingClientRect(), r2 = fab.getBoundingClientRect(),
        pr = $('#phone').getBoundingClientRect();
  const dx = (r2.left+r2.width/2) - (r1.left+r1.width/2);
  const dy = (r2.top+r2.height/2) - (r1.top+r1.height/2);
  const d = document.createElement('div');
  d.className = 'fly-dot';
  d.style.cssText = `left:${r1.left-pr.left+r1.width/2-11}px;top:${r1.top-pr.top+r1.height/2-11}px;background:radial-gradient(circle at 34% 30%,#ff9a66,#fa5a1e)`;
  layer.appendChild(d);
  requestAnimationFrame(()=>{
    d.style.transition = 'transform .55s cubic-bezier(.4,-.2,.6,1), opacity .55s';
    d.style.transform = `translate(${dx}px,${dy}px) scale(.25)`;
    d.style.opacity = '.4';
  });
  setTimeout(()=>d.remove(), 600);
}

/* ---------- 规格弹窗 ---------- */
const SPEC = {
  temp:   ['不另加冰','少冰','冰','热'],
  sugar:  ['不另加糖','微甜','少少甜','标准甜'],
  milk:   ['厚牛乳','燕麦奶','脱脂牛乳'],
};
function openSpec(p){
  const milkGroup = /拿铁|澳白|Dirty|玛奇朵|卡布奇诺/.test(p.name);
  const sel = { temp:2, sugar:/美式|浓缩/.test(p.name)?0:2, milk:0, qty:1 };
  const price = () => p.price + (milkGroup && sel.milk===1 ? 3 : 0);
  const chosen = () => ['大杯', SPEC.temp[sel.temp], SPEC.sugar[sel.sugar]].concat(milkGroup?[SPEC.milk[sel.milk]]:[]).join('/');
  const render = () => {
    $('#sheet-spec').innerHTML = `
      <span class="close-x" data-close style="position:absolute;right:14px;top:16px">✕</span>
      <div class="spec-head">
        ${thumbHTML(p)}
        <div><div class="sp-name">${esc(p.name)}</div>
          <div class="sp-desc">${esc(p.chips[0]||'新鲜现做 · 品质咖啡')}</div>
          <div class="sp-sales">已售 ${(Math.abs(hash(p.id))%900+100)}×万杯</div></div>
      </div>
      <div class="spec-groups">
        <div class="sg-title">温度</div>
        <div class="sg-opts">${SPEC.temp.map((t,i)=>`<span class="opt${i===sel.temp?' on':''}" data-g="temp" data-i="${i}">${t}</span>`).join('')}</div>
        <div class="sg-title">糖度</div>
        <div class="sg-opts">${SPEC.sugar.map((t,i)=>`<span class="opt${i===sel.sugar?' on':''}" data-g="sugar" data-i="${i}">${t}</span>`).join('')}</div>
        ${milkGroup?`<div class="sg-title">奶型 <i>换购</i></div>
        <div class="sg-opts">${SPEC.milk.map((t,i)=>`<span class="opt${i===sel.milk?' on':''}${i===1?' sur':''}" data-g="milk" data-i="${i}">${t}${i===1?'+¥3':''}</span>`).join('')}</div>`:''}
      </div>
      <div class="spec-foot">
        <div class="sf-left">
          <div class="sf-price"><i>¥</i>${yuan(price())}</div>
          <div class="sf-chosen">已选：${chosen()}</div>
        </div>
        <div class="stepper">
          <span class="st-btn${sel.qty===1?' dis':''}" data-q="-1">−</span>
          <span class="st-num">${sel.qty}</span>
          <span class="st-btn" data-q="1">＋</span>
        </div>
        <button class="btn-add" id="specAdd">加入购物车</button>
      </div>`;
  };
  render(); openSheet('#sheet-spec');
  $('#sheet-spec').onclick = e => {
    const opt = e.target.closest('.opt');
    if(opt){ sel[opt.dataset.g] = +opt.dataset.i; render(); return; }
    const q = e.target.closest('[data-q]');
    if(q){ sel.qty = Math.max(1, sel.qty + +q.dataset.q); render(); return; }
    if(e.target.closest('#specAdd')){
      addToCart({ pid:p.id, name:p.name, spec:chosen(), price:price(), orig:p.orig, qty:sel.qty,
                  art:p.art, artType:p.artType, bg:p.art.bg, bg2:p.art.bg2 }, $('#specAdd'));
      closeSheets();
    }
  };
}
function hash(s){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return h; }

/* ---------- 购物车弹窗 ---------- */
function openCart(){
  const body = S.cart.length ? `
    <div class="cart-clear"><span data-clear>🗑 清空购物车</span></div>
    <div class="cart-list">${S.cart.map((i,k)=>`
      <div class="cart-item">
        <span class="ci-thumb" style="background:linear-gradient(150deg,${i.bg||'#eef2f8'},${i.bg2||'#dfe6f2'})">${i.artType==='box'?boxSVG(i.art):cupSVG(i.art)}</span>
        <div class="ci-mid">
          <div class="ci-name">${esc(i.name)}</div>
          <div class="ci-spec">${esc(i.spec)}</div>
          <div class="ci-price"><i>¥</i>${yuan(i.price)}</div>
        </div>
        <div class="stepper">
          <span class="st-btn${i.qty===1?' dis':''}" data-ci="${k}" data-q="-1">−</span>
          <span class="st-num">${i.qty}</span>
          <span class="st-btn" data-ci="${k}" data-q="1">＋</span>
        </div>
      </div>`).join('')}
    </div>` : `<div class="cart-empty"><span class="big">🛒</span>购物车还是空的<br>快去挑一杯喜欢的咖啡吧</div>`;
  $('#sheet-cart').innerHTML = `
    <div class="sheet-head"><b>购物车<span class="sh-sub">${cartCount()} 件</span></b><span class="close-x" data-close>✕</span></div>
    <div class="sheet-body">${body}</div>
    <div class="cart-foot">
      <div class="cf-total">
        <div class="t1">合计<b><i>¥</i>${yuan(cartTotal())}</b></div>
        <div class="t2">${cartSaved()>0?'已省 ¥'+yuan(cartSaved()):'下单立享商品直减'}</div>
      </div>
      <button class="btn-settle${S.cart.length?'':' dis'}" id="btnSettle">去结算</button>
    </div>`;
  openSheet('#sheet-cart');
  $('#sheet-cart').onclick = e => {
    if(e.target.closest('[data-close]')) return closeSheets();
    if(e.target.closest('[data-clear]')){ S.cart=[]; store.save(); refreshBadges(); openCart(); return; }
    const q = e.target.closest('[data-q][data-ci]');
    if(q){
      const it = S.cart[+q.dataset.ci];
      it.qty += +q.dataset.q;
      if(it.qty<=0) S.cart.splice(+q.dataset.ci,1);
      store.save(); refreshBadges(); openCart(); return;
    }
    if(e.target.closest('#btnSettle')){ closeSheets(); openOrder(); }
  };
}

/* ============================================================
   即享
   ============================================================ */
function renderInstant(){
  $('#instCats').innerHTML = INSTANT_CATS.map(c=>`
    <div class="inst-cat${c.id===S.instCat?' on':''}" data-icat="${c.id}">
      ${c.tag?`<span class="ic-tag${c.tag==='t2'?' t2':''}">${c.tag==='new'?'新品':'特惠月'}</span>`:''}
      <span class="ic-img">${c.emoji}</span><b>${esc(c.name)}</b>
    </div>`).join('');
  const list = INSTANT_PRODUCTS.filter(p=>p.cat===S.instCat);
  $('#instGrid').innerHTML = list.map(p=>`
    <div class="inst-card">
      <div class="inst-img" style="background:linear-gradient(160deg,${p.art.bg},${p.art.bg2})">
        ${artSVG(p)}
        ${p.badge==='new'?'<span class="rc-tag" style="position:absolute;left:8px;top:8px">新品</span>':p.badge==='hot'?'<span class="rc-tag" style="position:absolute;left:8px;top:8px">热卖</span>':''}
      </div>
      <div class="inst-body">
        <div class="inst-name">${esc(p.name)}</div>
        <div class="inst-tags">
          ${p.orig?'<span class="inst-tag">预估立减</span>':''}
          ${(p.id==='i1'||p.id==='i5')?'<span class="inst-tag gift">赠品</span>':''}
        </div>
        <div class="inst-price">
          <span class="ip-now"><i>¥</i>${yuan(p.price)}</span>
          ${p.orig?`<span class="ip-est">¥${yuan(p.orig)}</span>`:''}
          <span class="inst-buy" data-iadd="${p.id}">＋</span>
        </div>
      </div>
    </div>`).join('');
}

/* ============================================================
   会员卡（瑞王卡）
   ============================================================ */
function renderCardPage(){
  $('#csRow').innerHTML = CS_CHIPS.map((v,i)=>`
    <span class="cs-chip${S['cs'+i]?' got':''}" data-cs="${i}">
      <span class="v"><i>¥</i>${yuan(v)}</span><span class="n">${S['cs'+i]?'已领取':'立减券'}</span>
    </span>`).join('');
  const blocks = [
    { badge:'连包月 ¥9.9',  note:'预计可省 ¥40/月<br>限首次开通', price:9.9,  orig:15.9, tiles:['jdlt','synt','cms'] },
    { badge:'连包月 ¥19.9', note:'预计可省 ¥68/月<br>全场通用',   price:19.9, orig:25.9, tiles:['yrzlt','ghlt','xhlt'] },
  ];
  $('#bananaWrap').innerHTML = blocks.map((b,bi)=>`
    <div class="banana-block">
      <div class="bn-head">
        <span class="bn-badge">${b.badge}</span>
        <b>月卡权益</b>
        <span>${b.note}</span>
      </div>
      <div class="bn-price-row"><b><i>¥</i>${yuan(b.price)}</b><span>¥${yuan(b.orig)}</span><em>月卡 ¥${yuan(b.orig)}/月 · 自动续费可取消</em></div>
      <div class="bn-grid">
        ${b.tiles.map(id=>{ const p=MENU_ALL.find(x=>x.id===id); return `
          <div class="bn-tile" data-prod="${p.id}">
            <div class="bt-img">${artSVG(p)}</div>
            <b>${esc(p.name)}</b>
            <div class="bt-price"><i>¥</i>${yuan(p.price)}</div>
            <span class="bt-buy" data-bnbuy>开通</span>
          </div>`;}).join('')}
      </div>
    </div>`).join('');
}

/* ============================================================
   我的
   ============================================================ */
function renderMine(){
  const last = S.orders[0];
  $('#orderPanelBody').innerHTML = last ? `
    <span class="op-thumb">${last.items[0].artType==='box'?boxSVG(last.items[0].art):cupSVG(last.items[0].art)}</span>
    <div class="op-info"><b>${esc(last.items[0].name.replace(/（.*/,''))}</b><span>${last.items.length>1?`等 ${last.items.length} 件商品`:'再来一杯？'}</span></div>
    <span class="again-btn" data-again>再来一单</span>` : `
    <span class="op-thumb">☕</span>
    <div class="op-info"><b>小黄油美式</b><span>喝过的都说好</span></div>
    <span class="again-btn" data-again>再来一单</span>`;
}

/* ============================================================
   确认订单
   ============================================================ */
function etaTime(mins){
  const d = new Date(Date.now()+mins*60000);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function calcOrder(){
  const total = cartTotal();
  const saved = cartSaved() || +(cartTotal()*0.65).toFixed(1);
  const pay = total - saved + (S.rwkSel?9.9:0);
  return { total, saved, pay };
}
function openOrder(){
  if(!S.cart.length){ toast('购物车还是空的，先去点一杯吧'); S.stack=S.stack.filter(x=>x!=='page-order'); return; }
  S.rwkSel = S.rwkSel || false;
  pushPage('page-order'); renderOrder();
}
function renderOrder(){
  const st = storeById(S.orderStoreId);
  const addr = addrById(S.addrId);
  const { total, saved, pay } = calcOrder();
  const eta = S.orderType==='pickup' ? etaTime(4) : etaTime(25);
  const body = $('#page-order .order-scroll');
  body.innerHTML = `
    <div class="ot-tabs">
      <span class="ot-tab${S.orderType==='pickup'?' on':''}" data-ot="pickup">自提</span>
      <span class="ot-tab${S.orderType==='delivery'?' on':''}" data-ot="delivery">外送</span>
    </div>
    <div class="ot-body">
      ${S.orderType==='pickup' ? `
        <i class="map-bg"></i>
        <div class="store-line" data-store>
          <span class="buy-tag">买过</span><b>${esc(st.name)}</b>
          <svg class="chev" viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="store-addr">${esc(st.addr)}</div>
        <span class="near-chip" data-store>距您<b>${st.dist}</b>，附近有多家门店</span>
        <div class="pickup-time">预计<b>${eta}</b>可取餐<span class="swap">现在下单取餐快</span></div>
      ` : addr ? `
        <div class="deliver-addr" data-addr>
          <div class="addr-text" style="font-size:15px">${esc(addr.text)}</div>
          <div class="da-tags">
            ${addr.tag?`<span class="dtag">${esc(addr.tag)}</span>`:''}
            ${addr.def?'<span class="dtag blue">默认地址</span>':''}
          </div>
          <div class="da-meta">${esc(addr.phone)} ${esc(addr.name)}</div>
          <div class="da-eta">预计<b>${eta}</b>送达 · 由 ${esc(st.name)} 配送</div>
        </div>
        <i class="map-bg"></i>
      ` : `
        <div class="deliver-addr" data-addr>
          <div class="addr-text" style="color:#c2c7d3">请选择收货地址</div>
        </div>`
      }
    </div>
    <div class="order-item-card">
      <span class="oi-thumb" style="background:linear-gradient(150deg,${S.cart[0].bg||'#eef2f8'},${S.cart[0].bg2||'#dfe6f2'})">
        ${S.cart[0].artType==='box'?boxSVG(S.cart[0].art):cupSVG(S.cart[0].art)}
        <i class="oi-tag">冰饮</i>
      </span>
      <div class="oi-mid">
        <div class="oi-name">${esc(S.cart[0].name)}${S.cart.length>1?` 等 ${cartCount()} 件`:''}</div>
        <div class="oi-spec">${esc(S.cart[0].spec)}${S.cart.length>1?' · 多件商品':''}</div>
        <span class="oi-disc">商品直减</span>
      </div>
      <div class="oi-right">
        <div class="oi-price"><i>¥</i>${yuan(total)}</div>
        ${saved?`<div class="oi-orig">¥${yuan(total+saved)}</div>`:''}
        <div class="oi-qty">x${cartCount()}</div>
      </div>
    </div>
    <div class="upsell-card">
      <div class="up-head"><b>超值换购</b><span>近期有202人换购</span></div>
      <div class="up-scroll">
        ${UPSELL.map(u=>`
          <div class="up-card ${u.cls}">
            <div class="up-img">${u.emoji}</div>
            <div class="up-name">${esc(u.name)}</div>
            ${u.sub?`<div class="up-sub">${u.sub}</div>`:''}
            <div class="up-price"><b><i>¥</i>${yuan(u.price)}</b><s>¥${yuan(u.orig)}</s></div>
            <span class="up-add" data-up="${u.id}">＋</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="disc-card">
      <div class="disc-row"><span class="dr-label">瑞幸优惠</span><span class="dr-note">已为您选择最佳优惠</span><span class="dr-val">- ¥ ${yuan(saved)}</span></div>
      <div class="disc-row note"><span class="dr-label">商品直减</span><span class="dr-val">- ¥ ${yuan(saved)}</span></div>
      <div class="disc-row"><span class="dr-label">优惠券</span><span class="dr-view" data-coupons>查看</span></div>
    </div>
    <div class="rwk-banner">
      <div class="rwk-left" data-rwk>
        <svg class="rwk-hand" viewBox="0 0 64 56"><rect x="10" y="18" width="34" height="24" rx="5" fill="#f5efe2" transform="rotate(-12 27 30)"/><rect x="14" y="22" width="26" height="16" rx="3" fill="#1c2d6e" transform="rotate(-12 27 30)"/><text x="20" y="33" font-size="7" fill="#f5efe2" transform="rotate(-12 27 30)">瑞王卡</text></svg>
        <div class="rwk-title">瑞王卡 · 当单可用 最快1单回本！<i class="i">i</i></div>
        <div class="rwk-chips">
          <span class="rwk-chip"><span class="v"><i>¥</i>9.9</span><span class="n">大杯通用</span><i class="sup">2张</i></span>
          <span class="rwk-chip"><span class="v"><i>¥</i>9.9<i>起</i></span><span class="n">爆品任选</span><i class="sup">30次</i></span>
        </div>
      </div>
      <div class="rwk-right${S.rwkSel?' sel':''}" data-rwk>
        <i class="mem-tag">会员卡</i>
        <span class="mem-price"><i>¥</i>9.9</span>
        <span class="mem-orig">¥19.9</span>
        <span class="radio"></span>
      </div>
    </div>`;
  $('#orderBar').innerHTML = `
    <div class="ob-left">
      <div class="ob-price"><i>¥</i>${yuan(pay)}<em>已优惠¥${yuan(saved)}</em></div>
      <div class="ob-note">现在下单取餐快</div>
    </div>
    <button class="ob-submit" id="obSubmit">提交订单</button>`;
  $('#page-order .order-scroll').scrollTop = 0;
}

/* ---------- 提交订单 ---------- */
function submitOrder(){
  const { total, saved, pay } = calcOrder();
  const st = storeById(S.orderStoreId);
  const addr = addrById(S.addrId);
  const order = {
    id:'o'+Date.now(), no:'NO.'+String(Date.now()).slice(-8),
    code:String(Math.abs(hash('c'+Date.now()))%9000+1000),
    time:new Date().toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}),
    type:S.orderType, place:S.orderType==='pickup'?st.name:addr?.text||'',
    eta:etaTime(S.orderType==='pickup'?4:25),
    items:S.cart.map(i=>({pid:i.pid,name:i.name,spec:i.spec,price:i.price,qty:i.qty,art:i.art,artType:i.artType,bg:i.bg,bg2:i.bg2})),
    total:pay, saved,
  };
  S.orders.unshift(order);
  S.cart=[]; S.rwkSel=false;
  store.save(); refreshBadges(); renderMine();
  const it0 = order.items[0];
  $('#sheet-success').innerHTML = `
    <div class="success-body">
      <span class="suc-check"><svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <h2>订单提交成功</h2>
      <p class="suc-sub">${order.type==='pickup'?'请前往 '+esc(order.place)+' 取餐':'骑手将送至您的收货地址'}<br>${order.no} · 实付 ¥${yuan(order.total)}</p>
      <div class="suc-code"><span class="t">${order.type==='pickup'?'取餐码':'收货码'}</span><div class="v">${order.code}</div></div>
      <div class="suc-meta">
        <div><b>${order.eta}</b><span>${order.type==='pickup'?'预计可取餐':'预计送达'}</span></div>
        <div><b>${esc(it0.name.replace(/（.*/,''))}</b><span>${order.items.length>1?'等多件':esc(it0.spec)}</span></div>
      </div>
      <div class="suc-btns"><span class="s1" data-sback>完成</span><span class="s2" data-smine>查看订单</span></div>
    </div>`;
  openSheet('#sheet-success');
}

/* ============================================================
   配送方式（地址簿 / 门店）
   ============================================================ */
let addrSeg = 'delivery';
function openAddress(fromOrder){
  S.fromAddress = !!fromOrder;
  addrSeg = S.orderType==='delivery' ? 'delivery' : 'pickup';
  pushPage('page-address'); renderAddress();
}
function renderAddress(){
  $$('#page-address .seg-btn').forEach(b=>b.classList.toggle('on', b.dataset.aseg===addrSeg));
  const addBtn = $('#addrAddBtn');
  addBtn.textContent = addrSeg==='delivery' ? '＋ 新增收货地址' : '＋ 新增门店';
  addBtn.dataset.mode = addrSeg;
  if(addrSeg==='delivery'){
    $('#addrCard').innerHTML = `<div class="ac-title">我的收货地址</div>` + S.addresses.map(a=>`
      <div class="addr-item${a.id===S.addrId?' sel':''}" data-addr-id="${a.id}">
        <div class="ai-body">
          <div class="addr-text">${esc(a.text)}</div>
          <div class="addr-meta">
            ${a.tag?`<span class="atag">${esc(a.tag)}</span>`:''}
            <span>${esc(a.phone)} ${esc(a.name)}</span>
            ${a.def?'<span class="atag-def">默认地址</span>':''}
          </div>
        </div>
        <span class="addr-check"><i></i></span>
        <span class="edit-ico" data-edit="${a.id}"><svg viewBox="0 0 18 18"><path d="M11.5 3.2l3.3 3.3-8 8L3 15.2l.7-3.8zM13.2 1.5a1.6 1.6 0 0 1 2.3 0l1 1a1.6 1.6 0 0 1 0 2.3l-1.2 1.2-3.3-3.3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg></span>
      </div>`).join('');
  } else {
    $('#addrCard').innerHTML = `<div class="ac-title">附近门店</div>` + STORES.map(s=>`
      <div class="store-item${s.id===S.orderStoreId?' sel':''}" data-store-id="${s.id}">
        <div class="si-body">
          <div class="si-name">${s.bought?'<span class="buy-tag">买过</span>':''}${esc(s.name)}</div>
          <div class="si-addr">${esc(s.addr)}</div>
          <div class="si-meta">距您 <b>${s.dist}</b> · 营业中 · 可自提</div>
        </div>
        <span class="addr-check"><i></i></span>
      </div>`).join('');
  }
}

/* ============================================================
   添加 / 编辑地址
   ============================================================ */
let aeState = { name:'', gender:'女士', phone:'', addr:'', door:'', tag:'', def:false };
function openAddrEdit(id){
  S.editAddrId = id || null;
  const a = id ? addrById(id) : null;
  aeState = a
    ? { name:a.rawName||a.name.split(' ')[0], gender:/女士/.test(a.name)?'女士':'先生', phone:a.rawPhone||a.phone.replace(/\*/g,'5'), addr:a.text, door:a.door||'', tag:a.tag||'', def:!!a.def }
    : { name:'', gender:'女士', phone:'', addr:'', door:'', tag:'', def:false };
  $('#aeTitle').textContent = a ? '编辑地址' : '添加地址';
  $('#fName').value = aeState.name;
  $('#fPhone').value = aeState.phone;
  $('#fDoor').value = aeState.door;
  $('#fAddr').textContent = aeState.addr || '选择收货地址';
  $('#fAddr').classList.toggle('has', !!aeState.addr);
  $('#fGender').querySelectorAll('.radio-item').forEach(r=>r.classList.toggle('on', r.dataset.v===aeState.gender));
  $('#fTags').querySelectorAll('.chip').forEach(c=>c.classList.toggle('on', c.dataset.v===aeState.tag));
  $('#fDefault').classList.toggle('on', aeState.def);
  $('#aeDel').classList.toggle('hide', !a);
  validateForm();
  pushPage('page-address-edit');
}
function validateForm(){
  const ok = $('#fName').value.trim() && $('#fPhone').value.trim().length===11 && aeState.addr;
  $('#aeSave').classList.toggle('disabled', !ok);
}
function saveAddress(){
  if($('#aeSave').classList.contains('disabled')) return;
  const phone = $('#fPhone').value.trim();
  const masked = phone.slice(0,3)+'****'+phone.slice(7);
  const name = $('#fName').value.trim() + ' ' + aeState.gender;
  if(S.editAddrId){
    const a = addrById(S.editAddrId);
    Object.assign(a, { name, rawName:$('#fName').value.trim(), rawPhone:phone, phone:masked,
                       text:aeState.addr, door:$('#fDoor').value.trim(), tag:aeState.tag, def:aeState.def });
  } else {
    const a = { id:'a'+Date.now(), name, rawName:$('#fName').value.trim(), rawPhone:phone, phone:masked,
                text:aeState.addr, door:$('#fDoor').value.trim(), tag:aeState.tag, def:aeState.def };
    S.addresses.push(a);
    S.addrId = a.id;
  }
  if(aeState.def){
    const targetId = S.editAddrId || a.id;
    S.addresses.forEach(x=>{ x.def = (x.id===targetId); });
  }
  store.save();
  toast('地址保存成功');
  popPage();
  if(S.stack.includes('page-address')) renderAddress();
}
function deleteAddress(){
  S.addresses = S.addresses.filter(a=>a.id!==S.editAddrId);
  if(S.addrId===S.editAddrId) S.addrId = (S.addresses.find(a=>a.def)||S.addresses[0])?.id || null;
  store.save(); toast('地址已删除');
  popPage();
  if(S.stack.includes('page-address')) renderAddress();
}
function openAddrPick(){
  const pick = document.createElement('div');
  pick.className = 'addr-pick'; pick.id = 'addrPick';
  pick.innerHTML = `
    <div class="ap-head"><b>选择收货地址</b><span class="ap-close" data-apc>取消</span></div>
    <div class="ap-map"><span>📍 地图选点（演示）</span></div>
    <div class="ap-list">
      ${PICK_ADDRS.map(t=>`<div class="ap-item" data-api="${esc(t)}">${esc(t)}<small>福建省厦门市思明区</small></div>`).join('')}
    </div>`;
  $('#page-address-edit').appendChild(pick);
  requestAnimationFrame(()=>pick.classList.add('open'));
  pick.onclick = e => {
    if(e.target.closest('[data-apc]')){ pick.classList.remove('open'); setTimeout(()=>pick.remove(),320); return; }
    const it = e.target.closest('[data-api]');
    if(it){
      aeState.addr = it.dataset.api;
      $('#fAddr').textContent = aeState.addr; $('#fAddr').classList.add('has');
      pick.classList.remove('open'); setTimeout(()=>pick.remove(),320); validateForm();
    }
  };
}

/* ============================================================
   门店列表
   ============================================================ */
let storeCtx = 'menu';
function openStores(ctx){
  storeCtx = ctx;
  pushPage('page-store'); renderStores();
}
function renderStores(){
  const selId = storeCtx==='order' ? S.orderStoreId : S.menuStoreId;
  $('#storeList').innerHTML = `<div class="store-big-card">` + STORES.map(s=>`
    <div class="store-item${s.id===selId?' sel':''}" data-pick-store="${s.id}">
      <div class="si-body">
        <div class="si-name">${s.bought?'<span class="buy-tag">买过</span>':''}${esc(s.name)}</div>
        <div class="si-addr">${esc(s.addr)}</div>
        <div class="si-meta">距您 <b>${s.dist}</b> · 营业中 · ${s.dist==='0m'?'现已爆单':'正常接单'}</div>
      </div>
      <span class="addr-check"><i></i></span>
    </div>`).join('') + `</div>`;
}

/* ============================================================
   搜索
   ============================================================ */
function openSearch(){
  pushPage('page-search');
  $('#searchInput').value=''; renderHot(''); renderResults('');
  setTimeout(()=>$('#searchInput').focus(), 350);
}
function renderHot(q){
  $('#hotBlock').classList.toggle('hide', !!q);
  $('.hot-chips').innerHTML = HOT_SEARCH.map((t,i)=>`<span class="hot-chip${i<2?' hot':''}" data-hot="${esc(t)}">${esc(t)}</span>`).join('');
}
function renderResults(q){
  const box = $('#searchResults');
  if(!q){ box.innerHTML=''; return; }
  const list = MENU_ALL.filter(p=>p.name.includes(q) || (q.match(/^\d+(\.\d+)?$/)&&p.price<=+q));
  box.innerHTML = list.length
    ? `<div class="sr-block-title">相关商品 · ${list.length} 个结果</div>` + list.map(p=>`
      <div class="sr-item" data-prod="${p.id}">
        ${thumbHTML(p)}
        <div><div class="sr-name">${esc(p.name)}</div><div class="sr-meta">${esc(p.chips[0]||'人气商品')}</div></div>
        <span class="sr-price"><i>¥</i>${yuan(p.price)}</span>
      </div>`).join('')
    : `<div class="sr-empty">没有找到「${esc(q)}」相关的商品</div>`;
}

/* ============================================================
   手势抽奖
   ============================================================ */
function initLucky(){
  const cv = $('#lkCanvas'), ctx = cv.getContext('2d');
  let drawing=false, count=0, prizes=[
    ['🎉 恭喜获得 9.9元 大杯通用券','已放入卡券包，下单立减'],
    ['🎊 抽中「喜福双至」葫芦杯 x1','限定周边 · 随单赠送'],
    ['🍀 恭喜获得 4.9元 新品尝鲜券','已放入卡券包，新品可用'],
    ['🙏 手气差一点点','再来一次，好运用不完'],
  ];
  const pos = e => { const r=cv.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; return [(t.clientX-r.left)*(cv.width/r.width),(t.clientY-r.top)*(cv.height/r.height)]; };
  const start = e=>{ drawing=true; count=0; ctx.clearRect(0,0,cv.width,cv.height); $('#lkPrize').classList.add('hide'); ctx.strokeStyle='#4a5ed0'; ctx.lineWidth=7; ctx.lineCap='round'; ctx.shadowColor='#8fa4ff'; ctx.shadowBlur=14; };
  const move = e=>{ if(!drawing) return; e.preventDefault(); const [x,y]=pos(e); ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); count++; };
  const end = ()=>{
    if(!drawing) return; drawing=false;
    if(count<6){ toast('画长一点，让幸运看见 ✍️'); return; }
    const p = prizes[Math.floor(Math.random()*prizes.length)];
    const box = $('#lkPrize');
    box.innerHTML = `<b>${p[0]}</b><span>${p[1]}</span><span class="lk-again" data-lk-again>再抽一次</span>`;
    box.classList.remove('hide');
  };
  cv.addEventListener('touchstart',e=>{start(e);},{passive:false});
  cv.addEventListener('touchmove',move,{passive:false});
  cv.addEventListener('touchend',end);
  cv.addEventListener('mousedown',start);
  cv.addEventListener('mousemove',move);
  window.addEventListener('mouseup',end);
  $('#lkClose').onclick = ()=>$('#luckySheet').classList.remove('open');
  $('#luckySheet').addEventListener('click',e=>{
    if(e.target.id==='luckySheet') $('#luckySheet').classList.remove('open');
    if(e.target.closest('[data-lk-again]')) start(e);
  });
}

/* ============================================================
   通用弹层内容
   ============================================================ */
function openGeneric(title, html){
  $('#sheet-generic').innerHTML = `
    <div class="sheet-head"><b>${title}</b><span class="close-x" data-close>✕</span></div>
    <div class="sheet-body">${html}</div>`;
  openSheet('#sheet-generic');
}
function openCoupons(){
  $('#sheet-coupons').innerHTML = `
    <div class="sheet-head"><b>咖啡卡券<span class="sh-sub">${COUPONS.length} 张可用</span></b><span class="close-x" data-close>✕</span></div>
    <div class="sheet-body">
      ${COUPONS.map((c,i)=>`
        <div class="coupon-item">
          <div class="cp-left ${c.color}"><span class="v"><i>¥</i>${yuan(c.v)}</span><span class="n">${esc(c.n)}</span></div>
          <div class="cp-mid"><b>${esc(c.n)}</b><span>${esc(c.cond)}</span><em>${esc(c.valid)}</em></div>
          <span class="cp-use${S['cp'+i]?' got':''}" data-cp="${i}">${S['cp'+i]?'已使用':'使用'}</span>
        </div>`).join('')}
      <p style="font-size:10.5px;color:#c2c7d3;text-align:center;padding:6px 0">· 演示数据 · 券的使用规则以页面说明为准 ·</p>
    </div>`;
  openSheet('#sheet-coupons');
}
const ACT_SHEETS = {
  gift: ()=>openGeneric('🎁 礼品卡', `
    <div class="gen-card" style="background:linear-gradient(130deg,#2c3f96,#16245c);color:#fff">
      <h4 style="color:#fff">luckin 礼品卡</h4><p style="color:rgba(255,255,255,.75)">把咖啡的香气送给重要的人 · 支持自定义贺卡与定时送达</p>
    </div>
    <div class="gen-row"><span class="gr-ico">☕</span><div class="gr-txt"><b>送 TA 一杯咖啡</b><span>选择饮品生成gift卡片</span></div><span class="gr-arrow">›</span></div>
    <div class="gen-row"><span class="gr-ico">💳</span><div class="gr-txt"><b>礼品卡充值</b><span>¥50 / ¥100 / ¥200 面值</span></div><span class="gr-arrow">›</span></div>`),
  welfare: ()=>openGeneric('🧧 福利中心', `
    <div class="gen-card"><h4>今日任务</h4>
      <div class="gen-row"><span class="gr-ico">📅</span><div class="gr-txt"><b>每日签到</b><span>连续签到 3 天得 9.9 元券</span></div><span class="cp-use" data-wf="签到成功 +5 积分 ✅">去签到</span></div>
      <div class="gen-row"><span class="gr-ico">🔥</span><div class="gr-txt"><b>浏览 10 秒新品</b><span>得 20 积分</span></div><span class="cp-use" data-wf="任务完成 +20 积分 ✅">去完成</span></div>
      <div class="gen-row"><span class="gr-ico">👥</span><div class="gr-txt"><b>邀请 1 位好友下单</b><span>得免费咖啡券</span></div><span class="cp-use" data-wf="邀请链接已复制 ✅">邀请</span></div>
    </div>`),
  mole: ()=>openGeneric('🦫 小鼹鼠正版联名', `
    <div class="gen-card"><h4>限定周边上新</h4><p>本次联名带来猫爪饼干、桌面杯与帆布袋三款周边，可爱值拉满。下单任意饮品可享联名价。</p></div>
    <div class="gen-row"><span class="gr-ico">🍪</span><div class="gr-txt"><b>黑可可猫爪造型饼干</b><span>¥5.9 <s style="color:#c2c7d3">¥9</s></span></div><span class="cp-use" data-wf="已加入购物车（演示）">购买</span></div>
    <div class="gen-row"><span class="gr-ico">🥤</span><div class="gr-txt"><b>联名冷萃杯</b><span>¥39.9 · 限量发售</span></div><span class="cp-use" data-wf="已加入购物车（演示）">购买</span></div>`),
  bundle: ()=>openGeneric('🥤 39.9元10杯咖啡', `
    <div class="gen-card"><h4>超值量贩套餐</h4><p>39.9 元得 10 杯饮品兑换权益，加赠宠物冷萃玻璃杯 1 个，30 天内有效。</p></div>
    <div class="gen-row"><span class="gr-ico">🥃</span><div class="gr-txt"><b>10 杯饮品兑换包</b><span>含赠品 · 玻璃杯 x1</span></div><span class="cp-use" data-wf="演示环境：下单通道开放中">立即抢购</span></div>`),
  newbean: ()=>openGeneric('🫘 醇粹系列黑咖啡', `
    <div class="gen-card"><h4>新品首发</h4><p>0 蔗糖 0 奶精，冷热水皆可溶，醇厚度升级 30%。开学季囤货正当时。</p></div>
    <div class="gen-row"><span class="gr-ico">🫘</span><div class="gr-txt"><b>醇粹黑咖啡 30 条装</b><span>¥49 <s style="color:#c2c7d3">¥59</s></span></div><span class="cp-use" data-wf="已加入购物车（演示）">购买</span></div>`),
};

/* ============================================================
   事件绑定
   ============================================================ */
function bindEvents(){
  /* ---- 底部导航 ---- */
  $('#tabbar').addEventListener('click', e=>{
    const t = e.target.closest('.tab-item');
    if(t) goTab(t.dataset.tab);
  });

  /* ---- 全局点击（委托） ---- */
  document.addEventListener('click', e=>{
    const back = e.target.closest('[data-back]');
    if(back){ popPage(); return; }
    const go = e.target.closest('[data-go]');
    if(go){
      const t = go.dataset.go;
      if(t==='menu'){ S.menuType = go.dataset.type||'pickup'; goTab('menu'); syncMenuType(); }
      else if(t==='instant') goTab('instant');
      else if(t==='card') goTab('card');
      else if(t==='mine') goTab('mine');
      return;
    }
    const act = e.target.closest('[data-act]');
    if(act){
      const a = act.dataset.act;
      if(ACT_SHEETS[a]) return ACT_SHEETS[a]();
      switch(a){
        case 'coupons': openCoupons(); return;
        case 'lucky': $('#luckySheet').classList.add('open'); return;
        case 'orders': return openOrdersSheet();
        case 'again': return againOrder();
        case 'cardmore': return toast('瑞王卡 · 更多功能开放中');
        case 'pindan': return toast('拼单功能演示：把链接分享给好友一起点吧');
        case 'setting': return toast('账号与设置（演示）');
        case 'profile': return toast('个人主页（演示）');
        case 'balance': return toast('咖啡钱包（演示）');
        case 'luckycard': return toast('好运卡 · 敬请期待');
        case 'giftpanel': return ACT_SHEETS.gift();
        case 'service': return toast('在线客服（演示）');
        case 'invoice': return toast('发票管理（演示）');
        case 'join': return toast('招商加盟（演示）');
        case 'rent': return toast('租赁合作（演示）');
        case 'exchange': return openCoupons();
        case 'taste': return toast('口味定制：可在点单时调整温度/糖度/奶型');
        case 'allfunc': return toast('更多功能开放中');
        case 'invite': return toast('邀请链接已复制，快发给好友吧 ✅');
        case 'mind': return toast('mini.a.day 联名周边（演示）');
        case 'medal': return toast('勋章墙：已点亮 6 枚（演示）');
        case 'claimExch': {
          act.classList.add('got'); act.textContent='已领取'; return toast('饮品兑换券领取成功 ✅');
        }
      }
    }
    /* 菜单页 */
    const tt = e.target.closest('.type-tab');
    if(tt){ S.menuType = tt.dataset.type; syncMenuType(); return; }
    if(e.target.closest('#storeRow')){ return openStores('menu'); }
    const cc = e.target.closest('.chip-coupon');
    if(cc){ return toast(cc.classList.contains('more')?'更多优惠券请前往卡券包':'已选择该券，下单自动抵扣 ✅'); }
    const mt = e.target.closest('.menu-tab');
    if(mt){ S.mtab = mt.dataset.mtab; $$('.menu-tab').forEach(x=>x.classList.toggle('on',x===mt));
      renderSideCats(); renderProdList(); $('#prodWrap').scrollTop=0; return; }
    const sc = e.target.closest('.side-cat');
    if(sc){
      $$('#sideCats .side-cat').forEach(x=>x.classList.toggle('on',x===sc));
      const block = $(`#prodWrap [data-block="${sc.dataset.cat}"]`);
      if(block) smoothScrollList(block.offsetTop - 8);
      return;
    }
    const sct = e.target.closest('.sc-tag');
    if(sct){ sct.parentElement.querySelectorAll('.sc-tag').forEach(x=>x.classList.toggle('on',x===sct)); return; }
    const add = e.target.closest('[data-add]');
    if(add){ const p = MENU_ALL.find(x=>x.id===add.dataset.add); openSpec(p); return; }
    if(e.target.closest('#cartFab')){ return openCart(); }
    if(e.target.closest('#menuBubble')){ $('#menuBubble').style.display='none'; const p=MENU_ALL.find(x=>x.id==='xcgz'); openSpec(p); return; }
    /* 即享 */
    const icat = e.target.closest('[data-icat]');
    if(icat){ S.instCat=icat.dataset.icat; renderInstant(); return; }
    const iadd = e.target.closest('[data-iadd]');
    if(iadd){
      const p = INSTANT_PRODUCTS.find(x=>x.id===iadd.dataset.iadd);
      addToCart({ pid:p.id, name:p.name, spec:'标准规格', price:p.price, orig:p.orig, qty:1, art:p.art, artType:'box', bg:p.art.bg, bg2:p.art.bg2 }, iadd);
      return;
    }
    if(e.target.closest('#instFab')){ return openCart(); }
    /* 首页推荐 / 搜索结果 / 月卡tile */
    if(e.target.closest('[data-bnbuy]')){ return toast('演示环境：月卡开通通道开放中'); }
    const rc = e.target.closest('[data-prod]');
    if(rc && rc.dataset.prod){
      const p = MENU_ALL.find(x=>x.id===rc.dataset.prod);
      if(p){ resetStack(); goTab('menu'); syncMenuType(); openSpec(p); return; }
    }
    /* 瑞王卡 */
    const cs = e.target.closest('[data-cs]');
    if(cs){ S['cs'+cs.dataset.cs]=true; renderCardPage(); toast('立减券领取成功 ✅'); return; }
    /* 订单页 */
    const ot = e.target.closest('[data-ot]');
    if(ot){ S.orderType = ot.dataset.ot; renderOrder(); return; }
    if(e.target.closest('#orderScroll [data-store]')){ return openStores('order'); }
    if(e.target.closest('#orderScroll [data-addr]')){ return openAddress(true); }
    const up = e.target.closest('[data-up]');
    if(up){
      const u = UPSELL.find(x=>x.id===up.dataset.up);
      addToCart({ pid:u.id, name:u.name, spec:'换购', price:u.price, orig:u.orig, qty:1, art:{colors:B.dark,bg:'#f2ede2',bg2:'#e4dac4'}, artType:'cup' }, up);
      renderOrder(); return;
    }
    if(e.target.closest('[data-coupons]')){ return openCoupons(); }
    const rwk = e.target.closest('[data-rwk]');
    if(rwk){ S.rwkSel=!S.rwkSel; renderOrder(); if(S.rwkSel) toast('已选择瑞王卡 ¥9.9（随单购买）'); return; }
    if(e.target.closest('#obSubmit')){ return submitOrder(); }
    /* 地址页 */
    const aseg = e.target.closest('[data-aseg]');
    if(aseg){ addrSeg = aseg.dataset.aseg; renderAddress(); return; }
    const ed = e.target.closest('[data-edit]');
    if(ed){ e.stopPropagation(); return openAddrEdit(ed.dataset.edit); }
    const aid = e.target.closest('[data-addr-id]');
    if(aid && S.fromAddress){
      S.addrId = aid.dataset.addrId; store.save();
      S.orderType='delivery'; renderAddress();
      setTimeout(()=>{ popPage(); if($('#page-order').classList.contains('active')) renderOrder(); }, 180);
      return;
    }
    const sid = e.target.closest('[data-store-id]');
    if(sid){ S.orderStoreId = sid.dataset.storeId; S.orderType='delivery'; store.save(); renderAddress();
      setTimeout(()=>{ popPage(); if($('#page-order').classList.contains('active')) renderOrder(); },180); return; }
    if(e.target.closest('#addrAddBtn')){ return openAddrEdit(null); }
    /* 门店列表页 */
    const ps = e.target.closest('[data-pick-store]');
    if(ps){
      if(storeCtx==='order'){ S.orderStoreId = ps.dataset.pickStore; S.orderType='pickup'; store.save(); }
      else { S.menuStoreId = ps.dataset.pickStore; $('#storeName').textContent = storeById(S.menuStoreId).name;
             $('#storeDist').textContent = storeById(S.menuStoreId).dist; }
      store.save(); renderStores();
      setTimeout(popPage, 200); return;
    }
    /* 搜索 */
    if(e.target.closest('#searchGo')||e.target.closest('#searchBtn')){ if(e.target.closest('#searchBtn')) openSearch(); else { renderResults($('#searchInput').value.trim()); } return; }
    const hot = e.target.closest('[data-hot]');
    if(hot){ $('#searchInput').value=hot.dataset.hot; renderHot('x'); renderResults(hot.dataset.hot); return; }
    /* 弹层关闭 */
    if(e.target.closest('[data-close]') || e.target.id==='dim'){ closeSheets(); return; }
    const wf = e.target.closest('[data-wf]');
    if(wf){ toast(wf.dataset.wf); return; }
    const cp = e.target.closest('[data-cp]');
    if(cp){ S['cp'+cp.dataset.cp]=true; openCoupons(); toast('已核销（演示）'); return; }
    /* 成功页按钮 */
    if(e.target.closest('[data-sback]')){ closeSheets(); resetStack(); goTab('home'); return; }
    if(e.target.closest('[data-smine]')){ closeSheets(); resetStack(); goTab('mine'); return; }
  });

  /* 搜索输入 */
  $('#searchInput').addEventListener('input', e=>{ const q=e.target.value.trim(); renderHot(q); renderResults(q); });
  /* 表单 */
  ['#fName','#fPhone'].forEach(s=>$(s).addEventListener('input', validateForm));
  $('#fGender').addEventListener('click', e=>{
    const r = e.target.closest('.radio-item'); if(!r) return;
    aeState.gender = r.dataset.v;
    $$('#fGender .radio-item').forEach(x=>x.classList.toggle('on',x===r));
  });
  $('#fTags').addEventListener('click', e=>{
    const c = e.target.closest('.chip'); if(!c) return;
    const on = !c.classList.contains('on');
    $$('#fTags .chip').forEach(x=>x.classList.remove('on'));
    c.classList.toggle('on', on);
    aeState.tag = on ? c.dataset.v : '';
  });
  $('#fDefault').addEventListener('click', ()=>{ aeState.def=!aeState.def; $('#fDefault').classList.toggle('on', aeState.def); });
  $('#wxImport').addEventListener('click', ()=>{
    $('#fName').value='吴一帆'; aeState.name='吴一帆';
    $('#fPhone').value='15896829682'; validateForm();
    toast('已从微信导入昵称与手机号 ✅');
  });
  $('#fAddrRow').addEventListener('click', openAddrPick);
  $('#aeSave').addEventListener('click', saveAddress);
  $('#aeDel').addEventListener('click', deleteAddress);
}

function openOrdersSheet(){
  const list = S.orders.length ? S.orders.map(o=>`
    <div class="gen-card">
      <h4 style="display:flex;align-items:center">${o.type==='pickup'?'自提':'外送'} · ${esc(o.time)}
        <span style="margin-left:auto;font-size:10px;color:#9aa1b2;font-weight:400">${o.no}</span></h4>
      ${o.items.map(i=>`<div class="gen-row" style="cursor:default">
        <span class="gr-ico" style="background:linear-gradient(150deg,${i.bg||'#eef2f8'},${i.bg2||'#dfe6f2'})">${i.artType==='box'?boxSVG(i.art):cupSVG(i.art)}</span>
        <div class="gr-txt"><b>${esc(i.name)}</b><span>${esc(i.spec)} ×${i.qty}</span></div>
        <b style="color:var(--red)">¥${yuan(i.price*i.qty)}</b></div>`).join('')}
      <p style="margin-top:8px;text-align:right">实付 <b style="color:var(--red)">¥${yuan(o.total)}</b> <span style="font-size:10px;color:#9aa1b2">已优惠 ¥${yuan(o.saved)}</span></p>
    </div>`).join('') : `<div class="cart-empty"><span class="big">🧾</span>还没有订单<br>去首页点一杯吧</div>`;
  openGeneric('我的订单', list);
}
function againOrder(){
  const o = S.orders[0];
  if(o){
    o.items.forEach(i=>addToCart({ pid:i.pid, name:i.name, spec:i.spec, price:i.price, orig:null, qty:i.qty, art:i.art, artType:i.artType, bg:i.bg, bg2:i.bg2 }));
  } else {
    const p = MENU_ALL.find(x=>x.id==='xyms');
    addToCart({ pid:p.id, name:p.name, spec:'大杯/冰/少少甜', price:p.price, qty:1, art:p.art, artType:p.artType, bg:p.art.bg, bg2:p.art.bg2 });
  }
  toast('已按原样加入购物车 🛒');
  goTab('menu'); syncMenuType(); openCart();
}

/* ---------- 菜单页类型同步 ---------- */
function syncMenuType(){
  $$('#page-menu .type-tab').forEach(t=>t.classList.toggle('on', t.dataset.type===S.menuType));
  S.orderType = S.menuType==='delivery' ? 'delivery' : 'pickup';
}

/* ============================================================
   初始化
   ============================================================ */
function init(){
  try{
    renderBanner(); renderRecomm(); renderChipCoupons(); renderSideCats(); renderProdList();
    renderInstant(); renderCardPage(); renderMine(); renderAddress();
    bindScrollSpy(); bindEvents(); initLucky();
    refreshBadges();
    goTab('home');
    setTimeout(()=>{ const b=$('#menuBubble'); if(b && !FREEZE) b.style.opacity='0', setTimeout(()=>b.style.display='none',400); }, 8000);
    $('#menuBubble').style.opacity = '1';
    if(S.cart.length) refreshBadges();
  }catch(err){
    // 任何初始化异常都不允许白屏：保底点亮首页
    console.error('init failed:', err);
    goTab('home');
  }
}
init();
