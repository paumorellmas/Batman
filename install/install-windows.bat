@echo off
rem Instal·la el panell "Full de música TV3" a Premiere Pro (Windows).
setlocal
set "SRC=%~dp0..\panel"
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.batman.musicsheet"

rem Permet carregar panells sense signar (cal per a panells propis).
for %%v in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%SRC%" "%DEST%\" /e /i /y >nul
if errorlevel 1 (
  echo No s'ha pogut copiar el panell a "%DEST%".
  pause
  exit /b 1
)

echo Panell instal·lat a "%DEST%".
echo Reinicia Premiere Pro i obre'l a Finestra ^> Extensions ^> Full de musica TV3.
pause
