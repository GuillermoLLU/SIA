#!/bin/sh
# Copilot CLI en «Comprobaciones previas» de SIA Setup en macOS (setup/src-tauri/src/mac.rs): lo
# mismo que build/copilot-cli.cmd en Windows, con Homebrew en lugar de WinGet. Comprueba que está y
# responde y, con -Install, lo instala (brew install --cask copilot-cli); a partir de ahí se
# actualiza con Homebrew. Contesta una línea que SIA Setup busca:
#   SIA-COPILOT:ok              está y responde
#   SIA-COPILOT:falta           no está (sin -Install)
#   SIA-COPILOT:sin-winget      no está y no hay Homebrew para instalarlo
#   SIA-COPILOT:descarga        no se ha podido descargar (red, VPN, certificados)
#   SIA-COPILOT:error:<código>  cualquier otro fallo de Homebrew (su código de salida)
# Con -Session, si Copilot tiene una cuenta activa (en su configuración, sin leer su token ni
# conectarse), y cuál:
#   SIA-SESION:ok:<cuenta>      hay una cuenta activa
#   SIA-SESION:sin-sesion       no la hay
# Con -Login, el inicio de sesión de Copilot (mac.rs lo abre en Terminal).

# Las apps de macOS no heredan el PATH de la terminal: las carpetas de Homebrew, delante
PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
export PATH
# Copilot usa antes un token de estas variables que su sesión: fuera, para iniciar la sesión
# guardada, la que usará SIA.
unset COPILOT_GITHUB_TOKEN GH_TOKEN GITHUB_TOKEN

responds() { command -v copilot >/dev/null 2>&1 && copilot --version >/dev/null 2>&1; }

case "$1" in
  -Session)
    # la cuenta: el primer «"login": "…"» después de «"lastLoggedInUser"» (antes está la lista de
    # todas las que tienen sesión)
    conf="${COPILOT_HOME:-$HOME/.copilot}/config.json"
    who=$(awk '/"lastLoggedInUser"/ { f = 1 } f && /"login"/ { sub(/.*"login"[ \t]*:[ \t]*"/, ""); sub(/".*/, ""); print; exit }' "$conf" 2>/dev/null)
    if grep -q '"lastLoggedInUser"' "$conf" 2>/dev/null; then echo "SIA-SESION:ok:$who"; else echo "SIA-SESION:sin-sesion"; fi
    exit 0 ;;
  -Login)
    copilot login
    exit 0 ;;
esac

if responds; then echo "SIA-COPILOT:ok"; exit 0; fi
[ "$1" = "-Install" ] || { echo "SIA-COPILOT:falta"; exit 0; }
command -v brew >/dev/null 2>&1 || { echo "SIA-COPILOT:sin-winget"; exit 0; }
brew install --cask copilot-cli >/dev/null 2>&1
code=$?
if responds; then echo "SIA-COPILOT:ok"; exit 0; fi
# sin red, Homebrew no llega a descargar
curl -sI --max-time 10 https://formulae.brew.sh >/dev/null 2>&1 || { echo "SIA-COPILOT:descarga"; exit 0; }
echo "SIA-COPILOT:error:$code"
