/* 폴라로이드 경계 실험실(2026-10-20, scripts/verify/polaroid-bounds.mjs가 연다) — 그림 10장 × 제목 10가지를 앱과 같은 캔버스 · 글꼴 · 크기(1200×1800)로
   그리고, 그리는 동안 글자 상자(fillText) · 사진 칸(strokeRect) · 종이(카드 fillRect)를 가로채 «글자가 사진에 걸침 · 종이 밖 · 글자끼리 겹침»을 잰다.
   폴라로이드는 글 · 사진 · 종이를 모두 같은 기운 판(2도) 위에 그린다 — 화면 좌표의 축 정렬 상자로 재면 기운 만큼 상자가 커져 이웃 줄이 겹쳐 보인다
   (10/20 실측: 단체 · 긴출연진 20장이 그렇게 «겹침»으로 나왔다). 그래서 판 자체의 좌표(변환 전)로 잰다.
   ?arts=<그림 폴더 주소>/   window.__posters = [{ case, url, check }] */
import { ensureFonts, ensureGlyphs, loadImg } from '/src/layout.ts';
import { state } from '/src/state.ts';
import { GENRES } from '/src/constants.ts';
import { TEMPLATES } from '/src/templates.ts';

const q = new window.URLSearchParams(location.search);
const load = (src) => loadImg(src).catch(() => { throw new Error(`그림을 못 읽음: ${src}`); });
const template = TEMPLATES.find((t) => t.label === '폴라로이드');
const ARTS = q.get('arts') || '';
const base = (o) => ({ mode: 'solo', name: '김인키', groupName: '', members: '', title: '별을 찾는 아이', genre: 'sf', tagline: '우주 너머, 미지의 세계로', ...o });
const TITLES = [
  ['기본', base({})],
  ['단체', base({ mode: 'group', groupName: '햇살초 5학년 2반 영화동아리', members: '김인키, 이영화, 박감독', title: '사라진 급식의 비밀', tagline: '진실을 쫓는 명탐정' })],
  ['긴제목', base({ title: '끝까지 달려라, 햇살초 피구부', name: '한달리', tagline: '포기하지 않는 한, 끝이 아니다' })],
  ['두글자', base({ title: '용기', name: '정용감', tagline: '세상을 지키는 작은 영웅' })],
  ['영문', base({ title: 'GALAXY RUNNER', name: '박하늘', tagline: '별을 향한 위대한 도약' })],
  ['아주긴제목', base({ title: '우리 반 교실 뒤편 사물함에 숨겨진 아주 오래된 보물지도', name: '오탐험' })],
  ['긴홍보문구', base({ title: '여름방학 대모험', tagline: '어느 날 갑자기 시작된 우리들의 특별하고도 신나는 모험 이야기' })],
  ['긴출연진', base({ mode: 'group', groupName: '인천가좌초등학교 6학년 3반 꿈꾸는 영화 동아리', members: '김인키, 이영화, 박감독, 최배우, 정조명, 한음악, 윤편집', title: '우리들의 빛나는 순간' })],
  ['숫자기호', base({ title: '2026 우주 탐험대!', name: '남궁하늘' })],
  ['한글자', base({ title: '봄', name: '이봄', tagline: '꽃이 피는 계절, 우리가 자란다' })],
];
const ARTS_LIST = ['forest', 'theater', 'studio', 'lobby', 'group', 'fireworks', 'piano', 'paint', 'music', 'sf'];

const box = (pts) => {
  const xs = pts.map(([a]) => a), ys = pts.map(([, b]) => b);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};
function instrument(ctx) {
  const texts = []; let photo = null; let paper = null;
  const fillText = ctx.fillText.bind(ctx), strokeRect = ctx.strokeRect.bind(ctx), fillRect = ctx.fillRect.bind(ctx);
  ctx.fillText = (text, x, y, maxWidth) => {
    if (text && text.trim()) {
      const m = ctx.measureText(text);
      texts.push({ text, ...box([[x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent], [x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent]]) });
    }
    if (maxWidth === undefined) fillText(text, x, y); else fillText(text, x, y, maxWidth);
  };
  ctx.strokeRect = (x, y, w, h) => { photo = box([[x, y], [x + w, y + h]]); strokeRect(x, y, w, h); };
  ctx.fillRect = (x, y, w, h) => {
    if (!paper && String(ctx.fillStyle).toLowerCase() === '#f9f7f1') paper = box([[x, y], [x + w, y + h]]);
    fillRect(x, y, w, h);
  };
  return () => ({ texts, photo, paper });
}
const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

(async () => {
  state.LOGO_LIGHT = await load('/logo-white.png');
  state.LOGO_DARK = await load('/logo-dark.png');
  state.LOGO_FESTIVAL = await load('/studio/inky-logo.png');
  state.LOGO_TRIED = true;
  await ensureFonts();
  const out = [];
  for (const [tname, meta] of TITLES) {
    await ensureGlyphs(meta);
    for (const a of ARTS_LIST) {
      const art = await load(`${ARTS}${a}.png`);
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 1800;
      const ctx = cv.getContext('2d');
      const done = instrument(ctx);
      template.render(ctx, art, meta, GENRES[meta.genre]);
      const { texts, photo, paper } = done();
      const lower = photo ? texts.filter((x) => x.top >= photo.top) : [];
      const logo = texts.filter((x) => x.text === 'InKY');
      out.push({ case: `${tname}-${a}`, url: cv.toDataURL('image/jpeg', 0.9), check: {
        photoTop: photo && paper ? Math.round(photo.top - paper.top) : null,
        onPhoto: photo ? texts.filter((x) => overlap(x, photo)).map((x) => x.text) : ['사진 칸 못 찾음'],
        offPaper: paper ? texts.filter((x) => x.left < paper.left || x.right > paper.right || x.top < paper.top || x.bottom > paper.bottom).map((x) => x.text) : ['종이 못 찾음'],
        textOverlap: texts.flatMap((x, i) => texts.slice(i + 1).filter((y) => overlap(x, y)).map((y) => `${x.text} / ${y.text}`)),
        gapPhotoToText: photo && lower.length ? Math.round(Math.min(...lower.map((x) => x.top)) - photo.bottom) : null,
        gapTextToPaper: paper && lower.length ? Math.round(paper.bottom - Math.max(...lower.map((x) => x.bottom))) : null,
        logoTop: paper && logo.length ? Math.round(Math.min(...logo.map((x) => x.top)) - paper.top) : null,
      } });
    }
  }
  window.__posters = out;
})();
