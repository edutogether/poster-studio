"""Poster Studio 대기 영상: 관절 좌표를 연속 계산하는 3D 로봇.

Blender 4.5 LTS: blender -b -t 6 -P scripts/media/render-robot-scenes.py -- sketch
장면: sketch / color / admire. --preview는 첫 프레임만 렌더한다.
외부 자산·생성 API 없이 재현하며 최종 MP4 인코딩은 ffmpeg로 한다.
"""
import bpy
import math
import os
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
action = next((a for a in args if not a.startswith('--')), 'sketch')
preview = '--preview' in args
if action not in ('sketch', 'color', 'admire'):
    raise ValueError(action)
out = os.path.abspath('.cache/robot-3d-v4/' + action)
os.makedirs(out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES' if '--cycles' in args else 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.fps = 30
scene.render.film_transparent = False
scene.render.image_settings.color_mode = 'RGB'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
scene.world.color = (0.8, 0.8, 0.8)
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = -0.4
if hasattr(scene, 'eevee'):
    scene.eevee.taa_render_samples = 32

def mat(name, color, metallic=0, rough=0.3, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = 0.25
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

ivory = mat('따뜻한 도자기', (0.84, 0.76, 0.61), 0.22, 0.25)
white = mat('종이와 운동화 밑창', (0.94, 0.94, 0.92), 0, 0.42)
black = mat('검은 유리 얼굴', (0.009, 0.015, 0.020), 0.55, 0.17)
metal = mat('관절 금속', (0.09, 0.12, 0.13), 0.82, 0.24)
red = mat('영화제 빨강', (0.72, 0.018, 0.012), 0.2, 0.25)
gold = mat('황동', (0.68, 0.38, 0.12), 0.7, 0.24)
wood = mat('연필 나무', (0.61, 0.38, 0.16), 0, 0.5)
eyes = mat('빛나는 눈', (1, 0.52, 0.16), 0, 0.25, 3)
blue = mat('밤하늘', (0.018, 0.10, 0.3), 0.12, 0.36)
teal = mat('청록색', (0.015, 0.38, 0.33), 0, 0.35)
yellow = mat('별빛', (1, 0.6, 0.03), 0.1, 0.32)

def finish(obj, name, material, parent=None):
    obj.name = name
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    for p in getattr(obj.data, 'polygons', []):
        p.use_smooth = True
    return obj

def sphere(name, loc, scale, material, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=loc)
    o = finish(bpy.context.object, name, material, parent)
    o.scale = scale
    return o

def box(name, loc, scale, material, bevel=0.12, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = finish(bpy.context.object, name, material, parent)
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = o.modifiers.new('둥근 모서리', 'BEVEL')
    mod.width = bevel
    mod.segments = 5
    o.modifiers.new('면 법선', 'WEIGHTED_NORMAL')
    return o

def rod(name, a, b, radius, material, vertices=32, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=1)
    o = finish(bpy.context.object, name, material, parent)
    set_rod(o, a, b)
    bevel = o.modifiers.new('모서리', 'BEVEL')
    bevel.width = 0.03
    bevel.segments = 3
    return o

def set_rod(o, a, b):
    a, b = Vector(a), Vector(b)
    o.location = (a + b) / 2
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (b - a).to_track_quat('Z', 'Y')
    o.scale.z = (b - a).length

def curve(name, points, radius, material, parent=None):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth = radius
    c.bevel_resolution = 4
    s = c.splines.new('POLY')
    s.points.add(len(points) - 1)
    for p, co in zip(s.points, points):
        p.co = (*co, 1)
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    o.parent = parent
    return o

def empty(name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc
    return o

# 발을 지지점으로 두고 상체의 무게 이동에 맞춰 다리 관절을 연결한다.
thighs = []
for x in (-0.35, 0.35):
    box('흰 밑창', (x, -0.16, 0.14), (0.49, 0.75, 0.17), white, 0.08)
    box('빨간 운동화', (x, -0.12, 0.28), (0.45, 0.64, 0.29), red, 0.12)
    for z in (0.3, 0.36):
        rod('운동화 끈', (x - 0.12, -0.44, z), (x + 0.12, -0.44, z), 0.025, white)
    rod('종아리', (x, 0.01, 0.40), (x, 0.01, 0.80), 0.135, metal)
    sphere('무릎', (x, 0.01, 0.81), (0.19, 0.19, 0.19), metal)
    thighs.append((x, rod('허벅지', (x, 0.01, 0.87), (x * 0.85, 0.01, 1.18), 0.19, ivory)))
body_start = set(bpy.data.objects)
sphere('몸체', (0, 0.02, 1.48), (0.59, 0.43, 0.62), ivory)
sphere('가슴 표시', (0, -0.409, 1.54), (0.12, 0.025, 0.12), gold)
sphere('가슴 빨간 불', (0, -0.435, 1.54), (0.057, 0.014, 0.057), red)
rod('목', (0, 0, 1.93), (0, 0, 2.14), 0.18, metal)
head = empty('머리 관절', (0, 0, 2.65))
sphere('머리 도자기', (0, 0, 0), (0.90, 0.66, 0.72), ivory, head)
sphere('검은 얼굴', (0, -0.565, -0.015), (0.737, 0.22, 0.535), black, head)
for x in (-0.91, 0.91):
    sphere('귀 금속', (x, 0.005, -0.03), (0.12, 0.24, 0.29), metal, head)
    sphere('귀 황동', (x * 1.06, -0.025, -0.03), (0.025, 0.16, 0.20), gold, head)
eye_curves = []
pupils = []
for x in (-0.29, 0.29):
    eye = empty('눈꺼풀', (x, -0.785, 0.085))
    eye.parent = head
    sphere('발광 눈', (0, 0, 0), (0.112, 0.034, 0.15), eyes, eye)
    pupil = sphere('시선을 따라가는 눈동자', (0, -0.034, 0), (0.054, 0.012, 0.075), black, eye)
    sphere('눈빛', (-0.025, -0.045, 0.032), (0.022, 0.008, 0.025), white, pupil)
    eye_curves.append(eye)
    pupils.append(pupil)
curve('작은 미소', [(0.15 * math.cos(math.pi + t * math.pi / 24), -0.794, -0.14 + 0.085 * math.sin(math.pi + t * math.pi / 24)) for t in range(25)], 0.018, gold, head)
rod('안테나', (0, 0, 0.67), (0, 0, 0.99), 0.045, metal, parent=head)
sphere('빨간 안테나', (0, 0, 1.0), (0.10, 0.10, 0.10), red, head)

arms = []
for sign in (-1, 1):
    a = (sign * 0.58, 0, 1.72)
    e = (sign * 0.86, -0.15, 1.35)
    h = (sign * 0.79, -0.4, 1.13)
    shoulder = sphere('어깨', a, (0.23, 0.23, 0.23), ivory)
    upper = rod('위팔', a, e, 0.13, metal)
    elbow = sphere('팔꿈치', e, (0.17, 0.17, 0.17), metal)
    fore = rod('아래팔', e, h, 0.16, ivory)
    hand = empty('손 관절', h)
    sphere('손바닥', (0, 0, 0), (0.17, 0.14, 0.19), metal, hand)
    for offset in (-0.09, 0, 0.09):
        sphere('둥근 손가락', (offset, -0.10, -0.045), (0.043, 0.07, 0.115), ivory, hand)
    arms.append((a, upper, elbow, fore, hand))

body_parts = set(bpy.data.objects) - body_start
body = empty('상체 무게 중심')
for obj in body_parts:
    if obj.parent is None:
        obj.parent = body

def move_arm(index, elbow_hint, wrist):
    shoulder, upper, joint, fore, hand = arms[index]
    a, target = Vector(shoulder), Vector(wrist)
    axis = target - a
    distance = max(0.01, axis.length)
    axis.normalize()
    upper_length, fore_length = 0.58, 0.60
    distance = min(distance, upper_length + fore_length - 0.002)
    target = a + axis * distance
    along = (upper_length ** 2 - fore_length ** 2 + distance ** 2) / (2 * distance)
    outward = Vector(elbow_hint) - a
    bend = outward - axis * outward.dot(axis)
    if bend.length < 0.001:
        bend = Vector((0, 0, -1))
    bend.normalize()
    elbow = a + axis * along + bend * math.sqrt(max(0, upper_length ** 2 - along ** 2))
    set_rod(upper, a, elbow)
    joint.location = elbow
    set_rod(fore, elbow, target)
    hand.location = target
    hand.rotation_euler.y = -0.12 if index == 0 else 0.18

pencil = empty('빨간 연필')
rod('연필 육각 몸통', (0, 0, 0.1), (0, 0, 0.83), 0.063, red, 6, pencil)
rod('연필 지우개 띠', (0, 0, 0.81), (0, 0, 0.91), 0.066, gold, parent=pencil)
sphere('연필 지우개', (0, 0, 0.94), (0.067, 0.067, 0.10), red, pencil)
bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0, radius2=0.063, depth=0.20, location=(0, 0, 0))
finish(bpy.context.object, '연필 촉', wood, pencil)
sphere('흑연 끝', (0, 0, -0.095), (0.015, 0.015, 0.025), black, pencil)

board = empty('작업 보드', (0, -0.75, 1.05))
board.rotation_euler.x = math.radians(30)
box('보드', (0, 0, 0), (1.12, 0.10, 0.87), wood, 0.055, board)
box('종이', (0, -0.067, 0), (1.02, 0.015, 0.76), white, 0.02, board)
curve('그려진 별', [(0.23 * math.sin(i * math.pi * 4 / 5), -0.087, 0.23 * math.cos(i * math.pi * 4 / 5)) for i in range(6)], 0.012, red, board)

palette = empty('팔레트', (-0.69, -0.61, 1.34))
sphere('팔레트 판', (0, 0, 0), (0.36, 0.065, 0.28), wood, palette)
for i, material in enumerate((red, yellow, teal, blue)):
    a = i * math.pi / 2
    sphere('물감', (0.23 * math.cos(a), -0.067, 0.17 * math.sin(a)), (0.073, 0.026, 0.068), material, palette)

poster = empty('완성작', (0, -0.76, 1.27))
box('포스터 프레임', (0, 0, 0), (1.12, 0.11, 1.3), gold, 0.045, poster)
box('포스터 그림', (0, -0.067, 0), (0.99, 0.016, 1.17), blue, 0.02, poster)
sphere('포스터 달', (0.20, -0.088, 0.25), (0.20, 0.018, 0.20), yellow, poster)
for x, z, s in ((-0.25, 0.40, 0.04), (-0.12, 0.17, 0.025), (0.31, -0.05, 0.032)):
    sphere('포스터 별', (x, -0.09, z), (s, 0.016, s), white, poster)
box('포스터 제목 선', (0, -0.092, -0.34), (0.65, 0.012, 0.065), white, 0.005, poster)
box('포스터 부제 선', (0, -0.092, -0.45), (0.42, 0.012, 0.024), white, 0.004, poster)

def visible(root, show):
    root.hide_render = not show
    for child in root.children_recursive:
        child.hide_render = not show

visible(board, True)
visible(palette, True)
visible(poster, False)
visible(pencil, True)
board.parent = body
palette.parent = board
palette.location = (-0.30, -0.115, -0.30)
palette.scale = (0.54, 0.54, 0.54)
pencil.parent = body

def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)

def pulse(u, a, b, c, d):
    return smooth((u-a)/(b-a)) * (1-smooth((u-c)/(d-c)))

def board_point(x, z, depth=-0.10):
    return board.rotation_euler.to_matrix() @ Vector((x, depth, z)) + board.location

def look_at(target, strength=1):
    direction = Vector(target) - head.location
    yaw = math.atan2(direction.x, -direction.y)
    pitch = math.atan2(-direction.z, math.hypot(direction.x, direction.y))
    head.rotation_euler.x = pitch * strength
    head.rotation_euler.z = 0.30 * (1-strength) + yaw * strength
    for pupil in pupils:
        pupil.location.x = max(-0.032, min(0.032, yaw * 0.055))
        pupil.location.z = max(-0.036, min(0.025, -pitch * 0.035))

def animate(frame):
    u = (frame - 1) / 180
    t = u * math.tau
    engaged = pulse(u, 0.02, 0.18, 0.77, 0.97)
    head.rotation_euler = (0, 0, 0.30)
    body.location = (0, 0, 0)
    body.rotation_euler = (0, 0, 0)
    board.location = (0, -0.69, 1.19)
    board.rotation_euler = (0.40, 0, 0)
    # 손을 뻗기 전에 시선을 옮기고, 연필 촉과 종이 접촉 좌표를 일치시킨다.
    gaze = pulse(u, 0, 0.13, 0.82, 0.99)
    if action == 'sketch':
        body.rotation_euler.x = 0.045 * engaged
        body.rotation_euler.y = 0.035 * math.sin(t * 2) * engaged
        body.location.z = -0.026 * engaged
        contact = board_point(0.13 + 0.12 * math.sin(t * 3), 0.18 + 0.085 * math.cos(t * 3))
        look_at(contact, gaze * 0.67)
        head.rotation_euler.y = 0.06 * math.sin(t * 3) * engaged
        tip = Vector((0.61, -0.56, 1.43)).lerp(contact, engaged)
    elif action == 'color':
        dip = pulse(u, 0.12, 0.28, 0.37, 0.53)
        paint = pulse(u, 0.48, 0.63, 0.74, 0.92)
        pigment = board_point(-0.30, -0.25, -0.18)
        paint_point = board_point(0.18 + 0.13 * math.sin(t * 3), 0.20)
        tip = Vector((0.61, -0.56, 1.43)).lerp(pigment, dip)
        tip = tip.lerp(paint_point, paint)
        body.rotation_euler.z = -0.17 * dip + 0.06 * paint
        body.rotation_euler.x = 0.06 * engaged
        body.location.x = -0.05 * dip
        body.location.z = -0.035 * dip
        gaze_left = pulse(u, 0.02, 0.17, 0.35, 0.49)
        look_at(paint_point.lerp(pigment, gaze_left), gaze * 0.74)
    else:
        lift = pulse(u, 0.06, 0.26, 0.62, 0.85)
        greet = pulse(u, 0.48, 0.61, 0.80, 0.98)
        board.location.z += 0.34 * lift
        board.rotation_euler.x -= 0.30 * lift
        board.rotation_euler.y = 0.12 * math.sin(t) * lift
        body.rotation_euler.z = -0.22 * lift * (1-greet)
        body.rotation_euler.y = -0.04 * lift
        body.location.x = 0.055 * lift
        body.location.z = 0.025 * lift
        look_at(board_point(0, 0.2), lift * 0.50 * (1-greet))
        head.rotation_euler.y = -0.12 * lift + 0.065 * math.sin(t * 3) * greet
        # 그림을 살핀 뒤 관객을 바라보고 고개를 끄덕이며 연필을 들어 보인다.
        head.rotation_euler.x += 0.11 * math.sin(t * 4) * greet
        tip = Vector((0.61, -0.56, 1.43)).lerp(Vector((0.85 + 0.08 * math.sin(t * 4), -0.36, 1.99)), greet)
    # 연필 촉부터 손잡이까지 같은 축을 써서 손에서 도구가 미끄러지지 않는다.
    tool_axis = Vector((0.38, 0.20, 0.90)).normalized()
    pencil.rotation_mode = 'QUATERNION'
    pencil.rotation_quaternion = tool_axis.to_track_quat('Z', 'Y')
    pencil.location = tip + tool_axis * 0.095
    wrist = tip + tool_axis * 0.36
    move_arm(1, (1.05, -0.18, 1.4), wrist)
    move_arm(0, (-0.95, -0.14, 1.35), board_point(-0.53, 0.03, 0))
    blink = 1 - 0.94 * math.exp(-((u - 0.73) / 0.022) ** 2)
    for eye in eye_curves:
        eye.scale.z = blink
    rotation = body.rotation_euler.to_matrix()
    for x, thigh in thighs:
        hip = rotation @ Vector((x * 0.85, 0.01, 1.18)) + body.location
        set_rod(thigh, (x, 0.01, 0.87), hip)

floor = mat('흰 스튜디오', (1, 1, 1), 0, 0.75, 1.32)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0.035))
finish(bpy.context.object, '흰 바닥', floor)
# 흰 화면에 닿는 부드러운 접지 그림자. 고정된 발 아래에만 둔다.
bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0.04))
shadow = bpy.context.object
shadow.name = '접지 그림자'
shadow.scale = (0.82, 0.55, 1)
shadow_mat = bpy.data.materials.new('부드러운 접지')
shadow_mat.use_nodes = True
nodes = shadow_mat.node_tree.nodes
nodes.clear()
uv = nodes.new('ShaderNodeTexCoord')
distance = nodes.new('ShaderNodeVectorMath')
distance.operation = 'DISTANCE'
distance.inputs[1].default_value = (0.5, 0.5, 0)
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (1.00, 1.00, 1.00, 1)
ramp.color_ramp.elements[1].position = 0.46
ramp.color_ramp.elements[1].color = (1.32, 1.32, 1.32, 1)
ramp.color_ramp.interpolation = 'EASE'
emission = nodes.new('ShaderNodeEmission')
output = nodes.new('ShaderNodeOutputMaterial')
links = shadow_mat.node_tree.links
links.new(uv.outputs['UV'], distance.inputs[0])
links.new(distance.outputs['Value'], ramp.inputs[0])
links.new(ramp.outputs[0], emission.inputs[0])
links.new(emission.outputs[0], output.inputs['Surface'])
shadow.data.materials.append(shadow_mat)
def area(name, loc, energy, size):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o = bpy.context.object
    o.name = name
    o.data.energy = energy
    o.data.shape = 'DISK'
    o.data.size = size
    o.rotation_euler = (Vector((0, 0, 1.7)) - o.location).to_track_quat('-Z', 'Y').to_euler()
area('큰 소프트박스', (-3, -4, 6), 250, 5)
area('오른쪽 반사광', (4, -1, 4), 150, 4)
area('뒤쪽 윤곽광', (0, 4, 5), 300, 3)
bpy.ops.object.camera_add(location=(4.1, -12, 5.0))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, -0.10, 1.83)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.5
scene.camera = camera
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
preview_frame = next((int(a.split('=')[1]) for a in args if a.startswith('--frame=')), 1)
animate(preview_frame)
if preview:
    scene.render.filepath = os.path.join(out, 'preview.png')
    bpy.ops.render.render(write_still=True)
else:
    for frame in range(1, 181):
        animate(frame)
        scene.render.filepath = os.path.join(out, f'{frame:04d}.png')
        bpy.ops.render.render(write_still=True)
        if frame % 30 == 0:
            print(f'{action}: {frame}/180', flush=True)
