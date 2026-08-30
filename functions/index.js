import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import express from 'express';
import Busboy from 'busboy';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { toFile } from 'openai';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/* 5차 감사 후속조치(2026-08-30, 대표 승인) — 레이트리밋/재생성한도가 인스턴스별
   메모리(Map)에만 있어서 인스턴스가 여러 개로 늘어나면(maxInstances 상향) 사실상
   전역 강제가 안 됐다. Firestore에 "순수 숫자 카운터"만 저장해 인스턴스 전체에
   걸쳐 진짜로 강제한다 — 사진·이름 등 개인정보는 여기 전혀 안 들어간다(사진의
   SHA-256 해시값과 정수 카운트뿐). 클라이언트가 Firestore에 직접 접근하는 경로가
   없으므로(Admin SDK로 서버 안에서만 접근) 별도 보안 규칙이 필요 없다. */
initializeApp();
const db = getFirestore();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
// 부스 공유 토큰 — curl 등 브라우저 Origin 헤더 없는 요청이 CORS를 그냥 지나쳐
// /generate에 바로 도달하는 걸 막기 위한 최소한의 문지기. 정적 사이트라 클라이언트
// 코드(public/app.js)에 이 값이 그대로 노출되므로 "진짜 비밀"은 아니고, 자동화
// 스크립트가 소스를 안 보고 URL만 찔러보는 가장 흔한 형태를 막는 용도다.
const BOOTH_TOKEN = defineSecret('BOOTH_TOKEN');

/* ──────────────────────────────────────────────────────────
   운영 설정 (행사 상황에 맞춰 조절 — Firebase Functions 환경변수로 주입)
   - QUALITY    : 'low' | 'medium' | 'high'  (high=가장 예쁨/느림/비쌈, medium 권장)
   - ART_SIZE   : 포스터 원본 비율 (1024x1536 = 세로 2:3, 영화 포스터 표준)
   - VARIANTS   : 한 번에 만들 'AI 그림' 장수 (1 권장. 2로 올리면 더 다양하지만 2배 비쌈/느림)
   ────────────────────────────────────────────────────────── */
const QUALITY = process.env.IMAGE_QUALITY || 'medium';
const ART_SIZE = process.env.IMAGE_SIZE || '1024x1536';
const VARIANTS = Math.max(1, Math.min(2, parseInt(process.env.VARIANTS || '1', 10)));
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-2';
const INPUT_FIDELITY = (process.env.INPUT_FIDELITY || 'high').toLowerCase();

