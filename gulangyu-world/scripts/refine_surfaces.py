import json,pathlib,math
import numpy as np
from shapely.geometry import Polygon,Point
R=pathlib.Path(__file__).resolve().parents[1];g=json.load(open(R/'data'/'geo.json'));hf=np.load(R/'data'/'heightfield.npz');hx,hy,hz=hf['x'],hf['y'],hf['z']
def H(x,y):
 ix=np.clip((x-hx[0])/6,0,len(hx)-1.001);iy=np.clip((y-hy[0])/6,0,len(hy)-1.001);i,j=int(ix),int(iy);fx,fy=ix-i,iy-j
 return float(hz[j,i]*(1-fx)*(1-fy)+hz[j,i+1]*fx*(1-fy)+hz[j+1,i]*(1-fx)*fy+hz[j+1,i+1]*fx*fy)
def subdiv(tr,out):
 edges=[math.dist(tr[i][:2],tr[(i+1)%3][:2]) for i in range(3)];k=max(range(3),key=lambda i:edges[i])
 if edges[k]<7:
  out.append([[p[0],p[1],H(p[0],p[1])+.13] for p in tr]);return
 a,b,c=tr[k],tr[(k+1)%3],tr[(k+2)%3];mid=[(a[i]+b[i])/2 for i in range(3)];subdiv([a,mid,c],out);subdiv([mid,b,c],out)
for a in g['areas']:
 if a['kind'] in ['beach','sand','bare_rock','pitch']:
  out=[]
  for tr in a['tri']:subdiv(tr,out)
  a['tri']=out
out=[]
for tr in g['shore_tri']:subdiv(tr,out)
g['shore_tri']=out
for b in g['buildings']:
 if b['id'] in [641097255,641097256]:b['levels']=1;b['height']=5.2
ang=math.radians(44)
def clear(t):
 dx,dy=t[0]-23.74,t[1]-348.0;xx=dx*math.cos(ang)+dy*math.sin(ang);yy=-dx*math.sin(ang)+dy*math.cos(ang)
 return -28<xx<28 and -40<yy<-18
g['trees']=[t for t in g['trees'] if not clear(t)]
(R/'data'/'geo.json').write_text(json.dumps(g,separators=(',',':')));print('Coastal mesh conformed to terrain',len(out),'trees',len(g['trees']))
