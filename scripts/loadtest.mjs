#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   포스터 스튜디오 부하테스트 — 라이브 `/generate` 엔드포인트에 실제
   요청을 보내 동시성별 응답시간/실패율/재시도 의심 빈도를 측정한다.
   Bumm님 지시(2026-09-06): 서버 타임아웃이 실제 p95 응답시간보다 30초 이상 여유가 있는지
   판정하기 위한 실측 자료를 만드는 게 목적이다.

   주의: --dry 없이 돌리면 실제 OpenAI 이미지 생성 비용이 나간다
   (장당 약 $0.04). 처음엔 소규모(동시 1개 × 1~2회)로 스크립트 자체가
   제대로 동작하는지 먼저 확인한 뒤 본 테스트(동시성 1/2/3/5 × 5회,
   총 55건 ≈ $2.2)를 진행할 것.

   사용법:
     node scripts/loadtest.mjs --dry   # 헬스체크만, 비용 없음
     node scripts/loadtest.mjs         # 계단식(동시성 1/2/3/5) 부하테스트, 실비용 발생

   ── 지속(연속) 모드 — 2026-09-10 추가 ──────────────────────────────
     node scripts/loadtest.mjs --sustain --dry        # 계획만 출력, 요청 0건
     node scripts/loadtest.mjs --sustain --confirm    # 실제 실행(대표 승인 필수)

   왜 추가했나: 기존 계단식은 동시성이 1/2/3/5뿐이고 총 55건·약 2분이라
   **10분 레이트리밋 버킷 롤오버도, 하루 예산 근처도 밟지 않는다.** 그래서
   이 도구로는 "노트북 20대를 버틴다"고 말할 수 없었다(app.md에 명시).
   지속 모드는 정해진 시간 동안 동시 요청 수를 유지하며 **버킷 경계를 실제로
   넘겨서** 그때 무슨 일이 일어나는지 본다.

   🔴 실행은 대표 승인을 받은 뒤에만 한다 — **두 모드 다 `--confirm` 없이는 안 돈다.**
      실비용이 나가고, 레이트리밋 카운터가 전역 공유라 도는 동안 다른 부스가 429다.

   ── 🔴 이 도구는 왜 남아 있고, 왜 한 번도 안 돌렸나 (2026-09-11) ────
   **부하테스트는 하지 않기로 결정됐다**(대표 2026-09-11). 이유는 돈이 아니라
   **잴 것이 없어서**다 — 아이는 인쇄를 받아야 한 바퀴가 끝나므로 **프린터가 서버
   부하의 상한을 정하고**, 참가자 전원이 재생성을 한 번씩 더 눌러도 서버는
   **IP 한도의 13%**를 넘지 못한다. 게다가 실제 최대 동시 처리(가동 노트북 4대 = 4건)보다
   큰 **동시성 5를 2026-09-06에 이미 실측**했고, 지금 타임아웃 120초 기준 여유가 60.6초다.
   경위와 숫자는 `_docs/intents/2026-09-11-loadtest-3ip/intent.md`(status: dropped).

   **그런데 도구는 지웠다가 다시 만들 이유가 없어 남긴다**(대표: "있어도 문제없으면 있읍시다").
   전제가 바뀌면 그때 쓴다. 예를 들어:
     - 프린터가 늘어 인쇄가 병목이 아니게 될 때
     - 노트북·부스가 크게 늘 때
     - 공인 IP 개수가 바뀌어 `IP_RATE_LIMIT_MAX`를 재산정할 때
   그때도 **먼저 `--dry`로 계획만 보고**, 대표 승인을 받은 뒤 `--confirm`을 붙인다.
   ──────────────────────────────────────────────────────────────────── */
/* 전환 1단계(2026-09-09) 재구조화로 public/constants.js -> src/constants.ts로 옮겨졌다.
   .ts를 그대로 import하는 건 Node의 타입 스트리핑에 기댄다(Node 22.6+ 플래그, 23+ 기본).
   이 스크립트는 CI가 아니라 사람이 로컬에서 돌리는 도구라 이 전제로 충분하다.
   ※ 1단계 때 이 경로를 안 고쳐서 스크립트가 계속 깨져 있었다 — app.md의
     '파일을 옮기고 스크립트의 경로를 잊는다'가 또 재발한 것이다. */
