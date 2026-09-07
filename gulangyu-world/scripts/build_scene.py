import bpy,sys,pathlib,math,json,random,time
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from scene_lib import *
random.seed(773);start=time.time()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection' and c.users==0:bpy.data.collections.remove(c)
s=bpy.context.scene;s.unit_settings.system='METRIC';s.unit_settings.scale_length=1
s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=32;s.eevee.shadow_pool_size='1024';s.eevee.use_fast_gi=True;s.eevee.fast_gi_quality=1.0;s.eevee.fast_gi_ray_count=4;s.eevee.fast_gi_step_count=16;s.eevee.fast_gi_distance=100;s.eevee.use_raytracing=True
s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.render.fps=24
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.1
s.world.use_nodes=True;nt=s.world.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputWorld');bg=nt.nodes.new('ShaderNodeBackground');sky=nt.nodes.new('ShaderNodeTexSky');sky.sky_type='SINGLE_SCATTERING';sky.sun_elevation=math.radians(32);sky.sun_rotation=math.radians(215);sky.altitude=.1;sky.air_density=1.1;bg.inputs['Strength'].default_value=.28;nt.links.new(sky.outputs[0],bg.inputs[0]);nt.links.new(bg.outputs[0],out.inputs[0])
# Explicit sun is reliable in Eevee; world texture provides the sky.
bpy.ops.object.light_add(type='SUN',location=(0,0,900));sun=bpy.context.object;sun.name='LIGHT_Sun_32deg';sun.rotation_euler=(math.radians(32),math.radians(-24),math.radians(-38));sun.data.energy=3.7;sun.data.angle=math.radians(5)
cs={k:coll(k) for k in ['01_Terrain_WGS84','02_OSM_Buildings','03_Roads_And_Quays','04_Landmarks','05_Vegetation_Instances','06_Sea_And_Boats','07_Cameras','08_Game_Collision']}
m={}
m['earth']=material('Ground / coastal earth',(.24,.29,.17),'earth',8)
m['plaster']=material('Weathered ochre plaster',(.79,.73,.59),'plaster',4)
m['ivory']=material('Limewashed trim',(.91,.87,.73),'ivory',4)
m['brick']=material('Minnan fired brick',(.58,.27,.17),'brick',4)
m['roof']=material('Terracotta barrel tiles',(.67,.27,.13),'roof',4)
m['granite']=material('Xiamen weathered granite',(.51,.50,.45),'granite',6)
m['paving']=material('Granite paving setts',(.49,.48,.42),'paving',4)
m['glass']=material('Deep blue recessed glazing',(.045,.105,.12),metal=.35,rough=.23)
m['green']=material('Painted timber shutters',(.11,.22,.18),rough=.72)
m['iron']=material('Forged iron',(.055,.073,.068),metal=.7,rough=.5)
m['sand']=material('Warm beach sand',(.65,.55,.36),rough=.92)
m['foam']=material('Broken tidal foam',(.57,.72,.68),rough=.7)
m['bark']=material('Banyan bark',(.19,.17,.115),'granite',3)
m['rock']=material('Sunlight granite / mineral streaking',(.45,.36,.25),'rock',22)
m['red']=material('Bagua oxidised red dome',(.38,.055,.027),rough=.72)
for i,col in enumerate([(.085,.19,.05),(.13,.25,.07),(.18,.28,.07),(.09,.20,.10),(.23,.31,.10),(.12,.23,.08)]):m[f'leaf{i}']=material('Subtropical foliage '+str(i),col,rough=.87)
# Ocean geometry plus two-scale animated normals, saved in the native scene.
m['water']=material('Lujiang Strait / sea',(.018,.125,.145),metal=.25,rough=.27)
wm=MATS[m['water']];p=wm.node_tree.nodes.get('Principled BSDF');p.inputs['IOR'].default_value=1.333
n=wm.node_tree.nodes;l=wm.node_tree.links;tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=.7;tex.inputs['Detail'].default_value=3
coord=n.new('ShaderNodeTexCoord');l.new(coord.outputs['Object'],tex.inputs['Vector']);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.22;l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
g=json.load(open(ROOT/'data'/'geo.json'));hf=np.load(ROOT/'data'/'heightfield.npz');hx,hy,hz=hf['x'],hf['y'],hf['z']
def H(x,y):
 ix=np.clip((x-hx[0])/6,0,len(hx)-1.001);iy=np.clip((y-hy[0])/6,0,len(hy)-1.001);i,j=int(ix),int(iy);fx,fy=ix-i,iy-j
 return float(hz[j,i]*(1-fx)*(1-fy)+hz[j,i+1]*fx*(1-fy)+hz[j+1,i]*(1-fx)*fy+hz[j+1,i+1]*fx*fy)
