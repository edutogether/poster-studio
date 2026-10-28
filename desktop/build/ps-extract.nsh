; Poster Studio 설치기의 «앱 파일 풀기» — electron-builder 템플릿의 extractUsing7za(include/extractAppPackage.nsh) 매크로 하나만 바꿔 끼운다(10/28 저녁 팀장).
; installer.nsh의 customCheckAppRunning 안에서 들인다: 그 자리는 템플릿이 이 매크로를 정의한 뒤 · 쓰기 전이다(installSection.nsh — 켜진 앱 찾기(CHECK_APP_RUNNING)가
; installApplicationFiles보다 먼저 펼쳐진다). 템플릿 파일은 고치지 않는다. 같은 자리 방식을 Voice Cinema 설치기도 쓴다(customCheckAppRunning 안 !include).
;
; 템플릿과 다른 점:
;   - 템플릿: 임시 폴더에 풀고(Nsis7z::Extract — 4~5초 동안 상자에 줄이 없었다) 설치 위치로 한 번에 복사(CopyFiles /SILENT — 그동안 막대 · 글이 799‰에서 멈췄다).
;   - 여기: 설치 위치에 바로 풀며(Nsis7z::ExtractWithCallback) 푼 바이트가 파일 끝을 지날 때마다 «설치: …»를 적는다(installer.nsh psExtract*).
;     파일 순서 · 크기 표는 빌드 때 실제 7z에서 만든다(ps-7z-list.mjs — 손으로 적지 않는다, 내용이 바뀌어도 다시 빌드하면 맞다).
;     예전 판은 이 앞에서 이미 지웠다(psRemoveOldInstalls · 템플릿 uninstallOldVersion) — 임시 폴더를 거쳐 «한 번에 바꾸기»를 할 까닭이 없다.
;   - 다 풀었는데 실행 파일이 없으면 템플릿 decompressionFailed 알림으로 멈춘다.
; electron-builder는 26.17.0으로 고정이다(desktop/package.json). 판을 올리면 템플릿 extractUsing7za가 그대로인지 먼저 본다.

!ifndef PS_EXTRACT_SWAPPED
!define PS_EXTRACT_SWAPPED

!ifndef APP_64
  !error "ps-extract.nsh: APP_64(앱 7z)가 정의되지 않았다 — 이 설치기는 x64 하나만 담는다"
!endif
; 표 만들기 — 실패하면(7za 없음 · 7z 없음 · 파일 0개) 빌드가 멈춘다
!system 'node "${PS_BUILD_DIR}\ps-7z-list.mjs" "${APP_64}" "${APP_64}.ps-list.txt"' = 0

!macroundef extractUsing7za
!macro extractUsing7za FILE
  File "/oname=$PLUGINSDIR\ps-7z-list.txt" "${APP_64}.ps-list.txt"
  Call psExtractBegin
  GetFunctionAddress $R9 psExtractProgress
  Nsis7z::ExtractWithCallback "${FILE}" $R9
  Call psExtractEnd
  ${IfNot} ${FileExists} "$OUTDIR\${APP_EXECUTABLE_FILENAME}"
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!endif