// 원본(server.js)의 노트북 상주 서버와 달리, Functions 인스턴스는 파일시스템이 읽기전용이라
// 업로드는 반드시 /tmp(os.tmpdir()) 아래에만 써야 한다.
const UPLOAD_DIR = path.join(os.tmpdir(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

/* Cloud Functions(v2)는 핸들러를 부르기 전에 요청 본문을 전부 읽어 req.rawBody(Buffer)로
   채워두고, 원본 req 스트림은 이미 끝난 상태로 넘어온다. multer는 req 스트림에서 직접
   읽으려 하므로 이 환경에서는 매번 "Unexpected end of form"으로 실패한다 — 그래서 req.rawBody를
   busboy에 직접 흘려보내는 방식으로 대체한다. */
function parseMultipart(req, res, next) {
  if (!/^multipart\/form-data/i.test(req.headers['content-type'] || '')) return next();
  if (!req.rawBody) return next(new Error('요청 본문을 읽을 수 없습니다.'));

  let busboy;
  try {
    // files:1 — 'photo' 파트가 두 개 이상 와도 두 번째부터는 busboy가 즉시 스트림을
    // 비워버리고 'file' 이벤트 자체를 안 준다. 이게 없으면 아래 fileInfo/pendingWrite
    // 변수 하나를 여러 파일이 공유하다가 어느 파일이 최종 채택될지 불확정해지고,
    // 채택 안 된 쪽은 삭제 코드가 못 건드려 /tmp에 영구히 남는다.
    busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
  } catch (err) {
    return next(err);
  }

  req.body = {};
  let fileInfo = null;
  let error = null;
  let pendingWrite = null;
  let busboyDone = false;
  let finished = false;

  // 여기서 next()/next(err)로 나가는 모든 경로가 반드시 이 함수를 거치게 해서,
  // 이미 디스크에 쓴 임시 사진이 에러 경로에서 안 지워지고 남는 일이 없게 한다.
  const finish = (err) => {
    if (finished) return;
    finished = true;
    if (err) {
      if (fileInfo) fs.unlink(fileInfo.path, () => {});
      return next(err);
    }
    req.file = fileInfo;
    next();
  };

  const maybeFinish = () => {
    if (!busboyDone || pendingWrite) return;
    finish(error || null);
  };

  busboy.on('field', (name, value) => {
    req.body[name] = value;
  });

  busboy.on('file', (name, stream, info) => {
    const { mimeType } = info;
    if (name !== 'photo' || !/^image\/(png|jpe?g|webp)$/i.test(mimeType || '')) {
      error = error || new Error('이미지 파일만 업로드할 수 있습니다.');
      stream.resume();
      return;
    }
    const tmpPath = path.join(UPLOAD_DIR, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
    const out = fs.createWriteStream(tmpPath);
    pendingWrite = new Promise((resolve) => out.on('close', resolve));
    stream.pipe(out);
    stream.on('limit', () => {
      error = Object.assign(new Error('사진 파일이 너무 큽니다(최대 12MB).'), { code: 'LIMIT_FILE_SIZE' });
    });
    pendingWrite.then(() => {
      pendingWrite = null;
      // busboy가 쓰기 도중 'error'를 내서 finish()가 이미 먼저 끝난 경우
      // (아래 finished 플래그) — 이 파일은 아무도 안 지워줄 뻔했으니 바로 삭제.
      if (finished) return fs.unlink(tmpPath, () => {});
      fileInfo = { path: tmpPath, mimetype: mimeType };
      maybeFinish();
    });
  });

  busboy.on('error', (err) => finish(err));
  busboy.on('finish', () => {
    busboyDone = true;
    maybeFinish();
  });

  busboy.end(req.rawBody);
}

let _client = null;
function getClient() {
  if (!_client)
    _client = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
      timeout: 90_000,
      maxRetries: 0
    });
  return _client;
}

const app = express();

/* 장르별 '그림 컨셉' 프롬프트.
   공통 규칙: 글자/문자 절대 금지(한글은 브라우저 캔버스가 입힘), 세로 영화 포스터,
   하단 1/3은 어둡고 단순하게 비워서 제목 자리 확보, 아이 얼굴은 알아볼 수 있게 유지. */
const genrePrompts = {
  animation:
    'a premium 3D animated feature-film poster key art in the polished style of a major animation studio, the subject as a cheerful heroic main character, warm cinematic rim lighting, vibrant but tasteful color palette, soft depth of field, sense of wonder and adventure',
  fantasy:
    'an epic fantasy adventure movie poster key art, the subject as a young hero of legend, magical glowing particles, enchanted painterly atmosphere, dramatic golden-hour light, sweeping mythical landscape, rich saturated jewel tones',
  sf: 'a sleek science-fiction blockbuster movie poster key art, the subject as a brave young space explorer, futuristic suit, glowing holographic interfaces, distant planets and starfield, cinematic teal-and-orange grade, lens flares',
  hero: 'a dynamic superhero blockbuster movie poster key art, the subject as a courageous young hero in a heroic pose, dramatic backlight, city skyline at dusk, comic-cinematic energy, bold confident composition',
  mystery:
    'a stylish mystery-adventure movie poster key art, the subject as a clever young detective, moody cinematic lighting, fog and warm street lamps, intriguing but child-friendly noir atmosphere, elegant muted palette',
  director:
    'a heartfelt movie-about-movies poster key art, the subject as a passionate young film director holding a camera, glowing stage and studio lights, film reels and clapperboard motifs, warm nostalgic cinematic mood',
  sports:
    'an inspiring sports movie poster key art, the subject as a determined young athlete mid-motion, dramatic stadium lights, dust and energy, triumphant golden cinematic glow, sense of teamwork and growth',
  music:
    'a vibrant music movie poster key art, the subject as a radiant young performer on a glowing stage, colorful concert lighting, bokeh light beams, joyful uplifting festival atmosphere'
};

/* 학생이 입력한 제목/문구는 프롬프트 문자열 안에 큰따옴표로 감싸 그대로 삽입된다
   (buildPrompt 참고). 줄바꿈이나 큰따옴표를 그대로 두면 그 따옴표 경계를 깨고
   뒤에 이어지는 안전 지시문("절대 글자 넣지 마라" 등)을 무력화하는 문장을 끼워
   넣을 수 있으므로, 여기서 미리 없앤다. */
function sanitizePromptField(value, maxLen) {
  return (value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/["“”]/g, '')
    .trim()
    .slice(0, maxLen);
}

function buildPrompt({ genre, mode, title, tagline }) {
  const base = genrePrompts[genre] || genrePrompts.animation;
  const ensemble =
    mode === 'group'
      ? 'Treat the people in the photo as an ENSEMBLE CAST of co-stars standing together as a team, all of them transformed into the same heroic poster style.'
      : 'Treat the person in the photo as the single lead star (hero portrait), centered and prominent.';
  const concept =
    title || tagline
      ? `This film is titled "${title || ''}"${tagline ? ` with the tagline "${tagline}"` : ''}. Let the scene's mood, energy and theme clearly reflect that idea (while keeping the chosen genre style), but render absolutely NO text or letters.`
      : '';
  return [
    base + '.',
    'Transform the uploaded photo of real student(s) into this poster, keeping their faces clearly recognizable and friendly but stylized to match the art.',
    ensemble,
    concept,
    'Composition: tall vertical 2:3 movie poster, the subject(s) in the upper two-thirds, FULLY VISIBLE.',
    'Frame with comfortable margin: include the entire head and hair with empty space ABOVE the head; never crop or cut off the top of the head, and keep everyone fully within the frame.',
    'IMPORTANT: keep the BOTTOM THIRD darker, calmer and uncluttered so a title can be placed there later.',
    'Absolutely NO text, NO letters, NO numbers, NO logos, NO watermark anywhere in the image.',
    'Safe, wholesome, child-appropriate. High detail, professional, keepsake quality.'
  ]
    .filter(Boolean)
    .join(' ');
}

/* 이미지 생성 호출.
   - 파라미터 폴백: 일부 모델/SDK가 input_fidelity·quality를 거부하면 빼고 재시도
   - 한도(429)·일시 서버오류(5xx): 잠깐 기다렸다 자동 재시도(여러 인스턴스 동시 실행 대비) */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function editWithRetry(params) {
  const maxRetries = 4;
  for (let attempt = 0; ; attempt++) {
    try {
      return await getClient().images.edit(params);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (retryable && attempt < maxRetries) {
        const waitMs = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 600);
        console.warn(`[retry] ${status} → ${waitMs}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function generateArt(filePath, mimetype, prompt) {
  const mime = /^image\/(png|jpe?g|webp)$/i.test(mimetype || '') ? mimetype : 'image/png';
  const ext = /jpe?g/i.test(mime) ? 'jpg' : /webp/i.test(mime) ? 'webp' : 'png';
  const image = await toFile(fs.createReadStream(filePath), 'photo.' + ext, { type: mime });
  const baseParams = { model: MODEL, image, prompt, size: ART_SIZE, quality: QUALITY, n: VARIANTS };
  const noQuality = { model: MODEL, image, prompt, size: ART_SIZE, n: VARIANTS };
  const tries = [];
  if (INPUT_FIDELITY === 'high') tries.push({ ...baseParams, input_fidelity: 'high' });
  tries.push(baseParams, noQuality);
  let lastErr;
  // 요청마다 항상 가장 좋은 조합(얼굴보존 high)부터 새로 시도한다.
  // (server.js 원본은 이 시작 지점을 프로세스 전역에 기억해뒀는데, 동시 요청이 겹치면
  //  한 요청의 폴백이 이후 모든 요청에 영구히 적용되는 버그가 있었다 — Functions는
  //  인스턴스가 매번 새로 뜨므로 이 최적화 자체가 무의미해 제거했다.)
  for (let i = 0; i < tries.length; i++) {
    try {
      const result = await editWithRetry(tries[i]);
      const imgs = (result.data || []).map((d) => `data:image/png;base64,${d.b64_json}`).filter(Boolean);
      if (imgs.length) return imgs;
      throw new Error('이미지 생성 결과가 비어 있습니다.');
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      const paramRejected =
        err?.status === 400 && /unknown|unsupported|invalid|not (allowed|supported)|input_fidelity|quality/i.test(msg);
      if (paramRejected && i < tries.length - 1) continue;
      throw err;
    }
  }
  throw lastErr;
}

/* 5차 감사 발견: 기존 /health는 "키가 설정돼 있나"만 봐서 OpenAI가 완전히
   다운돼도 ok:true를 반환했다 — 부스 진행자가 가장 안심하면 안 될 순간에
   "정상"이라고 오인시킬 수 있었다. 여기서는 실제 OpenAI 도달성을 확인하되,
   매 /health 호출마다 부르면 낭비이므로 인스턴스 안에서 결과를 잠깐 캐싱한다.
   models.list()는 이미지 생성이 아닌 메타데이터 조회라 토큰/이미지 과금이 없다. */
const OPENAI_HEALTH_CACHE_MS = 60_000;
let openaiHealthCache = { reachable: null, checkedAt: 0 };
async function checkOpenAIReachable() {
  const now = Date.now();
  if (now - openaiHealthCache.checkedAt < OPENAI_HEALTH_CACHE_MS) {
    return openaiHealthCache.reachable;
  }
  try {
    await getClient().models.list();
    openaiHealthCache = { reachable: true, checkedAt: now };
  } catch (err) {
    console.warn('[health] OpenAI 도달 실패:', err?.status || '', err?.message || err);
    openaiHealthCache = { reachable: false, checkedAt: now };
  }
  return openaiHealthCache.reachable;
}

app.get('/health', async (req, res) => {
  const openaiReachable = await checkOpenAIReachable();
  res.json({
    ok: true,
    hasKey: !!OPENAI_API_KEY.value(),
    openaiReachable,
    model: MODEL,
    quality: QUALITY,
    fidelity: INPUT_FIDELITY,
    size: ART_SIZE,
    variants: VARIANTS
  });
});

/* 전역(인스턴스 간 공유) 원자적 증가+한도체크 — Firestore 트랜잭션으로 구현.
   레이트리밋/사진별 생성한도 둘 다 이걸 쓴다. 저장하는 건 컬렉션/문서ID(버킷번호
   또는 사진 SHA-256 해시)와 정수 count뿐 — 개인정보 없음.
   테스트에서는 실제 Firestore 대신 인메모리 가짜 구현을 주입한다(_setCounterImplForTesting) —
   OpenAI 실호출 코드를 테스트 안 하는 것과 같은 이유(실비용은 안 들지만, 매 테스트마다
   진짜 프로젝트의 Firestore를 두드리는 건 zero-dependency 테스트 철학과 안 맞음). */
async function _firestoreIncrementAndCheck(collectionName, docId, limit) {
  const ref = db.collection(collectionName).doc(docId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().count || 0 : 0;
    if (current >= limit) return { allowed: false, count: current };
    tx.set(ref, { count: current + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { allowed: true, count: current + 1 };
  });
}
let _incrementAndCheck = _firestoreIncrementAndCheck;
function _setCounterImplForTesting(fn) {
  _incrementAndCheck = fn || _firestoreIncrementAndCheck;
}

// 노트북/인스턴스 여러 개에 걸쳐 진짜로 전역 강제되는 상한. 2026-08-29엔 인스턴스별
// 메모리 카운터(30/10분)라 maxInstances를 올릴 때마다 실효 상한이 같이 커졌는데
// (25대면 이론상 750/10분), 이제 Firestore로 전역화하면서 "노트북 최대 20대가
// 각자 분당 1건 안팎으로 정상 사용하는 수준"을 기준으로 새로 산정함(20대 × 분당
// 1.5건 ≈ 10분당 150건 — 여유 포함). 진짜 비용 하드캡은 OpenAI 대시보드 월 지출
// 상한이 맡고, 이 값은 "정상 사용은 막지 않으면서 폭주는 끊는" UX 안전장치다.
const RATE_LIMIT_MAX = 150;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
async function rateLimit(req, res, next) {
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  try {
    const { allowed } = await _incrementAndCheck('rateLimitBuckets', String(bucket), RATE_LIMIT_MAX);
    if (!allowed) {
      return res.status(429).json({ error: '지금 여러 부스에서 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.' });
    }
    next();
  } catch (err) {
    // Firestore 장애로 부스 전체가 멈추면 안 되므로 fail-open(레이트리밋 없이 통과) —
    // 진짜 비용 하드캡은 어차피 OpenAI 월 지출 상한이 맡고 있다.
    console.error('[rateLimit] Firestore 오류, fail-open:', err?.message || err);
    next();
  }
}

function checkBoothToken(req, res, next) {
  const expected = Buffer.from(BOOTH_TOKEN.value() || '');
  const provided = Buffer.from(req.headers['x-booth-token'] || '');
  const ok = expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  if (!ok) return res.status(401).json({ error: '인증되지 않은 요청입니다.' });
  next();
}

/* "한 장의 사진당 최초 생성 1회 + 재생성 1회"(대표 확정 정책)를 Firestore로 전역
   강제한다. 2026-08-30 이전엔 인스턴스 로컬 Map이라 다른 인스턴스로 라우팅되면
   카운트가 안 이어지는 한계가 있었는데(5차 감사 발견), Firestore 트랜잭션으로
   바꿔 어느 인스턴스가 처리하든 같은 사진은 진짜로 최대 2번까지만 허용된다. */
const PHOTO_GENERATION_LIMIT = 2;

async function checkPhotoGenerationLimit(req, res, next) {
  if (!req.file) return next(); // 사진이 없으면(400으로 이어짐) 이 체크는 의미 없음
  const hash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
  try {
    const { allowed } = await _incrementAndCheck('photoGenCounts', hash, PHOTO_GENERATION_LIMIT);
    if (!allowed) {
      // 여기서 막으면 이 요청은 아래 /generate 핸들러(임시파일 정리 담당)까지 못 가므로,
      // 여기서 직접 지워야 /tmp에 고아 파일이 안 남는다(2차 감사 때 고친 것과 같은 종류의 버그 재발 방지).
      // await 없이 fs.unlink(콜백)만 쓰면 응답을 먼저 보내버려서, 삭제가 실제로 끝나기 전에
      // 호출부가 "파일이 없어졌다"고 확인하려 하면 타이밍에 따라 실패할 수 있다(CI에서 실제로 발견).
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(429).json({ error: '이 사진으로는 생성 횟수를 모두 사용했어요. 다시 촬영해 주세요.' });
    }
    next();
  } catch (err) {
    console.error('[checkPhotoGenerationLimit] Firestore 오류, fail-open:', err?.message || err);
    next();
  }
}

/* OpenAI 오류를 상태코드·사용자 문구로 매핑한다. 알 수 없는 오류의 원문(raw)은
   OpenAI 내부 구현 세부사항이 그대로 사용자 화면에 노출될 수 있어(4차 감사 🟡)
   절대 클라이언트로 돌려주지 않는다 — 서버 로그(console.error, 호출부)에만 남긴다. */
function mapGenerateError(err) {
  const status = err?.status || err?.response?.status;
  const raw = String(err?.message || '');
  if (status === 429)
    return { status: 429, message: '지금 요청이 몰려 잠시 대기가 필요합니다. 10~20초 후 다시 시도해 주세요.' };
  if (/billing|quota|hard limit/i.test(raw))
    return { status: 500, message: 'OpenAI 크레딧 잔액이 부족합니다. platform.openai.com에서 크레딧을 충전해 주세요.' };
  if (status === 401 || /api key|incorrect key/i.test(raw))
    return { status: 500, message: 'API 키가 올바르지 않습니다. Firebase 시크릿(OPENAI_API_KEY)을 확인해 주세요.' };
  if (/moderation|safety|content policy/i.test(raw))
    return {
      status: 400,
      message: '입력한 제목·문구 또는 사진이 안전 기준에 걸렸어요. 문구를 바꾸거나 다시 촬영해 주세요.'
    };
  if (/timed? ?out|abort/i.test(raw))
    return { status: 504, message: '생성 시간이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해 주세요.' };
  if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(raw))
    return { status: 502, message: '인터넷 연결이 불안정합니다. 와이파이 연결을 확인하고 다시 시도해 주세요.' };
  return { status: 500, message: 'AI 이미지 생성 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
}

app.post('/generate', checkBoothToken, rateLimit, parseMultipart, checkPhotoGenerationLimit, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '사진 파일이 없습니다. 먼저 촬영해 주세요.' });

  const genre = req.body.genre || 'animation';
  const mode = req.body.mode === 'group' ? 'group' : 'solo';
  const title = sanitizePromptField(req.body.movieTitle, 60);
  const tagline = sanitizePromptField(req.body.tagline, 80);
  const prompt = buildPrompt({ genre, mode, title, tagline });

  try {
    const t0 = Date.now();
    const images = await generateArt(req.file.path, req.file.mimetype, prompt);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[generate] 완료 ${sec}초  (모델=${MODEL} · 화질=${QUALITY} · 얼굴보존=${INPUT_FIDELITY})`);
    res.json({ images, meta: { genre, mode, seconds: Number(sec) } });
  } catch (err) {
    console.error('[generate]', err?.status || '', err?.message || err);
    const { status, message } = mapGenerateError(err);
    res.status(status).json({ error: message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// 업로드/기타 오류도 항상 JSON으로 응답(브라우저가 HTML 오류를 받아 이상한 문구가 뜨는 것 방지)
app.use((err, req, res, _next) => {
  console.error('[error]', err?.message || err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '사진 파일이 너무 큽니다(최대 12MB).' });
  }
  res.status(400).json({ error: err?.message || '요청 처리 중 오류가 발생했습니다.' });
});

// GitHub Pages(edutogether.github.io)에서만 호출 가능하도록 CORS 제한.
// 로컬 개발 시에는 5500(Live Server)·8080(firebase serve) 포트도 허용.
// 프로젝트를 옮기거나 배포 도메인이 바뀌면 public/constants.js의 API_BASE와 이 목록을
// 반드시 같이 고칠 것 — 한쪽만 고치면 CORS가 막히거나 엉뚱한 프로젝트를 호출한다.
const ALLOWED_ORIGINS = [
  /^https:\/\/edutogether\.github\.io$/,
  /^http:\/\/localhost:(5500|8080)$/,
  /^http:\/\/127\.0\.0\.1:(5500|8080)$/
];

// 테스트 전용 export. onRequest로 감싸기 전의 순수 함수/미들웨어를 그대로 노출해서,
// 실제 OpenAI 호출(=실비용) 없이 프롬프트 구성·업로드 파싱·레이트리밋을 검증한다.
export {
  app,
  buildPrompt,
  sanitizePromptField,
  parseMultipart,
  UPLOAD_DIR,
  mapGenerateError,
  RATE_LIMIT_MAX,
  checkBoothToken,
  rateLimit,
  checkPhotoGenerationLimit,
  PHOTO_GENERATION_LIMIT,
  _setCounterImplForTesting
};

export const posterStudio = onRequest(
  {
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 120,
    concurrency: 1,
    // 2026-08-29: 노트북 대수 확장 논의(최대 20대 검토) 때문에 5 → 25로 미리 상향.
    // concurrency:1이라 동시 처리 가능 요청 수 = maxInstances 그 자체 — 노트북 수보다
    // 낮으면 나머지는 대기열에 걸리다 timeoutSeconds(120초) 넘어 실패한다. 인스턴스
    // 상한 자체는 비용이 붙지 않는다(실제 생성 건수만 과금) — 진짜 비용 상한은
    // OpenAI 대시보드 월 지출 한도($200)가 맡는다.
    maxInstances: 25,
    secrets: [OPENAI_API_KEY, BOOTH_TOKEN],
    cors: ALLOWED_ORIGINS
  },
  app
);

/* 5차 감사 후속조치(2026-08-30, 대표 승인) — 콜드스타트 완화. minInstances 상시유지는
   월 $71~93로 대표가 명확히 거부했으나("저 돈을 왜 낭비함"), Cloud Scheduler로 몇 분
   간격 핑을 보내 인스턴스를 미리 데워두는 방식은 스케줄러 자체가 사실상 무료다
   (완전한 0→1 콜드스타트 보장은 아니고, 이미 떠있는데 갑자기 몰리는 1→N 스케일업
   콜드스타트는 못 막는다 — 노트북 대수가 적어 영향은 제한적).
   상시 24시간 켜두면 그만큼 인스턴스를 계속 깨워두는 셈이라 minInstances 거부 취지와
   어긋나므로, 행사 당일(2026-11-14) 시간대에만 동작하도록 cron을 제한했다 — 평상시엔
   완전히 비활성.
   URL은 posterStudio 함수 URL과 같은 프로젝트/리전이어야 한다 — 프로젝트 이전 시
   ALLOWED_ORIGINS·API_BASE와 함께 반드시 같이 고칠 것(RUNBOOK.md 참고).

   2026-08-30: 1차 시도는 cloudscheduler.googleapis.com 미활성화로 막혔었고(대표가
   콘솔에서 활성화 완료), 2차 시도에서는 API는 통과했지만 실제 스케줄러 "작업(job)"
   생성/갱신에 필요한 IAM 권한이 CI 배포 계정에 없어서 다시 막힘:
     Request ... jobs/firebase-schedule-keepWarm-asia-northeast3 ...
     lacks IAM permission "cloudscheduler.jobs.update"
   Secret Manager 때(secretAccessor만으로는 부족, viewer도 필요했던 것)와 같은
   패턴 — API 활성화와 그 API 리소스를 실제로 만들 IAM 역할은 별개다.
   github-actions-deploy@inky-poster-studio.iam.gserviceaccount.com 계정(CI 전용
   서비스계정)엔 이 권한이 없지만, 이 저장소를 원래 관리해온 계정(edutogether2015@gmail.com,
   Firestore DB 생성 등에도 써온 계정)으로 로컬에서 직접 배포하면 소유자급 권한이라
   문제없이 배포된다 — 2026-08-30 이렇게 1회성으로 로컬 배포해 스케줄러 작업까지
   정상 생성됨을 확인함. CI(GitHub Actions) 쪽은 여전히 이 권한이 없으므로, 다음에
   keepWarm의 스케줄/설정을 다시 바꿔 재배포해야 할 때는 로컬에서 하거나
   github-actions-deploy 계정에 roles/cloudscheduler.admin을 추가해야 한다. */
export const keepWarm = onSchedule(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 30,
    schedule: '*/5 9-17 14 11 *',
    timeZone: 'Asia/Seoul'
  },
  async () => {
    try {
      const res = await fetch('https://asia-northeast3-inky-poster-studio.cloudfunctions.net/posterStudio/health');
      console.log('[keepWarm] ping', res.status);
    } catch (err) {
      console.warn('[keepWarm] ping 실패:', err?.message || err);
    }
  }
);
