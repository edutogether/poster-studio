; Poster Studio 설치기 추가 단계(2026-10-27 Bumm님 기준, 팀장 전달) — electron-builder가 이 파일을 설치기에 넣는다(package.json build.nsis.include).
;
; 설치 범위 화면(«나만 / 모든 사용자»)은 그대로 둔다. 위치는 둘 다 «InKY Film Festival\Poster Studio» 모양이다.
;   모든 사용자: C:\Program Files\InKY Film Festival\Poster Studio — electron-builder가 menuCategory를 붙여 만든다(관리자 승인 창이 한 번 뜬다).
;   나만:       %LOCALAPPDATA%\Programs\InKY Film Festival\Poster Studio — electron-builder는 «나만» 위치에는 menuCategory를 붙이지 않는다(multiUser.nsh).
;               «나만»을 고르면 설치기는 HKCU InstallLocation(이전 설치 위치)을 기본 위치로 쓰므로, 이전 설치가 없을 때만 그 값을 미리 적어 둔다.
;               적는 때는 설치 범위 화면이 열릴 때다 — 설치기 시작(.onInit)에서 이전 설치를 다 살펴본 뒤라 «이미 사용자별 설치가 있습니다»가 잘못 뜨지 않는다
;               (처음엔 preInit에서 적었더니 첫 설치인데 그 문구가 떴다 — 10/27 실측). «나만»으로 끝까지 설치하지 않으면(취소 · 모든 사용자) 창이 닫힐 때 지운다.
; 시작 메뉴 «InKY Film Festival» 폴더에는 «Poster Studio»(electron-builder)와 «Uninstall Poster Studio»(아래)를 둔다.
; 제거하면 그 바로가기와, 비게 된 «InKY Film Festival» 폴더(설치 폴더 쪽)까지 지운다. 시작 메뉴 폴더는 electron-builder가 비면 지운다.
;
; 화면 흐름(10/28 Bumm님, 팀장 전달):
;   설치기  설치 범위 → 설치 위치(«설치»를 누르면: 이미 깔려 있으면 «지우고 새로 설치할까요?», 앱이 켜져 있으면 «끄고 계속할까요?» — «취소»면 이 화면에 남는다)
;           → 진행(예전 판을 «삭제: …» 줄과 함께 지움 → 프로그램 파일 → «설치: …» 줄 → 바로가기 · 등록 → «설치가 끝났습니다.» · 100% 1초) → 완료
;   제거기  첫 화면(«다음»을 누르면 앱이 켜져 있을 때 «끄고 계속할까요?») → 진행(«삭제: …» 줄 → «제거가 끝났습니다.» · 100% 1초) → 완료
; 설치 위치 화면은 이 파일이 직접 넣는다(customPageAfterChangeDir). 템플릿의 위치 화면은 그 앞 화면(설치 범위)이 MUI 콜백 자리를 먼저 가져가
; «떠날 때» 확인을 붙일 수 없어, package.json에서 allowToChangeInstallationDirectory를 끄고 같은 MUI 위치 화면을 여기서 넣는다(모양 · «설치» 단추 그대로).

; 이 파일은 설치기 머리에 먼저 들어간다 — 아래 함수가 쓰는 ${If} 등(LogicLib)을 여기서 불러 둔다(이미 불렀으면 다시 읽지 않는다).
!include LogicLib.nsh
; 등록 키 이름 — electron-builder multiUser.nsh와 같은 정의(그쪽도 /ifndef라 한 값으로 맞는다). 그 파일은 이 파일보다 뒤에 들어온다.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
; 아래 함수 이름 앞붙이 — 제거기 빌드의 함수는 «un.»으로 시작해야 한다
!ifdef BUILD_UNINSTALLER
  !define PSF "un."
!else
  !define PSF ""
!endif

; ── 화면 안내문: 문장마다 새 줄, 줄은 칸 안에, «(을)를» 같은 조사 표기 없이(10/28 Bumm님, 팀장 전달) ──
; NSIS · electron-builder 한국어 기본 문구는 여러 문장이 한 덩어리로 흘러 칸 끝에서 낱말 중간에 끊겼다(«설치를 시 / 작하시려면» — 한국어는 글자마다 줄이 바뀔 수 있다).
; 칸 글꼴은 굴림 9pt(-12px), 칸 폭은 100%에서 위치 안내 525px · 설치 범위 아래 안내 490px · 머리 설명 368px · 제거 첫 화면 안내 341px다(desktop-installer-probe.ps1로 잼).
; 칸보다 긴 한 문장은 문구를 그대로 두고 낱말 사이에서 줄을 나눈다. 고친 문구는 아래 customHeader에 모았다.
; 번역투(«~할 예정입니다 · ~하십시오 · ~하였습니다 · ~주시기 바랍니다 · ~됨 · 성공적으로 완료되었습니다»)는 쉬운 말로 바꿨다(10/28 오후 팀장). 단추 이름은 «'…' 단추».
; 위치 화면 안내만 MUI 설정으로 바꾼다 — 그 화면(MUI_PAGE_DIRECTORY)보다 먼저 정해야 해서 여기 둔다. 여러 줄 안내의 줄 간격은 psSpread가 띄운다.
!ifndef BUILD_UNINSTALLER
  !define MUI_DIRECTORYPAGE_TEXT_TOP "${PRODUCT_NAME}를 아래 폴더에 설치합니다.$\r$\n다른 폴더에 설치하려면 '찾아보기' 단추를 눌러 폴더를 골라 주세요.$\r$\n설치를 시작하려면 '설치' 단추를 눌러 주세요."
!endif

; ── 설치 화면 그림: 칸 크기에 맞춘 판 고르기(10/27 Bumm님 «오른쪽 위 로고가 가로로 늘어나 깨져 보인다», 팀장 전달) ──
; 그림 칸 크기는 한글 Windows 글꼴과 화면 배율로 정해진다 — 100%에서 머리 로고 칸 175×53, 완료 화면 왼쪽 칸 191×290(desktop-installer-probe.ps1로 잼).
; electron-builder가 넣는 그림은 한 크기라 칸에 맞게 비율 없이 늘어났다(150×57 → 175×53: 가로 1.17배 · 세로 0.93배). make-assets.mjs가 배율
; 100~300%마다 칸 크기 그대로 그려 둔 판(build/installer-art) 가운데 칸의 실제 너비에 가장 가까운 것을 끼운다 — 칸과 몇 화소 다르면 그만큼만 맞춰 늘인다.
; 제거기 첫 화면 · 완료 화면 왼쪽도 설치 완료 화면과 같은 극장 그림이다(10/28 Bumm님 — 예전 흰 바탕 슬레이트 그림은 걷었다).
!define PS_HEADER_W 175
!define PS_FINISH_W 191

; $R9 = 칸 너비(화소) → $R8 = 고를 배율(100 · 125 · 150 · 175 · 200 · 225 · 250 · 300)
!macro psPickScale BASE
  IntOp $R8 $R9 * 100
  IntOp $R8 $R8 / ${BASE}
  ${If} $R8 < 113
    StrCpy $R8 100
  ${ElseIf} $R8 < 138
    StrCpy $R8 125
  ${ElseIf} $R8 < 163
    StrCpy $R8 150
  ${ElseIf} $R8 < 188
    StrCpy $R8 175
  ${ElseIf} $R8 < 213
    StrCpy $R8 200
  ${ElseIf} $R8 < 238
    StrCpy $R8 225
  ${ElseIf} $R8 < 275
    StrCpy $R8 250
  ${Else}
    StrCpy $R8 300
  ${EndIf}
!macroend

; 고른 배율($R8)의 판을 $PLUGINSDIR\ps-<NAME>.bmp로 푼다(설치기 안에는 여덟 판이 다 들어 있고, 고른 것 하나만 푼다)
!macro psExtractArt NAME
  ${If} $R8 == 100
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-100.bmp"
  ${ElseIf} $R8 == 125
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-125.bmp"
  ${ElseIf} $R8 == 150
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-150.bmp"
  ${ElseIf} $R8 == 175
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-175.bmp"
  ${ElseIf} $R8 == 200
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-200.bmp"
  ${ElseIf} $R8 == 225
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-225.bmp"
  ${ElseIf} $R8 == 250
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-250.bmp"
  ${Else}
    File "/oname=$PLUGINSDIR\ps-${NAME}.bmp" "${BUILD_RESOURCES_DIR}\installer-art\${NAME}-300.bmp"
  ${EndIf}
!macroend

; 창(컨트롤) HWND의 안쪽 너비 → $R9
!macro psClientWidth HWND
  System::Call "*(i 0, i 0, i 0, i 0) p.R7"
  System::Call "user32::GetClientRect(p ${HWND}, p R7)"
  System::Call "*$R7(i, i, i .R9, i)"
  System::Free $R7
!macroend

