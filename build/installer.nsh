; Asistente de instalación de SIA: páginas propias (electron-builder las
; incluye con nsis.include). De momento, una: «Comprobaciones previas», justo
; después de la bienvenida. Comprueba que los certificados del cliente están
; instalados en Windows y, si no, lleva a su guía oficial: sin ellos no se puede
; seguir (no se podría iniciar sesión). Si no se pueden comprobar, se avisa y se
; deja seguir con confirmación: la app volverá a comprobarlo al iniciar sesión.
; La guía y la lista salen de sia-instance.json (scripts/installer-config.mjs).
; En la primera instalación, además, Copilot CLI: si no está, se instala con
; WinGet por usuario (build/copilot-cli.cmd) y, si no se puede, no se sigue. Si
; no se ha podido ni comprobar (un equipo que lo restringe), se avisa y se deja
; seguir con confirmación, como con los certificados. Al actualizar no se repite.
; Después, la sesión de Copilot: que tenga una cuenta activa (sin ella no funciona
; el chat de SIA). Si no, «Iniciar sesión» abre el inicio de sesión de Copilot.

!include "${BUILD_RESOURCES_DIR}\installer-config.nsh"

!ifndef BUILD_UNINSTALLER
!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

Var SiaStatus
Var SiaMissing
Var SiaState
Var SiaHelp
Var SiaGuide
Var SiaRetry
Var SiaFont
Var SiaPage
Var SiaFirst
Var SiaCopilot
Var SiaCopilotCode
Var SiaCopilotStatus
Var SiaStep
Var SiaProc
Var SiaTicks
Var SiaOut
Var SiaLate

; Cancelar corta las comprobaciones en marcha, pero no a WinGet instalando: cortarlo
; a mitad deja su registro roto (8A150054). Si se cancela instalando, Copilot CLI
; termina de instalarse solo.
!define MUI_CUSTOMFUNCTION_ABORT SiaAbort
Var SiaHelpFont
Var SiaRetryAlone
Var SiaCertsOk     ; 1: los certificados ya se confirmaron en esta página
Var SiaCopilotOk   ; 1: Copilot CLI, también
Var SiaSession     ; ok | sin-sesion | unknown
Var SiaWho         ; la cuenta activa de Copilot
Var SiaSessionStatus
Var SiaSessionOk   ; 1: la sesión de Copilot, también
Var SiaLoginBtn

; Primera instalación: SIA no está instalado, ni por usuario ni para todos.
!macro customInit
  Push $0
  StrCpy $SiaFirst "1"
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $0 "" 0 +2
    ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $0 "" +2
    StrCpy $SiaFirst "0"
  Pop $0
!macroend

; Actualizar sin esperas: el desinstalador de la versión anterior borra sus
; ficheros uno a uno y, en las versiones sin asar, son unos 14.000. Justo antes
; de lanzarlo se aparta resources\app renombrándolo (instantáneo) y, al acabar
; la instalación, se borra en segundo plano. Si no se puede renombrar, el
; desinstalador lo borra como siempre. Al definir customCheckAppRunning,
; electron-builder ya no incluye lo que necesita _CHECK_APP_RUNNING.
!include "getProcessInfo.nsh"
Var pid
Var SiaOldDir

!macro customCheckAppRunning
  !insertmacro _CHECK_APP_RUNNING
  ReadRegStr $SiaOldDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $SiaOldDir != ""
  ${AndIf} ${FileExists} "$SiaOldDir\resources\app\*.*"
    System::Call 'kernel32::GetTickCount()i.R9'
    Rename "$SiaOldDir\resources\app" "$SiaOldDir.sia-old-$R9"
    ClearErrors
  ${EndIf}
!macroend

