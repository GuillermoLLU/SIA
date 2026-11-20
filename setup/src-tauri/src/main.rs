// SIA Setup: la ventana del instalador (ui/) y lo que hace por debajo, igual en los dos sistemas
// salvo lo propio de cada uno: win.rs (el NSIS de SIA en silencio) y mac.rs (SIA.app en
// Aplicaciones). Cada paso queda en un registro, para pasárselo a un técnico si algo falla.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
mod mac;
#[cfg(target_os = "macos")]
use mac as so;
#[cfg(windows)]
mod win;
#[cfg(windows)]
use win as so;

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

// Lo que se instala (el NSIS de SIA en Windows, SIA.app comprimido en Mac) y lo que ocupa SIA
// instalado, para la barra de progreso, más los certificados que hay que comprobar y su guía (de
// sia-instance.json, como el NSIS). Va dentro del .exe: setup/scripts/empaquetar.mjs lo deja en
// src-tauri/payload/ antes de compilar y build.rs activa `embebido`.
#[cfg(embebido)]
const PAQUETE: &str = include_str!("../payload/paquete.json");
const SIN_PAQUETE: &str = "No se encuentra lo que hay que instalar.";

// Solo en las compilaciones de desarrollo, para probar: otro paquete (SIA_SETUP_PAYLOAD, una
// carpeta con paquete.json y lo que instala), otro copilot-cli (SIA_SETUP_COPILOT_CLI) o un tiempo
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
    #[serde(alias = "nsis")]
    archivo: String,
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
    guia_gestor: &'static str,
}

#[derive(Serialize, Clone)]
struct Progreso {
    pct: u32,
    fase: &'static str,
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

// ── El registro de la instalación ────────────────────────────────────────────────────────────
// Un fichero por cada vez que se abre SIA Setup (en Windows, %LOCALAPPDATA%\SIA Setup\registros;
// en Mac, ~/Library/Logs/SIA Setup), con cada paso, lo que respondió y cuánto tardó. No guarda
// tokens: las comprobaciones no los leen.
#[derive(Default)]
struct Registro(Mutex<Option<(PathBuf, std::fs::File)>>);

impl Registro {
    fn anotar(&self, texto: &str) {
        let mut abierto = self.0.lock().unwrap();
        if abierto.is_none() {
            let dir = so::carpeta_registros();
            limpiar(&dir);
            let ruta = dir.join(format!("instalacion-{}.log", chrono::Local::now().format("%Y%m%d-%H%M%S")));
            if let Ok(f) = std::fs::create_dir_all(&dir).and_then(|_| std::fs::File::create(&ruta)) {
                *abierto = Some((ruta, f));
            }
        }
        if let Some((_, f)) = abierto.as_mut() {
            let hora = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            for (i, linea) in texto.lines().enumerate() {
                let _ = writeln!(f, "{}{linea}", if i == 0 { format!("[{hora}] ") } else { "    ".into() });
            }
        }
    }

    fn ruta(&self) -> Option<PathBuf> {
        self.0.lock().unwrap().as_ref().map(|(r, _)| r.clone())
    }
}

// Se guardan los 20 últimos registros: los nombres llevan la fecha, así que ordenan solos
fn limpiar(dir: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut viejos: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "log")).collect();
    viejos.sort();
    let sobran = viejos.len().saturating_sub(19);
    for p in viejos.into_iter().take(sobran) {
        let _ = std::fs::remove_file(p);
    }
}

#[tauri::command]
fn estado(registro: tauri::State<'_, Registro>) -> Result<Estado, String> {
    let p = paquete()?;
    let instalado = so::instalado();
    let abierto = so::sia_abierto();
    registro.anotar(&format!(
        "SIA Setup {} · SIA {} · {}\n{}{}",
        env!("CARGO_PKG_VERSION"),
        p.version,
        so::sistema_operativo(),
        match &instalado {
            Some(i) => format!("Actualización desde la {} en {}", i.version, i.carpeta),
            None => "Primera instalación".into(),
        },
        if abierto { " · SIA abierto" } else { "" },
    ));
    Ok(Estado {
        sistema: so::SISTEMA,
        version: p.version,
        bytes: p.bytes,
        instalado,
        abierto,
        carpeta: so::carpeta_propuesta(),
        certs: p.certs,
        guia_gestor: so::GUIA_GESTOR,
    })
}

