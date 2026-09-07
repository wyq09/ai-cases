from scene_lib import *
import json

def make_landmarks(data,cs,m,H,XY,window):
 C=cs['04_Landmarks']
 print('LANDMARK Bagua',flush=True)
 b=next(b for b in data['buildings'] if b['id']==164652578);cx,cy=b['center'];z=b['base'];ang=math.radians(44)
 def P(x,y,h):return (cx+x*cos(ang)-y*sin(ang),cy+x*sin(ang)+y*cos(ang),z+h)
 a=Geo('LM_Bagua_Mansion_八卦楼',C)
 a.box(P(0,0,.3),(56,38,.6),m['granite'],ang)
 a.box(P(0,0,6.7),(48,29,12.8),m['brick'],ang)
 for level in [1,5.0,9.2,13.5]:a.box(P(0,0,level),(55.5,37.4,.35),m['ivory'],ang)
 for floor in range(3):
  base=1.2+floor*4.15
  for side in [-1,1]:
   for x in range(-24,25,4):
    a.beam(P(x,side*17.5,base),P(x,side*17.5,base+3.9),.38,m['ivory'],12,r2=.30)
    a.box(P(x,side*17.5,base+.12),(.96,.96,.24),m['ivory'],ang)
    a.box(P(x,side*17.5,base+3.8),(1.04,1.04,.3),m['ivory'],ang)
    mid=P(x,side*14.55,base+.45);window(a,mid,(cos(ang),sin(ang),0),(-sin(ang)*side,cos(ang)*side,0),mid[2],1.5,2.2,arched=floor==2)
   for y in [-13,-9,-5,-1,3,7,11]:
    a.beam(P(side*26.4,y,base),P(side*26.4,y,base+3.9),.36,m['ivory'],12,r2=.29)
    mid=P(side*24.1,y,base+.45);window(a,mid,(-sin(ang),cos(ang),0),(cos(ang)*side,sin(ang)*side,0),mid[2],1.5,2.2,arched=floor==2)
 # Terrace balustrades all around the roof.
 outline=[P(-27.3,-18.2,13.7),P(27.3,-18.2,13.7),P(27.3,18.2,13.7),P(-27.3,18.2,13.7),P(-27.3,-18.2,13.7)]
 rail(a,outline,m['ivory'],.9,.95)
 hiproof(a,(cx,cy),49,31,z+14.1,4.3,m['roof'],m['ivory'],ang)
 # Octagonal upper storey; dome has continuous curved ribs.
 for i in range(8):
  t=2*pi*i/8+ang;q=2*pi*(i+1)/8+ang
  for r,h in [(12.3,16.4),(12.3,18.3)]:a.beam((cx+r*cos(t),cy+r*sin(t),z+h),(cx+r*cos(q),cy+r*sin(q),z+h),.18,m['ivory'],6)
  a.face([(cx+12*cos(t),cy+12*sin(t),z+16.4),(cx+12*cos(q),cy+12*sin(q),z+16.4),(cx+12*cos(q),cy+12*sin(q),z+18.2),(cx+12*cos(t),cy+12*sin(t),z+18.2)],m['roof'])
 a.beam(P(0,0,18.2),P(0,0,22),6.7,m['plaster'],32)
 for i in range(16):
  t=i*2*pi/16;u=(-sin(t),cos(t),0);n=(cos(t),sin(t),0);mid=(cx+6.74*cos(t),cy+6.74*sin(t))
  window(a,mid,u,n,z+18.55,1.55,1.9,arched=True)
  a.beam((cx+6.9*cos(t),cy+6.9*sin(t),z+18.1),(cx+6.9*cos(t),cy+6.9*sin(t),z+22),.13,m['ivory'],8)
 # Dome is a hemisphere compressed to photographed proportions, flat bottom omitted.
 seg=64;rings=14;vs=[]
 for j in range(rings+1):
  t=j*pi/2/rings
  for i in range(seg):
   q=i*2*pi/seg;vs.append((cx+6.9*cos(t)*cos(q),cy+6.9*cos(t)*sin(q),z+22+5.4*sin(t)))
 a.mesh(vs,[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(rings) for i in range(seg)],m['red'])
 for i in range(16):
  q=i*2*pi/16
  ps=[(cx+6.92*cos(t*pi/28)*cos(q),cy+6.92*cos(t*pi/28)*sin(q),z+22+5.42*sin(t*pi/28)) for t in range(15)]
  for p,q2 in zip(ps[:-1],ps[1:]):a.beam(p,q2,.035,m['red'],5)
 a.beam(P(0,0,27.2),P(0,0,29.2),.12,m['ivory'],10,r2=.03)
 # Garden approach stairs follow the building orientation.
 for k in range(12):a.box(P(0,-21-k*.5,.9-k*.06),(8,.55,.3),m['granite'],ang)
 o=a.finish();o['osm_id']=b['id'];o['accuracy']='Reference-modeled exterior, measured footprint; dimensions interpreted'
 # Sunlight Rock summit has multiple interlocking rock masses and terraces.
 print('LANDMARK Sunlight',flush=True)
 cx,cy=XY(118.0622567,24.4446321);base=H(cx,cy)
 a=Geo('LM_Sunlight_Rock_日光岩_Granite',C)
 for dx,dy,cz,rx,ry,rz in [(0,0,68,20,15,23),(-23,5,66,17,16,20),(17,12,61,14,17,19),(-7,-16,56,22,14,14)]:
  vs=[];seg=48;rings=24
  def power(v):return (1 if v>=0 else -1)*abs(v)**.72
  for j in range(rings+1):
   t=pi*j/rings
   for i in range(seg):
    q=i*2*pi/seg;warp=1+.035*sin(5*q+2*t)+.018*cos(9*q-4*t)
    zz=cz+rz*power(cos(t));zz=min(zz,89.0 if dx==0 else 85.7)
    vs.append((cx+dx+rx*power(sin(t))*power(cos(q))*warp,cy+dy+ry*power(sin(t))*power(sin(q))*warp,zz))
  a.mesh(vs,[(j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i) for j in range(rings) for i in range(seg)],m['rock'])
 a.finish(True)
 a=Geo('LM_Sunlight_Observation_Terraces',C)
 # Rounded rectangular platforms and two-level summit lookout.
 def platform(x,y,z,w,d):
  a.box((x,y,z-.35),(w,d,.7),m['granite']);ps=[(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x+w/2,y+d/2,z),(x-w/2,y+d/2,z),(x-w/2,y-d/2,z)];rail(a,ps,m['ivory'],1.1,1.3)
 platform(cx-17,cy+3,86,12,12)
 a.beam((cx+2,cy-1,86),(cx+2,cy-1,91),6.6,m['granite'],12)
 ring=[(cx+2+6.8*cos(t*2*pi/24),cy-1+5.8*sin(t*2*pi/24),91.4) for t in range(25)];a.face(ring[:-1],m['paving']);rail(a,ring,m['ivory'],1.15,1)
 a.beam((cx+2,cy-1,91.4),(cx+2,cy-1,95),.18,m['iron'],10)
 a.ellipsoid((cx+2,cy-1,95.25),(.6,.6,.6),m['ivory'],14,8)
 # Switchback stairs hug the southern face and connect observation levels.
 ps=[(cx-35,cy-13,61),(cx-25,cy-20,68),(cx-11,cy-19,75),(cx-10,cy-7,81),(cx-21,cy-3,86),(cx-10,cy+4,87),(cx+1,cy+4,91.4)]
 for p,q in zip(ps[:-1],ps[1:]):
  p,q=Vector(p),Vector(q);d=q-p;cnt=max(1,int(abs(d.z)/.2));n=Vector((-d.y,d.x,0)).normalized()*1.25
  for k in range(cnt):
   v=p+d*k/cnt;a.box(v,(2.5,d.xy.length/cnt+.1,.22),m['granite'],math.atan2(d.y,d.x)-pi/2)
  rail(a,[tuple(p+n),tuple(q+n)],m['ivory'],1.05,1.2);rail(a,[tuple(p-n),tuple(q-n)],m['ivory'],1.05,1.2)
 a.finish()
 # Garden marine walk follows original OSM bridge ways, including sections over water.
 print('LANDMARK Shuzhuang',flush=True)
 raw=json.load(open(ROOT/'data'/'osm.json'))['elements'];nodes={v['id']:v for v in raw if v['type']=='node'}
 a=Geo('LM_Shuzhuang_44_Bridge_菽庄四十四桥',C);bridges=[]
 for w in raw:
  if w['type']!='way':continue
  tags=w.get('tags',{});ps=[XY(nodes[i]['lon'],nodes[i]['lat']) for i in w.get('nodes',[]) if i in nodes]
  if not ps:continue
  if '四十四桥' in tags.get('name','') or (tags.get('bridge') and 80<sum(p[0] for p in ps)/len(ps)<330 and -820<sum(p[1] for p in ps)/len(ps)<-550):
   ps=[(x,y,3.0) for x,y in ps];bridges.append(ps);ribbon(a,ps,2.5,m['granite'])
   for p,q in zip(ps[:-1],ps[1:]):
    p,q=Vector(p),Vector(q);d=q-p
    if d.length<.1:continue
    n=Vector((-d.y,d.x,0)).normalized()*1.17
    rail(a,[tuple(p+n),tuple(q+n)],m['ivory'],.9,1.3);rail(a,[tuple(p-n),tuple(q-n)],m['ivory'],.9,1.3)
    a.beam(p-Vector((0,0,3.2)),p,.25,m['granite'],6)
 # East marine walk: photo-guided interpretation, explicitly distinguished from OSM ways.
 east=[(139.9,-684.0,3),(161,-719,3),(186,-730,3),(191,-740,3),(214,-733,3),(228,-746,3),(259,-742,3),(271,-755,3),(298,-750,3),(318,-738,3),(325,-718,3),(310,-704,3)]
 ribbon(a,east,2.5,m['granite'])
 for p,q in zip(east[:-1],east[1:]):
  p,q=Vector(p),Vector(q);d=q-p;n=Vector((-d.y,d.x,0)).normalized()*1.17
  rail(a,[tuple(p+n),tuple(q+n)],m['ivory'],.9,1.3);rail(a,[tuple(p-n),tuple(q-n)],m['ivory'],.9,1.3)
  for t in range(max(1,int(d.length/4))):
   v=p+d*t/max(1,int(d.length/4));a.beam(v-Vector((0,0,3.4)),v,.22,m['granite'],6)
 o=a.finish();o['east_arm_source']='Photo-guided interpretation; not OSM-surveyed'
 # Chinese waterfront pavilions: stone plinth, columns, curved roof profiles, ridge finials.
 def pavilion(cx,cy,z,r):
  a=Geo('LM_Shuzhuang_Pavilion',C);a.beam((cx,cy,z-.4),(cx,cy,z),r,m['granite'],8)
  for i in range(6):
   t=i*2*pi/6;a.beam((cx+r*.65*cos(t),cy+r*.65*sin(t),z),(cx+r*.65*cos(t),cy+r*.65*sin(t),z+3.5),.15,m['brick'],8)
  for k in range(6):
   t=k*2*pi/6;q=(k+1)*2*pi/6
   for j in range(6):
    r1=r*1.15*j/6;r2=r*1.15*(j+1)/6
    def h(rr):v=rr/(r*1.15);return z+5.1-2.3*v+1.1*v**4
    a.face([(cx+r1*cos(t),cy+r1*sin(t),h(r1)),(cx+r2*cos(t),cy+r2*sin(t),h(r2)),(cx+r2*cos(q),cy+r2*sin(q),h(r2)),(cx+r1*cos(q),cy+r1*sin(q),h(r1))],m['roof'])
   a.beam((cx+r*1.15*cos(t),cy+r*1.15*sin(t),z+3.9),(cx+r*1.3*cos(t),cy+r*1.3*sin(t),z+4.25),.12,m['roof'],6)
  a.beam((cx,cy,z+4.8),(cx,cy,z+5.65),.16,m['roof'],8,r2=.035);a.finish()
 if bridges:
  for ps in bridges[:2]:pavilion(ps[len(ps)//2][0],ps[len(ps)//2][1],3,3.5)
 # The Catholic church follows its measured footprint with Gothic openings and central bell tower.
 b=next(b for b in data['buildings'] if b['id']==164669122);cx,cy=b['center'];z=b['base'];ang=math.radians(-56)
 def P(x,y,h):return(cx+x*cos(ang)-y*sin(ang),cy+x*sin(ang)+y*cos(ang),z+h)
 a=Geo('LM_Catholic_Church_天主堂',C);a.box(P(0,0,5.2),(27,10,10.4),m['ivory'],ang);hiproof(a,(cx,cy),28,11,z+10.4,4.5,m['roof'],m['ivory'],ang)
 for side in [-1,1]:
  for x in [-10,-5,0,5,10]:
   mid=P(x,side*5.08,3.0);window(a,mid,(cos(ang),sin(ang),0),(-sin(ang)*side,cos(ang)*side,0),mid[2],1.5,4.2,arched=True)
   a.box(P(x+1.8,side*5.4,4.5),(.6,.9,9),m['ivory'],ang)
 a.box(P(-11,0,9),(6,6,18),m['ivory'],ang)
 a.beam(P(-11,0,18),P(-11,0,25),4,m['red'],4,r2=0)
 a.beam(P(-11,0,24.7),P(-11,0,27),.11,m['iron'],8);a.beam(P(-11,-.65,26.2),P(-11,.65,26.2),.09,m['iron'],8)
 a.finish()
 # Roadside detail: lanterns, benches and planters in a selected number of road segments.
 a=Geo('Street_furniture_lamps_benches_planters',cs['03_Roads_And_Quays'])
 for rd in data['roads']:
  if not rd['name'] or len(rd['points'])<12:continue
  ps=rd['points']
  for i in range(4,len(ps)-2,18):
   p=Vector(ps[i]);d=Vector(ps[i+1])-p
   if d.xy.length<.1:continue
   n=Vector((-d.y,d.x,0)).normalized();p+=n*(rd['width']/2+.7);p.z=H(p.x,p.y)+.15
   a.beam(p,p+Vector((0,0,3.8)),.065,m['iron'],8);a.box(p+Vector((0,0,3.75)),(.48,.48,.65),m['iron']);a.box(p+Vector((0,0,3.76)),(.36,.36,.46),m['ivory']);a.beam(p+Vector((0,0,4.05)),p+Vector((0,0,4.26)),.35,m['iron'],4,r2=0)
   if i%3==1:
    q=p+n*1.8;ang=math.atan2(d.y,d.x)
    a.box(q+Vector((0,0,.45)),(1.8,.55,.16),m['green'],ang);a.box(q+Vector((0,0,.1)),(1.5,.45,.3),m['granite'],ang)
 a.finish()
 print('LANDMARKS DONE',flush=True)