; Se busca junto a la carpeta de instalación, y no solo junto a la del registro:
; una actualización interrumpida deja la carpeta apartada sin registro (el
; desinstalador viejo ya lo borró) y se vuelve a instalar en la misma carpeta.
!macro customInstall
  StrCpy $R8 `"$INSTDIR.sia-old-*"`
  ${If} $SiaOldDir != ""
  ${AndIf} $SiaOldDir != $INSTDIR
    StrCpy $R8 `$R8 "$SiaOldDir.sia-old-*"`
  ${EndIf}
  ExecShell "" "$SYSDIR\cmd.exe" `/c for /d %d in ($R8) do rmdir /s /q "%d"` SW_HIDE
  ; El desinstalador con la ventana de SIA (setup/src-tauri/src/desinstalador.rs), que npm run
  ; dist:win genera antes: Windows lo abre desde «Aplicaciones instaladas» y él usa por debajo el
  ; de siempre. En silencio (/S), al actualizar, pasa la orden tal cual al de siempre.
  ; QuietUninstallString sigue siendo el de siempre. Sin él no se genera el instalador.
  !if /FileExists "${BUILD_RESOURCES_DIR}\Desinstalar SIA.exe"
    File "/oname=$INSTDIR\Desinstalar SIA.exe" "${BUILD_RESOURCES_DIR}\Desinstalar SIA.exe"
    ${If} $installMode == "all"
      WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\Desinstalar SIA.exe" /allusers'
    ${Else}
      WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\Desinstalar SIA.exe" /currentuser'
    ${EndIf}
  !else
    !error "Falta build\Desinstalar SIA.exe: lo genera npm run dist:win (setup/scripts/desinstalador.mjs)"
  !endif
!macroend

; La bienvenida, con lo mínimo: el texto de serie habla de «computadora» y pide
; cerrar las aplicaciones, y SIA lo cierra el instalador.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenido a SIA"
  !define MUI_WELCOMEPAGE_TEXT "Pulsa «Siguiente» para empezar."
  !insertmacro MUI_PAGE_WELCOME
  Page custom SiaChecksShow SiaChecksLeave
!macroend

; $1 ← la respuesta «SIA-…» de una comprobación: desde «SIA-» hasta el final de
; su línea, en toda la salida ($1), que puede traer avisos delante. Sin ella, "".
Function SiaAnswer
  StrLen $4 $1
  StrCpy $3 0
  ${Do}
    ${If} $3 >= $4
      StrCpy $1 ""
      Return
    ${EndIf}
    StrCpy $2 $1 4 $3
    ${If} $2 == "SIA-"
      ${ExitDo}
    ${EndIf}
    IntOp $3 $3 + 1
  ${Loop}
  StrCpy $1 $1 "" $3
  StrLen $4 $1
  StrCpy $3 0
  ${Do}
    ${If} $3 >= $4
      ${ExitDo}
    ${EndIf}
    StrCpy $2 $1 1 $3
    ${If} $2 == "$\r"
    ${OrIf} $2 == "$\n"
      ${ExitDo}
    ${EndIf}
    IntOp $3 $3 + 1
  ${Loop}
  StrCpy $1 $1 $3
FunctionEnd

; Las comprobaciones corren en segundo plano, una detrás de otra, para que la
; ventana siga respondiendo: se puede cancelar en cualquier momento y «Siguiente»
; y «Atrás» esperan a que terminen. SiaLaunch lanza la línea de comandos con su
; salida a un fichero; SiaPoll mira cada 250 ms si ha terminado y, con la
; respuesta en $1, sigue con el paso siguiente (SiaStepDone).
;   certs → copilot (comprobar) → copilot-install (si falta) → session → done
; «Iniciar sesión» lanza otro: login, en su ventana y a la vista; al acabar, session.
Function SiaLaunch
  Pop $0
  StrCpy $SiaOut "$PLUGINSDIR\sia-check.txt"
  Delete $SiaOut
  StrCpy $R7 `/c $0 > "$SiaOut" 2>&1`
  StrCpy $R6 0                      ; oculto (SW_HIDE)
  ${If} $SiaStep == "login"
    StrCpy $R7 `/c $0`              ; el inicio de sesión, a la vista y con lo que dice Copilot
    StrCpy $R6 1                    ; SW_SHOWNORMAL
  ${EndIf}
  StrCpy $R8 "$SYSDIR\cmd.exe"
  StrCpy $R9 $PLUGINSDIR
  ; SHELLEXECUTEINFO con SEE_MASK_NOCLOSEPROCESS (0x40) para tener el proceso y SEE_MASK_FLAG_NO_UI
  ; (0x400) para que Windows no saque diálogos de error: si falla, la página lo dice. Oculto, salvo login.
  ; La versión W, explícita: con la A solo le llegaría la primera letra de cada texto.
  System::Call '*(&l4, i 0x440, p $HWNDPARENT, t "open", t R8, t R7, t R9, i R6, p, p, t, p, i, p, p) p .r1'
  System::Call 'shell32::ShellExecuteExW(p r1) i .r2'
  StrCpy $SiaProc 0
  ${If} $2 != 0
    System::Call '*$1(i, i, p, p, p, p, p, i, p, p, p, p, i, p, p .r3)'
    StrCpy $SiaProc $3
  ${EndIf}
  System::Free $1
  StrCpy $SiaTicks 0
  ${NSD_CreateTimer} SiaPoll 250
