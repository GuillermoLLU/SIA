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
Var SiaState
Var SiaHelp
Var SiaGuide
Var SiaRetry
Var SiaFont

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  Page custom SiaChecksShow SiaChecksLeave
!macroend

; $SiaState ← ok | missing | unknown, y $SiaMissing ← los que faltan o han caducado.
; Lee los almacenes de Windows con .NET (sin la unidad Cert:, que no existe si el
; instalador se abre desde PowerShell 7) y busca la respuesta SIA-… en toda la
; salida, que puede traer avisos delante. Si no hay respuesta, no se sabe: unknown,
; y la página avisa en lugar de dar el check.
Function SiaCheckCerts
  StrCpy $SiaMissing ""
  StrCpy $SiaState "ok"
  StrCmp "${SIA_CERTS_REQUIRED}" "" done
  StrCpy $SiaState "unknown"
  nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { $$all=@(); foreach($$l in 'CurrentUser','LocalMachine'){ foreach($$n in 'Root','CertificateAuthority'){ $$st=New-Object System.Security.Cryptography.X509Certificates.X509Store($$n,$$l); $$st.Open('ReadOnly'); $$all+=$$st.Certificates; $$st.Close() } }; $$now=[DateTime]::Now; $$m=@(); foreach($$n in '${SIA_CERTS_REQUIRED}'.Split('|')){ $$ok=$$false; foreach($$c in $$all){ if($$c.NotAfter -gt $$now -and $$c.Subject -match ('(^|, )CN=' + [regex]::Escape($$n) + '(,|$$)')){ $$ok=$$true } }; if(-not $$ok){ $$m+=$$n } }; if($$m.Count){ 'SIA-FALTAN:' + ($$m -join ', ') } else { 'SIA-OK' } } catch { 'SIA-ERROR' }"`
  Pop $0
  Pop $1
  ${If} $0 == "error"
  ${OrIf} $0 == "timeout"
    Goto done
  ${EndIf}
  ; la respuesta: desde «SIA-» hasta el final de su línea
  StrLen $4 $1
  StrCpy $3 0
  ${Do}
    ${If} $3 >= $4
      Goto done
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
  ${If} $1 == "SIA-OK"
    StrCpy $SiaState "ok"
  ${Else}
    StrCpy $2 $1 11
    ${If} $2 == "SIA-FALTAN:"
      StrCpy $SiaMissing $1 "" 11
      StrCpy $SiaState "missing"
    ${EndIf}
  ${EndIf}
  done:
FunctionEnd

; Todo bien: solo el check. Falta algo (o no se sabe): el aviso y, debajo, el
; porqué, la guía y «Volver a comprobar».
Function SiaRefresh
  Call SiaCheckCerts
  ${If} $SiaState == "ok"
    ${NSD_SetText} $SiaStatus "✔  Certificados del cliente instalados."
    SetCtlColors $SiaStatus 1E8E3E transparent
    ShowWindow $SiaHelp ${SW_HIDE}
    ShowWindow $SiaGuide ${SW_HIDE}
    ShowWindow $SiaRetry ${SW_HIDE}
  ${Else}
    ${If} $SiaState == "missing"
      ${NSD_SetText} $SiaStatus "⚠  Faltan certificados del cliente: $SiaMissing."
    ${Else}
      ${NSD_SetText} $SiaStatus "⚠  No se han podido comprobar los certificados del cliente."
    ${EndIf}
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
  ${If} $SiaState == "missing"
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "Faltan certificados del cliente: $SiaMissing.$\r$\n$\r$\nLa red del cliente verifica las conexiones con sus propios certificados y este equipo aún no los tiene. SIA se instalará igualmente, pero con la VPN no podrás iniciar sesión hasta instalarlos.$\r$\n$\r$\nPulsa Aceptar para continuar con la instalación." IDOK +2
    Abort
  ${ElseIf} $SiaState == "unknown"
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "No se han podido comprobar los certificados del cliente.$\r$\n$\r$\nLa red del cliente verifica las conexiones con sus propios certificados. Si este equipo aún no los tiene, SIA se instalará igualmente, pero con la VPN no podrás iniciar sesión hasta instalarlos.$\r$\n$\r$\nPulsa Aceptar para continuar con la instalación." IDOK +2
    Abort
  ${EndIf}
FunctionEnd
!endif