import { API_BASE, BOOTH_TOKEN } from '../src/constants.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');
const SUSTAIN = process.argv.includes('--sustain');
const CONFIRMED = process.argv.includes('--confirm');

/** `--이름 값` 형태의 인자를 숫자로 읽는다. 없으면 fallback. */
function numArg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v) || v < 0) {
    console.error(`--${name} 값이 숫자가 아닙니다: ${process.argv[i + 1]}`);
    process.exit(1);
  }
  return v;
}
const SAMPLE_PHOTO_PATH = path.join(__dirname, 'sample-photo.jpg');
const CONCURRENCY_LEVELS = [1, 2, 3, 5];
const REPEATS_PER_LEVEL = 5;
// functions/index.js의 OpenAI 클라이언트 timeout(OPENAI_TIMEOUT_MS)과 같아야 아래 결론이 유효하다.
// 2026-09-06에 90초 → 120초로 올렸는데 이 스크립트가 90_000으로 남아 있어서(8차 감사 발견)
// 다시 돌렸다면 여유폭을 30초 과소평가할 뻔했다 — 서버 값을 바꿀 때 여기도 같이 고칠 것.
const SERVER_TIMEOUT_MS = 120_000;
const REQUIRED_MARGIN_SEC = 30; // Bumm님이 요구한 여유 기준

// 서버 내부 재시도(editWithRetry, OpenAI 429/5xx 시 최대 4회 backoff)는
// 이 스크립트(클라이언트)에서 직접 관측할 방법이 없다(Cloud Logging의
// `[retry]` 로그를 봐야 확실함) — 응답이 정상 완료됐는데도 이례적으로
// 오래 걸렸다면 내부 재시도가 있었을 가능성이 높다는 걸 근사치로 잡는다.
// 기준값(55초)은 정상 1회 생성 소요시간(README/CLAUDE.md 실측 기준 약
// 25~50초)보다 확실히 위, 90초 타임아웃보다는 아래로 잡은 값이다.
const RETRY_SUSPECT_THRESHOLD_SEC = 55;

/* ── 지속 모드 설정 ──────────────────────────────────────────────────
   아래 세 값은 functions/index.js의 상수와 **같아야** 결론이 유효하다.
   서버 값을 바꾸면 여기도 같이 고칠 것(app.md의 '상수를 바꿀 때 인용하는
   문서·스크립트를 같이 grep한다'). */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 서버의 10분 버킷
const SERVER_RATE_LIMIT_MAX = 150; // 전역 한도(10분당)
const SERVER_IP_RATE_LIMIT_MAX = 50; // IP별 한도(10분당)

const SUSTAIN_CONCURRENCY = 20;
const SUSTAIN_MINUTES = 30;
/* 🔴 이 도구는 노트북 한 대에서 돈다 = 공인 IP 하나다. 그래서 실제로 걸리는
   상한은 전역 150이 아니라 **IP별 50(10분당)**이다. 그 위로 밀어붙이면 측정되는
   것은 "20대를 버티는가"가 아니라 "IP 한도가 잘 막는가"가 된다 — 둘 다 볼 가치가
   있지만 같은 것이 아니므로 갈라 놓는다.
     기본값(--rate 미지정): 10분당 48건. IP 한도 50 바로 아래라 429 없이
       "지속 상태의 응답시간"을 잰다. 30분이면 약 144건 ≈ $5.76.
     --rate 0: 상한 없이 동시성을 그대로 밀어붙인다. 429가 대량으로 나오는 것이
       정상이며, 그때의 거부 동작·임시파일 정리·복구를 보는 용도다. */
const SUSTAIN_DEFAULT_RATE_PER_WINDOW = 48;
/* 어떤 경우에도 이 건수를 넘기면 멈춘다 — 계산이 틀렸을 때 지갑을 지키는 마지막 줄. */
const SUSTAIN_HARD_MAX_REQUESTS = 400;

