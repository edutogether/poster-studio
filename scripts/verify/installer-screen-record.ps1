# 설치 창이 뜨면 그 창을 «맨 위»로 올리고(키보드 초점은 빼앗지 않음 — SWP_NOACTIVATE) 그 창 자리의 «실제 화면»(사람 눈에 보이는 합성 화면 — ffmpeg gdigrab)을
# 초당 30장으로 녹화한다. 맨 위로 올리지 않으면 다른 창이 그 자리를 가려 설치 창이 안 찍힌다(10/27 1차). 관리자 권한 설치 창이라 이 스크립트도 관리자 권한으로 돌린다.
#   사용: run-hidden.ps1 -Script scripts/verify/installer-screen-record.ps1 -ArgsLine "-Out '<폴더>' -Seconds 60" -Log <기록> -NoWait → 그다음 desktop-installer-probe.ps1로 설치.
#   (관리자 권한 · 창 없이 — Start-Process -WindowStyle Hidden은 이 PC의 기본 콘솔(Windows 터미널)이 창을 띄웠다, 10/28)
#   창은 먼저 검사용 아래 모니터로 옮긴다(test-monitor.ps1 — 10/28 팀장 «자동 검사 창은 아래 작은 모니터에만»). 그 모니터는 125%라
#   창 자리를 모니터별 DPI 좌표(실제 화소)로 읽어야 ffmpeg가 그 자리를 찍는다(10/28 시험 창으로 확인). 녹화는 화면에 보이는 그대로(125%로 늘어난 창)다.
#   녹화는 설치 창 자리만 찍고, 창이 닫히면 바로 멈춘다(그 자리에 보이는 다른 창이 찍히지 않게). 제거 창은 -Title 'Poster Studio 제거'.
param([Parameter(Mandatory = $true)][string]$Out, [int]$Seconds = 60, [string]$Title = 'Poster Studio 설치')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class FW {
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  // 실제 화소 좌표(모니터별 DPI)로 읽은 창 자리 — ffmpeg gdigrab의 좌표와 같다
  public static RECT Physical(IntPtr h) { IntPtr old = SetThreadDpiAwarenessContext((IntPtr)(-4)); RECT r; GetWindowRect(h, out r); SetThreadDpiAwarenessContext(old); return r; }
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  public struct RECT { public int L, T, R, B; }
  public static IntPtr Find(string title) { IntPtr f = IntPtr.Zero; EnumWindows((h, l) => { var s = new StringBuilder(256); GetWindowText(h, s, 256); RECT r; GetWindowRect(h, out r); if (IsWindowVisible(h) && s.ToString().StartsWith(title) && r.R - r.L > 300) { f = h; return false; } return true; }, IntPtr.Zero); return f; }
}
"@
. (Join-Path $PSScriptRoot 'test-monitor.ps1')
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 1200 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 50; $h = [FW]::Find($Title) }
if ($h -eq [IntPtr]::Zero) { 'no window' | Set-Content "$Out\watch.txt"; exit 1 }
# HWND_TOPMOST(-1) · NOSIZE(1)|NOMOVE(2)|NOACTIVATE(0x10)|SHOWWINDOW(0x40)
# 설치 창이 보이는 동안만 그 창 자리를 찍는다 — 창이 숨거나 닫히면 바로 멈추고(ffmpeg에 q), 같은 제목의 창이 다시 뜨면 새 토막(screen-NN.mkv)으로 잇는다.
# «모든 사용자»는 첫 창(설치 범위)이 숨고 관리자 권한 창이 새로 뜬다(10/28 — 예전 판은 첫 창이 숨는 순간 멈춰 진행 화면을 못 찍었다).
# 창이 없는 동안 그 자리에 보이는 다른 창은 찍지 않는다(10/27 6차: 닫힌 뒤까지 찍혀 지웠다). 창이 15초 동안 다시 안 뜨면 끝낸다.
"start $((Get-Date).ToString('HH:mm:ss.fff'))" | Set-Content "$Out\watch.txt" -Encoding UTF8
$deadline = (Get-Date).AddSeconds($Seconds)
$part = 0
while ($h -ne [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
  $part++
  $moved = Move-ToTestMonitor $h
  Start-Sleep -Milliseconds 150   # 옮긴 자리에 다시 그려지기를
  $topmost = [FW]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x53)
  $r = [FW]::Physical($h)
  $w = $r.R - $r.L; $hh = $r.B - $r.T
  if ($w % 2) { $w-- }; if ($hh % 2) { $hh-- }
  $file = "$Out\screen-{0:00}.mkv" -f $part
  "part $part rect $($r.L),$($r.T) ${w}x${hh} 검사 모니터 $moved topmost $topmost start $((Get-Date).ToString('HH:mm:ss.fff'))" | Add-Content "$Out\watch.txt" -Encoding UTF8
  $left = [int][Math]::Max(1, ($deadline - (Get-Date)).TotalSeconds)
  $psi = New-Object System.Diagnostics.ProcessStartInfo('ffmpeg', ('-y -loglevel error -f gdigrab -framerate 30 -offset_x {0} -offset_y {1} -video_size {2}x{3} -i desktop -t {4} -c:v ffv1 "{5}"' -f $r.L, $r.T, $w, $hh, $left, $file))
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.CreateNoWindow = $true
  $ff = [System.Diagnostics.Process]::Start($psi)
  # 화면을 넘길 때 설치기가 바깥 창 그리기를 잠깐 멈추면(WM_SETREDRAW — 그동안 «보이지 않음»으로 읽힌다, 10/28 깜빡임 고침) 그 사이도 이어서 찍는다 — 0.7초 넘게 안 보일 때만 멈춘다
  $hiddenSince = $null
  while (-not $ff.HasExited -and [FW]::IsWindow($h)) {
    if ([FW]::IsWindowVisible($h)) { $hiddenSince = $null }
    elseif ($null -eq $hiddenSince) { $hiddenSince = Get-Date }
    elseif (((Get-Date) - $hiddenSince).TotalMilliseconds -ge 700) { break }
    Start-Sleep -Milliseconds 50
  }
  if (-not $ff.HasExited) { $ff.StandardInput.Write('q'); $ff.StandardInput.Close(); $ff.WaitForExit(10000) | Out-Null }
  "part $part stop $((Get-Date).ToString('HH:mm:ss.fff')) ffmpeg exit $($ff.ExitCode) · 창이 닫힘 $(-not [FW]::IsWindow($h))" | Add-Content "$Out\watch.txt" -Encoding UTF8
  # 녹화가 끝나면 맨 위를 푼다(창이 남아 있으면 — HWND_NOTOPMOST(-2), NOSIZE|NOMOVE|NOACTIVATE)
  [FW]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x13) | Out-Null
  $prev = $h; $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 300 -and $h -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline; $i++) {
    Start-Sleep -Milliseconds 50
    $c = [FW]::Find($Title)
    if ($c -ne [IntPtr]::Zero -and ($c -ne $prev -or [FW]::IsWindowVisible($c))) { $h = $c }
  }
}
