"""대기 영상 최종본(Seedance 뒤처리판, 무손실 704×704·192프레임)을 앱에 넣을 웹용 mp4로 만들고, 정지 그림을 영상 첫 프레임으로 맞춘다
(2026-10-12 Bumm님 «12편 앱 장착», 팀장 전달).

왜: 대기 화면은 정지 그림(public/studio/waiting-approved-v1/NN.webp)을 먼저 보이고, 영상이 실제로 재생되기 시작하면 영상으로 바꾼다
(src/studio/WaitingArtwork.tsx). 둘이 다르면 넘어가는 순간 그림이 튄다 — Seedance 시작 그림(K0)이 10/1 승인본 뒤에 고친 원화라
02·05·06·09·12는 지금 정지 그림과 평균 4~42 차이가 났다. 그래서 정지 그림을 «영상 첫 프레임»으로 바꾼다.

바탕: Seedance 영상 바탕은 흰 화면(#fff)보다 조금 어둡다(4초 지점 모서리 242~250). 뒤처리로 처음·끝 6프레임은 원화(흰 바탕)에 맞췄지만
가운데는 회색 네모로 보일 수 있다. --white를 주면 편마다 «가운데 프레임들의 모서리 바탕 중앙값»을 255로 올리는 채널별 곱을 건다
(곱은 1.00~1.08, 밝은 곳은 255에서 잘린다). 곱은 처음·끝 RAMP프레임에서 1 → 곱으로 서서히 건다 — 뒤처리가 같은 6프레임에서
원화로 겹쳐 놓았으므로, 첫·끝 프레임은 원화 그대로이고 바탕은 내내 흰색이다.

출력: <출력 폴더>/NN-<sha256 앞 12자리>.mp4(H.264 High·yuv420p·BT.709 표기·CRF 18·소리 없음·faststart, 24fps 192프레임)와
      <정지 그림 폴더>/NN.webp(그 mp4의 첫 프레임을 무손실 WebP로), 그리고 목록 JSON(src·sha256·크기)을 표준 출력으로.
사용: python scripts/media/encode-waiting-videos.py <최종본 목록.json> <출력 폴더> <정지 그림 폴더> [--white]
      앱에 넣을 때는 출력·정지 그림 폴더 모두 public/studio/waiting-v2 (목록의 src·still이 그 주소다)
      목록.json = {"01": "경로/01-final.mp4", ...} 12개
종료: 0 · 1 검사 실패(프레임 수·크기·첫 프레임 대 정지 그림) · 2 입력 오류
"""
import hashlib, json, os, subprocess, sys
import numpy as np
from PIL import Image

SIZE, FRAMES, FPS, RAMP = 704, 192, 24, 6


def frames(path, sel=None):
    vf = f"select={sel}," if sel else ""
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf + 'format=rgb24', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
                       capture_output=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, SIZE, SIZE, 3)


def white_gain(path):
    a = frames(path, r'between(n\,48\,143)*not(mod(n\,8))').astype(float)
    corners = np.concatenate([a[:, :24, :24].reshape(-1, 3), a[:, :24, -24:].reshape(-1, 3)])
    bg = np.median(corners, 0)
    return np.clip(255.0 / np.maximum(bg, 1), 1.0, 1.08), bg


def main(argv):
    white = '--white' in argv
    args = [a for a in argv if a != '--white']
    if len(args) != 3: print(__doc__); return 2
    listing, out, still_dir = args
    src = json.load(open(listing, encoding='utf-8'))
    if sorted(src) != [f'{i:02d}' for i in range(1, 13)]: print('목록은 01~12 열두 편이어야 한다'); return 2
    os.makedirs(out, exist_ok=True); os.makedirs(still_dir, exist_ok=True)
    manifest, bad = [], []
    for nn in sorted(src):
        path = src[nn]
        if not os.path.exists(path): print(f'{nn}: 파일 없음 {path}'); return 2
        src_frames = frames(path)
        if len(src_frames) != FRAMES: print(f'{nn}: 최종본이 {len(src_frames)}프레임(192여야 함)'); return 2
        if white:
            g, bg = white_gain(path)
            ramp = np.minimum(1.0, np.minimum(np.arange(FRAMES), FRAMES - 1 - np.arange(FRAMES)) / RAMP)
            src_frames = np.stack([np.clip(f.astype(float) * (1 + (g - 1) * r), 0, 255).round().astype(np.uint8)
                                   for f, r in zip(src_frames, ramp)])
        tmp = os.path.join(out, f'{nn}.tmp.mp4')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{SIZE}x{SIZE}', '-r', str(FPS), '-i', '-',
                        '-an', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-frames:v', str(FRAMES),
                        '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-movflags', '+faststart', tmp], input=src_frames.tobytes(), check=True)
        data = open(tmp, 'rb').read(); sha = hashlib.sha256(data).hexdigest()
        name = f'{nn}-{sha[:12]}.mp4'
        for old in os.listdir(out):
            if old.startswith(nn + '-') and old.endswith('.mp4') and old != name: os.remove(os.path.join(out, old))
        os.replace(tmp, os.path.join(out, name))
        dec = frames(os.path.join(out, name))
        first = Image.fromarray(dec[0]); first.save(os.path.join(still_dir, f'{nn}.webp'), lossless=True, method=6)
        back = np.asarray(Image.open(os.path.join(still_dir, f'{nn}.webp')).convert('RGB'), float)
        seam = float(np.abs(back - dec[0].astype(float)).mean())
        mid = dec[96].astype(float); corner = np.median(np.concatenate([mid[:24, :24].reshape(-1, 3), mid[:24, -24:].reshape(-1, 3)]), 0)
        orig = float(np.abs(dec[0].astype(float) - frames(path, r'eq(n\,0)')[0].astype(float)).mean())   # 첫 프레임 대 최종본 첫 프레임(= 원화)
        ok = len(dec) == FRAMES and seam < 0.5 and orig < 4.0   # 4:2:0 압축 손실(1~3) 범위 — 곱이 첫 프레임에 걸리면 5 넘게 벌어진다
        if not ok: bad.append(nn)
        print(f'{nn}: {name} · {len(data) / 1e6:.2f}MB · {len(dec)}프레임 · 정지 그림 대 첫 프레임 {seam:.2f} · 첫 프레임 대 원화 {orig:.2f} · 4초 바탕 {corner.astype(int).tolist()}'
              + (f' · 곱 {np.round(g, 3).tolist()}' if white else ''), file=sys.stderr)
        still_sha = hashlib.sha256(open(os.path.join(still_dir, f'{nn}.webp'), 'rb').read()).hexdigest()
        manifest.append({'id': int(nn), 'status': 'approved', 'src': f'/studio/waiting-v2/{name}', 'sha256': sha, 'bytes': len(data),
                         'still': f'/studio/waiting-v2/{nn}.webp', 'stillSha256': still_sha})
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if bad: print('검사 실패: ' + ', '.join(bad), file=sys.stderr); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
