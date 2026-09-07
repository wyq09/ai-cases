"""Drape dense paving triangles onto the final, clipped terrain surface."""
import bpy,math,pathlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def conform_roads(scene):
 bpy.context.view_layer.update()
 terrain=bpy.data.objects['Terrain_6m_grid_coarse_DEM'];ob=bpy.data.objects['OSM_pedestrian_network']
 if ob.get('terrain_conformed'):return
 bvh=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in terrain.data.vertices],[list(p.vertices) for p in terrain.data.polygons],all_triangles=True)
 old=ob.data;materials=list(old.materials);inv=ob.matrix_world.inverted();v=[];faces=[];lookup={}
 def index(p):
  k=(round(p.x,5),round(p.y,5))
  if k not in lookup:
   hit=bvh.ray_cast(Vector((p.x,p.y,300)),Vector((0,0,-1)),500)[0]
   if hit is not None:p.z=hit.z+.18
   lookup[k]=len(v);v.append(tuple(inv@p))
  return lookup[k]
 for face in old.polygons:
  ps=[ob.matrix_world@old.vertices[i].co for i in face.vertices]
  if len(ps)!=4:continue
  nu=max(1,math.ceil((ps[1]-ps[0]).length/1.2));nv=max(1,math.ceil((ps[3]-ps[0]).length/1.2));grid={}
  for j in range(nv+1):
   for i in range(nu+1):
    u=i/nu;t=j/nv;p=ps[0]*(1-u)*(1-t)+ps[1]*u*(1-t)+ps[2]*u*t+ps[3]*(1-u)*t;grid[i,j]=index(p)
  for j in range(nv):
   for i in range(nu):
    a,b,c,d=grid[i,j],grid[i+1,j],grid[i+1,j+1],grid[i,j+1];faces.extend([(a,b,c),(a,c,d)])
 me=bpy.data.meshes.new('Paving_Terrain_Conformed_1p2m');me.from_pydata(v,[],faces);me.update()
 for mat in materials:me.materials.append(mat)
 uv=me.uv_layers.new(name='UV0_TileMetres');values=[]
 for p in me.polygons:
  for i in p.vertices:
   world=ob.matrix_world@me.vertices[i].co;values.extend((world.x/4,world.y/4))
 uv.data.foreach_set('uv',values);ob.data=me;ob['terrain_conformed']=True;ob['surface_offset_m']=.18
 if old.users==0:bpy.data.meshes.remove(old)
 print('ROAD_CONFORMED',len(v),len(faces),flush=True)

def conform_curbs(scene):
 import json,sys
 R=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'scripts'))
 from scene_lib import Geo,MATS
 bpy.context.view_layer.update();old=bpy.data.objects['Granite_curbs_and_steps']
 if old.get('union_boundaries'):return
 if not MATS:MATS.extend(list(bpy.data.materials))
 stone=next(i for i,m in enumerate(MATS) if m.name=='Xiamen weathered granite')
 terrain=bpy.data.objects['Terrain_6m_grid_coarse_DEM'];bvh=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in terrain.data.vertices],[list(p.vertices) for p in terrain.data.polygons],all_triangles=True)
 a=Geo('Continuous_road_edge_curbs',bpy.data.collections['03_Roads_And_Quays'])
 def P(x,y):
  hit=bvh.ray_cast(Vector((x,y,300)),Vector((0,0,-1)),500)[0]
  return (x,y,(hit.z if hit is not None else .25)+.23)
 for line in json.load(open(R/'data'/'road_boundaries.json')):
  ps=[P(x,y) for x,y in line]
  for p,q in zip(ps[:-1],ps[1:]):
   if (Vector(p)-Vector(q)).length>.005:a.beam(p,q,.065,stone,4)
 name=old.name;bpy.data.objects.remove(old,do_unlink=True);new=a.finish();new.name=name;new['union_boundaries']=True
 print('CURBS_UNION_DONE',len(new.data.polygons),flush=True)

if __name__=='__main__':
 conform_roads(bpy.context.scene)
 conform_curbs(bpy.context.scene)
 R=pathlib.Path(__file__).resolve().parents[1];bpy.ops.wm.save_as_mainfile(filepath=str(R/'delivery'/'Gulangyu_World.blend'),compress=True)
