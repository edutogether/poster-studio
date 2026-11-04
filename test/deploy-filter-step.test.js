// CI «배포 여부 판정» 단계(.github/workflows/deploy.yml changes 잡)를 임시 git 저장소에서 실제로 돌려 판정을 고정한다(2026-11-04).
// 행사 당일(EVENT_DAY, 한국 시간)에 설치판(desktop/)만 바뀐 커밋은 배포 잡만 건너뛴다(Bumm님 결정 3 ①, F-3-2) —
// 다른 날 · 하나라도 desktop/ 밖 · 날짜를 못 읽으면 예전 판정 그대로(문서만이면 건너뜀, 그 밖은 배포).
// 단계 명령은 워크플로 파일에서 그대로 꺼낸다(scripts/ci/run-workflow-step.mjs의 extractRun). 날짜는 가짜 date가 준다.
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractRun } from '../scripts/ci/run-workflow-step.mjs';

const WORKFLOW = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const script = extractRun(WORKFLOW, '배포 여부 판정');

// 가짜 date: TZ=KST-9(한국 시간)로 «+%F»를 물을 때만 FAKE_TODAY를 준다 — 한국 시간이 아닌 날짜로 판정하면 행사 날이 아니게 된다.
// FAKE_DATE_FAIL이면 날짜를 못 읽은 것처럼 실패한다.
const FAKE_DATE = `#!/usr/bin/env bash
[ -n "$FAKE_DATE_FAIL" ] && exit 1
if [ "$TZ" = "KST-9" ] && [ "$1" = "+%F" ]; then printf '%s\\n' "$FAKE_TODAY"; else echo 1970-01-01; fi
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-filter-'));
fs.mkdirSync(path.join(dir, 'bin'));
fs.writeFileSync(path.join(dir, 'bin', 'date'), FAKE_DATE, { mode: 0o755 });
fs.writeFileSync(path.join(dir, 'step.sh'), script);

// bash 찾기는 test/smoke-step.test.js와 같다(Git\\usr\\bin\\bash.exe — Git\\bin\\bash.exe는 PATH 앞에 진짜 도구를 넣는다).
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const roots = [process.env.ProgramFiles, process.env.ProgramW6432, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  return roots.map((root) => path.join(root, 'Git', 'usr', 'bin', 'bash.exe')).find((file) => fs.existsSync(file)) ?? null;
}
const BASH = findBash();

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** 바뀐 파일 목록으로 커밋 둘(앞 · 뒤)을 가진 저장소를 만들고 단계를 돌린다. 돌려주는 것: 종료코드 · code 값 · 로그. */
function run(files, env = {}) {
  if (!BASH) throw new Error('bash를 찾지 못했다 — Git for Windows(Git Bash)를 설치하거나 bash가 PATH에 있는 셸에서 시험을 돌린다');
  const repo = fs.mkdtempSync(path.join(dir, 'repo-'));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  const before = git(repo, 'rev-parse', 'HEAD');
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    fs.writeFileSync(path.join(repo, f), `${f}\n`);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'change');
  const sha = git(repo, 'rev-parse', 'HEAD');
  const out = path.join(repo, '..', `${path.basename(repo)}-output`);
  fs.writeFileSync(out, '');
  const toolPath = path.isAbsolute(BASH) ? [path.dirname(BASH)] : [];
  const r = spawnSync(BASH, ['--noprofile', '--norc', '-eo', 'pipefail', path.join(dir, 'step.sh')], {
    cwd: repo, encoding: 'utf8',
    env: {
      ...process.env, PATH: [path.join(dir, 'bin'), ...toolPath, process.env.PATH].join(path.delimiter),
      GITHUB_OUTPUT: out, EVENT_NAME: 'push', BEFORE: before, SHA: sha, EVENT_DAY: '2026-11-14', FAKE_TODAY: '2026-11-13', FAKE_DATE_FAIL: '',
      ...env,
    },
  });
  const lines = fs.readFileSync(out, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('code='));
  return { status: r.status, error: r.error, code: lines.length === 1 ? lines[0].slice(5) : `code 줄 ${lines.length}개`, log: r.stdout + r.stderr };
}

test('행사 날은 워크플로에 2026-11-14로 적혀 있고, 배포 잡 둘 다 이 판정을 따른다', () => {
  expect(WORKFLOW).toMatch(/^ {2}EVENT_DAY: '2026-11-14'$/m);
  expect(WORKFLOW.match(/if: needs\.changes\.outputs\.code == 'true'/g)).toHaveLength(2);
});

test('워크플로가 쓰는 시간대 KST-9는 진짜 date에서 한국 날짜를 준다(11/14 0시 · 24시 경계)', () => {
  expect(script).toContain('TZ=KST-9 date +%F');
  if (!BASH) throw new Error('bash를 찾지 못했다');
  const day = (utc) => spawnSync(BASH, ['--noprofile', '--norc', '-c', `TZ=KST-9 date -d '${utc}' +%F`], { encoding: 'utf8' }).stdout.trim();
  expect(day('2026-11-13T14:59:59Z')).toBe('2026-11-13');
  expect(day('2026-11-13T15:00:00Z')).toBe('2026-11-14');
  expect(day('2026-11-14T14:59:59Z')).toBe('2026-11-14');
  expect(day('2026-11-14T15:00:00Z')).toBe('2026-11-15');
});

const DESKTOP = ['desktop/main.mjs', 'desktop/build/installer.nsh'];
test.each([
  ['다른 날(11/13) · 설치판만 → 배포', DESKTOP, {}, 'true'],
  ['행사 날 · 설치판만 → 건너뜀', DESKTOP, { FAKE_TODAY: '2026-11-14' }, 'false'],
  ['다음 날(11/15) · 설치판만 → 배포', DESKTOP, { FAKE_TODAY: '2026-11-15' }, 'true'],
  ['행사 날 · 설치판 + 웹 코드 → 배포', [...DESKTOP, 'src/PosterStudio.tsx'], { FAKE_TODAY: '2026-11-14' }, 'true'],
  ['행사 날 · 설치판 + 문서 → 배포(카드 그대로 — 하나라도 desktop/ 밖)', [...DESKTOP, '_docs/CHANGELOG.md'], { FAKE_TODAY: '2026-11-14' }, 'true'],
  ['행사 날 · desktop/ 폴더가 아닌 이름(desktop.css · desktop-old/) → 배포', ['desktop.css', 'desktop-old/a.js'], { FAKE_TODAY: '2026-11-14' }, 'true'],
  ['행사 날 · 다른 폴더 안의 desktop(src/desktop.ts) → 배포', ['src/desktop.ts'], { FAKE_TODAY: '2026-11-14' }, 'true'],
  ['행사 날 · 문서만 → 건너뜀(예전 판정 그대로)', ['_docs/CHANGELOG.md', 'README.md'], { FAKE_TODAY: '2026-11-14' }, 'false'],
  ['다른 날 · 문서만 → 건너뜀(예전 판정 그대로)', ['_docs/CHANGELOG.md'], {}, 'false'],
  ['다른 날 · 웹 코드 → 배포', ['src/PosterStudio.tsx'], {}, 'true'],
  ['행사 날인데 날짜를 못 읽음 · 설치판만 → 배포', DESKTOP, { FAKE_TODAY: '2026-11-14', FAKE_DATE_FAIL: '1' }, 'true'],
  ['행사 날 · 수동 실행 · 설치판만 → 배포(이전 커밋을 모름)', DESKTOP, { FAKE_TODAY: '2026-11-14', EVENT_NAME: 'workflow_dispatch' }, 'true'],
  ['행사 날 값이 비어 있음 · 설치판만 → 배포', DESKTOP, { FAKE_TODAY: '', EVENT_DAY: '' }, 'true'],
])('%s', (_name, files, env, want) => {
  const r = run(files, env);
  expect(r.error).toBeUndefined();
  expect(r.status, r.log).toBe(0);
  expect(r.code, r.log).toBe(want);
  if (env.FAKE_TODAY === '2026-11-14' && want === 'false' && files.some((f) => f.startsWith('desktop/'))) {
    expect(r.log).toContain('행사 당일(2026-11-14, 한국 시간)');
  }
});
