"""Geometry / game PBR helpers for the Gulangyu environment."""
import bpy,math,random,pathlib
from mathutils import Vector
from math import sin,cos,pi
ROOT=pathlib.Path(__file__).resolve().parents[1]
MATS=[]
def material(name,color,texture=None,scale=4,metal=0,rough=.8):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if texture:
  n=m.node_tree.nodes;l=m.node_tree.links
  for suffix,socket in [('base','Base Color'),('rough','Roughness'),('normal','Normal')]:
   tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'delivery'/'textures'/f'{texture}_{suffix}.png'),check_existing=True)
   if suffix!='base':tex.image.colorspace_settings.name='Non-Color'
   if suffix=='normal':
    bump=n.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.65;l.new(tex.outputs['Color'],bump.inputs['Color']);l.new(bump.outputs['Normal'],p.inputs[socket])
   else:l.new(tex.outputs['Color'],p.inputs[socket])
 m['tile_size_m']=scale;MATS.append(m);return len(MATS)-1

def coll(name):
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
class Geo:
 def __init__(self,name,collection):self.name=name;self.collection=collection;self.v=[];self.f=[];self.mi=[]
 def face(self,verts,mat):
  i=len(self.v);self.v.extend(verts);self.f.append(tuple(range(i,i+len(verts))));self.mi.append(mat)
 def mesh(self,verts,faces,mat):
  i=len(self.v);self.v.extend(verts);self.f.extend([tuple(i+j for j in f) for f in faces]);self.mi.extend([mat]*len(faces))
 def box(self,c,size,mat,a=0):
  cx,cy,cz=c;dx,dy,dz=[v/2 for v in size];co=cos(a);si=sin(a)
  v=[(cx+x*co-y*si,cy+x*si+y*co,cz+z) for z in [-dz,dz] for x,y in [(-dx,-dy),(dx,-dy),(dx,dy),(-dx,dy)]]
  self.mesh(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
 def beam(self,a,b,r,mat,segments=6,r2=None):
  a=Vector(a);b=Vector(b);d=(b-a).normalized();u=d.cross(Vector((0,0,1)))
  if u.length<.01:u=d.cross(Vector((1,0,0)))
  u.normalize();v=d.cross(u);r2=r if r2 is None else r2
  vs=[tuple(c+(u*cos(t*2*pi/segments)+v*sin(t*2*pi/segments))*rr) for c,rr in [(a,r),(b,r2)] for t in range(segments)]
  fs=[tuple(range(segments-1,-1,-1)),tuple(range(segments,segments*2))]+[(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
  self.mesh(vs,fs,mat)
 def ellipsoid(self,c,r,mat,segments=16,rings=8,jitter=0):
  vs=[]
  for j in range(rings+1):
   th=pi*j/rings
   for i in range(segments):
    ph=2*pi*i/segments;rr=1+random.uniform(-jitter,jitter)*sin(th)
    vs.append((c[0]+r[0]*sin(th)*cos(ph)*rr,c[1]+r[1]*sin(th)*sin(ph)*rr,c[2]+r[2]*cos(th)*rr))
  fs=[(j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i) for j in range(rings) for i in range(segments)]
  self.mesh(vs,fs,mat)
 def finish(self,smooth=False,uv=True):
  if not self.v:return None
  me=bpy.data.meshes.new(self.name);me.from_pydata(self.v,[],self.f);me.update();o=bpy.data.objects.new(self.name,me);self.collection.objects.link(o)
  used=sorted(set(self.mi));lookup={j:i for i,j in enumerate(used)}
  for j in used:me.materials.append(MATS[j])
  import numpy as np
  me.polygons.foreach_set('material_index',np.array([lookup[j] for j in self.mi],dtype=np.int32))
  if smooth:me.polygons.foreach_set('use_smooth',np.ones(len(me.polygons),dtype=bool))
  if uv:
   layer=me.uv_layers.new(name='UV0_TileMetres');values=[]
   for p,idx in zip(me.polygons,self.mi):
    n=p.normal;axis=max(range(3),key=lambda k:abs(n[k]));s=MATS[idx].get('tile_size_m',4)
    for vi in p.vertices:
     v=me.vertices[vi].co
     values.extend((v[0]/s,v[1]/s) if axis==2 else ((v[0]/s,v[2]/s) if axis==1 else (v[1]/s,v[2]/s)))
   layer.data.foreach_set('uv',np.array(values,dtype=np.float32))
  return o

def ribbon(g,ps,width,mat):
 for i in range(len(ps)-1):
  a=Vector(ps[i]);b=Vector(ps[i+1]);d=b-a
  if d.xy.length<.001:continue
  n=Vector((-d.y,d.x,0)).normalized()*width/2
  g.face([tuple(a-n),tuple(b-n),tuple(b+n),tuple(a+n)],mat)

def rail(g,ps,mat,height=1.1,step=2.5):
 for a,b in zip(ps[:-1],ps[1:]):
  a=Vector(a);b=Vector(b);d=(b-a);cnt=max(1,int(d.length/step))
  for i in range(cnt):
   p=a+d*i/cnt;g.beam(p,p+Vector((0,0,height)),.075,mat,6)
  for h in [.22,height]:g.beam(a+Vector((0,0,h)),b+Vector((0,0,h)),.055,mat,6)

def hiproof(g,c,w,d,z,h,mat,trim,a=0):
 co,si=cos(a),sin(a)
 def p(x,y,zz):return (c[0]+x*co-y*si,c[1]+x*si+y*co,zz)
 q=[p(-w/2,-d/2,z),p(w/2,-d/2,z),p(w/2,d/2,z),p(-w/2,d/2,z)]
 if w>=d:r=[p(-(w-d)/2,0,z+h),p((w-d)/2,0,z+h)];fs=[[q[0],q[1],r[1],r[0]],[q[1],q[2],r[1]],[q[2],q[3],r[0],r[1]],[q[3],q[0],r[0]]]
 else:r=[p(0,-(d-w)/2,z+h),p(0,(d-w)/2,z+h)];fs=[[q[0],q[1],r[0]],[q[1],q[2],r[1],r[0]],[q[2],q[3],r[1]],[q[3],q[0],r[0],r[1]]]
 for f in fs:g.face(f,mat)
 for i in range(4):g.beam(q[i],q[(i+1)%4],.10,trim,6)
 g.beam(r[0],r[1],.13,mat,8)
 for v in q:g.beam(v,min(r,key=lambda t:(Vector(v)-Vector(t)).length),.105,mat,6)