FunctionEnd

; Corta lo que esté en marcha, con todo lo que haya lanzado (WinGet incluido).
Function SiaKill
  ${If} $SiaProc != 0
    System::Call 'kernel32::GetProcessId(p $SiaProc) i .r0'
    nsExec::Exec `"$SYSDIR\taskkill.exe" /PID $0 /T /F`
    Pop $0
    System::Call 'kernel32::CloseHandle(p $SiaProc)'
    StrCpy $SiaProc 0
  ${EndIf}
FunctionEnd

Function SiaAbort
  ${If} $SiaStep != "copilot-install"
    Call SiaKill
  ${EndIf}
FunctionEnd

; La respuesta en $1: la línea «SIA-…» de la salida, o "" si no hay. Cada paso
; tiene un tiempo máximo (en vueltas de 250 ms): instalar, 10 min; iniciar
; sesión, 5 min; lo demás, 1 min. Si se pasa, se corta y $SiaLate queda a 1.
Function SiaPoll
  StrCpy $SiaLate 0
  ${If} $SiaProc != 0
    IntOp $SiaTicks $SiaTicks + 1
    StrCpy $2 240
    ${If} $SiaStep == "copilot-install"
      StrCpy $2 2400
    ${ElseIf} $SiaStep == "login"
      StrCpy $2 1200
    ${EndIf}
    System::Call 'kernel32::WaitForSingleObject(p $SiaProc, i 0) i .r0'
    ${If} $0 == 258        ; WAIT_TIMEOUT: sigue en marcha
      ${If} $SiaTicks < $2
        Return
      ${EndIf}
      StrCpy $SiaLate 1
      Call SiaKill
    ${Else}
      System::Call 'kernel32::CloseHandle(p $SiaProc)'
      StrCpy $SiaProc 0
    ${EndIf}
  ${EndIf}
  ${NSD_KillTimer} SiaPoll
  StrCpy $6 ""
  ClearErrors
  FileOpen $5 $SiaOut r
  ${IfNot} ${Errors}
    ${Do}
      FileRead $5 $1
      ${If} ${Errors}
        ${ExitDo}
      ${EndIf}
      Call SiaAnswer
      ${If} $1 != ""
        StrCpy $6 $1
        ${ExitDo}
      ${EndIf}
    ${Loop}
    FileClose $5
  ${EndIf}
  StrCpy $1 $6
  Call SiaStepDone
FunctionEnd

; La comprobación de certificados: lee los almacenes de Windows con .NET (sin la
; unidad Cert:, que no existe si el instalador se abre desde PowerShell 7).
; Responde SIA-OK, SIA-FALTAN:<los que faltan o han caducado> o SIA-ERROR.
!define SIA_CERTS_CMD `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { $$all=@(); foreach($$l in 'CurrentUser','LocalMachine'){ foreach($$n in 'Root','CertificateAuthority'){ $$st=New-Object System.Security.Cryptography.X509Certificates.X509Store($$n,$$l); $$st.Open('ReadOnly'); $$all+=$$st.Certificates; $$st.Close() } }; $$now=[DateTime]::Now; $$m=@(); foreach($$n in '${SIA_CERTS_REQUIRED}'.Split('|')){ $$ok=$$false; foreach($$c in $$all){ if($$c.NotAfter -gt $$now -and $$c.Subject -match ('(^|, )CN=' + [regex]::Escape($$n) + '(,|$$)')){ $$ok=$$true } }; if(-not $$ok){ $$m+=$$n } }; if($$m.Count){ 'SIA-FALTAN:' + ($$m -join ', ') } else { 'SIA-OK' } } catch { 'SIA-ERROR' }"`
; Copilot CLI (build/copilot-cli.cmd, sin PowerShell); con -Install, si falta lo
; instala. Con call delante: si la línea empezase por comillas, cmd /c se las quitaría.
!define SIA_COPILOT_CMD `call "$PLUGINSDIR\copilot-cli.cmd"`

; Repinta la página ya, con su fondo: sin esto, tras cambiar un texto se ve a
; medio pintar o con el anterior debajo.
Function SiaPaint
  System::Call "user32::RedrawWindow(p $SiaPage, p 0, p 0, i 0x185)"
