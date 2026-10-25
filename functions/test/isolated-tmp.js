/* 시험이 쓰는 OS 임시 폴더를 이 시험 실행만의 폴더로 바꾼다(2026-10-26 종합감사).
   운영 코드는 올린 사진을 os.tmpdir()/uploads(UPLOAD_DIR)에 잠깐 쓰는데, 시험이 공용 임시 폴더를 쓰면
   ① 다른 프로세스(다른 세션의 시험 · QA 도구)가 같은 폴더에 쓸 때 «파일 수» 검사가 흔들리고(실제로 114개 중 1개가 «2 ≠ 3»으로 실패했다)
   ② 실패한 시험이 남긴 파일이 공용 폴더에 그대로 남는다. 시험 파일이 index.js를 가져오기 전에 돌아야 하므로 setupFiles로 건다. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-fn-test-'));
process.env.TEMP = process.env.TMP = process.env.TMPDIR = dir;
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
