"""«영상 만들기 전 확인» 한 장(2026-10-13 묶음) — 촬영 화면 개인·단체 영상과 다시 만드는 대기 영상을 한 페이지에 모은다.
Bumm님이 시작·끝 그림, 중간 장, 프롬프트 전문, 길이·화질·비율·모드·소리, 크레딧을 보고 «해»를 주시는 자리다(생성은 허락 뒤).
이미 만든 편(판정 대기)은 영상 경로와 그때 넣은 프롬프트를 함께 둔다.

입력: <설정 JSON> — {"title", "sections": [{"id", "title", "status", "settings": {..}, "credits", "start", "end", "mids": [[label, path]...],
       "prompt_file", "video"(있으면), "notes": [..]}]}. 그림·영상 경로는 출력 폴더 기준 상대 경로.
사용: python scripts/media/build-preflight-20261013.py <설정 JSON> <출력 HTML>
종료: 0 · 2 입력 오류(없는 그림·프롬프트 파일)
"""
import html, json, os, sys
from PIL import Image

e = html.escape


def main(argv):
    if len(argv) != 2: print(__doc__); return 2
    cfg = json.load(open(argv[0], encoding='utf-8'))
    out = argv[1]; base = os.path.dirname(os.path.abspath(out))
    blocks, rows = [], []
    for sc in cfg['sections']:
        def fig(label, rel, big=False):
            p = os.path.join(base, rel)
            if not os.path.exists(p): raise SystemExit(f'{sc["id"]}: 없는 그림 {p}')
            w, h = Image.open(p).size
            return (f'<figure class="{"big" if big else ""}"><a href="{e(rel)}"><img src="{e(rel)}" alt="{e(label)}"></a>'
                    f'<figcaption>{e(label)} <small>{w}×{h} · {e(os.path.basename(rel))}</small></figcaption></figure>')
        figs = []
        if sc.get('start'): figs.append(fig('시작 그림(start_image)', sc['start'], True))
        if sc.get('end'): figs.append(fig('끝 그림(end_image)', sc['end'], True))
        mids = ''.join(fig(lbl, rel) for lbl, rel in sc.get('mids', []))
        prompt = ''
        if sc.get('prompt_file'):
            pp = os.path.join(base, sc['prompt_file'])
            if not os.path.exists(pp): raise SystemExit(f'{sc["id"]}: 없는 프롬프트 {pp}')
            prompt = open(pp, encoding='utf-8').read().strip()
        video = ''
        if sc.get('video'):
            if not os.path.exists(os.path.join(base, sc['video'])): raise SystemExit(f'{sc["id"]}: 없는 영상')
            video = f'<video src="{e(sc["video"])}" controls muted playsinline></video><p class="path">{e(sc["video"])}</p>'
        settings = ''.join(f'<tr><th>{e(k)}</th><td>{e(str(v))}</td></tr>' for k, v in sc['settings'].items())
        notes = ''.join(f'<li>{e(n)}</li>' for n in sc.get('notes', []))
        blocks.append(f'<section id="{e(sc["id"])}"><h2>{e(sc["title"])} <span class="st">{e(sc["status"])}</span></h2>'
                      f'<div class="figs">{"".join(figs)}</div>' + (f'<h3>중간 장(흐름 확인용 — 영상에는 넣지 않고 글로 준다)</h3><div class="mids">{mids}</div>' if mids else '')
                      + video + f'<h3>설정</h3><table>{settings}</table>' + (f'<ul class="notes">{notes}</ul>' if notes else '')
                      + (f'<h3>프롬프트 전문</h3><pre>{e(prompt)}</pre>' if prompt else '') + '</section>')
        rows.append(f'<tr><td><a href="#{e(sc["id"])}">{e(sc["title"])}</a></td><td>{e(sc["status"])}</td><td>{e(str(sc["credits"]))}</td></tr>')
    page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>영상 만들기 전 확인</title><style>
:root{{--bg:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--accent:#4F46E5;--soft:#EEF2FF;--warn:#B45309}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0b1020;--fg:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--accent:#A5B4FC;--soft:#1e1b4b;--warn:#FCD34D}}}}
body{{background:var(--bg);color:var(--fg);font-family:'Malgun Gothic',system-ui,sans-serif;margin:0 auto;max-width:1500px;padding:16px}}
h1{{font-size:24px}} h2{{border-top:2px solid var(--accent);padding-top:14px}} .st{{font-size:14px;color:var(--warn);font-weight:600}}
table{{border-collapse:collapse;margin:6px 0}} th,td{{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}} th{{background:var(--soft);white-space:nowrap}}
.figs{{display:flex;gap:12px;flex-wrap:wrap}} .figs figure{{flex:1 1 560px;margin:0}} .figs img{{width:100%;border:1px solid var(--line);border-radius:6px}}
.mids{{display:flex;gap:8px;flex-wrap:wrap}} .mids figure{{flex:1 1 220px;margin:0}} .mids img{{width:100%;border:1px solid var(--line);border-radius:6px}}
figcaption{{font-size:13px;color:var(--muted)}} pre{{white-space:pre-wrap;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:10px;font-size:13px}}
video{{max-width:704px;width:100%;border:1px solid var(--line);border-radius:6px;margin-top:8px}} .path{{font-size:12px;color:var(--muted)}} .notes li{{margin:3px 0}}
</style></head><body><h1>{e(cfg["title"])}</h1><p>그림을 누르면 원본 크기로 열린다. 생성은 Bumm님 «해» 뒤에만 한다.</p>
<table><tr><th>편</th><th>상태</th><th>크레딧</th></tr>{"".join(rows)}</table>{"".join(blocks)}</body></html>'''
    open(out, 'w', encoding='utf-8').write(page)
    print('저장', out, len(cfg['sections']), '편')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
