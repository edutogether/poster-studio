# 전환 검증 도구

리액트+TS 전환 전후가 **체감까지 동일한지**를 기계로 증명하기 위한 도구다.
**전환 코드보다 먼저 만들어 커밋했다** — 순서가 반대면 새 코드가 정답으로 굳어버려
"전환 후 상태"를 기준선으로 삼는 자기충족적 검증이 된다(팀장 지시, 2026-09-09).

## 왜 세 층인가

한 층만으로는 뚫린다. 다른 저장소에서 **픽셀 대조를 전부 통과하고도** 유실이 남았다:

| 층 | 잡는 것 | 실제 사고 |
|---|---|---|
| ① computed style + 기하 | 폰트·색·배경·그림자·**transition/animation**·transform·박스·flex/grid·실제 크기 | — |
| ② 시간 | 표시/페이드/소멸, 캔버스 합성 시간 — 스타일이 같아도 다를 수 있다 | — |
| ③ 화면에 안 보이는 값 | `alt`·`aria-*`·`role`·`title`·**요소 `id` 집합**·`meta`·링크·`name`/`type`/`placeholder` | Portal 카드 `alt` 변경, **Voice Cinema 요소 `id` 20여 개 유실** |

## 파일

| 파일 | 역할 |
|---|---|
| `snapshot.js` | 페이지에서 평가하면 ①③을 한 번에 뽑는다. `window.__posterSnapshot()`으로 재호출 가능 |
| `timing.js` | ②를 잰다(스플래시·캔버스 합성·웹캠) |
| `scenario-filled.js` | 갤러리 4장 채운 상태를 **결정적으로** 만든다(전/후가 같은 조작을 하도록 파일로 고정) |
| `capture-server.mjs` | 브라우저가 뽑은 JSON을 `snapshots/`에 저장(포트 5502) |
| `compare.mjs` | 스냅샷 두 개 대조. `high`가 하나라도 있으면 exit 1 |
| `selftest.mjs` | **compare.mjs가 빈 게이트가 아님을 증명**(§5.4) |
| `snapshots/` | 기준선. `before-*`는 freeze 태그 시점의 것이다 |

## 쓰는 법

```bash
# 0) 도구 자체가 제대로 잡는지 먼저 확인한다 (§5.4)
node scripts/verify/selftest.mjs

# 1) 서버 셋
#    5500 앱 / 5501 저장소 루트(도구 fetch용) / 5502 스냅샷 수집
#    5500·5501은 .claude/launch.json의 poster-studio-static / poster-studio-tools
node scripts/verify/capture-server.mjs
```

브라우저에서(앱 페이지 안):

```js
// 스냅샷
const src = await fetch('http://localhost:5501/scripts/verify/snapshot.js').then(r => r.text());
(0, eval)(src);
await fetch('http://localhost:5502/save?name=after-1366x768', {
  method: 'POST', body: JSON.stringify(window.__posterSnapshot())
});

// 갤러리 채운 상태
const s = await fetch('http://localhost:5501/scripts/verify/scenario-filled.js').then(r => r.text());
(0, eval)(s); await window.__posterScenarioFilled();

// 시간(반드시 3회 이상, 페이지 로드 직후 주입)
const t = await fetch('http://localhost:5501/scripts/verify/timing.js').then(r => r.text());
(0, eval)(t); await window.__posterTiming();
```

대조:

```bash
node scripts/verify/compare.mjs \
  scripts/verify/snapshots/before-1366x768.json \
  scripts/verify/snapshots/after-1366x768.json
```

## 전환 후 반드시 다 돌려야 하는 조합

| 스냅샷 | 왜 |
|---|---|
| `1366x768` | 주력 해상도 |
| `1024x768` | 4:3 노트북 |
| `375x812` | 모바일(단일 컬럼 — `layout-match.js`가 동작을 바꾸는 분기) |
| `1366x768-filled` | **갤러리 4장 상태.** 오른쪽 패널 높이가 빈 상태와 350px 이상 차이 나고, 6·7라운드 좌우 높이 "핑퐁"이 정확히 이 두 상태를 같이 안 봐서 생겼다 |

## 촬영 절차 규칙 (중요) — **뷰포트를 바꾼 뒤 반드시 다시 로드한다**

순서는 언제나 **① 뷰포트 변경 → ② 페이지 로드 → ③ 스냅샷**이다. 로드한 뒤에 크기를
바꾸고 찍으면 안 된다.

`layout-match.js`는 `.right .panel`에 **인라인 `height`를 확정값으로 꽂는다.** 데스크톱
폭에서 로드해 값이 꽂힌 뒤 모바일 폭(≤900px)으로 줄이면, `resize` 처리기가 그 값을
비우기 전 상태가 그대로 남을 수 있다. 그러면 스냅샷에는 모바일인데 데스크톱 높이가
찍힌다.

