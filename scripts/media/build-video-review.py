"""대기 영상 12편 검토 페이지를 만든다 — Bumm님이 브라우저로 열어 보고 판단하는 로컬 HTML 한 장. 보고의 정본은 이 페이지다
(2026-10-08 Bumm님: «정신없이 이렇게 보내지 말고, 그 사이트를 업데이트해»).

맨 위: 갱신 시각 · «12편 한눈에»(상태 · 지금 최신 후보 · 결정할 것 한 줄 · ⭐ 추천 · 비용, 확인 요청 편은 «무엇을 보면 되나») ·
«대표님 결정 대기» 칸 · 편별 표(번호 · 편 이름 · 지금 상태 · 이번에 고친 것 · 남은 걱정 · 대표님께 여쭐 것 · 열기).
맨 아래: 스플래시 «극한 상황» 전/후(2026-10-10 Bumm님 «채팅 속 작은 화면으로는 판단이 안 된다») — 조건마다 수정 전·수정 후를
나란히가 아니라 **따로따로** 크게 재생한다(합성·축소본 없음, 원본 화소 1:1·전체 화면·0.25배속 영상).
편마다: «지금 최신판»(투명 WebM, 바탕을 바꿔 가며 보는 플레이어 — 확인이 끝난 판만) → «고치기 전 / 고친 뒤»(전체·얼굴 3배 영상, 캡처를
나란히) → 판단용 영상 → 짚을 곳 표(누르면 그 초로 이동) → 맨 아래 접힌 «이전 판». 확인이 안 끝난 편은 최신판 자리에 덜 된 결과를 넣지 않고
«고치는 중»으로 적는다.

입력: <검토 폴더>/points.json (version 2)
  {"updated": "2026-10-08 19:30", "cost": {"spent", "next", "next_what"}, "decisions": [{"title", "why", "options": [{"label", "star", "desc"}], "files": [{"label", "path"}]}],
   "items": [{"id", "state": "통과|대표님 확인 요청|고치는 중|대표님 결정 대기|다시 생성 대기", "verdict", "fixed", "concern", "ask",
              "checklist": [{"item", "ok": true|false|null(사람 확인), "evidence", "image"}],
              "latest": {"video", "frames", "label"} | null, "latest_note",
              "ab": {"label", "before", "after", "face_before", "face_after", "caps": [{"label", "before", "after"}]} | null,
              "keyframes": [{"label", "image"}], "raw_video",
              "judge": [{"label", "video" | "image"}], "points": [{"t", "what", "why", "kind"}], "files": [{"label", "path"}],
              "older": [{"label", "video"}],
              "candidate": {"video", "label"} — 확인이 안 끝난 편의 «지금 최신 후보»(앱에 연결하지 않음),
              "decide": {"line", "star", "cost"} | "look": "확인 요청 편에서 무엇을 보면 되나"}],
   "splash": {"intro", "conditions": [{"label", "device", "source", "change",
              "before": {"video", "slow", "note", "label"}, "after": {"video", "slow", "note", "label"}}]}}
  경로는 저장소 기준(files의 path만 검토 폴더 기준). 영상·캡처는 검토 폴더 안으로 복사한다.
사용: python scripts/media/build-video-review.py <검토 폴더>   → <검토 폴더>/index.html
"""
import html, json, os, shutil, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ASSETS = os.path.join(ROOT, '_docs', 'intents', '2026-09-30-studio-design-integration', 'loading-approved-2026-10-01', 'assets')
FPS = 24
STATE_CLASS = {'통과': 'pass', '대표님 확인 요청': 'req', '고치는 중': 'work', '대표님 결정 대기': 'ask', '다시 생성 대기': 'regen'}
CHECK = {True: ('맞음', 'ok'), False: ('아님', 'look'), None: ('사람 확인', 'human')}
e = html.escape


def copy(out, src, sub, name):
    """저장소 기준 경로 src를 검토 폴더 sub/name으로 복사하고 페이지에서 쓸 상대 경로를 돌려준다."""
    os.makedirs(os.path.join(out, sub), exist_ok=True)
    s = os.path.join(ROOT, src)
    if not os.path.exists(s): raise SystemExit(f'없는 파일: {src}')
    shutil.copyfile(s, os.path.join(out, sub, name))
    return f'{sub}/{name}'


