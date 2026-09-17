(function(){
'use strict';
const JJ=window.JJ=window.JJ||{};
function path(c,pts,color){c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=color;c.fill();}
function shade(hex,k){const v=parseInt(hex.slice(1),16);return 'rgb('+[(v>>16)&255,(v>>8)&255,v&255].map(x=>Math.round(x*k)).join(',')+')';}
function platform(c,p,project){
const s=p.size/2,z=p.height,pt=(x,y,h)=>project(p.x+x,p.y+y,h);
const a=pt(-s,-s,z),b=pt(s,-s,z),d=pt(-s,s,z),e=pt(s,s,z),a0=pt(-s,-s,0),b0=pt(s,-s,0),d0=pt(-s,s,0);
path(c,[pt(-s+15,-s-18,0),pt(s+20,-s-18,0),pt(s+20,s-18,0),pt(-s+15,s-18,0)],'rgba(49,54,46,.10)');
const col=p.color||'#b7cbbb';
if(['cylinder','manhole','record'].includes(p.type)){
const center=pt(0,0,z),bottom=pt(0,0,0),rx=s*1.216,ry=s*.707;
c.fillStyle=shade(col,.78);c.beginPath();c.ellipse(bottom.x,bottom.y,rx,ry,0,0,Math.PI);c.lineTo(center.x-rx,center.y);c.ellipse(center.x,center.y,rx,ry,0,Math.PI,0);c.closePath();c.fill();
c.fillStyle=p.type==='record'?'#343a35':p.type==='manhole'?'#949b8e':col;c.beginPath();c.ellipse(center.x,center.y,rx,ry,0,0,Math.PI*2);c.fill();
if(p.type!=='cylinder'){c.strokeStyle=p.type==='record'?'#5a6259':'#788170';for(let i=1;i<6;i++){c.beginPath();c.ellipse(center.x,center.y,rx*i/6,ry*i/6,0,0,Math.PI*2);c.stroke();}c.fillStyle=p.type==='record'?'#d8b84d':'#bbc0b6';c.beginPath();c.ellipse(center.x,center.y,rx*.20,ry*.20,0,0,Math.PI*2);c.fill();}
}else{
path(c,[a,b,b0,a0],shade(col,.83));path(c,[a,d,d0,a0],shade(col,.68));path(c,[a,b,e,d],col);
c.strokeStyle='rgba(255,255,255,.3)';c.beginPath();c.moveTo(d.x,d.y);c.lineTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
if(p.type==='rubik'){const colors=['#f0df7c','#e87e5d','#eeeee3','#80a98c','#ecb565','#e87e5d','#d5dcd5','#7ea898','#efd17a'];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let x=-s+i*p.size/3+2,y=-s+j*p.size/3+2,w=p.size/3-4;path(c,[pt(x,y,z+.2),pt(x+w,y,z+.2),pt(x+w,y+w,z+.2),pt(x,y+w,z+.2)],colors[i*3+j]);}}
if(p.type==='shop'){path(c,[pt(-s*.8,-s*.8,z+1),pt(s*.8,-s*.8,z+1),pt(s*.8,s*.8,z+1),pt(-s*.8,s*.8,z+1)],'#f2f0df');const q=pt(0,0,z+2);c.save();c.translate(q.x,q.y);c.transform(.86,-.5,.86,.5,0,0);c.fillStyle='#dc795f';c.fillRect(-s*.8,-s*.8,s*1.6,12);c.fillStyle='#475b49';c.font='bold 18px sans-serif';c.textAlign='center';c.fillText('SHOP',0,8);c.restore();}
}
}
function pawn(c,p,project){const q=project(p.x,p.y,p.z);c.save();c.translate(q.x,q.y);c.globalAlpha=p.opacity??1;c.rotate(p.rotation||0);const squash=p.squash||0;c.scale(1+squash*.45,1-squash*.45);const g=c.createLinearGradient(-14,0,16,0);g.addColorStop(0,'#424744');g.addColorStop(.55,'#242725');g.addColorStop(1,'#111512');c.fillStyle=g;c.beginPath();c.moveTo(-14,-3);c.bezierCurveTo(-14,-14,-6,-26,-6,-35);c.lineTo(6,-35);c.bezierCurveTo(6,-26,14,-14,14,-3);c.ellipse(0,-3,14,5,0,0,Math.PI);c.fill();c.beginPath();c.arc(0,-46,11,0,Math.PI*2);c.fill();c.fillStyle='rgba(255,255,255,.12)';c.beginPath();c.ellipse(-4,-49,3,5,.4,0,Math.PI*2);c.fill();c.restore();}
JJ.ART={platform,pawn};
})();
