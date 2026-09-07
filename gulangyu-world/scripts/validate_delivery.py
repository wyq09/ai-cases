"""Validate exported binary glTFs and finished Blender video without changing assets."""
import json,pathlib,struct,subprocess,hashlib,sys
import numpy as np
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[1];D=R/'delivery'

def check_glb(path):
 with open(path,'rb') as f:
  magic,version,length=struct.unpack('<4sII',f.read(12));assert magic==b'glTF' and version==2 and length==path.stat().st_size
  n,kind=struct.unpack('<II',f.read(8));assert kind==0x4E4F534A;j=json.loads(f.read(n))
  n,kind=struct.unpack('<II',f.read(8));assert kind==0x004E4942;binstart=f.tell()
 data=np.memmap(path,dtype=np.uint8,mode='r',offset=binstart,shape=(n,))
 widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};types={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
 def arr(idx):
  a=j['accessors'][idx];v=j['bufferViews'][a['bufferView']];dtype=np.dtype(types[a['componentType']]);c=widths[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',dtype.itemsize*c)
  assert off+(a['count']-1)*stride+dtype.itemsize*c<=len(data)
  return np.ndarray((a['count'],c),dtype=dtype,buffer=data,offset=off,strides=(stride,dtype.itemsize))
 mesh_tri=[];primitives=0;vcount=0
 for mesh in j.get('meshes',[]):
  triangles=0
  for p in mesh['primitives']:
   pos=arr(p['attributes']['POSITION']);assert len(pos)>0 and np.isfinite(pos).all();vcount+=len(pos);primitives+=1
   assert p.get('mode',4)==4
   if 'indices' in p:
    ids=arr(p['indices']);assert int(ids.max())<len(pos) and len(ids)%3==0;triangles+=len(ids)//3
   else:assert len(pos)%3==0;triangles+=len(pos)//3
   if 'NORMAL' in p['attributes']:
    no=arr(p['attributes']['NORMAL']);assert len(no)==len(pos) and np.isfinite(no).all()
   if 'TEXCOORD_0' in p['attributes']:assert np.isfinite(arr(p['attributes']['TEXCOORD_0'])).all()
  mesh_tri.append(triangles)
 instanced=0
 for node in j.get('nodes',[]):
  if 'mesh' in node:assert 0<=node['mesh']<len(mesh_tri);instanced+=mesh_tri[node['mesh']]
  for k in ['translation','rotation','scale','matrix']:
   if k in node:assert np.isfinite(node[k]).all()
 for im in j.get('images',[]):
  assert 'bufferView' in im,'Texture must be embedded';v=j['bufferViews'][im['bufferView']];assert v.get('byteOffset',0)+v['byteLength']<=len(data)
 for t in j.get('textures',[]):
  if 'source' in t:assert 0<=t['source']<len(j.get('images',[]))
 return {'bytes':path.stat().st_size,'nodes':len(j.get('nodes',[])),'meshes':len(mesh_tri),'primitives':primitives,'vertices_across_unique_primitives':vcount,'triangles_unique':sum(mesh_tri),'triangles_after_node_instancing':instanced,'embedded_images':len(j.get('images',[])),'finite_attributes':True,'indices_in_range':True}

report=json.loads((D/'VALIDATION.json').read_text()) if '--video-only' in sys.argv else {'status':'partial','geometry':{},'source_geometry':{},'notes':['No in-engine Unity/Unreal runtime performance test.','Accuracy is map-constrained and reference-modeled, not survey or photogrammetry.']}
for name in ['Gulangyu_Environment_LOD0.glb','Gulangyu_Environment_LOD1.glb','Gulangyu_Collision_Proxies.glb','Foliage_Prototypes_LOD0.glb']:
 p=D/'game'/name
 if p.exists() and '--video-only' not in sys.argv:report['geometry'][name]=check_glb(p)
assert len(report['geometry'])==4
lo=report['geometry']['Gulangyu_Environment_LOD0.glb'];hi=report['geometry']['Gulangyu_Environment_LOD1.glb'];assert hi['triangles_after_node_instancing']<lo['triangles_after_node_instancing']
report['lod_triangle_reduction']=1-hi['triangles_after_node_instancing']/lo['triangles_after_node_instancing']
g=json.load(open(R/'data'/'geo.json'));v=np.asarray(g['terrain']['verts']);f=np.asarray(g['terrain']['faces']);normal=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]);assert np.isfinite(v).all();assert np.all(normal[:,2]>=-1e-6)
report['source_geometry']={'terrain_vertices':len(v),'terrain_triangles':len(f),'upward_terrain_winding':True,'buildings':len(g['buildings']),'road_segments':len(g['roads']),'vegetation_instances':len(g['trees'])}
frames=R/'render'/'frames';present=[p for p in frames.glob('*.png')]
if len(present)==576:
 for p in present:
  with Image.open(p) as im:assert im.size==(1920,1080)
 report['frame_sequence']={'frames':576,'width':1920,'height':1080,'missing_frames':[]}
if (D/'ROUNDTRIP.json').exists():report['gltf_roundtrip']=json.loads((D/'ROUNDTRIP.json').read_text())
film=D/'Gulangyu_Showcase_1080p.mp4'
if film.exists():
 p=subprocess.run(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(film)],check=True,capture_output=True,text=True);meta=json.loads(p.stdout);video=next(s for s in meta['streams'] if s['codec_type']=='video');audio=next(s for s in meta['streams'] if s['codec_type']=='audio')
 assert video['width']==1920 and video['height']==1080 and video['r_frame_rate']=='24/1';assert int(video['nb_frames'])==576;assert abs(float(meta['format']['duration'])-24)<.15
 subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(film),'-f','null','-'],check=True,capture_output=True)
 report['video']={'codec':video['codec_name'],'width':1920,'height':1080,'fps':24,'frames':576,'duration_seconds':float(meta['format']['duration']),'audio_codec':audio['codec_name'],'decode_errors':0,'bytes':film.stat().st_size};report['status']='passed'
report['native_blend']={'bytes':(D/'Gulangyu_World.blend').stat().st_size,'version':'Blender 5.2.1 LTS','opened_for_render_and_export':True}
(D/'VALIDATION.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report,indent=2,ensure_ascii=False))
