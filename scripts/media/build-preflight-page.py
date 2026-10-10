"""대기 영상 «영상 만들기 전 확인» 한 장 — 만들 편 전부를 한 페이지에 모아 Bumm님이 보고 «해»를 주시는 자리
(2026-10-10 Bumm님: 그림과 글을 세팅해 보여 드리고 허락을 받은 뒤 만든다. 2026-10-11 팀장 전달: 11편을 한 페이지로,
키프레임 원본 크기 · 프롬프트 전문 · 길이·화질·비율·모드 · fast/std 크레딧 두 줄 · 힉스필드 폴더에 키프레임이 있는지).

입력
  <검토 폴더>/keyframes.json — 편별 키프레임(items: label, image)과 preflight(scenario, settings, prompt, post).
      build-video-review.py와 같은 파일이다. 그림 경로는 검토 폴더 기준.
  <업로드 기록>   — 힉스필드에 올린 키프레임 기록(JSON 목록: filename, media_id, put, folder).
  <폴더 확인>     — 힉스필드 폴더를 읽어 적어 둔 것(읽기만 하는 조회의 결과를 사람이 옮긴다):
      {"checked", "balance", "how", "folders": {"01": {"name", "old_images", "other"}}, "note"}
  --skip 08       — 이미 만든 편(이 페이지 대상이 아님). 여러 번 줄 수 있다.
  --fast 20 --std 36 — 한 편 크레딧(Seedance 2.0 720p 8초, 10/10 실측 단가).

사용: python scripts/media/build-preflight-page.py <검토 폴더> <업로드 기록> <폴더 확인> [--skip NN]... [--fast N] [--std N]
      → <검토 폴더>/preflight.html
"""
import html, json, os, sys
from PIL import Image

e = html.escape


def args(argv):
    pos, skip, fast, std = [], [], 20, 36
    it = iter(argv)
    for a in it:
        if a == '--skip': skip.append(next(it))
        elif a == '--fast': fast = int(next(it))
        elif a == '--std': std = int(next(it))
        else: pos.append(a)
    if len(pos) != 3: raise SystemExit(__doc__)
    return pos, skip, fast, std


def main():
    (out, up_path, fold_path), skip, fast, std = args(sys.argv[1:])
    scenes = [sc for sc in json.load(open(os.path.join(out, 'keyframes.json'), encoding='utf-8'))['scenes'] if sc['id'] not in skip]
    if not scenes: raise SystemExit('만들 편이 0편이다 — keyframes.json·--skip을 확인한다')
    uploads = json.load(open(up_path, encoding='utf-8'))
    folders = json.load(open(fold_path, encoding='utf-8'))
    n = len(scenes)

    rows, blocks = [], []
    for sc in scenes:
        pf = sc.get('preflight')
        if not pf: raise SystemExit(f'{sc["id"]}: preflight 없음 — 프롬프트·설정 없이 «만들기 전 확인»을 만들 수 없다')
        figs = []
        for it in sc['items']:
            if it.get('missing'): raise SystemExit(f'{sc["id"]}: 아직 안 그린 키프레임 «{it["label"]}» — 다 그린 뒤 만든다')
            p = os.path.join(out, it['image'])
            if not os.path.exists(p): raise SystemExit(f'없는 그림: {p}')
            w, h = Image.open(p).size
            figs.append(f'<figure><img src="{e(it["image"])}" width="{w}" height="{h}" alt="{e(it["label"])}">'
                        f'<figcaption>{e(it["label"])} <small>{w}×{h}</small></figcaption></figure>')
        up = [u for u in uploads if u.get('folder') == sc['id'] and u.get('put') == '200']
        f = folders['folders'].get(sc['id'], {})
        in_folder = f.get('new_keyframes', 0)
        hf = (f'키프레임 {len(up)}장 올림(프로젝트 미디어) · 폴더 «{e(f.get("name", sc["id"]))}» 안: 새 키프레임 {in_folder}장, '
              f'10/10 옛 그림 {f.get("old_images", 0)}장' + (f' · {e(f["other"])}' if f.get('other') else ''))
        rows.append(f'<tr><td><a href="#s{e(sc["id"])}">{e(sc["title"])}</a></td><td>{len(sc["items"])}장</td><td>{std}</td><td>{fast}</td>'
                    f'<td>{len(up)}장</td><td class="{"ok" if in_folder else "warn"}">{"있음" if in_folder else "없음(폴더 밖)"}</td></tr>')
        sets = ''.join(f'<tr><th>{e(k)}</th><td>{e(v)}</td></tr>' for k, v in pf['settings'].items())
        blocks.append(f'<section class="scene" id="s{e(sc["id"])}"><h2>{e(sc["title"])}</h2>'
                      f'<p><b>시나리오</b> {e(pf["scenario"])}</p>'
                      f'<table class="kv"><tbody>{sets}<tr><th>힉스필드</th><td>{hf}</td></tr></tbody></table>'
                      f'<h3>키프레임 — 원본 크기(첫 칸·끝 칸이 시작·끝 그림)</h3><div class="strip">{"".join(figs)}</div>'
                      f'<h3>Seedance 프롬프트 전문</h3><pre>{e(pf["prompt"])}</pre>'
                      f'<h3>뒤처리(0원)</h3><ol>{"".join(f"<li>{e(x)}</li>" for x in pf["post"])}</ol></section>')

    total_up = sum(1 for u in uploads if u.get('put') == '200' and u.get('folder') in {sc['id'] for sc in scenes})
    folder_new = sum(folders['folders'].get(sc['id'], {}).get('new_keyframes', 0) for sc in scenes)
    page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>영상 만들기 전 확인</title><style>