FunctionEnd

; Siguiente (1) y Atrás (3), activos o no según la pila.
Function SiaButtons
  Pop $1
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 $1
  GetDlgItem $0 $HWNDPARENT 3
  EnableWindow $0 $1
FunctionEnd

; Una línea de estado: mientras comprueba, en gris; ✔ en verde; ⚠ en ámbar.
!macro SiaShow HWND TEXT COLOR
  ${NSD_SetText} ${HWND} "${TEXT}"
  SetCtlColors ${HWND} ${COLOR} transparent
!macroend
!define SiaShow "!insertmacro SiaShow"

; Empieza (o vuelve a empezar) las comprobaciones: primero los certificados y
; después, en la primera instalación, Copilot CLI. Al volver a comprobar, lo que
; ya salió bien se queda con su ✔ y no se repite.
Function SiaRefresh
  StrCpy $SiaStep "running"
  ShowWindow $SiaHelp ${SW_HIDE}
  ShowWindow $SiaGuide ${SW_HIDE}
  ShowWindow $SiaRetry ${SW_HIDE}
  ShowWindow $SiaRetryAlone ${SW_HIDE}
  ShowWindow $SiaLoginBtn ${SW_HIDE}
  Push 0
  Call SiaButtons
  ${If} "${SIA_CERTS_REQUIRED}" != ""
  ${AndIf} $SiaCertsOk != "1"
    StrCpy $SiaMissing ""
    ${SiaShow} $SiaStatus "Comprobando los certificados del cliente…" 5F6368
    Call SiaPaint
    StrCpy $SiaStep "certs"
    Push `${SIA_CERTS_CMD}`
    Call SiaLaunch
    Return
  ${EndIf}
  Call SiaCopilotStart
FunctionEnd

Function SiaCopilotStart
  ${If} $SiaCopilotOk == "1"
    Call SiaSessionStart
    Return
  ${EndIf}
  StrCpy $SiaCopilot "ok"
  StrCpy $SiaCopilotCode ""
  ${If} $SiaFirst == "1"
    ${SiaShow} $SiaCopilotStatus "Comprobando Copilot CLI…" 5F6368
    Call SiaPaint
    StrCpy $SiaStep "copilot"
    Push `${SIA_COPILOT_CMD}`
    Call SiaLaunch
    Return
  ${EndIf}
  Call SiaFinish
FunctionEnd

; La sesión de Copilot: en la primera instalación, con Copilot CLI ya bien. Si
; Copilot CLI no está, no hay sesión que mirar.
Function SiaSessionStart
  StrCpy $SiaSession "ok"
  ${If} $SiaFirst != "1"
  ${OrIf} $SiaCopilot != "ok"
  ${OrIf} $SiaSessionOk == "1"
    ${If} $SiaSessionOk != "1"
      ${NSD_SetText} $SiaSessionStatus ""
    ${EndIf}
    Call SiaFinish
    Return
  ${EndIf}
  ${SiaShow} $SiaSessionStatus "Comprobando la sesión de Copilot…" 5F6368
  Call SiaPaint
  StrCpy $SiaStep "session"
  Push `${SIA_COPILOT_CMD} -Session`
  Call SiaLaunch
FunctionEnd

