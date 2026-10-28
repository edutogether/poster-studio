# 자동 검사 창을 아래 작은 모니터로 옮긴다(2026-09-26 Bumm님 규칙 · 10/28 팀장 재확인 — 위 큰 모니터 두 대는 Bumm님이 쓰신다).
#   . (Join-Path $PSScriptRoot 'test-monitor.ps1')
#   Move-ToTestMonitor $hwnd            # 창 크기 그대로 그 모니터 작업 영역 왼쪽 위(+margin)로
#   Move-ToTestMonitor $hwnd -Maximize  # 그 모니터에서 최대화
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
$script:testMonitor = Get-Content (Join-Path $PSScriptRoot 'test-monitor.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Move-ToTestMonitor([IntPtr]$Hwnd, [switch]$Maximize) {
  [TestMonitor]::Move($Hwnd, [int]$script:testMonitor.point[0], [int]$script:testMonitor.point[1], [int]$script:testMonitor.margin, [bool]$Maximize)
}
