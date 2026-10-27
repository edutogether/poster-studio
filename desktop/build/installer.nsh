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

; 이 파일은 설치기 머리에 먼저 들어간다 — 아래 함수가 쓰는 ${If} 등(LogicLib)을 여기서 불러 둔다(이미 불렀으면 다시 읽지 않는다).
!include LogicLib.nsh
; 아래 .onGUIEnd가 쓰는 등록 키 이름 — electron-builder multiUser.nsh와 같은 정의(그쪽도 /ifndef라 한 값으로 맞는다). 그 파일은 이 파일보다 뒤에 들어온다.
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

; ── 설치 화면 그림: 칸 크기에 맞춘 판 고르기(10/27 Bumm님 «오른쪽 위 로고가 가로로 늘어나 깨져 보인다», 팀장 전달) ──
; 그림 칸 크기는 한글 Windows 글꼴과 화면 배율로 정해진다 — 100%에서 머리 로고 칸 175×53, 완료 화면 왼쪽 칸 191×290(desktop-installer-probe.ps1로 잼).
; electron-builder가 넣는 그림은 한 크기라 칸에 맞게 비율 없이 늘어났다(150×57 → 175×53: 가로 1.17배 · 세로 0.93배). make-assets.mjs가 배율
; 100~300%마다 칸 크기 그대로 그려 둔 판(build/installer-art) 가운데 칸의 실제 너비에 가장 가까운 것을 끼운다 — 칸과 몇 화소 다르면 그만큼만 맞춰 늘인다.
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
; 함수 몸은 MUI가 화면(머리 그림 칸 포함)을 정의한 뒤에 컴파일돼야 한다 — 이 파일은 설치기 맨 앞에 들어가 여기서 정의하면
; «no branding image found»로 빌드가 멈췄다(10/27). 그래서 이름만 여기서 정하고, 몸은 화면 정의 뒤에 끼는 자리
; (설치기 customFinishPage · 제거기 customUninstallPage)에서 정의한다.
!ifndef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_GUIINIT psGuiInit
!else
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.psGuiInit
  !macro customUninstallPage
    Function un.psGuiInit
      !insertmacro psHeaderArt
    FunctionEnd
  !macroend
!endif

; 완료 화면: electron-builder 기본 완료 화면(설치기 템플릿 assistedInstaller.nsh와 같은 «실행하기» 상자)에 왼쪽 그림 바꾸기만 더한다.
; 왼쪽 그림 칸은 화면이 만들어질 때 생기므로 그 화면을 띄우기 직전(SHOW)에 칸을 재서 판을 고른다. 그림 손잡이는 MUI가 화면을 떠날 때 푼다.
!ifndef BUILD_UNINSTALLER
  !macro customFinishPage
    Function psGuiInit
      !insertmacro psHeaderArt
    FunctionEnd

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

    Function psFinishShow
      Push $R7
      Push $R8
      Push $R9
      !insertmacro psClientWidth $mui.FinishPage.Image
      ${If} $R9 > 0
        !insertmacro psPickScale ${PS_FINISH_W}
        !insertmacro psExtractArt finish
        ${NSD_FreeImage} $mui.FinishPage.Image.Bitmap
        ${NSD_SetStretchedImage} $mui.FinishPage.Image "$PLUGINSDIR\ps-finish.bmp" $mui.FinishPage.Image.Bitmap
      ${EndIf}
      Pop $R9
      Pop $R8
      Pop $R7
    FunctionEnd
  !macroend
!endif

; ── 설치하는 동안 어디에 무엇을 까는지 보인다(10/27 Bumm님 «설치하는 동안 아무 글도 안 나온다», 팀장 전달) ──
; electron-builder는 설치 단계를 시작하며 진행 글을 끄고(SetDetailsPrint none) 앱 파일을 7z 하나로 통째 푼다. 진행 글을 다시 켜는 자리는 둘이다 —
; 둘 다 템플릿이 «여기 끼우면 기본 동작 대신 이것을 쓴다»고 열어 둔 공식 자리라, 기본 동작을 그대로 옮겨 적고 그 앞에 진행 글만 더한다.
;   ① customCheckAppRunning: 설치 단계 맨 앞(앱이 켜져 있는지 PowerShell로 찾는 데 4초쯤 걸린다 — 10/27 실측, 그동안 글이 비어 있었다).
;      «모든 사용자»는 관리자 권한으로 다시 뜬 설치기에서 이 단계를 건너뛴다(템플릿) — 그래서 ②에서도 켠다.
;   ② customUnInstallCheck: 예전 판 지우기 결과를 보는 곳 = 앱 파일을 풀기 직전. 템플릿(installUtil.nsh)과 같은 검사를 먼저 한다.
; 그 뒤 NSIS가 하는 일(대상 폴더 · 압축 해제 · 파일 복사 · 바로 가기 생성)은 NSIS가 스스로 한 줄씩 적는다.
!ifndef BUILD_UNINSTALLER
  Var psDetailsOn
  !macro psDetailsOn
    ${IfNot} ${Silent}
    ${AndIf} $psDetailsOn != "1"
      StrCpy $psDetailsOn "1"
      SetDetailsPrint both
      SetDetailsView show
      DetailPrint "설치 위치: $INSTDIR"
    ${EndIf}
  !macroend
  !macro customCheckAppRunning
    !insertmacro psDetailsOn
    DetailPrint "켜져 있는 ${PRODUCT_NAME}가 있는지 확인"
    !insertmacro IS_POWERSHELL_AVAILABLE
    !insertmacro _CHECK_APP_RUNNING
  !macroend
!endif
!macro customUnInstallCheck
  ${If} ${Errors}
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  ${ElseIf} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro psDetailsOn
  DetailPrint "앱 파일 풀기: ${APP_EXECUTABLE_FILENAME} · 화면 · 글꼴 · 그림 → $INSTDIR"
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

!macro customInstall
  CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
  ${If} $installMode == "all"
    DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    DeleteRegKey /ifempty HKCU "${INSTALL_REGISTRY_KEY}"
  ${EndIf}
  DetailPrint "«설치된 앱» 목록에 «${PRODUCT_NAME}» 등록"
  DetailPrint "설치를 마쳤습니다: $INSTDIR"
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$SMPROGRAMS\${MENU_FILENAME}\Uninstall ${PRODUCT_NAME}.lnk"
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
