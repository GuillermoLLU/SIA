// El desinstalador de SIA con la ventana de SIA Setup: la misma app, compilada sin nada dentro y en
// modo desinstalar (build.rs, con SIA_SETUP_MODO=desinstalar; setup/scripts/desinstalador.mjs). El
// instalador la deja en la carpeta de SIA como «Desinstalar SIA.exe» y la registra en Windows
// (customInstall en build/installer.nsh). Por debajo usa, en silencio, el desinstalador de siempre,
// «Uninstall SIA.exe»: desinstala igual que antes.
use crate::{tamano, Progreso};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const NSIS: &str = "Uninstall SIA.exe";

// La carpeta de SIA y si se instaló por usuario o para todos (lo dice su registro en Windows)
static CARPETA: OnceLock<PathBuf> = OnceLock::new();
static AMBITO: OnceLock<&'static str> = OnceLock::new();

pub fn carpeta() -> &'static Path {
    CARPETA.get().map(PathBuf::as_path).unwrap_or(Path::new(""))
}

fn temporal() -> PathBuf {
    std::env::temp_dir().join("sia-desinstalar")
}

// Antes de abrir la ventana:
// - En silencio (/S), como lo lanza el instalador al actualizar: el desinstalador de siempre con
//   las mismas opciones, sin ventana, y sale con su código.
// - Abierto desde la carpeta de SIA («Aplicaciones instaladas»): se copia a una carpeta temporal y
//   se abre desde allí con --carpeta, para que el desinstalador pueda borrar la carpeta entera,
//   también este .exe. Es lo que hace el desinstalador de Windows consigo mismo.
pub fn antes_de_abrir() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let exe = std::env::current_exe().unwrap_or_default();
    let relanzado = args.iter().any(|a| a == "--carpeta");
    // _?=<carpeta> va el último y sin comillas (NSIS): es todo lo que sigue, aunque tenga espacios
    let (carpeta, opciones) = if let Some(i) = args.iter().position(|a| a.starts_with("_?=")) {
        (PathBuf::from(&args[i..].join(" ")[3..]), args[..i].to_vec())
    } else if let Some(i) = args.iter().position(|a| a == "--carpeta").filter(|i| i + 1 < args.len()) {
        let mut resto = args.clone();
        let c = resto.remove(i + 1);
        resto.remove(i);
        (PathBuf::from(c), resto)
    } else {
        (exe.parent().map(Path::to_path_buf).unwrap_or_default(), args.clone())
    };
    if opciones.iter().any(|a| a.eq_ignore_ascii_case("/S")) {
        let codigo = nsis(&carpeta, &opciones).unwrap_or(1);
        let _ = std::fs::remove_dir(temporal()); // solo si ha quedado vacía
        std::process::exit(codigo);
    }
    if !relanzado {
        let dir = temporal();
        let copia = dir.join("Desinstalar SIA.exe");
        let lanzado = std::fs::create_dir_all(&dir)
            .and_then(|_| std::fs::copy(&exe, &copia))
            .and_then(|_| Command::new(&copia).arg("--carpeta").arg(&carpeta).args(&opciones).spawn());
        if lanzado.is_ok() {
            std::process::exit(0);
        }
        // si no se puede copiar, desde aquí: desinstala igual y solo queda este .exe
    }
    let _ = AMBITO.set(if opciones.iter().any(|a| a.eq_ignore_ascii_case("/allusers")) { "/allusers" } else { "/currentuser" });
    let _ = CARPETA.set(carpeta);
}

// El desinstalador de siempre, copiado a la carpeta temporal y lanzado con _?=<carpeta> (el
// último y sin comillas), como lo lanza el instalador al actualizar: así no se copia él y borra la
// carpeta de SIA entera. Las opciones, tal como llegaron.
fn nsis(carpeta: &Path, opciones: &[String]) -> std::io::Result<i32> {
    let dir = temporal();
    std::fs::create_dir_all(&dir)?;
    let copia = dir.join(format!("Uninstall-{}.exe", std::process::id()));
    std::fs::copy(carpeta.join(NSIS), &copia)?;
    let mut cmd = Command::new(&copia);
    for o in opciones {
        cmd.raw_arg(o);
    }
    cmd.raw_arg(format!("_?={}", carpeta.display()));
    let r = cmd.creation_flags(CREATE_NO_WINDOW).status();
    let _ = std::fs::remove_file(&copia);
    r.map(|s| s.code().unwrap_or(1))
}

// Desde la ventana. La barra, según se vacía la carpeta: cerrando SIA (si está abierto, lo cierra
// el desinstalador), quitando hasta 97 % y terminando.
pub async fn desinstalar(app: AppHandle, abierto: bool) -> Result<(), String> {
    let carpeta = carpeta().to_path_buf();
    let antes = tamano(&carpeta).max(1) as f64;
    let hecho = Arc::new(AtomicBool::new(false));
    {
        let (app, hecho, dir) = (app.clone(), hecho.clone(), carpeta.clone());
        std::thread::spawn(move || {
            let mut max = 0u32;
            while !hecho.load(Ordering::Relaxed) {
                let quitado = 1.0 - (tamano(&dir) as f64 / antes).min(1.0);
                max = max.max((5.0 + 92.0 * quitado) as u32);
                let fase = if abierto && quitado < 0.01 { "cerrando" } else { "borrando" };
                let _ = app.emit("progreso", Progreso { pct: max, fase });
                std::thread::sleep(Duration::from_millis(1000));
            }
        });
    }
    let opciones = vec!["/S".to_string(), AMBITO.get().copied().unwrap_or("/currentuser").to_string()];
    let r = tauri::async_runtime::spawn_blocking(move || nsis(&carpeta, &opciones)).await.map_err(|e| e.to_string())?;
    hecho.store(true, Ordering::Relaxed);
    match r {
        Ok(0) => {
            // el desinstalador de siempre deja la carpeta de SIA vacía: fuera, si lo está
            let _ = std::fs::remove_dir(self::carpeta());
            Ok(())
        }
        Ok(c) => Err(format!("No se ha podido desinstalar (código {c}).")),
        Err(e) => Err(format!("No se pudo lanzar la desinstalación: {e}")),
    }
}

// Al cerrar, la copia temporal de este .exe se borra sola en cuanto acaba
pub fn al_salir() {
    if std::env::args().any(|a| a == "--carpeta") {
        let dir = temporal();
        let _ = Command::new("cmd.exe")
            .raw_arg(format!(r#"/c ping -n 3 127.0.0.1 >nul & rmdir /s /q "{}""#, dir.display()))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}
