// AI 품질 A/B 시험 — 생성 실행기(QA 전용). 운영 함수 코드의 generateArt를 그대로 불러 같은 파라미터 · 폴백 · 재시도로 부른다.
//
//   node scripts/qa/ai-ab/gen.mjs --module <functions/index.js> --arm <A|B|C|D> --plan <plan.json> --inputs <입력 폴더> --out <출력 폴더>
//        --ledger <ledger.jsonl> --cap <달러> [--concurrency 3] [--global-max N] [--limit N] [--tag 이름]
//        [--dry] [--dry-billing-after N] [--dry-cost 달러] [--dry-ms 최소-최대] [--dry-rate-limit-every N]
//
// - 한 번 실행 = 한 갈래(arm) · 한 모듈(운영 7ad0ad5 또는 후보). 모듈이 import 때 Firebase를 초기화하므로 갈래마다 따로 실행한다.
//   화질(D = high)은 실행 전 환경변수 IMAGE_QUALITY로 정한다 — 운영 코드와 같은 방식.
// - 키는 환경변수 OPENAI_API_KEY_QA로만 받는다(화면 · 파일에 쓰지 않는다). --dry면 키 없이 가짜 클라이언트(회색 그림, 0원).
// - 여러 갈래를 동시에 띄워도(스트레스 시험) ledger 하나를 잠금(ledger.lock 폴더)으로 나눠 쓴다:
//   · 동시에 나가 있는 요청은 모든 실행기를 합쳐 --global-max건을 넘지 않는다(출발 줄 type:'start'를 ledger에 적고 끝 줄과 짝지어 센다).
//   · 상한: «끝난 요청 비용 + 출발했지만 아직 안 끝난 요청 수 × 1회 최대 비용 + 이번 요청의 1회 최대 비용» ≤ --cap일 때만 출발한다.
//     1회 최대 비용 = 같은 화질에서 지금까지 본 최대 비용과 기본 예약액(medium $0.09 · high $0.25) 중 큰 값.
//     자리가 모자라면 기다리고, 나가 있는 요청이 없는데도 모자라면 budget-skip으로 적는다.
//   · 끝 줄이 없는 출발 줄(실행기가 죽은 경우)은 청구됐을 수 있으므로 예산에서 계속 예약해 둔다. 동시 건수에서는 10분 뒤 뺀다.
// - 비용: 응답의 usage(글 · 이미지 입력 토큰, 출력 토큰) × OpenAI 공식 단가.
// - 잔액 · 지출 한도 오류(429 credit_balance_exhausted 등)를 한 번 만나면 그 자리에서 멈춘다(billing-stop): 운영 코드가 429를 다시
//   시도해도 실제 요청은 더 나가지 않고(기록기가 바로 거절), 남은 조건은 부르지 않고 billing-skip으로 적는다. ledger에 billing-stop이
//   있으면 다른 실행기 · 다음 실행도 한 건도 부르지 않는다 — 잔액을 채운 뒤 그 줄을 지우고 다시 돌린다. 종료 코드 3.
// - 속도 한도(429 rate_limit 등, 잔액 오류가 아닌 429)는 운영 코드가 기다렸다 다시 보낸다. 시도마다 기록하고, 끝내 실패하면
//   엔진 실패(error)가 아니라 «OpenAI 한도 관측»(status 'rate-limit')으로 적는다 — 다음 실행이 다시 부른다.
// - 드라이런: --dry-billing-after N(N건 성공 뒤 잔액 오류) · --dry-cost(1건 비용을 흉내 — 상한 확인용) · --dry-ms(가짜 소요 시간) ·
//   --dry-rate-limit-every N(시도 N번마다 속도 한도 429 — 운영 코드의 재시도와 기록을 확인).
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const modulePath = arg('module'), armName = arg('arm'), planPath = arg('plan'), inputs = arg('inputs'), out = arg('out'), ledger = arg('ledger');
const cap = Number(arg('cap', '0')), concurrency = Number(arg('concurrency', '3')), dry = has('dry');
const globalMax = Number(arg('global-max', String(concurrency)));
const tag = arg('tag', null);
const dryBillingAfter = has('dry-billing-after') ? Number(arg('dry-billing-after')) : Infinity;
const dryCost = Number(arg('dry-cost', '0'));
const [dryMsMin, dryMsMax] = arg('dry-ms', '50-50').split('-').map(Number);
const dryRateEvery = Number(arg('dry-rate-limit-every', '0'));
// OpenAI 공식 오류 코드 — 잔액 · 지출 한도는 429로 온다(functions/index.js isBillingError와 같은 판정, 운영 7ad0ad5 모듈에는 없어 여기 둔다)
const BILLING_CODE = /^(insufficient_quota|credit_balance_exhausted|(organization|project)_(spend|usage)_limit_exceeded|billing_hard_limit_reached)$/;
const isBilling = (e) => {
  const codes = [e?.code, e?.type, e?.error?.code, e?.error?.type];
  if (codes.some((v) => typeof v === 'string' && BILLING_CODE.test(v))) return true;
  if (codes.includes('rate_limit_exceeded')) return false;   // 속도 한도 문구의 결제 안내 링크는 잔액 소진이 아니다(서버와 같은 판정, 10/26 독립 리뷰)
  return /billing|quota|hard limit/i.test(String(e?.message || ''));
};
const isRateLimit = (e) => (e?.status ?? e?.response?.status) === 429 && !isBilling(e);
let billingStop = false, dryOk = 0, dryAttempts = 0;
if (!modulePath || !armName || !planPath || !inputs || !out || !ledger || !(cap > 0) || !(globalMax >= 1)) {
  console.error('사용: gen.mjs --module <index.js> --arm <A|B|C|D> --plan <plan.json> --inputs <폴더> --out <폴더> --ledger <jsonl> --cap <달러> [--concurrency 3] [--global-max N] [--dry]');
  process.exit(1);
}
// OpenAI 공식 단가(2026-10-25 확인, developers.openai.com/api/docs/pricing) — 100만 토큰당 달러
const PRICE = {
  'gpt-image-2': { text: 5, image: 8, out: 30 },
  'gpt-image-1.5': { text: 5, image: 8, out: 32 },
};
const QUALITY = process.env.IMAGE_QUALITY === 'high' ? 'high' : 'medium';   // 운영 코드와 같은 환경변수(없으면 medium)
const RESERVE_DEFAULT = { medium: 0.09, high: 0.25 };
const STALE_MS = 10 * 60_000;   // 운영 타임아웃 사슬(최대 150초)보다 훨씬 길다 — 이보다 오래된 출발 줄은 죽은 실행기의 것
const limit = Number(arg('limit', '0'));
const plan = JSON.parse(await fs.readFile(planPath, 'utf8')).filter((c) => c.arm === armName).slice(0, limit > 0 ? limit : undefined);
await fs.mkdir(out, { recursive: true });

