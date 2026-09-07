"""Export inspectable, engine-neutral environment art and separate collision / LOD assets."""
import bpy,sys,pathlib,json,math,time
from mathutils import Vector
R=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'scripts'));from scene_lib import Geo,MATS,coll,material
D=R/'delivery'/'game';D.mkdir(exist_ok=True)
g=json.load(open(R/'data'/'geo.json'))
stats=json.loads((R/'delivery'/'scene_stats.json').read_text());stats.update({'objects':len(bpy.data.objects),'unique_meshes':len(bpy.data.meshes),'unique_mesh_vertices':sum(len(me.vertices) for me in bpy.data.meshes),'unique_mesh_polygons':sum(len(me.polygons) for me in bpy.data.meshes),'paving_conformed_to_terrain':True});(R/'delivery'/'scene_stats.json').write_text(json.dumps(stats,indent=2))
# Material indices for generated proxies are independent of native scene indices.
for mat in bpy.data.materials:MATS.append(mat)
stone=next(i for i,m in enumerate(MATS) if m.name=='Xiamen weathered granite')
plaster=next(i for i,m in enumerate(MATS) if m.name=='Weathered ochre plaster')
roof=next(i for i,m in enumerate(MATS) if m.name=='Terracotta barrel tiles')

def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 t=time.time();print('EXPORT',name,'objects',len(objects),flush=True)
 bpy.ops.export_scene.gltf(filepath=str(D/name),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True,export_yup=True,export_apply=False,export_materials='EXPORT',export_image_format='AUTO')
 print('EXPORTED',name,round(time.time()-t,1),flush=True)

# Omit cinematic ocean, lights, cameras, and the intentionally hidden mainland backdrop.
visual=[]
for name in ['01_Terrain_WGS84','02_OSM_Buildings','03_Roads_And_Quays','04_Landmarks','05_Vegetation_Instances']:
 visual.extend([o for o in bpy.data.collections[name].objects if o.type=='MESH'])
if '--only-lod' not in sys.argv:export('Gulangyu_Environment_LOD0.glb',visual)
# Tree placement manifest enables conversion to native GPU instances in a game engine.
trees=list(bpy.data.collections['05_Vegetation_Instances'].objects);meshes=sorted({o.data for o in trees},key=lambda me:me.name)
manifest={'units':'metres','blender_axes':'X east Y north Z up','gltf_axes':'X east Y up Z south','origin_wgs84':g['origin'],'instances':[]}
for o in trees:
 x,y,z=o.location;manifest['instances'].append({'mesh':o.data.name,'position_blender':[x,y,z],'position_gltf':[x,z,-y],'rotation_z_blender_radians':o.rotation_euler.z,'scale':list(o.scale)})
(D/'vegetation_instances.json').write_text(json.dumps(manifest,separators=(',',':')))
lib=coll('EXPORT_Foliage_Library');protos=[]
for i,me in enumerate(meshes):
 o=bpy.data.objects.new(me.name,me);lib.objects.link(o);o.location=(i*12,0,0);o['library_display_offset_m']=i*12;protos.append(o)
if '--only-lod' not in sys.argv:export('Foliage_Prototypes_LOD0.glb',protos)
for o in protos:bpy.data.objects.remove(o,do_unlink=True)
# Coarse architecture LOD retains measured footprints, uses simple envelopes for distant views.
low=coll('EXPORT_LOD1');lod=[]
from lod_assets import build_lods
lb,lt=build_lods(g,low)
for native in bpy.data.collections['02_OSM_Buildings'].objects:
 if native.type!='MESH':continue
 native.data=lb.get(native.name,native.data);lod.append(native)
for native in trees:
 native.data=lt[native.data.name];lod.append(native)
for name in ['01_Terrain_WGS84','03_Roads_And_Quays','04_Landmarks']:
 lod.extend(o for o in bpy.data.collections[name].objects if o.type=='MESH')
export('Gulangyu_Environment_LOD1.glb',lod)
# Separate static collision envelopes. These are not a configured engine physics scene.
cc=coll('EXPORT_Collision');cols=[]
terrain=bpy.data.objects.get('Terrain_6m_grid_coarse_DEM');o=terrain.copy();o.data=terrain.data.copy();o.name='COL_Terrain';cc.objects.link(o);o['collision_only']=True;o.data.materials.clear();cols.append(o)
for b in g['buildings']:
 a=Geo('COL_B_'+str(b['id']),cc);base=b['base']-4;top=b['base']+b['height'];ps=list(reversed(b['poly']))
 for i,p in enumerate(ps):
  q=ps[(i+1)%len(ps)];a.face([(p[0],p[1],base),(q[0],q[1],base),(q[0],q[1],top),(p[0],p[1],top)],stone)
 for tr in b['tri']:
  a.face([(x,y,top) for x,y in tr],stone);a.face([(x,y,base) for x,y in reversed(tr)],stone)
 o=a.finish(uv=False);o.data.materials.clear();o['collision_only']=True;cols.append(o)
export('Gulangyu_Collision_Proxies.glb',cols)
# One compact mesh inventory distinguishes unique geometry from repeated geometry.
inv={'lod0_objects':len(visual),'lod1_objects':len(lod),'collision_objects':len(cols),'tree_instances':len(trees),'unique_tree_meshes':len(meshes),'files':{p.name:p.stat().st_size for p in D.glob('*.glb')}}
(D/'export_manifest.json').write_text(json.dumps(inv,indent=2));print('GAME_EXPORT_DONE',inv,flush=True)
