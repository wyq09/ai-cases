import json,pathlib
from shapely.geometry import LineString
from shapely.ops import unary_union
R=pathlib.Path(__file__).resolve().parents[1];g=json.load(open(R/'data'/'geo.json'))
union=unary_union([LineString([(p[0],p[1]) for p in r['points']]).buffer(r['width']/2,quad_segs=2) for r in g['roads']])
lines=[]
for p in list(union.geoms) if union.geom_type=='MultiPolygon' else [union]:
 for ring in [p.exterior]+list(p.interiors):
  if ring.length<2:continue
  n=max(2,int(ring.length/1.5));lines.append([[ring.interpolate(k*ring.length/n).x,ring.interpolate(k*ring.length/n).y] for k in range(n+1)])
(R/'data'/'road_boundaries.json').write_text(json.dumps(lines,separators=(',',':')));print('Continuous curb boundaries',len(lines))