def media(path, alpha=False, still=False):
    if path.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        return f'<div class="stage{" art" if still else ""}"><a href="{e(path)}" target="_blank"><img src="{e(path)}" alt=""></a></div>'
    return f'<div class="stage{"" if alpha else " art"}"><video src="{e(path)}" controls preload="metadata" playsinline muted></video></div>'


def main():
    out = os.path.abspath(sys.argv[1])
    data = json.load(open(os.path.join(out, 'points.json'), encoding='utf-8'))
    if data.get('version') != 2: raise SystemExit('points.json version 2가 아니다')
    sets = {s['id']: s for s in json.load(open(os.path.join(ASSETS, 'sets.json'), encoding='utf-8'))}
    os.makedirs(os.path.join(out, 'art'), exist_ok=True)
    table, sections, glance = [], [], []
    for it in sorted(data['items'], key=lambda x: x['id']):
        n = f"{it['id']:02d}"; theme = sets[it['id']]['theme']; st = it['state']
        shutil.copyfile(os.path.join(ASSETS, f'{n}.png'), os.path.join(out, 'art', f'{n}.png'))
        # 지금 최신판
        latest_html = ''
        if it.get('latest'):
            v = copy(out, it['latest']['video'], 'videos', f'{n}.webm')
            latest_html = (f'<h3>지금 최신판 — {e(it["latest"].get("label", ""))}</h3>{media(v, alpha=True)}'
                           '<div class="tools"><button class="fr" data-d="-1">◀ 1프레임</button><button class="fr" data-d="1">1프레임 ▶</button>'
                           '<button class="slow">느리게(0.25배)</button><button class="zoom">2배 확대</button><span class="time">0.00초</span></div>')
        elif it.get('candidate'):
            ext = os.path.splitext(it['candidate']['video'])[1]
            v = copy(out, it['candidate']['video'], 'candidates', f'{n}{ext}')
            latest_html = (f'<h3>지금 최신 후보 — {e(it["candidate"].get("label", ""))} <span class="state {STATE_CLASS.get(st, "")}">{e(st)}</span></h3>'
                           f'{media(v, alpha=ext == ".webm")}'
                           '<div class="tools"><button class="fr" data-d="-1">◀ 1프레임</button><button class="fr" data-d="1">1프레임 ▶</button>'
                           '<button class="slow">느리게(0.25배)</button><button class="zoom">2배 확대</button><span class="time">0.00초</span></div>'
                           f'<p class="cand-note">{e(it.get("latest_note") or "")}</p>')
        else:
            latest_html = f'<h3>지금 최신판</h3><div class="note {STATE_CLASS.get(st, "")}">{e(it.get("latest_note") or st)}</div>'
        # 고치기 전 / 고친 뒤
        ab_html = ''
        ab = it.get('ab')
        if ab:
            cells = []
            for key, sub in (('before', '고치기 전'), ('after', '고친 뒤')):
                cells.append(f'<div><h4>{sub} · 전체</h4>{media(copy(out, ab[key], "ab", f"{n}-{key}.mp4"))}</div>')
            face = ''
            if ab.get('face_before'):
                face = '<div class="pair">' + ''.join(
                    f'<div><h4>{sub} · 얼굴 3배</h4>{media(copy(out, ab[key], "ab", f"{n}-{key}.mp4"))}</div>'
                    for key, sub in (('face_before', '고치기 전'), ('face_after', '고친 뒤'))) + '</div>'
            caps = ''
            for k, c in enumerate(ab.get('caps', [])):
                b = copy(out, c['before'], 'ab', f'{n}-cap{k}-before.png'); a = copy(out, c['after'], 'ab', f'{n}-cap{k}-after.png')
                caps += (f'<div class="cap"><h4>{e(c["label"])}</h4><div class="pair">'
                         f'<div><h5>고치기 전</h5>{media(b, still=True)}</div><div><h5>고친 뒤</h5>{media(a, still=True)}</div></div></div>')
            ab_html = (f'<h3>고치기 전 / 고친 뒤 — {e(ab.get("label", ""))}</h3><div class="pair">{"".join(cells)}</div>{face}'
                       + (f'<details class="caps"><summary>캡처 {len(ab.get("caps", []))}장(원본 화소, 얼굴 4배)</summary>{caps}</details>' if caps else ''))
        # 키프레임 → 생성 원본(키프레임 방식, 2026-10-08 Bumm님)
        kf_html = ''
        if it.get('keyframes'):
            cells = ''.join(f'<div><h4>{e(k["label"])}</h4>{media(copy(out, k["image"], "kf", f"{n}-K{j + 1}.png"), still=True)}</div>'
                            for j, k in enumerate(it['keyframes']))
            kf_html = f'<h3>키프레임 원화 K1~K{len(it["keyframes"])}</h3><div class="pair kf">{cells}</div>'
            if it.get('raw_video'):
                kf_html += f'<h3>생성 원본(키프레임 사이를 이은 것, 얼굴 보정·누끼 전)</h3>{media(copy(out, it["raw_video"], "kf", f"{n}-raw.mp4"))}'
        # 판단용
        judge_html = ''
        if it.get('judge'):
            cells = []
            for k, j in enumerate(it['judge']):
                src = j.get('video') or j.get('image'); ext = os.path.splitext(src)[1]
                cells.append(f'<div><h4>{e(j["label"])}</h4>{media(copy(out, src, "judge", f"{n}-{k}{ext}"), still=bool(j.get("image")))}</div>')
            judge_html = f'<h3>판단용</h3><div class="pair">{"".join(cells)}</div>'
        # 짚을 곳(최신판 기준)
        rows = []
        for p in it.get('points', []):
            cap = ''
            if it.get('latest') and it['latest'].get('frames') and p.get('t') is not None:
                f = min(192, max(1, round(p['t'] * FPS) + 1))
                name = f'{n}-{p["t"]:.2f}초-{f}프레임.png'
                os.makedirs(os.path.join(out, 'captures'), exist_ok=True)
                Image.open(os.path.join(ROOT, it['latest']['frames'], f'{f:03d}.png')).save(os.path.join(out, 'captures', name))
                cap = f'<a href="captures/{e(name)}" target="_blank">원본 캡처</a>'
            t = '' if p.get('t') is None else f'<button class="seek" data-t="{p["t"]}">{p["t"]:.2f}초</button>'
            rows.append(f'<tr class="{"look" if p.get("kind") == "봐야 할 곳" else "ok"}"><td>{t}</td><td>{e(p.get("kind", ""))}</td>'
                        f'<td>{e(p["what"])}</td><td>{e(p["why"])}</td><td>{cap}</td></tr>')
        points_html = (f'<table><thead><tr><th>지점</th><th>구분</th><th>무엇</th><th>왜 봐야 하나</th><th>캡처</th></tr></thead>'
                       f'<tbody>{"".join(rows)}</tbody></table>') if rows else ''
        # 체크리스트 — Bumm님 지적 전부를 항목마다 맞음/아님/사람 확인과 근거로(2026-10-08 Bumm님: 세션이 «통과»를 스스로 붙이지 않는다)
        check_html = ''
        if it.get('checklist'):
            rows = []
            for k, c in enumerate(it['checklist']):
                word, rc = CHECK[c.get('ok')]
                cap = ''
                if c.get('image'):
                    ext = os.path.splitext(c['image'])[1]
                    cap = f'<a href="{e(copy(out, c["image"], "check", f"{n}-{k}{ext}"))}" target="_blank">캡처</a>'
                rows.append(f'<tr class="{rc}"><td>{e(c["item"])}</td><td><b>{word}</b></td><td>{e(c.get("evidence", ""))}</td><td>{cap}</td></tr>')
            check_html = ('<h3>체크리스트 — 대표님 지적 전부</h3><table class="check"><thead><tr><th>항목</th><th>판정</th><th>근거(몇 초)</th>'
                          f'<th>캡처</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')
        files = ' · '.join(f'<a href="{e(f["path"])}" target="_blank">{e(f["label"])}</a>' for f in it.get('files', []))
        # 이전 판(접힘)
        older = ''
        if it.get('older'):
            cells = []
            for k, o in enumerate(it['older']):
                ext = os.path.splitext(o['video'])[1]
                cells.append(f'<div><h4>{e(o["label"])}</h4>{media(copy(out, o["video"], "prev", f"{n}-{k}{ext}"), alpha=ext == ".webm")}</div>')
            older = f'<details class="older"><summary>이전 판 {len(cells)}개</summary><div class="pair">{"".join(cells)}</div></details>'
        cls = STATE_CLASS.get(st, '')
        table.append(f'<tr><td><a href="#s{n}">V{n}</a></td><td>{e(theme)}</td><td><span class="state {cls}">{e(st)}</span></td>'
                     f'<td>{e(it.get("fixed", ""))}</td><td>{e(it.get("concern", ""))}</td><td>{e(it.get("ask", ""))}</td>'
                     f'<td><a href="#s{n}">이 편으로</a>{" · " + files if files else ""}</td></tr>')
        # 12편 한눈에 — 결정할 것 한 줄·추천·비용, 확인 요청 편은 무엇을 보면 되나
        cand = it.get('latest') or it.get('candidate')
        if it.get('decide'):
            todo = f'{e(it["decide"]["line"])}<br><b>⭐ {e(it["decide"]["star"])}</b>'
            cost_ = e(it['decide'].get('cost', ''))
        elif it.get('look'):
            todo = f'<b>볼 것</b> {e(it["look"])}'
            cost_ = '$0'
        else:
            todo, cost_ = '없음', '$0'
        cand_link = f'<a href="#s{n}">{e(cand.get("label") or "보기")}</a>' if cand else '없음'
        glance.append(f'<tr><td><a href="#s{n}">V{n}</a></td><td>{e(theme)}</td><td><span class="state {cls}">{e(st)}</span></td>'
                      f'<td>{cand_link}</td><td>{todo}</td><td>{cost_}</td></tr>')
        sections.append(f'''<section id="s{n}" data-video="{1 if (it.get('latest') or it.get('candidate')) else 0}">
<h2>V{n} · {e(theme)} <span class="state {cls}">{e(st)}</span></h2>
<p class="verdict">{e(it.get('verdict', ''))}</p>
{check_html}
<div class="pair top"><div>{latest_html}</div><div><h3>원화</h3>{media(f"art/{n}.png", still=True)}</div></div>
{kf_html}{ab_html}{judge_html}{points_html}
{f'<p class="files">관련 파일: {files}</p>' if files else ''}{older}
</section>''')
    dec = []
    for d in data.get('decisions', []):
        opts = ''.join(f'<li class="{"star" if o.get("star") else ""}"><b>{e(o["label"])}</b>{" ⭐ 세션 추천" if o.get("star") else ""}'
                       f'<br><span>{e(o.get("desc", ""))}</span></li>' for o in d['options'])
        fl = ' · '.join(f'<a href="{e(f["path"])}" target="_blank">{e(f["label"])}</a>' for f in d.get('files', []))
        dec.append(f'<div class="dec"><h3>{e(d["title"])}</h3><p>{e(d.get("why", ""))}</p><ol>{opts}</ol>{f"<p>보기: {fl}</p>" if fl else ""}</div>')
    cost = data.get('cost') or {}
    cost_html = (f'<section id="cost"><h2>비용 <small>Veo 3.1 Fast · 8초 $0.64 · 4초 $0.32 · 상한 없음(2026-10-08 Bumm님)</small></h2>'
                 f'<p>지금까지 누적 <b>${cost.get("spent", 0):.2f}</b> · 다음 예정 <b>${cost.get("next", 0):.2f}</b> — {e(cost.get("next_what", ""))}</p></section>') if cost else ''
    glance_html = ('<section id="glance"><h2>① 대기 영상 12편 한눈에 <small>앱에는 연결하지 않음 · 영상은 원본 해상도·소리 없음</small></h2>'
                   '<table><thead><tr><th>번호</th><th>편 이름</th><th>상태</th><th>지금 최신 후보</th><th>결정할 것 · ⭐ 추천 (확인 요청 편은 볼 것)</th>'
                   f'<th>비용</th></tr></thead><tbody>{"".join(glance)}</tbody></table></section>')
    head = glance_html + cost_html + (f'<section id="decisions"><h2>대표님 결정 대기 <small>갱신 {e(data.get("updated", ""))}</small></h2>'
            f'{"".join(dec) or "<p>없음</p>"}</section>'
            '<section id="table"><h2>편별 표</h2><table><thead><tr><th>번호</th><th>편 이름</th><th>지금 상태</th><th>이번에 고친 것</th>'
            f'<th>남은 걱정</th><th>대표님께 여쭐 것</th><th>열기</th></tr></thead><tbody>{"".join(table)}</tbody></table></section>')
    page = TEMPLATE.replace('{{UPDATED}}', e(data.get('updated', ''))).replace('{{SECTIONS}}', head + '\n' + '\n'.join(sections) + splash_section(out, data.get('splash')))
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
    print(os.path.join(out, 'index.html'))


