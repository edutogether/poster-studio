"""촬영 화면 예시 영상(개인·단체)을 앱에 넣을 웹용 mp4로 만들고, 정지 그림을 영상 첫 프레임으로 맞춘다(2026-10-16).
왜: 촬영 화면 예시 칸은 정지 그림을 먼저 보이고, 영상이 실제로 재생되기 시작하면 영상으로 바꾼다(src/studio/CameraExample.tsx).
둘이 다르면 넘어가는 순간 그림이 튄다. 그래서 정지 그림 = 이 mp4의 첫 프레임으로 함께 만든다(대기 영상 encode-waiting-videos.py와 같은 규칙).
입력은 셔터 소리·플래시·멈춘 장면까지 넣은 뒤처리본이다(scripts/media/camera-shot-post.py). 여기서는 다시 손대지 않고 굽기만 한다.
숫자 3·2·1과 대사 말풍선은 영상에 굽지 않는다 — 목록의 cues로 앱이 얹는다(_docs/ops/camera-example-videos.md «숫자 3·2·1»·«대사»).

입력 목록.json = {"solo": {"source": "경로/solo-post.mp4", "cues": [...]}, "group": {...}} — 한쪽만 있어도 된다(없는 쪽은 승인 전으로 남긴다).
  cues 항목: {"kind": "count", "from": 7.0, "to": 7.5, "text": "3"} · {"kind": "say", "from": 2.0, "to": 3.5, "text": "…", "x": 40, "y": 12}
  (시각은 영상 초, x·y는 영상 화면 %. 말풍선은 위 20% 띠·가운데 62% 안 — 테스트 test/camera-example.test.tsx가 같은 규칙을 본다)
출력: <출력 폴더>/<solo|group>-<sha256 앞 12자리>.mp4(H.264 High·yuv420p·BT.709 표기·CRF 20·AAC 128k·faststart, 1920×1080)와
      <출력 폴더>/<solo|group>.webp(그 mp4의 첫 프레임, WebP 품질 92), <출력 폴더>/<solo|group>-end.webp(마지막 프레임 = 찰칵 뒤 멈춘 장면),
      그리고 목록 JSON(src/studio/camera-videos.json에 넣을 것)을 표준 출력으로.
      끝 정지 그림은 영상을 아예 못 틀 때(움직임 줄이기 · 자동 재생 거부 · 오류) 보인다 — 10/19 영상은 손이 렌즈를 가린 어두운 장면으로 시작해
      첫 프레임만 두면 그때 칸이 거의 검다.
사용: python scripts/media/encode-camera-videos.py <입력 목록.json> <출력 폴더>      앱에 넣을 때 출력 폴더는 public/studio/camera-v1
      python scripts/media/encode-camera-videos.py --selftest                    합성 영상으로 굽기·결정성·검사 실패를 확인
종료: 0 · 1 검사 실패(크기·소리·정지 그림 대 첫 프레임·신호 범위) · 2 입력 오류
"""
import hashlib, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

W, H = 1920, 1080
MODES = ('solo', 'group')


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    video = next((s for s in info['streams'] if s['codec_type'] == 'video'), None)
    audio = any(s['codec_type'] == 'audio' for s in info['streams'])
    return video, audio, float(info['format']['duration'])


