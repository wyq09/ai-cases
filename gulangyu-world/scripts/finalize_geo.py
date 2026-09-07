import json,pathlib
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
from shapely.prepared import prep
R=pathlib.Path(__file__).resolve().parents[1];g=json.load(open(R/'data'/'geo.json'));island=Polygon([(p[0],p[1]) for p in g['coast']]);shore=prep(island.buffer(1).difference(island.buffer(-17)))
beaches=prep(unary_union([Polygon([(p[0],p[1]) for p in tr]) for a in g['areas'] if a['kind'] in ['sand','beach'] for tr in a['tri']]))
verts=g['terrain']['verts'];sand=[];granite=[]
for i,f in enumerate(g['terrain']['faces']):
 x=sum(verts[j][0] for j in f)/3;y=sum(verts[j][1] for j in f)/3;p=Point(x,y)
 if beaches.contains(p) or (y<-450 and shore.contains(p)):sand.append(i)
 elif shore.contains(p):granite.append(i)
g['terrain']['sand_faces']=sand;g['terrain']['granite_faces']=granite
(R/'data'/'geo.json').write_text(json.dumps(g,separators=(',',':')));print('Beach surface shares terrain topology',len(sand),len(granite))