:root{{--bg:#fff;--ink:#1d1d1f;--sub:#5b5b60;--line:#e2e2e6;--accent:#4F46E5;--accent-bg:#EEF2FF;--ok:#047857;--ok-bg:#ECFDF5;--warn:#B45309;--warn-bg:#FFFBEB}}
@media (prefers-color-scheme:dark){{:root{{--bg:#16161a;--ink:#ececf1;--sub:#a1a1aa;--line:#33333a;--accent:#A5B4FC;--accent-bg:#1e1b4b;--ok:#6EE7B7;--ok-bg:#052e24;--warn:#FCD34D;--warn-bg:#3a2a05}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Malgun Gothic",sans-serif}}
main{{max-width:1500px;margin:0 auto;padding:16px}}h1{{font-size:24px;margin:8px 0}}h2{{border-top:2px solid var(--accent);padding-top:12px;margin-top:36px}}
.note{{background:var(--accent-bg);border-left:4px solid var(--accent);padding:10px 14px;border-radius:6px}}
table{{border-collapse:collapse;margin:8px 0}}th,td{{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}}
td.ok{{background:var(--ok-bg);color:var(--ok);font-weight:600}}td.warn{{background:var(--warn-bg);color:var(--warn);font-weight:600}}
.credit td,.credit th{{font-size:17px}}.kv th{{white-space:nowrap;width:1%}}
.strip{{display:flex;flex-wrap:wrap;gap:12px}}figure{{margin:0}}figure img{{display:block;max-width:100%;height:auto;border:1px solid var(--line)}}
figcaption{{color:var(--sub);font-size:13px;max-width:704px}}pre{{white-space:pre-wrap;background:var(--accent-bg);padding:10px;border-radius:6px;font-size:13px}}
.wrap{{overflow-x:auto}}</style></head><body><main>
<h1>대기 영상 {n}편 — 영상 만들기 전 확인</h1>
<p class="note"><b>Bumm님 «해» 전에는 0편을 만든다.</b> 이 페이지의 그림·글·설정 그대로 만든다. 대상: {", ".join(e(sc["id"]) for sc in scenes)}
(제외: {", ".join(e(s) for s in skip) or "없음"} — 이미 만든 편). 소리는 넣지 않는다(대기 영상은 무음).</p>
<h2 style="border:0;margin-top:16px">크레딧 — 두 가지 중 하나</h2>
<div class="wrap"><table class="credit"><thead><tr><th>모드</th><th>한 편</th><th>{n}편</th><th>지금 잔액</th><th>만든 뒤 잔액</th></tr></thead><tbody>
<tr><td>빠른 모드(fast, 720p)</td><td>{fast}</td><td><b>{fast * n}</b></td><td>{folders["balance"]}</td><td>{folders["balance"] - fast * n}</td></tr>
<tr><td>보통 모드(std, 720p)</td><td>{std}</td><td><b>{std * n}</b></td><td>{folders["balance"]}</td><td>{folders["balance"] - std * n}</td></tr>
</tbody></table></div>
<p>잔액은 {e(folders["checked"])} 조회값. 한 편 단가는 10/10 08 시험(std 8초 36)과 같은 조건 기준이다 — 다시 만들면 그만큼 더 든다.</p>
<h2 style="border:0;margin-top:16px">편별 한눈에 · 힉스필드 폴더</h2>
<div class="wrap"><table><thead><tr><th>편</th><th>키프레임</th><th>std</th><th>fast</th><th>힉스필드에 올림</th><th>폴더 01~12 안</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
<p class="note">힉스필드: 키프레임 {total_up}장은 프로젝트 미디어로 올라가 있고, 편 폴더 안에 있는 새 키프레임은 {folder_new}장이다. {e(folders["note"])}<br>
확인 방법: {e(folders["how"])}</p>
{"".join(blocks)}
</main></body></html>'''
    path = os.path.join(out, 'preflight.html')
    open(path, 'w', encoding='utf-8').write(page)
    print(path, f'{n}편', f'fast {fast * n} · std {std * n}')


if __name__ == '__main__':
    main()
