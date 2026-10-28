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

; ── 화면 안내문: 문장마다 새 줄, 줄은 칸 안에, «(을)를» 같은 조사 표기 없이(10/28 Bumm님, 팀장 전달) ──
; NSIS · electron-builder 한국어 기본 문구는 여러 문장이 한 덩어리로 흘러 칸 끝에서 낱말 중간에 끊겼다(«설치를 시 / 작하시려면» — 한국어는 글자마다 줄이 바뀔 수 있다).
; 칸 글꼴은 굴림 9pt(-12px), 칸 폭은 100%에서 위치 안내 525px · 설치 범위 아래 안내 490px · 머리 설명 368px · 제거 시작 안내 341px다(desktop-installer-probe.ps1로 잼).
; 칸보다 긴 한 문장은 문구를 그대로 두고 낱말 사이에서 줄을 나눈다. 고친 문구는 아래 customHeader에 모았다.
; 위치 화면 안내만 MUI 설정으로 바꾼다 — 그 화면(MUI_PAGE_DIRECTORY)보다 먼저 정해야 해서 여기 둔다. $_CLICK = «설치를 시작하시려면 '설치' 버튼을 눌러 주세요.»
!ifndef BUILD_UNINSTALLER
  !define MUI_DIRECTORYPAGE_TEXT_TOP "${PRODUCT_NAME}를 다음 폴더에 설치할 예정입니다.$\r$\n다른 폴더에 설치하고 싶으시면 '찾아보기' 버튼을 눌러서 다른 폴더를 선택해 주세요.$\r$\n$_CLICK"
!endif
; 나머지는 언어 문구가 다 정해진 뒤(customHeader — 설치기 본문의 MUI_LANGUAGE 다음) 같은 이름으로 다시 정한다. 나중 값이 이긴다.
; 같은 이름을 두 번 정하면 NSIS가 «자리 낭비» 경고(6030)를 내고 electron-builder는 경고를 오류로 다룬다(-WX) — 이 몇 줄에서만 그 경고를 끈다.
; «설치 범위» 아래 안내는 설치기가 «$(…Exists)(경로)$\r$\n$(reinstallUpgrade)»로 잇는다 — 앞 문장 끝에 줄바꿈을 넣어 경로가 제 줄에 오게 한다.
!macro customHeader
  !pragma warning push
  !pragma warning disable 6030
  !ifndef BUILD_UNINSTALLER
    LangString MUI_TEXT_DIRECTORY_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치할 폴더를 선택해 주세요."
    LangString MUI_TEXT_INSTALLING_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 설치하는 동안 잠시 기다려 주세요."
  !else
    LangString MUI_UNTEXT_WELCOME_INFO_TEXT ${LANG_KOREAN} "이 프로그램은 당신의 컴퓨터에서$\r$\n${PRODUCT_NAME}를 제거할 것입니다.$\r$\n$\r$\n제거를 시작하기 전에$\r$\n${PRODUCT_NAME}를 종료하여 주시기 바랍니다.$\r$\n$\r$\n$_CLICK"
    LangString MUI_UNTEXT_UNINSTALLING_SUBTITLE ${LANG_KOREAN} "${PRODUCT_NAME}를 제거하는 동안 잠시 기다려 주시기 바랍니다."
  !endif
  LangString selectUserMode ${LANG_KOREAN} "이 프로그램을 모든 사용자가 사용할 수 있도록 할 것인지$\r$\n아니면 자신만 사용할 수 있도록 할 것인지 선택하십시오."
  LangString freshInstallForAll ${LANG_KOREAN} "모든 사용자를 위해 새로 설치.$\r$\n(관리자 자격 증명을 묻는 메시지가 표시됨)"
  LangString perUserInstallExists ${LANG_KOREAN} "이미 사용자별 설치가 있습니다.$\r$\n"
  LangString perMachineInstallExists ${LANG_KOREAN} "이미 머신별로 설치되어 있습니다.$\r$\n"
  ; 제거 범위 화면(두 범위가 함께 깔렸을 때만 뜸) — 기본 번역의 «\n»은 줄바꿈이 아니라 글자 그대로 찍혔다
  LangString whichInstallationRemove ${LANG_KOREAN} "이 프로그램은 시스템당(모든 사용자)또는 사용자별로 설치됩니다.$\r$\n어떤 설치를 제거하시겠습니까?"
  LangString perUserInstall ${LANG_KOREAN} "사용자별로 설치되어 있습니다.$\r$\n"
  LangString perMachineInstall ${LANG_KOREAN} "머신별로 설치되어 있습니다.$\r$\n"
  ; 앱이 켜져 있을 때 설치 · 제거 첫머리에 뜨는 알림(MB_OKCANCEL) — 한국어 Windows에서 단추 이름은 «확인» · «취소»다
  LangString appRunning ${LANG_KOREAN} "${PRODUCT_NAME}가 실행 중입니다.$\r$\n'확인'을 클릭하면 종료됩니다."
  !pragma warning pop
!macroend

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

