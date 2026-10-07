# 대기 영상 한 편을 Veo 3.1 Fast(Vertex AI)로 만든다 — 유료다. 공식 가격표(720p·소리 없음) 초당 $0.08 → 8초 $0.64.
#  · 첫 장면 = 승인 원화. 원화를 원래 크기 그대로 16:9 캔버스 가운데에 얹고 여백은 원화 배경색(테두리 중앙값)으로 채운다
#    (시험 영상 04·11번과 같은 방식). 기본은 끝 장면도 원화로 지정하고, --no-last-frame이면 끝 장면을 지정하지 않는다.
#    --last-image <그림>이면 끝 장면을 그 그림(스토리보드에 맞춰 새로 그린 원화, 2026-10-07 Bumm님 확정)으로 지정한다.
#  · 지시문 = video-followup-2026-10-03/prompts/<장면>.txt 그대로(보관본 + 기록된 수정).
#  · 비용 기록(<작업 폴더>/cost-log.jsonl)의 누적에 이번 요청을 더해 상한을 넘으면 요청하지 않는다. 재시도하지 않는다.
#  · --confirm 없이는 요청하지 않는다(입력 그림·지시문만 만들어 보여 준다).
#  · --negative면 얼굴 요소를 막는 부정 지시(negativePrompt)를 더한다 — 기본은 끈다(아래 NEGATIVE 주석).
# 사용: python scripts/media/veo_generate.py <장면 01~12> <작업 폴더> --account <gcloud 계정> [--no-last-frame | --last-image <그림>] [--negative] [--stop 15] --confirm
import argparse, base64, json, os, shutil, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
BASE = os.path.join(ROOT, '_docs', 'intents', '2026-09-30-studio-design-integration')
ART = os.path.join(BASE, 'loading-approved-2026-10-01', 'assets')
PROMPTS = os.path.join(BASE, 'video-followup-2026-10-03', 'prompts')
PROJECT, LOC, MODEL = 'inky-poster-studio', 'us-central1', 'veo-3.1-fast-generate-001'
SECONDS, RATE = 8, 0.08          # 공식 가격표: Veo 3.1 Fast · Video generation · 720p = $0.08 / 1초
PARAMS = {'aspectRatio': '16:9', 'durationSeconds': SECONDS, 'generateAudio': False, 'resolution': '720p', 'sampleCount': 1}
# 얼굴 규칙(2026-10-06 Bumm님 확정)을 지시문만으로는 못 지켰다 — 01번 첫 시도에서 정면을 볼 때 하얀 입이 생겼다(12프레임).
# 생성 조건에 «만들지 말 것»을 따로 줘 봤지만 두 번째 시도는 오히려 117프레임이었다(2026-10-07) — 그래서 기본으로 쓰지 않는다.
NEGATIVE = ('mouth, open mouth, smiling mouth, glowing white mouth, white smile line, lips, teeth, tongue, '
            'eyebrows, nose, cheeks, blush, new facial features on the black face screen, text, letters, extra logos')


