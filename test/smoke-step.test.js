// 배포 직후 «부스토큰 스모크테스트» 단계(.github/workflows/deploy.yml)를 가짜 curl로 실제 실행해 판정을 고정한다(2026-10-17).
// 종합감사 발견: 부스 코드 스위치를 켜면 코드 없는 요청은 403(booth_code)이 정상인데, 예전 단계는 400만 받아 배포가 늘 멈췄다.
// 단계 명령은 워크플로 파일에서 그대로 꺼낸다(scripts/ci/run-workflow-step.mjs의 extractRun — 로컬 배포가 쓰는 것과 같은 길).
import { test, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractRun } from '../scripts/ci/run-workflow-step.mjs';

const STEP = '부스토큰 스모크테스트 (배포 직후 실제 인증 확인)';
const script = extractRun(fs.readFileSync('.github/workflows/deploy.yml', 'utf8'), STEP);

// 가짜 curl: -o 파일에 본문을 쓰고 상태 숫자를 찍는다. x-booth-code 머리글이 있으면 FAKE_CODE와 같을 때 FAKE_WITH_CODE, 다르면 403.
const FAKE_CURL = `#!/usr/bin/env bash
echo called >> "$FAKE_CALLS"
out=""; code=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -H) case "$2" in x-booth-code:*) code="\${2#x-booth-code: }" ;; esac; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "$code" ]; then
  if [ "$code" = "$FAKE_CODE" ]; then st="$FAKE_WITH_CODE"; else st=403; fi
else
  st="$FAKE_NO_CODE"
fi
case "$st" in
  400) body='{"error":"사진 파일이 없습니다.","code":"no_photo"}' ;;
  403) body='{"error":"행사 부스에서만 만들 수 있어요.","code":"booth_code"}' ;;
  *) body='{"error":"x"}' ;;
esac
printf '%s' "$body" > "$out"
printf '%s' "$st"
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-step-'));
fs.writeFileSync(path.join(dir, 'curl'), FAKE_CURL, { mode: 0o755 });
fs.writeFileSync(path.join(dir, 'step.sh'), script);

/* 단계는 bash로 돈다. CI(리눅스)는 PATH의 bash를 쓴다. Windows의 PowerShell에는 bash가 PATH에 없어(2026-10-17 종합감사: 9개가
   «spawnSync bash ENOENT»로 실패) Git for Windows의 bash를 찾는다. 🔴 Git\bin\bash.exe(실행기)는 PATH 맨 앞에 Git 도구 폴더를 넣어
   가짜 대신 진짜 curl이 라이브를 부른다(실제로 겪음) — 그래서 Git\usr\bin\bash.exe를 쓰고 그 폴더는 가짜 curl 뒤에 둔다.
   System32의 bash.exe는 WSL 실행기라 쓰지 않는다. 못 찾으면 조용히 건너뛰지 않고 이유를 말하며 실패한다. */
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const roots = [process.env.ProgramFiles, process.env.ProgramW6432, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  return roots.map((root) => path.join(root, 'Git', 'usr', 'bin', 'bash.exe')).find((file) => fs.existsSync(file)) ?? null;
}
const BASH = findBash();

const run = (env) => {
  if (!BASH) throw new Error('bash를 찾지 못했다 — Git for Windows(Git Bash)를 설치하거나 bash가 PATH에 있는 셸에서 시험을 돌린다');
  const calls = path.join(dir, `calls-${crypto.randomUUID()}.log`);
  const toolPath = path.isAbsolute(BASH) ? [path.dirname(BASH)] : [];
  const r = spawnSync(BASH, ['--noprofile', '--norc', '-eo', 'pipefail', path.join(dir, 'step.sh')], {
    cwd: process.cwd(), encoding: 'utf8',
    env: {
      ...process.env, PATH: [dir, ...toolPath, process.env.PATH].join(path.delimiter),
      // 진짜 curl이 잘못 불려도 라이브에 닿지 못하게 닫힌 프록시로 보낸다
      HTTPS_PROXY: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', FAKE_CALLS: calls,
      BOOTH_CODE_REQUIRED: '', BOOTH_CODE: '', FAKE_CODE: 'INKY-TEST-CODE-0001', FAKE_WITH_CODE: '400', ...env,
    },
  });
  return { ...r, curlCalled: fs.existsSync(calls) };   // 가짜 curl이 불렸는가 — 진짜 curl이 불리면 false다
};

test.each([
  ['꺼짐 · 서버도 꺼짐(코드 없이 400) → 통과', { FAKE_NO_CODE: '400' }, 0, true],
  ['꺼짐인데 서버는 켜짐(코드 없이 403) — 어긋남 → 실패', { FAKE_NO_CODE: '403' }, 1, true],
  ['꺼짐 · 토큰 불일치(401) → 실패', { FAKE_NO_CODE: '401' }, 1, true],
  ['켜짐 · 서버도 켜짐 · 맞는 코드 → 통과', { BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: 'INKY-TEST-CODE-0001', FAKE_NO_CODE: '403' }, 0, true],
  ['켜짐인데 서버에 스위치가 안 들어감(코드 없이 400) → 실패', { BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: 'INKY-TEST-CODE-0001', FAKE_NO_CODE: '400' }, 1, true],
  ['켜짐 · 코드가 틀림(코드를 실어도 403) → 실패', { BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: 'WRONG-CODE-9999', FAKE_NO_CODE: '403' }, 1, true],
  ['켜짐인데 코드 값이 없음 → 실패', { BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: '', FAKE_NO_CODE: '403' }, 1, true],
  ['스위치 값이 true·false가 아님 → 요청 전에 실패', { BOOTH_CODE_REQUIRED: 'yes', FAKE_NO_CODE: '400' }, 1, false],
])('%s', (_name, env, want, curl) => {
  const r = run(env);
  expect(r.error).toBeUndefined();
  expect(r.curlCalled, '가짜 curl을 불렀는가(아니라면 진짜 curl이 불렸을 수 있다)').toBe(curl);
  expect(r.status, r.stdout + r.stderr).toBe(want);
});

test('켜짐에서 부스 코드 값은 로그에 찍히지 않는다', () => {
  const r = run({ BOOTH_CODE_REQUIRED: 'true', BOOTH_CODE: 'INKY-TEST-CODE-0001', FAKE_NO_CODE: '403' });
  expect(r.curlCalled).toBe(true);
  expect(r.status).toBe(0);
  expect(r.stdout + r.stderr).not.toContain('INKY-TEST-CODE-0001');
});