; ── 설치 · 제거 진행 화면에는 사람이 읽는 짧은 문장만 보인다(10/27 Bumm님 B안 «원래 기록 대신 쉬운 문장», 팀장 전달) ──
; NSIS는 하는 일마다 원래 기록(«압축 해제: …\Temp\nsg….tmp\app-64.7z», 파일 복사, 바로 가기 생성, 파일 삭제 …)을 진행 글 한 줄과 «자세히 보기» 목록에 적는다.
; 그 기록은 꺼 두고(SetDetailsPrint none — 설치 단계는 템플릿이 처음에 끄고, 제거는 customUnInit에서 끈다), 단계마다 쉬운 문장 한 줄만 켰다 끈다(psSay).
; 임시 폴더 경로 · .7z · .dll 같은 내부 파일 이름은 화면에 나오지 않는다. 문장을 끼울 수 있는 곳은 템플릿이 열어 둔 자리뿐이다:
;   ① customCheckAppRunning — 설치 단계 맨 앞: 설치 위치 · 켜진 앱 확인 · (예전 판이 있으면) 정리. 앱을 찾는 데 4초쯤 걸린다(10/27 실측).
;      «모든 사용자»는 관리자 권한으로 다시 뜬 설치기에서 이 단계를 건너뛴다(템플릿) — 그래서 설치 위치는 ②에서도 한 번만 적는다(psWhere).
;   ② customUnInstallCheck — 예전 판 지우기를 마친 뒤 = 앱 파일을 풀기 직전: «프로그램 파일을 설치하는 중입니다 …»(가장 오래 걸리는 단계).
;   ③ customInstall — 파일 · 등록 · 바로가기를 마친 뒤: 한 일을 «…했습니다»로 적고 끝낸다. 파일 풀기와 바로가기 만들기 사이에는 끼울 자리가 없다(둘 다 1초가 안 걸린다).
;   제거기: customCheckAppRunning(제거 위치 · 켜진 앱 확인) → customUnInstall(지우는 중). 끝나면 완료 화면이 «제거 완료»를 보인다.
!macro psSay TEXT
  SetDetailsPrint both
  DetailPrint "${TEXT}"
  SetDetailsPrint none
!macroend
!ifndef BUILD_UNINSTALLER
  Var psShownWhere
  !macro psWhere
    ${IfNot} ${Silent}
    ${AndIf} $psShownWhere != "1"
      StrCpy $psShownWhere "1"
      SetDetailsView show
      !insertmacro psSay "설치 위치: $INSTDIR"
    ${EndIf}
  !macroend
!endif
; 템플릿(allowOnlyOneInstallerInstance.nsh)은 customCheckAppRunning이 있으면 기본 검사가 쓰는 getProcessInfo.nsh · $pid를 들이지 않는다 —
; 기본 검사를 그대로 옮겨 쓰므로 여기서 들인다(빠뜨리면 «Invalid command: ${GetProcessInfo}»로 빌드가 멈춘다 — 10/27). 제거기도 같은 검사를 쓴다.
!include "getProcessInfo.nsh"
Var pid
; 켜진 앱 찾기(PowerShell, 4초쯤)는 설치 · 제거 단계 맨 앞에서 돈다 — 그 앞에 위치와 지금 하는 일을 적어 빈 화면으로 기다리지 않게 한다
; (제거기는 이 자리가 없으면 처음 4초쯤 글 없이 막대만 움직였다 — 10/27 실측)
!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    ${IfNot} ${Silent}
      SetDetailsView show
      !insertmacro psSay "제거 위치: $INSTDIR"
    ${EndIf}
  !else
    !insertmacro psWhere
  !endif
  !insertmacro psSay "켜져 있는 ${PRODUCT_NAME}가 있는지 확인하는 중입니다 …"
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      !insertmacro psSay "이전에 설치한 ${PRODUCT_NAME}를 정리하는 중입니다 …"
    ${EndIf}
  !endif
!macroend
; 템플릿(installUtil.nsh handleUninstallResult)과 같은 검사 — 영어 기록 대신 쉬운 문장을 남긴다
!macro customUnInstallCheck
  ${If} ${Errors}
    !insertmacro psSay "이전에 설치한 판을 지우지 못해 그 위에 새로 설치합니다."
  ${ElseIf} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro psWhere
  !insertmacro psSay "프로그램 파일을 설치하는 중입니다 …"
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
  !insertmacro psSay "바탕화면에 «${PRODUCT_NAME}» 바로가기를 만들었습니다."
  !insertmacro psSay "시작 메뉴 «${MENU_FILENAME}»에 등록했습니다."
  !insertmacro psSay "«설치된 앱» 목록에 «${PRODUCT_NAME}»를 등록했습니다."
  !insertmacro psSay "설치를 마쳤습니다."
!macroend

; 제거기는 처음부터 원래 기록(파일 삭제: …)을 끈다 — 앱이 켜져 있는지 보는 단계(un.checkAppRunning)도 이 뒤에 온다
!macro customUnInit
  SetDetailsPrint none
!macroend

!macro customUnInstall
  SetDetailsPrint none
  !insertmacro psSay "프로그램 파일 · 바탕화면 바로가기 · 시작 메뉴를 지우는 중입니다 …"
  ; electron-builder가 제 바로가기를 지우는 조건(--keep-shortcuts가 없을 때)과 맞춘다. 예전에는 업데이트(--updated)면 남겼는데,
  ; «모든 사용자» 설치가 «나만» 설치를 먼저 지울 때도 --updated로 부르므로 «나만» 시작 메뉴에 대상 없는 «Uninstall» 바로가기와 폴더가 남았다(10/28 실측).
  ; 같은 범위 업데이트는 새 판이 customInstall에서 다시 만든다.
  ${IfNot} ${isKeepShortcuts}
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
