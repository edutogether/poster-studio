# Windows 설치판 설치 · 제거 확인(2026-10-27 Bumm님 기준, 팀장 전달 — _docs/intents/2026-10-27-desktop-installer).
#
#   설치:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify/desktop-installer-probe.ps1 -Step install -Mode user|all -Installer <Poster Studio Setup.exe> -Out <결과 폴더>
#          [-Replace | -Beside] [-AppOn] [-Answers ok,cancel,…] [-Decline] [-AsUser] [-NoShots]
#   제거:  ... -Step uninstall -Mode user|all -Via startmenu|settings -Out <결과 폴더> [-AppOn] [-Answers …] [-Decline]
#
#   -Replace  같은 범위에 예전 판이 있는 PC — «설치»를 누르면 «이미 설치되어 있습니다 · 지우고 새로 설치할까요?»가 뜬다(10/28 Bumm님).
#   -Beside   다른 범위에만 예전 판이 있는 PC(«나만» 위에 «모든 사용자» 또는 그 반대) — 같은 질문이 뜨고, «확인»이면 그 판이 남김없이 지워져야 한다.
#   -AppOn    그 PC에 깔린 앱을 켜 둔 채 시작한다 — «Poster Studio가 켜져 있습니다 · 끄고 계속할까요?»가 뜬다.
#   -Answers  묻는 창에 차례로 할 답. ok(확인 · 다시 시도) · cancel(취소 — 그 화면에 남아야 한다, 도구는 다음 단추를 다시 누른다) ·
#             cancel-exit(취소한 뒤 그 화면에 남았는지 보고 설치기 · 제거기를 «취소» 단추로 끝낸다). 남은 답이 없으면 ok.
#   -Decline  답이 cancel-exit로 끝나는 시험 — 설치 · 제거가 일어나지 않고 예전 상태(설치 · 켜진 앱)가 그대로인지 본다.
#
# 진행 화면(10/28 Bumm님): 상자(«자세히» 목록)가 첫 표본부터 보이는지, 보이는 막대의 위치(‰)가 0.1초 표본마다 줄지 않고 100%까지 가는지,
# 상자에 «설치: …» / «삭제: …» 파일 줄이 흐르고 마지막 줄이 «설치가 끝났습니다.» / «제거가 끝났습니다.»인지, 임시 폴더 · .7z · NSIS 원래 기록이 없는지 본다.
# 화면 글(10/28 Bumm님): 화면마다 글 칸의 실제 글꼴로 줄 폭을 재서, 줄이 칸 안에 들어가는지(낱말 중간에서 꺾이지 않는지) · 한 줄에 두 문장이 없는지 ·
# «(을)를» 같은 조사 표기와 글자 그대로 찍힌 «\n»이 없는지 본다. 묻는 창 글도 같은 기준으로 본다.
#
# 사람이 더블클릭한 것처럼 설치 창을 띄운다(조용한 설치 /S가 아니다). 화면마다 그 창만 따로 찍고(PrintWindow), 창의 단추에 누름 메시지를 보낸다.
# 다른 창을 가리거나 키보드를 빼앗지 않는다 — 이 PC를 쓰는 사람의 다른 창에 글자가 들어가지 않게.
#   설치 범위 화면: -Mode에 맞는 단추(«me 전용» = 나만 · «모든 사용자»)를 누른다.
#   위치 화면: 기본 위치를 그대로 둔다 — 기본값이 기준 위치인지 잰다(바꾸는 화면이 있는지도 찍는다).
# «모든 사용자»(-Mode all)는 설치기가 관리자 권한으로 다시 뜬다. Windows는 보통 권한 프로그램이 관리자 창에 보내는 메시지를 막으므로,
# 이 확인 도구도 관리자 권한으로 띄워야 단추를 누를 수 있다(Start-Process -Verb RunAs). 다른 PC에서는 관리자 승인 창이 한 번 뜬다(정상).
#
# 기준(Bumm님 10/27):
#   위치 — 모든 사용자: C:\Program Files\InKY Film Festival\Poster Studio · 나만: %LOCALAPPDATA%\Programs\InKY Film Festival\Poster Studio
#   바로가기 — 바탕화면 «Poster Studio», 시작 메뉴 «InKY Film Festival» 폴더 안에 «Poster Studio» · «Uninstall Poster Studio»
#   «설치된 앱»(제어판 프로그램 추가/제거)에 «Poster Studio» — 거기서도, 시작 메뉴 «Uninstall Poster Studio»로도 제거된다
#   제거 뒤 — 설치 폴더 · 비게 된 «InKY Film Festival» 폴더 · 바로가기 · 시작 메뉴 폴더 · 등록 · 앱 데이터가 남지 않는다
# 결과는 <결과 폴더>/installer-<단계>-<범위>.json, 하나라도 걸리면 종료코드 1.
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'uninstall')][string]$Step,
  [Parameter(Mandatory = $true)][ValidateSet('user', 'all')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Installer,
  [ValidateSet('startmenu', 'settings')][string]$Via = 'startmenu',
  # -Replace: 같은 범위에 예전 판이 깔려 있는 PC에서 새 판으로 덮어쓰는 시험(10/27 — Bumm님이 «모든 사용자»로 옛 판을 깔아 두신 PC).
  [switch]$Replace,
  # -Beside: 다른 범위에만 예전 판이 있는 PC(10/28 — «지우고 새로 설치»가 범위가 달라도 앞 판을 남기지 않는지).
  [switch]$Beside,
  # -AppOn: 깔린 앱을 켜 둔 채 시작한다(-Replace · 제거는 같은 범위, -Beside는 다른 범위의 앱).
  [switch]$AppOn,
  # -Answers: 묻는 창에 차례로 할 답(위 설명).
  [string[]]$Answers = @(),
  # -Decline: 답이 cancel-exit로 끝나 설치 · 제거가 일어나지 않아야 하는 시험.
  [switch]$Decline,
  # -AsUser: 관리자 권한으로 도는 이 도구가 설치기를 일반 권한으로 띄운다(탐색기를 거쳐 — 사람이 두 번 누른 것과 같다).
  #   «모든 사용자»를 고르면 첫 창이 숨고 관리자 권한 창이 새로 뜨는 실제 흐름을 탄다(10/28 — 진행 화면의 상자가 중간에 생기는 것은 이 흐름에서만 보였다).
  [switch]$AsUser,
  # -NoShots: 창을 하나도 찍지 않는다(PrintWindow 0회). 찍는 동작이 화면에 깜빡임을 만드는지 가를 때 쓴다(10/27 — 화면 녹화와 함께).
  [switch]$NoShots
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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, StringBuilder l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  public struct RECT { public int L, T, R, B; }
  public static string Text(IntPtr h) { var s = new StringBuilder(1024); GetWindowText(h, s, 1024); return s.ToString(); }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  // 편집 칸 글자는 다른 프로세스면 GetWindowText로 안 읽혀 WM_GETTEXT로 읽는다
  public static string EditText(IntPtr h) { var s = new StringBuilder(1024); SendMessage(h, 0x000D, (IntPtr)1024, s); return s.ToString(); }
  public static bool Off;
  public static void Shot(IntPtr h, string file) {
    if (Off) return;
    RECT r; GetWindowRect(h, out r);
    if (r.R - r.L <= 0 || r.B - r.T <= 0) return; // 창이 잠깐 숨은 순간(관리자 권한으로 다시 뜰 때 등)
    using (var bmp = new Bitmap(r.R - r.L, r.B - r.T)) {
      using (var g = Graphics.FromImage(bmp)) { var hdc = g.GetHdc(); PrintWindow(h, hdc, 2); g.ReleaseHdc(hdc); }
      bmp.Save(file, ImageFormat.Png);
    }
  }
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr result);
  // 설치 창의 화면 스레드가 쌓인 메시지를 다 처리할 때까지 기다린다(WM_NULL — 아무 일도 하지 않는 메시지가 돌아오면 그 앞의 일은 끝났다)
  static void Idle(IntPtr h) { IntPtr res; SendMessageTimeout(h, 0x0000, IntPtr.Zero, IntPtr.Zero, 0x0000, 5000, out res); }
  static byte[] Grab(IntPtr h) {
    RECT r; GetWindowRect(h, out r);
    if (r.R - r.L <= 0 || r.B - r.T <= 0) return null;
    using (var bmp = new Bitmap(r.R - r.L, r.B - r.T)) {
      using (var g = Graphics.FromImage(bmp)) { var hdc = g.GetHdc(); PrintWindow(h, hdc, 2); g.ReleaseHdc(hdc); }
      using (var ms = new System.IO.MemoryStream()) { bmp.Save(ms, ImageFormat.Bmp); return ms.ToArray(); }
    }
  }
  static bool Same(byte[] a, byte[] b) { if (a == null || b == null || a.Length != b.Length) return false; for (int i = 0; i < a.Length; i++) if (a[i] != b[i]) return false; return true; }
  // 화면이 다 그려진 뒤에 찍는다 — 설치 창이 한가해진 뒤 0.3초 간격 두 장이 같아질 때까지(최대 약 8초).
  //   10/27 실측: 새로 설치할 때 첫 화면 · 위치 화면을 글자가 그려지기 전에 찍었다(빈 화면 · 설명 글 없는 위치 화면 — 단추 글은 읽혀 시험은 통과).
  //   강제로 다시 그리게(RedrawWindow) 하면 그리는 도중을 찍어 더 나빴다(쓰지 않는다).
  //   ⚠ 이것도 보장은 아니다 — 빈 화면이 0.3초 넘게 그대로면 «같음»으로 찍힌다(10/27 4차: 범위 · 완료 화면). 빈 화면은 PrintWindow로 찍는 동작이 만든다:
  //   찍으며 설치하면 실제 화면에도 33ms 빈 화면이 10번, 찍지 않으면(-NoShots) 진행 중 0번이었다(화면 녹화 — installer-screen-record.ps1 · installer-blank-scan.mjs).
  //   시험 판정은 창의 글을 읽어서 하므로 영향이 없고, 보고 · 설명서에 쓰는 그림은 눈으로 보고 다 그려진 것을 고른다.
  public static bool ShotStable(IntPtr h, string file) {
    if (Off) return false;
    Idle(h); System.Threading.Thread.Sleep(300);
    byte[] prev = Grab(h);
    for (int i = 0; i < 13; i++) {
      System.Threading.Thread.Sleep(300); Idle(h);
      byte[] cur = Grab(h);
      if (Same(prev, cur)) { Shot(h, file); return true; }
      prev = cur;
    }
    Shot(h, file);
    return false;
  }
  public static IntPtr FindDialog(string key) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { if (IsWindowVisible(h) && Cls(h) == "#32770" && Text(h).Contains(key)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindTop(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { if (IsWindowVisible(h) && Text(h) == title) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
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
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  // 그림 칸(정적 컨트롤 SS_BITMAP)의 화소 크기 — 설치 화면 그림이 칸에 맞게 그려졌는지 재는 데 쓴다
  public static string Bitmaps(IntPtr p) {
    var sb = new StringBuilder();
    EnumChildWindows(p, (h, l) => { if (IsWindowVisible(h) && Cls(h) == "Static" && (GetWindowLong(h, -16) & 0x1F) == 0x0E) { RECT r; GetClientRect(h, out r); sb.Append("[" + GetDlgCtrlID(h) + "]" + r.R + "x" + r.B + " | "); } return true; }, IntPtr.Zero);
    return sb.ToString();
  }
  // 진행 화면 «자세히 보기» 목록(SysListView32)의 항목 글. 다른 프로세스의 목록이라 그 프로세스 메모리에 LVITEM을 두고 LVM_GETITEMTEXTW로 받는다.
  // UI 자동화로는 이 목록의 항목이 하나도 안 나왔다(10/27 실측 — ListItem · DataItem 모두 0개). NSIS 설치기는 32비트 프로세스라 LVITEM도 32비트 모양으로 쓴다.
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr VirtualAllocEx(IntPtr hp, IntPtr addr, IntPtr size, uint type, uint protect);
  [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr hp, IntPtr addr, IntPtr size, uint type);
  [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr hp, IntPtr addr, byte[] buf, IntPtr size, out IntPtr written);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr hp, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr hp, out bool wow);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string[] ListItems(IntPtr dlg) {
    IntPtr lv = IntPtr.Zero;
    EnumChildWindows(dlg, (h, l) => { if (Cls(h) == "SysListView32") { lv = h; return false; } return true; }, IntPtr.Zero);
    var items = new System.Collections.Generic.List<string>();
    if (lv == IntPtr.Zero) return items.ToArray();
    int count = (int)SendMessage(lv, 0x1004, IntPtr.Zero, IntPtr.Zero); // LVM_GETITEMCOUNT
    uint pid; GetWindowThreadProcessId(lv, out pid);
    IntPtr hp = OpenProcess(0x0008 | 0x0010 | 0x0020 | 0x0400, false, pid);
    if (hp == IntPtr.Zero) return items.ToArray();
    bool wow; IsWow64Process(hp, out wow);
    const int TEXT = 2048;
    IntPtr remote = VirtualAllocEx(hp, IntPtr.Zero, (IntPtr)(256 + TEXT), 0x3000, 0x04);
    try {
      long text = remote.ToInt64() + 256;
      for (int i = 0; i < count; i++) {
        byte[] lvi = new byte[wow ? 60 : 88];
        BitConverter.GetBytes(1).CopyTo(lvi, 0);                       // mask = LVIF_TEXT
        BitConverter.GetBytes(i).CopyTo(lvi, 4);                       // iItem
        if (wow) { BitConverter.GetBytes((int)text).CopyTo(lvi, 20); BitConverter.GetBytes(TEXT / 2).CopyTo(lvi, 24); }
        else { BitConverter.GetBytes(text).CopyTo(lvi, 24); BitConverter.GetBytes(TEXT / 2).CopyTo(lvi, 32); }
        IntPtr n;
        WriteProcessMemory(hp, remote, lvi, (IntPtr)lvi.Length, out n);
        int len = (int)SendMessage(lv, 0x1073, (IntPtr)i, remote);   // LVM_GETITEMTEXTW
        byte[] buf = new byte[TEXT];
        ReadProcessMemory(hp, (IntPtr)text, buf, (IntPtr)TEXT, out n);
        items.Add(Encoding.Unicode.GetString(buf, 0, Math.Max(0, Math.Min(len, TEXT / 2)) * 2));
      }
    } finally { VirtualFreeEx(hp, remote, IntPtr.Zero, 0x8000); CloseHandle(hp); }
    return items.ToArray();
  }
  public static IntPtr FindButton(IntPtr p, string contains) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(p, (h, l) => { if (IsWindowVisible(h) && Cls(h) == "Button" && Text(h).Contains(contains)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  // 설치기가 띄운 알림 창(MessageBox) — 설치 창과 같은 제목의 #32770이지만 화면 칸(1018)이 없고 알림 글 칸(ID 0xFFFF)이 있다
  // 진행 화면에 보이는 막대의 위치(‰) — 숨은 막대(설치기가 가린 원래 막대)는 빼고 보이는 것만. 없으면 -1.
  public static int BarPermille(IntPtr dlg) {
    int result = -1;
    EnumChildWindows(dlg, (h, l) => {
      if (Cls(h) == "msctls_progress32" && IsWindowVisible(h)) {
        long pos = (int)(long)SendMessage(h, 0x0408, IntPtr.Zero, IntPtr.Zero);          // PBM_GETPOS
        long lo = (int)(long)SendMessage(h, 0x0407, (IntPtr)1, IntPtr.Zero);             // PBM_GETRANGE 낮은 값
        long hi = (int)(long)SendMessage(h, 0x0407, IntPtr.Zero, IntPtr.Zero);           // 높은 값
        if (hi > lo) result = (int)((pos - lo) * 1000 / (hi - lo));
        return false;
      }
      return true; }, IntPtr.Zero);
    return result;
  }
  // 진행 화면의 «자세히» 상자(목록)가 보이는가
  public static bool ListVisible(IntPtr dlg) {
    bool v = false;
    EnumChildWindows(dlg, (h, l) => { if (Cls(h) == "SysListView32") { v = IsWindowVisible(h); return false; } return true; }, IntPtr.Zero);
    return v;
  }
  public static IntPtr MessageText(IntPtr box) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(box, (h, l) => { if (Cls(h) == "Static" && (GetDlgCtrlID(h) & 0xFFFF) == 0xFFFF && Text(h).Length > 0) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindMessageBox(string key) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (IsWindowVisible(h) && Cls(h) == "#32770" && Text(h).Contains(key) && GetDlgItem(h, 1018) == IntPtr.Zero && MessageText(h) != IntPtr.Zero) { found = h; return false; }
      return true; }, IntPtr.Zero);
    return found;
  }
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int n, byte[] buf);
  [DllImport("gdi32.dll")] static extern IntPtr CreateFontIndirect(byte[] lf);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int DrawText(IntPtr dc, string s, int n, ref RECT r, uint fmt);
  // 글 칸(줄을 꺾는 정적 컨트롤 SS_LEFT · SS_CENTER · SS_RIGHT)의 줄마다 «칸 번호 · 칸 폭 · 그 줄을 한 줄로 그린 폭 · 글»(탭으로 나눔). 줄은 글에 넣은 줄바꿈 기준이다.
  // 그린 폭이 칸 폭보다 넓으면 그 줄은 칸 안에서 다시 꺾인다 — 한국어는 글자 사이에서도 꺾여 «시 / 작하시려면»이 된다(10/28 Bumm님 지적).
  // 글꼴은 설치 창이 그 칸에 준 것(WM_GETFONT)의 정보를 읽어 이 프로세스에서 같은 글꼴을 만든다(한국어 Windows에서 굴림 9pt = -12px).
  public static string[] TextLines(IntPtr p) {
    var rows = new System.Collections.Generic.List<string>();
    EnumChildWindows(p, (h, l) => {
      int style = GetWindowLong(h, -16);
      string t = Text(h);
      if (IsWindowVisible(h) && Cls(h) == "Static" && (style & 0x1F) <= 2 && t.Length > 0) {
        RECT c; GetClientRect(h, out c);
        IntPtr dc = GetDC(IntPtr.Zero), font = IntPtr.Zero, old = IntPtr.Zero;
        byte[] lf = new byte[92];
        IntPtr f = SendMessage(h, 0x0031, IntPtr.Zero, IntPtr.Zero);   // WM_GETFONT — 0이면 칸이 시스템 글꼴을 쓴다(이 DC의 기본 글꼴과 같다)
        // 글꼴 정보를 못 읽으면(권한이 다른 프로세스 등) 폭을 -1로 둔다 — 다른 글꼴로 잰 폭을 통과로 믿지 않게(10/28: 관리자 창을 일반 권한으로 재니 914px로 틀리게 나왔다)
        bool unreadable = f != IntPtr.Zero && GetObject(f, lf.Length, lf) == 0;
        if (f != IntPtr.Zero && !unreadable) { font = CreateFontIndirect(lf); old = SelectObject(dc, font); }
        uint fmt = 0x0400 | 0x0020 | 0x0040 | ((style & 0x80) != 0 ? 0x0800u : 0u);   // CALCRECT · SINGLELINE · EXPANDTABS (+ SS_NOPREFIX면 NOPREFIX)
        foreach (var line in t.Replace("\r\n", "\n").Split('\n')) {
          if (line.Trim().Length == 0) continue;
          RECT r = new RECT(); DrawText(dc, line, -1, ref r, fmt);
          rows.Add(GetDlgCtrlID(h) + "\t" + c.R + "\t" + (unreadable ? -1 : r.R - r.L) + "\t" + line);
        }
        if (font != IntPtr.Zero) { SelectObject(dc, old); DeleteObject(font); }
        ReleaseDC(IntPtr.Zero, dc);
      }
      return true; }, IntPtr.Zero);
    return rows.ToArray();
  }
}
"@
[Win]::SetProcessDPIAware() | Out-Null
[Win]::Off = [bool]$NoShots
# 진행 화면 «자세히 보기» 목록의 항목 글 — [Win]::ListItems(창)이 목록에 직접 물어 받는다
function DetailLines($h) { try { return @([Win]::ListItems($h)) } catch { return @() } }
$BM_CLICK = 0x00F5
$tag = "$Step-$Mode$(if ($Step -ne 'install') { "-$Via" })"
$report = [ordered]@{ step = $Step; mode = $Mode; via = $Via; beside = [bool]$Beside; elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); startedAt = (Get-Date).ToString('o'); pages = @(); messageBoxes = @(); checks = @() }
function Check($name, $ok, $detail) {
  $report.checks += [ordered]@{ name = $name; ok = [bool]$ok; detail = $detail }
  Write-Output ("{0}  {1}{2}" -f ($(if ($ok) { '통과' } else { '걸림' })), $name, $(if ($null -ne $detail -and "$detail" -ne '') { " — $detail" } else { '' }))
}
# 진행 화면(10/27 Bumm님 B안 · 10/28 «상자는 처음부터 · 막대는 한 방향 · 파일이 주르륵 · 100% 1초»):
#   글 — 위 한 줄과 «자세히» 목록에 사람이 읽는 문장과 파일 줄만. 임시 작업 경로(…\Temp\ns….tmp) · 압축 묶음(.7z) · NSIS 원래 기록 말투가 없어야 한다
#        (파일 줄의 .dll은 설치 폴더 안 실제 파일이라 괜찮다). 위치 줄(실제 경로)과 그 단계의 문장이 있어야 한다.
#   상자 · 막대 — 진행 화면 첫 표본부터 상자가 보이고, 보이는 막대의 위치(‰)가 0.1초 표본마다 2‰ 넘게 줄지 않으며 995‰ 이상까지 간다.
#   파일 줄 — 상자의 마지막 모습에 «설치: …»(설치) / «삭제: …»(제거) 줄이 15개 이상, 모두 설치 폴더(제거는 바탕화면 · 시작 메뉴 바로가기도) 안이고,
#            마지막 줄이 «설치가 끝났습니다.» / «제거가 끝났습니다.»다.
function ProgressChecks($kind, $whereLabel, $doing, $word, $endLine) {
  $samples = @($report.pages | ForEach-Object { $_.progress } | Where-Object { $_ })
  $statuses = @($samples | ForEach-Object { if ($_.text -match '\[1006\]([^|]*)\|') { $Matches[1].Trim() } } | Where-Object { $_ } | Select-Object -Unique)
  $lines = @($samples | ForEach-Object { $_.details } | Where-Object { $_ } | Select-Object -Unique)
  $raw = '\\Temp\\|\\ns[a-z0-9]+\.tmp|\.7z|압축 해제|파일 복사|대상 폴더|폴더 생성|바로 가기 생성|파일 삭제|실행:|Extract|Output folder|Delete file|Uninstall was|Can.t modify|File is busy'
  $bad = @(@($statuses) + @($lines) | Where-Object { $_ -match $raw } | Select-Object -Unique)
  Check "$kind 진행 글에 원래 기록(임시 폴더 · .7z · 압축 해제 · 파일 삭제 …)이 없다" ($samples.Count -gt 0 -and $bad.Count -eq 0) $(if ($bad.Count) { $bad -join ' | ' } else { "표본 $($samples.Count)개" })
  $where = "$($whereLabel): $appDir"
  Check "$kind 진행 글이 쉬운 문장으로 바뀌어 간다(위치 줄 · «$doing» · 서로 다른 줄 3개 이상)" (($lines -contains $where) -and @($lines | Where-Object { $_ -like "*$doing*" }).Count -gt 0 -and $lines.Count -ge 3) ($lines -join ' → ')
  $bars = @($samples | ForEach-Object { $_.bar } | Where-Object { $null -ne $_ -and $_ -ge 0 })
  $drops = @(); for ($i = 1; $i -lt $bars.Count; $i++) { if ($bars[$i] -lt $bars[$i - 1] - 2) { $drops += "$($bars[$i - 1])→$($bars[$i])" } }
  $max = if ($bars.Count) { ($bars | Measure-Object -Maximum).Maximum } else { -1 }
  $firstList = if ($samples.Count) { [bool]$samples[0].list } else { $false }
  Check "$kind 진행 화면: 상자가 처음부터 보이고 막대가 한 방향으로 100%까지 간다" ($firstList -and $bars.Count -ge 5 -and $drops.Count -eq 0 -and $max -ge 995) "첫 표본 상자 $firstList · 막대 표본 $($bars.Count)개 · 처음 $(if ($bars.Count) { $bars[0] })‰ · 최대 $max‰ · 줄어든 곳 $(if ($drops.Count) { $drops -join ', ' } else { '없음' })"
  $final = @($samples | Sort-Object { @($_.details).Count } -Descending | Select-Object -First 1 | ForEach-Object { $_.details })
  $fileLines = @($final | Where-Object { $_ -like "${word}: *" })
  $allowed = @("${word}: $appDir\") + $(if ($word -eq '삭제') { @("${word}: $desktopDir\", "${word}: $programsDir\") } else { @() })
  $outside = @($fileLines | Where-Object { $l = $_; -not @($allowed | Where-Object { $l.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) }).Count })
  $last = if ($final.Count) { $final[-1] } else { '' }
  Check "$kind 상자에 «${word}: …» 파일 줄이 흐르고 마지막 줄이 «$endLine»" ($fileLines.Count -ge 15 -and $outside.Count -eq 0 -and $last -eq $endLine) "파일 줄 $($fileLines.Count)개 · 마지막 «$last»$(if ($outside.Count) { ' · 폴더 밖 ' + ($outside -join ' | ') })"
  $report.progressLines = $lines
  $report.progressStatuses = $statuses
  $report.finalList = $final
  $report.bars = $bars
}
# 화면 글 규칙(10/28 Bumm님 «문장마다 줄바꿈»): [Win]::TextLines의 줄마다 — 칸 안에 들어간다 · 한 줄에 두 문장이 없다 · 조사 표기 · «\n» 글자가 없다.
# 칸보다 긴 한 문장은 낱말 사이에서 나눈 두 줄이면 통과다(줄마다 칸 안에 들면 꺾임이 없다).
function TextRules($rows) {
  $bad = @()
  foreach ($row in @($rows)) {
    $id, $box, $width, $line = $row -split "`t", 4
    if ([int]$width -lt 0) { $bad += "글꼴을 못 읽어 폭을 못 잼[$id]: $line" }
    if ([int]$width -gt [int]$box) { $bad += "칸 넘침[$id] ${width}px > ${box}px: $line" }
    if ($line -match '[.?!]\s+\S') { $bad += "한 줄 두 문장[$id]: $line" }
    if ($line -match '\((을|이|은|과|으)\)|(을|이|은|과)\((를|가|는|와)\)') { $bad += "조사 표기[$id]: $line" }
    if ($line -match '\\[nr]') { $bad += "«\n» 글자[$id]: $line" }
  }
  return $bad
}
function TextChecks() {
  $rows = @($report.pages | ForEach-Object { $_.textLines; $_.pickedTextLines }) + @($report.messageBoxes | ForEach-Object { $_.textLines }) | Where-Object { $_ }
  $bad = @($report.pages | ForEach-Object { $_.textProblems; $_.pickedTextProblems }) + @($report.messageBoxes | ForEach-Object { $_.textProblems }) | Where-Object { $_ } | Select-Object -Unique
  Check '화면 글: 문장마다 새 줄 · 줄이 칸 안에 든다(낱말 중간 꺾임 없음) · «(을)를» 같은 조사 표기 · «\n» 글자 없음' ($rows.Count -gt 0 -and $bad.Count -eq 0) $(if ($bad.Count) { $bad -join ' | ' } else { "글 줄 $($rows.Count)개 · 화면 $(@($report.pages).Count)개 · 알림 $(@($report.messageBoxes).Count)개" })
}

# 기준 위치 · 바로가기 자리
$root = if ($Mode -eq 'all') { $env:ProgramFiles } else { Join-Path $env:LOCALAPPDATA 'Programs' }
$parent = Join-Path $root 'InKY Film Festival'
$appDir = Join-Path $parent 'Poster Studio'
$exe = Join-Path $appDir 'Poster Studio.exe'
$uninstaller = Join-Path $appDir 'Uninstall Poster Studio.exe'
$desktopDir = [Environment]::GetFolderPath($(if ($Mode -eq 'all') { 'CommonDesktopDirectory' } else { 'Desktop' }))
$programsDir = [Environment]::GetFolderPath($(if ($Mode -eq 'all') { 'CommonPrograms' } else { 'Programs' }))
$desktopLnk = Join-Path $desktopDir 'Poster Studio.lnk'
$menuDir = Join-Path $programsDir 'InKY Film Festival'
$startLnk = Join-Path $menuDir 'Poster Studio.lnk'
$uninstallLnk = Join-Path $menuDir 'Uninstall Poster Studio.lnk'
$appData = Join-Path $env:APPDATA 'Poster Studio'
$hive = if ($Mode -eq 'all') { 'HKLM' } else { 'HKCU' }
$otherHive = if ($Mode -eq 'all') { 'HKCU' } else { 'HKLM' }
function Entry($h) { Get-ChildItem "${h}:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -eq 'Poster Studio' } | Select-Object -First 1 }
function LnkInfo($path) { if (-not (Test-Path $path)) { return $null }; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($path); return [ordered]@{ target = $s.TargetPath; icon = $s.IconLocation } }

# 묻는 창(MessageBox)이 뜨면 찍고 글을 재고 -Answers 차례대로 답한다(남은 답이 없으면 ok). 답한 뒤 그 화면 글 · 켜진 앱을 남긴다(«취소»는 1초 뒤).
# WAIT: 첫 창을 기다리는 횟수(0.1초 단위). 돌려주는 값: 'exit'(cancel-exit로 답함) · 'none'.
$script:answerIndex = 0
# powershell -File로 부르면 -Answers ok,cancel이 «ok,cancel» 한 덩어리로 온다 — 쉼표로 나눈다
$Answers = @($Answers | ForEach-Object { "$_" -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
function HandleBoxes($prefix, $n, $h, $wait) {
  for ($k = 0; $k -lt 6; $k++) {
    $box = [IntPtr]::Zero
    for ($i = 0; $i -lt $wait -and $box -eq [IntPtr]::Zero; $i++) { $box = [Win]::FindMessageBox('Poster Studio'); if ($box -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 100 } }
    if ($box -eq [IntPtr]::Zero) { return 'none' }
    Start-Sleep -Milliseconds 400
    $bf = Join-Path $Out ('{0}-{1:00}-알림-{2:00}.png' -f $prefix, $n, (@($report.messageBoxes).Count + 1))
    [Win]::ShotStable($box, $bf) | Out-Null
    $rows = @([Win]::TextLines($box))
    $answer = if ($script:answerIndex -lt $Answers.Count) { $Answers[$script:answerIndex] } else { 'ok' }
    $script:answerIndex++
    $buttons = [Win]::AllText($box)
    # «확인»(IDOK 1)이 없는 창(«다시 시도» · «취소»)이면 ok는 «다시 시도»(IDRETRY 4)
    $id = if ($answer -like 'cancel*') { 2 } elseif ($buttons -match '\[1\]') { 1 } else { 4 }
    $entry = [ordered]@{ shot = (Split-Path $bf -Leaf); prefix = $prefix; title = [Win]::Text($box); text = [Win]::Text([Win]::MessageText($box)); buttons = $buttons; answer = $answer; textLines = $rows; textProblems = @(TextRules $rows) }
    [Win]::PostMessage($box, 0x0111, [IntPtr]$id, [IntPtr]::Zero) | Out-Null   # WM_COMMAND — 그 단추가 보내는 것과 같은 알림
    for ($i = 0; $i -lt 40 -and [Win]::IsWindow($box); $i++) { Start-Sleep -Milliseconds 250 }
    # «취소»면 그 화면에 남았는지 보려고 1초 기다린다. «확인»이면 바로 다음으로 — 진행 화면 첫 모습(상자 · 막대)을 놓치지 않게
    Start-Sleep -Milliseconds $(if ($answer -like 'cancel*') { 1000 } else { 100 })
    $entry.after = if ([Win]::IsWindow($h) -and [Win]::IsWindowVisible($h)) { [Win]::AllText($h) } else { '(창 없음)' }
    $entry.appAlive = $null -ne (Get-Process 'Poster Studio' -ErrorAction SilentlyContinue)
    $report.messageBoxes += $entry
    if ($answer -eq 'cancel-exit') { return 'exit' }
    $wait = 5   # 다음 묻는 창(이미 설치 → 켜진 앱)은 바로 뜬다
  }
  return 'none'
}

# 설치 · 제거 창을 화면마다 찍으며 «다음»(단추 1)을 누른다
function Walk($prefix) {
  $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 160 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 250; $h = [Win]::FindDialog('Poster Studio') }
  if ($h -eq [IntPtr]::Zero) { return $false }
  $report.title = [Win]::Text($h)
  for ($n = 1; $n -le 14; $n++) {
    if (-not [Win]::IsWindow($h) -or -not [Win]::IsWindowVisible($h)) {
      # «모든 사용자»를 고르면 설치기가 관리자 권한으로 다시 뜬다(새 창) — 그 창을 이어서 잡는다. 첫 창은 닫히지 않고 숨는다(-AsUser로 실측, 10/28)
      $h2 = [IntPtr]::Zero
      for ($i = 0; $i -lt 40 -and $h2 -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 250; $h2 = [Win]::FindDialog('Poster Studio') }
      if ($h2 -eq [IntPtr]::Zero) { break }
      $h = $h2
    }
    $next = [Win]::GetDlgItem($h, 1)
    # 설치가 도는 동안(«다음»이 꺼져 있는 동안)은 0.5초마다 그 화면을 찍고, 진행 글(위 한 줄 · «자세히» 목록) · 막대 위치 · 상자 보임은 0.1초마다 읽는다 —
    # 마지막 단계가 0.5초 안에 끝나면 찍는 간격으로는 그 줄을 놓친다(10/27 «모든 사용자» 제거 실측)
    $progress = @()
    for ($w = 0; $w -lt 1500 -and -not [Win]::IsWindowEnabled($next) -and [Win]::IsWindow($h) -and [Win]::IsWindowVisible($h); $w++) {
      # 진행 단계에서 뜨는 묻는 창(그 사이에 앱을 다시 켰을 때 등)
      if ([Win]::FindMessageBox('Poster Studio') -ne [IntPtr]::Zero) { HandleBoxes $prefix $n $h 1 | Out-Null; continue }
      $sample = [ordered]@{ text = [Win]::AllText($h); details = @(DetailLines $h); bar = [Win]::BarPermille($h); list = [Win]::ListVisible($h) }
      if ($w % 5 -eq 0 -and @($progress | Where-Object { $_.shot }).Count -lt 40) {
        $pf = Join-Path $Out ('{0}-{1:00}-진행-{2:00}.png' -f $prefix, $n, (@($progress | Where-Object { $_.shot }).Count + 1))
        [Win]::Shot($h, $pf)
        $sample.shot = Split-Path $pf -Leaf
      }
      $progress += $sample
      Start-Sleep -Milliseconds 100
    }
    if (-not [Win]::IsWindow($h) -or -not [Win]::IsWindowVisible($h)) { continue }
    Start-Sleep -Milliseconds 700
    $file = Join-Path $Out ('{0}-{1:00}.png' -f $prefix, $n)
    $stable = [Win]::ShotStable($h, $file)
    if (-not [Win]::IsWindow($h)) { break } # «마침»을 누른 뒤 닫히는 창 — 화면이 아니다
    $page = [ordered]@{ shot = (Split-Path $file -Leaf); stable = $stable; text = [Win]::AllText($h); bitmaps = [Win]::Bitmaps($h); dpi = [Win]::GetDpiForWindow($h) }
    $page.textLines = @([Win]::TextLines($h))
    $page.textProblems = @(TextRules $page.textLines)
    if ($progress.Count) { $page.progress = $progress }
    # 설치 범위 화면 — 기준 단추를 고른다
    $pick = if ($Mode -eq 'all') { [Win]::FindButton($h, '모든 사용자') } else { [Win]::FindButton($h, '전용') }
    if ($pick -ne [IntPtr]::Zero -and $page.text -match '모든 사용자') {
      [Win]::SendMessage($pick, $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
      Start-Sleep -Milliseconds 400
      $page.picked = [Win]::Text($pick)
      [Win]::ShotStable($h, (Join-Path $Out ('{0}-{1:00}-범위.png' -f $prefix, $n))) | Out-Null
      $page.pickedTextLines = @([Win]::TextLines($h))
      $page.pickedTextProblems = @(TextRules $page.pickedTextLines)
    }
    # 위치 화면 — 기본값을 읽어 둔다(바꾸지 않는다)
    $dir = [Win]::FindChildById($h, 1019)
    if ($dir -ne [IntPtr]::Zero) { $page.defaultDir = [Win]::EditText($dir); $report.defaultDir = $page.defaultDir }
    $report.pages += $page
    [Win]::PostMessage($next, $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Start-Sleep -Milliseconds 600
    # «설치»(위치 화면) · «다음»(제거 첫 화면)을 누르면 묻는 창이 뜰 수 있다
    if ((HandleBoxes $prefix $n $h 15) -eq 'exit') {
      # 취소한 뒤 그 화면에 남은 것을 확인하고, 사람처럼 «취소» 단추(2)로 설치기 · 제거기를 끝낸다
      [Win]::ShotStable($h, (Join-Path $Out ('{0}-{1:00}-취소-뒤.png' -f $prefix, $n))) | Out-Null
      [Win]::PostMessage([Win]::GetDlgItem($h, 2), $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
      for ($i = 0; $i -lt 40 -and [Win]::IsWindow($h) -and [Win]::IsWindowVisible($h); $i++) { Start-Sleep -Milliseconds 250 }
      $report.exitedAfterCancel = -not ([Win]::IsWindow($h) -and [Win]::IsWindowVisible($h))
      return $true
    }
    Start-Sleep -Milliseconds 400
  }
  return $true
}

# 설치기를 연다 — -AsUser면 탐색기를 거쳐 일반 권한으로(이 도구가 관리자 권한이어도 사람이 두 번 누른 것과 같은 권한)
function StartInstaller {
  if ($AsUser) { Start-Process -FilePath (Join-Path $env:WINDIR 'explorer.exe') -ArgumentList "`"$Installer`"" | Out-Null } else { Start-Process -FilePath $Installer | Out-Null }
}

# 제거기를 사람이 여는 두 길 중 하나로 연다
function StartUninstaller {
  if ($Via -eq 'startmenu') {
    Check '시작 메뉴 «Uninstall Poster Studio»가 있다' (Test-Path $uninstallLnk) $uninstallLnk
    Start-Process -FilePath $uninstallLnk | Out-Null   # 시작 메뉴에서 누른 것과 같다(바로가기를 연다)
  } else {
    $props = Get-ItemProperty (Entry $hive).PSPath
    Check "«설치된 앱»의 «Poster Studio» 제거 명령이 있다($hive)" ($props.UninstallString -like "*Uninstall Poster Studio.exe*") $props.UninstallString
    # «설정 → 앱 → 설치된 앱»과 «프로그램 추가/제거»의 «제거»는 이 등록 값의 명령을 그대로 실행한다
    $cmd = $props.UninstallString
    if ($cmd -match '^"([^"]+)"\s*(.*)$') { Start-Process -FilePath $Matches[1] -ArgumentList $Matches[2] | Out-Null } else { Start-Process -FilePath $cmd | Out-Null }
  }
}

# 다른 범위(-Beside의 예전 판)의 자리
$otherRoot = if ($Mode -eq 'all') { Join-Path $env:LOCALAPPDATA 'Programs' } else { $env:ProgramFiles }
$otherParent = Join-Path $otherRoot 'InKY Film Festival'
$otherExe = Join-Path (Join-Path $otherParent 'Poster Studio') 'Poster Studio.exe'
$otherDesk = Join-Path ([Environment]::GetFolderPath($(if ($Mode -eq 'all') { 'Desktop' } else { 'CommonDesktopDirectory' }))) 'Poster Studio.lnk'
$otherMenu = Join-Path ([Environment]::GetFolderPath($(if ($Mode -eq 'all') { 'Programs' } else { 'CommonPrograms' }))) 'InKY Film Festival'

# 깔린 앱을 켠다(-AppOn) — 창이 뜰 때까지 기다린다
function StartApp($path) {
  Start-Process -FilePath $path | Out-Null
  $p = $null
  for ($i = 0; $i -lt 60 -and -not $p; $i++) { Start-Sleep -Milliseconds 500; $p = Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Poster Studio' -and $_.Path -ieq $path } | Select-Object -First 1 }
  return $p
}
function CloseApps { Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.WaitForExit(15000) | Out-Null } }

# 묻는 창(10/28 Bumm님): 이미 깔려 있으면 «이미 설치되어 있습니다 · 지우고 새로 설치할까요?», 앱이 켜져 있으면 «켜져 있습니다 · 끄고 계속할까요?»
# (끄지 못하면 «끄지 못했습니다 … 다시 시도»). «취소»는 그 화면(설치 위치 · 제거 첫 화면)에 남고 앱도 켜진 채여야 한다.
function PromptChecks($kind) {
  $boxes = @($report.messageBoxes)
  $desc = ($boxes | ForEach-Object { '«' + ($_.text -replace "`r`n", ' / ') + '» → ' + $_.answer }) -join ' | '
  if (-not ($Replace -or $Beside -or $AppOn)) {
    Check "$kind 묻는 창이 뜨지 않는다(예전 판 없음 · 앱 꺼짐)" ($boxes.Count -eq 0) $desc
    return
  }
  $unknown = @($boxes | Where-Object { $_.text -notmatch '이미 설치되어 있습니다|켜져 있습니다|끄지 못했습니다' })
  $installed = @($boxes | Where-Object { $_.text -match '이미 설치되어 있습니다' })
  $running = @($boxes | Where-Object { $_.text -match '켜져 있습니다' })
  $pageMark = if ($kind -eq '설치') { '\[1037\]설치 위치 선택' } else { '\[1201\]' }   # 위치 화면 머리 제목 · 제거 첫 화면 제목(경로 칸 글은 다른 프로세스에서 이 방법으로 안 읽힌다)
  $stayBad = @($boxes | Where-Object { $_.answer -like 'cancel*' -and ($_.after -notmatch $pageMark -or ($_.text -match '켜져 있습니다' -and -not $_.appAlive)) })
  $ok = $boxes.Count -gt 0 -and $unknown.Count -eq 0 -and $stayBad.Count -eq 0 -and (-not ($Replace -or $Beside) -or $installed.Count -ge 1) -and (-not $AppOn -or $running.Count -ge 1)
  Check "$kind 묻는 창이 뜨고(이미 설치 $($installed.Count) · 켜진 앱 $($running.Count)), «취소»면 그 화면에 남고 앱도 켜진 채다" $ok $desc
}

if ($Step -eq 'install') {
  if ($Replace) {
    $oldBorn = if (Test-Path $exe) { (Get-Item $exe).CreationTimeUtc } else { $null }
    Check "설치 전: 같은 범위($hive)에 예전 판이 깔려 있다(덮어쓰기 시험)" ($null -ne (Entry $hive) -and $null -ne $oldBorn) $(if ($oldBorn) { "$exe · $($oldBorn.ToString('o'))" })
  } elseif ($Beside) {
    Check "설치 전: 이 범위($hive)에는 설치가 없고 다른 범위($otherHive)에만 있다" ((-not (Entry $hive)) -and -not (Test-Path $exe) -and $null -ne (Entry $otherHive) -and (Test-Path $otherExe)) $otherExe
  } else {
    Check '설치 전: 같은 이름의 설치가 없다(HKCU · HKLM)' ((-not (Entry 'HKCU')) -and (-not (Entry 'HKLM')) -and -not (Test-Path $exe)) $null
  }
  if ($AppOn) {
    $appPath = if ($Beside) { $otherExe } else { $exe }
    $appProc = StartApp $appPath
    Check '설치 전: 깔린 앱을 켜 둔다' ($null -ne $appProc) $appPath
  }
  StartInstaller
  $walked = Walk "installer-$Mode"
  PromptChecks '설치'
  if ($Decline) {
    Check '«취소» 뒤 설치기를 «취소» 단추로 끝낼 수 있다' ([bool]$report.exitedAfterCancel) $null
    if ($Replace) { Check '설치하지 않아 예전 판(같은 범위)이 그대로다' ($null -ne (Entry $hive) -and (Test-Path $exe) -and (Get-Item $exe).CreationTimeUtc -eq $oldBorn -and (Test-Path $startLnk)) $exe }
    if ($Beside) { Check "설치하지 않아 예전 판(다른 범위 $otherHive)이 그대로다" ($null -ne (Entry $otherHive) -and (Test-Path $otherExe) -and -not (Entry $hive)) $otherExe }
    if ($AppOn) { Check '앱이 켜진 채다' ($null -ne (Get-Process 'Poster Studio' -ErrorAction SilentlyContinue)) $null; CloseApps }
  } else {
    Check '설치 창이 뜨고 화면을 끝까지 넘긴다' $walked $report.title
    ProgressChecks '설치' '설치 위치' '프로그램 파일을 설치하는 중' '설치' '설치가 끝났습니다.'
    for ($i = 0; $i -lt 120 -and -not (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
    Check '설치 범위 화면(«me 전용» · «모든 사용자»)이 있고 기준 단추를 골랐다' (@($report.pages | Where-Object { $_.picked }).Count -eq 1) (@($report.pages | Where-Object { $_.picked }) | ForEach-Object { $_.picked })
    Check '위치 바꾸는 화면이 있고 기본 위치가 기준이다' ($report.defaultDir -eq $appDir) "$($report.defaultDir)"
    Check "기준 위치에 설치된다($appDir)" (Test-Path $exe) $exe
    if ($Replace -or $Beside) {
      $final = @($report.finalList)
      $iOld = [array]::IndexOf($final, '예전 Poster Studio를 지우는 중입니다 …')
      $iNew = [array]::IndexOf($final, '프로그램 파일을 설치하는 중입니다 …')
      $dels = if ($iOld -ge 0 -and $iNew -gt $iOld + 1) { @($final[($iOld + 1)..($iNew - 1)] | Where-Object { $_ -like '삭제: *' }) } else { @() }
      Check '예전 판: «예전 Poster Studio를 지우는 중입니다 …»와 «삭제: …» 줄이 먼저 흐르고 «프로그램 파일을 설치하는 중입니다 …»가 뒤따른다' ($iOld -ge 0 -and $iNew -gt $iOld -and $dels.Count -ge 15) "삭제 줄 $($dels.Count)개 · 순서 $iOld → $iNew"
    }
    if ($Replace) { $newBorn = (Get-Item $exe -ErrorAction SilentlyContinue).CreationTimeUtc; Check '덮어쓴 뒤 앱 실행 파일이 새로 놓였다(만든 시각)' ($newBorn -and $oldBorn -and $newBorn -gt $oldBorn) "$($oldBorn.ToString('o')) → $(if ($newBorn) { $newBorn.ToString('o') })" }
    if ($Beside) {
      # «InKY Film Festival» 폴더 · 시작 메뉴 폴더는 다른 앱(Voice Cinema 등)과 함께 쓴다 — Poster Studio 것이 남지 않고, 폴더는 비었을 때만 지워졌는지 본다
      $left = @(@((Join-Path $otherParent 'Poster Studio'), $otherDesk, (Join-Path $otherMenu 'Poster Studio.lnk'), (Join-Path $otherMenu 'Uninstall Poster Studio.lnk')) | Where-Object { Test-Path $_ }) + @(@($otherParent, $otherMenu) | Where-Object { (Test-Path $_) -and -not (Get-ChildItem $_ -Force | Select-Object -First 1) }) + @(if (Entry $otherHive) { "«설치된 앱» $otherHive 등록" })
      Check "다른 범위($otherHive)의 예전 판이 남김없이 지워진다(폴더 · «설치된 앱» 등록 · 바탕화면 · 시작 메뉴 폴더)" ($left.Count -eq 0) $(if ($left.Count) { ($left + @(if (Test-Path $otherMenu) { Get-ChildItem $otherMenu | ForEach-Object { "시작 메뉴 안: $($_.Name)" } })) -join ' · ' })
    }
    Check '설치 폴더에 제거 프로그램이 있다' (Test-Path $uninstaller) $uninstaller
    $entry = Entry $hive
    $props = if ($entry) { Get-ItemProperty $entry.PSPath } else { $null }
    Check "«설치된 앱»에 «Poster Studio»로 등록($hive)" ($null -ne $props -and $props.UninstallString -like "*Uninstall Poster Studio.exe*") $(if ($props) { "$($props.DisplayName) · $($props.Publisher) · $($props.DisplayVersion) · $($props.UninstallString)" })
    if ($Mode -eq 'all') {
      $guid = if ($entry) { Split-Path $entry.PSPath -Leaf } else { '' }
      $stub = if ($guid) { (Get-ItemProperty "HKCU:\Software\$guid" -ErrorAction SilentlyContinue).InstallLocation } else { $null }
      Check '«모든 사용자» 설치 뒤 «나만» 위치 메모(HKCU)가 남지 않는다' (-not $stub) $stub
    }
    $d = LnkInfo $desktopLnk; $s = LnkInfo $startLnk; $u = LnkInfo $uninstallLnk
    Check "바탕화면 «Poster Studio»($desktopDir)" ($d -and $d.target -ieq $exe) ($d | ConvertTo-Json -Compress)
    Check '시작 메뉴 «InKY Film Festival» 폴더 안 «Poster Studio»' ($s -and $s.target -ieq $exe) ($s | ConvertTo-Json -Compress)
    Check '시작 메뉴 «InKY Film Festival» 폴더 안 «Uninstall Poster Studio»' ($u -and $u.target -ieq $uninstaller) ($u | ConvertTo-Json -Compress)
    $menuItems = if (Test-Path $menuDir) { (Get-ChildItem $menuDir | ForEach-Object { $_.Name }) -join ' · ' } else { '' }
    $report.menuItems = $menuItems
    $app = $null
    for ($i = 0; $i -lt 60 -and -not $app; $i++) { Start-Sleep -Milliseconds 500; $app = Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Poster Studio' -and $_.Path -ieq $exe } | Select-Object -First 1 }
    Check '설치가 끝나면 앱이 바로 뜬다(창 제목 «Poster Studio»)' ($null -ne $app) $(if ($app) { "$($app.Path)" })
    if ($app) {
      Start-Sleep -Seconds 5
      [Win]::Shot($app.MainWindowHandle, (Join-Path $Out "app-after-install-$Mode.png"))
      $app.CloseMainWindow() | Out-Null
      Check '창을 닫으면 앱이 끝난다' ($app.WaitForExit(15000)) $null
    }
    CloseApps
  }
} else {
  $born = if (Test-Path $exe) { (Get-Item $exe).CreationTimeUtc } else { $null }
  if ($AppOn) {
    $appProc = StartApp $exe
    Check '제거 전: 깔린 앱을 켜 둔다' ($null -ne $appProc) $exe
  }
  StartUninstaller
  $walked = Walk "uninstaller-$Mode-$Via"
  PromptChecks '제거'
  if ($Decline) {
    Check '«취소» 뒤 제거기를 «취소» 단추로 끝낼 수 있다' ([bool]$report.exitedAfterCancel) $null
    Check '제거하지 않아 설치가 그대로다' ($null -ne (Entry $hive) -and (Test-Path $exe) -and (Get-Item $exe).CreationTimeUtc -eq $born -and (Test-Path $startLnk)) $exe
    if ($AppOn) { Check '앱이 켜진 채다' ($null -ne (Get-Process 'Poster Studio' -ErrorAction SilentlyContinue)) $null; CloseApps }
  } else {
    Check '제거 창이 뜨고 화면을 끝까지 넘긴다' $walked $report.title
    ProgressChecks '제거' '제거 위치' '지우는 중' '삭제' '제거가 끝났습니다.'
    for ($i = 0; $i -lt 120 -and (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
    Start-Sleep -Seconds 3
    Check '설치 폴더가 지워진다' (-not (Test-Path $appDir)) $(if (Test-Path $appDir) { (Get-ChildItem $appDir -Recurse | Measure-Object).Count.ToString() + '개 남음' })
    # «InKY Film Festival» 폴더는 다른 앱(Voice Cinema 등)과 함께 쓴다 — 비었으면 지워지고, 다른 앱이 있으면 그 앱 것만 남아야 한다(10/28: 이 PC에 Voice Cinema가 깔림)
    $parentLeft = if (Test-Path $parent) { @(Get-ChildItem $parent -Force | ForEach-Object { $_.Name }) } else { @() }
    Check '«InKY Film Festival» 폴더(설치 쪽)에 Poster Studio가 남지 않고, 비었으면 지워진다' ((-not (Test-Path $parent)) -or ($parentLeft.Count -gt 0 -and $parentLeft -notcontains 'Poster Studio')) $(if (Test-Path $parent) { '남은 것(다른 앱): ' + ($parentLeft -join ' · ') } else { '지워짐' })
    Check '바탕화면 바로가기가 지워진다' (-not (Test-Path $desktopLnk)) $desktopLnk
    $menuLeft = if (Test-Path $menuDir) { @(Get-ChildItem $menuDir -Force | ForEach-Object { $_.Name }) } else { @() }
    Check '시작 메뉴 «InKY Film Festival»에서 두 바로가기가 지워지고, 폴더는 비었으면 지워진다' ((-not (Test-Path $menuDir)) -or ($menuLeft.Count -gt 0 -and $menuLeft -notcontains 'Poster Studio.lnk' -and $menuLeft -notcontains 'Uninstall Poster Studio.lnk')) $(if (Test-Path $menuDir) { '남은 것(다른 앱): ' + ($menuLeft -join ' · ') } else { '지워짐' })
    Check '«설치된 앱» 등록이 지워진다(HKCU · HKLM)' ((-not (Entry 'HKCU')) -and (-not (Entry 'HKLM'))) $null
    Check '앱 데이터(%APPDATA%\Poster Studio)가 지워진다' (-not (Test-Path $appData)) $appData
    if ($AppOn) { Check '켜 둔 앱이 꺼졌다' ($null -eq (Get-Process 'Poster Studio' -ErrorAction SilentlyContinue)) $null }
  }
}
TextChecks
$report.finishedAt = (Get-Date).ToString('o')
$report | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $Out "installer-$tag.json")
$failed = @($report.checks | Where-Object { -not $_.ok }).Count
Write-Output $(if ($failed) { "걸림 $failed 건 / $($report.checks.Count)" } else { "모두 통과 $($report.checks.Count)건" })
exit $(if ($failed) { 1 } else { 0 })
