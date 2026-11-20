// macOS: SIA.app, que va dentro de SIA Setup comprimido (setup/scripts/empaquetar.mjs), se copia
// en la carpeta elegida, de serie /Applications. Las comprobaciones son las de Windows con sus
// equivalentes: los certificados en los llaveros y Copilot CLI con Homebrew (build/copilot-cli.sh).
use crate::{tamano, Instalado, Paquete, Progreso};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const SISTEMA: &str = "mac";
pub const CARPETA_APP: &str = "SIA.app";
pub const GUIA_GESTOR: &str = "https://brew.sh/es/";

#[cfg(embebido)]
const APP: &[u8] = include_bytes!("../payload/sia-app.zip");

// Los certificados, en los llaveros del sistema, del usuario y las raíces de Apple: cada nombre
// tiene que estar como CN exacto en alguno sin caducar. Los nombres llegan en SIA_CERTS,
// separados por |. Responde SIA-OK, SIA-FALTAN:<los que faltan o han caducado> o SIA-ERROR.
const CERTS_SH: &str = r#"
command -v security >/dev/null 2>&1 || { echo SIA-ERROR; exit 0; }
faltan=""
IFS='|'
for n in $SIA_CERTS; do
  ok=""
  for kc in /Library/Keychains/System.keychain "$HOME/Library/Keychains/login.keychain-db" /System/Library/Keychains/SystemRootCertificates.keychain; do
    [ -f "$kc" ] || continue
    d=$(mktemp -d)
    security find-certificate -a -c "$n" -p "$kc" 2>/dev/null | awk -v d="$d" '/BEGIN CERT/{i++} i{print > (d "/" i ".pem")}'
    for f in "$d"/*.pem; do
      [ -f "$f" ] || continue
      cn=$(openssl x509 -noout -subject -in "$f" 2>/dev/null | sed -n 's/.*CN *= *\([^,/]*\).*/\1/p' | sed 's/ *$//')
      [ "$cn" = "$n" ] && openssl x509 -noout -checkend 0 -in "$f" >/dev/null 2>&1 && ok=1
    done
    rm -rf "$d"
    [ -n "$ok" ] && break
  done
  [ -n "$ok" ] || faltan="${faltan:+$faltan, }$n"
done
if [ -n "$faltan" ]; then echo "SIA-FALTAN:$faltan"; else echo "SIA-OK"; fi
"#;

pub const COPILOT_CLI: &str = include_str!("../../../build/copilot-cli.sh");
pub const COPILOT_CLI_NOMBRE: &str = "copilot-cli.sh";

fn version_de(app: &Path) -> String {
    Command::new("defaults")
        .arg("read")
        .arg(app.join("Contents").join("Info"))
        .arg("CFBundleShortVersionString")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

// SIA instalado: SIA.app en /Applications o en las Aplicaciones del usuario
pub fn instalado() -> Option<Instalado> {
    let home = std::env::var("HOME").unwrap_or_default();
    [PathBuf::from("/Applications/SIA.app"), Path::new(&home).join("Applications").join("SIA.app")]
        .into_iter()
        .find(|p| p.exists())
        .map(|p| Instalado { version: version_de(&p), carpeta: p.to_string_lossy().into_owned() })
}

pub fn sia_abierto() -> bool {
    Command::new("pgrep").args(["-x", "SIA"]).output().map(|o| o.status.success()).unwrap_or(false)
}

pub fn carpeta_propuesta() -> String {
    "/Applications/SIA.app".into()
}

pub fn sistema_operativo() -> String {
    let v = Command::new("sw_vers").arg("-productVersion").output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    format!("macOS {}", v.unwrap_or_default())
}

pub fn carpeta_registros() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join("Library").join("Logs").join("SIA Setup")
}

// La orden de cada comprobación, en su propio grupo de procesos para poder cortarla entera. El
// inicio de sesión no pasa por aquí (login): necesita Terminal.
pub fn orden(paso: &str, cli: &Path, certs: &[String]) -> Command {
    let mut cmd = Command::new("/bin/sh");
    if paso == "certs" {
        cmd.args(["-c", CERTS_SH]).env("SIA_CERTS", certs.join("|"));
    } else {
        cmd.arg(cli);
        match paso {
            "copilot-install" => {
                cmd.arg("-Install");
            }
            "session" => {
                cmd.arg("-Session");
            }
            _ => {}
        }
    }
    cmd.process_group(0);
    cmd
}

pub fn lanzar(mut cmd: Command, _paso: &str) -> std::io::Result<std::process::Child> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::null()).spawn()
}

pub fn matar(pid: u32) {
    let _ = Command::new("kill").args(["-TERM", &format!("-{pid}")]).output();
}

