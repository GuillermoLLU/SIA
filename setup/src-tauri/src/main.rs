// SIA Setup: la ventana del instalador (ui/) y lo que hace por debajo. En Windows, el instalador
// NSIS de SIA de siempre, en silencio, con la carpeta elegida: así se conservan la desinstalación,
// la entrada en las aplicaciones de Windows y la actualización rápida (build/installer.nsh).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// Lo que se instala: el NSIS de SIA y lo que ocupa SIA instalado, para la barra de progreso, más
// los certificados que hay que comprobar y su guía (de sia-instance.json, como el NSIS). Va dentro
// del .exe: setup/scripts/empaquetar.mjs lo deja en src-tauri/payload/ antes de compilar y
// build.rs activa `embebido`.
#[cfg(embebido)]
const PAQUETE: &str = include_str!("../payload/paquete.json");
#[cfg(embebido)]
const NSIS: &[u8] = include_bytes!("../payload/sia-nsis.exe");

// Solo en las compilaciones de desarrollo, para probar: otro paquete (SIA_SETUP_PAYLOAD, una
// carpeta con paquete.json y su NSIS), otro copilot-cli.cmd (SIA_SETUP_COPILOT_CLI) o un tiempo
// máximo más corto para cada comprobación (SIA_SETUP_MAX_S). La de producción no las mira.
fn prueba(var: &str) -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var(var).ok().filter(|v| !v.is_empty())
    } else {
        None
    }
}

#[derive(Deserialize)]
struct Paquete {
    version: String,
    bytes: u64,
    nsis: String,
    #[serde(default)]
    certs: Certs,
}

#[derive(Deserialize, Serialize, Default, Clone)]
struct Certs {
    #[serde(default)]
    guia: String,
    #[serde(default)]
    requeridos: Vec<String>,
}

const SIN_PAQUETE: &str = "No se encuentra lo que hay que instalar.";

fn paquete() -> Result<Paquete, String> {
    let json = match prueba("SIA_SETUP_PAYLOAD") {
        Some(dir) => std::fs::read_to_string(Path::new(&dir).join("paquete.json")).map_err(|_| SIN_PAQUETE.to_string())?,
        #[cfg(embebido)]
        None => PAQUETE.to_string(),
        #[cfg(not(embebido))]
        None => return Err(SIN_PAQUETE.into()),
    };
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

// El NSIS, listo para lanzar: el que va dentro del .exe se escribe en una carpeta temporal (y se
// borra al acabar, con `borrar` a true)
fn nsis_listo(p: &Paquete) -> Result<(PathBuf, bool), String> {
    if let Some(dir) = prueba("SIA_SETUP_PAYLOAD") {
        let nsis = Path::new(&dir).join(&p.nsis);
        return if nsis.exists() { Ok((nsis, false)) } else { Err("No se encuentra el instalador de SIA.".into()) };
    }
    #[cfg(embebido)]
    {
        let dir = std::env::temp_dir().join("sia-setup");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let nsis = dir.join(format!("sia-{}.exe", p.version));
        std::fs::write(&nsis, NSIS).map_err(|e| format!("No se pudo preparar la instalación: {e}"))?;
        Ok((nsis, true))
    }
    #[cfg(not(embebido))]
    Err(SIN_PAQUETE.into())
}

#[derive(Serialize)]
struct Instalado {
    version: String,
    carpeta: String,
}

#[derive(Serialize)]
struct Estado {
    sistema: &'static str,
    version: String,
    bytes: u64,
    instalado: Option<Instalado>,
    abierto: bool,
    carpeta: String,
    certs: Certs,
}

#[derive(Serialize, Clone)]
struct Progreso {
    pct: u32,
    fase: &'static str,
}

// SIA instalado, por usuario o para todos. El NSIS lo registra en las aplicaciones de Windows como
// «SIA <versión>» bajo su GUID, y la carpeta la guarda en Software\<GUID> (la misma que lee
// customInit en build/installer.nsh).
#[cfg(windows)]
fn instalado() -> Option<Instalado> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let hive = RegKey::predef(root);
        let Ok(keys) = hive.open_subkey(UNINSTALL) else { continue };
        for guid in keys.enum_keys().flatten() {
            let Ok(k) = keys.open_subkey(&guid) else { continue };
            let display: String = k.get_value("DisplayName").unwrap_or_default();
            if display != "SIA" && !display.starts_with("SIA ") {
                continue;
            }
            let carpeta = hive
                .open_subkey(format!(r"Software\{guid}"))
                .and_then(|s| s.get_value::<String, _>("InstallLocation"))
                .unwrap_or_default();
            if carpeta.is_empty() {
                continue;
            }
            let version: String = k.get_value("DisplayVersion").unwrap_or_default();
            return Some(Instalado { version, carpeta });
        }
    }
    None
}

