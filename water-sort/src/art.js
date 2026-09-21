window.WS=window.WS||{};WS.ART=(()=>{
'use strict';
// ---------------- 基础 ----------------
const uri=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
const svg=(w,h,b)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'">'+b+'</svg>';
const cache={};
function memo(k,make){if(!(k in cache))cache[k]=make();return cache[k]}
const imgs=[];
function warm(src){const im=new Image();im.src=src;imgs.push(im);return src}

// ---------------- 房间色板 ----------------
const rooms={
  warm:{wall:'#8A6FA5',wallDeep:'#7A5F93',frame:'#B98A5A',sky:'#BFE3F0',cloud:'#FFFFFF',mullion:'#A5764A',counterFace:'#8A5533',counterTop:'#C89A6B',wood:'#A96A3F',woodDark:'#8F5530',woodDeep:'#965C34'},
  mint:{wall:'#7FBFA6',wallDeep:'#6FAF96',frame:'#C9A36B',sky:'#C4ECF2',cloud:'#FFFFFF',mullion:'#B08A50',counterFace:'#9C6B3E',counterTop:'#DCB383',wood:'#BC8A55',woodDark:'#A0703F',woodDeep:'#AC7A48'},
  dusk:{wall:'#5C6B99',wallDeep:'#4C5A85',frame:'#8A5F3E',sky:'#9FB6D8',cloud:'#E8EDF5',mullion:'#744D30',counterFace:'#6B4226',counterTop:'#A87B4E',wood:'#7E4E2C',woodDark:'#663C20',woodDeep:'#704526'}
};
let room=rooms.warm,roomName='warm';

// ---------------- 水色板 ----------------
const liquids={
  classic:['#F5C542','#E2483D','#3FA0D8','#59B35B','#F08A3C','#EF7FA4','#8E6FC8','#4EC8C0','#A5714A','#A8C93A'],
  candy:['#F2566B','#FF9F5C','#FFD95C','#7ED67E','#56C4B8','#6FAEF5','#9D8CF0','#F78FBE','#B5855C','#8A5AA8'],
  ocean:['#2C5F8A','#2FA8A0','#6FD8D8','#A8E6CF','#3A8F6B','#F27E63','#E8C87A','#5C6BC0','#C25E8F','#8FC3E8']
};

// ---------------- 背景 690x1232 ----------------
function bgData(){
  const R=room;let s='';
  s+='<rect width="690" height="272" fill="'+R.wall+'"/>';
  s+='<rect y="230" width="690" height="42" fill="'+R.wallDeep+'"/>';
  s+='<rect x="201" y="21" width="288" height="228" rx="30" fill="'+R.frame+'"/>';
  s+='<rect x="219" y="39" width="252" height="192" rx="20" fill="'+R.mullion+'"/>';
  s+='<rect x="226" y="46" width="238" height="178" rx="14" fill="'+R.sky+'"/>';
  s+='<g fill="'+R.cloud+'"><ellipse cx="285" cy="88" rx="30" ry="13"/><ellipse cx="311" cy="78" rx="21" ry="11"/><ellipse cx="332" cy="90" rx="17" ry="9"/><ellipse cx="414" cy="152" rx="26" ry="11"/><ellipse cx="437" cy="144" rx="17" ry="8"/></g>';
  s+='<rect x="341" y="46" width="8" height="178" fill="'+R.mullion+'"/><rect x="226" y="128" width="238" height="8" fill="'+R.mullion+'"/>';
  s+='<rect y="272" width="690" height="22" fill="'+R.counterTop+'"/>';
  s+='<rect y="292" width="690" height="4" fill="rgba(0,0,0,.15)"/>';
  s+='<rect y="296" width="690" height="38" fill="'+R.counterFace+'"/>';
  s+='<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+R.wood+'"/><stop offset="1" stop-color="'+R.woodDeep+'"/></linearGradient></defs>';
  s+='<rect y="334" width="690" height="898" fill="url(#wg)"/>';
  [484,634,784,934,1084].forEach(y=>{s+='<rect y="'+y+'" width="690" height="5" fill="'+R.woodDark+'"/><rect y="'+(y+5)+'" width="690" height="2" fill="rgba(255,255,255,.07)"/>'});
  [[410,334],[180,489],[540,639],[300,789],[90,939],[470,1089]].forEach(p=>{s+='<rect x="'+p[0]+'" y="'+p[1]+'" width="4" height="150" fill="'+R.woodDark+'" opacity=".7"/>'});
  return uri(svg(690,1232,s));
}
function bg(){return memo('bg',bgData)}
function setRoom(n){if(rooms[n]&&n!==roomName){roomName=n;room=rooms[n];delete cache.bg;warm(bg())}}

// ---------------- 吧台小猪 200x170 ----------------
function pigData(a,pose){
  const PK='#F2A9B8',DK='#D97F93',dk='rgba(0,0,0,.13)',cheer=pose==='cheer';let s='';
  s+='<rect x="26" y="84" width="38" height="72" rx="16" fill="#8A5A2A"/><rect x="136" y="84" width="38" height="72" rx="16" fill="#8A5A2A"/>';
  s+='<path d="M36,170 C36,126 62,106 100,106 C138,106 164,126 164,170 Z" fill="'+a+'"/>';
  s+='<rect x="64" y="112" width="15" height="58" rx="7.5" fill="#6B4226"/><rect x="121" y="112" width="15" height="58" rx="7.5" fill="#6B4226"/>';
  s+='<line x1="100" y1="122" x2="100" y2="170" stroke="'+dk+'" stroke-width="5"/>';
  if(!cheer)s+='<rect x="26" y="134" width="28" height="36" rx="14" fill="'+PK+'"/><rect x="146" y="134" width="28" height="36" rx="14" fill="'+PK+'"/>';
  s+='<ellipse cx="50" cy="40" rx="13" ry="22" fill="'+PK+'" transform="rotate(-16 50 40)"/><ellipse cx="50" cy="43" rx="6" ry="11" fill="'+DK+'" transform="rotate(-16 50 43)"/>';
  s+='<ellipse cx="150" cy="40" rx="13" ry="22" fill="'+PK+'" transform="rotate(16 150 40)"/><ellipse cx="150" cy="43" rx="6" ry="11" fill="'+DK+'" transform="rotate(16 150 43)"/>';
  s+='<ellipse cx="100" cy="84" rx="57" ry="53" fill="'+PK+'"/>';
  s+='<path d="M44,72 C44,34 68,16 100,16 C132,16 156,34 156,72 Z" fill="'+a+'"/>';
  s+='<rect x="38" y="64" width="124" height="14" rx="7" fill="'+a+'"/><rect x="38" y="73" width="124" height="5" rx="2.5" fill="'+dk+'"/>';
  s+='<ellipse cx="74" cy="36" rx="13" ry="7" fill="#FFFFFF" opacity=".55" transform="rotate(-22 74 36)"/>';
  if(cheer){
    s+='<path d="M52,146 C38,118 38,94 54,78" fill="none" stroke="'+DK+'" stroke-width="26" stroke-linecap="round"/><path d="M52,146 C38,118 38,94 54,78" fill="none" stroke="'+PK+'" stroke-width="19" stroke-linecap="round"/>';
    s+='<path d="M148,146 C162,118 162,94 146,78" fill="none" stroke="'+DK+'" stroke-width="26" stroke-linecap="round"/><path d="M148,146 C162,118 162,94 146,78" fill="none" stroke="'+PK+'" stroke-width="19" stroke-linecap="round"/>';
    s+='<circle cx="56" cy="72" r="15" fill="'+PK+'" stroke="'+DK+'" stroke-width="3"/><circle cx="144" cy="72" r="15" fill="'+PK+'" stroke="'+DK+'" stroke-width="3"/>';
  }
  s+='<circle cx="77" cy="94" r="13" fill="#FFFFFF"/><circle cx="123" cy="94" r="13" fill="#FFFFFF"/>';
  s+='<circle cx="81" cy="96" r="6" fill="#26262B"/><circle cx="119" cy="96" r="6" fill="#26262B"/>';
  s+='<circle cx="83" cy="93" r="2" fill="#FFFFFF"/><circle cx="121" cy="93" r="2" fill="#FFFFFF"/>';
  s+='<ellipse cx="100" cy="124" rx="26" ry="19" fill="'+PK+'" stroke="'+DK+'" stroke-width="3"/>';
  s+='<ellipse cx="91" cy="124" rx="4.5" ry="7" fill="'+DK+'"/><ellipse cx="109" cy="124" rx="4.5" ry="7" fill="'+DK+'"/>';
  if(cheer)s+='<ellipse cx="100" cy="152" rx="14" ry="9" fill="#7A3232"/><ellipse cx="100" cy="156" rx="8" ry="4.5" fill="#E86A6A"/>';
  else s+='<path d="M92,149 Q100,155 108,149" fill="none" stroke="'+DK+'" stroke-width="3.5" stroke-linecap="round"/>';
  return uri(svg(200,170,s));
}
function pig(accent,pose){return memo('pig'+accent+pose,()=>pigData(accent,pose==='cheer'?'cheer':'idle'))}

// ---------------- 摩托猪 360x300 ----------------
function scooterData(){
  const PK='#F2A9B8',DK='#D97F93',RD='#E8483F',dk='rgba(0,0,0,.13)',TL='#4EC8C0';let s='';
  s+='<ellipse cx="192" cy="274" rx="152" ry="11" fill="rgba(0,0,0,.10)"/>';
  s+='<circle cx="106" cy="238" r="30" fill="#45454E"/><circle cx="106" cy="238" r="13" fill="#C9C9D2"/><circle cx="106" cy="238" r="4" fill="#45454E"/>';
  s+='<g transform="rotate(-5 76 140)"><rect x="20" y="60" width="112" height="156" rx="16" fill="#A5714A"/><rect x="20" y="60" width="112" height="36" rx="16" fill="#8F5530"/><rect x="20" y="82" width="112" height="14" fill="#8F5530"/><rect x="44" y="60" width="13" height="156" fill="#6B4226"/><rect x="95" y="60" width="13" height="156" fill="#6B4226"/><rect x="41" y="116" width="19" height="13" rx="2.5" fill="#E2483D"/><rect x="92" y="116" width="19" height="13" rx="2.5" fill="#E2483D"/></g>';
  s+='<rect x="84" y="196" width="176" height="28" rx="14" fill="'+RD+'"/>';
  s+='<ellipse cx="148" cy="192" rx="46" ry="15" fill="#5C3A28"/>';
  s+='<ellipse cx="170" cy="156" rx="54" ry="48" fill="'+RD+'"/>';
  s+='<path d="M126,186 C144,194 196,194 214,186" fill="none" stroke="#FFFFFF" stroke-width="5" opacity=".6" stroke-linecap="round"/>';
  s+='<rect x="176" y="192" width="20" height="30" rx="9" fill="'+PK+'"/>';
  s+='<ellipse cx="182" cy="60" rx="12" ry="21" fill="'+PK+'" transform="rotate(-20 182 60)"/><ellipse cx="182" cy="64" rx="5.5" ry="10" fill="'+DK+'" transform="rotate(-20 182 64)"/>';
  s+='<circle cx="212" cy="100" r="47" fill="'+PK+'"/>';
  s+='<path d="M167,90 C167,54 186,38 212,38 C238,38 257,54 257,90 Z" fill="'+RD+'"/>';
  s+='<rect x="162" y="82" width="100" height="13" rx="6.5" fill="'+RD+'"/><rect x="162" y="90" width="100" height="5" rx="2.5" fill="'+dk+'"/>';
  s+='<ellipse cx="190" cy="56" rx="12" ry="6.5" fill="#FFFFFF" opacity=".55" transform="rotate(-20 190 56)"/>';
  s+='<path d="M218,72 L236,68" stroke="#5C3A28" stroke-width="5" stroke-linecap="round" fill="none"/>';
  s+='<circle cx="230" cy="96" r="12" fill="#FFFFFF"/><circle cx="234" cy="98" r="5.5" fill="#26262B"/><circle cx="236" cy="95" r="1.8" fill="#FFFFFF"/>';
  s+='<ellipse cx="254" cy="113" rx="17" ry="14" fill="'+PK+'" stroke="'+DK+'" stroke-width="3"/><ellipse cx="259" cy="113" rx="4" ry="6" fill="'+DK+'"/>';
  s+='<path d="M273,116 C276,122 278,127 276,132 C274,137 269,136 268,131 C267,126 270,121 273,116 Z" fill="'+TL+'"/>';
  s+='<path d="M248,132 L266,128 L286,214 L266,219 Z" fill="'+RD+'"/>';
  s+='<circle cx="266" cy="162" r="15" fill="#F5C542" stroke="#D89A28" stroke-width="4"/>';
  s+='<path d="M232,144 L294,130" stroke="#5C3A28" stroke-width="11" stroke-linecap="round" fill="none"/>';
  s+='<path d="M188,150 C206,148 228,142 244,140" fill="none" stroke="'+RD+'" stroke-width="23" stroke-linecap="round"/>';
  s+='<circle cx="252" cy="140" r="12" fill="'+PK+'" stroke="'+DK+'" stroke-width="3"/>';
  s+='<path d="M234,238 A42,42 0 0 1 318,238 L300,238 A24,24 0 0 0 252,238 Z" fill="'+TL+'"/>';
  s+='<circle cx="276" cy="238" r="30" fill="#45454E"/><circle cx="276" cy="238" r="13" fill="#C9C9D2"/><circle cx="276" cy="238" r="4" fill="#45454E"/>';
  return uri(svg(360,300,s));
}
function scooterPig(){return memo('sc',scooterData)}

// ---------------- LOGO 520x260 ----------------
function logoData(){
  const G={
    a:['M30,20 L16,44','M22,42 L22,98','M46,22 L92,22','M88,24 L64,46 L90,46','M68,46 L68,94','M52,68 L88,68','M46,96 L94,96','M104,50 L104,72','M114,22 L114,98'],
    b:['M60,14 L60,90 C60,100 54,103 46,102','M16,34 L50,34 C50,56 42,74 24,88','M36,58 C30,72 22,82 10,90','M86,26 C90,50 100,70 114,84'],
    c:['M12,42 L44,42','M28,16 L28,92 C28,100 22,102 16,101','M14,76 L44,64','M60,24 L54,40','M52,44 C46,64 52,84 66,96','M88,22 L96,36','M92,38 C90,60 98,82 114,94'],
    d:['M38,12 L38,38','M38,22 L52,30','M20,52 L56,52 L56,84 L20,84 Z','M46,42 L112,42','M84,12 C90,42 94,74 97,96 C97,103 103,103 107,99','M108,14 L116,26']
  };
  const P=[['a',124,6],['b',280,6],['c',124,132],['d',280,132]];
  let s='<defs>';
  for(const k in G)s+='<g id="lg'+k+'">'+G[k].map(p=>'<path d="'+p+'"/>').join('')+'</g>';
  s+='<clipPath id="wsd1"><rect x="0" y="82" width="520" height="34"/></clipPath><clipPath id="wsd2"><rect x="0" y="208" width="520" height="34"/></clipPath></defs>';
  s+='<g fill="#7CC242"><circle cx="150" cy="120" r="66"/><circle cx="260" cy="84" r="74"/><circle cx="372" cy="118" r="64"/><circle cx="120" cy="196" r="56"/><circle cx="258" cy="172" r="84"/><circle cx="392" cy="196" r="60"/><circle cx="190" cy="236" r="44"/><circle cx="330" cy="232" r="48"/><circle cx="66" cy="64" r="9"/><circle cx="452" cy="52" r="11"/><circle cx="478" cy="236" r="12"/><circle cx="52" cy="246" r="8"/><circle cx="448" cy="150" r="7"/></g>';
  const uses=dy=>P.map(p=>'<use href="#lg'+p[0]+'" transform="translate('+p[1]+','+(p[2]+dy)+')"/>').join('');
  const st=(c,w)=>' fill="none" stroke="'+c+'" stroke-width="'+w+'" stroke-linecap="round" stroke-linejoin="round"';
  s+='<g'+st('#5C3A16',30)+'>'+uses(7)+'</g>';
  s+='<g'+st('#FFFFFF',30)+'>'+uses(0)+'</g>';
  s+='<g'+st('#FFC93C',20)+'>'+uses(0)+'</g>';
  s+='<g clip-path="url(#wsd1)"'+st('#E8821E',20)+'>'+P.slice(0,2).map(p=>'<use href="#lg'+p[0]+'" transform="translate('+p[1]+','+p[2]+')"/>').join('')+'</g>';
  s+='<g clip-path="url(#wsd2)"'+st('#E8821E',20)+'>'+P.slice(2).map(p=>'<use href="#lg'+p[0]+'" transform="translate('+p[1]+','+p[2]+')"/>').join('')+'</g>';
  const mini=(x,y,r,c1,c2)=>'<g transform="translate('+x+','+y+') rotate('+r+')"><rect x="-3.5" y="-28" width="7" height="12" rx="2.5" fill="#DDEEF8" opacity=".95"/><rect x="-8" y="-18" width="16" height="36" rx="7" fill="#DDEEF8" opacity=".95"/><rect x="-6" y="'+c2[0]+'" width="12" height="'+c2[1]+'" rx="5" fill="'+c1+'"/></g>';
  s+=mini(96,30,-28,'#3FA0D8',[0,16]);
  s+=mini(430,42,35,'#F5C542',[-2,20]);
  s+='<circle cx="80" cy="92" r="5" fill="#3FA0D8"/><circle cx="90" cy="106" r="4" fill="#3FA0D8"/>';
  s+='<circle cx="396" cy="98" r="6" fill="#F5C542"/><circle cx="386" cy="114" r="4.5" fill="#F5C542"/>';
  return uri(svg(520,260,s));
}
function logo(){return memo('logo',logoData)}

// ---------------- 玻璃瓶 100x190 ----------------
function bottle(){
  return memo('bottle',()=>{
    const d='M31,10 C31,4 69,4 69,10 C69,14 66,16 64,17 L64,42 C64,58 78,64 84,74 C88,80 90,84 90,92 L90,168 Q90,180 78,180 L22,180 Q10,180 10,168 L10,92 C10,84 12,80 16,74 C22,64 36,58 36,42 L36,17 C34,16 31,14 31,10 Z';
    const innerD='M40,22 L40,46 C40,56 34,60 28,66 C20,74 16,80 16,92 L16,168 Q16,176 26,176 L74,176 Q84,176 84,168 L84,92 C84,80 80,74 72,66 C66,60 60,56 60,46 L60,22 Z';
    let s='<path d="'+d+'" fill="rgba(255,255,255,.28)" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linejoin="round"/>';
    s+='<path d="M31,10 C31,4 69,4 69,10 C69,14 66,16 64,17 L64,22 L36,22 L36,17 C34,16 31,14 31,10 Z" fill="rgba(255,255,255,.38)"/>';
    s+='<rect x="19" y="94" width="7" height="74" rx="3.5" fill="rgba(255,255,255,.35)"/>';
    s+='<rect x="41" y="26" width="5" height="16" rx="2.5" fill="rgba(255,255,255,.30)"/>';
    s+='<path d="M20,166 Q20,172 28,172 L72,172 Q80,172 80,166" fill="none" stroke="rgba(255,255,255,.30)" stroke-width="2.5"/>';
    return {img:uri(svg(100,190,s)),innerD,inner:{x:16,y:22,w:68,h:154},mouth:{x:50,y:6},W:100,H:190};
  });
}

// ---------------- 图标 48x48 ----------------
const IC={
  pause:'<rect x="13" y="11" width="8" height="26" rx="4"/><rect x="27" y="11" width="8" height="26" rx="4"/>',
  play:'<path d="M17,12 C15.5,11 14,12 14,14 L14,34 C14,36 15.5,37 17,36 L35,25.5 C36.5,24.5 36.5,23.5 35,22.5 Z"/>',
  gear:(function(){let t='';for(let i=0;i<6;i++)t+='<rect x="20.5" y="5" width="7" height="9" rx="2.5" transform="rotate('+(i*60)+' 24 24)"/>';return t+'<circle cx="24" cy="24" r="12" fill="none" stroke="#8A5A2A" stroke-width="7"/>'})(),
  undo:'<path d="M13,23 C15,14 25,10 33,14 C39,17 41,24 39,30" fill="none" stroke="#8A5A2A" stroke-width="5.5" stroke-linecap="round"/><path d="M21,15 L12,22 L20,29" fill="none" stroke="#8A5A2A" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>',
  refresh:'<path d="M11,21 C13,13 22,9 30,12 C35,14 38,18 38,23" fill="none" stroke="#8A5A2A" stroke-width="5.5" stroke-linecap="round"/><path d="M43,13 L39,26 L28,19 Z"/><path d="M37,27 C35,35 26,39 18,36 C13,34 10,30 10,25" fill="none" stroke="#8A5A2A" stroke-width="5.5" stroke-linecap="round"/><path d="M5,35 L9,22 L20,29 Z"/>',
  plus:'<path d="M24,11 L24,37 M11,24 L37,24" fill="none" stroke="#8A5A2A" stroke-width="7" stroke-linecap="round"/>',
  bulb:'<path d="M24,4 L24,8 M9,10 L12,13 M39,10 L36,13" fill="none" stroke="#8A5A2A" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="20" r="10"/><path d="M19,28 L29,28 L27,38 L21,38 Z"/>',
  sound:'<path d="M8,19 L15,19 L24,11 L24,37 L15,29 L8,29 Z"/><path d="M30,17 C34,20 34,28 30,31 M35,12 C42,17 42,31 35,36" fill="none" stroke="#8A5A2A" stroke-width="4.5" stroke-linecap="round"/>',
  soundOff:'<path d="M8,19 L15,19 L24,11 L24,37 L15,29 L8,29 Z"/><path d="M30,18 L42,30 M42,18 L30,30" fill="none" stroke="#8A5A2A" stroke-width="4.5" stroke-linecap="round"/>',
  close:'<path d="M13,13 L35,35 M35,13 L13,35" fill="none" stroke="#8A5A2A" stroke-width="7" stroke-linecap="round"/>',
  star:'<path d="M24,8 L28.1,18.3 L39.2,19.1 L30.7,26.2 L33.4,36.9 L24,31 L14.6,36.9 L17.3,26.2 L8.8,19.1 L19.9,18.3 Z"/>'
};
function icon(name){return memo('ic'+name,()=>IC[name]?uri(svg(48,48,'<g fill="#8A5A2A">'+IC[name]+'</g>')):'' )}

// ---------------- 预热 + ready ----------------
const ACC=['#E8483F','#F5B93C','#3FA0D8'];
ACC.forEach(a=>{warm(pig(a,'idle'));warm(pig(a,'cheer'))});
warm(scooterPig());warm(logo());warm(bg());warm(bottle().img);
['pause','play','gear','undo','refresh','plus','bulb','sound','soundOff','close','star'].forEach(n=>warm(icon(n)));
const ready=Promise.all(imgs.map(im=>{try{return im.decode().catch(()=>{})}catch(e){return Promise.resolve()}}));

return {ready,bg,pig,scooterPig,logo,bottle,icon,setRoom,rooms,liquids};
})();
