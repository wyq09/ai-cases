window.SH=window.SH||{};
SH.ART=(()=>{
'use strict';
// ---------------- 基础 ----------------
const uri=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
const svg=(w,h,b)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'">'+b+'</svg>';
const OUT='#4A3B2A';
const cache={};
function memo(k,make){if(!(k in cache))cache[k]=make();return cache[k]}
const imgs=[];
function warm(src){const im=new Image();im.src=src;imgs.push(im);return src}

// ---------------- 14 种牌面图标 48x48（田园扁平剪影 + 2px 深描边，禁 emoji） ----------------
const IC={
// 胡萝卜：橙锥形根 + 三片绿缨
carrot:()=>
  '<path d="M18.2,9.4 C14.4,9 12,6.6 12.1,3.4 C15.3,3.7 17.7,5.9 18.4,9.2 Z" fill="#5CA34F"/>'+
  '<path d="M29.8,9.4 C33.6,9 36,6.6 35.9,3.4 C32.7,3.7 30.3,5.9 29.6,9.2 Z" fill="#5CA34F"/>'+
  '<path d="M22.4,9.2 C21.2,5.6 22.2,2.8 24.8,1.6 C26.6,4 26,7.2 24.2,9.4 Z" fill="#5CA34F"/>'+
  '<path d="M16,14 C16,9.6 19.4,8 24,8 C28.6,8 32,9.6 32,14 C32,21.5 27.6,32.6 25.1,39.3 C24.7,40.4 23.3,40.4 22.9,39.3 C20.4,32.6 16,21.5 16,14 Z" fill="#EF7E27"/>'+
  '<path d="M18.6,19.5 L23.4,19.5 M20.2,25.8 L24,25.8 M21.8,31.6 L24.4,31.6" fill="none" stroke="#C85F17" stroke-width="1.8"/>',
// 白菜：绿叶球 + 底部白帮的大白菜
cabbage:()=>
  '<path d="M16,30 L32,30 C33.4,36.5 32.6,41 30.4,43.6 L17.6,43.6 C15.4,41 14.6,36.5 16,30 Z" fill="#F4F1DE" stroke="#4A3B2A" stroke-width="1.8"/>'+
  '<path d="M20.6,33 L20,42.5 M27.4,33 L28,42.5" fill="none" stroke="#D8D3B4" stroke-width="1.6"/>'+
  '<path d="M24,5.5 C33.5,5.5 41,12 41,20.5 C41,28.5 33.5,33.5 24,33.5 C14.5,33.5 7,28.5 7,20.5 C7,12 14.5,5.5 24,5.5 Z" fill="#7FA83F" stroke="#4A3B2A" stroke-width="1.8"/>'+
  '<path d="M24,6.5 C29,10 31.5,15 30.8,21.5 C30.2,27 27.8,30.8 24,33 C20.2,30.8 17.8,27 17.2,21.5 C16.5,15 19,10 24,6.5 Z" fill="#8FB94A"/>'+
  '<path d="M24,7.5 C26.5,12 27.2,19 25.8,26.5 C25.3,29 24.7,31 24,32.4 C23.3,31 22.7,29 22.2,26.5 C20.8,19 21.5,12 24,7.5 Z" fill="#A9C75B"/>'+
  '<path d="M10.5,26.5 C13,30 17,32.3 22,33.1 M37.5,26.5 C35,30 31,32.3 26,33.1" fill="none" stroke="#5C7F30" stroke-width="1.8"/>',
// 玉米：黄玉米棒 + 绿苞叶
corn:()=>
  '<path d="M16.5,10.5 C16.5,6.2 20,4.2 24,4.2 C28,4.2 31.5,6.2 31.5,10.5 L31.5,29.5 C31.5,31.6 28.8,33 24,33 C19.2,33 16.5,31.6 16.5,29.5 Z" fill="#F8CC45"/>'+
  '<path d="M20.3,6 L20.3,31.8 M27.7,6 L27.7,31.8 M17.2,13.5 L30.8,13.5 M16.9,20.2 L31.1,20.2 M17.2,26.8 L30.8,26.8" fill="none" stroke="#E3AC33" stroke-width="1.6"/>'+
  '<path d="M16.5,13 C10.8,16.6 7.9,23.4 8.9,31.4 C9.5,36 11.2,39.8 14,42.6 C15.4,37.2 16.3,28.6 16.5,19 Z" fill="#7FA83F"/>'+
  '<path d="M31.5,13 C37.2,16.6 40.1,23.4 39.1,31.4 C38.5,36 36.8,39.8 34,42.6 C32.6,37.2 31.7,28.6 31.5,19 Z" fill="#7FA83F"/>'+
  '<path d="M24,25 C21.9,30 21.8,35.4 24,41.2 C26.2,35.4 26.1,30 24,25 Z" fill="#8FB94A"/>',
// 蘑菇：砖红伞盖白点 + 米色菌柄
mushroom:()=>
  '<path d="M17.6,27.5 L17,35.6 C16.8,38.8 18.6,40.8 21.8,40.8 L26.2,40.8 C29.4,40.8 31.2,38.8 31,35.6 L30.4,27.5 Z" fill="#F6EEDC"/>'+
  '<path d="M8.5,22.5 C8.5,12.8 15.5,6 24,6 C32.5,6 39.5,12.8 39.5,22.5 C39.5,25.4 37.7,27.5 34.6,27.5 L13.4,27.5 C10.3,27.5 8.5,25.4 8.5,22.5 Z" fill="#CE5341"/>'+
  '<ellipse cx="16.8" cy="15.6" rx="3.1" ry="2.5" fill="#F6EEDC" stroke="none"/>'+
  '<ellipse cx="26.5" cy="12" rx="3.4" ry="2.6" fill="#F6EEDC" stroke="none"/>'+
  '<ellipse cx="32.6" cy="20" rx="2.7" ry="2.1" fill="#F6EEDC" stroke="none"/>',
// 剪刀：浅钢灰双刃交叉 + 红柄环
scissors:()=>
  '<path d="M25.4,25 L14.8,6.8 C14,5.4 15.6,4.1 16.8,5.2 L28.6,22.2 Z" fill="#9BA8B5"/>'+
  '<path d="M22.6,25 L33.2,6.8 C34,5.4 32.4,4.1 31.2,5.2 L19.4,22.2 Z" fill="#9BA8B5"/>'+
  '<path d="M23.2,28.4 L18.8,33.4 M24.8,28.4 L29.2,33.4" fill="none" stroke-width="6.4"/>'+
  '<path d="M23.2,28.4 L18.8,33.4 M24.8,28.4 L29.2,33.4" fill="none" stroke="#C24B3B" stroke-width="3.8"/>'+
  '<circle cx="16.6" cy="37.6" r="5.6" fill="none" stroke-width="7"/>'+
  '<circle cx="16.6" cy="37.6" r="5.6" fill="none" stroke="#C24B3B" stroke-width="3.8"/>'+
  '<circle cx="31.4" cy="37.6" r="5.6" fill="none" stroke-width="7"/>'+
  '<circle cx="31.4" cy="37.6" r="5.6" fill="none" stroke="#C24B3B" stroke-width="3.8"/>'+
  '<circle cx="24" cy="26.8" r="2.2" fill="'+OUT+'" stroke="none"/>',
// 火苗：猩红外焰 + 橙黄内芯
flame:()=>
  '<path d="M26.2,3 C27,8.6 25,12.4 21.4,16.4 C17.6,20.8 11.6,24.6 11.6,30.8 C11.6,38.2 17,43.4 24.4,43.4 C32,43.4 37.4,37.8 37.4,30.2 C37.4,23.2 32.4,19.6 29.2,13.8 C28,11.4 26.6,7.4 26.2,3 Z" fill="#E8452D"/>'+
  '<path d="M25,21.4 C22.4,25.2 19.2,27.6 19.2,31.8 C19.2,36 21.7,38.9 25,38.9 C28.4,38.9 30.8,36.2 30.8,32.4 C30.8,28.6 27.6,26.4 25,21.4 Z" fill="#F9A03A"/>'+
  '<path d="M25.2,30 C23.8,32.2 22.8,33.5 22.8,35.4 C22.8,37.3 23.9,38.6 25.4,38.6 C27,38.6 28.1,37.3 28.1,35.5 C28.1,33.8 26.7,32.4 25.2,30 Z" fill="#FCD98A" stroke="none"/>',
// 草：一丛青草叶
grass:()=>
  '<path d="M15.3,41.5 C11.6,33.6 9.6,25.2 10.5,16.4 C10.7,14.5 13.2,14.2 13.9,16 C16.5,23.2 17.9,32.2 18.9,41.5 Z" fill="#55A24C"/>'+
  '<path d="M29.1,41.5 C30.1,32.2 31.5,23.2 34.1,16 C34.8,14.2 37.3,14.5 37.5,16.4 C38.4,25.2 36.4,33.6 32.7,41.5 Z" fill="#55A24C"/>'+
  '<path d="M22.9,41.5 C22.5,29 23.7,16.6 27.9,7.6 C28.7,5.9 31.2,6.5 31,8.5 C29.9,19.4 27.9,30.8 26.7,41.5 Z" fill="#55A24C"/>'+
  '<path d="M19.2,41.5 C18.3,36.2 18.2,31.2 19.1,26.2 C19.4,24.5 21.9,24.5 22.3,26.2 C22.9,31.6 22.5,36.8 21.5,41.5 Z" fill="#55A24C"/>',
// 松树：三层深绿塔冠 + 棕树干
pine:()=>
  '<path d="M21,36 L27,36 L27,44 C27,44.9 26.3,45.6 25.4,45.6 L22.6,45.6 C21.7,45.6 21,44.9 21,44 Z" fill="#7A4E2C"/>'+
  '<path d="M24,19.5 L40.5,40.5 L7.5,40.5 Z" fill="#3E7C50"/>'+
  '<path d="M24,10.5 L36.8,27.4 L11.2,27.4 Z" fill="#3E7C50"/>'+
  '<path d="M24,3 L33.4,16.4 L14.6,16.4 Z" fill="#3E7C50"/>',
// 棉花：米白三瓣棉桃 + 棕壳短茎
cotton:()=>
  '<path d="M22.7,45.6 C22,41.6 21.7,38.4 21.9,33.5 L26.1,33.5 C26.3,38.4 26,41.6 25.3,45.6 Z" fill="#8A5A34"/>'+
  '<circle cx="16.2" cy="19.8" r="6.4" fill="#F8F2E3"/>'+
  '<circle cx="31.8" cy="19.8" r="6.4" fill="#F8F2E3"/>'+
  '<circle cx="24" cy="13.6" r="7.4" fill="#F8F2E3"/>'+
  '<circle cx="24" cy="21.4" r="5.6" fill="#F8F2E3"/>'+
  '<path d="M13.9,32.8 C13.5,27.8 17.3,24.6 24,24.6 C30.7,24.6 34.5,27.8 34.1,32.8 C31.2,31 27.9,32.4 24,32.4 C20.1,32.4 16.8,31 13.9,32.8 Z" fill="#8A5A34"/>',
// 水桶：钢蓝提桶 + 深蓝沿口提梁
bucket:()=>
  '<path d="M11.5,12.5 C11.5,2.6 36.5,2.6 36.5,12.5" fill="none" stroke-width="2.6"/>'+
  '<path d="M10.2,15 L37.8,15 L35.2,38.6 C34.9,41 33,42.4 30.6,42.4 L17.4,42.4 C15,42.4 13.1,41 12.8,38.6 Z" fill="#5E88A3"/>'+
  '<path d="M8.6,10.8 L39.4,10.8 L39.4,13.4 C39.4,15 38.1,16.2 36.5,16.2 L11.5,16.2 C9.9,16.2 8.6,15 8.6,13.4 Z" fill="#4E7490"/>'+
  '<path d="M17.6,20.6 L19.2,36.4" stroke="#7FA6BC" stroke-width="2.2" fill="none"/>'+
  '<path d="M14,25.4 L34,25.4" stroke="#4A6578" stroke-width="1.8" fill="none"/>',
// 镰刀：深灰蓝弯刃 + 木柄
sickle:()=>
  '<path d="M16.4,31.6 C27.8,29.4 36.6,21.8 39.4,10.6 C40,8.2 37.4,6.4 35.6,8.2 C30.6,16.4 23.6,21.4 15.2,23.4 C12.6,26 13.6,29.2 16.4,31.6 Z" fill="#4F5C6B"/>'+
  '<path d="M18.4,27.4 C26,24.4 31.8,19.4 35.2,13.2" fill="none" stroke="#7C8B9C" stroke-width="1.8"/>'+
  '<path d="M14.8,29.8 L9,35.6" fill="none" stroke-width="7"/>'+
  '<path d="M14.8,29.8 L9,35.6" fill="none" stroke="#9C6B3B" stroke-width="4.2"/>',
// 草叉：钢灰三齿 + 木柄
fork:()=>
  '<path d="M13.2,5.2 C12.1,5.2 11.2,6.1 11.2,7.2 L11.2,18.6 L15.2,18.6 L15.2,7.2 C15.2,6.1 14.3,5.2 13.2,5.2 Z" fill="#9BA8B5"/>'+
  '<path d="M24,5.2 C22.9,5.2 22,6.1 22,7.2 L22,18.6 L26,18.6 L26,7.2 C26,6.1 25.1,5.2 24,5.2 Z" fill="#9BA8B5"/>'+
  '<path d="M34.8,5.2 C33.7,5.2 32.8,6.1 32.8,7.2 L32.8,18.6 L36.8,18.6 L36.8,7.2 C36.8,6.1 35.9,5.2 34.8,5.2 Z" fill="#9BA8B5"/>'+
  '<rect x="9.8" y="17" width="28.4" height="5" rx="2.5" fill="#8A97A5"/>'+
  '<path d="M21.7,21.5 L21.7,40.2 C21.7,42.3 22.7,43.4 24,43.4 C25.3,43.4 26.3,42.3 26.3,40.2 L26.3,21.5 Z" fill="#A56A33"/>',
// 草帽：麦秆金宽檐 + 红帽带
hat:()=>
  '<ellipse cx="24" cy="29.6" rx="20" ry="7.2" fill="#E4BA62"/>'+
  '<ellipse cx="24" cy="29.6" rx="14.6" ry="4.7" fill="none" stroke="#C89B44" stroke-width="1.6"/>'+
  '<path d="M14,30 C14,19.8 17.9,14.2 24,14.2 C30.1,14.2 34,19.8 34,30 C30.9,31.7 27.5,32.5 24,32.5 C20.5,32.5 17.1,31.7 14,30 Z" fill="#E4BA62"/>'+
  '<path d="M14.4,26.2 C17.1,28.2 20.4,29.3 24,29.3 C27.6,29.3 30.9,28.2 33.6,26.2" fill="none" stroke="#C24B3B" stroke-width="4"/>'+
  '<path d="M19.2,17.4 C20.6,16.4 22.2,15.9 24,15.9 C25.8,15.9 27.4,16.4 28.8,17.4" fill="none" stroke="#C89B44" stroke-width="1.6"/>',
// 手套：棕褐园艺手套 + 绿袖口
glove:()=>
  '<path d="M14.6,41 L14.6,20 C14.6,13.9 18.9,9.6 25,9.6 C31.1,9.6 35.4,13.9 35.4,20 L35.4,41 Z" fill="#CE9E68"/>'+
  '<path d="M16.7,18.8 C13.7,16 10.1,16.2 8.9,18.6 C7.7,21 9.1,24 12.1,25.4 C13.5,26.1 15.1,26.2 16.7,25.8 Z" fill="#CE9E68"/>'+
  '<path d="M13.6,36.2 L36.4,36.2 L36.4,39.2 C36.4,40.6 35.3,41.7 33.9,41.7 L16.1,41.7 C14.7,41.7 13.6,40.6 13.6,39.2 Z" fill="#7FA83F"/>'+
  '<path d="M15,38.9 L35,38.9" stroke="#5F8F33" stroke-width="1.6" fill="none"/>'+
  '<path d="M20.6,15.4 C22,14.6 23.4,14.2 25,14.2 C26.6,14.2 28,14.6 29.4,15.4" stroke="#B98A52" stroke-width="1.6" fill="none"/>'
};
const KINDS=['carrot','cabbage','corn','mushroom','scissors','flame','grass','pine','cotton','bucket','sickle','fork','hat','glove'];
function icon(kindId,customURI){
  if(customURI)return customURI;
  return memo('ic'+kindId,()=>IC[kindId]?uri(svg(48,48,'<g stroke="'+OUT+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+IC[kindId]()+'</g>')):'');
}

// ---------------- 背景 690x1232 竖屏（低饱和，上天空下草地，不抢米白牌面） ----------------
function bgData(t){
  const P=t===1?
    {// 黄昏牧场：杏橙天 + 深绿草坡 + 栅栏 + 飞鸟
     sky1:'#EFC287',sky2:'#F8DDB0',cloud:'#F7E2C1',sun:'#F2A65B',
     hill1:'#77875C',hill2:'#5F7148',field:'#6E7F4F',deep:'#5D6C41',
     post:'#4E3B28',rail:'#68503A',tuft:'#5A6A40',tuft2:'#4E5C36',dusk:true}:
    {// 清晨羊圈：暖米黄天 + 草坡 + 木栅栏剪影 + 云
     sky1:'#F3E6C8',sky2:'#F9F1DD',cloud:'#FCF7EA',sun:'#F6DEA2',
     hill1:'#C3CE9C',hill2:'#A8B77E',field:'#95A76D',deep:'#86975E',
     post:'#77573A',rail:'#8A6744',tuft:'#7E9059',tuft2:'#758651',dusk:false};
  let s='<defs><linearGradient id="shbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+P.sky1+'"/><stop offset="1" stop-color="'+P.sky2+'"/></linearGradient></defs>';
  s+='<rect width="690" height="780" fill="url(#shbg)"/>';
  if(P.dusk){
    s+='<circle cx="150" cy="540" r="92" fill="'+P.sun+'" opacity=".25"/><circle cx="150" cy="540" r="62" fill="'+P.sun+'"/>';
  }else{
    s+='<circle cx="566" cy="148" r="52" fill="'+P.sun+'" opacity=".75"/>';
  }
  const cl=(x,y,k,o)=>'<g fill="'+P.cloud+'" opacity="'+o+'"><ellipse cx="'+x+'" cy="'+y+'" rx="'+(34*k)+'" ry="'+(13*k)+'"/><ellipse cx="'+(x+30*k)+'" cy="'+(y-9*k)+'" rx="'+(24*k)+'" ry="'+(11*k)+'"/><ellipse cx="'+(x+58*k)+'" cy="'+y+'" rx="'+(20*k)+'" ry="'+(9*k)+'"/></g>';
  if(P.dusk){s+=cl(430,180,1.5,.8)+cl(120,300,1.1,.7)+cl(560,330,.9,.6);}
  else{s+=cl(150,150,1.5,.95)+cl(420,240,1.1,.85)+cl(580,110,.85,.8);}
  s+='<path d="M0,566 C120,474 300,470 420,524 C522,570 622,544 690,504 L690,800 L0,800 Z" fill="'+P.hill1+'"/>';
  if(!P.dusk){
    const sh=(x,y,k)=>'<g><ellipse cx="'+x+'" cy="'+y+'" rx="'+(24*k)+'" ry="'+(14*k)+'" fill="#F6F0DE"/><circle cx="'+(x+20*k)+'" cy="'+(y-7*k)+'" r="'+(7*k)+'" fill="#5D4A33"/><path d="M'+(x-10*k)+' '+(y+13*k)+' L'+(x-10*k)+' '+(y+20*k)+' M'+(x+8*k)+' '+(y+13*k)+' L'+(x+8*k)+' '+(y+20*k)+'" stroke="#5D4A33" stroke-width="'+(3*k)+'" fill="none"/></g>';
    s+=sh(190,540,1)+sh(262,556,.72);
  }
  s+='<rect y="760" width="690" height="472" fill="'+P.field+'"/>';
  s+='<path d="M0,678 C110,620 280,614 400,666 C510,714 622,698 690,658 L690,880 L0,880 Z" fill="'+P.hill2+'"/>';
  for(let i=0;i<7;i++){const x=28+i*106;s+='<rect x="'+x+'" y="636" width="12" height="98" rx="4" fill="'+P.post+'"/>';}
  s+='<rect y="652" width="690" height="10" fill="'+P.rail+'"/><rect y="686" width="690" height="10" fill="'+P.rail+'"/>';
  if(P.dusk){
    const bd=(x,y,k)=>'<path d="M'+x+','+y+' q'+(11*k)+','+(-10*k)+' '+(22*k)+',0 q'+(11*k)+','+(-10*k)+' '+(22*k)+',0" fill="none" stroke="'+P.post+'" stroke-width="3" stroke-linecap="round" opacity=".75"/>';
    s+=bd(430,215,1)+bd(180,258,.8)+bd(322,168,.65);
  }
  s+='<rect y="1036" width="690" height="196" fill="'+P.deep+'"/>';
  const tuft=(x,y,k,c)=>'<path d="M'+x+' '+y+' C'+(x-2*k)+' '+(y-12*k)+' '+(x-3*k)+' '+(y-20*k)+' '+(x-8*k)+' '+(y-26*k)+' M'+x+' '+y+' C'+x+' '+(y-14*k)+' '+x+' '+(y-22*k)+' '+(x+2*k)+' '+(y-30*k)+' M'+x+' '+y+' C'+(x+2*k)+' '+(y-11*k)+' '+(x+4*k)+' '+(y-18*k)+' '+(x+9*k)+' '+(y-23*k)+'" fill="none" stroke="'+c+'" stroke-width="'+(2.5*k)+'" stroke-linecap="round" opacity=".5"/>';
  s+=tuft(80,860,1.4,P.tuft)+tuft(600,900,1.6,P.tuft)+tuft(320,950,1.3,P.tuft);
  s+=tuft(170,1120,1.8,P.tuft2)+tuft(500,1160,1.6,P.tuft2)+tuft(360,1105,1.4,P.tuft2);
  if(!P.dusk)s+='<g fill="#E3D3A0" opacity=".55"><circle cx="126" cy="942" r="4"/><circle cx="130" cy="949" r="3"/><circle cx="452" cy="1004" r="4"/><circle cx="456" cy="1011" r="3"/></g>';
  return uri(svg(690,1232,s));
}
function bg(themeIdx,customURI){
  if(customURI)return customURI;
  return memo('bg'+themeIdx,()=>bgData(themeIdx===1?1:0));
}

// ---------------- 牌面配色 ----------------
const SKINS=[
  {fill:'#FDF8EE',edge:'#D8C9A8',line:'#B49F78'},   // 0 米白
  {fill:'#F3EDDF',edge:'#CFC3A4',line:'#A89772'},   // 1 纸浆
  {fill:'#EDF6EF',edge:'#BCD4C2',line:'#8FB89B'}    // 2 薄荷
];
function tileSkin(i){return SKINS[i]||SKINS[0]}

// ---------------- 预热 + ready ----------------
KINDS.forEach(k=>warm(icon(k)));
warm(bg(0));warm(bg(1));
const ready=Promise.all(imgs.map(im=>{try{return im.decode().catch(()=>{})}catch(e){return Promise.resolve()}}));

return {ready,KINDS,icon,bg,tileSkin};
})();
