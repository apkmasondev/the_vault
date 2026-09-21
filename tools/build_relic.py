"""Rebuild V-07 locally: blender --background --python tools/build_relic.py.

No external assets. The GLB contains beveled armor and emissive inlays; the
browser merges the plates into two draw calls and animates their centers.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = .28
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat

armor = material('Blackened titanium', (.085, .105, .115), .88)
light = material('Amber inscriptions', (1, .53, .13), .5, 3)

def mesh_object(name, vertices, faces, mat, bevel=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('Machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normals = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=normals.name)
    return obj

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.02)
ico = bpy.context.object
triangles = [[ico.data.vertices[i].co.copy() for i in face.vertices] for face in ico.data.polygons]
bpy.data.objects.remove(ico, do_unlink=True)

for index, tri in enumerate(triangles):
    center = sum(tri, Vector()) / 3
    normal = center.normalized()
    top = [center + (v - center) * .9 for v in tri]
    bottom = [v - normal * .115 for v in top]
    plate = mesh_object(f'Armor_{index:02}', top + bottom,
                        [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], armor, .022)
    # Local origin is the animation hinge; glTF converts the coordinate basis.
    plate.location = center
    for vertex in plate.data.vertices:
        vertex.co -= center
    vertices, faces = [], []
    def strip(a, b, width):
        side = (b - a).cross(normal).normalized() * width
        start = len(vertices)
        vertices.extend([a-side, a+side, b+side, b-side])
        faces.append(tuple(range(start, start+4)))
    for side in range(3):
        a = center + (top[side] - center) * .77 + normal * .005
        b = center + (top[(side+1)%3] - center) * .77 + normal * .005
        strip(a.lerp(b, .14), a.lerp(b, .72), .004)
    # Three asymmetric engraved ticks distinguish faces as the object rotates.
    tangent = (top[0] - center).normalized()
    cross = tangent.cross(normal).normalized()
    for tick in range(3):
        a = center + normal * .006 + tangent * (.025 + tick * .035)
        strip(a - cross * (.04 - tick * .008), a + cross * (.04 - tick * .008), .006)
    inscription = mesh_object(f'Circuit_{index:02}', vertices, faces, light)
    inscription.location = center
    for vertex in inscription.data.vertices:
        vertex.co -= center

output = ROOT / 'public' / 'media' / 'vault-relic.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_yup=True, export_apply=True)
# Keep an editable source beside the reproducible builder, outside delivery.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'tools' / 'vault-relic.blend'))
print(f'V-07 exported: {output.stat().st_size:,} bytes')
