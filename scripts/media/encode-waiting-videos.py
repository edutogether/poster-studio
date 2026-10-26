"""대기 영상(Seedance 원본 960×960·193프레임)을 앱에 넣을 웹용 mp4로 만들고, 정지 그림을 영상 첫 프레임으로 맞춘다
(2026-10-12 Bumm님 «12편 앱 장착», 팀장 전달).

왜: 대기 화면은 정지 그림을 먼저 보이고, 영상이 실제로 재생되기 시작하면 영상으로 바꾼다(src/studio/WaitingArtwork.tsx).
둘이 다르면 넘어가는 순간 그림이 튄다. 그래서 정지 그림 = 이 mp4의 첫 프레임으로 함께 만든다.
영상은 한 번 재생하고 마지막 프레임에 머물렀다가 8초 뒤 다음 장면(다음 편의 정지 그림)으로 넘어간다 — 같은 편 안에서 끝 → 처음으로
되감는 일이 없으므로 끝을 무엇에 맞출 필요가 없다.

겹치기 없음(2026-10-12 팀장 지적·Bumm님 확인): 예전 뒤처리(post-seedance.py)는 처음·끝 6프레임을 원화·끝 그림으로 겹쳐 넘겼는데,
영상 끝 자세와 끝 그림이 다르면 두 자세가 반투명하게 겹쳐 «이중 노출»이 생겼다(12 끝 188프레임: 머리·눈·손이 두 겹, 08 처음·끝,
11 처음). 정지 그림이 영상 첫 프레임이 된 뒤로 겹치기는 쓸모가 없으므로, 여기서는 Seedance 원본 프레임만 쓴다(품질 기준 Q18).
프레임: 원본 0번은 시작 그림과 같은 장면이라 버리고 1~192번(192프레임 = 8초)을 쓴다(뒤처리와 같은 규칙).

바탕: Seedance 바탕은 흰 화면(#fff)보다 조금 어둡고 영상 중간에 더 어두워진다(242~254). --white면 프레임마다 위 두 모서리 바탕의
중앙값을 재고 앞뒤 ±SMOOTH프레임으로 고르게 한 뒤 255로 올리는 채널별 곱(1.00~1.08)을 건다 — 바탕은 내내 255, 밝은 곳은 255에서 잘린다.

출력: <출력 폴더>/NN-<sha256 앞 12자리>.mp4(H.264 High·yuv420p·BT.709 표기·CRF(기본 18)·소리 없음·faststart, 24fps 192프레임)와
      <정지 그림 폴더>/NN.webp(그 mp4의 첫 프레임을 무손실 WebP로), 그리고 목록 JSON을 표준 출력으로.
사용: python scripts/media/encode-waiting-videos.py <원본 목록.json> <출력 폴더> <정지 그림 폴더> [--white] [--crf N] [--preset P] [--tune T]
      앱에 넣을 때는 출력·정지 그림 폴더 모두 public/studio/<폴더> — 목록의 src·still 주소는 그 폴더 이름(/studio/<폴더>/)으로 적는다
      --crf · --preset · --tune: x264 설정. 기본은 10/12 승인본(waiting-v2)의 CRF 18 · slow · 없음 — 기본값으로 다시 만들면 승인본과 바이트가 같다(10/26 확인)
      2026-10-26 느린 와이파이용 판(waiting-v3): --white --crf 22 --preset veryslow (팀장 지시 1번 — 코덱·설정 14가지 비교는 CHANGELOG 10/26)
      원본 목록.json = {"01": "경로/01-fast.mp4", ...} 12개(Bumm님이 통과시킨 Seedance 원본)
종료: 0 · 1 검사 실패(프레임 수·정지 그림 대 첫 프레임) · 2 입력 오류
"""
import hashlib, json, os, subprocess, sys
import numpy as np
from PIL import Image

SIZE, FRAMES, FPS, SMOOTH = 704, 192, 24, 12


def decode(path, size=None, sel=None):
    vf = (f"select={sel}," if sel else "") + (f"scale={size}:{size}:flags=lanczos," if size else "") + 'format=rgb24'
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], capture_output=True)
    s = size or SIZE
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, s, s, 3)


def white(frames):
    bg = np.stack([np.median(np.concatenate([f[:24, :24].reshape(-1, 3), f[:24, -24:].reshape(-1, 3)]), 0) for f in frames]).astype(float)
    kernel = np.ones(2 * SMOOTH + 1) / (2 * SMOOTH + 1)
    padded = np.pad(bg, ((SMOOTH, SMOOTH), (0, 0)), mode='edge')
    smooth = np.stack([np.convolve(padded[:, c], kernel, mode='valid') for c in range(3)], 1)
    gain = np.clip(255.0 / np.maximum(smooth, 1), 1.0, 1.08)
    out = np.stack([np.clip(f.astype(float) * g, 0, 255).round().astype(np.uint8) for f, g in zip(frames, gain)])
    return out, gain


