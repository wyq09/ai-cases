window.MF=window.MF||{};

/* MF.ART — 记忆翻牌卡面资产（扁平印刷插画，SVG dataURI，零外部资源）
   色板：红#B93A2B 金#C99A3C 亮金#E4B95B 米白#FFF9EE 描边#3A2E24 墨#2B2622
   接口：card(id) / back() / trayIcon(id) -> 'data:image/svg+xml;charset=utf-8,...' */
MF.ART=(()=>{
'use strict';
const S='#3A2E24',RED='#B93A2B',GOLD='#C99A3C',BG='#E4B95B',CR='#FFF9EE',INK='#2B2622';
const HEAD='<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">';
const uri=inner=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(HEAD+inner+'</svg>');
const sh=(d,fill,w)=>'<path d="'+d+'" fill="'+(fill||'none')+'" stroke="'+S+'" stroke-width="'+(w||2)+'" stroke-linejoin="round" stroke-linecap="round"/>';
const ln=(d,st,w,extra)=>'<path d="'+d+'" fill="none" stroke="'+(st||S)+'" stroke-width="'+(w||2)+'" stroke-linecap="round"'+(extra?' '+extra:'')+'/>';
const ci=(x,y,r,fill,w)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'"'+(w?' stroke="'+S+'" stroke-width="'+w+'"':'')+'/>';
const el=(x,y,rx,ry,fill,w)=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+fill+'"'+(w?' stroke="'+S+'" stroke-width="'+w+'"':'')+'/>';
const rc=(x,y,w,h,rx,fill)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+fill+'" stroke="'+S+'" stroke-width="2"/>';
const pg=(d,fill)=>'<path d="'+d+'" fill="'+fill+'"/>';

/* ingot 金元宝：金船身 + 中央圆珠 */
function ingot(){return sh('M32,58 C32,40 40,32 50,32 C60,32 68,40 68,58 Z',GOLD)
 +sh('M10,50 C10,45 15,43 21,46 C31,51 40,53 50,53 C60,53 69,51 79,46 C85,43 90,45 90,50 C90,66 73,75 50,75 C27,75 10,66 10,50 Z',BG)
 +ln('M23,57 Q29,64 38,66.5',CR,3);}

/* hongbao 红包：竖红封 + 盖口弧线 + 金圆印 */
function hongbao(){return sh('M32,15 H68 Q75,15 75,22 V78 Q75,85 68,85 H32 Q25,85 25,78 V22 Q25,15 32,15 Z',RED)
 +ln('M27,24 Q50,47 73,24')
 +ci(50,58,10,BG,2)
 +pg('M50,53.5 L54.5,58 L50,62.5 L45.5,58 Z',RED)
 +ci(45.5,54,1.8,CR);}

/* coupon 优惠券：横米白票 + 两侧缺口 + 齿孔虚线 */
function coupon(){return sh('M16,31 H84 Q90,31 90,37 V44.5 A5.5,5.5 0 0 0 90,55.5 V63 Q90,69 84,69 H16 Q10,69 10,63 V55.5 A5.5,5.5 0 0 1 10,44.5 V37 Q10,31 16,31 Z',CR)
 +ln('M63,35 V65',S,2,'stroke-dasharray="4 3.5"')
 +pg('M19,40 H55 A2.5,2.5 0 0 1 55,45 H19 A2.5,2.5 0 0 1 19,40 Z',RED)
 +pg('M19,50.5 H43 A2.5,2.5 0 0 1 43,55.5 H19 A2.5,2.5 0 0 1 19,50.5 Z',RED)
 +ci(76.5,50,6,BG,2)
 +pg('M76.5,46.8 L79.7,50 L76.5,53.2 L73.3,50 Z',RED)
 +ci(74,47.4,1.2,CR);}

/* gift 礼盒：红盒金盖 + 竖丝带 + 蝴蝶结 */
function gift(){return rc(23,46,54,34,4,RED)
 +rc(17,33,66,15,4,GOLD)
 +rc(44,33,12,47,0,BG)
 +sh('M50,30 C42,19 29,19.5 31.5,27.5 C33,32.5 42,33 50,30 Z',BG)
 +sh('M50,30 C58,19 71,19.5 68.5,27.5 C67,32.5 58,33 50,30 Z',BG)
 +ci(50,29.5,4.5,GOLD,2)
 +ln('M22,38 H31',CR,3);}

/* koi 锦鲤：米白鱼身红斑 + 金色三鳍大尾 */
function koi(){return sh('M64,44 C74,33 86,30 91,34 C86,40 85,46 87,52 C85,58 86,64 91,70 C86,74 74,71 64,60 Z',GOLD)
 +sh('M38,41 C39,29 50,22 61,26 C60,33 53,39 45,42 Z',GOLD)
 +sh('M36,60 C33,70 41,77 50,75 C52,69 47,63 41,60 Z',GOLD)
 +sh('M14,52 C19,38 36,31 52,37 C63,41 69,47 71,52 C69,58 61,64 49,66 C33,68 19,63 14,52 Z',CR)
 +sh('M27,43 C31,37 39,38 41,43 C40,48 33,51 28,49 C26,47 26,45 27,43 Z',RED)
 +sh('M52,50 C58,46 65,48 66.5,52.5 C64,57.5 56,59 52,56 C50.5,54 50.5,52 52,50 Z',RED)
 +ci(23.5,49,2.3,INK)
 +ln('M77,40 Q83,36.5 88,37',CR,2.5);}

/* cat 招财猫：抬爪招手 + 红项圈金铃 + 肚上金钱 */
function cat(){return sh('M36,29 L31,11 L47,19 Z',CR)
 +sh('M64,29 L69,11 L53,19 Z',CR)
 +pg('M37,25 L34.5,15.5 L43,20 Z',RED)
 +pg('M63,25 L65.5,15.5 L57,20 Z',RED)
 +rc(31,52,38,30,13,CR)
 +rc(24,58,11,20,5.5,CR)
 +sh('M35,52.5 H65 V57.5 Q50,63.5 35,57.5 Z',RED)
 +el(50,70,8.5,7,BG,2)
 +pg('M50,66.5 L53,70 L50,73.5 L47,70 Z',RED)
 +ci(50,61.5,4.2,BG,2)
 +ci(50,61.5,1,INK)
 +ci(50,38,19,CR,2)
 +ci(43,36,2.4,INK)
 +ci(57,36,2.4,INK)
 +pg('M47.4,40.5 H52.6 L50,43.8 Z',INK)
 +el(36.5,42.5,3,1.9,RED)
 +el(63.5,42.5,3,1.9,RED)
 +rc(67,16,11,25,5.5,CR)
 +ln('M45.5,67.8 A6.5,5.5 0 0 1 48.5,65.4',CR,2);}

/* crown 王冠：三尖金冠 + 红珠顶 + 宝石腰线 */
function crown(){return sh('M15,60 L15,38 L32,49 L50,26 L68,49 L85,38 L85,60 Z',BG)
 +ci(15,35,3.8,RED,2)
 +ci(50,23,3.8,RED,2)
 +ci(85,35,3.8,RED,2)
 +rc(15,60,70,12,3,GOLD)
 +ci(50,66,3.2,RED,1.6)
 +ci(33,66,1.8,CR)
 +ci(67,66,1.8,CR)
 +ln('M43.5,34 L38.5,41.5',CR,2.5);}

/* gem 宝石：红钻切面 + 亮金反光面 + 星芒 */
function gem(){return sh('M31,29 H69 L86,47 L50,83 L14,47 Z',RED)
 +pg('M50,29 L40,47 H60 Z',BG)
 +ln('M14,47 H86',S,1.8)
 +ln('M31,29 L40,47 M50,29 L40,47 M50,29 L60,47 M69,29 L60,47 M40,47 L50,83 M60,47 L50,83',S,1.8)
 +pg('M80,12 L82.3,17.7 L88,20 L82.3,22.3 L80,28 L77.7,22.3 L72,20 L77.7,17.7 Z',BG);}

/* firework 礼花：金芯红芒八向爆发 + 金点弧尾 */
function firework(){const rays='M21,50 H36 M64,50 H79 M50,21 V36 M50,64 V79 M39.4,39.4 L29.5,29.5 M60.6,39.4 L70.5,29.5 M60.6,60.6 L70.5,70.5 M39.4,60.6 L29.5,70.5';
 return ln('M62,32 Q70,27.5 73,21 M62,68 Q70,72.5 73,79 M38,68 Q30,72.5 27,79 M38,32 Q30,27.5 27,21',GOLD,2.2)
 +ln(rays,S,6.5)
 +ln(rays,RED,3.5)
 +ci(50,13,3,GOLD,1.6)+ci(87,50,3,GOLD,1.6)+ci(50,87,3,GOLD,1.6)+ci(13,50,3,GOLD,1.6)
 +ci(50,50,9.5,BG,2)
 +ci(50,50,2.2,RED)
 +ci(46.5,46.5,1.8,CR);}

/* coin 铜钱：亮金圆钱 + 方孔透底 + 内环星点 */
function coin(){return '<path d="M16,50 a34,34 0 1 0 68,0 a34,34 0 1 0 -68,0 Z M41.5,41.5 H58.5 V58.5 H41.5 Z" fill="'+BG+'" fill-rule="evenodd" stroke="'+S+'" stroke-width="2.5" stroke-linejoin="round"/>'
 +'<circle cx="50" cy="50" r="26.5" fill="none" stroke="'+GOLD+'" stroke-width="2"/>'
 +ci(50,29.5,1.7,GOLD)+ci(70.5,50,1.7,GOLD)+ci(50,70.5,1.7,GOLD)+ci(29.5,50,1.7,GOLD)
 +ln('M30,33 A27,27 0 0 1 42,24',CR,3);}

const DRAW={ingot:ingot,hongbao:hongbao,coupon:coupon,gift:gift,koi:koi,cat:cat,crown:crown,gem:gem,firework:firework,coin:coin};
const cache={};

function card(id){
  if(cache[id])return cache[id];
  const f=DRAW[id];
  if(!f)return '';
  cache[id]=uri(f());
  return cache[id];
}

/* back 卡背：红底 + 金回纹边框 + 四角菱星 + 中央金圈「礼」印 */
function back(){
  if(cache.__back)return cache.__back;
  let hooks='';
  for(let i=0;i<4;i++){const u=(24.5+i*14).toFixed(1);
    hooks+='<path d="M'+u+',11h9v9h-6.5v-6h3.5"/>';}
  const grp=t=>'<g transform="'+t+'">'+hooks+'</g>';
  const dm=(x,y)=>'<path d="M'+x+','+(y-4)+' l4,4 -4,4 -4,-4 Z" fill="'+BG+'"/>';
  let s='<rect x="3" y="3" width="94" height="94" rx="8" fill="#A93426" stroke="'+S+'" stroke-width="2"/>'
   +'<rect x="9.5" y="9.5" width="81" height="81" fill="none" stroke="'+GOLD+'" stroke-width="1.5"/>'
   +'<rect x="21.5" y="21.5" width="57" height="57" fill="none" stroke="'+GOLD+'" stroke-width="1.5"/>'
   +'<g fill="none" stroke="'+BG+'" stroke-width="1.8">'+hooks
   +grp('rotate(90 50 50)')+grp('rotate(180 50 50)')+grp('rotate(270 50 50)')+'</g>'
   +dm(15.5,15.5)+dm(84.5,15.5)+dm(15.5,84.5)+dm(84.5,84.5)
   +'<circle cx="50" cy="50" r="20" fill="none" stroke="'+BG+'" stroke-width="3.2"/>'
   +'<circle cx="50" cy="50" r="16" fill="none" stroke="'+GOLD+'" stroke-width="1.2"/>'
   +'<text x="50" y="58.6" text-anchor="middle" font-family="Songti SC,STSong,SimSun,serif" font-size="23" font-weight="900" fill="'+BG+'">礼</text>';
  cache.__back=uri(s);
  return cache.__back;
}

function trayIcon(id){return card(id);}

return {card:card,back:back,trayIcon:trayIcon};
})();
