"""만든 대기 영상 한 편 검토(분석만, 생성 없음) — 2026-10-10 팀장 지시 «08 한 편: 중간 키프레임 따르기, 24fps 192프레임,
첫·끝 = 원화, 깜박임·이음매·노이즈, 원화 대비 색 차이를 숫자로».

잣대는 새로 만들지 않고 기존 도구의 것을 그대로 불러 쓴다:
  화면 비교(평균 ΔE · ΔE 10 넘는 화소 %)  survey-waiting-videos.py의 compare — 앱과 같이 원화 크기(704)로 줄여 견준다
  몸체 크림색·눈 빛 색·색 분포          keyframe-uniformity.py의 measure — 키프레임 통일성과 같은 기준
더해 재는 것:
  형식        크기·fps(ffprobe)·프레임 수 — 4초+4초 이음 없이 8초 한 편이면 192프레임(24fps)이어야 한다
  처음·끝     첫·끝 프레임과 원화의 차이, 끝→첫 프레임 변화(반복 재생 이음매)를 이 편 프레임 변화 중앙값의 몇 배인지로
  튐          앞뒤 프레임 변화가 중앙값의 4배를 넘는 곳(survey와 같은 기준)
  깜박임      바탕 띠(테두리 3%) 평균 밝기의 프레임 사이 최대 차와 전체 범위, 원화 바탕과의 차(대기 영상 자리는 흰 바탕이라 다르면 상자가 보인다)
  노이즈      바탕 띠 밝기의 화소 표준편차(프레임 중앙값·최대, 원화 값과 나란히)와 바탕 화소의 시간 표준편차 중앙값
  키프레임    <초>=<그림>마다 그 초 프레임과의 평균 ΔE, 그리고 원화·모든 키프레임 중 그 프레임과 가장 가까운 것 — 넣은 그림이면 «따름»
기준을 넘은 값은 «확인»에 이름을 올린다(사람이 프레임을 본다 — 자동 탈락이 아니다). 얼굴 요소는 check-face-elements.py,
얼굴·손 녹음과 변형은 0.5초마다 남기는 원본 화소 프레임을 사람이 본다.
사용: python scripts/media/review-generated-video.py <영상> <원화> <출력 폴더> [<초>=<키프레임 그림> ...]
출력: <출력 폴더>/review.json · t00.0s.png…(0.5초마다, 원본 화소) · diff-first.png · diff-last.png · kf-<초>s.png(키프레임 | 그 초 프레임)
종료코드 0 끝 · 2 대상 없음(영상·원화·프레임이 없으면 통과가 아니라 실패)
"""
import importlib.util, json, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LIMITS = {'첫끝_평균ΔE': 3.0, '첫끝_ΔE10넘는화소%': 2.0, '이음매배': 4.0, '바탕밝기범위': 2.0, '바탕밝기차': 2.0, '몸체ΔE': 5.0, '눈빛ΔE': 8.0, '색분포겹침': 0.85}


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(HERE, name + '.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


survey, unif = load('survey-waiting-videos'), load('keyframe-uniformity')


def white_rgb(path, size):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, 'white'); bg.alpha_composite(im); im = bg
    return np.asarray(im.convert('RGB').resize(size, Image.LANCZOS))


def band(x, b):
    return np.concatenate([x[:b].ravel(), x[-b:].ravel(), x[:, :b].ravel(), x[:, -b:].ravel()])