def main(argv):
    use_white = '--white' in argv
    args = [a for a in argv if a != '--white']
    opts = {'--crf': '18', '--preset': 'slow', '--tune': None}
    for name in list(opts):
        if name in args:
            i = args.index(name)
            if i + 1 >= len(args): print(f'{name} 뒤에 값이 없다'); return 2
            opts[name] = args[i + 1]; del args[i:i + 2]
    if len(args) != 3: print(__doc__); return 2
    listing, out, still_dir = args
    src_url = '/studio/' + os.path.basename(os.path.normpath(out)); still_url = '/studio/' + os.path.basename(os.path.normpath(still_dir))
    src = json.load(open(listing, encoding='utf-8'))
    if sorted(src) != [f'{i:02d}' for i in range(1, 13)]: print('목록은 01~12 열두 편이어야 한다'); return 2
    os.makedirs(out, exist_ok=True); os.makedirs(still_dir, exist_ok=True)
    manifest, bad = [], []
    for nn in sorted(src):
        path = src[nn]
        if not os.path.exists(path): print(f'{nn}: 파일 없음 {path}'); return 2
        raw = decode(path, SIZE)
        if len(raw) < FRAMES + 1: print(f'{nn}: 원본이 {len(raw)}프레임(193 이상이어야 함)'); return 2
        frames = raw[1:FRAMES + 1]
        gain = None
        if use_white: frames, gain = white(frames)
        tmp = os.path.join(out, f'{nn}.tmp.mp4')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{SIZE}x{SIZE}', '-r', str(FPS), '-i', '-',
                        '-an', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-frames:v', str(FRAMES),
                        '-c:v', 'libx264', '-profile:v', 'high', '-preset', opts['--preset'], '-crf', opts['--crf'],
                        *(['-tune', opts['--tune']] if opts['--tune'] else []), '-pix_fmt', 'yuv420p',
                        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                        '-movflags', '+faststart', tmp], input=frames.tobytes(), check=True)
        data = open(tmp, 'rb').read(); sha = hashlib.sha256(data).hexdigest()
        name = f'{nn}-{sha[:12]}.mp4'
        for old in os.listdir(out):
            if old.startswith(nn + '-') and old.endswith('.mp4') and old != name: os.remove(os.path.join(out, old))
        os.replace(tmp, os.path.join(out, name))
        dec = decode(os.path.join(out, name))
        Image.fromarray(dec[0]).save(os.path.join(still_dir, f'{nn}.webp'), lossless=True, method=6)
        back = np.asarray(Image.open(os.path.join(still_dir, f'{nn}.webp')).convert('RGB'), float)
        seam = float(np.abs(back - dec[0].astype(float)).mean())
        # 프레임 사이 가장 큰 바뀜(이웃 차이 중앙값의 몇 배) — 겹치기를 안 쓰므로 원본 그대로의 움직임만 남아야 한다
        steps = np.array([np.abs(dec[i + 1].astype(float) - dec[i].astype(float)).mean() for i in range(len(dec) - 1)])
        jump = float(steps.max() / max(np.median(steps), 1e-6))
        ok = len(dec) == FRAMES and seam < 0.5
        if not ok: bad.append(nn)
        corner = np.median(np.concatenate([dec[96][:24, :24].reshape(-1, 3), dec[96][:24, -24:].reshape(-1, 3)]), 0)
        print(f'{nn}: {name} · {len(data) / 1e6:.2f}MB · {len(dec)}프레임 · 정지 그림 대 첫 프레임 {seam:.2f} · 가장 큰 프레임 바뀜 중앙값의 {jump:.1f}배'
              f' · 4초 바탕 {corner.astype(int).tolist()}' + (f' · 곱 {np.round(gain.min(0), 3).tolist()}~{np.round(gain.max(0), 3).tolist()}' if use_white else ''),
              file=sys.stderr)
        still_sha = hashlib.sha256(open(os.path.join(still_dir, f'{nn}.webp'), 'rb').read()).hexdigest()
        manifest.append({'id': int(nn), 'status': 'approved', 'src': f'{src_url}/{name}', 'sha256': sha, 'bytes': len(data),
                         'still': f'{still_url}/{nn}.webp', 'stillSha256': still_sha})
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if bad: print('검사 실패: ' + ', '.join(bad), file=sys.stderr); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
