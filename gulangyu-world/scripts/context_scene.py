from scene_lib import *
import json

def add_context(data,cs,m,H,XY):
 c=coll('09_Xiamen_Distant_Context');raw=json.load(open(ROOT/'data'/'osm.json'))['elements'];ns={n['id']:n for n in raw if n['type']=='node'};ws={w['id']:w for w in raw if w['type']=='way'}
 def ps(w):return [XY(ns[i]['lon'],ns[i]['lat']) for i in w.get('nodes',[]) if i in ns]
 # Mainland shoreline from OSM. Backdrop is explicitly lower detail than the island.
 p=ps(ws[334467999])[:-1]+ps(ws[334467977]);p += [XY(118.125,24.425),XY(118.125,24.49),XY(118.065,24.49)]
 a=Geo('Backdrop_Xiamen_OSM_Shoreline',c);a.face([(x,y,1.5) for x,y in p],m['earth']);a.finish()
 existing={b['id'] for b in data['buildings']}
 skyline=[material('Distant facade '+str(i),col,rough=.8) for i,col in enumerate([(.28,.35,.37),(.37,.39,.38),(.45,.43,.37),(.24,.33,.38)])]
 a=Geo('Backdrop_Xiamen_OSM_Buildings',c)
 for w in ws.values():
  if w['id'] in existing or 'building' not in w.get('tags',{}):continue
  p=ps(w)
  if len(p)<4:continue
  cx=sum(t[0] for t in p)/len(p);cy=sum(t[1] for t in p)/len(p)
  if cx<350:continue
  try:h=float(w['tags'].get('height','').replace('m',''))
  except:h=random.uniform(12,62)
  mat=skyline[w['id']%4]
  for i in range(len(p)-1):
   x,y=p[i];xx,yy=p[i+1];a.face([(x,y,2),(xx,yy,2),(xx,yy,h),(x,y,h)],mat)
   for z in range(4,int(h),4):a.beam((x,y,z),(xx,yy,z),.12,m['ivory'],4)
  a.face([(x,y,h) for x,y in p[:-1]],mat)
 a.finish()
 # Ferries, bollards and wakes add readable scale to the strait.
 a=Geo('Ferryboats_and_wakes',cs['06_Sea_And_Boats'])
 for x,y,ang in [(1000,100,.3),(1150,-500,1.1),(-450,-1250,-.3)]:
  a.box((x,y,.25),(24,7,2.0),m['ivory'],ang);a.box((x,y,2),(19,5.8,2),m['ivory'],ang);a.box((x,y,3.3),(20,6,.25),m['roof'],ang)
  for i in range(-8,9,2):
   for side in [-1,1]:
    a.box((x+i*cos(ang)-side*2.94*sin(ang),y+i*sin(ang)+side*2.94*cos(ang),2.1),(1.4,.08,.8),m['glass'],ang)
  for side in [-1,1]:
   path=[]
   for j in range(20):
    xx=-13-j*2;yy=side*(3+j*.42);path.append((x+xx*cos(ang)-yy*sin(ang),y+xx*sin(ang)+yy*cos(ang),-.42))
   ribbon(a,path,.5,m['foam'])
 a.finish()
