"""Clip the DEM grid to the mapped shoreline; all boundary vertices meet sea level."""
import json,pathlib,math
import numpy as np
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union,triangulate
from shapely.prepared import prep
R=pathlib.Path(__file__).resolve().parents[1];g=json.load(open(R/'data'/'geo.json'));hf=np.load(R/'data'/'heightfield.npz');xs,ys,zs=hf['x'],hf['y'],hf['z']
island=Polygon([(p[0],p[1]) for p in g['coast']]).buffer(0);ip=prep(island)
beaches=prep(unary_union([Polygon([(p[0],p[1]) for p in tr]) for a in g['areas'] if a['kind'] in ['sand','beach'] for tr in a['tri']]))
shore=prep(island.difference(island.buffer(-17)));verts=[];faces=[];lookup={};sand=[];stone=[]
def add(tr,boundary=False):
 f=[]
 for x,y in tr:
  key=(round(float(x),5),round(float(y),5))
  if key not in lookup:
   ix=min(len(xs)-2,max(0,int((x-xs[0])/6)));iy=min(len(ys)-2,max(0,int((y-ys[0])/6)))
   fx=(x-xs[ix])/6;fy=(y-ys[iy])/6
   z=zs[iy,ix]*(1-fx)*(1-fy)+zs[iy,ix+1]*fx*(1-fy)+zs[iy+1,ix]*(1-fx)*fy+zs[iy+1,ix+1]*fx*fy
   if boundary and island.boundary.distance(Point(x,y))<.03:z=.25
   lookup[key]=len(verts);verts.append([key[0],key[1],round(float(z),4)])
  f.append(lookup[key])
 if len(set(f))<3:return
 # Enforce upward terrain normals after polygon clipping.
 p,q,r=[verts[k] for k in f]
 if (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])<0:f.reverse()
 c=Point(sum(verts[k][0] for k in f)/3,sum(verts[k][1] for k in f)/3)
 if beaches.contains(c) or (c.y<-450 and shore.contains(c)):sand.append(len(faces))
 elif shore.contains(c):stone.append(len(faces))
 faces.append(f)
for j in range(len(ys)-1):
 for i in range(len(xs)-1):
  q=[(xs[i],ys[j]),(xs[i+1],ys[j]),(xs[i+1],ys[j+1]),(xs[i],ys[j+1])]
  cell=Polygon(q)
  if not ip.intersects(cell):continue
  if ip.contains(cell):
   add([q[0],q[1],q[2]]);add([q[0],q[2],q[3]])
  else:
   cut=cell.intersection(island)
   if cut.is_empty:continue
   for poly in [cut] if cut.geom_type=='Polygon' else getattr(cut,'geoms',[]):
    if poly.geom_type!='Polygon':continue
    for t in triangulate(poly):
     if poly.covers(t.representative_point()):add(list(t.exterior.coords)[:3],True)
g['terrain']={'verts':verts,'faces':faces,'sand_faces':sand,'granite_faces':stone}
(R/'data'/'geo.json').write_text(json.dumps(g,separators=(',',':')));print('Shore-clipped terrain',len(verts),len(faces),flush=True)

summary_path=R/'data'/'geo_summary.json'
summary=json.loads(summary_path.read_text());summary.update({'buildings':len(g['buildings']),'roads':len(g['roads']),'trees':len(g['trees']),'terrain_vertices':len(verts),'terrain_triangles':len(faces)});summary_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2))
