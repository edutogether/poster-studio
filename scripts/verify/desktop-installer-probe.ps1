# Windows 설치판 설치 · 제거 확인(2026-10-27 Bumm님 기준, 팀장 전달 — _docs/intents/2026-10-27-desktop-installer).
#
#   설치:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify/desktop-installer-probe.ps1 -Step install -Mode user|all -Installer <Poster Studio Setup.exe> -Out <결과 폴더> [-Replace]
#   제거:  ... -Step uninstall -Mode user|all -Via startmenu|settings -Out <결과 폴더>
#   앱이 켜져 있을 때: ... -Step running -Mode user|all -Installer <…> -Via startmenu|settings -Out <결과 폴더>
#          그 범위에 깔린 앱을 켜 둔 채 설치기 · 제거기를 띄워, 첫머리에 뜨는 «앱 실행 중» 알림을 찍고 «취소»로 닫는다(설치 · 제거는 일어나지 않는다).
#   -Beside: 다른 범위에도 설치가 있는 PC(«모든 사용자» · «나만» 함께) — 설치 전 · 제거 뒤 검사가 다른 범위 설치는 그대로인지를 본다.
#          두 범위가 함께 있으면 제거기에 «제거 옵션 선택» 화면이 뜬다(-Mode에 맞는 단추를 고른다).
#
# 화면 글(10/28 Bumm님): 화면마다 글 칸의 실제 글꼴로 줄 폭을 재서, 줄이 칸 안에 들어가는지(낱말 중간에서 꺾이지 않는지) · 한 줄에 두 문장이 없는지 ·
# «(을)를» 같은 조사 표기와 글자 그대로 찍힌 «\n»이 없는지 본다. 알림 창 글도 같은 기준으로 본다.
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
  [Parameter(Mandatory = $true)][ValidateSet('install', 'uninstall', 'running')][string]$Step,
  [Parameter(Mandatory = $true)][ValidateSet('user', 'all')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Installer,
  [ValidateSet('startmenu', 'settings')][string]$Via = 'startmenu',
  # -Replace: 같은 범위에 예전 판이 깔려 있는 PC에서 새 판으로 덮어쓰는 시험(10/27 — Bumm님이 «모든 사용자»로 옛 판을 깔아 두신 PC).
  #   설치 전 검사가 «설치가 없다» 대신 «예전 판이 있다»가 되고, 설치 뒤 앱 실행 파일이 새로 쓰였는지 본다.
  [switch]$Replace,
  # -Beside: 다른 범위에도 설치가 있는 PC에서 시험한다(10/28 — 두 범위가 함께 있을 때만 뜨는 «제거 옵션 선택» 화면과, 한 범위를 깔고 지워도 다른 범위가 그대로인지).
  [switch]$Beside,
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
        IntPtr f = SendMessage(h, 0x0031, IntPtr.Zero, IntPtr.Zero);   // WM_GETFONT
        if (f != IntPtr.Zero && GetObject(f, lf.Length, lf) > 0) { font = CreateFontIndirect(lf); old = SelectObject(dc, font); }
        uint fmt = 0x0400 | 0x0020 | 0x0040 | ((style & 0x80) != 0 ? 0x0800u : 0u);   // CALCRECT · SINGLELINE · EXPANDTABS (+ SS_NOPREFIX면 NOPREFIX)
        foreach (var line in t.Replace("\r\n", "\n").Split('\n')) {
          if (line.Trim().Length == 0) continue;
          RECT r = new RECT(); DrawText(dc, line, -1, ref r, fmt);
          rows.Add(GetDlgCtrlID(h) + "\t" + c.R + "\t" + (r.R - r.L) + "\t" + line);
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
# 진행 화면 글(10/27 Bumm님 B안): 위 한 줄과 «자세히» 목록에 사람이 읽는 문장만 — 임시 폴더 경로 · .7z · .dll 같은 내부 이름과 NSIS 원래 기록 말투가 없어야 하고,
# 위치 줄(실제 경로)과 그 단계의 문장이 있어야 하며, 진행에 따라 문구가 바뀌어야(서로 다른 줄 3개 이상) 한다.
function ProgressChecks($kind, $whereLabel, $doing) {
  $samples = @($report.pages | ForEach-Object { $_.progress } | Where-Object { $_ })
  $statuses = @($samples | ForEach-Object { if ($_.text -match '\[1006\]([^|]*)\|') { $Matches[1].Trim() } } | Where-Object { $_ } | Select-Object -Unique)
  $lines = @($samples | ForEach-Object { $_.details } | Where-Object { $_ } | Select-Object -Unique)
  $raw = '\\Temp\\|\.7z|\.dll|\.tmp|압축 해제|파일 복사|대상 폴더|폴더 생성|바로 가기 생성|파일 삭제|실행:|Extract|Output folder|Delete file|Uninstall was'
  $bad = @(@($statuses) + @($lines) | Where-Object { $_ -match $raw } | Select-Object -Unique)
  Check "$kind 진행 글에 원래 기록(임시 폴더 · .7z · .dll · 압축 해제 · 파일 삭제 …)이 없다" ($samples.Count -gt 0 -and $bad.Count -eq 0) $(if ($bad.Count) { $bad -join ' | ' } else { "표본 $($samples.Count)개" })
  $where = "$($whereLabel): $appDir"
  Check "$kind 진행 글이 쉬운 문장으로 바뀌어 간다(위치 줄 · «$doing» · 서로 다른 줄 3개 이상)" (($lines -contains $where) -and @($lines | Where-Object { $_ -like "*$doing*" }).Count -gt 0 -and $lines.Count -ge 3) ($lines -join ' → ')
  $report.progressLines = $lines
  $report.progressStatuses = $statuses
}
# 화면 글 규칙(10/28 Bumm님 «문장마다 줄바꿈»): [Win]::TextLines의 줄마다 — 칸 안에 들어간다 · 한 줄에 두 문장이 없다 · 조사 표기 · «\n» 글자가 없다.
# 칸보다 긴 한 문장은 낱말 사이에서 나눈 두 줄이면 통과다(줄마다 칸 안에 들면 꺾임이 없다).
function TextRules($rows) {
  $bad = @()
  foreach ($row in @($rows)) {
    $id, $box, $width, $line = $row -split "`t", 4
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

# 설치 · 제거 창을 화면마다 찍으며 «다음»(단추 1)을 누른다
function Walk($prefix) {
  $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 160 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 250; $h = [Win]::FindDialog('Poster Studio') }
  if ($h -eq [IntPtr]::Zero) { return $false }
  $report.title = [Win]::Text($h)
  for ($n = 1; $n -le 14; $n++) {
    if (-not [Win]::IsWindow($h)) {
      # «모든 사용자»를 고르면 설치기가 관리자 권한으로 다시 뜬다(새 창) — 그 창을 이어서 잡는다
      $h2 = [IntPtr]::Zero
      for ($i = 0; $i -lt 40 -and $h2 -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 250; $h2 = [Win]::FindDialog('Poster Studio') }
      if ($h2 -eq [IntPtr]::Zero) { break }
      $h = $h2
    }
    $next = [Win]::GetDlgItem($h, 1)
    # 설치가 도는 동안(«다음»이 꺼져 있는 동안)은 0.5초마다 그 화면을 찍고, 진행 글(위 한 줄 · «자세히» 목록)은 0.1초마다 읽는다 —
    # 마지막 단계가 0.5초 안에 끝나면 찍는 간격으로는 그 줄을 놓친다(10/27 «모든 사용자» 제거 실측)
    $progress = @()
    for ($w = 0; $w -lt 1500 -and -not [Win]::IsWindowEnabled($next) -and [Win]::IsWindow($h); $w++) {
      # 알림 창(앱이 켜져 있을 때 등)이 뜨면 찍고 글을 재고 «취소»(단추 2)로 닫는다 — 설치기는 그만두고 닫힌다
      $box = [Win]::FindMessageBox('Poster Studio')
      if ($box -ne [IntPtr]::Zero) {
        Start-Sleep -Milliseconds 500
        $bf = Join-Path $Out ('{0}-{1:00}-알림-{2:00}.png' -f $prefix, $n, (@($report.messageBoxes).Count + 1))
        [Win]::ShotStable($box, $bf) | Out-Null
        $rows = @([Win]::TextLines($box))
        $report.messageBoxes += [ordered]@{ shot = (Split-Path $bf -Leaf); prefix = $prefix; title = [Win]::Text($box); text = [Win]::Text([Win]::MessageText($box)); buttons = [Win]::AllText($box); textLines = $rows; textProblems = @(TextRules $rows) }
        [Win]::PostMessage($box, 0x0111, [IntPtr]2, [IntPtr]::Zero) | Out-Null   # WM_COMMAND IDCANCEL — «취소» 단추가 보내는 것과 같은 알림
        for ($i = 0; $i -lt 40 -and [Win]::IsWindow($box); $i++) { Start-Sleep -Milliseconds 250 }
        continue
      }
      if ($w % 5 -eq 0 -and @($progress | Where-Object { $_.shot }).Count -lt 40) {
        $pf = Join-Path $Out ('{0}-{1:00}-진행-{2:00}.png' -f $prefix, $n, (@($progress | Where-Object { $_.shot }).Count + 1))
        [Win]::Shot($h, $pf)
        $progress += [ordered]@{ shot = (Split-Path $pf -Leaf); text = [Win]::AllText($h); details = @(DetailLines $h) }
      } else {
        $progress += [ordered]@{ text = [Win]::AllText($h); details = @(DetailLines $h) }
      }
      Start-Sleep -Milliseconds 100
    }
    if (-not [Win]::IsWindow($h)) { continue }
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
    Start-Sleep -Milliseconds 1000
  }
  return $true
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

if ($Step -eq 'install') {
  if ($Replace) {
    $oldTime = if (Test-Path $exe) { (Get-Item $exe).LastWriteTimeUtc } else { $null }
    Check "설치 전: 같은 범위($hive)에 예전 판이 깔려 있다(덮어쓰기 시험)" ($null -ne (Entry $hive) -and $null -ne $oldTime) $(if ($oldTime) { "$exe · $($oldTime.ToString('o'))" })
  } elseif ($Beside) {
    Check "설치 전: 이 범위($hive)에는 설치가 없고 다른 범위($otherHive)에는 있다(두 범위 함께)" ((-not (Entry $hive)) -and -not (Test-Path $exe) -and $null -ne (Entry $otherHive)) $null
  } else {
    Check '설치 전: 같은 이름의 설치가 없다(HKCU · HKLM)' ((-not (Entry 'HKCU')) -and (-not (Entry 'HKLM')) -and -not (Test-Path $exe)) $null
  }
  Start-Process -FilePath $Installer | Out-Null
  $walked = Walk "installer-$Mode"
  Check '설치 창이 뜨고 화면을 끝까지 넘긴다' $walked $report.title
  ProgressChecks '설치' '설치 위치' '프로그램 파일을 설치하는 중'
  for ($i = 0; $i -lt 120 -and -not (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
  Check '설치 범위 화면(«me 전용» · «모든 사용자»)이 있고 기준 단추를 골랐다' (@($report.pages | Where-Object { $_.picked }).Count -eq 1) (@($report.pages | Where-Object { $_.picked }) | ForEach-Object { $_.picked })
  Check '위치 바꾸는 화면이 있고 기본 위치가 기준이다' ($report.defaultDir -eq $appDir) "$($report.defaultDir)"
  Check "기준 위치에 설치된다($appDir)" (Test-Path $exe) $exe
  if ($Replace) { $newTime = (Get-Item $exe -ErrorAction SilentlyContinue).LastWriteTimeUtc; Check '덮어쓴 뒤 앱 실행 파일이 새 판으로 바뀌었다' ($newTime -and $oldTime -and $newTime -ne $oldTime) "$($oldTime.ToString('o')) → $(if ($newTime) { $newTime.ToString('o') })" }
  Check '설치 폴더에 제거 프로그램이 있다' (Test-Path $uninstaller) $uninstaller
  $entry = Entry $hive
  $props = if ($entry) { Get-ItemProperty $entry.PSPath } else { $null }
  Check "«설치된 앱»에 «Poster Studio»로 등록($hive)" ($null -ne $props -and $props.UninstallString -like "*Uninstall Poster Studio.exe*") $(if ($props) { "$($props.DisplayName) · $($props.Publisher) · $($props.DisplayVersion) · $($props.UninstallString)" })
  if ($Mode -eq 'all') {
    $guid = if ($entry) { Split-Path $entry.PSPath -Leaf } else { '' }
    $stub = if ($guid) { (Get-ItemProperty "HKCU:\Software\$guid" -ErrorAction SilentlyContinue).InstallLocation } else { $null }
    if ($Beside) {
      # «나만» 설치가 따로 있으면 HKCU 위치 값은 메모가 아니라 그 설치의 기록이다 — 지워지면 «나만» 제거기가 «모든 사용자» 설치를 지우러 간다(10/28)
      $userDir = Join-Path $env:LOCALAPPDATA 'Programs\InKY Film Festival\Poster Studio'
      Check '«모든 사용자» 설치 뒤에도 «나만» 설치의 위치 기록(HKCU)은 그대로다' ($stub -eq $userDir) "$stub"
    } else {
      Check '«모든 사용자» 설치 뒤 «나만» 위치 메모(HKCU)가 남지 않는다' (-not $stub) $stub
    }
  }
  $d = LnkInfo $desktopLnk; $s = LnkInfo $startLnk; $u = LnkInfo $uninstallLnk
  Check "바탕화면 «Poster Studio»($desktopDir)" ($d -and $d.target -ieq $exe) ($d | ConvertTo-Json -Compress)
  Check '시작 메뉴 «InKY Film Festival» 폴더 안 «Poster Studio»' ($s -and $s.target -ieq $exe) ($s | ConvertTo-Json -Compress)
  Check '시작 메뉴 «InKY Film Festival» 폴더 안 «Uninstall Poster Studio»' ($u -and $u.target -ieq $uninstaller) ($u | ConvertTo-Json -Compress)
  $menuItems = if (Test-Path $menuDir) { (Get-ChildItem $menuDir | ForEach-Object { $_.Name }) -join ' · ' } else { '' }
  $report.menuItems = $menuItems
  $app = $null
  for ($i = 0; $i -lt 60 -and -not $app; $i++) { Start-Sleep -Milliseconds 500; $app = Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Poster Studio' } | Select-Object -First 1 }
  Check '설치가 끝나면 앱이 바로 뜬다(창 제목 «Poster Studio»)' ($null -ne $app) $(if ($app) { "$($app.Path)" })
  if ($app) {
    Start-Sleep -Seconds 5
    [Win]::Shot($app.MainWindowHandle, (Join-Path $Out "app-after-install-$Mode.png"))
    $app.CloseMainWindow() | Out-Null
    Check '창을 닫으면 앱이 끝난다' ($app.WaitForExit(15000)) $null
    Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | ForEach-Object { $_.WaitForExit(10000) | Out-Null }
  }
} elseif ($Step -eq 'running') {
  # 앱을 켜 둔 채 설치기 · 제거기를 띄운다 — 설치 · 제거 첫머리에 «앱 실행 중» 알림이 뜬다. Walk가 그 창을 찍고 «취소»로 닫는다(설치기는 그만두고 닫힌다).
  Check "시작 전: 이 범위($hive)에 설치가 있다" ($null -ne (Entry $hive) -and (Test-Path $exe)) $exe
  $exeTime = if (Test-Path $exe) { (Get-Item $exe).LastWriteTimeUtc } else { $null }
  Start-Process -FilePath $exe | Out-Null
  $app = $null
  for ($i = 0; $i -lt 60 -and -not $app; $i++) { Start-Sleep -Milliseconds 500; $app = Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Poster Studio' -and $_.Path -ieq $exe } | Select-Object -First 1 }
  Check '앱을 켜 둔다(이 범위의 실행 파일)' ($null -ne $app) $exe
  Start-Process -FilePath $Installer | Out-Null
  Walk "running-installer-$Mode" | Out-Null
  $boxes = @($report.messageBoxes | Where-Object { $_.prefix -like 'running-installer-*' })
  Check '설치기: «앱 실행 중» 알림이 뜨고 «취소»를 누르면 설치기가 닫힌다' ($boxes.Count -eq 1 -and $boxes[0].text -like '*실행 중*' -and -not [Win]::IsWindow([Win]::FindDialog('Poster Studio'))) $(if ($boxes.Count) { "$($boxes[0].title) · $($boxes[0].text -replace "`r`n", ' / ') · $($boxes[0].buttons)" })
  StartUninstaller
  Walk "running-uninstaller-$Mode-$Via" | Out-Null
  $boxes = @($report.messageBoxes | Where-Object { $_.prefix -like 'running-uninstaller-*' })
  Check '제거기: «앱 실행 중» 알림이 뜨고 «취소»를 누르면 제거기가 닫힌다' ($boxes.Count -eq 1 -and $boxes[0].text -like '*실행 중*' -and -not [Win]::IsWindow([Win]::FindDialog('Poster Studio'))) $(if ($boxes.Count) { "$($boxes[0].title) · $($boxes[0].text -replace "`r`n", ' / ') · $($boxes[0].buttons)" })
  Start-Sleep -Seconds 2
  Check '«취소» 뒤에도 설치가 그대로다(실행 파일 · 제거 프로그램 · 등록)' ((Test-Path $exe) -and (Test-Path $uninstaller) -and $null -ne (Entry $hive) -and $exeTime -and (Get-Item $exe).LastWriteTimeUtc -eq $exeTime) $exe
  if ($app) {
    Check '앱은 그동안 켜진 채다' (-not $app.HasExited) $null
    $app.CloseMainWindow() | Out-Null
    Check '창을 닫으면 앱이 끝난다' ($app.WaitForExit(15000)) $null
    Get-Process 'Poster Studio' -ErrorAction SilentlyContinue | ForEach-Object { $_.WaitForExit(10000) | Out-Null }
  }
} else {
  StartUninstaller
  $walked = Walk "uninstaller-$Mode-$Via"
  Check '제거 창이 뜨고 화면을 끝까지 넘긴다' $walked $report.title
  ProgressChecks '제거' '제거 위치' '지우는 중'
  for ($i = 0; $i -lt 120 -and (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Seconds 3
  Check '설치 폴더가 지워진다' (-not (Test-Path $appDir)) $(if (Test-Path $appDir) { (Get-ChildItem $appDir -Recurse | Measure-Object).Count.ToString() + '개 남음' })
  Check '비게 된 «InKY Film Festival» 폴더(설치 쪽)도 지워진다' (-not (Test-Path $parent)) $parent
  Check '바탕화면 바로가기가 지워진다' (-not (Test-Path $desktopLnk)) $desktopLnk
  Check '시작 메뉴 «InKY Film Festival» 폴더와 두 바로가기가 지워진다' (-not (Test-Path $menuDir)) $(if (Test-Path $menuDir) { (Get-ChildItem $menuDir | ForEach-Object { $_.Name }) -join ' · ' })
  if ($Beside) {
    Check "«설치된 앱» 등록이 이 범위($hive)에서 지워지고 다른 범위($otherHive) 설치는 그대로다" ((-not (Entry $hive)) -and $null -ne (Entry $otherHive)) $null
  } else {
    Check '«설치된 앱» 등록이 지워진다(HKCU · HKLM)' ((-not (Entry 'HKCU')) -and (-not (Entry 'HKLM'))) $null
  }
  Check '앱 데이터(%APPDATA%\Poster Studio)가 지워진다' (-not (Test-Path $appData)) $appData
}
TextChecks
$report.finishedAt = (Get-Date).ToString('o')
$report | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $Out "installer-$tag.json")
$failed = @($report.checks | Where-Object { -not $_.ok }).Count
Write-Output $(if ($failed) { "걸림 $failed 건 / $($report.checks.Count)" } else { "모두 통과 $($report.checks.Count)건" })
exit $(if ($failed) { 1 } else { 0 })