; Un paso ha terminado, con su respuesta en $1 (o "" si no la hubo).
Function SiaStepDone
  ; terminado el inicio de sesión (o cerrada su ventana), se comprueba sin pulsar nada
  ${If} $SiaStep == "login"
    Call SiaSessionStart
    Return
  ${EndIf}
  ${If} $SiaStep == "session"
    ; sin respuesta (o tarde), unknown: no se sabe, y se deja seguir con confirmación
    StrCpy $SiaSession "unknown"
    StrCpy $2 $1 11
    ${If} $2 == "SIA-SESION:"
      StrCpy $SiaSession $1 "" 11
    ${EndIf}
    ; ok:<cuenta>: se dice cuál, para que se vea si es la de Inditex
    StrCpy $2 $SiaSession 3
    ${If} $2 == "ok:"
      StrCpy $SiaWho $SiaSession "" 3
      StrCpy $SiaSession "ok"
    ${EndIf}
    ${If} $SiaSession == "ok"
      StrCpy $SiaSessionOk 1
      ${If} $SiaWho != ""
        ${SiaShow} $SiaSessionStatus "✔  Sesión de Copilot iniciada: $SiaWho." 1E8E3E
      ${Else}
        ${SiaShow} $SiaSessionStatus "✔  Sesión de Copilot iniciada." 1E8E3E
      ${EndIf}
    ${ElseIf} $SiaSession == "sin-sesion"
      ${SiaShow} $SiaSessionStatus "⚠  Falta iniciar sesión en Copilot CLI." B26A00
    ${Else}
      StrCpy $SiaSession "unknown"
      ${SiaShow} $SiaSessionStatus "⚠  No se ha podido comprobar la sesión de Copilot." B26A00
    ${EndIf}
    Call SiaFinish
    Return
  ${EndIf}
  ${If} $SiaStep == "certs"
    ; $SiaState ← ok | missing | unknown (sin respuesta: no se sabe, y se avisa en lugar de dar el check)
    StrCpy $SiaState "unknown"
    StrCpy $2 $1 11
    ${If} $1 == "SIA-OK"
      StrCpy $SiaState "ok"
      StrCpy $SiaCertsOk 1
      ${SiaShow} $SiaStatus "✔  Certificados del cliente instalados." 1E8E3E
    ${ElseIf} $2 == "SIA-FALTAN:"
      StrCpy $SiaMissing $1 "" 11
      StrCpy $SiaState "missing"
      ${SiaShow} $SiaStatus "⚠  Faltan certificados del cliente: $SiaMissing." B26A00
    ${Else}
      ${SiaShow} $SiaStatus "⚠  No se han podido comprobar los certificados del cliente." B26A00
    ${EndIf}
    Call SiaCopilotStart
    Return
  ${EndIf}
  ; Copilot CLI: $SiaCopilot ← ok | falta | sin-winget | politica | descarga | error |
  ; unknown, y $SiaCopilotCode ← el código de WinGet si es otro fallo. Sin respuesta,
  ; unknown: no se ha podido ni comprobar, y se deja seguir con confirmación.
  StrCpy $SiaCopilot "unknown"
  StrCpy $SiaCopilotCode ""
  ${If} $SiaStep == "copilot-install"
  ${AndIf} $SiaLate == 1
    StrCpy $SiaCopilot "tiempo"   ; no termina de instalarse: casi siempre, la red
  ${EndIf}
  StrCpy $2 $1 12
  ${If} $2 == "SIA-COPILOT:"
    StrCpy $SiaCopilot $1 "" 12
    StrCpy $2 $SiaCopilot 6
    ${If} $2 == "error:"
      StrCpy $SiaCopilotCode $SiaCopilot "" 6
      StrCpy $SiaCopilot "error"
    ${EndIf}
  ${EndIf}
  ${If} $SiaStep == "copilot"
  ${AndIf} $SiaCopilot == "falta"
    ${SiaShow} $SiaCopilotStatus "Instalando Copilot CLI…" 5F6368
    Call SiaPaint
    StrCpy $SiaStep "copilot-install"
    Push `${SIA_COPILOT_CMD} -Install`
    Call SiaLaunch
    Return
  ${EndIf}
  ${If} $SiaCopilot == "ok"
    StrCpy $SiaCopilotOk 1
    ${SiaShow} $SiaCopilotStatus "✔  Copilot CLI instalado." 1E8E3E
  ${ElseIf} $SiaCopilot == "sin-winget"
    ${SiaShow} $SiaCopilotStatus "⚠  Falta WinGet para instalar Copilot CLI." B26A00
  ${ElseIf} $SiaCopilot == "politica"
    ${SiaShow} $SiaCopilotStatus "⚠  El equipo no permite instalar Copilot CLI." B26A00
  ${ElseIf} $SiaCopilot == "descarga"
    ${SiaShow} $SiaCopilotStatus "⚠  No se ha podido descargar Copilot CLI." B26A00
  ${ElseIf} $SiaCopilot == "tiempo"
    ${SiaShow} $SiaCopilotStatus "⚠  Copilot CLI no termina de instalarse." B26A00
  ${ElseIf} $SiaCopilotCode != ""
    ${SiaShow} $SiaCopilotStatus "⚠  No se ha podido instalar Copilot CLI." B26A00
  ${ElseIf} $SiaCopilot == "error"
    ${SiaShow} $SiaCopilotStatus "⚠  No se ha podido instalar Copilot CLI." B26A00
  ${Else}
    ${SiaShow} $SiaCopilotStatus "⚠  No se ha podido comprobar Copilot CLI." B26A00
  ${EndIf}
  Call SiaSessionStart