// Lo que la ventana quiere que conste: los avisos que enseña y lo que decide la persona
#[tauri::command]
fn anotar(registro: tauri::State<'_, Registro>, texto: String) {
    registro.anotar(&texto);
}

#[tauri::command]
fn abrir_registro(registro: tauri::State<'_, Registro>) -> Result<(), String> {
    let ruta = registro.ruta().ok_or("Aún no hay registro.")?;
    so::abrir_fichero(&ruta).map_err(|e| e.to_string())
}

// ── Comprobaciones previas: las mismas que el NSIS (build/installer.nsh) ─────────────────────
// Cada una contesta una línea «SIA-…» que la ventana interpreta. copilot-cli (.cmd en Windows,
// .sh en Mac) va dentro del .exe y se escribe en una carpeta temporal.

// La comprobación en marcha (su proceso y su paso), para poder cortarla al cancelar
#[derive(Default)]
struct EnCurso(Mutex<Option<(u32, String)>>);

#[derive(Serialize)]
struct Comprobado {
    respuesta: String, // la línea «SIA-…», o "" si no la hubo
    tarde: bool,       // se pasó de su tiempo y se cortó
}

// La respuesta «SIA-…»: desde «SIA-» hasta el final de su línea, que puede traer avisos delante
fn respuesta(salida: &str) -> String {
    salida.find("SIA-").map(|i| salida[i..].lines().next().unwrap_or("").trim().to_string()).unwrap_or_default()
}

fn copilot_cli() -> Result<PathBuf, String> {
    let cli = std::env::temp_dir().join("sia-setup").join(so::COPILOT_CLI_NOMBRE);
    std::fs::create_dir_all(cli.parent().unwrap()).map_err(|e| e.to_string())?;
    let contenido = match prueba("SIA_SETUP_COPILOT_CLI") {
        Some(otro) => std::fs::read_to_string(otro).map_err(|e| e.to_string())?,
        None => so::COPILOT_CLI.to_string(),
    };
    std::fs::write(&cli, contenido).map_err(|e| e.to_string())?;
    Ok(cli)
}