async function healthCheck() {
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/health`);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ms: Date.now() - t0, body };
}

let cachedBasePhoto = null;
async function makeUniquePhotoBuffer() {
  // 서버(functions/index.js의 checkPhotoGenerationLimit)가 사진의 SHA-256 해시별로
  // 생성 횟수를 최대 2회로 강제한다 — 부하테스트가 같은 파일을 그대로 반복 전송하면
  // 3번째 요청부터는 전부 즉시 429(사진별 한도)로 막혀 정상 생성 시간을 측정할 수
  // 없다(실제로 겪음). JPEG EOI 마커(FF D9) 뒤에 임의 바이트를 덧붙이면 디코더가
  // 읽는 실제 이미지 데이터는 그대로 유지되면서 파일 해시만 매번 달라진다.
  if (!cachedBasePhoto) cachedBasePhoto = await fs.readFile(SAMPLE_PHOTO_PATH);
  const suffix = Buffer.from(Array.from({ length: 8 }, () => Math.floor(Math.random() * 256)));
  return Buffer.concat([cachedBasePhoto, suffix]);
}

async function oneGenerateRequest() {
  const photoBuf = await makeUniquePhotoBuffer();
  const form = new FormData();
  form.append('photo', new Blob([photoBuf], { type: 'image/jpeg' }), 'sample.jpg');
  form.append('movieTitle', '부하테스트');
  form.append('tagline', '');
  form.append('genre', 'animation');
  form.append('mode', 'solo');

  const t0 = Date.now();
  let status = 0, imageBytes = 0, error = null, seconds = null;
  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'x-booth-token': BOOTH_TOKEN },
      body: form
    });
    status = res.status;
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.images)) {
      imageBytes = data.images.reduce((sum, img) => sum + Buffer.byteLength((img.split(',')[1] || ''), 'base64'), 0);
      seconds = typeof data.meta?.seconds === 'number' ? data.meta.seconds : null;
    } else {
      error = data.error || `HTTP ${status}`;
    }
  } catch (e) {
    error = e.message;
  }
  return { status, ms: Date.now() - t0, imageBytes, error, seconds };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function runConcurrencyLevel(level) {
  const results = [];
  for (let rep = 0; rep < REPEATS_PER_LEVEL; rep++) {
    const batch = await Promise.all(Array.from({ length: level }, oneGenerateRequest));
    results.push(...batch);
  }

  const durations = results.map((r) => r.ms);
  const fails = results.filter((r) => r.error || r.status >= 400);
  const count429 = results.filter((r) => r.status === 429).length;
  const count5xx = results.filter((r) => r.status >= 500).length;
  const suspectedServerRetries = results.filter(
    (r) => !r.error && typeof r.seconds === 'number' && r.seconds > RETRY_SUSPECT_THRESHOLD_SEC
  ).length;
  const successResults = results.filter((r) => !r.error);
  const avgImageBytes = successResults.length
    ? Math.round(successResults.reduce((s, r) => s + r.imageBytes, 0) / successResults.length)
    : 0;

  return {
    concurrency: level,
    totalRequests: results.length,
    successCount: results.length - fails.length,
    failCount: fails.length,
    failRatePct: +((fails.length / results.length) * 100).toFixed(1),
    count429,
    count5xx,
    suspectedServerRetries,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    avgImageBytes,
    raw: results
  };
}

/* ── 지속(연속) 모드 ────────────────────────────────────────────────
   동시 요청 수를 정해진 시간 동안 **유지**한다. 계단식과 달리 한 배치가 끝나길
   기다리지 않고, 일꾼 하나가 끝나면 바로 다음 요청을 집는다 — 그래야 실제
   행사장처럼 "쉬는 틈 없이 들어오는" 상태가 된다. */
async function runSustained({ concurrency, minutes, ratePerWindow, maxRequests }) {
  const startedAt = Date.now();
  const endAt = startedAt + minutes * 60 * 1000;
  const results = [];
  let issued = 0;
  let stoppedBy = '시간 종료';

  // 이번 10분 버킷에서 몇 건을 보냈는지 — ratePerWindow가 0이면 상한 없음.
  const bucketOf = (t) => Math.floor(t / RATE_LIMIT_WINDOW_MS);
  let currentBucket = bucketOf(startedAt);
  let sentInBucket = 0;

  /** 다음 요청을 보내도 되는지 판정하고, 보내야 하면 예약(카운트)한다. */
  const claimSlot = () => {
    const now = Date.now();
    if (now >= endAt) return { go: false, reason: '시간 종료' };
    if (issued >= maxRequests) return { go: false, reason: `상한 ${maxRequests}건 도달` };
    const b = bucketOf(now);
    if (b !== currentBucket) {
      currentBucket = b;
      sentInBucket = 0;
      console.log(`  [${((now - startedAt) / 1000 / 60).toFixed(1)}분] 10분 버킷이 넘어갔습니다 — 카운터 초기화 지점`);
    }
    if (ratePerWindow > 0 && sentInBucket >= ratePerWindow) {
      return { go: false, reason: '버킷 대기', wait: (currentBucket + 1) * RATE_LIMIT_WINDOW_MS - now };
    }
    sentInBucket++;
    issued++;
    return { go: true, bucket: b };
  };

  const worker = async () => {
    for (;;) {
      const slot = claimSlot();
      if (!slot.go) {
        if (slot.reason === '버킷 대기') {
          // 다음 버킷까지 기다린다(종료 시각을 넘기면 그냥 끝낸다).
          const wait = Math.min(slot.wait, endAt - Date.now());
          if (wait <= 0) return;
          await sleep(wait + 250);
          continue;
        }
        if (slot.reason !== '시간 종료') stoppedBy = slot.reason;
        return;
      }
      const r = await oneGenerateRequest();
      results.push({ ...r, at: Date.now() - startedAt, bucket: slot.bucket });
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { results, startedAt, elapsedMs: Date.now() - startedAt, stoppedBy };
}

function summarizeSustained({ results, elapsedMs, stoppedBy }) {
  const durations = results.map((r) => r.ms);
  const buckets = [...new Set(results.map((r) => r.bucket))].sort((a, b) => a - b);
  const perBucket = buckets.map((b, i) => {
    const rows = results.filter((r) => r.bucket === b);
    return {
      '버킷': `#${i + 1}`,
      '요청': rows.length,
      '성공': rows.filter((r) => !r.error && r.status < 400).length,
      '429': rows.filter((r) => r.status === 429).length,
      '5xx': rows.filter((r) => r.status >= 500).length,
      'p95(ms)': percentile(rows.map((r) => r.ms), 95)
    };
  });
  return {
    총요청: results.length,
    성공: results.filter((r) => !r.error && r.status < 400).length,
    '429': results.filter((r) => r.status === 429).length,
    '5xx': results.filter((r) => r.status >= 500).length,
    네트워크오류: results.filter((r) => r.error && !r.status).length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    경과분: +(elapsedMs / 60000).toFixed(1),
    종료사유: stoppedBy,
    perBucket
  };
}

