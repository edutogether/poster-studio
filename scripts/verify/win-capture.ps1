# 앱 창 연속 캡처(2026-10-27, desktop-print-shift.mjs가 부른다). 다른 창을 가리거나 키보드를 빼앗지 않는다 — 그 창만 따로 찍는다(PrintWindow).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify/win-capture.ps1 -AppPid <앱 프로세스> -Out <폴더> -Seconds 8 [-IntervalMs 150] [-CancelPrintAfterMs 2500]
#
# -AppPid 프로세스의 보이는 주 창(크로뮴 창)을 IntervalMs마다 <폴더>/frame-NNN.png로 찍는다. 같은 프로세스에 Windows 인쇄 창(#32770, 제목에 «인쇄»)이
# 뜨면 그 창도 print-dialog-NNN.png로 찍고, 뜬 지 CancelPrintAfterMs가 지나면 «취소»(IDCANCEL)를 눌러 닫는다 — 실제로 인쇄하지 않는다.
# 찍은 시각과 창 상태는 <폴더>/frames.json.
# -Maximize: 앱 창이 뜰 때까지 기다려 검사용 아래 모니터로 옮겨 최대화하고 끝낸다(test-monitor.ps1 — 10/28 «자동 검사 창은 아래 작은 모니터에만»,
#   그런 모니터가 없는 PC에서는 그 자리에서 최대화). 앱 창을 띄우는 확인 도구(desktop-app-probe · desktop-vs-web · desktop-print-shift)가 부른다.
param(
  [Parameter(Mandatory = $true)][int]$AppPid,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Seconds = 8,
  [int]$IntervalMs = 150,
  [int]$CancelPrintAfterMs = 2500,
  [switch]$Maximize
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -ReferencedAssemblies System.Drawing @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Drawing; using System.Drawing.Imaging;
public static class Cap {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  public struct RECT { public int L, T, R, B; }
  public static string Text(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static IntPtr Find(uint pid, string cls, string titleContains) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h) && Cls(h) == cls && Text(h).Contains(titleContains)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  // Windows 11의 새 인쇄 창은 앱이 아니라 PrintDialog 프로세스가 띄운다 — 그 프로세스의 보이는 창(크기가 있는 것)
  public static IntPtr FindIn(uint[] pids) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); RECT r; GetWindowRect(h, out r);
      if ((Array.IndexOf(pids, p) >= 0 || Text(h) == "Windows 인쇄") && IsWindowVisible(h) && r.R - r.L > 100 && r.B - r.T > 100) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static string Shot(IntPtr h, string file) {
    RECT r; GetWindowRect(h, out r);
    int w = r.R - r.L, hh = r.B - r.T;
    if (w <= 0 || hh <= 0) return "";
    using (var bmp = new Bitmap(w, hh)) {
      using (var g = Graphics.FromImage(bmp)) { var hdc = g.GetHdc(); PrintWindow(h, hdc, 2); g.ReleaseHdc(hdc); }
      bmp.Save(file, ImageFormat.Png);
    }
    return r.L + "," + r.T + "," + w + "x" + hh;
  }
}
"@
[Cap]::SetProcessDPIAware() | Out-Null
# -Maximize: 앱 창이 뜰 때까지 기다려 검사용 아래 모니터에서 최대화하고 끝낸다
if ($Maximize) {
  . (Join-Path $PSScriptRoot 'test-monitor.ps1')
  for ($i = 0; $i -lt 160; $i++) { $m = [Cap]::Find([uint32]$AppPid, 'Chrome_WidgetWin_1', 'Poster Studio'); if ($m -ne [IntPtr]::Zero) { if (-not (Move-ToTestMonitor $m -Maximize)) { [Cap]::ShowWindow($m, 3) | Out-Null }; exit 0 }; Start-Sleep -Milliseconds 125 }
  exit 1
}
$frames = @()
$dialogSince = $null
$cancelled = $false
$sw = [Diagnostics.Stopwatch]::StartNew()
$n = 0
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  $n++
  $main = [Cap]::Find([uint32]$AppPid, 'Chrome_WidgetWin_1', 'Poster Studio')
  # 인쇄 창: 옛 공용 대화 상자(앱 프로세스의 #32770 «인쇄») 또는 Windows 11 새 인쇄 창(PrintDialog 프로세스)
  $dlg = [Cap]::Find([uint32]$AppPid, '#32770', '인쇄')
  $modern = $false
  if ($dlg -eq [IntPtr]::Zero) {
    $pids = [uint32[]]@(Get-Process PrintDialog -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $dlg = [Cap]::FindIn($pids); $modern = ($dlg -ne [IntPtr]::Zero)
  }
  $f = [ordered]@{ n = $n; t = [math]::Round($sw.Elapsed.TotalMilliseconds) ; printDialog = ($dlg -ne [IntPtr]::Zero); appAlive = [bool](Get-Process -Id $AppPid -ErrorAction SilentlyContinue) }
  if ($main -ne [IntPtr]::Zero) { $f.main = [Cap]::Shot($main, (Join-Path $Out ('frame-{0:000}.png' -f $n))); $f.shot = ('frame-{0:000}.png' -f $n) }
  if ($dlg -ne [IntPtr]::Zero) {
    $f.dialog = "$([Cap]::Cls($dlg)) · $([Cap]::Text($dlg))$(if ($modern) { ' · PrintDialog' })"
    if ($null -eq $dialogSince) { $dialogSince = $sw.Elapsed.TotalMilliseconds; [Cap]::Shot($dlg, (Join-Path $Out ('print-dialog-{0:000}.png' -f $n))) | Out-Null; $f.dialogShot = ('print-dialog-{0:000}.png' -f $n) }
    if (-not $cancelled -and ($sw.Elapsed.TotalMilliseconds - $dialogSince) -ge $CancelPrintAfterMs) {
      if ($modern) { [Cap]::PostMessage($dlg, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }   # WM_CLOSE — 새 인쇄 창은 닫으면 취소다
      else { [Cap]::PostMessage([Cap]::GetDlgItem($dlg, 2), 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }   # BM_CLICK «취소»
      $cancelled = $true; $f.cancelled = $true
    }
  }
  $frames += $f
  Start-Sleep -Milliseconds $IntervalMs
}
[ordered]@{ pid = $AppPid; frames = $frames; printDialogAt = $dialogSince; cancelled = $cancelled } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $Out 'frames.json')