FunctionEnd

; Todo comprobado. Todo bien: solo los checks. Falta algo (o no se sabe): qué
; hacer, la guía si sirve y «Volver a comprobar». Lo de los certificados primero.
Function SiaFinish
  StrCpy $SiaStep "done"
  StrCpy $3 $SiaCopilot
  ${If} $3 == "tiempo"
    StrCpy $3 "descarga"
  ${EndIf}
  StrCpy $0 ""
  StrCpy $2 "0"
  ${If} $SiaState != "ok"
    ; si Copilot CLI tampoco se ha podido descargar, también la conexión
    StrCpy $4 ""
    ${If} $SiaFirst == "1"
    ${AndIf} $3 == "descarga"
      StrCpy $4 ", revisa la conexión"
    ${EndIf}
    ${If} "${SIA_CERTS_URL}" != ""
      StrCpy $0 "Instálalos con la guía$4 y pulsa «Volver a comprobar»."
      StrCpy $2 "1"
    ${Else}
      StrCpy $0 "Pide a soporte la guía, instálalos$4 y pulsa «Volver a comprobar»."
    ${EndIf}
  ${ElseIf} $SiaFirst == "1"
  ${AndIf} $SiaCopilot != "ok"
    ${If} $SiaCopilot == "sin-winget"
      StrCpy $0 "Instala «Instalador de aplicación» desde Microsoft Store y pulsa «Volver a comprobar»."
    ${ElseIf} $SiaCopilot == "politica"
      StrCpy $0 "Pide a soporte que lo instale y pulsa «Volver a comprobar»."
    ${ElseIf} $3 == "descarga"
      StrCpy $0 "Revisa la conexión y la VPN y pulsa «Volver a comprobar»."
    ${ElseIf} $SiaCopilot == "unknown"
      StrCpy $0 "Pulsa «Volver a comprobar» o sigue sin él."
    ${ElseIf} $SiaCopilotCode != ""
      StrCpy $0 "Vuelve a comprobar o pide ayuda a soporte (código $SiaCopilotCode)."
    ${Else}
      StrCpy $0 "Pulsa «Volver a comprobar» y, si sigue, pide ayuda a soporte."
    ${EndIf}
  ${ElseIf} $SiaFirst == "1"
  ${AndIf} $SiaSession != "ok"
    ${If} $SiaSession == "unknown"
      StrCpy $0 "Pulsa «Volver a comprobar» o sigue sin ella."
    ${Else}
      StrCpy $0 "Inicia sesión con tu cuenta de Inditex."
      StrCpy $2 "2"
    ${EndIf}
  ${EndIf}
  ${If} $0 != ""
    ${NSD_SetText} $SiaHelp $0
    ShowWindow $SiaHelp ${SW_SHOW}
    ${If} $2 == "1"
      ShowWindow $SiaGuide ${SW_SHOW}
      ShowWindow $SiaRetry ${SW_SHOW}
    ${ElseIf} $2 == "2"
      ShowWindow $SiaLoginBtn ${SW_SHOW}   ; solo: al acabar el inicio de sesión se comprueba sin pulsar nada
    ${Else}
      ShowWindow $SiaRetryAlone ${SW_SHOW}
    ${EndIf}
  ${EndIf}
  ; Siguiente: sin certificados no; en la primera instalación, tampoco si Copilot CLI
  ; no está y no se ha podido instalar, ni sin sesión de Copilot (lo que no se ha
  ; podido comprobar, sí)
  StrCpy $1 1
  ${If} $SiaState == "missing"
    StrCpy $1 0
  ${ElseIf} $SiaFirst == "1"
  ${AndIf} $SiaCopilot != "ok"
  ${AndIf} $SiaCopilot != "unknown"
    StrCpy $1 0
  ${ElseIf} $SiaFirst == "1"
  ${AndIf} $SiaSession != "ok"
  ${AndIf} $SiaSession != "unknown"
    StrCpy $1 0
  ${EndIf}
  Push $1
  Call SiaButtons
  ; Atrás siempre, una vez terminado
  GetDlgItem $0 $HWNDPARENT 3
  EnableWindow $0 1
  Call SiaPaint
FunctionEnd

Function SiaRecheck
  Pop $0
  Call SiaRefresh
FunctionEnd