async function sustainMain() {
  const concurrency = numArg('concurrency', SUSTAIN_CONCURRENCY);
  const minutes = numArg('minutes', SUSTAIN_MINUTES);
  const ratePerWindow = numArg('rate', SUSTAIN_DEFAULT_RATE_PER_WINDOW);
  const windows = Math.max(1, Math.ceil((minutes * 60 * 1000) / RATE_LIMIT_WINDOW_MS));
  const plannedByRate = ratePerWindow > 0 ? ratePerWindow * windows : Infinity;
  const maxRequests = Math.min(numArg('max-requests', SUSTAIN_HARD_MAX_REQUESTS), plannedByRate);

  console.log('\n=== 지속(연속) 모드 계획 ===');
  console.log(`  동시 요청 유지: ${concurrency}건`);
  console.log(`  지속 시간: ${minutes}분 (10분 버킷 ${windows}개를 지남 — 롤오버를 실제로 밟는다)`);
  console.log(
    ratePerWindow > 0
      ? `  10분당 상한: ${ratePerWindow}건  ← IP별 한도 ${SERVER_IP_RATE_LIMIT_MAX} 바로 아래로 잡아, 429가 아니라 '지속 상태의 응답시간'을 잰다`
      : `  10분당 상한: 없음(--rate 0)  ← IP 한도 ${SERVER_IP_RATE_LIMIT_MAX}를 넘겨 429를 대량으로 유발한다. 성능이 아니라 '거부가 제대로 도는가'를 보는 모드다`
  );
  console.log(`  최대 요청: ${maxRequests}건 (하드 상한 ${SUSTAIN_HARD_MAX_REQUESTS}건)`);
  console.log(`  예상 실비용: 최대 약 $${(maxRequests * 0.04).toFixed(2)}`);
  console.log(
    `  참고: 서버 전역 한도 ${SERVER_RATE_LIMIT_MAX}건/10분, IP별 ${SERVER_IP_RATE_LIMIT_MAX}건/10분. ` +
      `이 도구는 노트북 한 대(=공인 IP 하나)에서 돌므로 실제로 걸리는 상한은 IP별 쪽이다.`
  );

  if (DRY) {
    console.log('\n--dry 모드: 계획만 출력했습니다. 생성 요청은 하나도 보내지 않았고, 비용도 발생하지 않았습니다.');
    return;
  }
  if (!CONFIRMED) {
    console.error(
      '\n🔴 중단합니다 — 지속 모드는 `--confirm` 없이는 실행하지 않습니다.\n' +
        '   실비용이 나가고, 레이트리밋 카운터가 전역 공유라 도는 동안 다른 부스가 429가 됩니다.\n' +
        '   대표 승인을 받은 뒤 `--sustain --confirm`으로 실행하세요.'
    );
    process.exitCode = 1;
    return;
  }

  console.log('\n⚠️ 실제 생성 요청을 시작합니다.\n');
  const run = await runSustained({ concurrency, minutes, ratePerWindow, maxRequests });
  const s = summarizeSustained(run);

  console.log('\n=== 지속 모드 결과 ===');
  console.log(
    `  총 ${s.총요청}건 / 성공 ${s.성공} / 429 ${s['429']} / 5xx ${s['5xx']} / 네트워크오류 ${s.네트워크오류}` +
      `  · p50=${s.p50Ms}ms p95=${s.p95Ms}ms · ${s.경과분}분 · 종료: ${s.종료사유}`
  );
  console.log('\n10분 버킷별:');
  console.table(s.perBucket);
  console.log(`\n실제 지출 추정: 약 $${(s.성공 * 0.04).toFixed(2)} (성공 건수 기준 — 429는 과금되지 않는다)`);

  const outPath = path.join(__dirname, 'loadtest-sustained-result.json');
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apiBase: API_BASE,
        mode: 'sustained',
        concurrency,
        minutes,
        ratePerWindow,
        maxRequests,
        serverRateLimitMax: SERVER_RATE_LIMIT_MAX,
        serverIpRateLimitMax: SERVER_IP_RATE_LIMIT_MAX,
        rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
        summary: s,
        raw: run.results
      },
      null,
      2
    )
  );
  console.log(`결과 저장: ${outPath}`);
}

