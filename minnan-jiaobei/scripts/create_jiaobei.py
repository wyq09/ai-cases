"""Blender: closed crescent mesh, flat underside and rounded lacquered crown."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
# Rings across the width, longitudinal sections. Blender Z is up; GLB exports Y up.
N,M=96,28
verts=[]
for side in (0,1):
    for i in range(N+1):
        t=i/N
        y=(t-.5)*3.5
        width=1.42*math.sin(math.pi*t)**.60 + .045
        inner=.10*math.sin(math.pi*t)
        for j in range(M+1):
            s=j/M
            x=inner+width*s-.65
            z=(.07+.62*(math.sin(math.pi*s)**.60)*(math.sin(math.pi*t)**.6)) if side else 0
            verts.append((x,y,z))
faces=[]
stride=(N+1)*(M+1)
for side in (0,1):
    for i in range(N):
        for j in range(M):
            a=side*stride+i*(M+1)+j
            face=(a,a+1,a+M+2,a+M+1)
            faces.append(face if side else tuple(reversed(face)))
boundary=list(range(M+1))+[i*(M+1)+M for i in range(1,N+1)]+[N*(M+1)+j for j in range(M-1,-1,-1)]+[i*(M+1) for i in range(N-1,0,-1)]
for a,b in zip(boundary,boundary[1:]+boundary[:1]): faces.append((a,b,b+stride,a+stride))
mesh=bpy.data.meshes.new('Hand carved crescent'); mesh.from_pydata(verts,[],faces); mesh.update()
obj=bpy.data.objects.new('Jiaobei_RedWood',mesh); bpy.context.collection.objects.link(obj); bpy.context.view_layer.objects.active=obj; obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
for p in mesh.polygons: p.use_smooth=p.center.z>0.001
mat=bpy.data.materials.new('Vermilion lacquer · wood grain'); mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(.42,.018,.009,1); bs.inputs['Roughness'].default_value=.4; bs.inputs['Coat Weight'].default_value=.22
obj.data.materials.append(mat)
# Vertex color preserves subtle wood grain in exported GLB without procedural shader dependency.
attr=mesh.color_attributes.new(name='WoodGrain',type='FLOAT_COLOR',domain='CORNER')
for poly in mesh.polygons:
    for li in poly.loop_indices:
        v=mesh.vertices[mesh.loops[li].vertex_index].co
        grain=.92+.025*math.sin(v.x*215+math.sin(v.y*1.2)*1.5)+.012*math.sin(v.x*391+v.y*5)
        attr.data[li].color=(.20*grain,.012*grain,.006*grain,1)
col=mat.node_tree.nodes.new('ShaderNodeVertexColor'); col.layer_name='WoodGrain'
mix=mat.node_tree.nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1; mix.inputs[1].default_value=(.42,.018,.009,1)
mat.node_tree.links.new(col.outputs['Color'], mix.inputs[2])
mat.node_tree.links.new(col.outputs['Color'], bs.inputs['Base Color'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets','jiaobei.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'assets','jiaobei.glb'),export_format='GLB',use_selection=True,export_attributes=True)
print('EXPORTED',len(verts),'vertices',len(faces),'faces')