; La primera comprobación, con la página ya pintada.
Function SiaFirstCheck
  ${NSD_KillTimer} SiaFirstCheck
  Call SiaRefresh
FunctionEnd

Function SiaOpenGuide
  Pop $0
  ExecShell "open" "${SIA_CERTS_URL}"
FunctionEnd

; El inicio de sesión de Copilot, en su propia ventana: abre el navegador y se
; cierra al completarlo. Mientras, la página espera; después, comprueba la sesión.
Function SiaOpenLogin
  Pop $0
  ShowWindow $SiaHelp ${SW_HIDE}
  ShowWindow $SiaLoginBtn ${SW_HIDE}
  Push 0
  Call SiaButtons
  ${SiaShow} $SiaSessionStatus "Esperando el inicio de sesión en el navegador…" 5F6368
  Call SiaPaint
  StrCpy $SiaStep "login"
  Push `${SIA_COPILOT_CMD} -Login`
  Call SiaLaunch
FunctionEnd

Function SiaChecksShow
  ; sin nada que comprobar (sin certificados exigidos y al actualizar), la página no aparece
  StrCpy $SiaState "ok"
  StrCpy $SiaCopilot "ok"
  StrCpy $SiaStep "done"
  StrCpy $SiaCertsOk 0
  StrCpy $SiaCopilotOk 0
  StrCpy $SiaSession "ok"
  StrCpy $SiaSessionOk 0
  StrCpy $SiaWho ""
  ${If} "${SIA_CERTS_REQUIRED}" == ""
  ${AndIf} $SiaFirst != "1"
    Abort
  ${EndIf}
  StrCpy $SiaStep "running"
  InitPluginsDir
  File "/oname=$PLUGINSDIR\copilot-cli.cmd" "${BUILD_RESOURCES_DIR}\copilot-cli.cmd"
  !insertmacro MUI_HEADER_TEXT "Comprobaciones previas" ""
  nsDialogs::Create 1018
  Pop $SiaPage
  ; mientras se pinta y empieza, ni Siguiente ni Atrás
  Push 0
  Call SiaButtons
  ; todo centrado: una línea por comprobación, qué hacer y los dos botones juntos debajo
  CreateFont $SiaFont "$(^Font)" 10 700
  ${NSD_CreateLabel} 0 6u 100% 22u ""   ; dos líneas, por si faltan varios
  Pop $SiaStatus
  ${NSD_AddStyle} $SiaStatus ${SS_CENTER}
  SendMessage $SiaStatus ${WM_SETFONT} $SiaFont 0
  ${If} "${SIA_CERTS_REQUIRED}" == ""
    ShowWindow $SiaStatus ${SW_HIDE}
  ${EndIf}
  ${NSD_CreateLabel} 0 30u 100% 12u ""
  Pop $SiaCopilotStatus
  ${NSD_AddStyle} $SiaCopilotStatus ${SS_CENTER}
  SendMessage $SiaCopilotStatus ${WM_SETFONT} $SiaFont 0
  ${If} $SiaFirst != "1"
    ShowWindow $SiaCopilotStatus ${SW_HIDE}
  ${EndIf}
  ${NSD_CreateLabel} 0 54u 100% 12u ""
  Pop $SiaSessionStatus
  ${NSD_AddStyle} $SiaSessionStatus ${SS_CENTER}
  SendMessage $SiaSessionStatus ${WM_SETFONT} $SiaFont 0
  ${If} $SiaFirst != "1"
    ShowWindow $SiaSessionStatus ${SW_HIDE}
  ${EndIf}
  ${NSD_CreateLabel} 0 74u 100% 12u ""
  Pop $SiaHelp
  ${NSD_AddStyle} $SiaHelp ${SS_CENTER}
  CreateFont $SiaHelpFont "$(^Font)" 10 400
  SendMessage $SiaHelp ${WM_SETFONT} $SiaHelpFont 0
  SetCtlColors $SiaHelp 5F6368 transparent
  ${If} "${SIA_CERTS_URL}" != ""
    ${NSD_CreateButton} 37u 92u 110u 16u "Abrir la guía  ↗"
    Pop $SiaGuide
    ${NSD_OnClick} $SiaGuide SiaOpenGuide
  ${Else}
    ${NSD_CreateLabel} 37u 92u 0 0 ""
    Pop $SiaGuide
  ${EndIf}
  ${NSD_CreateButton} 95u 92u 110u 16u "Iniciar sesión  ↗"
  Pop $SiaLoginBtn
  ${NSD_OnClick} $SiaLoginBtn SiaOpenLogin
  ShowWindow $SiaLoginBtn ${SW_HIDE}
  ${NSD_CreateButton} 153u 92u 110u 16u "Volver a comprobar"
  Pop $SiaRetry
  ${NSD_OnClick} $SiaRetry SiaRecheck
  ${NSD_CreateButton} 95u 92u 110u 16u "Volver a comprobar"
  Pop $SiaRetryAlone
  ${NSD_OnClick} $SiaRetryAlone SiaRecheck
  ShowWindow $SiaRetryAlone ${SW_HIDE}
  ShowWindow $SiaHelp ${SW_HIDE}
  ShowWindow $SiaGuide ${SW_HIDE}
  ShowWindow $SiaRetry ${SW_HIDE}
  ${NSD_CreateTimer} SiaFirstCheck 50
  nsDialogs::Show