def first_frame(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(H, W, 3)


def last_frame(path):
    """끝에서 0.5초 안의 프레임을 모두 풀어 마지막 장만 쓴다(영상 끝을 정확히 찾는 가장 단순한 길)."""
    p = subprocess.run(['ffmpeg', '-v', 'error', '-sseof', '-0.5', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
    n = len(p.stdout) // (W * H * 3)
    if n < 1: raise SystemExit(f'{path}: 마지막 프레임을 못 읽음')
    return np.frombuffer(p.stdout, np.uint8)[(n - 1) * W * H * 3:].reshape(H, W, 3)


def check_cues(cues, duration):
    bad = []
    for i, c in enumerate(cues):
        if c.get('kind') not in ('count', 'say') or not (0 <= c['from'] < c['to'] <= duration + 1e-6):
            bad.append(f'{i}번 신호의 종류·시각이 틀림'); continue
        if c['kind'] == 'count' and c['text'] not in ('3', '2', '1'): bad.append(f'{i}번 숫자는 3·2·1만')
        if c['kind'] == 'say' and not (0 < c['y'] <= 20 and 19 <= c['x'] <= 81 and c['text'].strip()):
            bad.append(f'{i}번 말풍선이 위 20% 띠·가운데 62% 밖이거나 비었음')
    return bad


def encode(mode, item, out):
    src = item['source']
    if not os.path.exists(src): raise SystemExit(f'{mode}: 파일 없음 {src}')
    video, audio, duration = probe(src)
    problems = []
    if not video or (int(video['width']), int(video['height'])) != (W, H): problems.append(f'크기가 {W}×{H}가 아님')
    if not audio: problems.append('소리가 없음(촬영 화면 영상은 생활 소리가 있어야 한다)')
    tmp = os.path.join(out, f'{mode}.tmp.mp4')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1',
                    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
                    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
                    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '48000', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
                    '-movflags', '+faststart', tmp], check=True)
    data = open(tmp, 'rb').read(); sha = hashlib.sha256(data).hexdigest()
    name = f'{mode}-{sha[:12]}.mp4'
    for old in os.listdir(out):
        if old.startswith(mode + '-') and old.endswith('.mp4') and old != name: os.remove(os.path.join(out, old))
    os.replace(tmp, os.path.join(out, name))
    frame = first_frame(os.path.join(out, name))
    still = os.path.join(out, f'{mode}.webp')
    Image.fromarray(frame).save(still, quality=92, method=6)
    seam = float(np.abs(np.asarray(Image.open(still).convert('RGB'), float) - frame.astype(float)).mean())
    if seam >= 2: problems.append(f'정지 그림 대 첫 프레임 {seam:.2f}(2 미만이어야 함)')
    end = last_frame(os.path.join(out, name))
    end_still = os.path.join(out, f'{mode}-end.webp')
    Image.fromarray(end).save(end_still, quality=92, method=6)
    end_seam = float(np.abs(np.asarray(Image.open(end_still).convert('RGB'), float) - end.astype(float)).mean())
    if end_seam >= 2: problems.append(f'끝 정지 그림 대 마지막 프레임 {end_seam:.2f}(2 미만이어야 함)')
    _, _, out_duration = probe(os.path.join(out, name))
    cues = item.get('cues', [])
    problems += check_cues(cues, out_duration)
    print(f'{mode}: {name} · {len(data) / 1e6:.2f}MB · {out_duration:.2f}초 · 정지 그림 대 첫 프레임 {seam:.2f} · 끝 정지 그림 대 마지막 프레임 {end_seam:.2f} · 신호 {len(cues)}개'
          + (f' · 문제: {"; ".join(problems)}' if problems else ''), file=sys.stderr)
    entry = {'mode': mode, 'status': 'approved', 'src': f'/studio/camera-v1/{name}', 'sha256': sha, 'bytes': len(data),
             'still': f'/studio/camera-v1/{mode}.webp', 'stillSha256': hashlib.sha256(open(still, 'rb').read()).hexdigest(),
             'endStill': f'/studio/camera-v1/{mode}-end.webp', 'endStillSha256': hashlib.sha256(open(end_still, 'rb').read()).hexdigest(),
             'duration': round(out_duration, 3), 'cues': cues}
    return entry, problems


def pending(mode):
    return {'mode': mode, 'status': 'pending', 'src': None, 'sha256': None, 'bytes': 0, 'still': None, 'stillSha256': None,
            'endStill': None, 'endStillSha256': None, 'duration': 0, 'cues': []}


def run(listing, out):
    os.makedirs(out, exist_ok=True)
    unknown = sorted(set(listing) - set(MODES))
    if unknown or not listing: raise SystemExit(f'목록은 solo·group 중 하나 이상이어야 한다(모르는 항목: {unknown})')
    manifest, bad = [], []
    for mode in MODES:
        if mode not in listing: manifest.append(pending(mode)); continue
        entry, problems = encode(mode, listing[mode], out)
        manifest.append(entry)
        if problems: bad.append(mode)
    return manifest, bad


def selftest():
    """합성 영상으로: ① 같은 입력이면 같은 해시 ② 정상 입력은 통과 ③ 소리 없는 입력·띠 밖 말풍선은 실패 ④ 끝 정지 그림은 마지막 프레임(첫 프레임과 다름)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'src.mp4'); mute = os.path.join(tmp, 'mute.mp4')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=size={W}x{H}:rate=24:duration=3', '-f', 'lavfi', '-i',
                        'sine=frequency=440:sample_rate=48000:duration=3', '-shortest', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', src], check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=size={W}x{H}:rate=24:duration=3', '-c:v', 'libx264', mute], check=True)
        good = {'solo': {'source': src, 'cues': [{'kind': 'count', 'from': 1, 'to': 1.5, 'text': '3'}, {'kind': 'say', 'from': 0.5, 'to': 1, 'text': '하나', 'x': 50, 'y': 10}]}}
        a, bad_a = run(good, os.path.join(tmp, 'a')); b, bad_b = run(good, os.path.join(tmp, 'b'))
        checks = {
            '같은 입력이면 같은 해시': a[0]['sha256'] == b[0]['sha256'],
            '정상 입력은 통과': not bad_a and not bad_b and a[1]['status'] == 'pending',
            '끝 정지 그림은 마지막 프레임(첫 프레임과 다름)': a[0]['endStill'].endswith('/solo-end.webp') and a[0]['endStillSha256'] != a[0]['stillSha256']
                and float(np.abs(np.asarray(Image.open(os.path.join(tmp, 'a', 'solo-end.webp')).convert('RGB'), float)
                                 - last_frame(os.path.join(tmp, 'a', a[0]['src'].rsplit('/', 1)[1])).astype(float)).mean()) < 2,
            '소리 없는 입력은 실패': run({'solo': {'source': mute, 'cues': []}}, os.path.join(tmp, 'c'))[1] == ['solo'],
            '띠 밖 말풍선은 실패': run({'group': {'source': src, 'cues': [{'kind': 'say', 'from': 0, 'to': 1, 'text': '아래', 'x': 50, 'y': 60}]}},
                                    os.path.join(tmp, 'd'))[1] == ['group'],
        }
    for k, v in checks.items(): print(f'{"통과" if v else "실패"}: {k}')
    return 0 if all(checks.values()) else 1


def main(argv):
    if argv == ['--selftest']: return selftest()
    if len(argv) != 2: print(__doc__); return 2
    listing_path, out = argv
    try: listing = json.load(open(listing_path, encoding='utf-8'))
    except (OSError, ValueError) as err: print(f'목록을 못 읽음: {err}'); return 2
    try: manifest, bad = run(listing, out)
    except SystemExit as err: print(err); return 2
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if bad: print('검사 실패: ' + ', '.join(bad), file=sys.stderr); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
