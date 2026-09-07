import urllib.request,urllib.parse,json,math,concurrent.futures,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]; D=ROOT/'data'
q='[out:json][timeout:90];(way(24.435,118.045,24.46,118.081);node(24.435,118.045,24.46,118.081)["name"];);out body;>;out skel qt;'
def osm():
 for base in ['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']:
  try:
   req=urllib.request.Request(base+'?'+urllib.parse.urlencode({'data':q}),headers={'User-Agent':'GulangyuSceneResearch/1.0'})
   b=urllib.request.urlopen(req,timeout=110).read();j=json.loads(b)
   (D/'osm.json').write_bytes(b);print('OSM',len(j['elements']),flush=True);return
  except Exception as e:print(base,str(e),flush=True)
def dem():
 z=14;n=2**z
 def tile(lon,lat):return int((lon+180)/360*n),int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n)
 a,b=tile(118.044,24.461);c,d=tile(118.082,24.434)
 for x in range(a,c+1):
  for y in range(b,d+1):
   u=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
   try:
    p=D/f'dem_{z}_{x}_{y}.png';p.write_bytes(urllib.request.urlopen(u,timeout=40).read()); print(p.name,flush=True)
   except Exception as e: print(e,flush=True)
with concurrent.futures.ThreadPoolExecutor() as ex:list(ex.map(lambda f:f(),[osm,dem]))
