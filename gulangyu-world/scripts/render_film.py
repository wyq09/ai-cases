import bpy,pathlib,sys,time,json
R=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'scripts'));s=bpy.context.scene
s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100
s.eevee.taa_render_samples=24;s.eevee.fast_gi_ray_count=2;s.eevee.fast_gi_step_count=8
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=15
s.render.use_persistent_data=True
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
start=int(args[0]) if args else 1;end=int(args[1]) if len(args)>1 else 576
frames=R/'render'/'frames';frames.mkdir(parents=True,exist_ok=True)
from scene_lib import coll
from lod_assets import build_lods
from mathutils import Vector
data=json.load(open(R/'data'/'geo.json'));lb,lt=build_lods(data,coll('RENDER_LOD_Temporary'))
bodies=list(bpy.data.collections['02_OSM_Buildings'].objects);trees=list(bpy.data.collections['05_Vegetation_Instances'].objects)
full={o.name:o.data for o in bodies+trees};last_shot=-1;shots=json.load(open(R/'delivery'/'shots.json'))
t=time.time()
for f in range(start,end+1):
 p=frames/f'{f:04}.png'
 if p.exists():continue
 s.frame_set(f)
 shot=(f-1)//96
 if shot!=last_shot:
  positions=[Vector(shots[shot][k]) for k in ['position_start','position_end']]
  for ob in bodies:
   far=min((ob.location-pos).length for pos in positions)>600
   ob.data=lb.get(ob.name,full[ob.name]) if far else full[ob.name]
  for ob in trees:
   far=min((ob.location-pos).length for pos in positions)>400
   ob.data=lt[full[ob.name].name] if far else full[ob.name]
  last_shot=shot
 s.render.filepath=str(p);t0=time.time();bpy.ops.render.render(write_still=True)
 (R/'render'/f'progress_{start:04}.json').write_text(json.dumps({'frame':f,'total':576,'frame_seconds':round(time.time()-t0,2),'elapsed_seconds':round(time.time()-t,1)}))
 print('FRAME_DONE',f,'seconds',round(time.time()-t0,2),flush=True)
