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
     node scripts/loadtest.mjs         # 실제 생성 부하테스트, 실비용 발생
   ──────────────────────────────────────────────────────────────────── */
/* 전환 1단계(2026-09-09) 재구조화로 public/constants.js -> src/constants.ts로 옮겨졌다.
   .ts를 그대로 import하는 건 Node의 타입 스트리핑에 기댄다(Node 22.6+ 플래그, 23+ 기본).
   이 스크립트는 CI가 아니라 사람이 로컬에서 돌리는 도구라 이 전제로 충분하다.
   ※ 1단계 때 이 경로를 안 고쳐서 스크립트가 계속 깨져 있었다 — app.md의
     '파일을 옮기고 스크립트의 경로를 잊는다'가 또 재발한 것이다. */
import { API_BASE, BOOTH_TOKEN } from '../src/constants.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');
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

async function main() {
  console.log(`대상 서버: ${API_BASE}`);
  const health = await healthCheck();
  console.log(`헬스체크: ${health.ms}ms, ${JSON.stringify(health.body)}`);
  if (!health.ok) {
    console.error('헬스체크 실패 — 부하테스트를 중단합니다.');
    process.exitCode = 1;
    return;
  }

  if (DRY) {
    console.log('\n--dry 모드: 헬스체크만 수행했습니다. 실제 생성 요청은 하나도 보내지 않았고, 비용도 발생하지 않았습니다.');
    return;
  }

  const totalRequests = CONCURRENCY_LEVELS.reduce((s, c) => s + c * REPEATS_PER_LEVEL, 0);
  console.log(
    `\n⚠️ 실제 생성 요청을 시작합니다 — 동시성 ${CONCURRENCY_LEVELS.join('/')} × 반복 ${REPEATS_PER_LEVEL}회 = 총 ${totalRequests}건, 예상 실비용 약 $${(totalRequests * 0.04).toFixed(2)}\n`
  );

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