def splash_section(out, sp):
    """스플래시 «극한 상황» 전/후 — 조건마다 수정 전·수정 후를 따로따로, 크게. 영상은 그대로 복사한다(다시 인코딩·축소 안 함)."""
    if not sp: return ''
    blocks = []
    for k, c in enumerate(sp['conditions']):
        cells = []
        for key, word in (('before', '수정 전'), ('after', '수정 후')):
            v = c[key]; ext = os.path.splitext(v['video'])[1]
            src = copy(out, v['video'], 'splash', f'{k + 1:02d}-{key}{ext}')
            slow = copy(out, v['slow'], 'splash', f'{k + 1:02d}-{key}-x025{ext}') if v.get('slow') else ''
            tall = ' tall' if c.get('device') == '휴대폰' else ''
            cells.append(f'''<div class="sp-one">
<h4>{word} <small>{e(v.get('label', ''))}</small></h4>
<div class="big{tall}"><video src="{e(src)}" data-normal="{e(src)}" data-slow="{e(slow)}" controls preload="metadata" playsinline muted></video></div>
<div class="tools"><button class="speed">0.25배속 영상으로</button><button class="one">원본 화소 1:1</button><button class="full">전체 화면</button><span class="time">0.00초</span></div>
<p class="what">{e(v.get('note', ''))}</p></div>''')
        blocks.append(f'''<div class="sp-cond" id="sp{k + 1:02d}"><h3>{k + 1}. {e(c['label'])} <small>{e(c.get('device', ''))} · {e(c.get('source', ''))}</small></h3>
<p class="change"><b>달라진 것</b> {e(c.get('change', ''))}</p>{''.join(cells)}</div>''')
    nav = ' · '.join(f'<a href="#sp{k + 1:02d}">{k + 1}. {e(c["label"])}</a>' for k, c in enumerate(sp['conditions']))
    return (f'<section id="splash" class="splash"><h2>② 스플래시 «극한 상황» 전/후 <small>조건마다 수정 전 → 수정 후, 따로따로</small></h2>'
            f'<p>{e(sp.get("intro", ""))}</p><p class="nav">{nav}</p>{"".join(blocks)}</section>')


