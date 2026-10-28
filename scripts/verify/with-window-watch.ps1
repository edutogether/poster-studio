# node 확인 도구 하나를 창 감시(installer-window-watch.ps1)와 함께 돌린다(2026-10-28 — 창 크기 시험 · 끌기 녹화).
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify/with-window-watch.ps1 -Out <결과 폴더> -Script <도구.mjs> -ArgsLine "<도구 인자>"
#   (창 없이 띄울 때는 run-hidden.ps1 -NoElevate로 감싼다 — 이 PC의 기본 콘솔은 숨김 지정에도 창을 띄운다)
# 도구는 <결과 폴더>를 첫 인자로 받고, 출력은 <결과 폴더>.log, 창 기록은 <결과 폴더>-창기록/.
# 종료코드: 도구가 실패했거나 · 콘솔 창이 하나라도 보였거나 · 우리 창이 검사 모니터 밖에 한 번이라도 보였으면 1.
param([Parameter(Mandatory = $true)][string]$Out, [Parameter(Mandatory = $true)][string]$Script, [string]$ArgsLine = '', [int]$MaxSeconds = 10800)
. (Join-Path $PSScriptRoot 'installer-window-watch.ps1')
$w = Start-WindowWatch -Out "$Out-창기록" -MaxSeconds $MaxSeconds
# 인자는 빈칸으로 나누되 따옴표("…" · '…') 안의 빈칸은 그대로 둔다 — 설치한 실행 파일 경로(C:\Program Files\…)에 빈칸이 있다
$argv = @((Resolve-Path $Script).Path, $Out) + @([regex]::Matches($ArgsLine, '"[^"]*"|''[^'']*''|\S+') | ForEach-Object { $_.Value.Trim('"', "'") })
& node @argv *> "$Out.log"
$code = $LASTEXITCODE
$s = Stop-WindowWatch $w
"도구 종료코드 $code · 창 감시: $($s.summary)"
foreach ($l in $s.consoleLines) { "  콘솔 $l" }
foreach ($l in $s.offMonitorLines) { "  밖 $l" }
if ($code -ne 0 -or $s.consoleWindows -gt 0 -or $s.offMonitorWindows -gt 0) { exit 1 }
exit 0
