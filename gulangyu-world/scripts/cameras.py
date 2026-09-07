from scene_lib import *
import json

def setup_cameras(s,cs,H,XY):
 # 6 continuous 4 second shots. No AI images or two-dimensional pans.
 shots=[
 ('01_Island_Arrival', (2000,-2800,1900),(1800,-2600,1740),(-130,10,35),(-100,30,40),53),
 ('02_Sunlight_Rock',(100,-430,142),(65,-415,130),(-77,-263,77),(-82,-261,81),43),
 ('03_Bagua_Mansion',(155,205,99),(120,218,91),(24,348,48),(24,348,49),49),
 ('04_Shuzhuang_Garden',(390,-960,195),(345,-890,155),(166,-643,11),(173,-642,12),45),
 ('05_Architecture',(565,-197,69),(545,-174,59),(480,-62,26),(483,-63,27),50),
 ('06_Longtou_Lane',(332.3,-60,11.2),(332.1,-48,10.7),(332,-32,11.7),(334,-18,11.6),28),
 ]
 manifest=[]
 for i,(name,p0,p1,t0,t1,lens) in enumerate(shots):
  cd=bpy.data.cameras.new(name);cd.lens=lens;cd.clip_start=.2;cd.clip_end=40000;o=bpy.data.objects.new(name,cd);cs['07_Cameras'].objects.link(o)
  f0=i*96+1;f1=f0+95
  for frame,p,t in [(f0,p0,t0),(f1,p1,t1)]:
   o.location=p;o.rotation_euler=(Vector(t)-Vector(p)).to_track_quat('-Z','Y').to_euler();o.keyframe_insert(data_path='location',frame=frame);o.keyframe_insert(data_path='rotation_euler',frame=frame)
  marker=s.timeline_markers.new(name,frame=f0);marker.camera=o
  manifest.append({'name':name,'start':f0,'end':f1,'lens_mm':lens,'position_start':p0,'position_end':p1,'target_start':t0,'target_end':t1})
 s.camera=bpy.data.objects[shots[0][0]];s.frame_start=1;s.frame_end=576
 (ROOT/'delivery'/'shots.json').write_text(json.dumps(manifest,indent=2))
