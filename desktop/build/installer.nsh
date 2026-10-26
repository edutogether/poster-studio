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