def XY(lon,lat):return ((lon-g['origin'][0])*111320*math.cos(math.radians(g['origin'][1])),(lat-g['origin'][1])*111320)
print('TERRAIN',flush=True)
a=Geo('Terrain_6m_grid_coarse_DEM',cs['01_Terrain_WGS84']);a.mesh(g['terrain']['verts'],g['terrain']['faces'],m['earth'])
for i in g['terrain']['sand_faces']:a.mi[i]=m['sand']
for i in g['terrain']['granite_faces']:a.mi[i]=m['granite']
terrain=a.finish(True);terrain['data_source']='Mapzen terrain tiles; coarse source DEM, coast constrained; NOT survey precision'
# Shore apron hides raster border and gives the coast a continuous natural edge.
coast=g['coast']
for area in g['areas']:
 if area['kind'] not in ['pitch']:continue
 a=Geo('OSM_'+area['kind']+'_'+str(area['id']),cs['01_Terrain_WGS84'])
 for tr in area['tri']:a.face(tr,m['sand'] if area['kind'] in ['beach','sand'] else m['granite'] if area['kind']=='bare_rock' else m['earth'])
 a.finish()
a=Geo('Ocean_horizon',cs['06_Sea_And_Boats']);a.box((0,0,-2),(25000,25000,3),m['water']);a.finish()
print('ROADS',flush=True)
# Consolidated path ribbons with raised curbs, stairs and occasional handrails.
a=Geo('OSM_pedestrian_network',cs['03_Roads_And_Quays']);curb=Geo('Granite_curbs_and_steps',cs['03_Roads_And_Quays'])
for rd in g['roads']:
 ps=rd['points'];ribbon(a,ps,rd['width'],m['paving'])
 for i in range(len(ps)-1):
  p,q=Vector(ps[i]),Vector(ps[i+1]);d=q-p
  if d.xy.length<.01:continue
  n=Vector((-d.y,d.x,0)).normalized()*rd['width']/2
  for sign in [-1,1]:curb.beam(p+n*sign,q+n*sign,.13,m['granite'],4)
  if rd['kind']=='steps':
   count=max(1,int(d.length/.45))
   for k in range(count):
    v=p+d*k/count;curb.beam(v-n,v+n,.12,m['ivory'],4)
a.finish();curb.finish()
print('BUILDINGS',flush=True)
# Facades follow the actual map polygon; added architectural detail is an interpretation.
SKIP={164652578,164669122}
def window(a,mid,u,n,z,w,h,arched=False,shutters=False):
 mid=Vector((mid[0],mid[1],z));u=Vector(u);n=Vector(n)
 def p(x,zz,dep=.10):return tuple(mid+u*x+Vector((0,0,zz))+n*dep)
 a.face([p(-w/2,0),p(w/2,0),p(w/2,h),p(-w/2,h)],m['glass'])
 for off in [-w/2,w/2]:a.beam(p(off,-.07,.18),p(off,h,.18),.095,m['ivory'],4)
 for zz in [0,h]:a.beam(p(-w/2-.1,zz,.2),p(w/2+.1,zz,.2),.10,m['ivory'],4)
 a.beam(p(0,0,.17),p(0,h,.17),.025,m['green'],4);a.beam(p(-w/2,h*.5,.16),p(w/2,h*.5,.16),.025,m['green'],4)
 if arched:
  r=w/2
  for k in range(10):
   t1=k*pi/10;t2=(k+1)*pi/10
   a.face([p(0,h),p(r*cos(t1),h+r*sin(t1)),p(r*cos(t2),h+r*sin(t2))],m['glass'])
   a.beam(p(r*cos(t1),h+r*sin(t1),.16),p(r*cos(t2),h+r*sin(t2),.16),.095,m['ivory'],4)
 if shutters:
  for side in [-1,1]:
   x=side*(w*.7);a.face([p(x-w*.13,0,.21),p(x+w*.13,0,.21),p(x+w*.13,h,.21),p(x-w*.13,h,.21)],m['green'])
   for k in range(1,8):a.beam(p(x-w*.13,h*k/8,.23),p(x+w*.13,h*k/8,.23),.018,m['ivory'],4)