TEMPLATE = r'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>대기 영상 12편 검토</title>
<style>
:root{--bg:#f6f6f4;--ink:#1d1d1f;--line:#d9d9d6;--look:#fff3e0;--ok:#f2f8f2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Malgun Gothic",sans-serif}
header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:12px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
header h1{font-size:18px;margin:0 12px 0 0}header button,header select{font:inherit;padding:6px 12px}.upd{color:#555}
main{max-width:1500px;margin:0 auto;padding:16px 20px 80px}
section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:18px 0}
h2{margin:0 0 4px;font-size:20px}h2 small{font-size:13px;color:#666;font-weight:400;margin-left:8px}h3{margin:14px 0 6px;font-size:15px}h4{margin:6px 0;font-size:13px;color:#555}h5{margin:4px 0;font-size:12px;color:#777}
.state{font-size:13px;padding:2px 10px;border-radius:999px;white-space:nowrap}
.state.pass{background:#e3f6e5;color:#1b5e20}.state.req{background:#ede7f6;color:#4527a0}.state.work{background:#e3f2fd;color:#0d47a1}.state.ask{background:#fff3cd;color:#7a5200}.state.regen{background:#fde7e9;color:#8b1a1a}
.note{padding:28px 16px;border:1px dashed var(--line);border-radius:8px;color:#444;background:#fafafa}
.verdict{margin:4px 0 8px;color:#444}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}.pair.kf{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.stage{border:1px solid var(--line);border-radius:8px;overflow:auto;max-height:760px}
.stage video,.stage img{display:block;width:100%;height:auto}
.stage.zoomed video{width:200%;image-rendering:pixelated}
body[data-bg=white] .stage{background:#fff}body[data-bg=yellow] .stage{background:#ffd23f}
body[data-bg=gray] .stage{background:#8a8a8a}body[data-bg=black] .stage{background:#111}
body[data-bg=check] .stage{background:conic-gradient(#ddd 25%,#fff 0 50%,#ddd 0 75%,#fff 0) 0 0/24px 24px}
.stage.art{background:#fff!important}
.tools{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;align-items:center}.tools button{font:inherit;padding:4px 10px}.time{margin-left:8px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
tr.look td{background:var(--look)}tr.ok td{background:var(--ok)}tr.human td{background:#fff3cd}button.seek{font:inherit;padding:2px 8px}
.dec{border:1px solid #f0d58a;background:#fffaf0;border-radius:10px;padding:8px 14px;margin:10px 0}.dec h3{margin:6px 0}.dec li{margin:6px 0}.dec li.star b{color:#7a5200}
details{margin-top:12px}summary{cursor:pointer;color:#555}.cap{margin:10px 0}.files{font-size:14px}
.cand-note{font-size:14px;color:#555;margin:4px 0}header a{margin-right:6px}
section.splash{max-width:none;margin-left:calc(50% - 50vw + 20px);margin-right:calc(50% - 50vw + 20px)}
.sp-cond{border-top:2px solid var(--line);padding-top:10px;margin-top:22px}.sp-one{margin:14px 0 26px}
.change{background:#eef6ff;border-radius:8px;padding:8px 12px}.what{margin:6px 0;font-size:15px}
.big{border:1px solid var(--line);border-radius:8px;overflow:auto;background:#fff}
.big video{display:block;width:100%;height:auto}.big.tall video{width:auto;max-width:100%;height:92vh;margin:0 auto}
.big.one video{max-width:none!important;height:auto!important}
.nav{line-height:2}
</style></head>
<body data-bg="check">
<header><h1>대기 영상 12편 검토</h1><span class="upd">갱신 {{UPDATED}}</span>
<a href="#glance">① 대기 영상 12편</a><a href="#splash">② 스플래시 전/후</a>
<button id="playAll">최신판을 처음부터 순서대로 재생</button>
<label>바탕 <select id="bg"><option value="check">체크무늬</option><option value="white">흰색</option><option value="yellow">노랑</option><option value="gray">회색</option><option value="black">검정</option></select></label>
<span>주황 줄 = «봐야 할 곳» · 초록 줄 = 확인한 곳. 시간을 누르면 그 장면에서 멈춥니다.</span></header>
<main>{{SECTIONS}}</main>
<script>
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
$('#bg').onchange=e=>document.body.dataset.bg=e.target.value;
for(const sec of $$('section[data-video="1"]')){const v=$('.top video',sec);if(!v)continue;const t=$('.time',sec);
  v.addEventListener('timeupdate',()=>t.textContent=v.currentTime.toFixed(2)+'초');
  for(const b of $$('.seek',sec))b.onclick=()=>{v.pause();v.currentTime=+b.dataset.t;v.scrollIntoView({block:'center'});};
  for(const b of $$('.fr',sec))b.onclick=()=>{v.pause();v.currentTime=Math.max(0,v.currentTime+(+b.dataset.d)/24);};
  $('.slow',sec).onclick=e=>{v.playbackRate=v.playbackRate===1?0.25:1;e.target.textContent=v.playbackRate===1?'느리게(0.25배)':'보통 속도';};
  $('.zoom',sec).onclick=e=>{const s=v.parentElement;s.classList.toggle('zoomed');e.target.textContent=s.classList.contains('zoomed')?'원래 크기':'2배 확대';};}
for(const one of $$('.sp-one')){const v=$('video',one),box=$('.big',one),t=$('.time',one);
  v.addEventListener('timeupdate',()=>t.textContent=v.currentTime.toFixed(2)+'초');
  $('.speed',one).onclick=e=>{if(!v.dataset.slow)return;const slow=v.getAttribute('src')===v.dataset.slow,at=v.currentTime;
    v.src=slow?v.dataset.normal:v.dataset.slow;v.addEventListener('loadedmetadata',()=>{v.currentTime=slow?at/4:at*4;},{once:true});
    e.target.textContent=slow?'0.25배속 영상으로':'보통 속도 영상으로';};
  $('.one',one).onclick=e=>{const on=box.classList.toggle('one');v.style.width=on?(v.videoWidth/devicePixelRatio)+'px':'';
    e.target.textContent=on?'화면에 맞춤':'원본 화소 1:1';};
  $('.full',one).onclick=()=>v.requestFullscreen&&v.requestFullscreen();}
$('#playAll').onclick=()=>{const vids=$$('section[data-video="1"] .top .stage:not(.art) video');let i=0;
  const play=()=>{if(i>=vids.length)return;const v=vids[i];v.currentTime=0;v.scrollIntoView({block:'center'});v.play();v.onended=()=>{v.onended=null;i++;play();};};play();};
</script></body></html>'''

if __name__ == '__main__':
    main()