; 머리 로고(설치 · 제거 화면 공통 — 칸 1046): MUI가 기본 그림을 넣은 뒤(.onGUIInit 끝) 칸에 맞는 판으로 바꾼다
!macro psHeaderArt
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  InitPluginsDir
  GetDlgItem $R6 $HWNDPARENT 1046
  !insertmacro psClientWidth $R6
  ${If} $R9 > 0
    !insertmacro psPickScale ${PS_HEADER_W}
    !insertmacro psExtractArt header
    SetBrandingImage /IMGID=1046 /RESIZETOFIT "$PLUGINSDIR\ps-header.bmp"
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
!macroend

; 완료 화면 · 제거기 첫 화면 왼쪽 그림 칸(IMG)에 칸 크기에 맞는 극장 그림을 끼운다 — 칸은 화면이 만들어질 때 생겨 그 화면을 띄우기 직전(SHOW)에 잰다
!macro psSideArt IMG BMP
  Push $R7
  Push $R8
  Push $R9
  !insertmacro psClientWidth ${IMG}
  ${If} $R9 > 0
    !insertmacro psPickScale ${PS_FINISH_W}
    !insertmacro psExtractArt finish
    ${NSD_FreeImage} ${BMP}
    ${NSD_SetStretchedImage} ${IMG} "$PLUGINSDIR\ps-finish.bmp" ${BMP}
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
!macroend

; ── 진행 화면 막대(10/28 Bumm님 «막대가 80%까지 갔다가 뒤로 · 100%를 안 보이고 끝남», 팀장 전달) ──
; 원래 막대(ID 1004)에는 쓰는 쪽이 둘이었다 — NSIS는 지나간 명령 수로, 7z 풀기(Nsis7z)는 제 진행률 0~30000으로 같은 막대를 덮어 막대가 뒤로 튀었다
; (두 번 눌러 «모든 사용자»로 덮어쓸 때 50% → 5% → 80%, 그대로 완료 화면 — 10/28 설치 창 녹화).
; 그래서 원래 막대 자리에 막대를 하나 더 두고 이 파일만 그것을 움직인다(앞으로만 — psAt). 원래 막대는 숨긴다(NSIS는 계속 숨은 막대에 쓴다).
;   ① 창이 뜰 때(화면 스레드, .onGUIInit) 숨은 막대를 만든다 — 창은 만든 스레드가 그리므로 설치 스레드에서 만들면 그려지지 않는다.
;   ② 진행 화면이 열리면 그 자리로 옮겨 원래 막대를 가린다(설치기는 진행 화면 SHOW, 제거기는 제거 단계 맨 앞 — 제거기 진행 화면 SHOW 자리는 템플릿 제거 범위 화면이 가져간다).
;   ③ 설치 단계가 시작된 뒤 ID를 맞바꾼다(원래 막대 1999 · 새 막대 1004) — NSIS는 단계가 시작될 때 원래 막대를 잡아 두고, Nsis7z는 풀 때 ID 1004로 찾는다
;      (시제품 실측: SHOW에서 바꾸면 NSIS가 새 막대를 잡아 29000으로 되돌렸다). 새 막대의 범위를 Nsis7z의 0~30000이 정한 구간(A~800‰)에 오도록 잡는다.
!macro psBarCreate
  System::Call 'user32::CreateWindowExW(i 0, w "msctls_progress32", w "", i 0x40000000, i 0, i 0, i 10, i 10, p $HWNDPARENT, p 0, p 0, p 0) p.r0'
  StrCpy $psBar $0
!macroend

; ‰ 단위 위치를 막대 값으로: 값 = psLo + ‰ × psSpan / 1000. 앞으로만 간다(작은 값은 버린다).
!macro psAt PERMILLE
  Push ${PERMILLE}
  Call ${PSF}psAt
!macroend

; ── 진행 글 ── 원래 기록(«압축 해제: …\Temp\nsg….tmp\app-64.7z», 파일 복사 …)은 꺼 두고(SetDetailsPrint none) 이 파일이 쓰는 줄만 켰다 끈다.
; 단계 문장은 막대 위 한 줄과 상자에, 위치 · 파일 줄(«설치 위치: …» · «설치: …» · «삭제: …») · 한 일(바로가기 · 등록)은 상자에만 적는다.
; 막대 위 한 줄은 단계가 바뀔 때만 바뀐다 — 위치 줄 · 한 일을 거기도 적으면 몇 ms 만에 글이 연달아 바뀌어 깜빡였다(10/28 녹화). 상자는 진행 화면이 열릴 때부터 보인다(ShowInstDetails show).
!macro psStage TEXT
  SetDetailsPrint both
  DetailPrint "${TEXT}"
  SetDetailsPrint none
!macroend
!macro psNote TEXT
  SetDetailsPrint listonly
  DetailPrint "${TEXT}"
  SetDetailsPrint none
!macroend
; «머리말: 경로» 한 줄 — 상자 칸보다 길면 경로 가운데를 줄인다(psFit)
!macro psLine WORD PATH
  Push $R0
  Push "${PATH}"
  Push "${WORD}: "
  Call ${PSF}psFit
  Pop $R0
  SetDetailsPrint listonly
  DetailPrint $R0
  SetDetailsPrint none
  Pop $R0
!macroend
; 파일 줄 사이 간격 — 파일 20여 개는 한순간에 지워지고 놓여 줄이 한꺼번에 찍힌다. 하나씩 흘러가 보이게 줄마다 잠깐 둔다(Bumm님 «주르륵 지나가야»).
!define PS_PACE 35
; 상자 칸 폭에서 뺄 글 앞뒤 여백(px) — 이만큼 남겨야 상자가 줄 끝을 «…»로 자르지 않는다
!define PS_LIST_PAD 16

; ── 설치기: 위치 화면 · 진행 화면 ──
!ifndef BUILD_UNINSTALLER
  Var psBar
  Var psBarOn
  Var psLo
  Var psSpan
  Var psLast
  Var psFrom
  Var psTo
  Var psTotal
  Var psDone
  Var psExtractFrom
  Var psRemoveOld
  Var psOldDone
  Var psStarted
  Var psHasUser
  Var psHasAll

  !define MUI_CUSTOMFUNCTION_GUIINIT psGuiInit
  ; 설치 범위 화면(템플릿 PAGE_INSTALL_MODE)이 띄우기 직전(SHOW) — 아래 안내 줄 간격(psModeShow). 템플릿이 이 매크로 바로 뒤에 그 화면을 넣으므로 여기서 정해 둔다(화면은 넣지 않는다).
  !macro customWelcomePage
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW psModeShow
  !macroend
  !macro customPageAfterChangeDir
    !include StrContains.nsh
    !define MUI_PAGE_CUSTOMFUNCTION_PRE psDirPre
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW psDirShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE psDirLeave
    !insertmacro MUI_PAGE_DIRECTORY
    !define MUI_PAGE_CUSTOMFUNCTION_PRE psInstFilesPre
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW psInstFilesShow
  !macroend

  ; 완료 화면: electron-builder 기본 완료 화면(템플릿 assistedInstaller.nsh와 같은 «실행하기» 상자)에 왼쪽 그림 바꾸기만 더한다.
  !macro customFinishPage
    !ifndef HIDE_RUN_AFTER_FINISH
      Function StartApp
        ${if} ${isUpdated}
          StrCpy $1 "--updated"
        ${else}
          StrCpy $1 ""
        ${endif}
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
      FunctionEnd

      !define MUI_FINISHPAGE_RUN
      !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !endif
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW psFinishShow
    !insertmacro MUI_PAGE_FINISH
  !macroend
!else
  Var psBar
  Var psBarOn
  Var psLo
  Var psSpan
  Var psLast
  Var psFrom
  Var psTo
  Var psTotal
  Var psDone
  Var psHadDesk
  Var psHadMenu

  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.psGuiInit
  ; 제거기 첫 화면: 왼쪽 극장 그림(SHOW) · «다음»을 누르면 켜진 앱 확인(LEAVE — «취소»면 이 화면에 남는다)
  !macro customUnWelcomePage
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.psWelcomeShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.psWelcomeLeave
    !insertmacro MUI_UNPAGE_WELCOME
    ; 다음 화면 = 템플릿 제거 범위 화면(두 범위가 함께 깔렸을 때만 뜸) — 안내 줄 간격
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.psModeShow
  !macroend
  ; 제거기 완료 화면 왼쪽 그림 — 템플릿이 이 자리 바로 뒤에 완료 화면(MUI_UNPAGE_FINISH)을 넣는다
  !macro customUninstallPage
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.psUnFinishShow
  !macroend
!endif