FunctionEnd

; Siguiente: mientras comprueba, no; sin los certificados no se sigue, ni sin
; Copilot CLI en la primera instalación; lo que no se ha podido comprobar se
; avisa (en un solo aviso) y se sigue si se acepta.
Function SiaChecksLeave
  ${If} $SiaStep != "done"
    Abort
  ${EndIf}
  ${If} $SiaState == "missing"
    Abort
  ${EndIf}
  ${If} $SiaFirst == "1"
  ${AndIf} $SiaCopilot != "ok"
  ${AndIf} $SiaCopilot != "unknown"
    Abort
  ${EndIf}
  ${If} $SiaFirst == "1"
  ${AndIf} $SiaSession != "ok"
  ${AndIf} $SiaSession != "unknown"
    Abort
  ${EndIf}
  StrCpy $0 ""
  ${If} $SiaState == "unknown"
    StrCpy $0 "No se han podido comprobar los certificados del cliente. Si faltan, con la VPN no podrás iniciar sesión hasta instalarlos."
  ${EndIf}
  ${If} $SiaFirst == "1"
  ${AndIf} $SiaCopilot == "unknown"
    ${If} $0 != ""
      StrCpy $0 "$0$\r$\n$\r$\n"
    ${EndIf}
    StrCpy $0 "$0No se ha podido comprobar Copilot CLI. Sin él, el chat de Copilot de SIA no funcionará hasta instalarlo."
  ${EndIf}
  ${If} $SiaFirst == "1"
  ${AndIf} $SiaSession == "unknown"
    ${If} $0 != ""
      StrCpy $0 "$0$\r$\n$\r$\n"
    ${EndIf}
    StrCpy $0 "$0No se ha podido comprobar la sesión de Copilot. Sin ella, el chat de Copilot de SIA no funcionará hasta iniciarla."
  ${EndIf}
  ${If} $0 != ""
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$0" IDOK +2
    Abort
  ${EndIf}
FunctionEnd
!endif

; El desinstalador, con el aspecto de SIA Setup en lo que deja el asistente de
; Windows: el lateral blanco con su nombre (build/sidebar.bmp, en package.json),
; textos mínimos y «Desinstalar» en lugar de «Siguiente». Desinstala igual que
; siempre, y SIA lo cierra el propio desinstalador.
!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Desinstalar SIA"
  !define MUI_WELCOMEPAGE_TEXT "Se quitará SIA de este equipo. Tu configuración y tus datos se conservan.$\r$\n$\r$\nSi SIA está abierto, se cerrará."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.SiaUnWelcomeShow
  !insertmacro MUI_UNPAGE_WELCOME
  ; la cabecera de la página siguiente, la del progreso
  !define MUI_PAGE_HEADER_TEXT "Desinstalando SIA"
  !define MUI_PAGE_HEADER_SUBTEXT " "
  !define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "SIA desinstalado"
  !define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT " "
!macroend

; El final: va justo antes de su página
!macro customUninstallPage
  !define MUI_FINISHPAGE_TITLE "SIA desinstalado"
  !define MUI_FINISHPAGE_TEXT "Puedes volver a instalarlo cuando quieras con su instalador."
!macroend

!ifdef BUILD_UNINSTALLER
Function un.SiaUnWelcomeShow
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 0x000C 0 "STR:Desinstalar"   ; WM_SETTEXT: aquí no está WinMessages.nsh
FunctionEnd
!endif
