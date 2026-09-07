import json,math,pathlib,random,collections
import numpy as np
from PIL import Image
from shapely.geometry import Polygon,Point,LineString
from shapely.ops import unary_union,triangulate
from shapely.prepared import prep
from scipy.ndimage import gaussian_filter
R=pathlib.Path(__file__).resolve().parents[1];D=R/'data'
random.seed(77)
ORIGIN=(118.063,24.447);SX=111320*math.cos(math.radians(ORIGIN[1]));SY=111320

def xy(lon,lat):return ((lon-ORIGIN[0])*SX,(lat-ORIGIN[1])*SY)
def ll(x,y):return ORIGIN[0]+x/SX,ORIGIN[1]+y/SY
els=json.load(open(D/'osm.json'))['elements'];nodes={e['id']:e for e in els if e['type']=='node'};ways={e['id']:e for e in els if e['type']=='way'}
def pts(w):return [xy(nodes[i]['lon'],nodes[i]['lat']) for i in w['nodes'] if i in nodes]
coast=pts(ways[164669117])[:-1]+pts(ways[993673314])[:-1]
island=Polygon(coast).buffer(0);ip=prep(island)
tiles={}
for p in D.glob('dem_*.png'):
 _,z,x,y=p.stem.split('_');a=np.array(Image.open(p)).astype(float);tiles[int(x),int(y)]=a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768

def elev(x,y):
 lon,lat=ll(x,y);u=(lon+180)/360*16384;v=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*16384
 a=tiles.get((int(u),int(v)))
 if a is None:return 0
 px=(u%1)*256;py=(v%1)*256;ix=min(254,int(px));iy=min(254,int(py));fx=px-ix;fy=py-iy
 return float(a[iy,ix]*(1-fx)*(1-fy)+a[iy,ix+1]*fx*(1-fy)+a[iy+1,ix]*(1-fx)*fy+a[iy+1,ix+1]*fx*fy)
print('island',island.area,island.bounds,'Sunlight DEM',elev(*xy(118.0622567,24.4446321)),flush=True)
# Coast-constrained elevation. DEM is coarse regional data; the summit rock is a separate model.
def height(x,y):
 p=Point(x,y)
 if not island.contains(p):return -1.5
 d=island.boundary.distance(p);h=max(2.,elev(x,y)-2.0)
 return 1.2+(h-1.2)*min(1,d/23)
# Grid uses 6 m vertex spacing without claiming 6 m survey accuracy.
x0,y0,x1,y1=island.bounds;step=6.;x0=math.floor(x0/step)*step;y0=math.floor(y0/step)*step
xs=np.arange(x0,x1+step,step);ys=np.arange(y0,y1+step,step)
verts=[];idx={};faces=[]
for j,y in enumerate(ys):
 for i,x in enumerate(xs):
  if island.buffer(10).contains(Point(x,y)):
   idx[i,j]=len(verts);verts.append([round(x,3),round(y,3),round(height(x,y),3)])
for (i,j),k in idx.items():
 if all(p in idx for p in [(i+1,j),(i,j+1),(i+1,j+1)]):
  if island.contains(Point(xs[i]+step/2,ys[j]+step/2)):
   faces.extend([[k,idx[i+1,j],idx[i+1,j+1]],[k,idx[i+1,j+1],idx[i,j+1]]])
# The explicit shoreline ribbon seals the grid edge under beaches and riprap.
coast_dense=[]
ln=LineString(list(island.exterior.coords))
for t in np.arange(0,ln.length,4):
 p=ln.interpolate(float(t));coast_dense.append([p.x,p.y,1.0])