!ifndef BUILD_UNINSTALLER
  ; 진행 화면이 열릴 때(설치 단계 시작 전, 화면 스레드): 막대를 가리고, 지울 예전 판이 있으면 템플릿의 «예전 판 조용히 지우기»(uninstallOldVersion)가 비켜 가게
  ; 그 판의 제거 명령 값을 다른 이름(psUninstallString)으로, «바로가기 그대로 두기» 값을 psKeepShortcuts로 옮겨 둔다 — 지우기는 설치 첫 단계에서 이 파일이 줄을 적으며 한다.
  ; (KeepShortcuts가 남아 있으면 템플릿이 새 바로가기를 만들지 않는다.) 템플릿은 «모든 사용자»면 HKLM · HKCU, «나만»이면 HKCU만 본다.
  !macro psStash ROOT
    ReadRegStr $R0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${If} $R0 != ""
      WriteRegStr ${ROOT} "${UNINSTALL_REGISTRY_KEY}" psUninstallString $R0
      DeleteRegValue ${ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${EndIf}
    ReadRegStr $R0 ${ROOT} "${INSTALL_REGISTRY_KEY}" KeepShortcuts
    ${If} $R0 != ""
      WriteRegStr ${ROOT} "${INSTALL_REGISTRY_KEY}" psKeepShortcuts $R0
      DeleteRegValue ${ROOT} "${INSTALL_REGISTRY_KEY}" KeepShortcuts
    ${EndIf}
  !macroend
  !macro psUnstash ROOT
    ReadRegStr $R0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" psUninstallString
    ${If} $R0 != ""
      WriteRegStr ${ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString $R0
      DeleteRegValue ${ROOT} "${UNINSTALL_REGISTRY_KEY}" psUninstallString
    ${EndIf}
    ReadRegStr $R0 ${ROOT} "${INSTALL_REGISTRY_KEY}" psKeepShortcuts
    ${If} $R0 != ""
      WriteRegStr ${ROOT} "${INSTALL_REGISTRY_KEY}" KeepShortcuts $R0
      DeleteRegValue ${ROOT} "${INSTALL_REGISTRY_KEY}" psKeepShortcuts
    ${EndIf}
  !macroend

  ; 설치 단계 맨 앞(일반 권한 설치기는 customCheckAppRunning, 관리자 권한으로 다시 뜬 «모든 사용자» 설치기는 customUnInstallCheck가 처음이다):
  ; 막대 ID를 맞바꾸고(③) 설치 위치를 적는다
  !macro psInstallStart
    ${If} $psStarted != "1"
      StrCpy $psStarted "1"
      ${If} $psBarOn == "1"
        FindWindow $R0 "#32770" "" $HWNDPARENT
        GetDlgItem $R1 $R0 1004
        System::Call "user32::SetWindowLongW(p $R1, i -12, i 1999)"
        System::Call "user32::SetWindowLongW(p $psBar, i -12, i 1004)"
      ${EndIf}
      !insertmacro psLine "설치 위치" "$INSTDIR"
    ${EndIf}
  !macroend

  ; 예전 판 한 범위(ROOT · CONTEXT) 지우기 — 이 설치기가 그 범위를 쓸 수 있을 때(«나만»은 늘, «모든 사용자»는 관리자 권한일 때).
  ;   파일을 하나씩 지우며 «삭제: …»(psDeleteDir) → 바로가기 · 시작 메뉴 · 등록(예전 제거기가 지우는 것과 같은 것) → 비게 된 위 폴더.
  ;   예전 제거기는 부르지 않는다 — 조용히 돌아 줄을 남기지 못하고, 켜진 앱 찾기(PowerShell)로 4초쯤 막대가 멈췄다. 앱 데이터(%APPDATA%\Poster Studio)는 둔다.
  ;   위치는 등록된 InstallLocation이고, 그 폴더에 «Poster Studio.exe»나 제거기가 있고 이름이 «Poster Studio»일 때만 파일을 지운다(엉뚱한 폴더를 지우지 않게).
  !macro psRemoveScope ROOT CONTEXT
    ReadRegStr $R5 ${ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${GetFileName} "$R5" $R6
    ${If} $R6 == "${APP_FILENAME}"
    ${AndIf} $R5 != ""
      ${If} ${FileExists} "$R5\${APP_EXECUTABLE_FILENAME}"
      ${OrIf} ${FileExists} "$R5\${UNINSTALL_FILENAME}"
        Push $R5
        Call psDeleteDir
        RMDir $R5
        ${GetParent} "$R5" $R6
        RMDir $R6
      ${EndIf}
    ${EndIf}
    SetShellVarContext ${CONTEXT}
    ReadRegStr $R6 ${ROOT} "${INSTALL_REGISTRY_KEY}" ShortcutName
    ${If} $R6 == ""
      StrCpy $R6 "${PRODUCT_FILENAME}"
    ${EndIf}
    ReadRegStr $R7 ${ROOT} "${INSTALL_REGISTRY_KEY}" MenuDirectory
    ${If} ${FileExists} "$DESKTOP\$R6.lnk"
      Delete "$DESKTOP\$R6.lnk"
      !insertmacro psLine "삭제" "$DESKTOP\$R6.lnk"
    ${EndIf}
    ${If} $R7 != ""
      ${If} ${FileExists} "$SMPROGRAMS\$R7\$R6.lnk"
        Delete "$SMPROGRAMS\$R7\$R6.lnk"
        !insertmacro psLine "삭제" "$SMPROGRAMS\$R7\$R6.lnk"
      ${EndIf}
      ${If} ${FileExists} "$SMPROGRAMS\$R7\Uninstall ${PRODUCT_NAME}.lnk"
        Delete "$SMPROGRAMS\$R7\Uninstall ${PRODUCT_NAME}.lnk"
        !insertmacro psLine "삭제" "$SMPROGRAMS\$R7\Uninstall ${PRODUCT_NAME}.lnk"
      ${EndIf}
      RMDir "$SMPROGRAMS\$R7"
    ${ElseIf} ${FileExists} "$SMPROGRAMS\$R6.lnk"
      Delete "$SMPROGRAMS\$R6.lnk"
      !insertmacro psLine "삭제" "$SMPROGRAMS\$R6.lnk"
    ${EndIf}
    DeleteRegKey ${ROOT} "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey ${ROOT} "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    DeleteRegKey ${ROOT} "${INSTALL_REGISTRY_KEY}"
  !macroend

!endif

; 언어 문구가 다 정해진 뒤(설치기 본문의 MUI_LANGUAGE 다음) 고친 문구를 같은 이름으로 다시 정하고, 이 파일의 함수 몸을 둔다 — 함수가 쓰는 템플릿 변수 · 플러그인 경로가
; 이 자리에서는 다 정해져 있다(이 파일 맨 앞에서 정의하면 «no branding image found» · StdUtils를 못 찾아 빌드가 멈췄다 — 10/27).
; 같은 이름을 두 번 정하면 NSIS가 «자리 낭비» 경고(6030)를 내고 electron-builder는 경고를 오류로 다룬다(-WX) — 이 몇 줄에서만 그 경고를 끈다.
; «설치 범위» 아래 안내는 설치기가 «$(…Exists)(경로)$\r$\n$(reinstallUpgrade)»로 잇는다 — 앞 문장 끝에 줄바꿈을 넣어 경로가 제 줄에 오게 한다.
!macro customHeader
  !pragma warning push
  !pragma warning disable 6030
  ; 10/28 오후 팀장: 설치 범위 화면은 쉬운 말로 줄인다(결정 2번) · 제거 쪽 번역투 · 모든 화면 머리글 · 안내문을 다시 훑어 «~하십시오 · ~하였습니다 · ~주시기 바랍니다 · ~됨»을 없앤다.
  ; 범위 이름은 설명서와 같이 «나만» · «모든 사용자»다. 바꾼 문구 목록은 _docs/CHANGELOG.md 10/28 오후 절.
  !ifndef BUILD_UNINSTALLER
    ShowInstDetails show
    LangString MUI_TEXT_DIRECTORY_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치할 폴더를 골라 주세요."
    LangString MUI_TEXT_INSTALLING_TITLE ${LANG_KOREAN} "설치 중"
    LangString MUI_TEXT_INSTALLING_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치하는 동안 잠시 기다려 주세요."
    LangString MUI_TEXT_FINISH_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치했습니다."
    LangString MUI_TEXT_ABORT_SUBTITLE ${LANG_KOREAN} "설치를 마치지 못했습니다."
    LangString MUI_TEXT_FINISH_INFO_TEXT ${LANG_KOREAN} "${PRODUCT_NAME}를 설치했습니다.$\r$\n$\r$\n마치려면 '마침' 단추를 눌러 주세요."
    LangString installing ${LANG_KOREAN} "설치하는 중입니다. 잠시 기다려 주세요."
    ; 설치 범위 화면 — 아래 안내는 고른 단추마다 템플릿이 바꾼다(관리자 권한으로 켠 설치기에서는 허락 창 줄을 뺀다 — psModeNote)
    LangString selectUserMode ${LANG_KOREAN} "이 컴퓨터에서 누가 ${PRODUCT_NAME}를 쓸지 골라 주세요."
    LangString forAll ${LANG_KOREAN} "모든 사용자 (이 컴퓨터를 쓰는 모든 사람)"
    LangString onlyForMe ${LANG_KOREAN} "나만"
    LangString freshInstallForAll ${LANG_KOREAN} "모든 사용자가 쓸 수 있게 설치합니다.$\r$\n'다음' 단추를 누르면 관리자 허락을 묻는 창이 뜹니다."
    LangString psFreshForAllAdmin ${LANG_KOREAN} "모든 사용자가 쓸 수 있게 설치합니다."
    LangString freshInstallForCurrent ${LANG_KOREAN} "나만 쓸 수 있게 설치합니다."
    LangString perUserInstallExists ${LANG_KOREAN} "이미 '나만'으로 설치되어 있습니다.$\r$\n"
    LangString perMachineInstallExists ${LANG_KOREAN} "이미 '모든 사용자'로 설치되어 있습니다.$\r$\n"
    LangString reinstallUpgrade ${LANG_KOREAN} "다시 설치합니다."
  !else
    ShowUninstDetails show
    ; 제거 첫 화면 — 번역투(«당신의 컴퓨터에서 … 제거할 것입니다», «종료하여 주시기 바랍니다»)를 쉬운 문장으로(10/28 Bumm님, 팀장 예시 문구)
    LangString MUI_UNTEXT_WELCOME_INFO_TEXT ${LANG_KOREAN} "이 컴퓨터에서 ${PRODUCT_NAME}를 지웁니다.$\r$\n$\r$\n${PRODUCT_NAME}가 켜져 있으면 먼저 꺼 주세요.$\r$\n$\r$\n계속하려면 '다음' 단추를 눌러 주세요."
    LangString MUI_UNTEXT_UNINSTALLING_TITLE ${LANG_KOREAN} "제거 중"
    LangString MUI_UNTEXT_UNINSTALLING_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 제거하는 동안 잠시 기다려 주세요."
    ; 진행 화면이 끝났을 때 머리 — 기본 «제거 마침 / 프로그램을 성공적으로 제거하였습니다.»(설치 쪽 «설치 완료»와 완료 화면 «… 제거 완료»에 맞춘다)
    LangString MUI_UNTEXT_FINISH_TITLE ${LANG_KOREAN} "제거 완료"
    LangString MUI_UNTEXT_FINISH_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 지웠습니다."
    LangString MUI_UNTEXT_ABORT_TITLE ${LANG_KOREAN} "제거 취소"
    LangString MUI_UNTEXT_ABORT_SUBTITLE ${LANG_KOREAN} "제거를 마치지 못했습니다."
    ; 제거 완료 화면 — 기본 문구는 «완료 되었습니다»(띄어쓰기) · 제거기인데 «설치 프로그램을 마치려면»이었다
    LangString MUI_UNTEXT_FINISH_INFO_TEXT ${LANG_KOREAN} "${PRODUCT_NAME}를 지웠습니다.$\r$\n$\r$\n마치려면 '마침' 단추를 눌러 주세요."
    ; 제거 범위 화면(두 범위가 함께 깔렸을 때만 뜸) — 기본 번역의 «\n»은 줄바꿈이 아니라 글자 그대로 찍혔다
    LangString whichInstallationShouldBeRemoved ${LANG_KOREAN} "어느 쪽을 지울까요?"
    LangString whichInstallationRemove ${LANG_KOREAN} "${PRODUCT_NAME}가 '모든 사용자'와 '나만'으로 함께 설치되어 있습니다.$\r$\n지울 쪽을 골라 주세요."
    LangString forAll ${LANG_KOREAN} "모든 사용자 (이 컴퓨터를 쓰는 모든 사람)"
    LangString onlyForMe ${LANG_KOREAN} "나만"
    LangString perUserInstall ${LANG_KOREAN} "'나만'으로 설치되어 있습니다.$\r$\n"
    LangString perMachineInstall ${LANG_KOREAN} "'모든 사용자'로 설치되어 있습니다.$\r$\n"
    LangString uninstall ${LANG_KOREAN} "이 설치를 지웁니다."
  !endif
  ; 실패할 때만 뜨는 알림 — 템플릿 한국어가 없거나(영어로 떴다) 번역투였다
  LangString loginWithAdminAccount ${LANG_KOREAN} "관리자 계정으로 허락해야 계속할 수 있습니다."
  LangString appRunning ${LANG_KOREAN} "${PRODUCT_NAME}가 켜져 있습니다.$\r$\n'확인'을 누르면 끕니다."
  LangString appCannotBeClosed ${LANG_KOREAN} "${PRODUCT_NAME}를 끄지 못했습니다.$\r$\n${PRODUCT_NAME}를 직접 끈 뒤 '다시 시도'를 눌러 주세요."
  LangString appClosing ${LANG_KOREAN} "${PRODUCT_NAME}를 끄는 중입니다."
  LangString uninstallFailed ${LANG_KOREAN} "예전 ${PRODUCT_NAME} 파일을 지우지 못했습니다. 설치기를 다시 실행해 주세요. 오류 번호"
  LangString decompressionFailed ${LANG_KOREAN} "파일을 풀지 못했습니다. 설치기를 다시 실행해 주세요."
  !pragma warning pop

  ; ── 여러 줄 안내의 줄 간격(10/28 오후 팀장 — «윗줄과 아랫줄 글자가 거의 맞닿아 겹쳐 보인다») ──
  ; 글 칸(STATIC) 하나 안의 줄은 사이를 띄울 수 없다 — 굴림 9pt는 줄 높이가 글자 높이와 같아(100%에서 12px) 줄이 붙어 보였다.
  ; 그래서 칸의 글을 줄(«\r\n»)마다 따로 된 칸으로 나눠 줄 사이를 글자 높이의 0.6배 띄운다(줄 간격 160%). 줄 칸은 원래 칸과 같은 부모 · 글꼴 · 왼쪽 · 폭이고
  ; 원래 칸은 숨긴다(글은 그대로 두어 템플릿이 바꾸면 다시 부른다). 한 줄이 폭보다 길면 그 칸 안에서 꺾고 그만큼 높인다(DrawText로 잰 높이).
  ; 스택: 칸 HWND → 줄 칸 ID 바탕(줄 칸 ID = 바탕 + 0~3, 이미 있으면 다시 쓴다). 줄은 넷까지.
  ; 띄운 줄 전체가 부모(화면 칸) 아래를 넘으면 넘는 만큼 위에서 시작한다 — 설치 범위 아래 안내 «이미 '나만'으로 설치되어 있습니다. / (폴더) / 다시 설치합니다.»
  ; 세 줄이 화면 밑(브랜드 줄)에 잘렸다(10/28 녹화). 그 칸은 단추(아래 끝 70u)보다 한참 아래(110u)라 올려도 단추에 닿지 않는다. 다른 칸(화면 맨 위 안내)은 넘지 않는다.
  Var psSpGap
  Var psSpN
  Var psSpI
  Var psSpLen
  Var psSpLine
  Var psSpH
  Var psSpTotal
  Var psSpText
  ; $R8의 첫 줄을 $psSpLine에, 나머지를 $R8에 둔다(줄 끝 «\r\n»). $0을 쓴다.
  Function ${PSF}psSpNext
    StrLen $psSpLen $R8
    StrCpy $psSpI 0
    StrCpy $psSpLine $R8
    ${DoWhile} $psSpI < $psSpLen
      StrCpy $0 $R8 2 $psSpI
      ${If} $0 == "$\r$\n"
        StrCpy $psSpLine $R8 $psSpI
        IntOp $psSpI $psSpI + 2
        ${Break}
      ${EndIf}
      IntOp $psSpI $psSpI + 1
    ${Loop}
    StrCpy $R8 $R8 "" $psSpI
  FunctionEnd
  Function ${PSF}psSpread
    Exch $R0
    Exch
    Exch $R1
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    Push $R7
    Push $R8
    Push $R9
    Push $0
    System::Call "user32::GetParent(p R1) p.R2"
    System::Call "*(i 0, i 0, i 0, i 0) p.R3"
    System::Call "user32::GetWindowRect(p R1, p R3)"
    System::Call "user32::MapWindowPoints(p 0, p R2, p R3, i 2)"
    System::Call "*$R3(i .R4, i .R5, i .R6, i)"
    IntOp $R6 $R6 - $R4
    SendMessage $R1 ${WM_GETFONT} 0 0 $R7
    System::Call "user32::GetWindowTextW(p R1, w .R8, i ${NSIS_MAX_STRLEN})"
    ShowWindow $R1 ${SW_HIDE}
    System::Call "user32::GetDC(p R2) p.R9"
    System::Call "gdi32::SelectObject(p R9, p R7) p.s"
    ; 글자 높이(한 줄) → 줄 사이
    System::Call "*$R3(i 0, i 0, i R6, i 0)"
    Push "가"
    System::Call "user32::DrawTextW(p R9, w s, i -1, p R3, i 0x0C00) i.r0"
    IntOp $psSpGap $0 * 6
    IntOp $psSpGap $psSpGap / 10
    ; 띄운 줄 전체 높이 → 부모 아래를 넘으면 그만큼 위에서 시작
    StrCpy $psSpText $R8
    StrCpy $psSpN 0
    StrCpy $psSpTotal 0
    ${Do}
      Call ${PSF}psSpNext
      ${If} $psSpLine != ""
        System::Call "*$R3(i 0, i 0, i R6, i 0)"
        Push $psSpLine
        System::Call "user32::DrawTextW(p R9, w s, i -1, p R3, i 0x0C10) i.r0"
        ${If} $psSpN > 0
          IntOp $psSpTotal $psSpTotal + $psSpGap
        ${EndIf}
        IntOp $psSpTotal $psSpTotal + $0
        IntOp $psSpN $psSpN + 1
      ${EndIf}
      ${If} $psSpN >= 4
        ${Break}
      ${EndIf}
    ${LoopUntil} $R8 == ""
    System::Call "user32::GetClientRect(p R2, p R3)"
    System::Call "*$R3(i, i, i, i .r0)"
    IntOp $0 $0 - $psSpTotal
    ${If} $R5 > $0
      StrCpy $R5 $0
    ${EndIf}
    StrCpy $R8 $psSpText
    StrCpy $psSpN 0
    ${Do}
      ; 다음 줄을 떼어 낸다
      Call ${PSF}psSpNext
      ${If} $psSpLine != ""
        ; 이 줄 높이(폭 안에서 꺾이면 그만큼)
        System::Call "*$R3(i 0, i 0, i R6, i 0)"
        Push $psSpLine
        System::Call "user32::DrawTextW(p R9, w s, i -1, p R3, i 0x0C10) i.r0"
        StrCpy $psSpH $0
        IntOp $0 $R0 + $psSpN
        GetDlgItem $0 $R2 $0
        ${If} $0 = 0
          IntOp $0 $R0 + $psSpN
          Push $psSpLine
          System::Call "user32::CreateWindowExW(i 0, w 'STATIC', w s, i 0x50000080, i $R4, i $R5, i $R6, i $psSpH, p $R2, p $0, p 0, p 0) p.r0"
          SendMessage $0 ${WM_SETFONT} $R7 1
        ${Else}
          SendMessage $0 ${WM_SETTEXT} 0 "STR:$psSpLine"
          System::Call "user32::SetWindowPos(p r0, p 0, i $R4, i $R5, i $R6, i $psSpH, i 0x0054)"   ; NOZORDER | NOACTIVATE | SHOWWINDOW
        ${EndIf}
        IntOp $R5 $R5 + $psSpH
        IntOp $R5 $R5 + $psSpGap
        IntOp $psSpN $psSpN + 1
      ${EndIf}
      ${If} $psSpN >= 4
        ${Break}
      ${EndIf}
    ${LoopUntil} $R8 == ""
    ; 앞서 쓰다 남은 줄 칸은 숨긴다(글이 줄었을 때)
    ${DoWhile} $psSpN < 4
      IntOp $0 $R0 + $psSpN
      GetDlgItem $0 $R2 $0
      ${If} $0 <> 0
        ShowWindow $0 ${SW_HIDE}
      ${EndIf}
      IntOp $psSpN $psSpN + 1
    ${Loop}
    System::Call "gdi32::SelectObject(p R9, p s)"
    System::Call "user32::ReleaseDC(p R2, p R9)"
    System::Free $R3
    Pop $0
    Pop $R9
    Pop $R8
    Pop $R7
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 설치 · 제거 범위 화면(템플릿)을 띄우기 직전: 위 · 아래 안내 줄 간격. 아래 안내는 단추를 고를 때마다 템플릿(InstModeChange)이 바꾸므로
  ; 그 자리에 이 파일의 함수를 걸어 템플릿 함수를 부른 뒤 다시 나눈다(템플릿과 같은 조건 — 두 단추를 다 고를 수 있을 때만).
  Function ${PSF}psModeShow
    Push $MultiUser.InstallModePage.Text
    Push 2110
    Call ${PSF}psSpread
    Call ${PSF}psModeNote
    ${If} $HasTwoAvailableOptions == "1"
      ${NSD_OnClick} $MultiUser.InstallModePage.CurrentUser ${PSF}psModeClick
      ${NSD_OnClick} $MultiUser.InstallModePage.AllUsers ${PSF}psModeClick
    ${EndIf}
  FunctionEnd
  Function ${PSF}psModeClick
    Call ${PSF}InstModeChange   ; 스택의 단추를 템플릿이 꺼내 아래 안내 글을 바꾼다
    Call ${PSF}psModeNote
  FunctionEnd
  Function ${PSF}psModeNote
    !ifndef BUILD_UNINSTALLER
      ; 이미 관리자 권한인 설치기는 «모든 사용자»를 골라도 허락 창이 뜨지 않는다 — 그 줄을 뺀다(화면에 쓴 것은 일어나야 한다)
      ${If} ${UAC_IsAdmin}
        Push $R0
        System::Call "user32::GetWindowTextW(p $RadioButtonLabel1, w .R0, i ${NSIS_MAX_STRLEN})"
        ${If} $R0 == "$(freshInstallForAll)"
          SendMessage $RadioButtonLabel1 ${WM_SETTEXT} 0 "STR:$(psFreshForAllAdmin)"
        ${EndIf}
        Pop $R0
      ${EndIf}
    !endif
    Push $RadioButtonLabel1
    Push 2120
    Call ${PSF}psSpread
  FunctionEnd

  ; ── 막대 · 줄 ──
  Function ${PSF}psAt
    Exch $R0
    Push $R1
    ${If} $psBarOn == "1"
    ${AndIf} $R0 > $psLast
      StrCpy $psLast $R0
      IntOp $R1 $R0 * $psSpan
      IntOp $R1 $R1 / 1000
      IntOp $R1 $R1 + $psLo
      SendMessage $psBar 0x402 $R1 0   ; PBM_SETPOS
    ${EndIf}
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 원래 막대(진행 화면 1004) 자리에 새 막대를 옮겨 가리고 원래 막대를 숨긴다. $psExtractFrom(‰)부터 800‰까지가 Nsis7z의 0~30000이 되도록 범위를 잡는다
  ; (제거기는 풀기가 없어 0~1000‰ = 0~30000).
  Function ${PSF}psBarCover
    ${If} $psBar == ""
    ${OrIf} $psBarOn == "1"
      Return
    ${EndIf}
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    FindWindow $R0 "#32770" "" $HWNDPARENT
    GetDlgItem $R1 $R0 1004
    System::Call "*(i,i,i,i) p.R2"
    System::Call "user32::GetWindowRect(p $R1, p $R2)"
    System::Call "user32::MapWindowPoints(p 0, p $R0, p $R2, i 2)"
    System::Call "*$R2(i .R3, i .R4, i .R5, i .R6)"
    System::Free $R2
    IntOp $R5 $R5 - $R3
    IntOp $R6 $R6 - $R4
    !ifndef BUILD_UNINSTALLER
      IntOp $R2 800 - $psExtractFrom
      IntOp $psSpan 30000000 / $R2
      IntOp $psLo $psExtractFrom * $psSpan
      IntOp $psLo $psLo / 1000
      IntOp $psLo 0 - $psLo
    !else
      StrCpy $psSpan 30000
      StrCpy $psLo 0
    !endif
    IntOp $R2 $psLo + $psSpan
    SendMessage $psBar 0x406 $psLo $R2   ; PBM_SETRANGE32
    SendMessage $psBar 0x402 $psLo 0
    System::Call "user32::SetParent(p $psBar, p $R0)"
    System::Call "user32::SetWindowPos(p $psBar, p 0, i $R3, i $R4, i $R5, i $R6, i 0x40)"
    ShowWindow $R1 0
    StrCpy $psLast 0
    StrCpy $psBarOn "1"
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 폴더 안 파일 수(하위 폴더까지) → $psTotal에 더한다
  Function ${PSF}psCountDir
    Exch $R0
    Push $R1
    Push $R2
    ClearErrors
    FindFirst $R1 $R2 "$R0\*.*"
    ${DoWhile} $R2 != ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        ${If} ${FileExists} "$R0\$R2\*.*"
          Push "$R0\$R2"
          Call ${PSF}psCountDir
        ${Else}
          IntOp $psTotal $psTotal + 1
        ${EndIf}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; 하나 했을 때 막대: $psFrom ~ $psTo(‰)를 $psTotal개로 나눈 자리
  Function ${PSF}psStep
    Push $R0
    IntOp $psDone $psDone + 1
    IntOp $R0 $psTo - $psFrom
    IntOp $R0 $R0 * $psDone
    ${If} $psTotal > 0
      IntOp $R0 $R0 / $psTotal
    ${EndIf}
    IntOp $R0 $R0 + $psFrom
    !insertmacro psAt $R0
    ${IfNot} ${Silent}
      Sleep ${PS_PACE}
    ${EndIf}
    Pop $R0
  FunctionEnd

  ; 상자 한 줄이 칸보다 길면 경로 가운데를 «...»로 줄여 파일 이름이 끝까지 보이게 한다 — PathCompactPathW가 상자 글꼴로 실제 폭을 잰다.
  ; «나만» 위치(C:\Users\<이름>\AppData\Local\Programs\…)는 줄마다 «…\Poster Stu…»에서 잘려 어느 파일인지 안 보였다(10/28 녹화). «모든 사용자» 위치는 거의 그대로 들어간다.
  ; 스택에 경로 → 머리말 순으로 넣고 부르면 맨 위에 적을 줄이 남는다. 상자가 없으면(조용한 실행) 그대로 붙인다.
  Function ${PSF}psFit
    Exch $R0
    Exch
    Exch $R1
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    Push $R6
    Push $R7
    Push $R8
    StrCpy $R8 "$R0$R1"
    StrCpy $R2 0
    ${If} $HWNDPARENT <> 0   ; 조용한 실행(창 없음)에서는 맨 위 창을 뒤지지 않는다
      FindWindow $R2 "#32770" "" $HWNDPARENT
      GetDlgItem $R2 $R2 1016
    ${EndIf}
    ${If} $R2 <> 0
      SendMessage $R2 0x101D 0 0 $R3   ; LVM_GETCOLUMNWIDTH
      IntOp $R3 $R3 - ${PS_LIST_PAD}
      System::Call "user32::GetDC(p R2) p.R4"
      SendMessage $R2 0x31 0 0 $R5     ; WM_GETFONT
      System::Call "gdi32::SelectObject(p R4, p R5) p.R5"
      System::Call "*(i 0, i 0) p.R6"
      StrLen $R7 $R8
      System::Call "gdi32::GetTextExtentPoint32W(p R4, w R8, i R7, p R6)"
      System::Call "*$R6(i .R7)"
      ${If} $R7 > $R3
        StrLen $R7 $R0
        System::Call "gdi32::GetTextExtentPoint32W(p R4, w R0, i R7, p R6)"
        System::Call "*$R6(i .R7)"
        IntOp $R7 $R3 - $R7
        System::Call "shlwapi::PathCompactPathW(p R4, w R1 R1, i R7)"
        StrCpy $R8 "$R0$R1"
      ${EndIf}
      System::Free $R6
      System::Call "gdi32::SelectObject(p R4, p R5)"
      System::Call "user32::ReleaseDC(p R2, p R4)"
    ${EndIf}
    StrCpy $R0 $R8
    Pop $R8
    Pop $R7
    Pop $R6
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
  FunctionEnd

  ; 폴더 안 파일을 하나씩 지우며 «삭제: …»를 적는다(하위 폴더까지 — 빈 하위 폴더도 지운다). 못 지운 파일이 있으면 오류 표시를 남긴다.
  Function ${PSF}psDeleteDir
    Exch $R0
    Push $R1
    Push $R2
    FindFirst $R1 $R2 "$R0\*.*"
    ${DoWhile} $R2 != ""
      ${If} $R2 != "."
      ${AndIf} $R2 != ".."
        ${If} ${FileExists} "$R0\$R2\*.*"
          Push "$R0\$R2"
          Call ${PSF}psDeleteDir
          RMDir "$R0\$R2"
        ${Else}
          ClearErrors
          Delete "$R0\$R2"
          ; 못 지운 파일(사용 중 등)은 줄을 적지 않는다 — 남은 것은 뒤의 확인(등록 · 파일이 아직 있는가)이 잡는다
          ${IfNot} ${Errors}
            !insertmacro psLine "삭제" "$R0\$R2"
            Call ${PSF}psStep
          ${EndIf}
        ${EndIf}
      ${EndIf}
      FindNext $R1 $R2
    ${Loop}
    FindClose $R1
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; ── 켜진 앱 확인(설치 위치 화면 · 제거 첫 화면을 떠날 때, 진행 단계 맨 앞에서 한 번 더) ──
  ; 이름이 «Poster Studio.exe»인 프로그램이 켜져 있으면 «끄고 계속할까요?»를 묻는다. 확인 → 창을 닫게 하고 5초, 안 되면 끝내고 3초.
  ; 그래도 켜져 있으면(관리자 권한으로 켠 앱을 일반 권한 설치기가 못 끄는 경우 등) 알리고 다시 시도하게 한다. 결과 $R0: "ok" · "stay"(취소).
  Function ${PSF}psCloseApp
    nsProcess::_CloseProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R1
    ${For} $R2 1 50
      Sleep 100
      nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
      Pop $R1
      ${If} $R1 <> 0
        StrCpy $R1 0
        Return
      ${EndIf}
    ${Next}
    nsProcess::_KillProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R1
    ${For} $R2 1 30
      Sleep 100
      nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
      Pop $R1
      ${If} $R1 <> 0
        StrCpy $R1 0
        Return
      ${EndIf}
    ${Next}
    StrCpy $R1 1
  FunctionEnd
  Function ${PSF}psAppGate
    Push $R1
    Push $R2
    Push $R3
    StrCpy $R0 "ok"
    nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R1
    ${If} $R1 = 0
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME}가 켜져 있습니다.$\r$\n끄고 계속할까요?" /SD IDOK IDOK psGateClose
      StrCpy $R0 "stay"
      Goto psGateEnd
      psGateClose:
      StrCpy $R3 "again"
      ${DoWhile} $R3 == "again"
        Call ${PSF}psCloseApp
        ${If} $R1 = 0
          StrCpy $R3 "done"
        ${Else}
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME}를 끄지 못했습니다.$\r$\n${PRODUCT_NAME}를 직접 끈 뒤 '다시 시도'를 눌러 주세요." /SD IDCANCEL IDRETRY psGateRetry
          StrCpy $R0 "stay"
          StrCpy $R3 "done"
          psGateRetry:
        ${EndIf}
      ${Loop}
    ${EndIf}
    psGateEnd:
    Pop $R3
    Pop $R2
    Pop $R1
  FunctionEnd

  !ifndef BUILD_UNINSTALLER
    Function psGuiInit
      !insertmacro psHeaderArt
      !insertmacro psBarCreate
    FunctionEnd

    Function psFinishShow
      !insertmacro psSideArt $mui.FinishPage.Image $mui.FinishPage.Image.Bitmap
    FunctionEnd

    ; 위치 화면 — 업데이트(--updated)로 다시 깔 때는 건너뛴다(템플릿 skipPageIfUpdated와 같다)
    Function psDirPre
      ${if} ${isUpdated}
        Abort
      ${endif}
    FunctionEnd
    ; 위 안내 세 줄(칸 1006)의 줄 간격
    Function psDirShow
      Push $R0
      FindWindow $R0 "#32770" "" $HWNDPARENT
      GetDlgItem $R0 $R0 1006
      Push $R0
      Push 2101
      Call psSpread
      Pop $R0
    FunctionEnd

    ; 이미 깔린 판: «설치된 앱» 등록(제거 명령)이 있는 범위. 진행 화면이 잠시 옮겨 둔 값(psUninstallString)도 센다 — 설치기가 그 사이에 멈췄던 경우.
    Function psFindInstalls
      Push $R0
      StrCpy $psHasUser ""
      StrCpy $psHasAll ""
      ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ${If} $R0 == ""
        ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" psUninstallString
      ${EndIf}
      ${If} $R0 != ""
        StrCpy $psHasUser "1"
      ${EndIf}
      ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ${If} $R0 == ""
        ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" psUninstallString
      ${EndIf}
      ${If} $R0 != ""
        StrCpy $psHasAll "1"
      ${EndIf}
      Pop $R0
    FunctionEnd

    ; «설치»를 눌렀을 때: 이미 깔려 있으면 «지우고 새로 설치할까요?», 켜져 있으면 «끄고 계속할까요?» — «취소»면 이 화면에 남는다(Abort).
    ; 설치를 묻는 것을 먼저 한다 — 설치를 취소했는데 앱이 꺼지면 안 된다.
    Function psDirLeave
      Push $R0
      StrCpy $psRemoveOld ""
      Call psFindInstalls
      ${If} $psHasUser == "1"
      ${OrIf} $psHasAll == "1"
        MessageBox MB_OKCANCEL|MB_ICONQUESTION "${PRODUCT_NAME}가 이미 설치되어 있습니다.$\r$\n지우고 새로 설치할까요?" /SD IDOK IDOK psDirRemove
        Pop $R0
        Abort
        psDirRemove:
        StrCpy $psRemoveOld "1"
      ${EndIf}
      Call psAppGate
      ${If} $R0 == "stay"
        Pop $R0
        Abort
      ${EndIf}
      Pop $R0
    FunctionEnd

    ; 템플릿 instFilesPre와 같다 — 고른 위치에 «Poster Studio» 폴더가 없으면 붙인다(위치 화면 LEAVE에서는 $INSTDIR을 바꿔도 되돌아간다 — 템플릿 주석)
    Function psInstFilesPre
      ${StrContains} $0 "${APP_FILENAME}" $INSTDIR
      ${If} $0 == ""
        StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
      ${endIf}
    FunctionEnd

    Function psInstFilesShow
      Push $R0
      ${If} $psRemoveOld == "1"
        StrCpy $psExtractFrom 330
        !insertmacro psStash HKCU
        ${If} $installMode == "all"
          !insertmacro psStash HKLM
        ${EndIf}
      ${Else}
        StrCpy $psExtractFrom 40
      ${EndIf}
      Call psBarCover
      Pop $R0
    FunctionEnd



    ; «나만» 설치기가 «모든 사용자» 판을 지울 때 — 일반 권한으로는 Program Files · 공용 시작 메뉴 · HKLM을 못 지운다. 예전 제거기를 관리자 권한으로 부른다
    ; (다른 PC에서는 승인 창이 한 번 뜬다). 지운 파일 줄은 끝난 뒤에 적는다(미리 적어 둔 목록 가운데 없어진 것). 승인을 안 하면 그대로 남아 아래 확인이 잡는다.
    Function psRemoveAllElevated
      ReadRegStr $R5 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${GetFileName} "$R5" $R6
      ${If} $R6 != "${APP_FILENAME}"
      ${OrIf} $R5 == ""
        Return
      ${EndIf}
      ${IfNot} ${FileExists} "$R5\${UNINSTALL_FILENAME}"
        Return
      ${EndIf}
      FileOpen $R8 "$PLUGINSDIR\ps-old-all.txt" w
      Push $R5
      Call psWriteFileList
      FileClose $R8
      ; 예전 판의 제거기가 아니라 이 설치기에 든 새 제거기를 쓴다 — 10/28 이전 제거기는 켜진 앱을 PowerShell로 찾는다(템플릿 nsExec).
      ; 새 제거기는 nsProcess로 찾아 PowerShell을 띄우지 않는다. 앱 데이터는 제거기 기본대로 지운다
      ; (템플릿은 --updated가 아니면 지우고, /KEEP_APP_DATA는 읽지 않는다 — 예전 제거기를 부를 때와 같다).
      File "/oname=$PLUGINSDIR\ps-all-uninstaller.exe" "${UNINSTALLER_OUT_FILE}"
      ExecShellWait "runas" "$PLUGINSDIR\ps-all-uninstaller.exe" "/S /allusers _?=$R5" SW_HIDE
      FileOpen $R8 "$PLUGINSDIR\ps-old-all.txt" r
      ${Do}
        ClearErrors
        FileReadUTF16LE $R8 $R6
        ${If} ${Errors}
          ${ExitDo}
        ${EndIf}
        StrCpy $R6 $R6 -2   ; 줄 끝 \r\n
        ${IfNot} ${FileExists} "$R6"
          !insertmacro psLine "삭제" "$R6"
          Call psStep
        ${EndIf}
      ${Loop}
      FileClose $R8
    FunctionEnd
    ; 폴더 안 파일 경로를 $R8(열린 파일)에 한 줄씩 적는다
    Function psWriteFileList
      Exch $R0
      Push $R1
      Push $R2
      FindFirst $R1 $R2 "$R0\*.*"
      ${DoWhile} $R2 != ""
        ${If} $R2 != "."
        ${AndIf} $R2 != ".."
          ${If} ${FileExists} "$R0\$R2\*.*"
            Push "$R0\$R2"
            Call psWriteFileList
          ${Else}
            FileWriteUTF16LE $R8 "$R0\$R2$\r$\n"
          ${EndIf}
        ${EndIf}
        FindNext $R1 $R2
      ${Loop}
      FindClose $R1
      Pop $R2
      Pop $R1
      Pop $R0
    FunctionEnd

    ; 예전 판 지우기(설치 첫 단계) — 위치 화면에서 «지우고 새로 설치»를 고른 경우만. 0~300‰를 지운 파일 수로 나눠 막대를 옮긴다.
    ; 다 지운 뒤 예전 판 등록이 남아 있으면(파일을 못 지움 · 승인 거절) 옮겨 둔 값을 되돌리고 알린 뒤 설치를 멈춘다 — 예전 판은 «설치된 앱»에 남아 다시 지울 수 있다.
    Function psRemoveOldInstalls
      ${If} $psRemoveOld != "1"
        Return
      ${EndIf}
      Push $R0
      Push $R5
      Push $R6
      Push $R7
      Push $R8
      !insertmacro psStage "예전 ${PRODUCT_NAME}를 지우는 중입니다 …"
      Call psFindInstalls
      StrCpy $psTotal 0
      StrCpy $psDone 0
      StrCpy $psFrom 0
      StrCpy $psTo 300
      ${If} $psHasUser == "1"
        ReadRegStr $R5 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
        ${If} $R5 != ""
          Push $R5
          Call psCountDir
        ${EndIf}
      ${EndIf}
      ${If} $psHasAll == "1"
        ReadRegStr $R5 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
        ${If} $R5 != ""
          Push $R5
          Call psCountDir
        ${EndIf}
      ${EndIf}
      ${If} $psHasUser == "1"
        !insertmacro psRemoveScope HKCU current
      ${EndIf}
      ${If} $psHasAll == "1"
        ${If} ${UAC_IsAdmin}
          !insertmacro psRemoveScope HKLM all
        ${Else}
          Call psRemoveAllElevated
        ${EndIf}
      ${EndIf}
      ${If} $installMode == "all"
        SetShellVarContext all
      ${Else}
        SetShellVarContext current
      ${EndIf}
      !insertmacro psAt 300
      Call psFindInstalls
      ${If} $psHasUser == "1"
      ${OrIf} $psHasAll == "1"
        !insertmacro psUnstash HKCU
        ${If} ${UAC_IsAdmin}
          !insertmacro psUnstash HKLM
        ${EndIf}
        !insertmacro psStage "예전 ${PRODUCT_NAME}를 다 지우지 못했습니다."
        MessageBox MB_OK|MB_ICONEXCLAMATION "예전 ${PRODUCT_NAME}를 다 지우지 못했습니다.$\r$\n${PRODUCT_NAME}를 모두 끈 뒤 다시 설치해 주세요." /SD IDOK
        Pop $R8
        Pop $R7
        Pop $R6
        Pop $R5
        Pop $R0
        Abort
      ${EndIf}
      Pop $R8
      Pop $R7
      Pop $R6
      Pop $R5
      Pop $R0
    FunctionEnd

    ; 설치 폴더에 놓인 파일을 하나씩 확인하며 «설치: …»를 적는다(하위 폴더까지)
    Function psListDir
      Exch $R0
      Push $R1
      Push $R2
      FindFirst $R1 $R2 "$R0\*.*"
      ${DoWhile} $R2 != ""
        ${If} $R2 != "."
        ${AndIf} $R2 != ".."
          ${If} ${FileExists} "$R0\$R2\*.*"
            Push "$R0\$R2"
            Call psListDir
          ${Else}
            !insertmacro psLine "설치" "$R0\$R2"
            Call psStep
          ${EndIf}
        ${EndIf}
        FindNext $R1 $R2
      ${Loop}
      FindClose $R1
      Pop $R2
      Pop $R1
      Pop $R0
    FunctionEnd
  !else
    Function un.psGuiInit
      !insertmacro psHeaderArt
      !insertmacro psBarCreate
    FunctionEnd

    Function un.psWelcomeShow
      !insertmacro psSideArt $mui.WelcomePage.Image $mui.WelcomePage.Image.Bitmap
    FunctionEnd

    Function un.psWelcomeLeave
      Push $R0
      Call un.psAppGate
      ${If} $R0 == "stay"
        Pop $R0
        Abort
      ${EndIf}
      Pop $R0
    FunctionEnd

    Function un.psUnFinishShow
      !insertmacro psSideArt $mui.FinishPage.Image $mui.FinishPage.Image.Bitmap
    FunctionEnd
  !endif
!macroend

; ── 진행 단계에 끼우는 자리(템플릿이 열어 둔 매크로) ──
; 앱 확인은 위치 화면 · 제거 첫 화면에서 이미 했다. 여기서는 그 사이에 다시 켰을 때만 묻는다(nsProcess — 예전처럼 PowerShell로 4초 기다리지 않는다).
; 이 단계에서는 앞 화면으로 돌아갈 수 없어 «취소»면 설치 · 제거를 멈춘다(아무것도 바꾸기 전이다). 템플릿이 쓰던 getProcessInfo · $pid는 이제 쓰지 않는다.
!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    ${IfNot} ${Silent}
      Call un.psBarCover
      !insertmacro psLine "제거 위치" "$INSTDIR"
    ${EndIf}
    Push $R0
    Call un.psAppGate
    ${If} $R0 == "stay"
      Pop $R0
      Abort
    ${EndIf}
    Pop $R0
  !else
    ${IfNot} ${Silent}
      !insertmacro psInstallStart
    ${EndIf}
    Push $R0
    Call psAppGate
    ${If} $R0 == "stay"
      Pop $R0
      Abort
    ${EndIf}
    Pop $R0
  !endif
!macroend

; 템플릿(installUtil.nsh handleUninstallResult) 뒤 — «예전 판 조용히 지우기»가 비켜 간 뒤라 여기가 예전 판을 지우는 첫 자리다(«모든 사용자»는 두 번 불린다 — 한 번만 한다)
!macro customUnInstallCheck
  ${If} ${Errors}
    !insertmacro psStage "이전에 설치한 판을 지우지 못해 그 위에 새로 설치합니다."
  ${ElseIf} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $psOldDone != "1"
    StrCpy $psOldDone "1"
    ${IfNot} ${Silent}
      !insertmacro psInstallStart
    ${EndIf}
    Call psRemoveOldInstalls
    !insertmacro psStage "프로그램 파일을 설치하는 중입니다 …"
    !insertmacro psAt $psExtractFrom
  ${EndIf}
!macroend

; 7z 풀기 · 설치 폴더로 옮기기가 끝난 뒤(템플릿 custom_files_post_decompression): Nsis7z가 막대를 800‰까지 옮겼다. 놓인 파일을 «설치: …»로 적으며 800 → 940‰.
!macro customFiles_x64
  StrCpy $psLast 799
  !insertmacro psAt 800
  StrCpy $psTotal 0
  StrCpy $psDone 0
  StrCpy $psFrom 800
  StrCpy $psTo 940
  Push $INSTDIR
  Call psCountDir
  Push $INSTDIR
  Call psListDir
!macroend

!ifndef BUILD_UNINSTALLER
  Var psUserDefaultWritten

  ; $LOCALAPPDATA는 셸 범위(SetShellVarContext)를 따른다 — 이 화면이 열릴 때는 기본값 «모든 사용자»라 C:\ProgramData를 가리켰다(10/27 실측:
  ; «나만» 설치가 C:\ProgramData\Programs에 깔렸다). 그래서 «현재 사용자»로 잠깐 바꿔 읽고, 지금 범위($installMode)로 되돌린다.
  !macro customInstallMode
    Push $0
    ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == ""
      SetShellVarContext current
      WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\${MENU_FILENAME}\${APP_FILENAME}"
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
      StrCpy $psUserDefaultWritten "1"
    ${EndIf}
    Pop $0
  !macroend

  Function .onGUIEnd
    ${If} $psUserDefaultWritten == "1"
      ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
      ${If} $0 == ""
        DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
        DeleteRegKey /ifempty HKCU "${INSTALL_REGISTRY_KEY}"
      ${EndIf}
    ${EndIf}
  FunctionEnd
!endif

; 등록 · 바로가기를 마친 뒤(템플릿의 마지막 자리): 제거기 줄 · 한 일 · «설치가 끝났습니다.» → 100%를 1초 보인 뒤 완료 화면
!macro customInstall
  !insertmacro psLine "설치" "$INSTDIR\${UNINSTALL_FILENAME}"
  CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
  ${If} $installMode == "all"
    DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    DeleteRegKey /ifempty HKCU "${INSTALL_REGISTRY_KEY}"
  ${EndIf}
  !insertmacro psAt 950
  !insertmacro psNote "바탕화면에 «${PRODUCT_NAME}» 바로가기를 만들었습니다."
  !insertmacro psAt 965
  !insertmacro psNote "시작 메뉴 «${MENU_FILENAME}»에 등록했습니다."
  !insertmacro psAt 980
  !insertmacro psNote "«설치된 앱» 목록에 «${PRODUCT_NAME}»를 등록했습니다."
  !insertmacro psAt 1000
  !insertmacro psStage "설치가 끝났습니다."
  ${IfNot} ${Silent}
    Sleep 1000
  ${EndIf}
!macroend

; 제거기는 처음부터 원래 기록(파일 삭제: …)을 끈다 — 앱이 켜져 있는지 보는 단계(un.checkAppRunning)도 이 뒤에 온다
!macro customUnInit
  SetDetailsPrint none
!macroend

!macro customUnInstall
  SetDetailsPrint none
  !insertmacro psStage "프로그램 파일을 지우는 중입니다 …"
  !insertmacro psAt 30
  ; 바로가기는 템플릿이 아래에서 지운다 — 있었던 것만 끝에 «삭제: …»로 적는다
  StrCpy $psHadDesk ""
  StrCpy $psHadMenu ""
  ${If} ${FileExists} "$oldDesktopLink"
    StrCpy $psHadDesk "1"
  ${EndIf}
  ${If} ${FileExists} "$oldStartMenuLink"
    StrCpy $psHadMenu "1"
  ${EndIf}
  ; electron-builder가 제 바로가기를 지우는 조건(--keep-shortcuts가 없을 때)과 맞춘다. 예전에는 업데이트(--updated)면 남겼는데,
  ; «모든 사용자» 설치가 «나만» 설치를 먼저 지울 때도 --updated로 부르므로 «나만» 시작 메뉴에 대상 없는 «Uninstall» 바로가기와 폴더가 남았다(10/28 실측).
  ; 같은 범위 업데이트는 새 판이 customInstall에서 다시 만든다.
  ${IfNot} ${isKeepShortcuts}
    ${If} ${FileExists} "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk"
      Delete "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk"
      !insertmacro psLine "삭제" "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend

; 제거기 파일 지우기(템플릿 customRemoveFiles 자리): 업데이트(--updated, 조용히)는 템플릿 그대로(통째로 옮겼다가 실패하면 되돌림),
; 사람이 지울 때는 파일을 하나씩 지우며 «삭제: …»(30 → 930‰) — 남은 빈 폴더는 마지막에 RMDir /r.
!macro customRemoveFiles
  ${if} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"
    Push ""
    Call un.atomicRMDir
    Pop $R0
    ${if} $R0 != 0
      DetailPrint "File is busy, aborting: $R0"
      Push ""
      Call un.restoreFiles
      Pop $R0
      Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
    ${endif}
    SetOutPath $TEMP
    RMDir /r $INSTDIR
  ${else}
    SetOutPath $TEMP
    StrCpy $psTotal 0
    StrCpy $psDone 0
    StrCpy $psFrom 30
    StrCpy $psTo 930
    Push $INSTDIR
    Call un.psCountDir
    Push $INSTDIR
    Call un.psDeleteDir
    RMDir /r $INSTDIR
  ${endif}
!macroend

; 템플릿이 바로가기를 지운 뒤(파일 연결 해제 자리 — 이 앱은 파일 연결이 없다): 지워진 바로가기 줄 · «제거가 끝났습니다.» → 100%를 1초 보인 뒤 완료 화면.
; 이 뒤에 템플릿이 앱 데이터 · 등록을 지운다(1초 안).
!macro unregisterFileAssociations
  ${If} $psHadDesk == "1"
  ${AndIfNot} ${FileExists} "$oldDesktopLink"
    !insertmacro psLine "삭제" "$oldDesktopLink"
  ${EndIf}
  ${If} $psHadMenu == "1"
  ${AndIfNot} ${FileExists} "$oldStartMenuLink"
    !insertmacro psLine "삭제" "$oldStartMenuLink"
  ${EndIf}
  ; 앱 데이터는 템플릿이 이 뒤에 RMDir /r 한 번으로 지운다 — 그 순간 막 끈 앱이 쓴 파일을 다른 프로그램(백신 검사 등)이 잡고 있으면 남는다
  ; (10/28 앱 켜짐 제거 8번 중 1번 %APPDATA%\Poster Studio가 남았다 · 다시 5번은 재현 안 됨). 템플릿과 같은 조건(--delete-app-data, 또는 업데이트가 아님)이면
  ; 여기서 먼저 지우고, 남으면 0.3초 간격으로 10번까지 다시 지운다. ${isUpdated}는 함수 안에서 못 쓰므로 이 매크로 안에 둔다.
  Push $R0
  Push $R1
  Push $R2
  StrCpy $R2 "0"
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${If} ${Errors}
    !ifdef DELETE_APP_DATA_ON_UNINSTALL
      ${IfNot} ${isUpdated}
        StrCpy $R2 "1"
      ${EndIf}
    !endif
  ${Else}
    StrCpy $R2 "1"
  ${EndIf}
  ${If} $R2 == "1"
    ${If} $installMode == "all"
      SetShellVarContext current   ; 앱 데이터는 늘 사람마다(템플릿과 같다)
    ${EndIf}
    ${For} $R1 1 10
      RMDir /r "$APPDATA\${APP_FILENAME}"
      ${IfNot} ${FileExists} "$APPDATA\${APP_FILENAME}\*.*"
        ${ExitFor}
      ${EndIf}
      Sleep 300
    ${Next}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
  Pop $R2
  Pop $R1
  Pop $R0
  !insertmacro psAt 1000
  !insertmacro psStage "제거가 끝났습니다."
  ${IfNot} ${Silent}
    Sleep 1000
  ${EndIf}
!macroend

; 제거가 끝난 뒤 설치 폴더 위 폴더(«InKY Film Festival»)가 비었으면 지운다. RMDir(/r 없음)는 빈 폴더만 지운다 — 다른 것이 있으면 그대로 둔다.
; 제거 단계(섹션)를 하나 더 만들면 electron-builder가 «구성 요소 선택» 화면을 넣어 제거 흐름이 바뀐다(10/27 실측) — 그래서 제거 성공 콜백에서 한다.
!ifdef BUILD_UNINSTALLER
  Function un.onUninstSuccess
    ; 업데이트(--updated) 중이어도 괜찮다 — 비어서 지워진 상위 폴더는 새 판을 풀 때 설치기가 다시 만든다.
    ; 업데이트 여부 검사(isUpdated)는 쓰지 않는다: 이 파일은 플러그인 경로가 잡히기 전에 컴파일돼 그 검사가 쓰는 StdUtils를 못 찾는다(10/27 빌드 실패).
    StrCpy $R0 "$INSTDIR"
    StrLen $R1 $R0
    ${Do}
      IntOp $R1 $R1 - 1
      ${If} $R1 < 1
        ${ExitDo}
      ${EndIf}
      StrCpy $R2 $R0 1 $R1
      ${If} $R2 == "\"
        StrCpy $R0 $R0 $R1
        RMDir $R0
        ${ExitDo}
      ${EndIf}
    ${Loop}
  FunctionEnd
!endif
