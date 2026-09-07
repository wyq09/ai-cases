from scene_lib import *

def add_street_detail(cs,m,H):
 c=cs['03_Roads_And_Quays'];a=Geo('Longtou_Lane_Closeup_Doors_Awnings',c)
 # Details attached to the east facade of the mapped low-rise row at 641097300.
 for yy in [-60,-51]:
  xx=329.0-(yy+60)*.094;base=8.98
  # Door glass, timber perimeter, fine handles and a granite threshold.
  a.box((xx+.12,yy,base+1.45),(.16,1.7,2.9),m['green'])
  a.box((xx+.22,yy,base+1.75),(.08,1.43,1.85),m['glass'])
  for dy in [-.86,0,.86]:a.beam((xx+.3,yy+dy,base),(xx+.3,yy+dy,base+2.9),.045,m['ivory'],4)
  for z in [base,base+.8,base+2.9]:a.beam((xx+.3,yy-.9,z),(xx+.3,yy+.9,z),.055,m['ivory'],4)
  a.beam((xx+.39,yy-.13,base+1.15),(xx+.39,yy-.13,base+1.47),.026,m['iron'],8)
  a.box((xx+.35,yy,base-.1),(.8,2.2,.22),m['granite'])
  # Sloped canvas awning, alternating cream and faded terracotta panels.
  for k in range(10):
   y0=yy-1.6+k*.32;y1=y0+.32
   a.face([(xx+.25,y0,base+3.25),(xx+1.4,y0,base+2.92),(xx+1.4,y1,base+2.92),(xx+.25,y1,base+3.25)],m['ivory'] if k%2 else m['roof'])
   a.face([(xx+1.4,y0,base+2.92),(xx+1.4,y0,base+2.70),(xx+1.4,y1,base+2.70),(xx+1.4,y1,base+2.92)],m['ivory'] if k%2 else m['roof'])
  for dy in [-1.55,1.55]:a.beam((xx+.25,yy+dy,base+2.1),(xx+1.4,yy+dy,base+2.9),.033,m['iron'],6)
  for dy in [-2,2]:
   q=(xx+.6,yy+dy,base+.25);a.beam((q[0],q[1],base),(q[0],q[1],base+.5),.31,m['roof'],12,r2=.37)
   for k in range(8):
    t=k*2*pi/8;a.beam((q[0],q[1],base+.5),(q[0]+cos(t)*.4,q[1]+sin(t)*.4,base+1.1),.04,m['leaf2'],5,r2=.015)
 # Street name plate uses the real road name. No invented real-world shop branding.
 a.beam((329.6,-42.1,H(329.6,-42.1)),(329.6,-42.1,11.8),.055,m['iron'],8)
 a.box((329.6,-42.12,11.48),(1.65,.12,.58),m['green'])
 a.finish()
 font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
 for txt,z,size in [('龙头路',11.43,.34),('LONGTOU ROAD',11.20,.11)]:
  cu=bpy.data.curves.new('Street_name_'+txt,'FONT');cu.body=txt;cu.font=font;cu.align_x='CENTER';cu.size=size;cu.extrude=.002;cu.materials.append(MATS[m['ivory']]);o=bpy.data.objects.new('Street_name_'+txt,cu);c.objects.link(o);o.location=(329.6,-42.19,z);o.rotation_euler=(pi/2,0,0)
  bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
