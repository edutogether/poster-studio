"""대기 영상 12편 검토 페이지를 만든다 — Bumm님이 브라우저로 열어 한 편씩 틀어 보고 판단하는 로컬 HTML 한 장.

편마다: 최종 영상(투명 WebM, 바탕색을 바꿔 가며 볼 수 있는 플레이어) · 원화 · 세션이 짚는 곳(«몇 초 — 무엇 — 왜»,
누르면 그 초로 이동) · 짚은 지점의 원본 프레임 캡처(따로 파일, 704 RGBA 그대로). 정지 그림으로 대체한 편은 그 이유를 적는다.
«처음부터 순서대로 재생»을 누르면 12편이 차례로 이어진다.

입력: <검토 폴더>/points.json — [{"id":1,"status":"video|still|pending","source":"...","video":"<webm 경로>","frames":"<RGBA 프레임 폴더>",
       "summary":"...","points":[{"t":5.3,"what":"...","why":"...","kind":"봐야 할 곳|확인한 곳"}]}]
사용: python scripts/media/build-video-review.py <검토 폴더>   → <검토 폴더>/index.html (영상·원화·캡처를 폴더 안으로 복사)
"""
import html, json, os, shutil, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ASSETS = os.path.join(ROOT, '_docs', 'intents', '2026-09-30-studio-design-integration', 'loading-approved-2026-10-01', 'assets')
FPS = 24


def main():
    out = os.path.abspath(sys.argv[1])
    items = json.load(open(os.path.join(out, 'points.json'), encoding='utf-8'))
    sets = {s['id']: s for s in json.load(open(os.path.join(ASSETS, 'sets.json'), encoding='utf-8'))}
    for sub in ('videos', 'art', 'captures'): os.makedirs(os.path.join(out, sub), exist_ok=True)
    sections = []
    for it in sorted(items, key=lambda x: x['id']):
        n = f"{it['id']:02d}"; theme = sets[it['id']]['theme']
        shutil.copyfile(os.path.join(ASSETS, f'{n}.png'), os.path.join(out, 'art', f'{n}.png'))
        video = ''
        if it['status'] == 'video':
            shutil.copyfile(os.path.join(ROOT, it['video']), os.path.join(out, 'videos', f'{n}.webm'))
            video = f'videos/{n}.webm'
        rows = []
        for p in it.get('points', []):
            cap = ''
            if it['status'] == 'video' and p.get('t') is not None:
                f = min(192, max(1, round(p['t'] * FPS) + 1))
                src = os.path.join(ROOT, it['frames'], f'{f:03d}.png')
                name = f'{n}-{p["t"]:.2f}초-{f}프레임.png'
                Image.open(src).save(os.path.join(out, 'captures', name))
                cap = f'<a href="captures/{html.escape(name)}" target="_blank">원본 캡처</a>'
            t = '' if p.get('t') is None else f'<button class="seek" data-t="{p["t"]}">{p["t"]:.2f}초</button>'
            rows.append(f'<tr class="{ "look" if p.get("kind") == "봐야 할 곳" else "ok" }"><td>{t}</td><td>{html.escape(p.get("kind", ""))}</td>'
                        f'<td>{html.escape(p["what"])}</td><td>{html.escape(p["why"])}</td><td>{cap}</td></tr>')
        badge = {'video': '영상', 'still': '정지 그림으로 대체', 'pending': '판단 대기'}[it['status']]
        player = (f'<div class="stage"><video src="{video}" controls preload="auto" playsinline muted></video></div>'
                  '<div class="tools"><button class="fr" data-d="-1">◀ 1프레임</button><button class="fr" data-d="1">1프레임 ▶</button>'
                  '<button class="slow">느리게(0.25배)</button><button class="zoom">2배 확대</button><span class="time">0.00초</span></div>') \
            if video else f'<div class="stage still"><img src="art/{n}.png" alt="원화 {n}"></div>'
        sections.append(f'''<section id="s{n}" data-video="{1 if video else 0}">
<h2>{n} · {html.escape(theme)} <span class="badge {it['status']}">{badge}</span></h2>
<p class="summary">{html.escape(it.get('summary', ''))}</p><p class="source">{html.escape(it.get('source', ''))}</p>
<div class="pair"><div><h3>최종</h3>{player}</div><div><h3>원화</h3><div class="stage art"><img src="art/{n}.png" alt="원화 {n}"></div></div></div>
<table><thead><tr><th>지점</th><th>구분</th><th>무엇</th><th>왜 봐야 하나</th><th>캡처</th></tr></thead><tbody>{''.join(rows) or '<tr><td colspan="5">짚을 곳 없음</td></tr>'}</tbody></table>
</section>''')
    page = TEMPLATE.replace('{{SECTIONS}}', '\n'.join(sections))
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
    print(os.path.join(out, 'index.html'))