// El inicio de sesión de Copilot necesita una terminal: se abre en Terminal y se espera a que haya
// sesión, a que se cierre (ya no hay ningún «copilot login») o al tiempo máximo. `seguir` lo apaga
// cancelar.
pub async fn login(cli: &Path, max: Duration, seguir: impl Fn() -> bool) -> (String, bool) {
    let script = format!("tell application \"Terminal\" to do script \"/bin/sh '{}' -Login; exit\"", cli.display());
    let _ = Command::new("osascript").args(["-e", &script, "-e", "tell application \"Terminal\" to activate"]).status();
    let inicio = std::time::Instant::now();
    let mut visto = false;
    while seguir() {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let sesion = Command::new("/bin/sh").arg(cli).arg("-Session").output().map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
        if sesion.contains("SIA-SESION:ok") {
            break;
        }
        let abierto = Command::new("pgrep").args(["-f", "copilot login"]).output().map(|o| o.status.success()).unwrap_or(false);
        visto |= abierto;
        if (visto && !abierto) || (!visto && inicio.elapsed() > Duration::from_secs(15)) {
            break;
        }
        if inicio.elapsed() > max {
            return (String::new(), true);
        }
    }
    (String::new(), false)
}

fn app_lista(p: &Paquete) -> Result<(PathBuf, bool), String> {
    if let Some(dir) = crate::prueba("SIA_SETUP_PAYLOAD") {
        let zip = Path::new(&dir).join(&p.archivo);
        return if zip.exists() { Ok((zip, false)) } else { Err("INS-405 · No se encuentra SIA.".into()) };
    }
    #[cfg(embebido)]
    {
        let dir = std::env::temp_dir().join("sia-setup");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let zip = dir.join(format!("sia-{}.zip", p.version));
        std::fs::write(&zip, APP).map_err(|e| format!("INS-402 · No se pudo preparar la instalación: {e}"))?;
        Ok((zip, true))
    }
    #[cfg(not(embebido))]
    Err(crate::SIN_PAQUETE.into())
}

// SIA abierto se cierra como lo haría la persona; si no responde, a la fuerza
fn cerrar_sia() {
    let _ = Command::new("osascript").args(["-e", "quit app \"SIA\""]).status();
    for _ in 0..20 {
        if !sia_abierto() {
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    let _ = Command::new("pkill").args(["-x", "SIA"]).status();
}

// Copia SIA.app en la carpeta elegida: al actualizar, primero se quita la anterior. La barra:
// quitando 0-15 %, copiando hasta 97 % según lo que ya ocupa frente a lo que ocupará, y terminando.
pub async fn instalar(app: AppHandle, p: Paquete, carpeta: String, actualizar: bool) -> Result<i32, String> {
    let (zip, borrar) = app_lista(&p)?;
    let destino = PathBuf::from(&carpeta);
    let padre = destino.parent().ok_or("INS-404 · La carpeta no es válida.")?.to_path_buf();
    let total = p.bytes.max(1) as f64;
    let emitir = |pct: u32, fase: &'static str| {
        let _ = app.emit("progreso", Progreso { pct, fase });
    };
    if sia_abierto() {
        cerrar_sia();
    }
    if actualizar || destino.exists() {
        emitir(5, "quitando");
        std::fs::remove_dir_all(&destino).map_err(|e| format!("INS-404 · No se pudo quitar la versión anterior: {e}"))?;
    }
    emitir(15, "copiando");
    let hecho = Arc::new(AtomicBool::new(false));
    {
        let (app, hecho, dir) = (app.clone(), hecho.clone(), destino.clone());
        std::thread::spawn(move || {
            let mut max = 15u32;
            while !hecho.load(Ordering::Relaxed) {
                max = max.max((15.0 + 82.0 * (tamano(&dir) as f64 / total).min(1.0)) as u32);
                let _ = app.emit("progreso", Progreso { pct: max, fase: "copiando" });
                std::thread::sleep(Duration::from_millis(1000));
            }
        });
    }
    // el zip lleva SIA.app dentro (ditto --keepParent): se descomprime en la carpeta de destino
    // con su nombre de siempre y, si se eligió otro, se renombra
    let origen = zip.clone();
    let res = tauri::async_runtime::spawn_blocking(move || Command::new("ditto").args(["-x", "-k"]).arg(&origen).arg(&padre).status())
        .await
        .map_err(|e| e.to_string())?;
    hecho.store(true, Ordering::Relaxed);
    if borrar {
        let _ = std::fs::remove_file(&zip);
    }
    let codigo = res.map_err(|e| format!("INS-403 · No se pudo copiar SIA: {e}"))?.code().unwrap_or(-1);
    if codigo != 0 {
        return Err(format!("INS-404 · No se pudo copiar SIA en {} (código {codigo}).", destino.display()));
    }
    let copiado = destino.with_file_name("SIA.app");
    if copiado != destino {
        std::fs::rename(&copiado, &destino).map_err(|e| format!("INS-404 · No se pudo copiar SIA: {e}"))?;
    }
    emitir(97, "terminando");
    Ok(0)
}

pub fn abrir_sia(carpeta: &str) -> std::io::Result<()> {
    Command::new("open").arg(carpeta).spawn().map(|_| ())
}

pub fn abrir_fichero(ruta: &Path) -> std::io::Result<()> {
    Command::new("open").arg("-t").arg(ruta).spawn().map(|_| ())
}

pub fn abrir_url(url: &str) -> std::io::Result<()> {
    Command::new("open").arg(url).spawn().map(|_| ())
}
