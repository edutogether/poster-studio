/* step2-geometry.mjs의 비교 판정(2026-11-02 종합감사 — 빈 게이트, COMMON_STANDARDS §21-1). 브라우저 없이 selftest.mjs가 같은 함수를 시험한다.

   예전 판정은 «전»과 «후»의 요소 자리를 견주기만 했다. 두 빌드 모두 선택자에 아무것도 안 걸리면(앱의 클래스 이름이 바뀌는 등)
   diffKeys가 []를 내 기본 542개 크기가 전부 «같음 · 통과»였다. 그래서 2단계라면 어느 크기에서나 보이는 요소(REQUIRED)를
   빌드마다 하나 이상 재야 그 크기를 잰 것으로 친다 — 하나라도 못 잰 빌드가 있으면 그 크기는 걸림이다. */

// 2단계 요소 — 설치판에만 있는 표시(.desktop-badge)는 «같은 화면» 비교에서 뺀다
export const SEL = { cameraTop: '#cameraView .camera-top', cameraBox: '#cameraView .cameraBox', pageHeading: '#cameraWorkspace .page-heading', title: '#cameraWorkspace .page-heading h1',
  tips: '.camera-instructions', tip: '.camera-instructions li', filmHeading: '.camera-film-heading', card: '.camera-film-card', scene: '.camera-film-scene', poster: '.camera-film-poster img',
  ticket: '.camera-ticket', actions: '#cameraWorkspace .camera-actions', actionBtn: '#cameraWorkspace .camera-actions button', guide: '.camera-guide' };

// 어느 크기에서나 2단계에 보이는 요소 — 2026-11-02 master 206e20f 빌드 실측: 기본 542개 크기 모두 1개 이상(사진 칸 · 제목 · 안내 1~3 · 단추 줄 · 단추 둘).
// 나머지(카메라 머리 · «오늘 촬영할 영화» · 포스터 · 티켓 · 구도 선)는 휴대폰 · 태블릿 세로 등 일부 크기에서 원래 안 보이므로 넣지 않는다.
export const REQUIRED = ['cameraBox', 'pageHeading', 'title', 'tips', 'tip', 'actions', 'actionBtn'];

const KEYS = Object.keys(SEL);
const close = (a, b) => Math.abs(a - b) <= 0.5;
// 두 측정에서 개수 · 자리 · 크기가 0.5px 넘게 다른 요소 이름
export const diffKeys = (a, b) => KEYS.filter((k) => a[k].length !== b[k].length || a[k].some((r, i) => r.some((v, j) => !close(v, b[k][i][j]))));
// 하나도 못 잰 필수 요소 이름 — 비어 있어야 그 측정을 «같다» · «다르다»의 근거로 쓸 수 있다
export const unmeasured = (m) => REQUIRED.filter((k) => !(m?.[k]?.length > 0));

/* 한 크기의 비교 판정. a = «전», b = «후», c = --same-as 빌드(없으면 null), changed = --changed에 든 크기인가, names = [전 이름, 후 이름].
   걸림: 필수 요소를 못 잰 빌드 · (바뀌면 안 되는 크기) «전»과 다름 · (바뀌어야 하는 크기) «전»과 같음 · --same-as와 다름. */
export function compareIssues(a, b, c, changed, names) {
  const issues = [];
  for (const [name, m] of [[names[0], a], [names[1], b], ...(c ? [['--same-as', c]] : [])]) {
    const miss = unmeasured(m);
    if (miss.length) issues.push(`${name} 빌드에서 못 잰 요소(0개): ${miss.join(', ')}`);
  }
  const diff = diffKeys(a, b);
  if (changed && !diff.length) issues.push('«전»과 «후»가 같다(고친 것이 먹지 않음)');
  if (!changed && diff.length) issues.push(`«전»과 다름: ${diff.join(', ')}`);
  if (c) { const d2 = diffKeys(b, c); if (d2.length) issues.push(`--same-as 빌드와 다름: ${d2.join(', ')}`); }
  return { issues, diff };
}
