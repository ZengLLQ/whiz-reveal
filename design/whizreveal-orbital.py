import bpy, math
from mathutils import Vector
def rgba(h):
    rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(c/12.92 if c<0.04045 else ((c+0.055)/1.055)**2.4 for c in rgb)+(1,)
def material(name,h,metal=0,rough=.4,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=rgba(h)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=rgba(h)
    p.inputs['Emission Strength'].default_value=emission
    return m
steel=material('WhizReveal / brushed slate','#5D6F82',.72,.27)
dark=material('WhizReveal / deep graphite','#171C22',.25,.42)
ground=material('WhizReveal / ink','#0B0D10',.15,.55)
light=material('WhizReveal / pearl light','#E7EEF5',.45,.24,1.4)
edge=material('WhizReveal / orbital steel','#2A333D',.65,.29)
# A continuous W silhouette; front and rear faces with a real bevel.
poly=[(-1.50,1.30),(-.98,-1.30),(-.50,-1.30),(0,.18),(.50,-1.30),(.98,-1.30),(1.50,1.30),(1.02,1.30),(.70,-.50),(.22,.80),(-.22,.80),(-.70,-.50),(-1.02,1.30)]
n=len(poly)
verts=[(x,y,z) for y in (-.18,.18) for x,z in poly]
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new('W solid silhouette');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('W_Monolith',mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(steel)
bevel=obj.modifiers.new('Soft machined edges','BEVEL');bevel.width=.055;bevel.segments=3
obj.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
for name,radius,thickness,rotation,mat in [
 ('Orbit_Inner',2.08,.018,(math.radians(75),math.radians(15),math.radians(-20)),light),
 ('Orbit_Outer',2.65,.026,(math.radians(108),math.radians(-22),math.radians(25)),edge)]:
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=thickness,major_segments=128,minor_segments=12,rotation=rotation)
    ring=bpy.context.object;ring.name=name;ring.data.materials.append(mat)
    for p in ring.data.polygons:p.use_smooth=True
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=1.9,depth=.14,location=(0,0,-1.62))
plinth=bpy.context.object;plinth.name='Plinth';plinth.data.materials.append(dark)
mod=plinth.modifiers.new('Rounded platform edge','BEVEL');mod.width=.04;mod.segments=3
plinth.modifiers.new('Platform normals','WEIGHTED_NORMAL')
bpy.ops.mesh.primitive_torus_add(major_radius=1.84,minor_radius=.008,major_segments=128,minor_segments=8,location=(0,0,-1.545))
bpy.context.object.name='Halo_Base';bpy.context.object.data.materials.append(light)
bpy.ops.mesh.primitive_plane_add(size=24,location=(0,0,-1.7));bpy.context.object.name='Floor';bpy.context.object.data.materials.append(ground)
def point(name,loc,power,color):
    d=bpy.data.lights.new(name,'POINT');d.energy=power;d.color=rgba(color)[:3];d.shadow_soft_size=2.0
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc
point('Key softbox',(-3,-4,5),1900,'#E7EEF5')
point('Slate fill',(4,-2,2),1300,'#5D6F82')
point('Pearl rim',(0,3,4),2300,'#E7EEF5')
scene=bpy.context.scene
world=bpy.data.worlds.new('Graphite environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=rgba('#171C22');world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
d=bpy.data.cameras.new('Delivery camera');camera=bpy.data.objects.new('Delivery camera',d);bpy.context.collection.objects.link(camera)
camera.location=(4,-10,3.3);camera.rotation_euler=(Vector((0,0,-.1))-camera.location).to_track_quat('-Z','Y').to_euler();d.lens=48;scene.camera=camera
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.media_type='IMAGE';scene.render.image_settings.file_format='PNG'
scene.render.fps=30;scene.frame_start=1;scene.frame_end=120
target=artifacts.file(name='whizreveal-orbital-preview.png',media_type='image/png');scene.render.filepath=target.path;bpy.ops.render.render(write_still=True);target.publish()
result={'objects':[{'name':o.name,'dimensions':list(o.dimensions)} for o in bpy.data.objects if o.type=='MESH'],'palette':['#0B0D10','#171C22','#2A333D','#5D6F82','#E7EEF5'],'purpose':'WhizReveal interactive welcome and raffle scene'}

