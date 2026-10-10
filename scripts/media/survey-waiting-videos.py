"""대기 영상 전수 조사(분석만, 생성 없음) — 2026-10-10 팀장 지시 «7초·8초 이유 + 영상별 문제 전수».

편마다 모든 프레임을 원본 화소로 풀어(투명 WebM은 알파 그대로) 검토 폴더 analysis/NN/에 남긴다:
  t0초~t7초·t끝 PNG(원본 704×704), still.png(앱 정지 원화) · 첫·끝 프레임과 앱 원화의 색 차이(ΔE)와 차이 지도(diff-*.png),
  프레임 사이 변화(튐 = 이 편 중앙값의 4배 넘는 변화), 4+4초 이어 붙인 편(191프레임)은 이음매 96↔97번(seam-096/097.png),
  밝기 깜박임, 누끼 넓이 흔들림, 움직이지 않는 소품이 투명해지는 프레임(check-static-alpha.py와 같은 기준을 scipy 없이 —
  덩어리 묶기를 빼서 더 엄격하다: 흩어진 화소도 센다), 키프레임 방식 편은 생성에 넣은 출발·도착 키프레임과의 ΔE(kf-*.png).
비교는 앱과 같이 흰 바탕에 얹어서 한다(대기 영상 자리는 흰 바탕).
입력: <검토 폴더>/survey.json의 items[] — video(검토 폴더 기준), kf_files([출발, 도착], 저장소 기준, 키프레임 방식 편만).
      앱 정지 원화는 public/studio/waiting-approved-v1/NN.webp.
출력: <검토 폴더>/analysis/NN/* 와 analysis/metrics.json(편 번호별). 풀어 낸 전체 프레임과 확인용 밀착 인화(축소본)는
      .cache/video-survey-work/NN/ (커밋하지 않는다 — 대표님께 보여 주는 것은 analysis/의 원본 화소 PNG뿐).
사용: python scripts/media/survey-waiting-videos.py <검토 폴더> [편 번호 ...]   (번호를 주면 그 편만 다시, 나머지 수치는 유지)
종료코드: 0 끝 · 2 대상 없음(survey.json·영상·프레임이 없으면 통과가 아니라 실패)
"""
import json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
STILL_DIR = os.path.join(ROOT, 'public', 'studio', 'waiting-approved-v1')
WORK = os.path.join(ROOT, '.cache', 'video-survey-work')
FPS = 24
STILL, SOLID, DROP, MIN_PX = 4, 240, 200, 30   # check-static-alpha.py와 같은 기준


def srgb_to_lab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def on_white(img):
    """RGBA → 흰 바탕 RGB(앱의 대기 영상 자리는 흰 바탕이다)."""
    if img.shape[-1] != 4: return img[..., :3]
    a = img[..., 3:4].astype(np.float64) / 255.0
    return (img[..., :3].astype(np.float64) * a + 255 * (1 - a)).astype(np.uint8)


def compare(frame_rgb, ref_rgb):
    d = np.abs(frame_rgb.astype(int) - ref_rgb.astype(int))
    la, lb = srgb_to_lab(frame_rgb), srgb_to_lab(ref_rgb)
    de = np.sqrt(((la - lb) ** 2).sum(-1))
    return {'평균차_RGB': round(float(d.mean()), 2), '평균_ΔE': round(float(de.mean()), 2), 'ΔE10넘는화소%': round(float((de > 10).mean() * 100), 2),
            '밝기차_L': round(float(la[..., 0].mean() - lb[..., 0].mean()), 2)}, de


def heat(de):
    v = np.clip(de / 30.0, 0, 1)
    return Image.fromarray(np.stack([255 * v, 255 * (1 - np.abs(v - 0.5) * 2) * 0.6, 255 * (1 - v) * 0.3], -1).astype(np.uint8))


def static_alpha(frames):
    """움직이지 않는 곳(채널별 표준편차 최대 < 4) 중 투명도 중앙값 ≥ 240인 화소가 200 밑으로 떨어지면 셈, 한 프레임 30개 이상이면 걸림."""
    a = np.stack([f[..., 3] for f in frames])
    n, mean = 0, np.zeros(frames[0].shape[:2] + (3,))
    m2 = np.zeros_like(mean)
    for f in frames:  # 웰포드 방식 — 전체를 실수로 올리지 않는다
        x = f[..., :3].astype(np.float64); n += 1
        d = x - mean; mean += d / n; m2 += d * (x - mean)
    prop = (np.sqrt(m2 / n).max(-1) < STILL) & (np.median(a, 0) >= SOLID)
    drops = [int(((fr < DROP) & prop).sum()) for fr in a]
    bad = [i + 1 for i, c in enumerate(drops) if c >= MIN_PX]
    return {'소품화소': int(prop.sum()), '최대투명해진화소': max(drops), '걸린프레임': bad[:40], '걸린프레임수': len(bad)}


