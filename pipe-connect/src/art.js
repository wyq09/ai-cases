window.PC=window.PC||{};PC.ART=(()=>{
'use strict';
const palettes={
  classic:{sky:'#6DBAE4',water:'#55A8D6',waterDeep:'#4E9EC9',pipe:'#EEF0F6',flange:'#E9E9BE',flangeEdge:'#D6D69E',clove:'#D9D4E8',navy:'#2E3450',wheel:'#8D8FB5',spoke:'#EAE6C8',bracket:'#3FAE8C',gridLine:'rgba(255,255,255,0.9)',waterFlow:'#58B7EC',ghostAlpha:0.06},
  mint:{sky:'#6FC6B8',water:'#54B2A0',waterDeep:'#49A694',pipe:'#E4F5EA',flange:'#F0E3B2',flangeEdge:'#DCCD96',clove:'#D2E9DD',navy:'#2E3F4A',wheel:'#8FB5AA',spoke:'#EAE6C8',bracket:'#3F86AE',gridLine:'rgba(255,255,255,0.9)',waterFlow:'#3FBFA0',ghostAlpha:0.06},
  sand:{sky:'#EFC98F',water:'#E0B277',waterDeep:'#D3A262',pipe:'#F8F2E2',flange:'#C9714B',flangeEdge:'#B05A37',clove:'#EBD9B4',navy:'#4A3628',wheel:'#BC9E79',spoke:'#F4E6C4',bracket:'#6E9E5F',gridLine:'rgba(255,255,255,0.9)',waterFlow:'#4FA3C6',ghostAlpha:0.06}
};
let P=palettes.classic,cur='classic';
const cache={};
const uri=s=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
function memo(k,make){if(!cache[k])cache[k]=make();return cache[k]}
function hex2rgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function mix(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);return'#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')}
// 法兰：宽44高20圆角块，中心在连接边中点；右/下2px暗缘（两色拼）
function flange(cx,cy,vert){
  const w=vert?20:44,h=vert?44:20,x=cx-w/2,y=cy-h/2;
  return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="4" fill="'+P.flangeEdge+'"/>'+
         '<rect x="'+x+'" y="'+y+'" width="'+(w-2)+'" height="'+(h-2)+'" rx="4" fill="'+P.flange+'"/>';
}
function pipeStraight(){return memo('st',()=>uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'+
  '<rect x="37" width="26" height="100" fill="'+P.pipe+'"/>'+
  flange(50,0,0)+flange(50,100,0)+'</svg>'))}
function pipeElbow(){return memo('el',()=>uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'+
  '<path d="M50,0A50,50 0 0 0 100,50" fill="none" stroke="'+P.pipe+'" stroke-width="26"/>'+
  flange(50,0,0)+flange(100,50,1)+'</svg>'))}
function waterPath(kind){return kind==='elbow'?'M50,0A50,50 0 0 0 100,50':'M50,0L50,100'}
function pipeLen(kind){return kind==='elbow'?78.54:100}
function valve(){return memo('v',()=>uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">'+
  '<rect x="76" width="48" height="220" fill="'+P.navy+'"/>'+
  '<circle cx="100" cy="110" r="84" fill="none" stroke="'+P.wheel+'" stroke-width="30"/>'+
  '<path d="M100,110 149,61M100,110 51,61M100,110 149,159M100,110 51,159" fill="none" stroke="'+P.spoke+'" stroke-width="22"/>'+
  '<circle cx="100" cy="110" r="29" fill="'+P.navy+'"/><circle cx="100" cy="110" r="11" fill="'+P.wheel+'"/>'+
  '<rect x="6" width="30" height="104" rx="3" fill="'+P.bracket+'"/>'+
  '<rect x="164" width="30" height="104" rx="3" fill="'+P.bracket+'"/>'+
  '</svg>'))}
function outletPipe(){return memo('o',()=>uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">'+
  '<rect x="38" y="10" width="24" height="120" fill="'+P.navy+'"/>'+
  '<rect id="pcWater" x="43" y="14" width="14" height="112" fill="'+P.waterFlow+'" opacity="0"/>'+
  flange(50,10,0)+flange(50,130,0)+'</svg>'))}
function cloud(i){return memo('c'+i,()=>{
  const c=mix(P.sky,'#FFFFFF',0.28);
  const b=i==1?
    '<circle cx="22" cy="26" r="12"/><circle cx="40" cy="20" r="14"/><circle cx="58" cy="27" r="10"/><rect x="12" y="22" width="56" height="15" rx="7.5"/>':
    '<circle cx="26" cy="34" r="15"/><circle cx="48" cy="26" r="19"/><circle cx="68" cy="34" r="13"/><rect x="14" y="30" width="62" height="18" rx="9"/>';
  const vb=i==1?'0 0 84 44':'0 0 96 54';
  return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+vb+'"><g fill="'+c+'">'+b+'</g></svg>')})}
function dove(){return memo('d',()=>{
  const w=mix('#FFFFFF',P.navy,0.16);
  return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 84">'+
  '<path d="M56,36 Q58,12 84,4 Q84,24 66,38 Z" fill="'+w+'"/>'+
  '<path d="M20,50 Q34,34 58,34 Q82,34 94,46 L110,42 Q102,56 88,60 Q66,68 44,64 Q26,60 20,50 Z" fill="#FDFEFF"/>'+
  '<path d="M22,46 L8,50 L23,53 Z" fill="#F2C14E"/>'+
  '<circle cx="30" cy="44" r="2.5" fill="'+P.navy+'"/></svg>')})}
function clock(){return memo('k',()=>{
  const R='#E8503A', B='#3F4A5E';
  return uri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'+
  '<path d="M20.5 6 Q24 1.5 27.5 6 Z" fill="#F2C94C"/>'+
  '<circle cx="12" cy="10" r="6.5" fill="'+B+'"/><circle cx="36" cy="10" r="6.5" fill="'+B+'"/>'+
  '<rect x="9" y="38" width="7" height="6" rx="1.5" fill="'+B+'" transform="rotate(20 12 41)"/>'+
  '<rect x="32" y="38" width="7" height="6" rx="1.5" fill="'+B+'" transform="rotate(-20 35 41)"/>'+
  '<circle cx="24" cy="26" r="16" fill="'+B+'"/><circle cx="24" cy="26" r="12.5" fill="#FFFFFF"/>'+
  '<g fill="#B9C0CB"><circle cx="24" cy="16.5" r="1.4"/><circle cx="31" cy="19" r="1.4"/><circle cx="33.5" cy="26" r="1.4"/><circle cx="31" cy="33" r="1.4"/><circle cx="24" cy="35.5" r="1.4"/><circle cx="17" cy="33" r="1.4"/><circle cx="14.5" cy="26" r="1.4"/><circle cx="17" cy="19" r="1.4"/></g>'+
  '<path d="M24,26 24,17M24,26 31,26" fill="none" stroke="'+R+'" stroke-width="2.6" stroke-linecap="round"/>'+
  '<circle cx="24" cy="26" r="2" fill="'+R+'"/></svg>')})}
function setPalette(name){if(palettes[name]){cur=name;P=palettes[name];for(const k in cache)delete cache[k]}}
return {pipeStraight,pipeElbow,waterPath,pipeLen,valve,outletPipe,cloud,dove,clock,setPalette,palettes};
})();