#[cfg(not(windows))]
fn instalado() -> Option<Instalado> {
    None
}

#[cfg(windows)]
fn sia_abierto() -> bool {
    Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq SIA.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("SIA.exe"))
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn sia_abierto() -> bool {
    false
}

fn carpeta_propuesta() -> String {
    if cfg!(windows) {
        let base = std::env::var("LOCALAPPDATA").unwrap_or_default();
        format!(r"{base}\Programs\SIA")
    } else {
        "/Applications/SIA.app".into()
    }
}

// Lo que ocupa la carpeta, sin seguir enlaces
fn tamano(dir: &Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(dir) else { return 0 };
    rd.flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => tamano(&e.path()),
            Ok(t) if t.is_file() => e.metadata().map(|m| m.len()).unwrap_or(0),
            _ => 0,
        })
        .sum()
}

#[tauri::command]
fn estado() -> Result<Estado, String> {
    let p = paquete()?;
    Ok(Estado {
        sistema: if cfg!(target_os = "macos") { "mac" } else { "win" },
        version: p.version,
        bytes: p.bytes,
        instalado: instalado(),
        abierto: sia_abierto(),
        carpeta: carpeta_propuesta(),
        certs: p.certs,
    })
}

// ── Comprobaciones previas: las mismas que el NSIS (build/installer.nsh) ─────────────────────
// Cada una contesta una línea «SIA-…» que la ventana interpreta. copilot-cli.cmd es el mismo
// fichero que usa el NSIS: se incluye al compilar y se escribe en una carpeta temporal.

// La comprobación de certificados: lee los almacenes de Windows con .NET (sin la unidad Cert:,
// que no existe si se abre desde PowerShell 7). Los nombres llegan en SIA_CERTS, separados por |.
// Responde SIA-OK, SIA-FALTAN:<los que faltan o han caducado> o SIA-ERROR.
#[cfg(windows)]
const CERTS_PS: &str = "try { $all=@(); foreach($l in 'CurrentUser','LocalMachine'){ foreach($n in 'Root','CertificateAuthority'){ $st=New-Object System.Security.Cryptography.X509Certificates.X509Store($n,$l); $st.Open('ReadOnly'); $all+=$st.Certificates; $st.Close() } }; $now=[DateTime]::Now; $m=@(); foreach($n in $env:SIA_CERTS.Split('|')){ $ok=$false; foreach($c in $all){ if($c.NotAfter -gt $now -and $c.Subject -match ('(^|, )CN=' + [regex]::Escape($n) + '(,|$)')){ $ok=$true } }; if(-not $ok){ $m+=$n } }; if($m.Count){ 'SIA-FALTAN:' + ($m -join ', ') } else { 'SIA-OK' } } catch { 'SIA-ERROR' }";

#[cfg(windows)]
const COPILOT_CLI: &str = include_str!("../../../build/copilot-cli.cmd");

// La comprobación en marcha (su proceso y su paso), para poder cortarla al cancelar
#[derive(Default)]
struct EnCurso(std::sync::Mutex<Option<(u32, String)>>);

#[derive(Serialize)]
struct Comprobado {
    respuesta: String, // la línea «SIA-…», o "" si no la hubo
    tarde: bool,       // se pasó de su tiempo y se cortó
}

// La respuesta «SIA-…»: desde «SIA-» hasta el final de su línea, que puede traer avisos delante
fn respuesta(salida: &str) -> String {
    salida
        .find("SIA-")
        .map(|i| salida[i..].lines().next().unwrap_or("").trim().to_string())
        .unwrap_or_default()
}

