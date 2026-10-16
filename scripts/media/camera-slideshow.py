"""촬영 화면 예시 영상의 임시판 — 키프레임 그림을 컷으로 이어 붙인 «슬라이드식 영상»(2026-10-17 Bumm님, 팀장 전달).
왜: 진짜 영상은 Bumm님이 직접 만든다(유료 영상 생성 금지). 그 전까지 앱의 촬영 화면 영상 자리에 «이렇게 서서, 이렇게 찍는다»를
보여 줄 임시판이다. 장면은 섞지 않고 뚝뚝 넘긴다(컷). 소리·플래시·멈춘 장면은 뒤처리(camera-shot-post.py), 숫자 3·2·1은 앱이 얹는다.

입력 목록.json = {"crop_top": 48, "frames": [{"image": "경로/K0.png", "seconds": 0.6}, ...]}
  그림은 모두 같은 크기의 3:2여야 한다(같은 카메라 자리로 그린 연속 장면). 16:9로 자를 때 위에서 crop_top 화소를 덜어 내고
  나머지는 아래에서 덜어 낸다 — 모든 장에 같은 자르기를 써야 컷이 넘어갈 때 화면 틀이 튀지 않는다.
출력: 1920×1080 · 30fps · H.264(무손실에 가깝게 CRF 12) · 소리 없음. 길이 = seconds 합(30fps로 정확히 나눠떨어져야 한다).
사용: python scripts/media/camera-slideshow.py <목록.json> <출력.mp4>
종료: 0 · 1 검사 실패(프레임 수·크기) · 2 입력 오류
"""
import json, os, subprocess, sys
from PIL import Image

W, H, FPS = 1920, 1080, 30


def main(argv):
    if len(argv) != 2: print(__doc__); return 2
    listing_path, out = argv
    try: listing = json.load(open(listing_path, encoding='utf-8'))
    except (OSError, ValueError) as err: print(f'목록을 못 읽음: {err}'); return 2
    frames, top = listing.get('frames') or [], int(listing.get('crop_top', 0))
    if not frames: print('frames가 비었다'); return 2
    sizes = set()
    for f in frames:
        if not os.path.exists(f['image']): print(f'없는 그림: {f["image"]}'); return 2
        sizes.add(Image.open(f['image']).size)
        n = f['seconds'] * FPS
        if abs(n - round(n)) > 1e-6 or n <= 0: print(f'{f["image"]}: {f["seconds"]}초는 {FPS}fps 프레임으로 나눠떨어지지 않는다'); return 2
    if len(sizes) != 1: print(f'그림 크기가 서로 다르다: {sorted(sizes)}'); return 2
    sw, sh = sizes.pop()
    ch = round(sw * 9 / 16)
    if abs(sw / sh - 1.5) > 0.01 or not 0 <= top <= sh - ch: print(f'3:2 그림이 아니거나 crop_top {top}이 범위(0~{sh - ch}) 밖'); return 2
    args, chains = ['ffmpeg', '-v', 'error', '-y'], []
    for i, f in enumerate(frames):
        args += ['-loop', '1', '-framerate', str(FPS), '-t', f'{f["seconds"]}', '-i', f['image']]
        chains.append(f'[{i}:v]crop={sw}:{ch}:0:{top},scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p,'
                      f'trim=end_frame={round(f["seconds"] * FPS)},setpts=PTS-STARTPTS[v{i}]')
    graph = ';'.join(chains) + ';' + ''.join(f'[v{i}]' for i in range(len(frames))) + f'concat=n={len(frames)}:v=1:a=0[out]'
    args += ['-filter_complex', graph, '-map', '[out]', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '12',
             '-pix_fmt', 'yuv420p', '-an', '-fflags', '+bitexact', '-flags:v', '+bitexact', out]
    subprocess.run(args, check=True)
    probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
                                       'stream=width,height,nb_read_frames', '-of', 'json', out], capture_output=True, text=True, check=True).stdout)['streams'][0]
    want = round(sum(f['seconds'] for f in frames) * FPS)
    ok = (probe['width'], probe['height']) == (W, H) and int(probe['nb_read_frames']) == want
    print(f'{out}: {probe["width"]}×{probe["height"]} · {probe["nb_read_frames"]}프레임(기대 {want}) · 장 {len(frames)}개'
          + ('' if ok else ' · 검사 실패'), file=sys.stderr)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
