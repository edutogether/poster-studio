// public/app.js의 TEMPLATES(포스터 4종 렌더 함수) 검증.
// 5차 감사 발견: "TEMPLATES가 const라 테스트에서 접근 불가"라는 기존 설명이
// 기술적으로 부정확했다 — load-app.js의 vm 샌드박스는 이미 다른 top-level
// 선언에 접근하고 있고, TEMPLATES도 var로 바꾸면 똑같이 접근 가능하다(app.js 참고).
// 실제 캔버스 렌더링 결과(픽셀)까지는 검증하지 않지만(그러려면 진짜 폰트/canvas
// 구현이 필요해 zero-dependency 원칙과 충돌), 극단적인 입력(초긴 제목·단체명·
// 출연진 등)으로 4가지 템플릿을 실제로 호출해서 "예외 없이 끝나는가"는 검증한다 —
// 이게 실제로 부스에서 발생 가능한 리스크(글자 겹침/삐져나감으로 렌더가 죽는 것)를
// 잡아준다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, FakeCtx } from './load-app.js';

const app = await loadApp();
const FAKE_ART = { width: 1024, height: 1536 };

const GENRE_STUB = { font: "'Black Han Sans'", accent: '#ffd23f', taglines: ['테스트 문구'] };

const METAS = {
  짧은솔로: { mode: 'solo', name: '김인키', title: '나의 영화', tagline: '오늘의 이야기', genre: 'animation' },
  긴제목단체: {
    mode: 'group',
    groupName: '햇살초등학교 5학년 2반 영화 동아리 특별출연진 포함',
    members: '김인키, 이영화, 박감독, 최배우, 정연출, 한제작, 오조명, 윤음향',
    title: '우주를 건너 별들의 바다로 떠나는 아주 길고 긴 모험 이야기 제2부',
    tagline: '이것은 매우 길고 긴 홍보 문구로 화면 밖으로 삐져나갈 수도 있는 극단적인 테스트 케이스입니다',
    genre: 'sf'
  },
  띄어쓰기없는긴제목: {
    mode: 'solo',
    name: '이',
    title: '가'.repeat(30),
    tagline: '나'.repeat(30),
    genre: 'fantasy'
  },
  빈문자열들: { mode: 'solo', name: '', title: '', tagline: '', genre: 'hero' },
  특수문자: {
    mode: 'group',
    groupName: '<script>alert(1)</script> "따옴표" & 특수문자',
    members: '★☆♪♬「」',
    title: '제목"에\'특수문자',
    tagline: '문구<>&',
    genre: 'mystery'
  }
};

for (const template of app.TEMPLATES) {
  for (const [metaName, meta] of Object.entries(METAS)) {
    test(`TEMPLATES[${template.label}].render(): "${metaName}" 입력에서도 예외 없이 끝난다`, () => {
      const ctx = new FakeCtx();
      assert.doesNotThrow(() => {
        template.render(ctx, FAKE_ART, meta, GENRE_STUB);
      });
    });
  }
}

test('TEMPLATES: 정확히 4종(클래식/임팩트/시네마/포토카드)이다', () => {
  assert.equal(app.TEMPLATES.length, 4);
  // vm 샌드박스의 배열은 이 realm의 Array.prototype과 달라 deepEqual이 realm
  // 불일치로 실패할 수 있다 — Array.from으로 이 realm의 평범한 배열로 옮겨 비교.
  const labels = Array.from(app.TEMPLATES, (t) => t.label);
  assert.deepEqual(labels, ['클래식', '임팩트', '시네마', '포토카드']);
});