#[tauri::command]
async fn comprobar(estado: tauri::State<'_, EnCurso>, registro: tauri::State<'_, Registro>, paso: String) -> Result<Comprobado, String> {
    use std::io::Read;
    if !matches!(paso.as_str(), "certs" | "copilot" | "copilot-install" | "session" | "login") {
        return Err(format!("Comprobación desconocida: {paso}"));
    }
    let p = paquete()?;
    let cli = copilot_cli()?;
    // instalar, 10 min; iniciar sesión, 5 min; lo demás, 1 min (como el NSIS)
    let max = Duration::from_secs(match paso.as_str() {
        "copilot-install" => 600,
        "login" => 300,
        _ => 60,
    })
    .min(Duration::from_secs(prueba("SIA_SETUP_MAX_S").and_then(|s| s.parse().ok()).unwrap_or(u64::MAX)));
    let inicio = Instant::now();
    let fin = |r: Comprobado, salida: &str| {
        let mut texto = format!(
            "{paso} → «{}» en {:.1} s{}",
            r.respuesta,
            inicio.elapsed().as_secs_f32(),
            if r.tarde { ", cortada por tiempo" } else { "" }
        );
        // la salida, si no es solo su respuesta: lo que más le sirve a un técnico
        let resto = salida.trim();
        if !resto.is_empty() && resto != r.respuesta {
            texto.push('\n');
            texto.push_str(&resto.chars().take(4000).collect::<String>());
        }
        registro.anotar(&texto);
        Ok(r)
    };

    #[cfg(target_os = "macos")]
    if paso == "login" {
        *estado.0.lock().unwrap() = Some((0, paso.clone()));
        let (respuesta, tarde) = mac::login(&cli, max, || estado.0.lock().unwrap().is_some()).await;
        *estado.0.lock().unwrap() = None;
        return fin(Comprobado { respuesta, tarde }, "");
    }

    let mut child = so::lanzar(so::orden(&paso, &cli, &p.certs.requeridos), &paso).map_err(|e| e.to_string())?;
    *estado.0.lock().unwrap() = Some((child.id(), paso.clone()));
    let lector = child.stdout.take().map(|mut out| {
        std::thread::spawn(move || {
            let mut s = Vec::new();
            let _ = out.read_to_end(&mut s);
            String::from_utf8_lossy(&s).into_owned()
        })
    });
    let mut tarde = false;
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if inicio.elapsed() > max {
            so::matar(child.id());
            let _ = child.wait();
            tarde = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    *estado.0.lock().unwrap() = None;
    let salida = lector.and_then(|h| h.join().ok()).unwrap_or_default();
    fin(Comprobado { respuesta: if tarde { String::new() } else { respuesta(&salida) }, tarde }, &salida)
}

// Cancelar corta la comprobación en marcha, pero no la instalación de Copilot CLI: cortar WinGet a
// mitad deja su registro roto (8A150054). Si se cancela instalando, termina de instalarse solo.
#[tauri::command]
fn cortar(estado: tauri::State<'_, EnCurso>, registro: tauri::State<'_, Registro>) {
    if let Some((pid, paso)) = estado.0.lock().unwrap().take() {
        registro.anotar(&format!("Se cierra con «{paso}» en marcha"));
        if paso != "copilot-install" && pid != 0 {
            so::matar(pid);
        }
    }
}

#[tauri::command]
fn abrir_guia(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("La guía no es una dirección web.".into());
    }
    so::abrir_url(&url).map_err(|e| e.to_string())
}

// Si la carpeta elegida no se llama SIA (SIA.app en Mac), se instala dentro de ella
#[tauri::command]
async fn elegir_carpeta(app: AppHandle, actual: String) -> Option<String> {
    let mut dlg = app.dialog().file().set_title("Carpeta de SIA");
    if let Some(parent) = Path::new(&actual).parent().filter(|p| p.exists()) {
        dlg = dlg.set_directory(parent);
    }
    let mut dir = dlg.blocking_pick_folder()?.into_path().ok()?;
    if !dir.file_name().is_some_and(|n| n.eq_ignore_ascii_case(so::CARPETA_APP)) {
        dir.push(so::CARPETA_APP);
    }
    Some(dir.to_string_lossy().into_owned())
}

#[tauri::command]
async fn instalar(app: AppHandle, registro: tauri::State<'_, Registro>, carpeta: String) -> Result<(), String> {
    let p = paquete()?;
    let actualizar = so::instalado().is_some();
    registro.anotar(&format!("{} SIA {} en {carpeta}", if actualizar { "Actualizando" } else { "Instalando" }, p.version));
    let inicio = Instant::now();
    let res = so::instalar(app, p, carpeta, actualizar).await;
    registro.anotar(&match &res {
        Ok(_) => format!("Instalado en {:.1} s", inicio.elapsed().as_secs_f32()),
        Err(e) => format!("Error al instalar, a los {:.1} s: {e}", inicio.elapsed().as_secs_f32()),
    });
    res.map(|_| ())
}

#[tauri::command]
fn abrir_sia(registro: tauri::State<'_, Registro>, carpeta: String) -> Result<(), String> {
    registro.anotar("Se abre SIA");
    so::abrir_sia(&carpeta).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(EnCurso::default())
        .manage(Registro::default())
        .invoke_handler(tauri::generate_handler![
            estado,
            anotar,
            abrir_registro,
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
