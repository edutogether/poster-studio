#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   배포 직전에 부스 코드 스위치를 Functions 환경 파일에 넣는다(.github/workflows/deploy.yml).

     node scripts/ci/booth-code-env.mjs <환경 파일>
     (환경변수 BOOTH_CODE_REQUIRED · BOOTH_CODE — 저장소 설정의 변수·비밀값에서 온다)

   - 꺼짐(변수 없음·false): 아무것도 쓰지 않는다 → 서버는 지금처럼 동작한다.
   - 켜짐(true): 코드의 SHA-256만 BOOTH_CODE_SHA256으로 쓴다. 코드 원문은 어디에도 남기지 않고,
     로그에는 켜짐/꺼짐만 남긴다.
   - 그 밖의 값이거나, 켜졌는데 코드가 없거나 형식이 틀리면 실패해 배포를 멈춘다.
   형식은 서버(functions/index.js)·화면(src/boothCode.ts)과 같다.
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BOOTH_CODE_FORMAT = /^[A-Za-z0-9-]{4,64}$/;

export function boothCodeEnv({ required = '', code = '' } = {}) {
  const flag = String(required ?? '').trim();
  if (flag === '' || flag === 'false') return '';
  if (flag !== 'true') throw new Error('BOOTH_CODE_REQUIRED는 true 또는 false여야 합니다');
  const value = String(code ?? '').trim();
  if (!BOOTH_CODE_FORMAT.test(value)) {
    throw new Error('부스 코드 스위치가 켜졌는데 코드가 없거나 형식(영문·숫자·하이픈 4~64자)이 틀립니다');
  }
  const sha256 = crypto.createHash('sha256').update(value).digest('hex');
  return `BOOTH_CODE_REQUIRED=true\nBOOTH_CODE_SHA256=${sha256}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('사용: node scripts/ci/booth-code-env.mjs <환경 파일>');
    process.exit(2);
  }
  try {
    const text = boothCodeEnv({ required: process.env.BOOTH_CODE_REQUIRED, code: process.env.BOOTH_CODE });
    if (text) {
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      fs.appendFileSync(file, (existing && !existing.endsWith('\n') ? '\n' : '') + text);
    }
    console.log(`부스 코드: ${text ? '켜짐' : '꺼짐'}`);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
