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
/* gpt-image-2는 input_fidelity를 받지 않는다(OpenAI 안내 «늘 높은 충실도라 꺼져 있음») — 예전에는 매 요청 첫 시도가 400으로 거절된 뒤
   그 파라미터를 빼고 다시 보냈다(헛도는 왕복 한 번). 받는 모델(gpt-image-1 · 1.5 계열)에만 붙인다. */
function acceptsInputFidelity(model) {
  return /^gpt-image-1(\.5)?(-|$)/.test(model);
}
/** 한 요청에서 차례로 시도할 파라미터 묶음 — 거절되면 다음 것(빠지는 순서: input_fidelity → quality). */
// /health와 완료 기록에 적는 «실제로 보내는» 얼굴보존 값 — 받지 않는 모델이면 null(환경값을 그대로 적으면 보내지 않는 값을 보낸다고 읽힌다)
const SENT_INPUT_FIDELITY = INPUT_FIDELITY === 'high' && acceptsInputFidelity(MODEL) ? INPUT_FIDELITY : null;
function editAttempts(base, model = MODEL, fidelity = INPUT_FIDELITY) {
  const { quality: _quality, ...noQuality } = base;
  const tries = [];
  if (fidelity === 'high' && acceptsInputFidelity(model)) tries.push({ ...base, input_fidelity: 'high' });
  tries.push(base, noQuality);
  return tries;
}