for bi,b in enumerate(g['buildings']):
 if b['id'] in SKIP:continue
 poly=list(reversed(b['poly']));base=b['base'];h=b['height'];levels=b['levels'];mat=m['brick'] if b['id']%4==0 else m['plaster'] if b['id']%3 else m['ivory']
 a=Geo('B_'+str(b['id'])+'_'+(b['name'] or 'Historic_villa'),cs['02_OSM_Buildings'])
 for tr in b['tri']:a.face([(x,y,base+h) for x,y in tr],m['roof']);a.face([(x,y,min(base-1,min(H(*p) for p in poly))) for x,y in reversed(tr)],m['granite'])
 # Signed area gives the exterior direction even when map winding differs.
 signed=sum(p[0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*p[1] for i,p in enumerate(poly))
 for i,p in enumerate(poly):
  q=poly[(i+1)%len(poly)];dx,dy=q[0]-p[0],q[1]-p[1];length=math.hypot(dx,dy)
  if length<.1:continue
  u=(dx/length,dy/length,0);n=(u[1],-u[0],0) if signed>0 else (-u[1],u[0],0)
  low=min(base-1,H(*p)-.15,H(*q)-.15)
  a.face([(p[0],p[1],low),(q[0],q[1],low),(q[0],q[1],base+h),(p[0],p[1],base+h)],mat)
  for z in [base+.4,base+h]+[base+f*h/levels for f in range(1,levels)]:a.beam((p[0],p[1],z),(q[0],q[1],z),.16,m['ivory'],4)
  if length<3.3:continue
  count=max(1,int(length/3.5));step=length/count
  for k in range(count):
   t=(k+.5)/count;mid=(p[0]+dx*t,p[1]+dy*t)
   for floor in range(levels):
    zz=base+floor*h/levels+.85;wh=min(1.65,h/levels-1.2);window(a,mid,u,n,zz,min(1.35,step*.5),wh,arched=(b['id']%5==0 and floor==levels-1),shutters=b['id']%4==1)
  # Narrow rainwater pipes break up long plaster walls.
  if length>8:a.beam((p[0]+u[0]*.35+n[0]*.18,p[1]+u[1]*.35+n[1]*.18,base+.2),(p[0]+u[0]*.35+n[0]*.18,p[1]+u[1]*.35+n[1]*.18,base+h),.065,m['iron'],6)
 rect=b['rect'];r0,r1,r2=rect[:3];w=math.dist(r0,r1);d=math.dist(r1,r2);ang=math.atan2(r1[1]-r0[1],r1[0]-r0[0]);c=((r0[0]+r2[0])/2,(r0[1]+r2[1])/2)
 if b['area']/(w*d)>.72 and b['area']<1800:
  hiproof(a,c,w+.7,d+.7,base+h+.12,min(w,d)*.25,m['roof'],m['ivory'],ang)
 else:
  for i,p in enumerate(poly):q=poly[(i+1)%len(poly)];a.beam((p[0],p[1],base+h+.25),(q[0],q[1],base+h+.25),.18,m['ivory'],4)
 o=a.finish();o['osm_id']=b['id'];o['osm_name']=b['name'];o['footprint_source']='OpenStreetMap';o['facade_accuracy']='Interpretive modular facade; not measured';o['height_source']='OSM' if b['tags'].get('height') else 'Estimated';o['game_role']='Static building, no interior'
 if bi%200==0:print('building',bi,flush=True)
# Custom modeled landmarks.
from landmarks import make_landmarks
make_landmarks(g,cs,m,H,XY,window)
from street_detail import add_street_detail
add_street_detail(cs,m,H)
print('TREES',flush=True)
# Six shared meshes: branched trunks with dense irregular compound foliage, actual geometry.
templates=[]
for variant in range(6):
 a=Geo('Banyan_canopy_variant_'+str(variant),cs['05_Vegetation_Instances']);a.beam((0,0,0),(.12,-.05,5.2),.28,m['bark'],9,r2=.10)
 for branch in range(9):
  ang=branch*2*pi/9+.2;end=(cos(ang)*2.8,sin(ang)*2.8,5.0+random.random()*1.5);a.beam((0,0,2.8+branch*.2),end,.13,m['bark'],6,r2=.025)
 for cluster in range(40):
  az=random.uniform(0,2*pi);rad=3.9*math.sqrt(random.random());cx=rad*cos(az);cy=rad*sin(az);cz=5.8+2.4*math.sqrt(max(0,1-(rad/4.1)**2))+random.uniform(-1.3,.3)
  a.beam((0,0,4.4),(cx,cy,cz),.042,m['bark'],5,r2=.012)
  for k in range(42):
   x=cx+random.gauss(0,.68);y=cy+random.gauss(0,.68);z=cz+random.gauss(0,.42)
   az=random.uniform(0,2*pi);tilt=random.uniform(-.7,.7);length=random.uniform(.20,.43);width=length*.48
   u=Vector((cos(az)*cos(tilt),sin(az)*cos(tilt),sin(tilt)))*length;v=Vector((-sin(az),cos(az),random.uniform(-.4,.4)))*width;c=Vector((x,y,z))
   a.face([tuple(c-u),tuple(c+v+Vector((0,0,.035))),tuple(c+u),tuple(c-v)],m['leaf'+str(random.choice([variant,variant,(variant+1)%6]))])
 o=a.finish(smooth=True,uv=False);templates.append(o.data);bpy.data.objects.remove(o,do_unlink=True)
for i,(x,y,z,h,v) in enumerate(g['trees']):
 o=bpy.data.objects.new('Tree_'+str(i).zfill(5),templates[v]);cs['05_Vegetation_Instances'].objects.link(o);o.location=(x,y,z-.05);o.rotation_euler[2]=random.uniform(0,2*pi);k=h/8;o.scale=(k*random.uniform(.85,1.1),k*random.uniform(.85,1.1),k)
from context_scene import add_context
add_context(g,cs,m,H,XY)
bpy.data.collections['09_Xiamen_Distant_Context'].hide_render=True
# Low shoreline boulders and isolated rocks.
a=Geo('Coastal_granite_boulders',cs['01_Terrain_WGS84'])
for i in range(0,len(coast),6):
 x,y,z=coast[i]
 if y<-450 and -700<x<100:continue
 for k in range(random.randint(1,3)):
  r=random.uniform(1.3,4);a.ellipsoid((x+random.uniform(-4,4),y+random.uniform(-4,4),.2),(r,r*.75,r*.7),m['granite'],12,7,.19)
a.finish(True)
# Set useful game pivots: XY bounds centre, bottom Z, leaving world placement intact.
for ob in list(bpy.data.objects):
 if ob.type!='MESH' or ob.data.users>1 or not len(ob.data.vertices):continue
 arr=np.empty(len(ob.data.vertices)*3,dtype=np.float32);ob.data.vertices.foreach_get('co',arr);arr=arr.reshape(-1,3)
 lo=arr.min(axis=0);hi=arr.max(axis=0);pivot=np.array([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]],dtype=np.float32)
 # Font meshes have a rotation and their origin is already a useful local pivot.
 if any(abs(v)>.001 for v in ob.rotation_euler):continue
 arr-=pivot;ob.data.vertices.foreach_set('co',arr.ravel());ob.location+=Vector(pivot);ob.data.update()