TEMPLATE = r'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>대기 영상 12편 검토</title>
<style>
:root{--bg:#f6f6f4;--ink:#1d1d1f;--line:#d9d9d6;--look:#fff3e0;--ok:#f2f8f2}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Malgun Gothic",sans-serif}
header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:12px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
header h1{font-size:18px;margin:0 12px 0 0}header button,header select{font:inherit;padding:6px 12px}
main{max-width:1500px;margin:0 auto;padding:16px 20px 80px}
section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:18px 0}
h2{margin:0 0 4px;font-size:20px}h3{margin:6px 0;font-size:14px;color:#555}
.badge{font-size:13px;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:2px}
.badge.video{background:#e3f2fd}.badge.still{background:#ffebee}.badge.pending{background:#fff8e1}
.summary{margin:4px 0}.source{margin:0 0 8px;color:#666;font-size:13px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:900px){.pair{grid-template-columns:1fr}}
.stage{border:1px solid var(--line);border-radius:8px;overflow:auto;max-height:760px}
.stage video,.stage img{display:block;width:100%;height:auto}
.stage.zoomed video{width:200%;image-rendering:pixelated}
body[data-bg=white] .stage{background:#fff}body[data-bg=yellow] .stage{background:#ffd23f}
body[data-bg=gray] .stage{background:#8a8a8a}body[data-bg=black] .stage{background:#111}
body[data-bg=check] .stage{background:conic-gradient(#ddd 25%,#fff 0 50%,#ddd 0 75%,#fff 0) 0 0/24px 24px}
.stage.art{background:#fff!important}
.tools{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;align-items:center}.tools button{font:inherit;padding:4px 10px}.time{margin-left:8px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
tr.look td{background:var(--look)}tr.ok td{background:var(--ok)}button.seek{font:inherit;padding:2px 8px}
</style></head>
<body data-bg="check">
<header><h1>대기 영상 12편 검토</h1>
<button id="playAll">처음부터 순서대로 재생</button>
<label>바탕 <select id="bg"><option value="check">체크무늬</option><option value="white">흰색</option><option value="yellow">노랑</option><option value="gray">회색</option><option value="black">검정</option></select></label>
<span>주황 줄 = 세션이 «봐야 할 곳»으로 짚은 곳 · 초록 줄 = 확인한 곳. 시간을 누르면 그 장면에서 멈춥니다.</span></header>
<main>{{SECTIONS}}</main>
<script>
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
$('#bg').onchange=e=>document.body.dataset.bg=e.target.value;
for(const sec of $$('section')){const v=$('video',sec);if(!v)continue;const t=$('.time',sec);
  v.addEventListener('timeupdate',()=>t.textContent=v.currentTime.toFixed(2)+'초');
  for(const b of $$('.seek',sec))b.onclick=()=>{v.pause();v.currentTime=+b.dataset.t;v.scrollIntoView({block:'center'});};
  for(const b of $$('.fr',sec))b.onclick=()=>{v.pause();v.currentTime=Math.max(0,v.currentTime+(+b.dataset.d)/24);};
  $('.slow',sec).onclick=e=>{v.playbackRate=v.playbackRate===1?0.25:1;e.target.textContent=v.playbackRate===1?'느리게(0.25배)':'보통 속도';};
  $('.zoom',sec).onclick=e=>{const s=v.parentElement;s.classList.toggle('zoomed');e.target.textContent=s.classList.contains('zoomed')?'원래 크기':'2배 확대';};}
$('#playAll').onclick=()=>{const vids=$$('section[data-video="1"] video');let i=0;
  const play=()=>{if(i>=vids.length)return;const v=vids[i];v.currentTime=0;v.scrollIntoView({block:'center'});v.play();v.onended=()=>{v.onended=null;i++;play();};};play();};
</script></body></html>'''

if __name__ == '__main__':
    main()