// 원본(server.js)의 노트북 상주 서버와 달리, Functions 인스턴스는 파일시스템이 읽기전용이라
// 업로드는 반드시 /tmp(os.tmpdir()) 아래에만 써야 한다.
const UPLOAD_DIR = path.join(os.tmpdir(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
// 사진 한 장(최대 12MB)과 짧은 글 필드 몇 개를 담는 요청보다 큰 본문은 파싱하지 않는다.
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 256 * 1024;
const MULTIPART_LIMITS = {
  fileSize: MAX_PHOTO_BYTES,
  files: 1,
  fields: 10,
  fieldSize: 2048,
  fieldNameSize: 64,
  parts: 12
};

/* Cloud Functions(v2)는 핸들러를 부르기 전에 요청 본문을 전부 읽어 req.rawBody(Buffer)로
   채워두고, 원본 req 스트림은 이미 끝난 상태로 넘어온다. multer는 req 스트림에서 직접
   읽으려 하므로 이 환경에서는 매번 "Unexpected end of form"으로 실패한다 — 그래서 req.rawBody를
   busboy에 직접 흘려보내는 방식으로 대체한다. */
function parseMultipart(req, res, next) {
  if (!/^multipart\/form-data/i.test(req.headers['content-type'] || '')) return next();
  if (!req.rawBody) return next(new Error('요청 본문을 읽을 수 없습니다.'));
  if (req.rawBody.length > MAX_REQUEST_BYTES) {
    return next(Object.assign(new Error('사진 파일이 너무 큽니다(최대 12MB).'), { code: 'LIMIT_FILE_SIZE' }));
  }

  let busboy;
  try {
    // files:1 — 'photo' 파트가 두 개 이상 와도 두 번째부터는 busboy가 즉시 스트림을
    // 비워버리고 'file' 이벤트 자체를 안 준다. 이게 없으면 아래 fileInfo/pendingWrite
    // 변수 하나를 여러 파일이 공유하다가 어느 파일이 최종 채택될지 불확정해지고,
    // 채택 안 된 쪽은 삭제 코드가 못 건드려 /tmp에 영구히 남는다.
    busboy = Busboy({ headers: req.headers, limits: MULTIPART_LIMITS });
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
      if (fileInfo)
        return fs.promises
          .unlink(fileInfo.path)
          .catch(() => {})
          .then(() => next(err));
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
  // 필드·파트 개수가 한도를 넘으면 정상 요청이 아니다(앱은 글 필드 다섯 개와 사진 하나만 보낸다).
  const tooManyParts = () => {
    error = error || new Error('요청 형식이 올바르지 않습니다.');
  };
  busboy.on('fieldsLimit', tooManyParts);
  busboy.on('partsLimit', tooManyParts);

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
    // 저장 실패도 파싱 오류로 전달한다. 남은 입력을 비워 busboy가 끝나게 하고,
    // close 이후 기존 finish() 경로에서 부분 파일을 삭제한다.
    out.on('error', (err) => {
      error = error || err;
      stream.unpipe(out);
      stream.resume();
    });
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

/* 타임아웃 3단 체인(2026-09-06 확정, 2026-09-07 8차 감사에서 예산 개념 추가):
     OPENAI_TIMEOUT_MS(120초, 한 번의 OpenAI 호출)
       < GENERATE_BUDGET_MS(125초, 재시도·파라미터폴백까지 포함한 한 요청 전체)
       < posterStudio의 timeoutSeconds(140초, 플랫폼 강제종료)
       < public/api.js의 프론트 fetch abort(150초)
   GENERATE_BUDGET_MS가 왜 필요한가(8차 감사 발견): editWithRetry는 429/5xx에
   최대 4번 재시도하고 사이사이 최대 8초씩 기다리며, generateArt는 파라미터가
   거부되면 조합을 바꿔 최대 3번 더 시도한다 — 각 시도가 120초까지 걸릴 수 있으므로
   재시도가 한 번만 일어나도 총 소요가 플랫폼 한도(140초)를 쉽게 넘었다. 그렇게
   플랫폼이 요청을 강제 종료하면 (a) mapGenerateError의 정상 JSON 응답 대신 원시
   타임아웃이 나가고, (b) 무엇보다 /generate 핸들러의 finally(임시 사진 삭제)가
   아예 실행되지 못해 학생 사진이 인스턴스 /tmp(Cloud Run에선 메모리)에 그대로
   남는다 — 7차 감사에서 429 경로에 대해 고친 것과 정확히 같은 종류의 누수다.
   그래서 매 시도의 타임아웃을 "남은 예산"으로 좁혀, 우리가 항상 플랫폼보다
   먼저 정상적으로 포기하도록 만든다. */
const OPENAI_TIMEOUT_MS = 120_000;
const GENERATE_BUDGET_MS = 125_000;

let _client = null;
let _clientOverride = null;
function getClient() {
  if (_clientOverride) return _clientOverride;
  if (!_client)
    _client = new OpenAI({
      apiKey: OPENAI_API_KEY.value(),
      // 2026-09-06: 90초 → 120초. scripts/loadtest.mjs 실측 결과 동시성 5에서
      // p95가 59.4초까지 나와(요구 여유 30초 기준으로 딱 0.6초 차이) 행사 당일
      // 노트북 최대 20대가 몰릴 때의 여유를 넉넉히 두려고 올림. 이 값을 올릴 때는
      // 아래 posterStudio의 timeoutSeconds(이 값보다 커야 함)와 public/api.js의
      // 프론트 fetch abort 시간(150_000, 이 값보다 커야 함)도 같이 확인할 것.
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 0
    });
  return _client;
}
// 테스트 전용 — 실제 OpenAI를 두드리지 않고 editWithRetry/generateArt/
// checkOpenAIReachable의 우리 쪽 로직(재시도, 파라미터 폴백, 캐싱)만 가짜
// 클라이언트로 검증한다. Firestore 카운터 때(_setCounterImplForTesting)와
// 같은 이유·같은 패턴 — 실비용 없이 로직만 검증하고, 실제 API 응답 형식이
// 정말 이 가정과 같은지는 여전히 검증하지 못한다(구조적 한계, 인정하고 감).
function _setClientForTesting(fake) {
  _clientOverride = fake;
}

const app = express();
// Cloud Run(Functions v2가 그 위에서 돎)은 항상 Google Front End 한 홉을 거쳐
// X-Forwarded-For를 채워준다 — 이걸 켜야 req.ip가 내부 프록시 주소가 아닌 값을 준다.
// 단, req.ip 자체를 레이트리밋 키로 쓰면 안 된다(아래 clientIpForRateLimit 참고).
app.set('trust proxy', true);

/* 8차 감사 발견(2026-09-07, 라이브 실측으로 확인한 진짜 우회 경로).
   Express의 `trust proxy: true`는 req.ip를 X-Forwarded-For의 **맨 왼쪽** 값으로
   정한다. 그런데 Cloud Run/GFE는 클라이언트가 보낸 XFF를 지우지 않고 그 뒤에
   자기가 본 클라이언트 IP를 덧붙이므로, 맨 왼쪽 값은 요청자가 헤더 한 줄로
   마음대로 정할 수 있는 값이다 — 즉 ipRateLimit(IP_RATE_LIMIT_MAX=50)이
   `x-forwarded-for: 203.0.113.7` 한 줄만 붙이면 매 요청 새 버킷을 만들어
   완전히 무력화됐다.
   실측(2026-09-07, 라이브 /generate): 같은 회선에서 51번째 요청이 정상적으로
   "이 네트워크에서 요청이 너무 많이 몰렸습니다"(IP 한도 429)를 받은 직후,
   임의의 x-forwarded-for 한 줄만 붙여 보낸 요청은 그 한도를 그냥 통과해
   다음 미들웨어까지 도달했다(사진별 한도 429가 대신 떴다).
   영향: 부스토큰은 공개 소스에서 복사 가능하므로, 한 명이 IP별 공정배분
   (전역 예산의 1/3)을 무시하고 전역 예산(RATE_LIMIT_MAX=150/10분)과 하루
   예산(DAILY_BUDGET_MAX)을 혼자 다 태워 행사 전체를 멈출 수 있었다.
   (비용 상한 자체는 전역/일일 카운터가 여전히 막고 있어 과금 폭탄은 아니다.)
   해결: 체인의 **맨 오른쪽** 값만 쓴다 — 그 값은 Cloud Run/GFE가 직접 붙인,
   클라이언트가 조작할 수 없는 유일한 항목이다.
   ⚠ 전제: 이 앱의 /generate는 항상 cloudfunctions.net 주소로 **직접** 호출된다
   (public/constants.js의 API_BASE — edutogether.kr Portal 리버스 프록시는 정적
   파일만 다루고 API 호출은 프록시하지 않는다, 아래 ALLOWED_ORIGINS 주석 참고).
   만약 나중에 이 API를 CDN/Hosting 뒤로 옮기면 맨 오른쪽 값이 그 CDN 주소가 되어
   모든 부스가 한 버킷을 공유하게 되므로, 그때는 이 함수를 반드시 같이 고칠 것. */
/* 레이트리밋 버킷 키에 쓰는 접속 IP는 원래 값 대신 되돌릴 수 없는 값(HMAC-SHA256)으로 바꿔 저장한다.
   키는 새 비밀을 만들지 않고 이미 있는 서버 비밀을 쓴다(값은 저장·출력하지 않는다). */
function ipKey(ip) {
  return crypto
    .createHmac('sha256', OPENAI_API_KEY.value() || 'local')
    .update(String(ip))
    .digest('hex')
    .slice(0, 32);
}

function clientIpForRateLimit(req) {
  const raw = req.headers?.['x-forwarded-for'];
  const chain = (Array.isArray(raw) ? raw.join(',') : String(raw || ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  return req.ip || 'unknown';
}

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

/* 기존+(v1plus) — 2026-10-25 Bumm님 A/B 눈 채점(_shared/ops/poster-studio-20261017/ai-ab-bumm-review-20261025.md).
   기존(v1)을 장르별 기준선으로 두고, 채점에서 실제로 좋았던 것만 덧붙인 최소 변경판이다. 구도 문장(전신 · 위 2/3 · 머리 여백 ·
   아래 1/3 어둡게)은 v1 그대로 쓴다 — 개선판(v2)의 얼굴 크기 · 가로 % 구도 지시는 쓰지 않는다(단체 몸 잘림 · 혼자 얼굴 쏠림의 원인).
     base                  장르 한 줄을 바꾼다(없으면 v1 그대로)
     all · solo · group    장르 한 줄 바로 뒤에 덧붙이는 문장
     bottom                아래 1/3 문장을 바꾼다(뮤지컬만 — 검은 띠가 아니라 어두운 무대 바닥)
   판타지는 혼자 · 단체 모두 기존이 나아 바꾸지 않는다. */
const genrePromptsV1Plus = {
  // 혼자에서 사람 · 옷이 그대로였다 — 사람까지 3D 캐릭터로 다시 그리되 얼굴 특징은 알아보게(단체에서 기존이 성공한 방향을 더 세게)
  animation: {
    all: 'Redraw the subject(s) entirely — face, hair, body and clothing — as fully 3D animated characters in the same studio style as the scene (never a real photo pasted onto a cartoon background), wearing new adventure outfits that belong to the animated world, while keeping each face recognizable through its own face shape, eye shape, nose, mouth, skin tone, hairstyle and glasses if worn.'
  },
  fantasy: {},
  // 혼자에서 가끔 너무 어두웠다 — 얼굴 · 인물만 조금 밝게
  sf: {
    solo: "Light the subject's face and figure clearly, a little brighter than the background, so the person never sinks into darkness."
  },
  // 장르 의상(엠블럼 없는 원작 슈트 · 짧은 망토) + 누런 노을 · 황금빛 빼고 맑은 색
  hero: {
    base: 'a dynamic superhero blockbuster movie poster key art, the subject as a courageous young hero in a heroic pose, dramatic backlight, city skyline under a clear deep-blue evening sky, comic-cinematic energy, bold confident composition, crisp clean colors without a yellow or golden-orange cast',
    solo: 'Dress the subject in an original colorful superhero suit with a short cape and no emblem, replacing their everyday clothes.',
    group: 'Dress everyone in coordinated original superhero suits with short capes and no emblems, replacing their everyday clothes.'
  },
  // 사람 · 옷 · 전신은 기존, 배경은 개선판의 젖은 돌바닥 · 빛나는 발자국 · 가로등 거리 — 푸른빛 없이, 기존보다 덜 칙칙하게
  mystery: {
    base: 'a stylish mystery-adventure movie poster key art, the subject as a clever young detective, a foggy cobblestone street at night with wet stones reflecting warm street lamps and softly glowing footprints as clues, warm amber lamplight with clear readable mid-tones, no teal or blue cast, intriguing but child-friendly atmosphere, less murky than classic noir'
  },
  // 콘셉트(영화를 좋아하는 아이)와 크고 밝은 인물은 기존 그대로 — 장르 옷 + 주변 영화 소품을 은은하게, 기존의 쨍함과 개선판의 탁함 사이 색
  director: {
    base: "a heartfelt movie-about-movies poster key art, the subject as a passionate young film director holding a camera, large and brightly lit in the foreground, soft studio lights with gentle haze, a vintage film camera, a director's chair, film reels and a blank clapperboard placed naturally and subtly around them, warm nostalgic cinematic mood with natural balanced colors, neither overly golden nor murky",
    solo: 'Dress the subject in a neat film-set outfit such as a simple jacket or vest with a cap or scarf, replacing their everyday clothes.',
    group: 'Dress everyone as a young film crew in neat film-set outfits such as simple jackets, vests, caps or scarves, replacing their everyday clothes.'
  },
  // 동작 포즈 · 전신은 기존 — 팀 유니폼 + 황금빛 과다 빼기
  sports: {
    base: 'an inspiring sports movie poster key art, the subject as a determined young athlete mid-motion, dramatic stadium floodlights, dust and energy, crisp natural colors with only a touch of warm light and no heavy golden glow or yellow haze, sense of teamwork and growth',
    solo: 'Dress the subject in a plain original team uniform with no numbers or logos, replacing their everyday clothes.',
    group: 'Dress everyone in matching plain original team uniforms with no numbers or logos, replacing their everyday clothes.'
  },
  // 전신은 기존 — 공연 의상 + 기타 · 드럼 · 마이크, 아래는 검은 띠가 아니라 어두운 무대 바닥
  music: {
    solo: 'Dress the subject in a sparkling stage performance outfit, singing into a microphone or playing a guitar, with the microphone and instrument kept away from the face.',
    group: 'Dress everyone in coordinated stage performance outfits as a band playing instruments such as an electric guitar, drums and a keyboard and singing into microphones, with instruments kept away from their faces.',
    bottom: 'IMPORTANT: keep the BOTTOM THIRD darker and calmer as a dimly lit stage floor with soft reflections of the lights (a visible floor, not a flat black band), uncluttered so a title can be placed there later.'
  }
};

/* 기존+ 2차(v1plus2) — 2026-10-25 Bumm님 «제일 마음에 드는 것» 48장(위 채점 문서 1 · 2 · 3차). 고르신 그림의 공통점만 v1에 더한다.
     혼자: 장르 옷 · 손에 장르 소품 하나 · 무릎 위~허리 위로 크게(고르신 혼자 24장 대부분) · 자신감 있게 살짝 비켜 선 자세
     단체: 같은 장르 옷이되 사람마다 다른 색 · 소품 나눠 들기 · 어깨동무 같은 친한 자세 · 모두 같은 크기로 나란히 전신(셀카 원근도 다시 세운다)
     색: «금빛을 빼라»는 쓰지 않는다 — 금빛 배경이어도 얼굴이 밝으면 고르셨다. 대신 얼굴마다 밝은 키 라이트, 따뜻함 · 차가움 대비.
   genre 칸: base(장르 한 줄 바꾸기) · prop(혼자 소품) · soloCostume · soloLook(혼자에만 붙는 문장) · groupCostume · groupProps · groupPose · bottom. */
const genrePromptsV1Plus2 = {
  animation: {
    all: genrePromptsV1Plus.animation.all,
    soloLook:
      "Make the lead's face a stylized 3D animated character face as well — soft rounded features, big expressive eyes and smooth animated shading like a modern animated feature, never a photorealistic face — while keeping the same face shape, eye shape, nose, mouth, skin tone, hairstyle and glasses if worn.",
    prop: "a rolled-up treasure map, with an adventurer's backpack on the shoulders",
    groupCostume: 'adventure outfits with hats or scarves',
    groupProps: 'they share out the props — a map, a compass and a spyglass'
  },
  fantasy: {
    prop: 'a softly glowing lantern or a carved wooden staff',
    groupCostume: "adventurers' cloaks (for example green, red, blue and purple cloaks)",
    groupProps: 'they share out the props — a glowing lantern, a staff, an old map and a small glowing orb'
  },
  sf: {
    prop: 'a space helmet tucked under one arm',
    groupCostume: 'futuristic space suits',
    groupProps: 'each holds a different small glowing hologram and one carries a space helmet'
  },
  hero: {
    soloCostume: genrePromptsV1Plus.hero.solo,
    groupCostume: 'original superhero suits with short capes and no emblems'
  },
  mystery: {
    base: genrePromptsV1Plus.mystery.base,
    prop: 'a magnifying glass',
    soloCostume: 'Dress the subject in a detective coat and cap, replacing their everyday clothes.',
    groupCostume: 'detective coats and checked jackets',
    groupProps: 'one holds a magnifying glass and the others a notebook and a flashlight'
  },
  director: {
    base: "a heartfelt movie-about-movies poster key art, the subject as a passionate young film director holding a camera, glowing stage and studio lights with gentle haze, a director's chair, film reels and a blank clapperboard placed naturally around them, warm nostalgic cinematic mood",
    prop: 'a vintage movie camera',
    soloCostume: genrePromptsV1Plus.director.solo,
    groupCostume: 'film-set outfits such as simple jackets, vests, caps and scarves',
    groupProps: 'they share out the props — a vintage movie camera, a clapperboard, a film reel and a megaphone'
  },
  sports: {
    prop: 'a soccer ball',
    soloCostume: genrePromptsV1Plus.sports.solo,
    groupCostume: 'plain original team uniforms with no numbers or logos',
    groupProps: 'a soccer ball at their feet'
  },
  music: {
    prop: 'an electric guitar or a microphone, kept away from the face',
    soloCostume: 'Dress the subject in a sparkling stage performance outfit, replacing their everyday clothes.',
    groupCostume: 'stage performance outfits',
    groupProps: 'they are set up as a band with an electric guitar, a microphone, a keyboard and drums shared out, instruments kept away from faces',
    groupPose: 'playing together as a band with big genuine smiles',
    bottom: genrePromptsV1Plus.music.bottom
  }
};
const V1PLUS2_LIGHT =
  "Give every face its own bright, clean key light so faces are always bright, clear and natural — never muddy, gray, dim or lost in shadow, whatever the scene's colors — with warm light on the people against a cooler background (or cool light against a warm background) for contrast.";
const V1PLUS2_STAGING =
  'Stage everyone side by side in one row at the same size and the same distance from the camera, everyone fully visible from head to toe — even if the photo is a close-up selfie with someone much bigger in front, re-stage them so no one looms larger.';
/** v1plus2 문장 묶음 — buildPrompt가 v1 문장 사이에 끼운다(없는 칸은 v1 그대로). */
function v1Plus2Lines(key, group) {
  const g = genrePromptsV1Plus2[key];
  const cast = group
    ? [
        `Everyone wears the same ${g.groupCostume || 'genre costume'} but each person in a different color${g.groupProps ? `; ${g.groupProps}` : ''}; ${g.groupPose || "a friendly pose with arms around each other's shoulders or leaning together and big genuine smiles"}.`,
        V1PLUS2_STAGING
      ]
    : [g.soloCostume, g.soloLook, `Show the lead in a confident, slightly turned three-quarter stance${g.prop ? `, holding ${g.prop}` : ''}.`];
  return {
    base: g.base,
    all: g.all,
    cast,
    // 혼자만 크게 — 얼굴은 위 1/3에 두어 디자인의 얼굴 자리(주인공 상자 세로 5~67% · 아치 얼굴 띠 8~35%)를 지킨다
    composition: group ? null : 'Composition: tall vertical 2:3 movie poster, the lead framed large from about the knees or the waist up, with the face in the upper third of the image.',
    frame: group ? null : 'Frame with comfortable margin: include the entire head and hair with empty space ABOVE the head; never crop or cut off the top of the head.',
    light: V1PLUS2_LIGHT,
    bottom: g.bottom
  };
}

/* 새것(v2) 히어로 단체 — 2026-10-25 Bumm님이 «마음에 드는 것» 1 · 2 · 3차 모두 히어로 단체 보통 · 어려움을 새것(v2)으로 고르셨다.
   v2 지시문 전체는 10/25에 걷어냈지만(기존 기준 결정) 이 한 칸만 되살린다 — 6886bfc의 buildPrompt가 hero/group에 내던 문장과
   글자 하나까지 같다(functions/test/fixtures/prompt-v2-hero-group-6886bfc.json으로 고정). 다른 칸에는 v2가 없다(고르면 오류). */
function buildPromptV2HeroGroup({ title, tagline }) {
  const identity = [
    'IDENTITY (most important): the uploaded photo is the identity reference.',
    'Keep every person recognizably the same individual:',
    'same face shape, eyes, eyebrows, nose, mouth and jawline, same skin tone, same hairstyle and hair color, glasses if worn, and the same apparent age.',
    'Do not beautify, slim, age up or make anyone look like a celebrity; keep natural, friendly expressions.',
    'Stylize lighting and costume, not the faces.'
  ].join(' ');
  const count =
    'PEOPLE COUNT: this is an ENSEMBLE CAST. Show exactly as many people as are in the photo — every one of them, each with their own distinct face; never drop, merge, duplicate or add anyone, and no extra background characters with visible faces.';
  const layout = [
    'LAYOUT (tall vertical 2:3 movie poster):',
    'leave clear empty background above the highest head (about one tenth of the image height); never crop the top of a head;',
    'gather everyone closely in the center, shoulder to shoulder, heads at similar heights, with all faces between about 10% and 35% of the image height from the top and fully inside the central 80% of the width — no face near or cut by the left or right edge;',
    'bodies may continue downward into the scene;',
    'keep the BOTTOM THIRD darker, calmer and uncluttered (ground, shadow, haze or soft background) with no faces, no hands and no important objects, so a title can be placed there later.'
  ].join(' ');
  const scene =
    'SCENE: dynamic superhero blockbuster movie poster key art, cinematic realism; the friends as a team of young heroes in coordinated original suits with no emblems, standing side by side on a rooftop at dusk above a glittering city skyline, wind in the hair, dramatic backlight and soft lens flare, low-angle camera.';
  const concept =
    title || tagline
      ? `STORY: This film is titled "${title || ''}"${tagline ? ` with the tagline "${tagline}"` : ''}. Express that idea only through the setting, props, color and mood — never as written words.`
      : '';
  const rules =
    'RULES: Absolutely NO text, NO letters, NO numbers, NO logos, NO watermark, no signs, captions or writing on clothing or props anywhere in the image. Safe, wholesome, child-appropriate: no weapons, violence, horror or suggestive content; modest clothing. High detail, professional, keepsake quality.';
  return [identity, count, layout, scene, concept, rules].filter(Boolean).join('\n');
}

/* 장르 × 혼자/단체 지시문 선택표(동결본) — 2026-10-25 Bumm님 확정 16칸(«마음에 드는 것» 1 · 2 · 3차 선택과 손질 검증 뒤).
     v1 = 기존(라이브 7ad0ad5와 글자 하나까지 같음 — fixtures/prompt-v1-7ad0ad5.json) · v1plus = 기존+ · v1plus2 = 기존+2 ·
     v2 = 새것(히어로 단체 한 칸만 — buildPromptV2HeroGroup)
   칸을 바꾸려면 이 표만 바꾼다. 표에 없는 판 이름이나 없는 칸의 v2는 오류로 막는다(조용히 v1로 떨어지지 않게). */
const PROMPT_VARIANT_BY_CELL = {
  sf: { solo: 'v1plus2', group: 'v1' },
  fantasy: { solo: 'v1', group: 'v1' },
  animation: { solo: 'v1plus2', group: 'v1plus' },
  hero: { solo: 'v1plus2', group: 'v2' },
  mystery: { solo: 'v1plus2', group: 'v1' },
  director: { solo: 'v1plus2', group: 'v1plus' },
  sports: { solo: 'v1plus', group: 'v1plus' },
  music: { solo: 'v1plus2', group: 'v1plus' }
};
const PROMPT_VERSIONS = { v1: 'v1', v1plus: 'v1plus-20261025', v1plus2: 'v1plus2-20261025', v2: 'v2-20261025' };
// 자기 속성만 본다 — `constructor` · `__proto__` · `toString` 같은 기본 속성 이름도 «있는 장르»로 읽으면 선택표에 칸이 없어 예외가 난다(10/26 독립 리뷰)
const genreKey = (genre) => (Object.hasOwn(genrePrompts, genre) ? genre : 'animation');
function promptVariantFor(genre, mode, variant) {
  const key = genreKey(genre), cell = mode === 'group' ? 'group' : 'solo';
  const chosen = variant || PROMPT_VARIANT_BY_CELL[key][cell];
  if (!PROMPT_VERSIONS[chosen]) throw new Error(`알 수 없는 지시문 판: ${chosen}`);
  if (chosen === 'v2' && !(key === 'hero' && cell === 'group')) throw new Error(`v2 지시문은 히어로 단체에만 있다: ${key}/${cell}`);
  return chosen;
}
const promptVersionFor = (genre, mode, variant) => PROMPT_VERSIONS[promptVariantFor(genre, mode, variant)];

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

// variant는 QA가 판을 강제할 때만 넘긴다 — 운영 /generate는 넘기지 않아 위 선택표(장르 × 혼자/단체)를 따른다.
function buildPrompt({ genre, mode, title, tagline, variant }) {
  const key = genreKey(genre);
  const chosen = promptVariantFor(key, mode, variant);
  if (chosen === 'v2') return buildPromptV2HeroGroup({ title, tagline });
  const plus = chosen === 'v1plus' ? genrePromptsV1Plus[key] : chosen === 'v1plus2' ? v1Plus2Lines(key, mode === 'group') : {};
  const base = plus.base || genrePrompts[key];
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
    plus.all,
    mode === 'group' ? plus.group : plus.solo,
    ...(plus.cast || []),
    'Transform the uploaded photo of real student(s) into this poster, keeping their faces clearly recognizable and friendly but stylized to match the art.',
    ensemble,
    concept,
    plus.composition || 'Composition: tall vertical 2:3 movie poster, the subject(s) in the upper two-thirds, FULLY VISIBLE.',
    plus.frame || 'Frame with comfortable margin: include the entire head and hair with empty space ABOVE the head; never crop or cut off the top of the head, and keep everyone fully within the frame.',
    plus.light,
    plus.bottom || 'IMPORTANT: keep the BOTTOM THIRD darker, calmer and uncluttered so a title can be placed there later.',
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
// 테스트 전용 — editWithRetry의 재시도 로직 자체(횟수·조건)를 검증하려면
// 재시도 간 실제 대기(최대 8초+)를 겪을 필요가 없다. 기본값은 진짜 sleep.
let _sleepImpl = sleep;
function _setSleepForTesting(fake) {
  _sleepImpl = fake || sleep;
}

// 예산이 다 떨어졌을 때 던지는 오류. 메시지에 "timed out"이 들어가야
// mapGenerateError가 504로 매핑한다(사용자에겐 "시간이 오래 걸려 중단" 안내).
function budgetExhaustedError() {
  return new Error('이미지 생성이 제한 시간을 초과했습니다 (timed out).');
}

/* 잔액 · 지출 한도 오류(2026-10-25): OpenAI는 크레딧이 바닥나거나 조직 · 프로젝트 지출 한도에 닿아도 «429»를 돌려준다
   (code: credit_balance_exhausted · organization_spend_limit_exceeded · project_spend_limit_exceeded ·
   organization_usage_limit_exceeded, type: insufficient_quota — OpenAI 공식 오류 코드 안내). 요청 몰림(429)과 상태 코드가 같아
   예전에는 4번 다시 시도한 뒤 «AI가 잠시 바빠요»로 안내됐다. 다시 시도해도 풀리지 않으므로 바로 멈추고 크레딧 문제로 알린다. */
const BILLING_CODE = /^(insufficient_quota|credit_balance_exhausted|(organization|project)_(spend|usage)_limit_exceeded|billing_hard_limit_reached)$/;
function isBillingError(err) {
  const codes = [err?.code, err?.type, err?.error?.code, err?.error?.type];
  if (codes.some((v) => typeof v === 'string' && BILLING_CODE.test(v))) return true;
  // 속도 한도는 문구에 결제 안내 링크(…/account/billing)가 붙어 와도 잔액 문제가 아니다 — 몰림으로 보고 다시 시도한다(10/26 독립 리뷰)
  if (codes.includes('rate_limit_exceeded')) return false;
  return /billing|quota|hard limit/i.test(String(err?.message || ''));
}

async function editWithRetry(params, deadlineAt = Date.now() + GENERATE_BUDGET_MS) {
  const maxRetries = 4;
  for (let attempt = 0; ; attempt++) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw budgetExhaustedError();
    try {
      // 한 번의 시도는 최대 OPENAI_TIMEOUT_MS이되, 남은 예산이 그보다 적으면
      // 그만큼만 기다린다 — 이래야 전체가 항상 플랫폼 한도 안에서 끝난다.
      return await getClient().images.edit(params, { timeout: Math.min(remaining, OPENAI_TIMEOUT_MS) });
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const retryable = !isBillingError(err) && (status === 429 || (status >= 500 && status < 600));
      if (retryable && attempt < maxRetries) {
        const waitMs = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 600);
        // 기다렸다 재시도해봐야 예산 안에 끝낼 수 없으면, 플랫폼이 우리를 죽이기 전에
        // 지금 바로 포기해서 정상 JSON 응답 + 임시파일 삭제가 실행되게 한다.
        if (Date.now() + waitMs >= deadlineAt) throw err;
        console.warn(`[retry] ${status} → ${waitMs}ms 후 재시도 (${attempt + 1}/${maxRetries})`);
        await _sleepImpl(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function generateArt(filePath, mimetype, prompt, deadlineAt = Date.now() + GENERATE_BUDGET_MS) {
  const mime = /^image\/(png|jpe?g|webp)$/i.test(mimetype || '') ? mimetype : 'image/png';
  const ext = /jpe?g/i.test(mime) ? 'jpg' : /webp/i.test(mime) ? 'webp' : 'png';
  const image = await toFile(fs.createReadStream(filePath), 'photo.' + ext, { type: mime });
  const baseParams = { model: MODEL, image, prompt, size: ART_SIZE, quality: QUALITY, n: VARIANTS };
  const tries = editAttempts(baseParams);
  let lastErr;
  // 요청마다 항상 가장 좋은 조합(얼굴보존 high)부터 새로 시도한다.
  // (server.js 원본은 이 시작 지점을 프로세스 전역에 기억해뒀는데, 동시 요청이 겹치면
  //  한 요청의 폴백이 이후 모든 요청에 영구히 적용되는 버그가 있었다 — Functions는
  //  인스턴스가 매번 새로 뜨므로 이 최적화 자체가 무의미해 제거했다.)
  for (let i = 0; i < tries.length; i++) {
    try {
      const result = await editWithRetry(tries[i], deadlineAt);
      const imgs = (result.data || []).map((d) => `data:image/png;base64,${d.b64_json}`).filter(Boolean);
      if (imgs.length) return imgs;
      throw new Error('이미지 생성 결과가 비어 있습니다.');
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      // 안전 차단은 파라미터 거절이 아니다 — 문구에 «not allowed»가 들어 있어도 같은 사진 · 지시문을 다시 보내지 않는다(10/26 Bumm님 · 독립 리뷰)
      const moderated = [err?.code, err?.error?.code].includes('moderation_blocked') || /moderation|safety|content policy/i.test(msg);
      const paramRejected =
        !moderated && err?.status === 400 && /unknown|unsupported|invalid|not (allowed|supported)|input_fidelity|quality/i.test(msg);
      // 파라미터 폴백 재시도도 남은 예산 안에서만 한다(위 editWithRetry와 같은 이유).
      if (paramRejected && i < tries.length - 1 && Date.now() < deadlineAt) continue;
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
// 테스트 전용 — 60초 캐시가 실제로 걸려있으면 테스트끼리 서로의 캐시 결과를
// 보게 돼 격리가 깨진다. 각 캐싱 시나리오 테스트가 이걸로 캐시를 비우고 시작한다.
function _resetOpenAIHealthCacheForTesting() {
  openaiHealthCache = { reachable: null, checkedAt: 0 };
}
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
    fidelity: SENT_INPUT_FIDELITY,
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
/* 🔴 실제로 한도를 강제하는 자리다. 미들웨어(rateLimit·ipRateLimit·dailyBudgetCap·
   checkPhotoGenerationLimit)는 여기가 돌려주는 `allowed`를 그대로 따를 뿐이다.

   2026-09-10 감사에서 **이 함수를 무력화해도(항상 allowed) 테스트 61개가 전부
   통과하는 것**을 확인했다 — 테스트들이 `_setCounterImplForTesting`으로 자기
   가짜 카운터를 넣고 돌아서, 미들웨어는 덮여 있었지만 **정작 한도를 강제하는
   이 함수는 아무도 안 보고 있었다.** 그래서 `cleanupOldCounters(db, now)`와 같은
   방식으로 db를 인자로 열어 직접 테스트한다(기본값은 모듈의 실제 db라 호출부는
   그대로다).

   경계가 `>=`인 것이 중요하다: limit=2면 **2번째까지 통과하고 3번째가 막힌다.**
   `>`로 바꾸면 한도가 하나씩 늘어난다. */
async function _firestoreIncrementAndCheck(collectionName, docId, limit, database = db) {
  const ref = database.collection(collectionName).doc(docId);
  return database.runTransaction(async (tx) => {
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
  // 가짜 카운터를 넣으면 되돌리기도 그 가짜(fn.release)를 쓴다 — 없으면 아무것도 하지 않는다(테스트가 실제 Firestore를 부르지 않게).
  _release = fn ? fn.release || (async () => ({ count: 0 })) : _firestoreRelease;
}

/* 생성이 실패하면 «사진당 2회» 카운터를 하나 되돌린다(2026-10-16 Bumm님 결정 1 — 실패는 아이의 기회를 쓰지 않는다).
   0 아래로는 내리지 않는다. 하루 예산·전역·IP 카운터는 되돌리지 않는다(결정 5 — 시간 초과는 과금됐을 수 있어 보수적으로). */
async function _firestoreRelease(collectionName, docId, database = db) {
  const ref = database.collection(collectionName).doc(docId);
  return database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().count || 0 : 0;
    if (current <= 0) return { count: 0 };
    tx.set(ref, { count: current - 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { count: current - 1 };
  });
}
let _release = _firestoreRelease;
function _setReleaseImplForTesting(fn) {
  _release = fn || _firestoreRelease;
}

/* 카운터 한 번이 오래 걸리면 그만 기다리고 오류로 처리한다(각 미들웨어의 대체 처리로 넘어간다).
   카운터 대기가 길어지면 요청 전체 예산(GENERATE_BUDGET_MS) 안에서 생성에 쓸 시간이 줄어든다. */
const COUNTER_TIMEOUT_MS_DEFAULT = 5_000;
let COUNTER_TIMEOUT_MS = COUNTER_TIMEOUT_MS_DEFAULT;
function _setCounterTimeoutForTesting(ms) {
  COUNTER_TIMEOUT_MS = ms ?? COUNTER_TIMEOUT_MS_DEFAULT;
}
function withCounterTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`카운터 응답이 ${COUNTER_TIMEOUT_MS}ms를 넘었습니다`)),
      COUNTER_TIMEOUT_MS
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function checkCounter(collectionName, docId, limit) {
  return withCounterTimeout(_incrementAndCheck(collectionName, docId, limit));
}
function releaseCounter(collectionName, docId) {
  return withCounterTimeout(_release(collectionName, docId));
}

// 노트북/인스턴스 여러 개에 걸쳐 진짜로 전역 강제되는 상한. 2026-08-29엔 인스턴스별
// 메모리 카운터(30/10분)라 maxInstances를 올릴 때마다 실효 상한이 같이 커졌는데
// (25대면 이론상 750/10분), 이제 Firestore로 전역화하면서 "노트북 최대 20대가
// 각자 분당 1건 안팎으로 정상 사용하는 수준"을 기준으로 새로 산정함(20대 × 분당
// 1.5건 ≈ 10분당 150건 — 여유 포함). 진짜 비용 하드캡은 OpenAI 대시보드 월 지출
// 상한이 맡고, 이 값은 "정상 사용은 막지 않으면서 폭주는 끊는" UX 안전장치다.
//
// 6차 감사 발견(2026-09-01, 실측): rateLimit이 parseMultipart보다 먼저 실행되던
// 예전 순서에서는 사진 없이 빈 바디만 보내는 요청도 카운트를 그대로 소모했다 —
// 라이브 /generate에 사진 없는 요청 170개를 동시에 보냈더니 149개가 10.5초 만에
// 전역 한도(150)를 소진시켜 그 뒤로 모든 부스가 10분간 동시에 429를 받는 것까지
// 실제로 확인됨(부스토큰은 공개 저장소 소스에서 그대로 복사 가능이라 누구나 가능).
// 그래서 순서를 "사진이 실제로 있는지 먼저 확인(requirePhoto) → 그 다음에만 카운트"로
// 바꿨고, 한 IP가 전역 예산 전체를 혼자 다 써버릴 수 없도록 IP별 서브한도
// (ipRateLimit)를 추가했다.
//
// IP_RATE_LIMIT_MAX=50 확정(2026-09-03) — 예전엔 "행사장 네트워크 구조를 모르니
// 넉넉하게(전역치의 2/3=100)"였는데, 이번엔 반대 방향으로 확정됐다: 실사답사로
// 기존 망을 재는 게 아니라, 대표가 이 앱이 원하는 스펙 그대로 와이파이 장비를
// 새로 구매하기로 했다 — 그래서 네트워크 쪽을 이 상수에 맞추면 된다. 공인 IP
// 3개를 요청하기로 확정했고, 50 = RATE_LIMIT_MAX(150)
// ÷ 3 — 어떤 IP 하나가 폭주해도 전역 예산의 정확히 1/3을 넘게 가져갈 수 없어
// 나머지 두 IP(그룹)가 남은 예산으로 계속 정상 서비스된다(공정 배분).
//
// 2026-09-09 정정: 예전 주석은 "노트북 20대를 7/7/6으로 분산"이라고 적고 그룹당
// 실사용 예상치를 노트북 7대 기준으로 계산했는데, 대표 확인 결과 **실제 운영은
// 노트북 3대**이고 20대는 "그것까지 버티게 만들겠다"는 **부하 테스트 목표치**였다.
// 다만 이 상수는 바꾸지 않는다 — 50은 노트북 대수가 아니라 **공인 IP 개수(3)**에서
// 나온 공정 배분 값이고, 3대 실사용에 맞춰 좁히면 대표가 지시한 20대 부하 테스트가
// 429로 막혀 불가능해진다. 두 목적(실운영 3대 / 목표 20대) 중 큰 쪽에 맞춰 두는 게
// 맞고, 최악의 지출은 어차피 DAILY_BUDGET_MAX(4000건=$160)가 물리적으로 막는다.
// 재산정이 필요한 조건은 대수 변경이 아니라 **공인 IP 개수가 3이 아니게 되는 것**이다
// (예: 1개가 되면 전 부스가 한 버킷을 공유해 실효 전역 한도가 150이 아니라 50이 된다).
//
// 공인 IP 3개 확정(2026-09-09 대표 확정): 하루 대여 와이파이 2개 + 셀룰러 핫스팟 1개
// (핫스팟은 테스트용). 노트북이 3대이므로 대략 IP당 노트북 1대다 — 즉 ÷3의 전제가
// 그대로 성립하고, 이 상수는 유지한다.
const RATE_LIMIT_MAX = 150;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT_MAX = 50;

/* 카운터 저장소를 쓸 수 없을 때의 대체 한도 — 부스가 멈추지 않게 통과시키되, 인스턴스(서버 한 대)마다
   10분에 FALLBACK_LIMIT_PER_INSTANCE건까지만 통과시킨다. 노트북 4대가 정상 사용하는 양보다 넉넉하다. */
const FALLBACK_LIMIT_PER_INSTANCE = 10;
const _fallbackCounts = new Map();
function fallbackAllowed(now = Date.now()) {
  const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  for (const key of _fallbackCounts.keys()) if (key !== bucket) _fallbackCounts.delete(key);
  const count = (_fallbackCounts.get(bucket) || 0) + 1;
  _fallbackCounts.set(bucket, count);
  return count <= FALLBACK_LIMIT_PER_INSTANCE;
}
function _resetFallbackForTesting() {
  _fallbackCounts.clear();
}

// 6차 감사 발견(2026-09-01): 위 RATE_LIMIT_MAX는 10분 버킷마다 초기화되므로,
// "행사 당일 270분 동안만 호출된다"는 가정이 있어야 하루 지출이 $162 근처로
// 묶인다는 CLAUDE.md의 기존 결론이 성립했다 — 그런데 그 가정을 강제하는 코드가
// 없어서, 하루 종일(144개 버킷) 호출되면 이론상 150×144=21,600건/일까지
// 코드가 물리적으로 허용했다. 여기에 별도의 "하루 총량" 상한을 둬서, 어떤
// 시간대·트래픽 패턴이든 하루 지출이 물리적으로 넘을 수 없게 만든다.
// 4000건 = $0.04 × 4000 = $160 — 행사 당일 목표치($162 근처)를 그대로 하루
// 전체의 물리적 상한으로 삼는다. 날짜 경계는 행사가 KST 기준이라 KST로 자른다.
const DAILY_BUDGET_MAX = 4000;

function kstDateKey(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // "YYYY-MM-DD" (KST)
}

async function dailyBudgetCap(req, res, next) {
  try {
    const { allowed } = await checkCounter('dailyBudgetBuckets', kstDateKey(), DAILY_BUDGET_MAX);
    if (!allowed) {
      return denyWithCleanup(req, res, 429, '오늘의 생성 한도에 도달했습니다. 운영팀에 문의해 주세요.', 'budget');
    }
    next();
  } catch (err) {
    console.error('[dailyBudgetCap] Firestore 오류, fail-open:', err?.message || err);
    next();
  }
}

function requirePhoto(req, res, next) {
  if (!req.file) return res.status(400).json({ error: '사진 파일이 없습니다. 먼저 촬영해 주세요.', code: 'no_photo' });
  next();
}

/* 7차 감사 발견(2026-09-02): parseMultipart는 이미 학생 사진을 /tmp에 써둔 상태에서
   다음 미들웨어로 넘어간다. 그런데 한도 미들웨어가 429로 요청을 끊으면 아래 /generate
   핸들러(finally에서 임시파일을 지우는 유일한 곳)까지 도달하지 못해, 막힌 요청의
   사진이 인스턴스 /tmp에 그대로 남았다 — checkPhotoGenerationLimit만 직접 지우고
   있었고 rateLimit·ipRateLimit·dailyBudgetCap 세 경로는 누락돼 있었다. 이건
   (a) README가 "정상/오류 경로 모두에서 생성 직후 삭제"라고 명시한 개인정보 약속의
   실제 위반이고, (b) Cloud Run의 /tmp는 메모리(512MiB)를 쓰므로 429가 쏟아지는
   바로 그 순간(=한도가 작동하는 순간)에 사진 12MB×N이 메모리에 쌓여 인스턴스가
   죽을 수 있는 가용성 문제이기도 하다. 모든 거부 경로를 이 함수 하나로 통일한다. */
// code는 화면이 실패 종류를 문구가 아니라 표시로 가르게 하는 값이다(2026-10-16, src/generateFailure.ts).
async function denyWithCleanup(req, res, status, message, code) {
  if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
  return res.status(status).json({ error: message, code });
}

async function rateLimit(req, res, next) {
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  try {
    const { allowed } = await checkCounter('rateLimitBuckets', String(bucket), RATE_LIMIT_MAX);
    if (!allowed) {
      return denyWithCleanup(req, res, 429, '지금 여러 부스에서 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.', 'busy_global');
    }
    next();
  } catch (err) {
    // Firestore 장애로 부스 전체가 멈추면 안 되므로 통과시키되, 인스턴스별 대체 한도 안에서만.
    console.error('[rateLimit] 카운터 오류 — 인스턴스 대체 한도로 처리:', err?.message || err);
    if (!fallbackAllowed()) {
      return denyWithCleanup(req, res, 429, '지금 여러 부스에서 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.', 'busy_global');
    }
    next();
  }
}

async function ipRateLimit(req, res, next) {
  const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  const ip = clientIpForRateLimit(req);
  try {
    const { allowed } = await checkCounter('ipRateLimitBuckets', `${bucket}:${ipKey(ip)}`, IP_RATE_LIMIT_MAX);
    if (!allowed) {
      return denyWithCleanup(req, res, 429, '이 네트워크에서 요청이 너무 많이 몰렸습니다. 잠시 후 다시 시도해 주세요.', 'busy_network');
    }
    next();
  } catch (err) {
    console.error('[ipRateLimit] Firestore 오류, fail-open:', err?.message || err);
    next();
  }
}

/* 생성 허용 시간창 — 비어 있으면 꺼짐(언제나 허용). 켜려면 GENERATE_WINDOWS_DEFAULT나 환경변수
   GENERATE_WINDOWS에 한국 시간 기준 "시작~끝"을 쉼표로 이어 적고 배포한다. 형식이 틀리면 함수가
   시작되지 않아 배포가 실패한다(잘못된 설정이 조용히 무시되지 않게).
   샘플: '2026-11-14T09:00~2026-11-14T18:00, 2026-11-07T13:00~2026-11-07T17:00' */
const GENERATE_WINDOWS_DEFAULT = '';
function parseGenerateWindows(text) {
  const items = String(text || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return items.map((item) => {
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})~(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/.exec(item);
    if (!m) throw new Error(`GENERATE_WINDOWS 형식 오류: "${item}" (예: 2026-11-14T09:00~2026-11-14T18:00)`);
    const start = Date.parse(`${m[1]}:00+09:00`);
    const end = Date.parse(`${m[2]}:00+09:00`);
    if (!(end > start)) throw new Error(`GENERATE_WINDOWS 시작이 끝보다 늦습니다: "${item}"`);
    return { start, end };
  });
}
function makeGenerateWindowGate(windows, now = () => Date.now()) {
  return (req, res, next) => {
    if (!windows.length) return next();
    const t = now();
    if (windows.some((w) => t >= w.start && t < w.end)) return next();
    return res.status(403).json({ error: '지금은 포스터 생성 운영 시간이 아닙니다. 운영 시간에 다시 시도해 주세요.', code: 'closed' });
  };
}
const generateWindowGate = makeGenerateWindowGate(
  parseGenerateWindows(process.env.GENERATE_WINDOWS ?? GENERATE_WINDOWS_DEFAULT)
);

// 요청 시간 예산은 요청이 들어온 순간부터 잰다(카운터 처리 시간도 예산 안에 넣는다).
function markRequestStart(req, res, next) {
  req.startedAt = Date.now();
  next();
}

function checkBoothToken(req, res, next) {
  const expected = Buffer.from(BOOTH_TOKEN.value() || '');
  const provided = Buffer.from(req.headers['x-booth-token'] || '');
  const ok = expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  if (!ok) return res.status(401).json({ error: '인증되지 않은 요청입니다.', code: 'token' });
  next();
}

/* 부스 코드 — 행사 기기에서만 생성을 허용할 때 켜는 스위치(기본 꺼짐). 켜지면 요청의 x-booth-code를
   SHA-256으로 바꿔 BOOTH_CODE_SHA256과 상수 시간 비교한다. 두 값은 저장소에 없고 배포할 때 CI가
   functions/.env.<프로젝트>에 넣는다(scripts/ci/booth-code-env.mjs). 꺼져 있으면 요청은 지금과 같다.
   켜졌는데 해시가 없거나 형식이 틀리면 함수가 시작되지 않아 배포가 실패한다(조용히 다 막거나 다 통과시키지 않게). */
const BOOTH_CODE_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
function makeBoothCodeGate({ required, sha256 }) {
  if (!required) return (req, res, next) => next();
  if (!/^[0-9a-f]{64}$/.test(sha256 || '')) {
    throw new Error('BOOTH_CODE_REQUIRED가 켜졌는데 BOOTH_CODE_SHA256이 없거나 형식이 틀립니다.');
  }
  const expected = Buffer.from(sha256, 'hex');
  return (req, res, next) => {
    const code = String(req.headers['x-booth-code'] || '');
    const provided = crypto.createHash('sha256').update(code).digest();
    if (BOOTH_CODE_PATTERN.test(code) && crypto.timingSafeEqual(provided, expected)) return next();
    return res.status(403).json({ error: '행사 부스에서만 만들 수 있어요.', code: 'booth_code' });
  };
}
let boothCodeGate = makeBoothCodeGate({
  required: process.env.BOOTH_CODE_REQUIRED === 'true',
  sha256: process.env.BOOTH_CODE_SHA256
});
function _setBoothCodeForTesting(config) {
  boothCodeGate = makeBoothCodeGate(config || { required: false });
}
function checkBoothCode(req, res, next) {
  return boothCodeGate(req, res, next);
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
    const { allowed } = await checkCounter('photoGenCounts', hash, PHOTO_GENERATION_LIMIT);
    // 셌으면 생성 실패 때 되돌릴 수 있게 남긴다(generateHandler). 카운터 오류로 통과한(fail-open) 요청은 세지 않았으니 되돌리지 않는다.
    if (allowed) req.photoCounted = hash;
    if (!allowed) {
      // 막힌 요청은 아래 /generate 핸들러(임시파일 정리 담당)까지 못 가므로 여기서 직접
      // 지워야 /tmp에 고아 파일이 안 남는다(2차 감사 때 고친 것과 같은 종류의 버그 재발 방지).
      // 7차 감사(2026-09-02)에서 다른 한도 미들웨어에도 같은 누락이 있는 게 확인돼
      // denyWithCleanup 하나로 통일했다 — await 없이 콜백 unlink만 쓰면 응답이 먼저 나가
      // 삭제 완료 전에 호출부가 확인하려 할 때 타이밍에 따라 실패한다(CI에서 실제로 발견).
      return denyWithCleanup(req, res, 429, '이 사진으로는 생성 횟수를 모두 사용했어요. 다시 촬영해 주세요.', 'photo_limit');
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
  // 크레딧 · 지출 한도도 429로 오므로 몰림(429)보다 먼저 가른다(isBillingError 참고).
  if (isBillingError(err))
    return { status: 500, code: 'credit', message: 'OpenAI 크레딧 잔액이 부족합니다. platform.openai.com에서 크레딧을 충전해 주세요.' };
  if (status === 429)
    return { status: 429, code: 'openai_busy', message: '지금 요청이 몰려 잠시 대기가 필요합니다. 10~20초 후 다시 시도해 주세요.' };
  if (status === 401 || /api key|incorrect key/i.test(raw))
    return { status: 500, code: 'key', message: 'API 키가 올바르지 않습니다. Firebase 시크릿(OPENAI_API_KEY)을 확인해 주세요.' };
  if (/moderation|safety|content policy/i.test(raw))
    return {
      status: 400,
      code: 'safety',
      message: '입력한 제목·문구 또는 사진이 안전 기준에 걸렸어요. 문구를 바꾸거나 다시 촬영해 주세요.'
    };
  if (/timed? ?out|abort/i.test(raw))
    return { status: 504, code: 'timeout', message: '생성 시간이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도해 주세요.' };
  if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(raw))
    return { status: 502, code: 'upstream', message: '인터넷 연결이 불안정합니다. 와이파이 연결을 확인하고 다시 시도해 주세요.' };
  return { status: 500, code: 'unknown', message: 'AI 이미지 생성 중 알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
}

app.post(
  '/generate',
  markRequestStart,
  checkBoothToken,
  checkBoothCode,
  generateWindowGate,
  parseMultipart,
  requirePhoto,
  rateLimit,
  ipRateLimit,
  // 7차 감사 발견(2026-09-02): checkPhotoGenerationLimit이 dailyBudgetCap 뒤에 있어서,
  // "같은 사진 3번째 요청"처럼 애초에 OpenAI를 절대 부르지 않는(=돈이 안 나가는) 요청도
  // 하루 예산 카운터를 그대로 소모했다. 부스토큰은 공개 소스에서 그대로 복사 가능하므로,
  // 사진 한 장을 반복 전송하는 것만으로 실제 지출 없이 DAILY_BUDGET_MAX(4000)를 태워
  // 행사 당일 전체를 "오늘의 생성 한도 도달"로 셧다운시킬 수 있었다(6차 감사에서 고친
  // "사진 없는 요청이 레이트리밋을 태우던" 것과 완전히 같은 종류의 결함). 지출 카운터는
  // 실제로 생성으로 이어질 요청만 세도록 순서를 뒤집는다.
  checkPhotoGenerationLimit,
  dailyBudgetCap,
  (req, res) => generateHandler(req, res)
);

// 임시 사진은 결과를 돌려주기 **전에** 지운다 — 응답 뒤로 미루면 삭제가 언제 끝날지 보장되지 않는다.
async function generateHandler(req, res) {
  const genre = req.body.genre || 'animation';
  const mode = req.body.mode === 'group' ? 'group' : 'solo';
  const title = sanitizePromptField(req.body.movieTitle, 60);
  const tagline = sanitizePromptField(req.body.tagline, 80);

  const t0 = Date.now();
  const deadlineAt = (req.startedAt ?? t0) + GENERATE_BUDGET_MS;
  let result;
  try {
    // 지시문 만들기도 try 안에 둔다 — 여기서 던져도 아래 catch(사진 카운터 되돌리기)와 임시 사진 삭제를 지나서 응답한다
    const prompt = buildPrompt({ genre, mode, title, tagline });
    const images = await generateArt(req.file.path, req.file.mimetype, prompt, deadlineAt);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[generate] 완료 ${sec}초  (모델=${MODEL} · 화질=${QUALITY} · 얼굴보존=${SENT_INPUT_FIDELITY ?? '보내지 않음(모델 기본)'})`);
    result = { status: 200, body: { images, meta: { genre, mode, seconds: Number(sec) } } };
  } catch (err) {
    console.error('[generate]', err?.status || '', err?.message || err);
    const { status, message, code } = mapGenerateError(err);
    result = { status, body: { error: message, code } };
    // 실패는 «사진당 2회»를 쓰지 않는다(결정 1). 되돌리기가 실패해도 응답은 그대로 보낸다 — 기회를 하나 잃을 뿐이다.
    if (req.photoCounted) {
      await releaseCounter('photoGenCounts', req.photoCounted).catch((e) =>
        console.error('[generate] 사진 카운터 되돌리기 실패:', e?.message || e)
      );
    }
  }
  await fs.promises.unlink(req.file.path).catch(() => {});
  res.status(result.status).json(result.body);
}

// 업로드/기타 오류도 항상 JSON으로 응답(브라우저가 HTML 오류를 받아 이상한 문구가 뜨는 것 방지)
app.use((err, req, res, _next) => {
  console.error('[error]', err?.message || err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '사진 파일이 너무 큽니다(최대 12MB).', code: 'too_large' });
  }
  res.status(400).json({ error: err?.message || '요청 처리 중 오류가 발생했습니다.', code: 'bad_request' });
});

// Firebase Hosting(poster-studio.web.app — 2026-09-01부로 GitHub Pages에서 이전)에서만
// 호출 가능하도록 CORS 제한.
// 로컬 개발 시에는 5500(Live Server)·8080(firebase serve) 포트도 허용.
// 프로젝트를 옮기거나 배포 도메인이 바뀌면 public/constants.js의 API_BASE와 이 목록을
// 반드시 같이 고칠 것 — 한쪽만 고치면 CORS가 막히거나 엉뚱한 프로젝트를 호출한다.
//
// 2026-09-01 추가(팀장 세션 경유, Voice Cinema 발견 공유): 6개 앱을 edutogether.kr/앱이름
// 아래로 통일하는 Portal 리버스 프록시는 정적 콘텐츠(HTML/JS)만 프록시하고, 브라우저의
// /generate 같은 API 호출은 여전히 원래 Cloud Functions 주소로 직접 나간다 — 그때 Origin
// 헤더는 프록시된 페이지 주소인 https://edutogether.kr가 된다(경로는 CORS Origin에
// 포함되지 않으므로 /poster-studio 서브경로 여부와 무관하게 이 한 줄이면 충분하다).
// 이 줄이 없으면 edutogether.kr/poster-studio 경유 접속에서만 CORS가 조용히 막힌다.
// 2026-09-09 추가(팀장 세션 경유, Voice Cinema 실측 공유): 이 앱의 주소가
// poster.edutogether.kr로 바뀐다. 위 edutogether.kr 줄이 이미 있어서 "들어가 있네"로
// 넘어가기 쉬운데, 정규식이 `^https://edutogether\.kr$`로 앵커돼 있어 **서브도메인은
// 매치하지 않는다** — 실제로 돌려서 https://poster.edutogether.kr이 거부되는 것을
// 확인했다. 그래서 별도 줄로 추가한다.
// 추가형이라 도메인이 실제로 붙기 전에 넣어도 무해하고(존재하지 않는 출처를 허용할
// 뿐이다), 그래야 "새 주소는 뜨는데 API만 조용히 막히는" 구간이 안 생긴다.
// 각 줄이 ^...$로 앵커돼 있어 접미사 위조(poster.edutogether.kr.attacker.com)나
// 접두사 위조(evil-poster.edutogether.kr)는 그대로 거부된다 — 실측으로 확인함.
const ALLOWED_ORIGINS = [
  /^https:\/\/poster-studio\.web\.app$/,
  /^https:\/\/poster-studio\.firebaseapp\.com$/,
  /^https:\/\/edutogether\.kr$/,
  /^https:\/\/poster\.edutogether\.kr$/,
  /^http:\/\/localhost:(5500|8080)$/,
  /^http:\/\/127\.0\.0\.1:(5500|8080)$/
];

// 테스트 전용 export. onRequest로 감싸기 전의 순수 함수/미들웨어를 그대로 노출해서,
// 실제 OpenAI 호출(=실비용) 없이 프롬프트 구성·업로드 파싱·레이트리밋을 검증한다.
export {
  app,
  buildPrompt,
  PROMPT_VERSIONS,
  PROMPT_VARIANT_BY_CELL,
  promptVersionFor,
  editAttempts,
  sanitizePromptField,
  parseMultipart,
  UPLOAD_DIR,
  mapGenerateError,
  RATE_LIMIT_MAX,
  IP_RATE_LIMIT_MAX,
  DAILY_BUDGET_MAX,
  kstDateKey,
  checkBoothToken,
  requirePhoto,
  rateLimit,
  ipRateLimit,
  dailyBudgetCap,
  checkPhotoGenerationLimit,
  PHOTO_GENERATION_LIMIT,
  clientIpForRateLimit,
  OPENAI_TIMEOUT_MS,
  GENERATE_BUDGET_MS,
  _setCounterImplForTesting,
  _setReleaseImplForTesting,
  _firestoreRelease,
  _firestoreIncrementAndCheck,
  editWithRetry,
  generateArt,
  checkOpenAIReachable,
  _setClientForTesting,
  _setSleepForTesting,
  _resetOpenAIHealthCacheForTesting,
  COUNTER_COLLECTIONS,
  COUNTER_TTL_MS,
  COUNTER_TTL_OVERRIDES_MS,
  cleanupOldCounters,
  MAX_REQUEST_BYTES,
  _setCounterTimeoutForTesting,
  FALLBACK_LIMIT_PER_INSTANCE,
  _resetFallbackForTesting,
  ipKey,
  parseGenerateWindows,
  makeGenerateWindowGate,
  makeBoothCodeGate,
  _setBoothCodeForTesting,
  markRequestStart,
  generateHandler,
  ALLOWED_ORIGINS
};

export const posterStudio = onRequest(
  {
    region: 'asia-northeast3',
    memory: '512MiB',
    // 2026-09-06: 120초 → 140초. OpenAI 클라이언트 타임아웃을 90→120초로 올리면서
    // 같이 조정 — 이 값이 클라이언트 타임아웃(120초)과 같거나 작으면, OpenAI 응답을
    // 기다리는 도중 Cloud Functions 자체가 먼저 강제 종료시켜 우리 쪽의 정상적인
    // JSON 에러 응답(mapGenerateError) 대신 플랫폼의 원시 타임아웃으로 끊길 수 있다.
    // 120초(클라이언트) < 140초(여기) < 150_000ms(public/api.js의 프론트 fetch abort)
    // 순서로 각 단계에 여유를 둔다.
    timeoutSeconds: 140,
    concurrency: 1,
    // 2026-08-29: 노트북 대수 확장 논의(최대 20대 검토) 때문에 5 → 25로 미리 상향.
    // concurrency:1이라 동시 처리 가능 요청 수 = maxInstances 그 자체 — 노트북 수보다
    // 낮으면 나머지는 대기열에 걸리다 timeoutSeconds(140초) 넘어 실패한다. 인스턴스
    // 상한 자체는 비용이 붙지 않는다(실제 생성 건수만 과금) — 진짜 비용 상한은
    // OpenAI 조직의 강제 한도($250, 2026-10-05 확인)가 맡는다.
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
   ALLOWED_ORIGINS·API_BASE와 함께 반드시 같이 고칠 것(_docs/ops/runbook.md 참고).

   2026-08-30: 1차 시도는 cloudscheduler.googleapis.com 미활성화로 막혔었고(대표가
   콘솔에서 활성화 완료), 2차 시도에서는 API는 통과했지만 실제 스케줄러 "작업(job)"
   생성/갱신에 필요한 IAM 권한이 CI 배포 계정에 없어서 다시 막혔었다(Secret Manager
   때 secretAccessor만으론 부족, viewer도 필요했던 것과 같은 패턴 — API 활성화와
   그 API 리소스를 실제로 만들 IAM 역할은 별개). 대표가
   github-actions-deploy@inky-poster-studio.iam.gserviceaccount.com에
   roles/cloudscheduler.admin을 프로젝트 레벨로 추가해 해결 — 아래 스케줄을
   09:00~18:55(기존 17:55에서 +1시간, 행사 종료 후 정리시간 버퍼)로 조정해
   CI가 실제로 스케줄러 작업 갱신까지 정상 처리하는지 검증한다. */
/* 6차 감사 발견(2026-09-01): README.md가 "30일 뒤 자동 삭제되도록 Firestore TTL
   정책을 적용합니다"라고 완료형으로 단정했는데, 실제로는 콘솔에서 TTL 정책을
   걸어야만 하는 미완료 상태였고(대표 콘솔 작업 필요, 이 세션은 gcloud가 없어
   CLI로 설정 불가) 코드에는 삭제 경로가 전혀 없었다 — README와 security-notes.md가
   서로 모순되는 상태였다. "콘솔 작업이라 코드로는 불가능"이라는 전제 자체가
   틀렸다는 게 이번에 확인돼(keepWarm과 같은 onSchedule 패턴을 그대로 재사용할 수
   있음), §4-1의 구조적 상한이 아니라 미구현 결함으로 재채점하고 여기서 직접 구현한다.
   지우는 대상은 순수 숫자 카운터 4종뿐(사진 원본·이름 등 개인정보는 애초에 여기 저장
   안 함) — updatedAt 필드는 _incrementAndCheck가 매번 갱신해두고 있어 추가 저장 불필요. */
const COUNTER_COLLECTIONS = ['rateLimitBuckets', 'ipRateLimitBuckets', 'photoGenCounts', 'dailyBudgetBuckets'];
const COUNTER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// IP 버킷은 10분짜리라 오래 둘 이유가 없다 — 하루 뒤 지운다.
const COUNTER_TTL_OVERRIDES_MS = { ipRateLimitBuckets: 24 * 60 * 60 * 1000 };

// dbInstance를 인자로 받는 이유: 테스트에서 진짜 Firestore를 두드리지 않고
// Firestore와 같은 모양(collection/where/limit/get/batch)의 가짜 객체를 주입하기 위함
// (_setCounterImplForTesting과 같은 취지 — 실비용 없이 삭제 로직 자체만 검증한다).
async function _deleteOldDocsInCollection(dbInstance, collectionName, cutoffDate) {
  let deleted = 0;
  for (;;) {
    const snap = await dbInstance.collection(collectionName).where('updatedAt', '<', cutoffDate).limit(500).get();
    if (snap.empty) break;
    const batch = dbInstance.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 500) break;
  }
  return deleted;
}

async function cleanupOldCounters(dbInstance = db, now = Date.now()) {
  let total = 0;
  for (const collectionName of COUNTER_COLLECTIONS) {
    const cutoff = new Date(now - (COUNTER_TTL_OVERRIDES_MS[collectionName] ?? COUNTER_TTL_MS));
    const deleted = await _deleteOldDocsInCollection(dbInstance, collectionName, cutoff);
    total += deleted;
    if (deleted) console.log(`[cleanupOldCounters] ${collectionName}: ${deleted}건 삭제`);
  }
  return total;
}

export const cleanupOldCountersSchedule = onSchedule(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 120,
    schedule: '0 4 * * *',
    timeZone: 'Asia/Seoul'
  },
  async () => {
    try {
      const total = await cleanupOldCounters();
      console.log(`[cleanupOldCounters] 완료, 총 ${total}건 삭제`);
    } catch (err) {
      console.error('[cleanupOldCounters] 실패:', err?.message || err);
    }
  }
);

export const keepWarm = onSchedule(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 30,
    schedule: '*/5 9-18 14 11 *',
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
