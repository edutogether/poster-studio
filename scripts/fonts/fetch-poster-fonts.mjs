#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   포스터 글꼴(Black Han Sans·Noto Serif KR·Anton·Bebas Neue)을 구글 폰트에서 받아
   public/fonts/poster/에 고정한다. 받은 그대로의 파일과 @font-face 규칙(unicode-range 포함)을
   쓰므로 화면·포스터에 그려지는 글자는 외부에서 받던 때와 같다.

     node scripts/fonts/fetch-poster-fonts.mjs

   왜 고정하나(2026-10-07): 외부가 글꼴을 바꾸면 인쇄되는 포스터가 바뀔 수 있고, 행사장에서 외부
   도메인 두 곳이 더 필요했다. 포스터에 들어가는 글자를 그리는 파일도 이 도메인에서 받는다.
   다시 받을 때는 이 스크립트를 돌리고 포스터 40지문 대조(scripts/verify/release-baseline.mjs)로
   바뀐 것이 없는지 확인한다 — 바뀌었으면 승인 없이 커밋하지 않는다.
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'public', 'fonts', 'poster');
const CSS_OUT = path.join(ROOT, 'public', 'fonts', 'poster.css');
// index.html이 2026-10-07까지 쓰던 주소 그대로다.
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Serif+KR:wght@500;700;900&family=Anton&family=Bebas+Neue&display=swap';
// woff2와 unicode-range 조각을 주는 최신 크롬으로 받는다(행사 노트북·휴대폰 브라우저가 받는 것과 같은 형태).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const LICENSES = ['blackhansans', 'notoserifkr', 'anton', 'bebasneue'];
const FILE_URL = /url\((https:\/\/fonts\.gstatic\.com\/s\/([a-z0-9]+)\/v\d+\/([A-Za-z0-9_-]+(?:\.\d+)?\.woff2))\)/g;

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'bytes' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

const css = await get(CSS_URL);
const files = new Map();
for (const [, url, family, name] of css.matchAll(FILE_URL)) files.set(url, `${family}/${name}`);
if (files.size === 0) throw new Error('글꼴 파일 주소를 하나도 찾지 못했다 — 응답 형식이 바뀌었다');

fs.rmSync(OUT, { recursive: true, force: true });
for (const [url, local] of files) {
  const bytes = await get(url, 'bytes');
  if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`woff2가 아니다: ${url}`);
  fs.mkdirSync(path.dirname(path.join(OUT, local)), { recursive: true });
  fs.writeFileSync(path.join(OUT, local), bytes);
}
for (const family of LICENSES) {
  const text = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`);
  fs.mkdirSync(path.join(OUT, family), { recursive: true });
  fs.writeFileSync(path.join(OUT, family, 'OFL.txt'), text);
}

const header = `/* 포스터 글꼴 — 자체 호스팅(SIL OFL 1.1, poster/<글꼴>/OFL.txt).
   scripts/fonts/fetch-poster-fonts.mjs가 구글 폰트에서 받은 파일·규칙 그대로다. 손으로 고치지 않는다. */
`;
const localCss = css.replace(FILE_URL, (_, url) => `url(poster/${files.get(url)})`);
// 허용 목록으로 확인한다 — 모든 url()이 방금 받은 파일을 가리켜야 한다. 하나라도 다르면 쓰지 않는다.
const urls = [...localCss.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
const stray = urls.filter((u) => !/^poster\/[a-z0-9]+\/[A-Za-z0-9_.-]+\.woff2$/.test(u));
if (urls.length === 0 || stray.length) throw new Error(`바꾸지 못한 주소가 남았다: ${stray[0] ?? '(url 없음)'}`);
fs.writeFileSync(CSS_OUT, header + localCss);
const bytes = [...files.values()].reduce((sum, local) => sum + fs.statSync(path.join(OUT, local)).size, 0);
console.log(`글꼴 파일 ${files.size}개 · ${(bytes / 1024 / 1024).toFixed(2)}MB · 규칙 ${css.match(/@font-face/g).length}개`);
