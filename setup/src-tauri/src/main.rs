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

// Lo que se instala: el NSIS de SIA y lo que ocupa SIA instalado, para la barra de progreso.
// Va en payload/ junto al .exe (o donde diga SIA_SETUP_PAYLOAD, para probar).
#[derive(Deserialize)]
struct Paquete {
    version: String,
    bytes: u64,
    nsis: String,
}

fn payload_dir() -> PathBuf {
    if let Ok(d) = std::env::var("SIA_SETUP_PAYLOAD") {
        return PathBuf::from(d);
    }
    let exe = std::env::current_exe().unwrap_or_default();
    exe.parent().map(|p| p.join("payload")).unwrap_or_default()
}

fn paquete() -> Result<(Paquete, PathBuf), String> {
    let dir = payload_dir();
    let json = std::fs::read_to_string(dir.join("paquete.json"))
        .map_err(|_| "No se encuentra lo que hay que instalar.".to_string())?;
    let p: Paquete = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let nsis = dir.join(&p.nsis);
    Ok((p, nsis))
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
    let (p, _) = paquete()?;
    Ok(Estado {
        sistema: if cfg!(target_os = "macos") { "mac" } else { "win" },
        version: p.version,
        bytes: p.bytes,
        instalado: instalado(),
        abierto: sia_abierto(),
        carpeta: carpeta_propuesta(),
    })
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

// El NSIS en silencio. Primero descomprime SIA en su carpeta temporal y luego lo copia a la de
// destino: cada fase es la mitad de la barra, según lo que ya ocupa frente a lo que ocupará SIA.
#[cfg(windows)]
#[tauri::command]
async fn instalar(app: AppHandle, carpeta: String) -> Result<(), String> {
    let (p, nsis) = paquete()?;
    if !nsis.exists() {
        return Err("No se encuentra el instalador de SIA.".into());
    }
    let hecho = Arc::new(AtomicBool::new(false));
    {
        let (app, hecho, dir, total) = (app.clone(), hecho.clone(), PathBuf::from(&carpeta), p.bytes.max(1) as f64);
        let desde = std::time::SystemTime::now() - Duration::from_secs(2);
        std::thread::spawn(move || {
            let mut temp: Option<PathBuf> = None;
            while !hecho.load(Ordering::Relaxed) {
                if temp.is_none() {
                    temp = descomprimiendo(desde);
                }
                let fuera = temp.as_deref().map(tamano).unwrap_or(0) as f64 / total;
                // al actualizar, la carpeta de destino tiene la versión anterior hasta que se
                // desinstala: solo cuenta cuando ya está todo descomprimido
                let copiado = if fuera >= 0.98 { tamano(&dir) as f64 / total } else { 0.0 };
                let pct = (50.0 * fuera.min(1.0) + 49.0 * copiado.min(1.0)) as u32;
                let fase = match pct {
                    0..=49 => "preparando",
                    50..=97 => "copiando",
                    _ => "terminando",
                };
                let _ = app.emit("progreso", Progreso { pct, fase });
                std::thread::sleep(Duration::from_millis(300));
            }
        });
    }
    // Al actualizar, el NSIS usa la carpeta registrada: con /D= sale con el código 2. Al instalar,
    // /D= va el último y sin comillas, aunque la ruta tenga espacios: así lo lee NSIS.
    let actualizar = instalado().is_some();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&nsis);
        cmd.raw_arg("/S");
        if !actualizar {
            cmd.raw_arg(format!("/D={carpeta}"));
        }
        cmd.creation_flags(CREATE_NO_WINDOW).status()
    })
    .await
    .map_err(|e| e.to_string())?;
    hecho.store(true, Ordering::Relaxed);
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
        .invoke_handler(tauri::generate_handler![estado, elegir_carpeta, instalar, abrir_sia])
        .run(tauri::generate_context!())
        .expect("no se pudo abrir SIA Setup");
}
