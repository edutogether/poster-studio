# Windows 설치판 설치 · 제거 확인(2026-10-27, _docs/intents/2026-10-27-desktop-installer).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify/desktop-installer-probe.ps1 -Installer <PosterStudio-Setup.exe> -Out <결과 폴더> -Step install -InstallDir <설치 위치>
#   powershell ... -Step uninstall -InstallDir <설치 위치> -Out <결과 폴더>
#
# 사람이 더블클릭한 것처럼 설치 창을 띄우고(조용한 설치 /S가 아니다), 화면마다 그 창만 따로 찍은 뒤(PrintWindow — 다른 창을 가리거나
# 키보드를 빼앗지 않는다) 창의 «다음 · 설치 · 마침» 단추에 누름 메시지를 보낸다. 설치 위치 화면에서는 위치 칸에 -InstallDir를 넣는다.
# 키보드 입력을 흉내 내지 않는다 — 이 PC를 쓰는 사람의 다른 창에 글자가 들어가지 않게.
#
# install:   설치 창 화면 캡처 · 관리자 권한 없이(현재 사용자) 설치 · 고른 위치에 설치 · 바탕화면 · 시작 메뉴 바로가기(이름 · 대상 · 아이콘)
#            · «제거 프로그램»(HKCU) 등록 · 설치 끝나면 앱이 바로 뜨는지(창 제목 «Poster Studio») → 그 창을 닫아 끝나는지
# uninstall: 제거 창 화면 캡처 · 설치 폴더 · 바로가기 · 등록 · 앱 데이터(%APPDATA%\PosterStudio)가 지워지는지
# 결과는 <결과 폴더>/installer-<단계>.json, 하나라도 걸리면 종료코드 1.
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'uninstall')][string]$Step,
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [string]$Installer
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -ReferencedAssemblies System.Drawing @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Drawing; using System.Drawing.Imaging;
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr after, string cls, string title);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  public struct RECT { public int L, T, R, B; }
  public static string Text(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static void Shot(IntPtr h, string file) {
    RECT r; GetWindowRect(h, out r);
    using (var bmp = new Bitmap(r.R - r.L, r.B - r.T)) {
      using (var g = Graphics.FromImage(bmp)) { var hdc = g.GetHdc(); PrintWindow(h, hdc, 2); g.ReleaseHdc(hdc); }
      bmp.Save(file, ImageFormat.Png);
    }
  }
  // 화면에 보이는 #32770(대화 상자) 최상위 창 중 제목에 key가 든 것
  public static IntPtr FindDialog(string key) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { if (IsWindowVisible(h) && Cls(h) == "#32770" && Text(h).Contains(key)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  // 대화 상자 안의 글자를 모은다(화면이 무엇인지 기록하려고)
  public static string AllText(IntPtr p) {
    var sb = new StringBuilder();
    EnumChildWindows(p, (h, l) => { var t = Text(h); if (t.Length > 0 && IsWindowVisible(h)) sb.Append("[" + GetDlgCtrlID(h) + "]" + t.Replace("\r", " ").Replace("\n", " ") + " | "); return true; }, IntPtr.Zero);
    return sb.ToString();
  }
  public static IntPtr FindChildById(IntPtr p, int id) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(p, (h, l) => { if (GetDlgCtrlID(h) == id && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
"@
[Win]::SetProcessDPIAware() | Out-Null
$BM_CLICK = 0x00F5; $WM_SETTEXT = 0x000C
$report = [ordered]@{ step = $Step; installDir = $InstallDir; startedAt = (Get-Date).ToString('o'); pages = @(); checks = @() }
function Check($name, $ok, $detail) {
  $report.checks += [ordered]@{ name = $name; ok = [bool]$ok; detail = $detail }
  Write-Output ("{0}  {1}{2}" -f ($(if ($ok) { '통과' } else { '걸림' })), $name, $(if ($null -ne $detail -and "$detail" -ne '') { " — $detail" } else { '' }))
}
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Poster Studio.lnk'
$startLnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'Poster Studio.lnk'
# 앱 데이터 = %APPDATA%\PosterStudio(desktop/main.mjs가 설치기 이름에 맞춘다). 화면 이름 폴더(«Poster Studio»)도 없어야 한다.
$appData = Join-Path $env:APPDATA 'PosterStudio'
$appDataByTitle = Join-Path $env:APPDATA 'Poster Studio'
# 고른 위치가 앱 폴더 이름(PosterStudio)으로 끝나지 않으면 설치기가 그 아래에 PosterStudio 폴더를 만든다(일반 프로그램과 같은 동작)
$AppDir = if ((Split-Path $InstallDir -Leaf) -eq 'PosterStudio') { $InstallDir } else { Join-Path $InstallDir 'PosterStudio' }
$exe = Join-Path $AppDir 'PosterStudio.exe'
function UninstallEntry { Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -eq 'Poster Studio' } }
function LnkInfo($path) { if (-not (Test-Path $path)) { return $null }; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($path); return [ordered]@{ target = $s.TargetPath; icon = $s.IconLocation; dir = $s.WorkingDirectory } }

# 설치 · 제거 창을 화면마다 찍으며 «다음»(단추 1)을 누른다. 위치 화면(칸 1019)에서는 위치를 넣는다.
function Walk($key, $prefix) {
  $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 120 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 250; $h = [Win]::FindDialog($key) }
  if ($h -eq [IntPtr]::Zero) { return $false }
  $report.title = [Win]::Text($h)
  for ($n = 1; $n -le 12 -and [Win]::IsWindow($h); $n++) {
    $next = [Win]::GetDlgItem($h, 1)
    for ($w = 0; $w -lt 240 -and -not [Win]::IsWindowEnabled($next) -and [Win]::IsWindow($h); $w++) { Start-Sleep -Milliseconds 500 }   # 설치 · 제거 중에는 «다음»이 꺼져 있다
    if (-not [Win]::IsWindow($h)) { break }
    Start-Sleep -Milliseconds 600
    $file = Join-Path $Out ('{0}-{1:00}.png' -f $prefix, $n)
    [Win]::Shot($h, $file)
    $dir = [Win]::FindChildById($h, 1019)
    $page = [ordered]@{ shot = (Split-Path $file -Leaf); text = [Win]::AllText($h) }
    if ($dir -ne [IntPtr]::Zero -and $prefix -eq 'installer') {
      [Win]::SendMessage($dir, $WM_SETTEXT, [IntPtr]::Zero, $InstallDir) | Out-Null
      Start-Sleep -Milliseconds 300
      $page.setDir = $InstallDir
      [Win]::Shot($h, (Join-Path $Out ('{0}-{1:00}-위치.png' -f $prefix, $n)))
    }
    $report.pages += $page
    [Win]::PostMessage($next, $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 900
  }
  return $true
}

if ($Step -eq 'install') {
  Check '설치 전: 같은 이름의 설치가 없다' ((-not (UninstallEntry)) -and -not (Test-Path $exe)) $null
  $before = Get-Process PosterStudio -ErrorAction SilentlyContinue
  Check '설치 전: 앱이 떠 있지 않다' (-not $before) $null
  $p = Start-Process -FilePath $Installer -PassThru
  $walked = Walk 'Poster Studio' 'installer'
  Check '설치 창이 뜨고 화면을 끝까지 넘긴다' $walked $report.title
  $p.WaitForExit(60000) | Out-Null
  # 관리자 권한: 설치기 프로세스의 무결성 수준은 «보통»이어야 한다(권한 상승 창 없이)
  Check '고른 위치(아래 PosterStudio 폴더)에 설치된다' (Test-Path $exe) $exe
  $entry = UninstallEntry
  Check '«제거 프로그램»에 현재 사용자로 등록(HKCU — 관리자 권한 없이)' ($null -ne $entry) $(if ($entry) { "$($entry.DisplayName) · $($entry.Publisher) · $($entry.DisplayVersion) · $($entry.InstallLocation)" })
  $d = LnkInfo $desktopLnk; $s = LnkInfo $startLnk
  Check '바탕화면 바로가기 «Poster Studio»' ($d -and $d.target -ieq $exe) ($d | ConvertTo-Json -Compress)
  Check '시작 메뉴 바로가기 «Poster Studio»' ($s -and $s.target -ieq $exe) ($s | ConvertTo-Json -Compress)
  # 설치가 끝나면 앱이 바로 뜬다(마침 화면의 «Poster Studio 실행»)
  $app = $null
  for ($i = 0; $i -lt 60 -and -not $app; $i++) { Start-Sleep -Milliseconds 500; $app = Get-Process PosterStudio -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Poster Studio' } | Select-Object -First 1 }
  Check '설치가 끝나면 앱이 바로 뜬다(창 제목 «Poster Studio»)' ($null -ne $app) $(if ($app) { "$($app.Path)" })
  if ($app) {
    Start-Sleep -Seconds 5
    [Win]::Shot($app.MainWindowHandle, (Join-Path $Out 'app-after-install.png'))
    $app.CloseMainWindow() | Out-Null
    $gone = $app.WaitForExit(15000)
    Check '창을 닫으면 앱이 끝난다' $gone $null
    Get-Process PosterStudio -ErrorAction SilentlyContinue | ForEach-Object { $_.WaitForExit(10000) | Out-Null }
  }
} else {
  $un = Get-ChildItem $AppDir -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  Check '제거 프로그램 파일이 있다' ($un -and (Test-Path $un)) $un
  Start-Process -FilePath $un | Out-Null
  $walked = Walk 'Poster Studio' 'uninstaller'
  Check '제거 창이 뜨고 화면을 끝까지 넘긴다' $walked $report.title
  for ($i = 0; $i -lt 60 -and (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Seconds 2
  Check '설치 폴더의 앱이 지워진다' (-not (Test-Path $exe)) $(if (Test-Path $AppDir) { (Get-ChildItem $AppDir -Recurse | Measure-Object).Count.ToString() + '개 남음' } else { '폴더 없음' })
  Check '바탕화면 · 시작 메뉴 바로가기가 지워진다' (-not (Test-Path $desktopLnk) -and -not (Test-Path $startLnk)) $null
  Check '«제거 프로그램» 등록이 지워진다' (-not (UninstallEntry)) $null
  Check '앱 데이터(%APPDATA%\PosterStudio)가 지워지고 화면 이름 폴더도 없다' ((-not (Test-Path $appData)) -and (-not (Test-Path $appDataByTitle))) $appData
}
$report.finishedAt = (Get-Date).ToString('o')
$report | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $Out "installer-$Step.json")
$failed = @($report.checks | Where-Object { -not $_.ok }).Count
Write-Output $(if ($failed) { "걸림 $failed 건 / $($report.checks.Count)" } else { "모두 통과 $($report.checks.Count)건" })
exit $(if ($failed) { 1 } else { 0 })
