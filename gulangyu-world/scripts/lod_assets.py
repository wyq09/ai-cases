"""Distance LODs retain roof silhouettes and window placement with fewer primitives."""
from scene_lib import *

def build_lods(data,collection):
 # Called from a fresh Blender process; reuse the native scene material list.
 if not MATS:
  MATS.extend(list(bpy.data.materials))
 names={m.name:i for i,m in enumerate(MATS)}
 def M(name):return names[name]
 ivory=M('Limewashed trim');roof=M('Terracotta barrel tiles');glass=M('Deep blue recessed glazing');brick=M('Minnan fired brick');plaster=M('Weathered ochre plaster');bark=M('Banyan bark')
 building={}
 for b in data['buildings']:
  if b['id'] in [164652578,164669122]:continue
  a=Geo('LOD_B_'+str(b['id']),collection);p=list(reversed(b['poly']));base=b['base'];h=b['height'];levels=b['levels'];mat=brick if b['id']%4==0 else plaster if b['id']%3 else ivory
  for i,pt in enumerate(p):
   q=p[(i+1)%len(p)];dx=q[0]-pt[0];dy=q[1]-pt[1];length=math.hypot(dx,dy)
   a.face([(pt[0],pt[1],base-3),(q[0],q[1],base-3),(q[0],q[1],base+h),(pt[0],pt[1],base+h)],mat)
   if length<3.3:continue
   u=Vector((dx/length,dy/length,0));n=Vector((u.y,-u.x,0));count=max(1,int(length/3.5))
   for k in range(count):
    mid=Vector((pt[0]+dx*(k+.5)/count,pt[1]+dy*(k+.5)/count,0))+n*.14
    for floor in range(levels):
     z=base+floor*h/levels+.85;w=min(1.35,length/count*.5);wh=min(1.65,h/levels-1.2)
     a.face([tuple(mid+u*xx+Vector((0,0,zz))) for xx,zz in [(-w/2,z),(w/2,z),(w/2,z+wh),(-w/2,z+wh)]],glass)
  for tr in b['tri']:a.face([(x,y,base+h) for x,y in tr],roof)
  r0,r1,r2=b['rect'][:3];w=math.dist(r0,r1);d=math.dist(r1,r2);ang=math.atan2(r1[1]-r0[1],r1[0]-r0[0]);c=((r0[0]+r2[0])/2,(r0[1]+r2[1])/2)
  if b['area']/(w*d)>.72 and b['area']<1800:hiproof(a,c,w+.7,d+.7,base+h+.12,min(w,d)*.25,roof,ivory,ang)
  ob=a.finish();native=next((o for o in bpy.data.collections['02_OSM_Buildings'].objects if o.get('osm_id')==b['id']),None)
  if native:
   # Match the native recentered asset's local pivot.
   for v in ob.data.vertices:v.co-=native.location
   building[native.name]=ob.data
  bpy.data.objects.remove(ob,do_unlink=True)
 trees={}
 for variant in range(6):
  source=bpy.data.meshes['Banyan_canopy_variant_'+str(variant)]
  a=Geo('Banyan_LOD1_'+str(variant),collection)
  for poly in source.polygons:
   mat=source.materials[poly.material_index];is_bark=mat.name=='Banyan bark'
   if not is_bark and poly.index%3:continue
   ps=[source.vertices[i].co.copy() for i in poly.vertices]
   if not is_bark:
    centre=sum(ps,Vector())/len(ps);ps=[centre+(p-centre)*1.5 for p in ps]
   a.face([tuple(p) for p in ps],names[mat.name])
  ob=a.finish(smooth=True,uv=False);trees[source.name]=ob.data;bpy.data.objects.remove(ob,do_unlink=True)
 return building,trees