def main():
    if len(sys.argv) < 4: print(__doc__); return 2
    video, art, out = sys.argv[1:4]
    kfs = [(float(a.split('=', 1)[0]), a.split('=', 1)[1]) for a in sys.argv[4:]]
    for p in [video, art] + [k for _, k in kfs]:
        if not os.path.exists(p): print(f'없는 파일: {p} — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    os.makedirs(out, exist_ok=True)
    probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                                       '-of', 'json', video], capture_output=True, text=True, check=True).stdout)['streams'][0]
    num, den = map(int, probe['r_frame_rate'].split('/'))
    fps = num / den
    work = tempfile.mkdtemp(prefix='review-video-')
    try:
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', video, '-pix_fmt', 'rgb24', os.path.join(work, '%04d.png')], check=True)
        names = sorted(f for f in os.listdir(work) if f.endswith('.png'))
        if not names: print('프레임 0장', file=sys.stderr); return 2
        still = white_rgb(art, (704, 704))
        size = still.shape[1], still.shape[0]
        full = [os.path.join(work, f) for f in names]
        rgbs = [white_rgb(p, size) for p in full]
        n = len(rgbs)
        for k in range(0, int(n / fps * 2) + 1):  # 0.5초마다 원본 화소 그대로 남긴다
            i = min(round(k * fps / 2), n - 1)
            shutil.copyfile(full[i], os.path.join(out, f't{k / 2:04.1f}s.png'))
        r = {'영상': video, '원화': art, '크기': [probe['width'], probe['height']], 'fps': round(fps, 3), '프레임': n,
             '길이초': round(n / fps, 3), '확인': []}
        if n != 192 or abs(fps - 24) > 0.01: r['확인'].append('형식(24fps 192프레임 아님)')
        r['첫프레임_대_원화'], d0 = survey.compare(rgbs[0], still)
        r['끝프레임_대_원화'], d1 = survey.compare(rgbs[-1], still)
        survey.heat(d0).save(os.path.join(out, 'diff-first.png')); survey.heat(d1).save(os.path.join(out, 'diff-last.png'))
        for k in ('첫프레임_대_원화', '끝프레임_대_원화'):
            if r[k]['평균_ΔE'] > LIMITS['첫끝_평균ΔE'] or r[k]['ΔE10넘는화소%'] > LIMITS['첫끝_ΔE10넘는화소%']: r['확인'].append(k)
        g = [np.asarray(Image.fromarray(x).convert('L'), dtype=np.int16) for x in rgbs]
        step = [float(np.abs(g[i + 1] - g[i]).mean()) for i in range(n - 1)]
        med = float(np.median(step)) or 0.01
        r['프레임변화_중앙값'] = round(med, 2)
        r['튐'] = [{'프레임': i + 2, '초': round((i + 1) / fps, 2), '변화': round(s, 2), '중앙값배': round(s / med, 1)}
                  for i, s in enumerate(step) if s > 4 * med and s > 1.5]
        if r['튐']: r['확인'].append('튐')
        loop = float(np.abs(g[0] - g[-1]).mean())
        r['반복이음매(끝→첫)'] = {'변화': round(loop, 2), '중앙값배': round(loop / med, 1)}
        if loop / med > LIMITS['이음매배']: r['확인'].append('반복이음매')
        b = round(size[0] * 0.03)
        lab = [survey.srgb_to_lab(x)[..., 0] for x in rgbs]
        bl = [float(band(L, b).mean()) for L in lab]
        r['바탕밝기'] = {'원화': round(float(band(survey.srgb_to_lab(still)[..., 0], b).mean()), 2), '범위': [round(min(bl), 2), round(max(bl), 2)],
                     '프레임사이최대차': round(max(abs(bl[i + 1] - bl[i]) for i in range(n - 1)), 2)}
        if max(bl) - min(bl) > LIMITS['바탕밝기범위']: r['확인'].append('바탕깜박임')
        if max(abs(x - r['바탕밝기']['원화']) for x in bl) > LIMITS['바탕밝기차']: r['확인'].append('바탕이 원화와 다른 밝기')
        bs = [float(band(L, b).std()) for L in lab]
        tstd = np.stack([band(L, b) for L in lab]).std(0)
        art_bs = float(band(survey.srgb_to_lab(still)[..., 0], b).std())
        r['바탕노이즈'] = {'원화_화소표준편차': round(art_bs, 2), '프레임_화소표준편차_중앙값': round(float(np.median(bs)), 2),
                      '최대': round(max(bs), 2), '시간표준편차_중앙값': round(float(np.median(tstd)), 2)}
        if np.median(bs) > max(2 * art_bs, art_bs + 1): r['확인'].append('바탕노이즈')
        tmp_still = os.path.join(work, 'still.png'); Image.fromarray(still).save(tmp_still)
        base = unif.measure(tmp_still)
        worst = {'몸체ΔE': (0, 0), '눈빛ΔE': (0, 0), '색분포겹침': (1, 0)}
        for i in range(n):
            m = unif.measure(full[i])
            for key, src in (('몸체ΔE', '몸체'), ('눈빛ΔE', '눈빛')):
                if m[src] is not None and base[src] is not None:
                    de = float(np.sqrt(((m[src] - base[src]) ** 2).sum()))
                    if de > worst[key][0]: worst[key] = (de, i + 1)
            ov = float(np.minimum(m['hist'], base['hist']).sum())
            if ov < worst['색분포겹침'][0]: worst['색분포겹침'] = (ov, i + 1)
        r['색_원화대비_최악'] = {k: {'값': round(v, 3 if k == '색분포겹침' else 1), '프레임': f} for k, (v, f) in worst.items()}
        if worst['몸체ΔE'][0] > LIMITS['몸체ΔE']: r['확인'].append('몸체색')
        if worst['눈빛ΔE'][0] > LIMITS['눈빛ΔE']: r['확인'].append('눈빛색')
        if worst['색분포겹침'][0] < LIMITS['색분포겹침']: r['확인'].append('색분포')
        if kfs:
            refs = [('원화', still)] + [(f'{s:g}초', white_rgb(p, size)) for s, p in kfs]
            rows = []
            for s, p in kfs:
                i = min(round(s * fps), n - 1)
                des = {lab_: survey.compare(rgbs[i], im)[0]['평균_ΔE'] for lab_, im in refs}
                me = f'{s:g}초'
                near = me if des[me] <= min(des.values()) else min(des, key=des.get)  # 같은 거리면 넣은 그림을 따른 것으로 본다
                rows.append({'초': s, '프레임': i + 1, '키프레임': p, '평균ΔE': des[me], '가장가까운그림': near, '따름': near == me})
                kim = dict(refs)[f'{s:g}초']
                pair = Image.new('RGB', (size[0] * 2, size[1]), 'white')
                pair.paste(Image.fromarray(kim), (0, 0)); pair.paste(Image.fromarray(rgbs[i]), (size[0], 0))
                pair.save(os.path.join(out, f'kf-{s:04.1f}s.png'))
            r['키프레임'] = rows
            r['키프레임_따름'] = f"{sum(x['따름'] for x in rows)}/{len(rows)}"
            if not all(x['따름'] for x in rows): r['확인'].append('키프레임 안 따름')
        json.dump(r, open(os.path.join(out, 'review.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(json.dumps({k: r[k] for k in ('프레임', 'fps', '확인')}, ensure_ascii=False), flush=True)
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
