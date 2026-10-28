# 앱 창 크기 · 자리 바꾸기 도우미(2026-10-28 — 설치판 앱을 창 크기마다 실제로 바꿔 배치를 잰다, desktop-window-sweep.mjs가 부른다).
# 한 번 띄워 두고 표준 입력으로 한 줄씩 명령을 받아 한 줄로 답한다(창 없이 — node가 windowsHide로 띄운다).
#   find <pid> [제목]                → <hwnd> | none      그 프로세스의 크로뮴 창 중 제목이 같은 것(기본 «Poster Studio», 숨은 창 포함)
#   client <hwnd> <W> <H> <X> <Y>    → ok <cw> <ch> <dpi> 창 안쪽(client)이 W×H 실제 화소가 되게, 창 왼쪽 위를 X,Y(실제 화소)에 둔다 — 창을 보이게 하지 않는다
#   state <hwnd>                     → <visible 0|1> <x> <y> <cw> <ch> <dpi> <zoomed 0|1>
#   show <hwnd> <n>                  → state                ShowWindow(n) — 3 최대화 · 9 원래 크기(창이 보이는 시험에서만 쓴다)
#   outer <hwnd> <W> <H>             → state                창 바깥 크기를 W×H로(왼쪽 위는 그대로 — 오른쪽 아래 모서리를 끈 것과 같은 자리)
#   drag <hwnd> <W0> <H0> <W1> <H1> <단계> <ms>  → ok <걸린 ms>  창 바깥 크기를 W0×H0에서 W1×H1까지 단계마다 ms 간격으로 바꾼다 —
#                                    앞뒤로 «크기 바꾸기 시작 · 끝» 알림(WM_ENTERSIZEMOVE · WM_EXITSIZEMOVE)을 보내 마우스로 끌 때와 같은 상태로 그리게 한다(마우스는 건드리지 않는다)
#   monitor <x> <y>                  → <L> <T> <R> <B> <작업 영역 L T R B>  그 점이 든 모니터(없으면 none)
# 좌표는 모두 모니터별 DPI(실제 화소)다. 앱이 정한 최소 크기보다 작게는 안 된다(Windows가 막는다) — 답의 cw · ch가 실제 크기다.
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class WinCtl {
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT p, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  public static void Aware() { SetThreadDpiAwarenessContext((IntPtr)(-4)); }
  public static IntPtr Find(uint want, string title) {
    IntPtr f = IntPtr.Zero;
    EnumWindows((h, l) => { uint pid; GetWindowThreadProcessId(h, out pid); if (pid != want) return true;
      var c = new StringBuilder(64); GetClassName(h, c, 64); var t = new StringBuilder(128); GetWindowText(h, t, 128);
      if (c.ToString() == "Chrome_WidgetWin_1" && t.ToString() == title) { f = h; return false; } return true; }, IntPtr.Zero);
    return f;
  }
  public static string State(IntPtr h) {
    RECT w, c; GetWindowRect(h, out w); GetClientRect(h, out c);
    return (IsWindowVisible(h) ? 1 : 0) + " " + w.L + " " + w.T + " " + (c.R - c.L) + " " + (c.B - c.T) + " " + GetDpiForWindow(h) + " " + (IsZoomed(h) ? 1 : 0);
  }
  public static string Show(IntPtr h, int cmd) { ShowWindow(h, cmd); return State(h); }
  const uint SIZE_ONLY = 0x0002 | 0x0004 | 0x0010 | 0x0200;   // NOMOVE | NOZORDER | NOACTIVATE | NOOWNERZORDER
  public static string Outer(IntPtr h, int ow, int oh) { SetWindowPos(h, IntPtr.Zero, 0, 0, ow, oh, SIZE_ONLY); return State(h); }
  public static string Drag(IntPtr h, int w0, int h0, int w1, int h1, int steps, int ms) {
    var sw = System.Diagnostics.Stopwatch.StartNew();
    SendMessage(h, 0x0231, IntPtr.Zero, IntPtr.Zero);   // WM_ENTERSIZEMOVE
    for (int i = 0; i <= steps; i++) {
      SetWindowPos(h, IntPtr.Zero, 0, 0, w0 + (w1 - w0) * i / steps, h0 + (h1 - h0) * i / steps, SIZE_ONLY);
      long next = (long)(i + 1) * ms; while (sw.ElapsedMilliseconds < next) System.Threading.Thread.Sleep(1);
    }
    SendMessage(h, 0x0232, IntPtr.Zero, IntPtr.Zero);   // WM_EXITSIZEMOVE
    return "ok " + sw.ElapsedMilliseconds;
  }
  public static string Monitor(int x, int y) {
    var p = new POINT(); p.X = x; p.Y = y;
    IntPtr m = MonitorFromPoint(p, 0); if (m == IntPtr.Zero) return "none";
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO)); GetMonitorInfo(m, ref mi);
    return mi.rcMonitor.L + " " + mi.rcMonitor.T + " " + mi.rcMonitor.R + " " + mi.rcMonitor.B + " " + mi.rcWork.L + " " + mi.rcWork.T + " " + mi.rcWork.R + " " + mi.rcWork.B;
  }
  // 창 테두리 두께는 DPI마다 다르므로 먼저 자리를 옮기고(DPI가 바뀐다), 그다음 안쪽 크기에 맞춰 바깥 크기를 두 번 고친다
  public static string Client(IntPtr h, int cw, int ch, int x, int y) {
    const uint F = 0x0004 | 0x0010 | 0x0200;   // NOZORDER | NOACTIVATE | NOOWNERZORDER — SHOWWINDOW 없음(숨은 창은 숨은 채)
    RECT w, c;
    GetWindowRect(h, out w); SetWindowPos(h, IntPtr.Zero, x, y, w.R - w.L, w.B - w.T, F);
    for (int i = 0; i < 2; i++) {
      GetWindowRect(h, out w); GetClientRect(h, out c);
      int fw = (w.R - w.L) - (c.R - c.L), fh = (w.B - w.T) - (c.B - c.T);
      SetWindowPos(h, IntPtr.Zero, x, y, cw + fw, ch + fh, F);
    }
    GetClientRect(h, out c);
    return "ok " + (c.R - c.L) + " " + (c.B - c.T) + " " + GetDpiForWindow(h);
  }
}
"@
[WinCtl]::Aware()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $a = $line.Trim() -split '\s+'
  try {
    switch ($a[0]) {
      'find' { $title = if ($a.Count -gt 2) { ($a[2..($a.Count - 1)] -join ' ') } else { 'Poster Studio' }; $h = [WinCtl]::Find([uint32]$a[1], $title); if ($h -eq [IntPtr]::Zero) { 'none' } else { $h.ToInt64() } }
      'client' { [WinCtl]::Client([IntPtr][int64]$a[1], [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5]) }
      'state' { [WinCtl]::State([IntPtr][int64]$a[1]) }
      'show' { [WinCtl]::Show([IntPtr][int64]$a[1], [int]$a[2]) }
      'outer' { [WinCtl]::Outer([IntPtr][int64]$a[1], [int]$a[2], [int]$a[3]) }
      'drag' { [WinCtl]::Drag([IntPtr][int64]$a[1], [int]$a[2], [int]$a[3], [int]$a[4], [int]$a[5], [int]$a[6], [int]$a[7]) }
      'monitor' { [WinCtl]::Monitor([int]$a[1], [int]$a[2]) }
      'quit' { exit 0 }
      default { "error 모르는 명령 $($a[0])" }
    }
  } catch { "error $($_.Exception.Message)" }
}