def input_image(scene, out, src=None):
    """src가 있으면(끝 장면용 새 원화) 그 그림을 원래 원화와 같은 크기로 맞춰 같은 캔버스에 얹는다."""
    base = Image.open(os.path.join(ART, f'{scene}.png'))
    art = Image.open(src).convert('RGBA').resize(base.size, Image.LANCZOS) if src else base.convert('RGBA')
    a = np.asarray(art)
    if a[..., 3].min() < 255: raise SystemExit(f'{scene}: 원화에 투명한 곳이 있다 — 16:9 캔버스에 얹는 방식을 다시 정해야 한다')
    rgb = a[..., :3]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = tuple(int(v) for v in np.median(border, 0))
    h = art.height; w = round(h * 16 / 9)
    canvas = Image.new('RGB', (w, h), bg); canvas.paste(art.convert('RGB'), ((w - art.width) // 2, 0))
    canvas.save(out)
    return {'크기': [w, h], '여백색': bg}


def spent(log):
    if not os.path.exists(log): raise SystemExit(f'비용 기록이 없다: {log} — 시험 누적부터 적어 두고 시작한다')
    return round(sum(json.loads(l)['비용'] for l in open(log, encoding='utf-8') if l.strip()), 2)


def call(url, token, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('work'); ap.add_argument('--account', required=True)
    ap.add_argument('--no-last-frame', action='store_true'); ap.add_argument('--last-image'); ap.add_argument('--negative', action='store_true'); ap.add_argument('--stop', type=float, default=15.0); ap.add_argument('--confirm', action='store_true')
    a = ap.parse_args()
    scene = a.scene.zfill(2); d = os.path.join(a.work, scene); os.makedirs(d, exist_ok=True)
    log = os.path.join(a.work, 'cost-log.jsonl')
    tries = 1 + sum(1 for l in open(log, encoding='utf-8') if l.strip() and json.loads(l).get('장면') == scene) if os.path.exists(log) else 1
    name = f'try{tries}'
    info = input_image(scene, os.path.join(d, 'input-16x9.png'))
    if a.last_image: input_image(scene, os.path.join(d, f'{name}-last-16x9.png'), a.last_image)
    prompt = open(os.path.join(PROMPTS, f'{scene}.txt'), encoding='utf-8').read().replace('\r\n', '\n')
    open(os.path.join(d, f'{name}-prompt.txt'), 'w', encoding='utf-8').write(prompt)
    cost = round(SECONDS * RATE, 2); before = spent(log)
    print(f'장면 {scene} {name} · 입력 {info} · 끝 장면 지정 {"안 함" if a.no_last_frame else (a.last_image or "원화")} · 이번 ${cost} · 누적 ${before} → ${before + cost:.2f} (멈춤 ${a.stop})')
    if before + cost > a.stop: print('상한을 넘는다 — 요청하지 않는다'); sys.exit(4)
    if not a.confirm: print('--confirm 없음 — 요청하지 않았다'); sys.exit(0)
    token = subprocess.run([shutil.which('gcloud'), 'auth', 'print-access-token', a.account], capture_output=True, text=True, check=True).stdout.strip()
    img = {'bytesBase64Encoded': base64.b64encode(open(os.path.join(d, 'input-16x9.png'), 'rb').read()).decode(), 'mimeType': 'image/png'}
    inst = {'prompt': prompt, 'image': img}
    if a.last_image:
        inst['lastFrame'] = {'bytesBase64Encoded': base64.b64encode(open(os.path.join(d, f'{name}-last-16x9.png'), 'rb').read()).decode(), 'mimeType': 'image/png'}
    elif not a.no_last_frame: inst['lastFrame'] = img
    base = f'https://{LOC}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOC}/publishers/google/models/{MODEL}'
    t0 = time.time()
    params = dict(PARAMS, negativePrompt=NEGATIVE) if a.negative else dict(PARAMS)
    st, op = call(f'{base}:predictLongRunning', token, {'instances': [inst], 'parameters': params})
    rec = {'t': datetime.now(timezone.utc).isoformat(timespec='seconds'), '장면': scene, '시도': name, '모델': MODEL, '조건': params, '끝장면': (os.path.basename(a.last_image) if a.last_image else (not a.no_last_frame))}
    if st != 200 or 'name' not in op:
        rec.update(단계='요청 실패', 상태=st, 오류=str(op.get('error', op))[:300], 비용=0); open(log, 'a', encoding='utf-8').write(json.dumps(rec, ensure_ascii=False) + '\n')
        print('요청 실패', st); sys.exit(1)
    # 접수되면 생성 결과와 상관없이 과금될 수 있다고 보고 기록한다(걸러지거나 실패해도 보수적으로 센다)
    rec.update(작업=op['name'].rsplit('/', 1)[-1], 비용=cost)
    for _ in range(120):
        time.sleep(10)
        _, s = call(f'{base}:fetchPredictOperation', token, {'operationName': op['name']})
        if not s.get('done'): continue
        vids = (s.get('response') or {}).get('videos') or []
        rec.update(단계='완료' if vids else '결과 없음', 걸린초=round(time.time() - t0, 1), 걸러짐=(s.get('response') or {}).get('raiMediaFilteredCount', 0), 오류=(s.get('error') or {}).get('message'))
        if vids and vids[0].get('bytesBase64Encoded'):
            open(os.path.join(d, f'{name}-raw.mp4'), 'wb').write(base64.b64decode(vids[0]['bytesBase64Encoded']))
        break
    else:
        rec.update(단계='20분 초과')
    open(log, 'a', encoding='utf-8').write(json.dumps(rec, ensure_ascii=False) + '\n')
    print(json.dumps({k: v for k, v in rec.items() if k != '조건'}, ensure_ascii=False), f'누적 ${spent(log)}')
    sys.exit(0 if rec.get('단계') == '완료' else 1)


if __name__ == '__main__':
    main()
