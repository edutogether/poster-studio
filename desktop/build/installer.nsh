; Poster Studio 설치판 — 언제나 «이 사용자만» 설치한다(관리자 권한 없이, %LOCALAPPDATA%\Programs 아래가 기본 · 위치는 고를 수 있다).
; electron-builder의 «설치 범위 고르기» 화면(이 사용자 / 모든 사용자)을 건너뛴다 — 모든 사용자 설치는 관리자 권한을 묻는다.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
