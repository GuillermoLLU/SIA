@echo off
rem Copilot CLI en «Comprobaciones previas» del instalador de Windows
rem (build/installer.nsh): comprueba que está y responde y, con -Install, lo
rem instala con WinGet por usuario (sin administrador), la última versión: a
rem partir de ahí se actualiza solo. Solo cmd, where, winget y copilot: sin
rem PowerShell, que un equipo plataformado puede tener restringido. Contesta una
rem línea que el instalador busca:
rem   SIA-COPILOT:ok              está y responde
rem   SIA-COPILOT:falta           no está (sin -Install)
rem   SIA-COPILOT:sin-winget      no está y no hay WinGet para instalarlo
rem   SIA-COPILOT:politica        una política del equipo impide instalarlo
rem   SIA-COPILOT:descarga        no se ha podido descargar (red, VPN, certificados)
rem   SIA-COPILOT:error:<código>  cualquier otro fallo de WinGet (winget error <código>)
setlocal EnableExtensions

rem El PATH del instalador es el de cuando se abrió: se le suma el de ahora,
rem que trae lo que WinGet acaba de instalar (con sus %VARIABLES% expandidas).
set "UPATH="
set "MPATH="
for /f "skip=2 tokens=2,*" %%a in ('reg query HKCU\Environment /v Path 2^>nul') do set "UPATH=%%b"
for /f "skip=2 tokens=2,*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "MPATH=%%b"
call set "PATH=%PATH%;%UPATH%;%MPATH%"

call :responds && goto ok
if /i not "%~1"=="-Install" (echo SIA-COPILOT:falta& exit /b 0)
where winget >nul 2>nul || (echo SIA-COPILOT:sin-winget& exit /b 0)
rem Antes, ¿llega WinGet a su origen? Sin red falla al momento; la descarga, en
rem cambio, espera sin decir nada a que vuelva la red.
call winget source update --name winget >nul 2>nul
cmd /c exit /b %ERRORLEVEL%
set "CODE=%=ExitCode%"
if not "%CODE%"=="00000000" (
  for %%c in (8A15003A 8A15010F) do if /i "%CODE%"=="%%c" (echo SIA-COPILOT:politica& exit /b 0)
  echo SIA-COPILOT:descarga& exit /b 0
)
rem Sin red, «source update» acaba con 0 y el fallo solo queda en su registro:
rem 80072EE7, no se resuelve el nombre. Solo ese código (sin red de verdad): un
rem bloqueo parcial no debe impedir una instalación que sí podría ir.
set "WGLOGS=%LOCALAPPDATA%\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\LocalState\DiagOutputDir"
set "WGLOG="
for /f "delims=" %%f in ('dir /b /o-d "%WGLOGS%\WinGet-*.log" 2^>nul') do if not defined WGLOG set "WGLOG=%%f"
if defined WGLOG findstr /c:"80072EE7" "%WGLOGS%\%WGLOG%" >nul 2>nul && (echo SIA-COPILOT:descarga& exit /b 0)
rem Una instalación cortada a medias deja su entrada de «aplicaciones instaladas»
rem vacía, y WinGet ya no instala (8A150054): fuera, si está vacía.
set "ARP=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\GitHub.Copilot_Microsoft.Winget.Source_8wekyb3d8bbwe"
reg query "%ARP%" >nul 2>nul && (reg query "%ARP%" /v DisplayName >nul 2>nul || reg delete "%ARP%" /f >nul 2>nul)
call :install
call :responds && goto ok
rem Un registro de Copilot que ya no tiene sus ficheros (8A150054): WinGet lo
rem desinstala y se vuelve a instalar, una vez.
if /i "%CODE%"=="8A150054" (
  call winget uninstall --id GitHub.Copilot --exact --silent --accept-source-agreements >nul 2>nul
  call :install
  call :responds && goto ok
)
for %%c in (8A15003A 8A15010F) do if /i "%CODE%"=="%%c" (echo SIA-COPILOT:politica& exit /b 0)
for %%c in (8A150008 8A15002E 8A15006B 8A150045 8A150107 8A150086 80072EE2 80072EE7 80072EFD 80072F8F) do if /i "%CODE%"=="%%c" (echo SIA-COPILOT:descarga& exit /b 0)
echo SIA-COPILOT:error:%CODE%
exit /b 0

:ok
echo SIA-COPILOT:ok
exit /b 0

rem Instala con WinGet por usuario; CODE ← su código de salida en hexadecimal,
rem como lo da «winget error». Sin --disable-interactivity, que no existe en
rem WinGet anteriores a la 1.4: --silent y aceptar los acuerdos ya evitan
rem cualquier pregunta. Con call: si winget fuese un .cmd, sin él no se volvería.
:install
call winget install --id GitHub.Copilot --exact --scope user --source winget --silent --accept-source-agreements --accept-package-agreements >nul 2>nul
cmd /c exit /b %ERRORLEVEL%
set "CODE=%=ExitCode%"
exit /b 0

rem Está si se encuentra y contesta a --version. Se busca como lo haría Windows:
rem el primero por el orden del PATH.
:responds
set "EXE="
for /f "delims=" %%p in ('where copilot 2^>nul') do if not defined EXE set "EXE=%%p"
if not defined EXE exit /b 1
call "%EXE%" --version >nul 2>nul
exit /b %ERRORLEVEL%
