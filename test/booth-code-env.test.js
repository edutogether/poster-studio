/* 배포 직전 부스 코드 설정(scripts/ci/booth-code-env.mjs).
   꺼짐이면 아무것도 쓰지 않고, 켜짐이면 해시만 쓰며, 값이 틀리면 배포를 멈춘다(종료 코드 1). */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { boothCodeEnv } from '../scripts/ci/booth-code-env.mjs';

const SCRIPT = path.join(process.cwd(), 'scripts', 'ci', 'booth-code-env.mjs');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

test('꺼짐(값 없음·false)이면 아무것도 쓰지 않는다', () => {
  for (const required of [undefined, '', 'false', ' false ']) {
    expect(boothCodeEnv({ required, code: 'INKY-1234' }), String(required)).toBe('');
  }
});

test('켜짐이면 코드 원문 없이 해시만 쓴다(앞뒤 공백은 빼고)', () => {
  const text = boothCodeEnv({ required: 'true', code: ' INKY-2026-ABCD \n' });
  expect(text).toBe(`BOOTH_CODE_REQUIRED=true\nBOOTH_CODE_SHA256=${sha('INKY-2026-ABCD')}\n`);
  expect(text).not.toContain('INKY-2026-ABCD');
});

test('켜졌는데 코드가 없거나 형식이 틀리면, 또는 스위치 값이 true/false가 아니면 오류다', () => {
  for (const code of [undefined, '', 'abc', '한글코드', 'a b c d', 'x'.repeat(65)]) {
    expect(() => boothCodeEnv({ required: 'true', code }), String(code)).toThrow();
  }
  for (const required of ['TRUE', 'yes', '1', 'on']) {
    expect(() => boothCodeEnv({ required, code: 'INKY-1234' }), required).toThrow();
  }
});

function run(env, file) {
  return spawnSync(process.execPath, [SCRIPT, file], {
    env: { ...process.env, BOOTH_CODE_REQUIRED: '', BOOTH_CODE: '', ...env },
    encoding: 'utf8'
  });
}

test('실행: 꺼짐이면 파일을 만들지 않고, 켜짐이면 이어 쓰며, 틀리면 종료 코드 1이고 코드를 출력하지 않는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'booth-env-'));
  const file = path.join(dir, '.env.test');
  try {
    const off = run({}, file);
    expect(off.status).toBe(0);
    expect(off.stdout).toContain('꺼짐');
    expect(fs.existsSync(file)).toBe(false);

    fs.writeFileSync(file, 'GENERATE_WINDOWS=');
    const on = run({ BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: 'INKY-2026-ABCD' }, file);
    expect(on.status).toBe(0);
    expect(on.stdout + on.stderr).not.toContain('INKY-2026-ABCD');
    expect(fs.readFileSync(file, 'utf8')).toBe(`GENERATE_WINDOWS=\nBOOTH_CODE_REQUIRED=true\nBOOTH_CODE_SHA256=${sha('INKY-2026-ABCD')}\n`);

    const bad = run({ BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: '틀린 코드' }, file);
    expect(bad.status).toBe(1);
    expect(bad.stdout + bad.stderr).not.toContain('틀린 코드');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