const mod = await import(pathToFileURL(path.resolve(modulePath)).href);
const store = new AsyncLocalStorage();
let realClient;
if (!dry) {
  if (!process.env.OPENAI_API_KEY_QA) { console.error('OPENAI_API_KEY_QA가 없다'); process.exit(1); }
  const { default: OpenAI } = await import(pathToFileURL(path.resolve(path.dirname(modulePath), 'node_modules/openai/index.mjs')).href);
  realClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_QA, timeout: 120_000, maxRetries: 0 });   // 운영 getClient()와 같은 값
}
const summarize = (p) => ({ model: p.model, size: p.size, quality: p.quality ?? null, n: p.n, input_fidelity: p.input_fidelity ?? null, promptChars: (p.prompt || '').length });
const fakePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const sleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const recorder = {
  images: {
    edit: async (params, opts) => {
      const ctx = store.getStore();
      const a = { at: new Date().toISOString(), params: summarize(params) };
      if (billingStop) {   // 운영 코드의 429 재시도 — 실제 요청은 보내지 않는다
        a.ms = 0; a.notSent = true; a.error = { status: 429, message: 'billing-stop 뒤라 보내지 않음' }; ctx.attempts.push(a);
        throw Object.assign(new Error('billing-stop 뒤라 보내지 않음'), { status: 429, code: 'credit_balance_exhausted' });
      }
      const t0 = Date.now();
      try {
        let data, request_id;
        if (dry) {
          dryAttempts++;
          await sleep(dryMsMin + Math.random() * (dryMsMax - dryMsMin));
          if (dryOk >= dryBillingAfter) throw Object.assign(new Error('429 Your organization has no prepaid credits remaining.'), { status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota' });
          if (dryRateEvery > 0 && dryAttempts % dryRateEvery === 0) throw Object.assign(new Error('429 Rate limit reached for images per minute (dry)'), { status: 429, code: 'rate_limit_exceeded', type: 'requests' });
          dryOk++;
          const outTok = Math.round((dryCost * 1e6) / PRICE['gpt-image-2'].out);
          data = { data: [{ b64_json: fakePng }], usage: { input_tokens: 0, input_tokens_details: { text_tokens: 0, image_tokens: 0 }, output_tokens: outTok } }; request_id = 'dry';
        }
        else ({ data, request_id } = await realClient.images.edit(params, opts).withResponse());
        a.ms = Date.now() - t0; a.request_id = request_id; a.usage = data.usage ?? null;
        ctx.attempts.push(a);
        return data;
      } catch (e) {
        a.ms = Date.now() - t0;
        a.error = { status: e?.status ?? null, code: e?.code ?? null, type: e?.type ?? null, message: String(e?.message || e).slice(0, 300), request_id: e?.request_id ?? e?.headers?.get?.('x-request-id') ?? null };
        if (isRateLimit(e)) a.rateLimit = true;
        ctx.attempts.push(a);
        if (isBilling(e)) billingStop = true;
        throw e;
      }
    },
  },
  models: { list: async () => (dry ? { data: [] } : realClient.models.list()) },
};
mod._setClientForTesting(recorder);

const costOf = (model, u) => {
  if (!u) return null;
  const pr = PRICE[model] || PRICE['gpt-image-2'];
  const text = u.input_tokens_details?.text_tokens ?? 0, image = u.input_tokens_details?.image_tokens ?? 0, outTok = u.output_tokens ?? 0;
  return (text * pr.text + image * pr.image + outTok * pr.out) / 1e6;
};
const readLedger = async () => {
  try { return (await fs.readFile(ledger, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
};
// ledger 잠금 — mkdir는 프로세스 사이에서도 한 번에 하나만 성공한다. 잠금은 읽고 적는 짧은 순간만 잡는다.
// 윈도에서는 다른 실행기가 잠금 폴더를 지우는 도중(삭제 대기)이면 mkdir · rmdir이 EEXIST가 아니라 EPERM · EACCES · EBUSY를 낸다
// (10/25 동시 12건 첫 회차에 문서 폴더에서 실제로 나 A · B 실행기가 죽었다) — 그때도 «잠시 뒤 다시»로 다룬다.
const lockDir = ledger + '.lock';
const BUSY = new Set(['EEXIST', 'EPERM', 'EACCES', 'EBUSY']);
async function withLock(fn) {
  for (let i = 0; ; i++) {
    try { await fs.mkdir(lockDir); break; } catch (e) {
      if (!BUSY.has(e.code)) throw e;
      if (i % 100 === 99) { const st = await fs.stat(lockDir).catch(() => null); if (st && Date.now() - st.mtimeMs > 30_000) await fs.rmdir(lockDir).catch(() => {}); }
      await sleep(20 + Math.random() * 30);
    }
  }
  try { return await fn(); } finally {
    for (let i = 0; ; i++) {
      try { await fs.rmdir(lockDir); break; } catch (e) {
        if (e.code === 'ENOENT') break;
        if (!BUSY.has(e.code) || i >= 200) throw e;
        await sleep(20);
      }
    }
  }
}
// 출발 줄과 끝 줄을 짝지어 «나가 있는 요청»을 센다
function budgetState(rows) {
  const ended = new Set(rows.filter((r) => r.key && r.type !== 'start').map((r) => r.key));
  const open = rows.filter((r) => r.type === 'start' && !ended.has(r.key));
  const now = Date.now();
  const fresh = open.filter((r) => now - Date.parse(r.at) < STALE_MS);
  // 응답(usage)을 못 받은 실패 줄은 청구됐는지 모른다 — 상한 계산에서는 그 요청의 예약액을 쓴 것으로 센다(10/26 독립 리뷰)
  const reserveOf = new Map(rows.filter((r) => r.type === 'start').map((r) => [r.key, r.reserve]));
  const unknownCost = (r) => r.key && r.status !== 'ok' && !(r.cost > 0) && reserveOf.has(r.key);
  const spent = rows.reduce((s, r) => s + (r.type === 'start' ? 0 : unknownCost(r) ? reserveOf.get(r.key) : r.cost || 0), 0);
  const reserved = open.reduce((s, r) => s + r.reserve, 0);
  return { spent, reserved, open, fresh };
}
const reserveFor = (rows) => Math.max(RESERVE_DEFAULT[QUALITY], ...rows.filter((r) => r.status === 'ok' && (r.quality || 'medium') === QUALITY).map((r) => r.cost || 0));

const queue = [...plan];
const results = [];
async function runOne(c) {
  let key, reserve, verdict;
  for (;;) {
    verdict = await withLock(async () => {
      const rows = await readLedger();
      const done = rows.find((r) => r.caseId === c.caseId && r.arm === c.arm && r.status === 'ok');
      if (done) return { kind: 'done', row: done };
      if (billingStop || rows.some((r) => r.status === 'billing-stop')) {
        billingStop = true;
        const r = { caseId: c.caseId, arm: c.arm, status: 'billing-skip', at: new Date().toISOString(), tag };
        await fs.appendFile(ledger, JSON.stringify(r) + '\n'); return { kind: 'skip', row: r };
      }
      const st = budgetState(rows);
      reserve = reserveFor(rows);
      if (st.fresh.length >= globalMax) return { kind: 'wait' };
      if (st.spent + st.reserved + reserve > cap) {
        if (st.fresh.length) return { kind: 'wait' };   // 나가 있는 요청이 끝나면 예약이 실제 비용으로 줄어 자리가 날 수 있다
        const r = { caseId: c.caseId, arm: c.arm, status: 'budget-skip', spentBefore: Number(st.spent.toFixed(4)), reservedOpen: Number(st.reserved.toFixed(4)), reserve, cap, at: new Date().toISOString(), tag };
        await fs.appendFile(ledger, JSON.stringify(r) + '\n'); return { kind: 'skip', row: r };
      }
      key = randomUUID();
      await fs.appendFile(ledger, JSON.stringify({ type: 'start', key, caseId: c.caseId, arm: c.arm, reserve, quality: QUALITY, inflightBefore: st.fresh.length, at: new Date().toISOString(), pid: process.pid, tag }) + '\n');
      return { kind: 'go' };
    });
    if (verdict.kind !== 'wait') break;
    await sleep(150 + Math.random() * 250);
  }
  if (verdict.kind === 'done') { results.push({ ...verdict.row, resumed: true }); return; }
  if (verdict.kind === 'skip') { results.push(verdict.row); if (verdict.row.status === 'budget-skip') console.log('예산 정지', c.caseId, c.arm); return; }

  // c.variant(예: 'v1plus')가 있으면 후보 모듈의 장르별 선택표 대신 그 판으로 만든다 — 운영 /generate는 넘기지 않는다
  const prompt = mod.buildPrompt({ genre: c.genre, mode: c.mode, title: mod.sanitizePromptField(c.title, 60), tagline: mod.sanitizePromptField(c.tagline, 80), variant: c.variant });
  const input = path.join(inputs, c.input);
  const ctx = { attempts: [] };
  const t0 = Date.now();
  let status = 'ok', error = null, file = null;
  try {
    const imgs = await store.run(ctx, () => mod.generateArt(input, 'image/jpeg', prompt));
    file = `${c.caseId}-${c.arm}.png`;
    await fs.writeFile(path.join(out, file), Buffer.from(imgs[0].split(',')[1], 'base64'));
  } catch (e) {
    status = isBilling(e) ? 'billing-stop' : isRateLimit(e) ? 'rate-limit' : 'error';
    error = { status: e?.status ?? null, code: e?.code ?? null, type: e?.type ?? null, message: String(e?.message || e).slice(0, 300) };
  }
  const ms = Date.now() - t0;
  const okAttempt = ctx.attempts.find((a) => a.usage);
  const model = okAttempt?.params.model || ctx.attempts[0]?.params.model || 'gpt-image-2';
  const cost = ctx.attempts.reduce((s, a) => s + (costOf(a.params.model, a.usage) || 0), 0);
  const r = { key, caseId: c.caseId, arm: c.arm, photoId: c.photoId, mode: c.mode, genre: c.genre, difficulty: c.difficulty, input: c.input, status, error, file,
    startedAt: new Date(t0).toISOString(), ms, model, quality: okAttempt?.params.quality ?? null,
    promptVersion: mod.promptVersionFor ? mod.promptVersionFor(c.genre, c.mode, c.variant) : mod.PROMPT_VERSION || 'v1', promptChars: prompt.length,
    rateLimitAttempts: ctx.attempts.filter((a) => a.rateLimit).length, attempts: ctx.attempts, cost: Number(cost.toFixed(5)), at: new Date().toISOString(), dry, tag };
  results.push(r);
  await withLock(() => fs.appendFile(ledger, JSON.stringify(r) + '\n'));
  console.log(`${c.caseId} ${c.arm} ${status} ${(ms / 1000).toFixed(1)}s $${cost.toFixed(4)} 시도 ${ctx.attempts.length}${r.rateLimitAttempts ? ' 속도한도 ' + r.rateLimitAttempts : ''}${error ? ' ' + error.message.slice(0, 80) : ''}`);
}
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => { while (queue.length) await runOne(queue.shift()); }));
await fs.writeFile(path.join(out, `run-${armName}${tag ? '-' + tag : ''}.json`), JSON.stringify({ arm: armName, module: modulePath, tag, count: results.length, results }, null, 2));
const total = budgetState(await readLedger()).spent;
console.log(`끝: ${armName} ${results.filter((r) => r.status === 'ok').length}/${plan.length} 성공 · 누적 $${total.toFixed(4)} / 상한 $${cap}`);
if (billingStop) { console.log('잔액 · 지출 한도 오류로 멈춤(billing-stop) — 남은 조건은 부르지 않았다'); process.exit(3); }
process.exit(0);
