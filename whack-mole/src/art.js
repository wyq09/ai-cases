window.WM=window.WM||{};

/* WM.ART — 欢乐打地鼠 · 美术资产（草地游园会印刷风，全部 SVG dataURI，零外部资源）
   接口：
   mole(id,pose)  id∈normal|gold|gift|bomb, pose∈'up'|'hit'  viewBox 0 0 100 100
   holeBack()     洞后片（深色椭圆+内壁）           viewBox 0 0 120 80
   holeFront()    洞前片（下沿土弧+草皮遮挡片）     viewBox 0 0 120 60
   hammer(pose)   idle|hit 木锤（棕柄红头亮金箍）   viewBox 0 0 100 100
   grassTuft(i)   草丛簇 i∈0..2                     viewBox 0 0 60 40
   seal()         红底金「鼠」印章                  viewBox 0 0 100 100
   uiIcon(name)   sound/soundOff/gift/cfg/clock/trophy/back  viewBox 0 0 24 24 */
WM.ART=(()=>{
'use strict';
const S='#3A2E24',INK='#2B2622',RED='#B93A2B',DRED='#8F2B20',GOLD='#C99A3C',BG='#E4B95B',
      CR='#FFF9EE',BR='#8A5A33',DK='#3B2A1C',GR='#7DA45B',DG='#5D8242',PK='#DC998C';
const cache={};

const sh=(d,f,w)=>'<path d="'+d+'" fill="'+(f||'none')+'" stroke="'+S+'" stroke-width="'+(w||2)+'" stroke-linejoin="round" stroke-linecap="round"/>';
const ln=(d,c,w,x)=>'<path d="'+d+'" fill="none" stroke="'+(c||S)+'" stroke-width="'+(w||2)+'" stroke-linecap="round"'+(x?' '+x:'')+'/>';
const ci=(x,y,r,f,w)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+f+'"'+(w?' stroke="'+S+'" stroke-width="'+w+'"':'')+'/>';
const el=(x,y,rx,ry,f,w)=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+f+'"'+(w?' stroke="'+S+'" stroke-width="'+w+'"':'')+'/>';
const rc=(x,y,w,h,r,f,sw)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+f+'" stroke="'+S+'" stroke-width="'+(sw||2)+'"/>';
const pg=(d,f)=>'<path d="'+d+'" fill="'+f+'"/>';
const star=(x,y,r,f,sw)=>{let p='',i,a,rr;
 for(i=0;i<10;i++){a=-Math.PI/2+i*Math.PI/5;rr=i%2?r*0.45:r;
  p+=(i?'L':'M')+(x+rr*Math.cos(a)).toFixed(1)+','+(y+rr*Math.sin(a)).toFixed(1);}
 return '<path d="'+p+' Z" fill="'+f+'"'+(sw?' stroke="'+S+'" stroke-width="'+sw+'" stroke-linejoin="round"':'')+'/>';};
const uri=(vb,inner)=>'data:image/svg+xml;charset=utf-8,'
 +encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+vb+'">'+inner+'</svg>');

/* —— 地鼠通用件 —— */
const BODY_UP='M50,22 C33,22 23,40 22,62 C21,84 33,98 50,98 C67,98 79,84 78,62 C77,40 67,22 50,22 Z';
const BODY_HIT='M50,50 C32,50 19,58 17,72 C15,88 31,97 50,97 C69,97 85,88 83,72 C81,58 68,50 50,50 Z';

/* 立姿基础：耳+圆胖身+米白口鼻+粉鼻+大门牙+小黑圆眼 */
function faceBase(body,ear,inner){
 return ci(30,26,7.5,ear,2)+ci(30,26,3.2,inner)
      + ci(70,26,7.5,ear,2)+ci(70,26,3.2,inner)
      + sh(BODY_UP,body)
      + el(50,46,14,10.5,CR,1.5)
      + el(50,39.5,4.6,3.6,PK,1.5)
      + rc(44.4,47,5.4,9,2,CR,1.5)+rc(50.2,47,5.4,9,2,CR,1.5)
      + ci(37.5,31.5,2.8,INK)+ci(38.5,30.5,0.9,CR)
      + ci(62.5,31.5,2.8,INK)+ci(63.5,30.5,0.9,CR);
}
/* 扒沿双爪（椭圆爪+趾缝线） */
function paws(x1,x2,cy){
 return el(x1,cy,9.5,7.5,BR,2)+ln('M'+(x1-3.5)+','+(cy-5)+' V'+(cy+4)+' M'+(x1+3.5)+','+(cy-5.5)+' V'+(cy+3.5),S,1.5)
      + el(x2,cy,9.5,7.5,BR,2)+ln('M'+(x2-3.5)+','+(cy-5)+' V'+(cy+4)+' M'+(x2+3.5)+','+(cy-5.5)+' V'+(cy+3.5),S,1.5);
}

/* normal·up：棕地鼠探头 */
function normalUp(){return faceBase(BR,BR,PK)+paws(29,71,84);}

/* gold·up：金身+眯眼笑+腮红+头顶小金星 */
function goldUp(){
 return ci(30,26,7.5,BG,2)+ci(30,26,3.2,GOLD)
      + ci(70,26,7.5,BG,2)+ci(70,26,3.2,GOLD)
      + sh(BODY_UP,BG)
      + el(50,46,14,10.5,CR,1.5)
      + el(50,39.5,4.6,3.6,PK,1.5)
      + rc(44.4,47,5.4,9,2,CR,1.5)+rc(50.2,47,5.4,9,2,CR,1.5)
      + ln('M33,32 Q38,27.5 43,32',S,2.4)+ln('M57,32 Q62,27.5 67,32',S,2.4)
      + el(30,42,3.6,2.3,PK)+el(70,42,3.6,2.3,PK)
      + star(64,11,6.5,GOLD,1.5)+star(50,15,3.4,BG,1.2)
      + paws(29,71,84);
}

/* gift·up：怀抱红礼盒（金丝带蝴蝶结），爪搭盒沿 */
function giftUp(){
 return faceBase(BR,BR,PK)
      + rc(26,57,48,9,2,DRED)
      + rc(30,66,40,28,3,RED)
      + rc(46.5,57,7,37,1,BG,1.5)
      + sh('M50,55 C43,46.5 33,48.5 35,53.5 C36.5,57.5 44,57 50,55 Z',BG,1.5)
      + sh('M50,55 C57,46.5 67,48.5 65,53.5 C63.5,57.5 56,57 50,55 Z',BG,1.5)
      + ci(50,55,3.4,BG,1.5)
      + paws(31,69,77);
}

/* bomb·up：黑圆炸弹+金箍引信帽+火花+红「!」——一眼危险勿打 */
function bombUp(){
 return ln('M50,29 C50,21 56,19 60.5,13',BR,3)
      + ln('M62,10.5 L62,3 M62,10.5 L69,5.5 M62,10.5 L55,4.5',BG,2.2)
      + ln('M62,10.5 L69.5,13.5 M62,10.5 L54.5,12.5',RED,2)
      + ci(62,10.5,2.2,BG,1.4)
      + ci(50,64,29,INK,2.5)
      + rc(43,28,14,9,2.5,BG,2)
      + ln('M31,55 C33,47 38,41.5 45,39',CR,4,'opacity=".5"')
      + '<rect x="48" y="49" width="4.5" height="14" rx="2.2" fill="'+RED+'"/>'
      + ci(50.2,69,2.7,RED);
}

/* 压扁晕眼基座：扁身+×眼+波浪嘴+腮红+头顶转圈星星 */
function squashed(body,ear){
 return el(24,55,6.5,4.5,ear,2)+el(76,55,6.5,4.5,ear,2)
      + sh(BODY_HIT,body)
      + ln('M33,63 L40,70 M40,63 L33,70',S,2.4)+ln('M60,63 L67,70 M67,63 L60,70',S,2.4)
      + ln('M43,81 Q46.5,78 50,81 Q53.5,84 57,81',S,2)
      + el(26,74,3.6,2.3,PK)+el(74,74,3.6,2.3,PK)
      + ln('M27,44 Q50,27 73,44',GOLD,1.6,'stroke-dasharray="5 4"')
      + star(27,42,5,GOLD,1.3)+star(50,29,6.5,BG,1.5)+star(73,42,5,GOLD,1.3);
}

/* gift·hit：压扁+礼盒压在身前 */
function giftHit(){
 return el(24,53,6.5,4.5,BR,2)+el(76,53,6.5,4.5,BR,2)
      + sh(BODY_HIT,BR)
      + ln('M33,60 L39,65.5 M39,60 L33,65.5',S,2.4)+ln('M61,60 L67,65.5 M67,60 L61,65.5',S,2.4)
      + rc(25,68,50,8,2,DRED)
      + rc(29,76,42,20,3,RED)
      + rc(46.5,68,7,28,1,BG,1.5)
      + sh('M50,66 C45,60 37,61.5 39,65.5 C40.5,68.5 46,68 50,66 Z',BG,1.5)
      + sh('M50,66 C55,60 63,61.5 61,65.5 C59.5,68.5 54,68 50,66 Z',BG,1.5)
      + ci(50,66,3,BG,1.5)
      + el(31,86,8,5.5,BR,2)+el(69,86,8,5.5,BR,2);
}

/* bomb·hit：焦黑弹体+爆炸白烟脸（×眼）+余烬火花 */
function bombHit(){
 return ci(50,64,26,INK,2)
      + '<g transform="rotate(-18 20 84)">'+rc(13,80,14,8,2.5,BG)+'</g>'
      + sh('M24,60 C16,60 13,51 20,47 C17,39 27,33 34,38 C37,29 51,28 55,37 C63,31 73,38 69,46 C77,48 78,58 70,61 C69,66 61,68 57,64 C50,70 37,69 36,63 C32,65 27,64 24,60 Z',CR,2)
      + ln('M35,45 L41,51 M41,45 L35,51',S,2.2)+ln('M55,45 L61,51 M61,45 L55,51',S,2.2)
      + ln('M44,57 Q47,54.5 50,57 Q53,59.5 56,57',S,2)
      + ln('M82,26 L82,19 M82,26 L88,21.5 M82,26 L76,20.5',BG,2.2)
      + ln('M82,26 L88.5,28.5',RED,2)
      + ci(18,28,2.6,CR,1.4)+ci(86,42,2.2,CR,1.4);
}

const IDS={normal:1,gold:1,gift:1,bomb:1};
function mole(id,pose){
 if(!IDS[id])return '';
 const k='m'+id+pose;
 if(cache[k])return cache[k];
 let s;
 if(pose==='hit')s=id==='normal'?squashed(BR,BR):id==='gold'?squashed(BG,BG):id==='gift'?giftHit():bombHit();
 else if(pose!=='up')return '';
 else s=id==='normal'?normalUp():id==='gold'?goldUp():id==='gift'?giftUp():bombUp();
 cache[k]=uri('0 0 100 100',s);
 return cache[k];
}

/* 洞后片：土圈子（土棕）+ 深洞椭圆（土棕→洞深→墨的纵深轻渐变）+ 内壁反光弧 */
function holeBack(){
 return uri('0 0 120 60',
  '<defs><linearGradient id="wmg" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+DK+'"/><stop offset="1" stop-color="'+INK+'"/></linearGradient></defs>'
  + el(60,30,49,18,'url(#wmg)',2.5)
  + '<path d="M18,26 C30,15 90,15 102,26 C92,20 28,20 18,26 Z" fill="'+BR+'" opacity=".55"/>'
  + '<ellipse cx="60" cy="33" rx="40" ry="11" fill="'+INK+'" opacity=".55"/>');
}

/* 洞前片：中间隆起、两侧收窄的土丘 + 弧顶草皮（草叶先画、土丘压根） */
function holeFront(){
 return uri('0 0 120 50',
  sh('M20,36 C19,30 20,25 23,21 C24.5,26.5 24,31.5 23.5,36 Z',DG,1.5)
  + sh('M44,32 C43,25.5 44,20.5 47,16 C48.5,22 47.5,27.5 47,32 Z',GR,1.5)
  + sh('M70,31 C69.5,25 71,20.5 74,16.5 C75,22 74,27 73.5,31 Z',DG,1.5)
  + sh('M92,35 C91.5,29.5 92.5,25.5 95,22 C96,26.5 95.5,31 95,35 Z',GR,1.5)
  + sh('M-4,40 C6,24 40,17 60,17 C80,17 114,24 124,40 L124,52 L-4,52 Z',BR,2)
  + ln('M4,44 C20,30 100,30 116,44',S,4,'opacity=".12"')
  + ln('M22,42 q4,2.5 8,0 M58,45 q4,2.5 8,0 M88,41 q3,2 6,0',S,1.3,'opacity=".35"'));
}

/* 木锤：棕柄+红锤头（红→深红轻渐变）+两端亮金箍；hit 态斜劈+冲击火星 */
function hammer(pose){
 const hit=pose==='hit';
 let s='<defs><linearGradient id="wmg" x1="0" y1="0" x2="0" y2="1">'
  +'<stop offset="0" stop-color="'+RED+'"/><stop offset="1" stop-color="'+DRED+'"/></linearGradient></defs>'
  +'<g transform="'+(hit?'translate(5,1) rotate(-45 50 55)':'translate(4,1) rotate(-28 50 62)')+'">'
  + rc(44,34,12,58,5.5,BR)
  + '<rect x="19" y="9" width="62" height="28" rx="9" fill="url(#wmg)" stroke="'+S+'" stroke-width="2"/>'
  + rc(19,9,10,28,4,BG)+rc(71,9,10,28,4,BG)
  + '</g>';
 if(hit)s+=ln('M6,50 L12,54 M4,62 L11,62 M12,42 L17,47',GOLD,2.4)+ln('M10,68 L15,66',RED,2);
 return uri('0 0 100 100',s);
}

/* 草丛簇三款：纯色草叶+土脚，款1红花、款2米白雏菊 */
function grassTuft(i){
 const k='g'+i;
 if(cache[k])return cache[k];
 let s='';
 if(i===0){
  s=sh('M6,38 C4,29 6,21 11,14 C12.5,22 12,30 13,38 Z',DG,1.5)
  + sh('M24,38 C22,26 26,15 31,9 C32,19 30,29 30,38 Z',GR,1.5)
  + sh('M40,38 C40,29 43,22 48,17 C48.5,25 46,32 45,38 Z',DG,1.5);
 }else if(i===1){
  s=sh('M8,38 C7,31 9,25 13,20 C14,26 12,32 12,38 Z',GR,1.5)
  + sh('M20,38 C19,29 22,22 26,17 C27,24 25,31 24,38 Z',DG,1.5)
  + sh('M33,38 C33,30 35,24 39,19 C40,26 38,32 37,38 Z',GR,1.5)
  + ci(47,9.6,2.6,RED)+ci(50.2,12,2.6,RED)+ci(49,15.8,2.6,RED)+ci(45,15.8,2.6,RED)+ci(43.8,12,2.6,RED)
  + ci(47,13,1.8,BG)
  + sh('M52,38 C52,31 54,26 57,22 C58,28 56,33 55,38 Z',DG,1.5);
 }else{
  s=sh('M10,38 C8,30 10,23 15,17 C16.5,24 14,31 14,38 Z',DG,1.5)
  + sh('M24,38 C23,29 26,22 30,17 C31,24 29,31 28,38 Z',GR,1.5)
  + ci(44,8.8,2.4,CR)+ci(47.1,11,2.4,CR)+ci(45.9,14.7,2.4,CR)+ci(42.1,14.7,2.4,CR)+ci(40.9,11,2.4,CR)
  + ci(44,12,1.7,GOLD)
  + sh('M52,38 C52,32 54,27 57,23 C58,29 56,34 55,38 Z',DG,1.5);
 }
 s+=pg('M2,38 Q30,33.5 58,38 L58,40 L2,40 Z',BR);
 cache[k]=uri('0 0 60 40',s);
 return cache[k];
}

/* 印章：红底圆角方+金内框+金「鼠」字（宋体 900） */
function seal(){
 return uri('0 0 100 100',
  '<rect x="4" y="4" width="92" height="92" rx="10" fill="'+RED+'" stroke="'+DRED+'" stroke-width="2"/>'
  + '<rect x="10.5" y="10.5" width="79" height="79" rx="6" fill="none" stroke="'+BG+'" stroke-width="1.6"/>'
  + pg('M50,7.2 l3,3.3 -3,3.3 -3,-3.3 Z',BG)
  + pg('M50,86.2 l3,3.3 -3,3.3 -3,-3.3 Z',BG)
  + '<text x="50" y="70.5" text-anchor="middle" font-family="Songti SC,STSong,SimSun,serif" font-size="56" font-weight="900" fill="'+BG+'">鼠</text>');
}

/* 线性小图标：24 网格 2px 深棕描边 */
const ICONS={
 sound:'<path d="M4,9.2 H7.5 L12.5,5 V19 L7.5,14.8 H4 Z" fill="'+CR+'"/>'
      +'<path d="M15.5,9.3 A4.2,4.2 0 0 1 15.5,14.7"/><path d="M18.2,7.2 A7,7 0 0 1 18.2,16.8"/>',
 soundOff:'<path d="M4,9.2 H7.5 L12.5,5 V19 L7.5,14.8 H4 Z" fill="'+CR+'"/>'
      +'<path d="M16,9.5 L21,14.5 M21,9.5 L16,14.5"/>',
 gift:'<rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5"/>'
     +'<rect x="3.5" y="6.5" width="17" height="4" rx="1"/>'
     +'<path d="M12,6.5 V20"/>'
     +'<path d="M12,6.5 C9.5,2.8 5.2,4 7,6.5"/><path d="M12,6.5 C14.5,2.8 18.8,4 17,6.5"/>',
 cfg:'<circle cx="12" cy="12" r="6.8"/><circle cx="12" cy="12" r="2.8"/>'
    +'<path d="M12,2.8 V5.4 M12,18.6 V21.2 M2.8,12 H5.4 M18.6,12 H21.2 M5.5,5.5 L7.3,7.3 M16.7,16.7 L18.5,18.5 M18.5,5.5 L16.7,7.3 M7.3,16.7 L5.5,18.5"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12,7 V12 L15.8,14.2"/>',
 trophy:'<path d="M8,4.5 H16 V9.5 A4,4 0 0 1 8,9.5 Z" fill="'+CR+'"/>'
       +'<path d="M8,6 H4.5 C4.5,9.3 6,10.8 8.3,11.2"/><path d="M16,6 H19.5 C19.5,9.3 18,10.8 15.7,11.2"/>'
       +'<path d="M12,13.5 V16.5"/><path d="M9,16.5 H15 L16,19.5 H8 Z" fill="'+CR+'"/>',
 back:'<path d="M14.5,5.5 L8,12 L14.5,18.5"/>'
};
function uiIcon(name){
 const d=ICONS[name];
 if(!d)return '';
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="'+S
  +'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</g></svg>');
}

return {mole:mole,holeBack:holeBack,holeFront:holeFront,hammer:hammer,grassTuft:grassTuft,seal:seal,uiIcon:uiIcon};
})();
