# 설치 · 제거 동안 화면에 보인 맨 위 창을 기록한다(2026-10-28 팀장 — «설치할 때 관리자: Windows PowerShell 창이 뜬다», 기준: 콘솔 창 0번).
#   . (Join-Path $PSScriptRoot 'installer-window-watch.ps1')
#   $w = Start-WindowWatch -Out <폴더>      # 이 프로세스 안 다른 실행 공간에서 돈다(새 창 · 새 프로세스 없음)
#   ... 설치 · 제거 ...
#   $sum = Stop-WindowWatch $w              # <폴더>/windows.log · windows.json, 요약(콘솔 창 수 등)을 돌려준다
# 두 가지로 본다: ① 0.1초마다 보이는 맨 위 창 목록을 견줘 새로 뜬 창 · 사라진 창 ② 창이 «보이게 된» 순간마다 Windows가 보내는 알림(EVENT_OBJECT_SHOW) —
# 0.1초보다 짧게 떴다 사라진 창도 잡는다. 콘솔 창 = 창 종류 ConsoleWindowClass(콘솔) · CASCADIA_HOSTING_WINDOW_CLASS(Windows 터미널),
# 또는 프로세스 powershell · pwsh · cmd · conhost · OpenConsole · WindowsTerminal. 시작할 때 이미 있던 창은 세지 않는다.
# 창 제목은 «Poster Studio»가 든 창과 콘솔 창만 적는다(그 밖의 창은 사람의 다른 일이라 «제목 적지 않음»).
# 우리 창(Poster Studio 앱 · 설치기 · 제거기 · 시험용 electron)이 검사용 아래 모니터(test-monitor.json의 점) 밖에 보이면 «검사 모니터 밖» 줄로 따로 센다 —
# 처음 보일 때와 0.1초마다(옮겨 간 것까지) 본다(10/28 팀장 «위 큰 모니터 두 대에는 한순간도 뜨지 않게»). 그 모니터가 없는 PC에서는 세지 않는다.
if (-not ('WinWatch' -as [type])) {
  Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic; using System.Diagnostics; using System.IO;
public static class WinWatch {
  delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int idObj, int idChild, uint thread, uint time);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc proc, uint pid, uint tid, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint m; public IntPtr w; public IntPtr l; public uint t; public int x, y; }
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h, uint min, uint max, uint remove);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG m);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint flags);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  static readonly string[] OurProcs = { "Poster Studio", "Poster Studio Setup", "Un_A", "Un_B", "electron" };
  static IntPtr testMon = IntPtr.Zero;
  static bool Ours(IntPtr h) { string p = Proc(h); p = p.Substring(0, p.IndexOf('#')); RECT r; GetWindowRect(h, out r); return (Array.IndexOf(OurProcs, p) >= 0 || Title(h).Contains("Poster Studio")) && r.R - r.L > 1 && r.B - r.T > 1; }
  static bool OffTest(IntPtr h) { return testMon != IntPtr.Zero && Ours(h) && MonitorFromWindow(h, 2) != testMon; }
  static readonly string[] ConsoleClasses = { "ConsoleWindowClass", "CASCADIA_HOSTING_WINDOW_CLASS" };
  static readonly string[] ConsoleProcs = { "powershell", "pwsh", "cmd", "conhost", "OpenConsole", "WindowsTerminal" };
  static string Cls(IntPtr h) { var c = new StringBuilder(128); GetClassName(h, c, 128); return c.ToString(); }
  static string Title(IntPtr h) { var t = new StringBuilder(256); GetWindowText(h, t, 256); return t.ToString(); }
  static string Proc(IntPtr h) { uint pid; GetWindowThreadProcessId(h, out pid); try { return Process.GetProcessById((int)pid).ProcessName + "#" + pid; } catch { return "?#" + pid; } }
  public static bool IsConsole(IntPtr h) {
    string c = Cls(h), p = Proc(h);
    p = p.Substring(0, p.IndexOf('#'));
    return Array.IndexOf(ConsoleClasses, c) >= 0 || Array.IndexOf(ConsoleProcs, p) >= 0;
  }
  static string Desc(IntPtr h) {
    string t = Title(h); bool con = IsConsole(h);
    RECT r; GetWindowRect(h, out r);
    string shown = (con || t.Contains("Poster Studio")) ? t : "(제목 적지 않음)";
    return (con ? "콘솔 " : "") + "[" + Cls(h) + "] '" + shown + "' " + Proc(h) + " " + r.L + "," + r.T + " " + (r.R - r.L) + "x" + (r.B - r.T);
  }
  static Dictionary<long, string> Visible() {
    var d = new Dictionary<long, string>();
    EnumWindows((h, l) => { if (IsWindowVisible(h)) d[h.ToInt64()] = Desc(h); return true; }, IntPtr.Zero);
    return d;
  }
  // stopFile이 생기거나 maxMs가 지나면 끝낸다. 돌려주는 것: 기록 줄들(맨 앞 «요약 …» 한 줄)
  public static List<string> Run(string stopFile, int maxMs, int pollMs, int testX, int testY) {
    var tp = new POINT(); tp.X = testX; tp.Y = testY; testMon = MonitorFromPoint(tp, 0);
    var off = new HashSet<long>();
    var log = new List<string>();
    var sw = Stopwatch.StartNew();
    var start = Visible();
    var prev = start;
    var consoles = new HashSet<long>();
    var showCount = 0;
    WinEventProc proc = (hk, ev, h, idObj, idChild, th, tm) => {
      if (idObj != 0 || h == IntPtr.Zero || GetAncestor(h, 2) != h || !IsWindowVisible(h) || start.ContainsKey(h.ToInt64())) return;
      showCount++;
      bool con = IsConsole(h);
      if (con) consoles.Add(h.ToInt64());
      log.Add(string.Format("{0,8:0.000} 보임 {1}", sw.ElapsedMilliseconds / 1000.0, Desc(h)));
      if (OffTest(h) && off.Add(h.ToInt64())) log.Add(string.Format("{0,8:0.000} 검사 모니터 밖 {1}", sw.ElapsedMilliseconds / 1000.0, Desc(h)));
    };
    IntPtr hook = SetWinEventHook(0x8002, 0x8002, IntPtr.Zero, proc, 0, 0, 0);   // EVENT_OBJECT_SHOW, 밖에서 받기
    long next = 0;
    while (sw.ElapsedMilliseconds < maxMs && !File.Exists(stopFile)) {
      MSG m;
      while (PeekMessage(out m, IntPtr.Zero, 0, 0, 1)) { TranslateMessage(ref m); DispatchMessage(ref m); }
      if (sw.ElapsedMilliseconds >= next) {
        next = sw.ElapsedMilliseconds + pollMs;
        var cur = Visible();
        foreach (var k in cur.Keys) if (!prev.ContainsKey(k) && !start.ContainsKey(k)) {
          if (IsConsole((IntPtr)k)) consoles.Add(k);
          log.Add(string.Format("{0,8:0.000} 새 창 {1}", sw.ElapsedMilliseconds / 1000.0, cur[k]));
        }
        foreach (var k in prev.Keys) if (!cur.ContainsKey(k) && !start.ContainsKey(k)) log.Add(string.Format("{0,8:0.000} 사라짐 {1}", sw.ElapsedMilliseconds / 1000.0, prev[k]));
        prev = cur;
        foreach (var k in cur.Keys) if (!start.ContainsKey(k) && OffTest((IntPtr)k) && off.Add(k)) log.Add(string.Format("{0,8:0.000} 검사 모니터 밖 {1}", sw.ElapsedMilliseconds / 1000.0, Desc((IntPtr)k)));
      }
      System.Threading.Thread.Sleep(10);
    }
    UnhookWinEvent(hook);
    GC.KeepAlive(proc);   // 알림을 받는 동안 대리자가 치워지지 않게
    log.Insert(0, string.Format("요약 콘솔 창 {0}개 · 검사 모니터 밖 우리 창 {4} · 보임 알림 {1}번 · {2:0.0}초 · 처음부터 있던 창 {3}개(세지 않음)", consoles.Count, showCount, sw.ElapsedMilliseconds / 1000.0, start.Count, testMon == IntPtr.Zero ? "(검사 모니터 없음)" : off.Count + "개"));
    return log;
  }
}
"@
}

