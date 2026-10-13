@echo off
cd /d E:\mybuddy
echo Stopping buddy...
taskkill /F /IM MyBuddy.exe /IM electron.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo Building (details in build.log)...
call npm run pack > build.log 2>&1
if errorlevel 1 (echo BUILD FAILED, open build.log & pause & exit /b 1)
echo Installing...
rmdir /S /Q E:\Apps\MyBuddy-win32-x64 2>nul
xcopy E:\mybuddy\dist\MyBuddy-win32-x64 E:\Apps\MyBuddy-win32-x64 /E /I /Y >nul
if errorlevel 1 (echo COPY FAILED & pause & exit /b 1)
echo Starting...
start "" "E:\Apps\MyBuddy-win32-x64\MyBuddy.exe"
echo Done!
timeout /t 3 >nul