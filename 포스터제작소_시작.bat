@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo    InKY AI 영화 포스터 제작소
echo    서버를 시작합니다. 이 창은 닫지 마세요.
echo    (종료하려면 이 창에서 Ctrl + C 를 누르세요)
echo ================================================
echo.
echo  잠시 후 브라우저가 자동으로 열립니다...
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
npm.cmd start
pause
