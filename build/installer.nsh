; Asistente de instalación de SIA: páginas propias (electron-builder las
; incluye con nsis.include). De momento, una: «Comprobaciones previas», justo
; después de la bienvenida. Comprueba que los certificados del cliente están
; instalados en Windows y, si no, lleva a su guía oficial. Se puede seguir sin
; ellos (con confirmación): la app volverá a dar la guía al iniciar sesión.
; La guía y la lista salen de sia-instance.json (scripts/installer-config.mjs).
; Más comprobaciones (Node, CLIs, VPN…) irán en esta misma página.

!include "${BUILD_RESOURCES_DIR}\installer-config.nsh"

!ifndef BUILD_UNINSTALLER
!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh

Var SiaStatus
Var SiaMissing
Var SiaHelp
Var SiaGuide
Var SiaRetry
Var SiaFont

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  Page custom SiaChecksShow SiaChecksLeave
!macroend

; $SiaMissing ← los que faltan o han caducado ("" si están todos). Si PowerShell
; falla no se sabe: se deja vacío y no se bloquea a nadie.
Function SiaCheckCerts
  StrCpy $SiaMissing ""
  StrCmp "${SIA_CERTS_REQUIRED}" "" done
  nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ProgressPreference='SilentlyContinue'; $$m=@(); foreach($$n in '${SIA_CERTS_REQUIRED}'.Split('|')){ $$c = Get-ChildItem Cert:\CurrentUser\Root,Cert:\LocalMachine\Root,Cert:\CurrentUser\CA,Cert:\LocalMachine\CA | Where-Object { $$_.Subject -match ('(^|, )CN=' + [regex]::Escape($$n) + '(,|$$)') -and $$_.NotAfter -gt (Get-Date) }; if(-not $$c){ $$m += $$n } }; if($$m.Count){ 'FALTAN:' + ($$m -join ', ') } else { 'OK' }"`
  Pop $0
  Pop $1
  ${If} $0 != 0
    Goto done
  ${EndIf}
  StrCpy $2 $1 7
  ${If} $2 == "FALTAN:"
    StrCpy $SiaMissing $1 "" 7
    ; sin el salto de línea final
    ${Do}
      StrCpy $3 $SiaMissing 1 -1
      ${If} $3 != "$\n"
      ${AndIf} $3 != "$\r"
        ${ExitDo}
      ${EndIf}
      StrCpy $SiaMissing $SiaMissing -1
    ${Loop}
  ${EndIf}
  done:
FunctionEnd

; Todo bien: solo el check. Falta algo: el aviso y, debajo, el porqué, la guía
; y «Volver a comprobar».
Function SiaRefresh
  Call SiaCheckCerts
  ${If} $SiaMissing == ""
    ${NSD_SetText} $SiaStatus "✔  Certificados del cliente instalados."
    SetCtlColors $SiaStatus 1E8E3E transparent
    ShowWindow $SiaHelp ${SW_HIDE}
    ShowWindow $SiaGuide ${SW_HIDE}
    ShowWindow $SiaRetry ${SW_HIDE}
  ${Else}
    ${NSD_SetText} $SiaStatus "⚠  Faltan certificados del cliente: $SiaMissing."
    SetCtlColors $SiaStatus B26A00 transparent
    ShowWindow $SiaHelp ${SW_SHOW}
    ShowWindow $SiaGuide ${SW_SHOW}
    ShowWindow $SiaRetry ${SW_SHOW}
  ${EndIf}
FunctionEnd

Function SiaRecheck
  Pop $0
  Call SiaRefresh
FunctionEnd

Function SiaOpenGuide
  Pop $0
  ExecShell "open" "${SIA_CERTS_URL}"
FunctionEnd

Function SiaChecksShow
  ; sin nada que comprobar, la página no aparece
  StrCmp "${SIA_CERTS_REQUIRED}" "" 0 +2
    Abort
  !insertmacro MUI_HEADER_TEXT "Comprobaciones previas" "SIA revisa que este equipo está preparado antes de instalar."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 4u 100% 14u ""
  Pop $SiaStatus
  CreateFont $SiaFont "$(^Font)" 10 700
  SendMessage $SiaStatus ${WM_SETFONT} $SiaFont 0
  ${If} "${SIA_CERTS_URL}" != ""
    ${NSD_CreateLabel} 0 26u 100% 30u "La red del cliente verifica las conexiones con sus propios certificados y este equipo aún no los tiene. Instálalos con la guía y pulsa «Volver a comprobar»."
    Pop $SiaHelp
    ${NSD_CreateLink} 0 60u 100% 12u "Abrir la guía de certificados"
    Pop $SiaGuide
    ${NSD_OnClick} $SiaGuide SiaOpenGuide
  ${Else}
    ${NSD_CreateLabel} 0 26u 100% 30u "La red del cliente verifica las conexiones con sus propios certificados y este equipo aún no los tiene. Pide a soporte la guía, instálalos y pulsa «Volver a comprobar»."
    Pop $SiaHelp
    ${NSD_CreateLabel} 0 60u 0 0 ""
    Pop $SiaGuide
  ${EndIf}
  ${NSD_CreateButton} 0 80u 100u 15u "Volver a comprobar"
  Pop $SiaRetry
  ${NSD_OnClick} $SiaRetry SiaRecheck
  Call SiaRefresh
  nsDialogs::Show
FunctionEnd

; Siguiente con el aviso: se advierte y, si se acepta, la instalación sigue.
Function SiaChecksLeave
  ${If} $SiaMissing != ""
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Faltan certificados del cliente: $SiaMissing.$\r$\n$\r$\nLa red del cliente verifica las conexiones con sus propios certificados y este equipo aún no los tiene. SIA se instalará igualmente, pero con la VPN no podrás iniciar sesión hasta instalarlos.$\r$\n$\r$\nPulsa Aceptar para continuar con la instalación." IDOK +2
    Abort
  ${EndIf}
FunctionEnd
!endif
