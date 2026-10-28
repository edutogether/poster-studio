# 자동 검사 창을 아래 작은 모니터로 옮긴다(2026-09-26 Bumm님 규칙 · 10/28 팀장 재확인 — 위 큰 모니터 두 대는 Bumm님이 쓰신다).
#   . (Join-Path $PSScriptRoot 'test-monitor.ps1')
#   Move-ToTestMonitor $hwnd            # 창 크기 그대로 그 모니터 작업 영역 왼쪽 위(+margin)로
#   Move-ToTestMonitor $hwnd -Maximize  # 그 모니터에서 최대화
#   Start-OnTestMonitor <파일> [인자]    # 그 모니터를 «여기에 띄우라»고 알려 주며 연다(ShellExecuteEx의 모니터 지정 — 탐색기가 다른 모니터에서 연 것과 같다) → 프로세스 번호(못 열면 0)
#     10/28 오후 팀장: 설치 창은 이 방법으로 — 뜬 뒤 옮기기는 위 모니터에 잠깐 보였다. 창을 처음부터 그 모니터에 두는지는 프로그램이 이 알림을 따르느냐에 달렸다
#     (창 감시 installer-window-watch.ps1의 «검사 모니터 밖 우리 창»으로 확인한다).
#     10/28 실측: 설치기(NSIS)는 이 알림을 따르지 않았다(첫 창이 위 모니터 쪽에 생김). 그래서 아래 «만들어지는 순간 옮기기»를 함께 쓴다.
#   Start-TestWindowPlacement / Stop-TestWindowPlacement  # 설치기 · 제거기 창(#32770)이 만들어지는 순간(보이기 전) 그 모니터 가운데로 옮긴다(10/28 팀장 4번 —
#     Windows 이벤트 EVENT_OBJECT_CREATE ~ SHOW를 이 도구 밖에서 받는다. 설치기 · 제거기 코드는 손대지 않는다. 제거기가 임시 폴더로 복사해 다시 띄운 창도 잡는다).
#     보이는 순간 그 모니터 밖이면 창을 숨기고 그 프로세스를 끈다(«즉시 중단»). 옮기기 전에 이미 보인 창은 «⚠ 옮기기 전에 이미 보였다»로 적는다.
# 어느 모니터인지는 test-monitor.json의 point(화면 좌표)를 품은 모니터다 — 모니터 이름(DISPLAYn)은 다시 연결하면 바뀐다.
# 그런 모니터가 없는 PC에서는 옮기지 않고 $false를 돌려준다. 좌표는 부른 프로세스의 DPI 방식대로 해석된다(옮기기만 하므로 상관없다).
if (-not ('TestMonitor' -as [type])) {
  Add-Type @"
using System; using System.Runtime.InteropServices;
public static class TestMonitor {
  public struct POINT { public int X, Y; }
  public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public RECT m; public RECT w; public int f; }
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr h, ref MI mi);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SEI {
    public int cbSize; public uint fMask; public IntPtr hwnd;
    public string lpVerb, lpFile, lpParameters, lpDirectory;
    public int nShow; public IntPtr hInstApp, lpIDList; public string lpClass;
    public IntPtr hkeyClass; public uint dwHotKey; public IntPtr hMonitor, hProcess;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ShellExecuteEx(ref SEI s);
  [DllImport("kernel32.dll")] static extern int GetProcessId(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  // 파일을 연다 — 그 점의 모니터가 있으면 SEE_MASK_HMONITOR로 그 모니터를 알린다. 돌려주는 것: 새 프로세스 번호(바로가기 등으로 프로세스를 못 받으면 0), 못 열면 -1
  public static int Start(string file, string args, int x, int y) {
    var p = new POINT(); p.X = x; p.Y = y;
    IntPtr m = MonitorFromPoint(p, 0);
    var s = new SEI(); s.cbSize = Marshal.SizeOf(s);
    s.fMask = 0x00000040 | (m != IntPtr.Zero ? 0x00200000u : 0u);   // SEE_MASK_NOCLOSEPROCESS | SEE_MASK_HMONITOR
    s.lpVerb = "open"; s.lpFile = file; s.lpParameters = args; s.nShow = 1; s.hMonitor = m;
    if (!ShellExecuteEx(ref s)) return -1;
    if (s.hProcess == IntPtr.Zero) return 0;
    int pid = GetProcessId(s.hProcess); CloseHandle(s.hProcess); return pid;
  }
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static int Pid(IntPtr h) { uint pid; GetWindowThreadProcessId(h, out pid); return (int)pid; }
  // 창이 그 점의 모니터에 있는가(창이 가장 많이 걸친 모니터) — 그 모니터가 없으면 false
  public static bool On(IntPtr h, int x, int y) {
    var p = new POINT(); p.X = x; p.Y = y;
    IntPtr m = MonitorFromPoint(p, 0);
    return m != IntPtr.Zero && IsWindow(h) && MonitorFromWindow(h, 2) == m;
  }
  // 그 점을 품은 모니터의 작업 영역 [L, T, R, B] — 없으면 null
  public static int[] Work(int x, int y) {
    var p = new POINT(); p.X = x; p.Y = y;
    IntPtr m = MonitorFromPoint(p, 0);   // MONITOR_DEFAULTTONULL
    if (m == IntPtr.Zero) return null;
    var mi = new MI(); mi.cb = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(m, ref mi)) return null;
    return new int[] { mi.w.L, mi.w.T, mi.w.R, mi.w.B };
  }
  // 옮기는 동안은 모니터별 DPI 좌표(실제 화소)로 계산한다 — 부르는 도구마다 DPI 방식이 달라도(탐침은 시스템 DPI, 녹화는 모니터별) 같은 자리에 놓이게
  public static bool Move(IntPtr h, int x, int y, int margin, bool maximize) {
    IntPtr old = SetThreadDpiAwarenessContext((IntPtr)(-4));   // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    try {
      var w = Work(x, y);
      if (w == null || !IsWindow(h)) return false;
      if (maximize) ShowWindow(h, 9);   // SW_RESTORE — 최대화된 채로는 다른 모니터로 옮겨지지 않는다
      SetWindowPos(h, IntPtr.Zero, w[0] + margin, w[1] + margin, 0, 0, 0x0001 | 0x0004 | 0x0010);   // NOSIZE | NOZORDER | NOACTIVATE
      if (maximize) ShowWindow(h, 3);   // SW_MAXIMIZE — 지금 놓인 모니터에서
      return true;
    } finally { SetThreadDpiAwarenessContext(old); }
  }
}
"@
}
if (-not ('TestPlace' -as [type])) {
  Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic; using System.Diagnostics; using System.Threading;
public static class TestPlace {
  public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr h, int obj, int child, uint thread, uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc cb, uint pid, uint tid, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint msg; public IntPtr w, l; public uint t; public int x, y; }
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint tid, uint msg, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public struct RECT { public int L, T, R, B; }
  public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public RECT m; public RECT w; public int f; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint f);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI mi);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  // 옮기는 것은 이 이름의 프로세스 창뿐이다(시험이 띄운 설치기 · 제거기 · 앱, 제거기가 임시 폴더에 복사한 Un_A …)
  static readonly string[] Procs = { "Poster Studio Setup", "Poster Studio", "Uninstall Poster Studio" };
  public static List<string> Moved = new List<string>(), Violations = new List<string>();
  public static volatile bool Aborted;
  static RECT mon, work; static WinEventProc keep; static uint tid; static Thread th;
  static bool Ours(string n) { return Array.IndexOf(Procs, n) >= 0 || System.Text.RegularExpressions.Regex.IsMatch(n, "^Un_[A-Z]$"); }
  static string Cls(IntPtr h) { var s = new StringBuilder(128); GetClassName(h, s, 128); return s.ToString(); }
  static string Text(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  // 그 점의 모니터를 찾아 훅을 건다. 그 모니터가 없으면 false(아무것도 옮기지 않는다)
  public static bool Start(int x, int y) {
    Moved.Clear(); Violations.Clear(); Aborted = false;
    var ready = new ManualResetEvent(false); bool ok = false;
    th = new Thread(() => {
      SetThreadDpiAwarenessContext((IntPtr)(-4));   // 모니터별 배율 인식(v2) — 위 100% · 아래 125%를 실제 화소로 다룬다
      var p = new POINT(); p.X = x; p.Y = y;
      IntPtr m = MonitorFromPoint(p, 0);
      var mi = new MI(); mi.cb = Marshal.SizeOf(mi);
      if (m == IntPtr.Zero || !GetMonitorInfo(m, ref mi)) { ready.Set(); return; }
      mon = mi.m; work = mi.w; tid = GetCurrentThreadId();
      MSG msg;
      keep = OnEvent;
      IntPtr hook = SetWinEventHook(0x8000, 0x8002, IntPtr.Zero, keep, 0, 0, 0x0002);   // 만들어짐 ~ 보임, 이 도구 밖에서 받기 · 이 도구의 창은 빼고
      ok = hook != IntPtr.Zero;
      ready.Set();
      while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { }
      UnhookWinEvent(hook);
    });
    th.IsBackground = true; th.Start();
    ready.WaitOne(5000);
    return ok;
  }
  public static void Stop() { if (th != null && th.IsAlive) { PostThreadMessage(tid, 0x0012, IntPtr.Zero, IntPtr.Zero); th.Join(3000); } }   // WM_QUIT
  static void OnEvent(IntPtr hook, uint ev, IntPtr h, int obj, int child, uint thread, uint time) {
    if (obj != 0 || child != 0 || h == IntPtr.Zero || GetAncestor(h, 2) != h) return;
    uint pid; GetWindowThreadProcessId(h, out pid);
    string name; try { name = Process.GetProcessById((int)pid).ProcessName; } catch { return; }
    if (!Ours(name) || Cls(h) != "#32770") return;   // 설치 · 제거 창과 묻는 창만 — 앱 창은 앱의 시험용 변수(POSTER_STUDIO_TEST_WINDOW)가 자리를 잡는다
    RECT r; GetWindowRect(h, out r);
    if (ev == 0x8002 && (r.L < mon.L || r.T < mon.T || r.R > mon.R || r.B > mon.B)) {
      ShowWindow(h, 0);
      try { Process.GetProcessById((int)pid).Kill(); } catch { }
      Aborted = true;
      lock (Moved) Violations.Add(string.Format("{0:HH:mm:ss.fff} {1} «{2}» 보인 자리 {3},{4} {5}x{6} — 숨기고 끔", DateTime.Now, name, Text(h), r.L, r.T, r.R - r.L, r.B - r.T));
      return;
    }
    if (r.L >= work.L && r.T >= work.T && r.R <= work.R && r.B <= work.B) return;
    bool visible = IsWindowVisible(h);
    int w = r.R - r.L, hh = r.B - r.T;
    int x = work.L + Math.Max(0, ((work.R - work.L) - w) / 2), y = work.T + Math.Max(0, ((work.B - work.T) - hh) / 2);
    SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, 0x0015);   // NOSIZE | NOZORDER | NOACTIVATE
    lock (Moved) Moved.Add(string.Format("{0:HH:mm:ss.fff} {1} {2} «{3}» {4},{5} → {6},{7}{8}", DateTime.Now, name, ev == 0x8000 ? "만들어짐" : "보임", Text(h), r.L, r.T, x, y, visible ? " ⚠ 옮기기 전에 이미 보였다" : ""));
  }
}
"@
}
$script:testMonitor = Get-Content (Join-Path $PSScriptRoot 'test-monitor.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Start-TestWindowPlacement { [TestPlace]::Start([int]$script:testMonitor.point[0], [int]$script:testMonitor.point[1]) }
# 돌려주는 것: moved(옮긴 창 · «⚠ 이미 보였다» 표시 포함) · violations(위 모니터에 보여 끈 창) · alreadyVisible(«이미 보였다» 수)
function Stop-TestWindowPlacement {
  [TestPlace]::Stop()
  $moved = @([TestPlace]::Moved); $bad = @([TestPlace]::Violations)
  [pscustomobject]@{ moved = $moved; violations = $bad; alreadyVisible = @($moved | Where-Object { $_ -match '이미 보였다' }).Count; aborted = [TestPlace]::Aborted }
}
function Move-ToTestMonitor([IntPtr]$Hwnd, [switch]$Maximize) {
  [TestMonitor]::Move($Hwnd, [int]$script:testMonitor.point[0], [int]$script:testMonitor.point[1], [int]$script:testMonitor.margin, [bool]$Maximize)
}
function Test-OnTestMonitor([IntPtr]$Hwnd) {
  [TestMonitor]::On($Hwnd, [int]$script:testMonitor.point[0], [int]$script:testMonitor.point[1])
}
# 검사 모니터가 있는데 창이 그 밖(위 모니터)에 떴으면 그 창의 프로세스를 바로 끈다 — 옮기지 않고 시험을 멈춘다(10/28 팀장 «위 모니터에서 창이 하나라도 잡히면 그 즉시 중단»).
# 끈 프로세스 «이름#번호»를 돌려준다. 검사 모니터 안이거나 그 모니터가 없는 PC면 $null.
function Stop-OffTestMonitor([IntPtr]$Hwnd) {
  $p = $script:testMonitor.point
  if ($null -eq [TestMonitor]::Work([int]$p[0], [int]$p[1]) -or (Test-OnTestMonitor $Hwnd)) { return $null }
  $id = [TestMonitor]::Pid($Hwnd)
  $name = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  "$name#$id"
}
function Start-OnTestMonitor([string]$FilePath, [string]$ArgumentList = '') {
  [TestMonitor]::Start($FilePath, $ArgumentList, [int]$script:testMonitor.point[0], [int]$script:testMonitor.point[1])
}