from conform_roads import conform_roads,conform_curbs
conform_roads(s)
conform_curbs(s)
# Simple usable collision shell, kept out of camera renders.
co=terrain.copy();co.data=terrain.data.copy();co.name='COL_Terrain';cs['08_Game_Collision'].objects.link(co);co.hide_render=True;co.hide_set(True);co['collision_only']=True
cs['08_Game_Collision'].hide_render=True
# Cameras are authored as separate shots for inspection and animation.
from cameras import setup_cameras
setup_cameras(s,cs,H,XY)
s['project_title']='GULANGYU / Sea Garden';s['origin_wgs84_lon']=g['origin'][0];s['origin_wgs84_lat']=g['origin'][1];s['accuracy']='OSM coastline, roads and footprints; DEM terrain; interpreted facade and landmark geometry'
for img in bpy.data.images:
 if img.source=='FILE':img.pack()
# Camera view on opening.
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.clip_end=50000
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'delivery'/'Gulangyu_World.blend'),compress=True)
stats={'objects':len(bpy.data.objects),'unique_meshes':len(bpy.data.meshes),'unique_mesh_vertices':sum(len(me.vertices) for me in bpy.data.meshes),'unique_mesh_polygons':sum(len(me.polygons) for me in bpy.data.meshes),'build_seconds':round(time.time()-start,2),'buildings':len(g['buildings']),'trees':len(g['trees']),'roads':len(g['roads'])}
(ROOT/'delivery'/'scene_stats.json').write_text(json.dumps(stats,indent=2));print('DONE',stats,flush=True)
if '--preview' in sys.argv:
 s.render.resolution_percentage=50;s.eevee.taa_render_samples=24
 for f in [1,97,193,289,385,481]:
  s.frame_set(f);s.render.filepath=str(ROOT/'previews'/f'view_{f:04}.png');bpy.ops.render.render(write_still=True)