async function main() {
  console.log(`대상 서버: ${API_BASE}`);
  const health = await healthCheck();
  console.log(`헬스체크: ${health.ms}ms, ${JSON.stringify(health.body)}`);
  if (!health.ok) {
    console.error('헬스체크 실패 — 부하테스트를 중단합니다.');
    process.exitCode = 1;
    return;
  }

  if (SUSTAIN) return sustainMain();

  if (DRY) {
    console.log('\n--dry 모드: 헬스체크만 수행했습니다. 실제 생성 요청은 하나도 보내지 않았고, 비용도 발생하지 않았습니다.');
    return;
  }

  const totalRequests = CONCURRENCY_LEVELS.reduce((s, c) => s + c * REPEATS_PER_LEVEL, 0);
  console.log(
    `\n⚠️ 계단식 부하테스트 — 동시성 ${CONCURRENCY_LEVELS.join('/')} × 반복 ${REPEATS_PER_LEVEL}회 = 총 ${totalRequests}건, 예상 실비용 약 $${(totalRequests * 0.04).toFixed(2)}`
  );

  /* 🔴 2026-09-11 추가: 이 모드도 `--confirm`을 받게 했다.
     예전에는 인자 없이 부르면 그 자리에서 55건($2.2)이 나갔다 — 실제로 2026-09-06에
     `--dry` 없이 그대로 돌아갈 뻔한 사고가 있었고, 서버의 사진별 한도가 우연히 막아
     2건에서 멈췄다. "먼저 --dry로 돌린다"는 사람의 약속이지 게이트가 아니다.
     부하테스트를 안 하기로 한 지금(2026-09-11 대표 결정), 이 도구는 남아 있되
     **실수로는 절대 안 돌아가야** 한다. */
  if (!CONFIRMED) {
    console.error(
      '\n🔴 중단합니다 — 실제 요청을 보내려면 `--confirm`이 필요합니다.\n' +
        '   비용 없이 확인만 하려면: node scripts/loadtest.mjs --dry\n' +
        '   실행은 대표 승인 사항입니다(`.claude/rules/app.md`).'
    );
    process.exitCode = 1;
    return;
  }
  console.log('');

  const summary = [];
  for (const level of CONCURRENCY_LEVELS) {
    console.log(`동시성 ${level} 테스트 중...`);
    const result = await runConcurrencyLevel(level);
    summary.push(result);
    console.log(
      `  → 성공 ${result.successCount}/${result.totalRequests}, p50=${result.p50Ms}ms, p95=${result.p95Ms}ms, 429=${result.count429}건, 5xx=${result.count5xx}건`
    );
  }

  console.log('\n=== 결과 요약 ===');
  console.table(
    summary.map((s) => ({
      동시성: s.concurrency,
      총요청: s.totalRequests,
      성공: s.successCount,
      실패율: `${s.failRatePct}%`,
      'p50(ms)': s.p50Ms,
      'p95(ms)': s.p95Ms,
      '429건': s.count429,
      '5xx건': s.count5xx,
      서버재시도의심: s.suspectedServerRetries,
      '평균이미지(KB)': Math.round(s.avgImageBytes / 1024)
    }))
  );

  const overallP95Ms = Math.max(...summary.map((s) => s.p95Ms));
  const marginSec = (SERVER_TIMEOUT_MS - overallP95Ms) / 1000;
  const verdict =
    marginSec >= REQUIRED_MARGIN_SEC
      ? `✅ 결론: 서버 타임아웃(${SERVER_TIMEOUT_MS / 1000}초)이 실측 전체 p95(${(overallP95Ms / 1000).toFixed(1)}초)보다 ${marginSec.toFixed(1)}초 여유가 있어, 요구 기준(${REQUIRED_MARGIN_SEC}초 이상)을 충족합니다.`
      : `⚠️ 결론: 서버 타임아웃(${SERVER_TIMEOUT_MS / 1000}초)과 실측 전체 p95(${(overallP95Ms / 1000).toFixed(1)}초)의 여유가 ${marginSec.toFixed(1)}초로, 요구 기준(${REQUIRED_MARGIN_SEC}초 이상)에 못 미칩니다.`;
  console.log(`\n${verdict}`);

  const output = {
    generatedAt: new Date().toISOString(),
    apiBase: API_BASE,
    concurrencyLevels: CONCURRENCY_LEVELS,
    repeatsPerLevel: REPEATS_PER_LEVEL,
    serverTimeoutMs: SERVER_TIMEOUT_MS,
    requiredMarginSec: REQUIRED_MARGIN_SEC,
    overallP95Ms,
    marginSec: +marginSec.toFixed(1),
    verdict,
    summary
  };
  const outPath = path.join(__dirname, 'loadtest-result.json');
  await fs.writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`\n결과 저장: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