def survey_one(out, it):
    nn = f"{it['id']:02d}"
    src = os.path.join(out, it['video'])
    if not os.path.exists(src): raise SystemExit(f'없는 영상: {it["video"]}')
    fd = os.path.join(WORK, nn)
    if os.path.isdir(fd): shutil.rmtree(fd)
    os.makedirs(fd)
    alpha = src.endswith('.webm')
    dec = ['-c:v', 'libvpx-vp9'] if alpha else []   # 기본 VP9 디코더는 알파를 버린다
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', *dec, '-i', src, '-pix_fmt', 'rgba', os.path.join(fd, '%03d.png')], check=True)
    names = sorted(f for f in os.listdir(fd) if f.endswith('.png'))
    if not names: raise SystemExit(f'{nn}: 프레임 0장')
    frames = [np.asarray(Image.open(os.path.join(fd, f))) for f in names]
    still = np.asarray(Image.open(os.path.join(STILL_DIR, f'{nn}.webp')).convert('RGB'))
    od = os.path.join(out, 'analysis', nn)
    if os.path.isdir(od): shutil.rmtree(od)
    os.makedirs(od)
    Image.fromarray(still).save(os.path.join(od, 'still.png'))
    picks = [(f'{s}초', min(s * FPS, len(frames) - 1)) for s in range(8)] + [('끝', len(frames) - 1)]
    for label, i in picks:
        shutil.copyfile(os.path.join(fd, names[i]), os.path.join(od, f't{label}-{i + 1:03d}.png'))
    rgbs = [on_white(f) for f in frames]
    m = {'원본': it['video'], '프레임': len(frames), '길이초': round(len(frames) / FPS, 3), '투명': alpha}
    m['첫프레임_대_원화'], de0 = compare(rgbs[0], still)
    m['끝프레임_대_원화'], de1 = compare(rgbs[-1], still)
    heat(de0).save(os.path.join(od, 'diff-first.png')); heat(de1).save(os.path.join(od, 'diff-last.png'))
    g = [np.asarray(Image.fromarray(r).convert('L'), dtype=np.int16) for r in rgbs]
    step = [float(np.abs(g[i + 1] - g[i]).mean()) for i in range(len(g) - 1)]
    med = float(np.median(step)) or 0.01
    jumps = [{'프레임': i + 2, '초': round((i + 1) / FPS, 2), '변화': round(s, 2), '중앙값배': round(s / med, 1)} for i, s in enumerate(step) if s > 4 * med and s > 1.5]
    m['프레임변화_중앙값'] = round(med, 2)
    m['튐'] = jumps
    if len(frames) == 191:  # 4초(96프레임) 두 구간에서 겹친 1프레임을 뺀 편
        m['이음매(96↔97)'] = {'변화': round(step[95], 2), '중앙값배': round(step[95] / med, 1)}
        for i in (96, 97): shutil.copyfile(os.path.join(fd, names[i - 1]), os.path.join(od, f'seam-{i:03d}.png'))
    lum = [float(x.mean()) for x in g]
    m['밝기_최대프레임차'] = round(max(abs(lum[i + 1] - lum[i]) for i in range(len(lum) - 1)), 2)
    if alpha:
        cov = [float((f[..., 3] > 16).mean() * 100) for f in frames]
        m['알파넓이_최대프레임차%'] = round(max(abs(cov[i + 1] - cov[i]) for i in range(len(cov) - 1)), 2)
        m['알파넓이_범위%'] = [round(min(cov), 1), round(max(cov), 1)]
        m['소품투명'] = static_alpha(frames)
    if it.get('kf_files'):
        k0, k1 = (Image.open(os.path.join(ROOT, p)).convert('RGB').resize((704, 704), Image.LANCZOS) for p in it['kf_files'])
        k0.save(os.path.join(od, 'kf-first.png')); k1.save(os.path.join(od, 'kf-last.png'))
        m['키프레임'] = {'출발': it['kf_files'][0], '도착': it['kf_files'][1]}
        m['첫프레임_대_출발키프레임'], d0 = compare(rgbs[0], np.asarray(k0))
        m['끝프레임_대_도착키프레임'], d1 = compare(rgbs[-1], np.asarray(k1))
        m['출발키프레임_대_앱원화'] = compare(np.asarray(k0), still)[0]
        heat(d0).save(os.path.join(od, 'diff-kf-first.png')); heat(d1).save(os.path.join(od, 'diff-kf-last.png'))
    # 확인용 밀착 인화(축소본) — 작업 폴더에만, 페이지에 쓰지 않는다
    sheet = Image.new('RGB', (352 * 5, 352 * 2), 'white')
    for k, (label, i) in enumerate(picks + [('원화', -1)]):
        sheet.paste(Image.fromarray(rgbs[i] if i >= 0 else still).resize((352, 352)), ((k % 5) * 352, (k // 5) * 352))
    sheet.save(os.path.join(WORK, f'sheet-{nn}.jpg'), quality=82)
    print(nn, len(frames), '프레임 · 첫/끝 ΔE', m['첫프레임_대_원화']['평균_ΔE'], m['끝프레임_대_원화']['평균_ΔE'], '· 튐', len(jumps),
          '· 이음매', m.get('이음매(96↔97)', '-'), flush=True)
    return m


def main():
    if len(sys.argv) < 2: print(__doc__); return 2
    out = os.path.abspath(sys.argv[1])
    sv_path = os.path.join(out, 'survey.json')
    if not os.path.exists(sv_path): print('survey.json 없음 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    only = {int(x) for x in sys.argv[2:]}
    items = [it for it in json.load(open(sv_path, encoding='utf-8'))['items'] if not only or it['id'] in only]
    if not items: print('조사할 편 0개', file=sys.stderr); return 2
    os.makedirs(WORK, exist_ok=True)
    mp = os.path.join(out, 'analysis', 'metrics.json')
    allm = json.load(open(mp, encoding='utf-8')) if only and os.path.exists(mp) else {}
    for it in items:
        allm[f"{it['id']:02d}"] = survey_one(out, it)
    json.dump(dict(sorted(allm.items())), open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