build=[];polys=[];roads=[];roadshapes=[];areas=[];landmarks={}
for w in ways.values():
 t=w.get('tags',{});p=pts(w)
 if len(p)<2:continue
 if t.get('building') and len(p)>3:
  poly=Polygon(p).buffer(0)
  if poly.geom_type!='Polygon' or not island.contains(poly.representative_point()) or poly.area<8:continue
  poly=poly.simplify(.18,preserve_topology=True);p=list(poly.exterior.coords)[:-1];polys.append(poly)
  c=poly.centroid;rect=list(poly.minimum_rotated_rectangle.exterior.coords)[:-1]
  hvals=[height(*q) for q in p];base=max(hvals)+.2
  levels=t.get('building:levels','');hv=t.get('height','')
  try:levels=int(float(levels))
  except:levels=random.choices([1,2,3,4],[12,49,33,6])[0]
  try:h=float(hv.replace('m','').strip())
  except:h=levels*3.3+random.uniform(.2,.7)
  tris=[list(tr.exterior.coords)[:3] for tr in triangulate(poly) if poly.covers(tr.representative_point())]
  rec={'id':w['id'],'name':t.get('name',''),'poly':p,'rect':rect,'tri':tris,'center':[c.x,c.y],'base':base,'height':h,'levels':levels,'tags':t,'area':poly.area}
  build.append(rec)
  if rec['name']:landmarks[rec['name']]=[c.x,c.y,base]
 if t.get('highway'):
  line=LineString(p).intersection(island)
  if line.is_empty:continue
  width=3 if t['highway'] in ('footway','path','steps') else 5.5
  if t['highway']=='pedestrian':width=5
  for line in ([line] if line.geom_type=='LineString' else getattr(line,'geoms',[])):
   if line.geom_type!='LineString' or line.length<2:continue
   ps=[line.interpolate(float(v)) for v in np.linspace(0,line.length,max(2,int(line.length/3)+1))]
   roads.append({'id':w['id'],'name':t.get('name',''),'kind':t['highway'],'width':width,'points':[[p.x,p.y,height(p.x,p.y)+.22] for p in ps]})
   roadshapes.append(line.buffer(width/2+1))
 if t.get('natural') in ['beach','sand','bare_rock'] or t.get('leisure') in ['garden','park','pitch']:
  if len(p)>3:
   poly=Polygon(p).buffer(0).intersection(island.buffer(10))
   if poly.geom_type=='Polygon' and poly.area>10:
    tris=[list(tr.exterior.coords)[:3] for tr in triangulate(poly) if poly.covers(tr.representative_point())]
    areas.append({'id':w['id'],'name':t.get('name',''),'kind':t.get('natural',t.get('leisure')),'tri':[[[x,y,height(x,y)+.07] for x,y in tr] for tr in tris]})
blocked=unary_union([p.buffer(2.0) for p in polys]+roadshapes)
# Tree placement avoids buildings, paths, beach and historic rock / garden water.
beaches=[Polygon(pts(w)).buffer(0) for w in ways.values() if w.get('tags',{}).get('natural') in ['beach','bare_rock'] and len(pts(w))>3]
blocked=unary_union([blocked]+beaches);bp=prep(blocked)
trees=[]
for _ in range(40000):
 x=random.uniform(x0,x1);y=random.uniform(y0,y1);p=Point(x,y)
 if not ip.contains(p) or bp.contains(p) or island.boundary.distance(p)<9:continue
 # Avoid Sunlight Rock and open centre of Shuzhuang Garden.
 sx,sy=xy(118.0622567,24.4446321)
 if ((x-sx)/25)**2+((y-sy)/25)**2<1:continue
 trees.append([x,y,height(x,y),random.uniform(5.5,13.0),random.randint(0,5)])
 if len(trees)>=5600:break
out={'origin':ORIGIN,'coordinate_system':'Local tangent approximation, X east Y north Z up, metres, WGS84 origin','terrain':{'verts':verts,'faces':faces},'coast':coast_dense,'buildings':build,'roads':roads,'areas':areas,'trees':trees,'landmarks':landmarks,'bounds':list(island.bounds)}
(D/'geo.json').write_text(json.dumps(out,separators=(',',':')))
summary={'buildings':len(build),'roads':len(roads),'trees':len(trees),'terrain_vertices':len(verts),'terrain_triangles':len(faces),'area_m2':island.area,'landmarks':landmarks}
(D/'geo_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
# Portable terrain grid for the Blender builder, retain nan outside island.
np.savez_compressed(D/'heightfield.npz',x=xs,y=ys,z=np.array([[height(x,y) for x in xs] for y in ys]))
print({k:v for k,v in summary.items() if k!='landmarks'},flush=True)
