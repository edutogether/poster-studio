// firebase.json 머리글 «source» 글롭을 정규식으로 — serve-dist.mjs(로컬 서빙)와 시험(test/waiting-video-assets.test.js)이 같은 풀이를 쓴다(2026-10-26).
// Hosting 글롭: «**/»는 앞 경로 아무것이나, 끝의 «**»는 그 아래 전부(«/assets/**»가 /assets/main-….js를 잡아야 한다 — 10/24판은 못 잡아 1시간 캐시로 서빙했다),
// «*»는 한 마디 안에서만. (블록 주석으로 쓰면 «**/»에서 주석이 끝나 버린다)
export const hostingGlob = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');

/** 그 경로에 붙는 Cache-Control — 여러 규칙이 걸리면 뒤의 값(serve-dist.mjs와 같은 풀이, 이 저장소의 Cache-Control 규칙끼리는 겹치지 않는다). 없으면 undefined(Hosting 기본 1시간). */
export function hostingCacheControl(rules, pathname) {
  let value;
  for (const r of rules) if (hostingGlob(r.source).test(pathname)) for (const h of r.headers) if (h.key.toLowerCase() === 'cache-control') value = h.value;
  return value;
}
