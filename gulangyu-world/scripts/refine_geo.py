import json,math,random,pathlib
import numpy as np
from shapely.geometry import Polygon,Point,LineString
from shapely import constrained_delaunay_triangles
from shapely.ops import unary_union
from shapely.prepared import prep
R=pathlib.Path(__file__).resolve().parents[1];g=json.load(open(R/'data'/'geo.json'));hf=np.load(R/'data'/'heightfield.npz');hx,hy,hz=hf['x'],hf['y'],hf['z']
def H(x,y):
 ix=np.clip((x-hx[0])/6,0,len(hx)-1.001);iy=np.clip((y-hy[0])/6,0,len(hy)-1.001);i,j=int(ix),int(iy);fx,fy=ix-i,iy-j
 return float(hz[j,i]*(1-fx)*(1-fy)+hz[j,i+1]*fx*(1-fy)+hz[j+1,i]*(1-fx)*fy+hz[j+1,i+1]*fx*fy)
island=Polygon([(p[0],p[1]) for p in g['coast']]).buffer(0)
# Smooth, continuous triangulated shoreline apron; no per-segment normal flips.
band=island.buffer(7,quad_segs=2).difference(island.buffer(-18,quad_segs=2));g['shore_tri']=[]
for t in constrained_delaunay_triangles(band).geoms:
 ps=[]
 for x,y in list(t.exterior.coords)[:3]:
  p=Point(x,y);d=island.boundary.distance(p);z=max(1.1,H(x,y)+.10) if island.contains(p) else -.8
  ps.append([x,y,z])
 g['shore_tri'].append(ps)
# Increase the canopy density while retaining paths and buildings.
blocked=unary_union([Polygon(b['poly']).buffer(1.5) for b in g['buildings']]+[LineString([(p[0],p[1]) for p in rd['points']]).buffer(rd['width']/2+.7) for rd in g['roads']]+[Polygon([(p[0],p[1]) for p in tr]) for a in g['areas'] if a['kind'] in ['beach','sand','pitch','bare_rock'] for tr in a['tri']]);bp=prep(blocked);ip=prep(island)
random.seed(551);trees=[];x0,y0,x1,y1=g['bounds']
for _ in range(130000):
 x=random.uniform(x0,x1);y=random.uniform(y0,y1);p=Point(x,y)
 if not ip.contains(p) or bp.contains(p) or island.boundary.distance(p)<8:continue
 if ((x+75)/38)**2+((y+264)/32)**2<1:continue
 # Bagua entrance lawn stays visible.
 if -10<x<55 and 290<y<319:continue
 trees.append([x,y,H(x,y),random.uniform(8.5,16),random.randint(0,5)])
 if len(trees)>=12500:break
g['trees']=trees
(R/'data'/'geo.json').write_text(json.dumps(g,separators=(',',':')))
print('shore_triangles',len(g['shore_tri']),'trees',len(trees))