function Start-WindowWatch([string]$Out, [int]$MaxSeconds = 600) {
  New-Item -ItemType Directory -Force $Out | Out-Null
  $stop = Join-Path $Out 'windows.stop'
  Remove-Item $stop -Force -ErrorAction SilentlyContinue
  $ps = [powershell]::Create()
  $tm = Get-Content (Join-Path $PSScriptRoot 'test-monitor.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $null = $ps.AddScript({ param($stop, $ms, $x, $y) [WinWatch]::Run($stop, $ms, 100, $x, $y) }).AddArgument($stop).AddArgument($MaxSeconds * 1000).AddArgument([int]$tm.point[0]).AddArgument([int]$tm.point[1])
  [pscustomobject]@{ ps = $ps; handle = $ps.BeginInvoke(); out = $Out; stop = $stop }
}

function Stop-WindowWatch($Watch) {
  Start-Sleep -Milliseconds 500   # 마지막 창이 닫히는 것까지
  Set-Content -Path $Watch.stop -Value 'stop'
  $lines = @($Watch.ps.EndInvoke($Watch.handle))
  $Watch.ps.Dispose()
  Remove-Item $Watch.stop -Force -ErrorAction SilentlyContinue
  $lines | Out-File -Encoding utf8 (Join-Path $Watch.out 'windows.log')
  $consoleLines = @($lines | Where-Object { $_ -match ' (보임|새 창) 콘솔 ' })
  $offLines = @($lines | Where-Object { $_ -match '^\s*[\d.]+ 검사 모니터 밖 ' })   # 시각이 붙은 기록 줄만(맨 앞 «요약» 줄에도 같은 말이 있다)
  $sum = [ordered]@{ summary = $lines[0]; consoleWindows = [int]([regex]::Match($lines[0], '콘솔 창 (\d+)개').Groups[1].Value); consoleLines = $consoleLines; offMonitorWindows = $offLines.Count; offMonitorLines = $offLines
    posterStudioWindows = @($lines | Where-Object { $_ -match "'Poster Studio" } | Select-Object -First 40) }
  $sum | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 (Join-Path $Watch.out 'windows.json')
  [pscustomobject]$sum
}