**실제로 이걸로 오판할 뻔했다(2026-09-09).** 2단계(JS→TS) 대조에서 `375x812`만
`rect`/`height` 19건이 어긋나 회귀처럼 보였다. 판정 방법은 **같은 커밋 코드를 두 절차로
각각 찍어보는 것**이었다 — 결과는 절차가 다르면 같은 코드에서도 19건이 그대로 나왔고,
절차가 같으면 전환 전/후가 0건이었다. 즉 전환이 아니라 기준선 촬영 절차가 원인이었다.

그래서 잘못 찍힌 기준선 두 개를 교체했다. 지우지 않고 증거로 남겨 뒀다:
`before-375x812-BADCAPTURE-20260908.json`, `step1-375x812-BADCAPTURE-20260908.json`.

> 다음에 원인이 안 보이는 차이가 나오면 **먼저 같은 코드를 다시 찍어 재현되는지 본다.**
> 도구·절차가 만든 차이인지부터 배제하지 않으면 진짜 회귀를 찾는 시간을 다 쓴다.
>
> 개선 여지: `snapshot.js`가 요소의 인라인 `style` 속성까지 담으면 이런 절차 사고가
> 19건의 알 수 없는 `rect` 차이가 아니라 속성 차이 1건으로 바로 드러난다. 다만 그걸
> 넣으면 기존 스냅샷 전부를 다시 찍어야 해서 전환 중에는 하지 않았다.

## 짝짓기 규칙 (중요)

**요소를 문서 순서(인덱스)로 짝지으면 안 된다.** 전환 전 DOM은 숨긴 요소까지 들고 있고
전환 후는 현재 화면만 그릴 수 있어 인덱스가 밀린다. `snapshot.js`는
**`id` → 구조 경로 + 직계 텍스트 지문** 순으로 안정적인 키를 만들어 짝짓는다.

## 알아둘 것

- **`data:` URL은 통째로 안 담는다.** 갤러리 썸네일 4장만으로 스냅샷이 13MB가 됐다(실측).
  종류와 크기만 지문으로 남긴다. 캔버스 그림의 픽셀 동일성은 이 도구가 아니라
  `public/test/templates-canvas.test.js`(픽셀 샘플링)와 스크린샷이 본다.
- **빌드 해시는 지우고 비교한다.** Vite가 `poster-wall.webp` → `poster-wall-a1b2c3d4.webp`로
  바꾸면 자산 전부가 차이로 잡혀 진짜 신호가 묻힌다.
- **원본 자체의 편차를 먼저 안다.** 캔버스 합성 시간은 같은 코드로도 **524~1533ms**로 흔들린
  적이 있다. 이걸 모르면 전환 후 500ms 차이를 회귀로 오판한다.
  단, **그 편차를 "폰트 로드 때문"으로 설명하던 것은 2026-09-09에 반증됐다** — 스파이크는
  1회차가 아니라 2회차에 났고, 폰트 구간을 직접 재보니 전/후 12회 전부 72~77ms로 일정했다.
  같은 방법으로 6회씩 다시 쟀을 때는 507~567ms로 스파이크가 재현되지 않았다. 환경 스파이크로 본다.
  **미확인 가설을 "전환과 무관한 편차"의 근거로 쓰지 않는다** — 판정은 전/후 각각 6회 이상의
  분포 비교로만 한다. 수치와 근거는 `snapshots/step2-timing.json`,
  기존 기준선은 `snapshots/before-timing.json`(해석 정정 포함)에 있다.

## 스플래시는 예외 — 유일하게 "의도적으로 바뀌는" 항목

`_shared/standards/splash-standard.md`가 2026-09-09 전 앱 표준이 되면서,
스플래시만은 전/후 동일이 아니라 **표준에 맞춰 바꾼다**:

| | 현재 | 표준 |
|---|---|---|
| id·구조 | `#bootSplash` | `#splash > .logo/.name/.stagline/.sbar>i` |
| 유지 → 페이드 → 소멸 | 1600 → 470ms (JS 타이머) | 1800 → 500 → 2400ms (**CSS 애니메이션**) |

따라서 대조에서 스플래시 차이가 나오는 것은 **회귀가 아니라 지시된 변경**이며 되돌리지 않는다.
전환 후 판정은 전/후 비교가 아니라 표준 명세 §6의 방법으로 한다.
`boot-splash.js`가 classic `<script src>`여야 한다는 조건(모듈의 defer 회피 + CSP가 인라인 금지)은
표준을 적용하면서도 그대로 지켜야 한다 — **Vite 번들 그래프에 들어가면 안 된다.**
