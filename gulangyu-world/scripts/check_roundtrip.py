import bpy,pathlib,json,time
from mathutils import Vector
R=pathlib.Path(__file__).resolve().parents[1];t=time.time()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(R/'delivery'/'game'/'Gulangyu_Environment_LOD1.glb'))
objs=[o for o in bpy.data.objects if o.type=='MESH'];assert len(objs)>13000
lo=Vector((1e20,1e20,1e20));hi=Vector((-1e20,-1e20,-1e20))
for o in objs:
 for p in o.bound_box:
  v=o.matrix_world@Vector(p)
  for k in range(3):lo[k]=min(lo[k],v[k]);hi[k]=max(hi[k],v[k])
ext=hi-lo;assert 1800<ext.x<2300 and 1800<ext.y<2300
r={'status':'passed','source':'Gulangyu_Environment_LOD1.glb','mesh_objects':len(objs),'materials':len(bpy.data.materials),'images':len(bpy.data.images),'bounds_min_blender':list(lo),'bounds_max_blender':list(hi),'extent_metres':list(ext),'read_seconds':round(time.time()-t,1)}
(R/'delivery'/'ROUNDTRIP.json').write_text(json.dumps(r,indent=2));print('ROUNDTRIP',r,flush=True)