#[cfg(windows)]
fn matar(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

#[cfg(windows)]
#[tauri::command]
async fn comprobar(estado: tauri::State<'_, EnCurso>, paso: String) -> Result<Comprobado, String> {
    use std::io::Read;
    use std::process::Stdio;
    let cli = std::env::temp_dir().join("sia-setup").join("copilot-cli.cmd");
    if paso != "certs" {
        std::fs::create_dir_all(cli.parent().unwrap()).map_err(|e| e.to_string())?;
        let contenido = match prueba("SIA_SETUP_COPILOT_CLI") {
            Some(otro) => std::fs::read_to_string(otro).map_err(|e| e.to_string())?,
            None => COPILOT_CLI.to_string(),
        };
        std::fs::write(&cli, contenido).map_err(|e| e.to_string())?;
    }
    let cli_arg = |extra: &str| format!(r#"/c call "{}"{extra}"#, cli.display());
    let mut cmd;
    match paso.as_str() {
        "certs" => {
            let p = paquete()?;
            cmd = Command::new("powershell.exe");
            cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", CERTS_PS])
                .env("SIA_CERTS", p.certs.requeridos.join("|"));
        }
        "copilot" | "copilot-install" | "session" | "login" => {
            let extra = match paso.as_str() {
                "copilot-install" => " -Install",
                "session" => " -Session",
                "login" => " -Login",
                _ => "",
            };
            cmd = Command::new("cmd.exe");
            cmd.raw_arg(cli_arg(extra));
        }
        _ => return Err(format!("Comprobación desconocida: {paso}")),
    }
    // instalar, 10 min; iniciar sesión, 5 min; lo demás, 1 min (como el NSIS)
    let max = Duration::from_secs(match paso.as_str() {
        "copilot-install" => 600,
        "login" => 300,
        _ => 60,
    })
    .min(Duration::from_secs(prueba("SIA_SETUP_MAX_S").and_then(|s| s.parse().ok()).unwrap_or(u64::MAX)));
    // el inicio de sesión, en su propia ventana y a la vista; lo demás, oculto y con su salida
    if paso == "login" {
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    } else if paso == "copilot-install" {
        // WinGet instalando sigue aunque se cierre la ventana (cortarlo deja su registro roto):
        // fuera del job de la ventana, que se lleva a sus procesos al cerrarse
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        cmd.creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB).stdout(Stdio::piped()).stderr(Stdio::null());
    } else {
        cmd.creation_flags(CREATE_NO_WINDOW).stdout(Stdio::piped()).stderr(Stdio::null());
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        // si el job no deja salir, como siempre
        Err(_) if paso == "copilot-install" => cmd.creation_flags(CREATE_NO_WINDOW).spawn().map_err(|e| e.to_string())?,
        Err(e) => return Err(e.to_string()),
    };
    *estado.0.lock().unwrap() = Some((child.id(), paso.clone()));
    let lector = child.stdout.take().map(|mut out| {
        std::thread::spawn(move || {
            let mut s = Vec::new();
            let _ = out.read_to_end(&mut s);
            String::from_utf8_lossy(&s).into_owned()
        })
    });
    let inicio = std::time::Instant::now();
    let mut tarde = false;
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if inicio.elapsed() > max {
            matar(child.id());
            let _ = child.wait();
            tarde = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    *estado.0.lock().unwrap() = None;
    let salida = lector.and_then(|h| h.join().ok()).unwrap_or_default();
    Ok(Comprobado { respuesta: if tarde { String::new() } else { respuesta(&salida) }, tarde })
}

#[cfg(not(windows))]
#[tauri::command]
async fn comprobar(_paso: String) -> Result<Comprobado, String> {
    Err("En Mac aún no comprueba.".into())
}

// Cancelar corta la comprobación en marcha, pero no a WinGet instalando: cortarlo a mitad deja
// su registro roto (8A150054). Si se cancela instalando, Copilot CLI termina de instalarse solo.
#[tauri::command]
fn cortar(estado: tauri::State<'_, EnCurso>) {
    if let Some((pid, paso)) = estado.0.lock().unwrap().take() {
        if paso != "copilot-install" {
            #[cfg(windows)]
            matar(pid);
            #[cfg(not(windows))]
            let _ = pid;
        }
    }
}

#[tauri::command]
fn abrir_guia(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("La guía no es una dirección web.".into());
    }
    let prog = if cfg!(windows) { "explorer.exe" } else { "open" };
    Command::new(prog).arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

// Si la carpeta elegida no se llama SIA, se instala en una SIA dentro de ella
#[tauri::command]
async fn elegir_carpeta(app: AppHandle, actual: String) -> Option<String> {
    let mut dlg = app.dialog().file().set_title("Carpeta de SIA");
    if let Some(parent) = Path::new(&actual).parent().filter(|p| p.exists()) {
        dlg = dlg.set_directory(parent);
    }
    let mut dir = dlg.blocking_pick_folder()?.into_path().ok()?;
    if !dir.file_name().is_some_and(|n| n.eq_ignore_ascii_case("SIA")) {
        dir.push("SIA");
    }
    Some(dir.to_string_lossy().into_owned())
}

// La carpeta temporal donde el NSIS descomprime SIA antes de copiarlo (extractAppPackage.nsh de
// electron-builder): %TEMP%\nsXXXX.tmp\7z-out, la más reciente creada desde que empezó.
#[cfg(windows)]
fn descomprimiendo(desde: std::time::SystemTime) -> Option<PathBuf> {
    let tmp = std::env::temp_dir();
    std::fs::read_dir(tmp)
        .ok()?
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("ns"))
        .filter_map(|e| {
            let out = e.path().join("7z-out");
            let creado = std::fs::metadata(&out).and_then(|m| m.created()).ok()?;
            (creado >= desde).then_some((creado, out))
        })
        .max_by_key(|(creado, _)| *creado)
        .map(|(_, out)| out)
}

// El NSIS en silencio. Al actualizar, primero desinstala la versión anterior (la carpeta se
// vacía); después descomprime SIA en su carpeta temporal y lo copia a la de destino, donde los
// últimos MB tardan (el antivirus revisa cada fichero). La barra va por fases que no vuelven
// atrás: quitando 0-15 %, preparando hasta 45 %, copiando hasta 97 % y terminando. Dentro de
// cada una, según lo que ya ocupa cada carpeta frente a lo que ocupará SIA.
#[cfg(windows)]
#[tauri::command]
async fn instalar(app: AppHandle, carpeta: String) -> Result<(), String> {
    let p = paquete()?;
    let (nsis, borrar) = nsis_listo(&p)?;
    let actualizar = instalado().is_some();
    let hecho = Arc::new(AtomicBool::new(false));
    {
        let (app, hecho, dir, total) = (app.clone(), hecho.clone(), PathBuf::from(&carpeta), p.bytes.max(1) as f64);
        let desde = std::time::SystemTime::now() - Duration::from_secs(2);
        let antes = if actualizar { tamano(&dir) as f64 } else { 0.0 };
        std::thread::spawn(move || {
            let mut temp: Option<PathBuf> = None;
            let (mut fase, mut max) = (if antes > 0.0 { 0 } else { 1 }, 0u32);
            let inicio = if antes > 0.0 { 15.0 } else { 0.0 };   // al actualizar, preparando empieza en 15 %
            // una medida por segundo y solo de la carpeta que toca: medir más a menudo compite con
            // el NSIS copiando. Entre medida y medida, la ventana avanza la barra poco a poco.
            while !hecho.load(Ordering::Relaxed) {
                if fase < 2 && temp.is_none() {
                    temp = descomprimiendo(desde);
                }
                let pct = match fase {
                    0 if temp.is_none() => 15.0 * (1.0 - (tamano(&dir) as f64 / antes).min(1.0)),
                    0 | 1 => {
                        // la carpeta temporal ya está y, entera, pasa a copiar
                        let fuera = temp.as_deref().map(tamano).unwrap_or(0) as f64 / total;
                        fase = if fuera >= 0.98 { 2 } else { 1 };
                        inicio + (45.0 - inicio) * fuera.min(1.0)
                    }
                    2 => {
                        // casi todo llega de golpe; los últimos MB, despacio: tienen su tramo
                        let dentro = tamano(&dir) as f64 / total;
                        if dentro >= 0.995 { fase = 3; }
                        if dentro < 0.93 { 45.0 + 40.0 * dentro / 0.93 } else { 85.0 + 12.0 * ((dentro - 0.93) / 0.065).min(1.0) }
                    }
                    _ => 97.0,
                } as u32;
                max = max.max(pct);
                let nombre = ["quitando", "preparando", "copiando", "terminando"][fase];
                let _ = app.emit("progreso", Progreso { pct: max, fase: nombre });
                std::thread::sleep(Duration::from_millis(1000));
            }
        });
    }
    // Al actualizar, el NSIS usa la carpeta registrada: con /D= sale con el código 2. Al instalar,
    // /D= va el último y sin comillas, aunque la ruta tenga espacios: así lo lee NSIS.
    let lanzado = nsis.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&lanzado);
        cmd.raw_arg("/S");
        if !actualizar {
            cmd.raw_arg(format!("/D={carpeta}"));
        }
        cmd.creation_flags(CREATE_NO_WINDOW).status()
    })
    .await
    .map_err(|e| e.to_string())?;
    hecho.store(true, Ordering::Relaxed);
    if borrar {
        let _ = std::fs::remove_file(&nsis);
    }
    match res {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("La instalación no ha terminado (código {}).", s.code().unwrap_or(-1))),
        Err(e) => Err(format!("No se pudo lanzar la instalación: {e}")),
    }
}

#[cfg(not(windows))]
#[tauri::command]
async fn instalar(_app: AppHandle, _carpeta: String) -> Result<(), String> {
    Err("En Mac aún no instala.".into())
}

#[tauri::command]
fn abrir_sia(carpeta: String) -> Result<(), String> {
    if cfg!(windows) {
        Command::new(Path::new(&carpeta).join("SIA.exe")).spawn().map(|_| ()).map_err(|e| e.to_string())
    } else {
        Command::new("open").arg(&carpeta).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(EnCurso::default())
        .invoke_handler(tauri::generate_handler![
            estado,
            elegir_carpeta,
            instalar,
            abrir_sia,
            comprobar,
            cortar,
            abrir_guia
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo abrir SIA Setup");
}
