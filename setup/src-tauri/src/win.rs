// Windows: el instalador NSIS de SIA de siempre, en silencio, con la carpeta elegida. Así se
// conservan la desinstalación, la entrada en «Aplicaciones instaladas» y la actualización rápida
// (build/installer.nsh). Las comprobaciones, las mismas que su página «Comprobaciones previas».
use crate::{tamano, Instalado, Paquete, Progreso};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

pub const SISTEMA: &str = "win";
pub const CARPETA_APP: &str = "SIA";
// La guía de WinGet: lo normal es que esté y solo haya que activarlo
pub const GUIA_GESTOR: &str = "https://learn.microsoft.com/es-es/windows/package-manager/winget/#install-winget";

#[cfg(embebido)]
const NSIS: &[u8] = include_bytes!("../payload/sia-nsis.exe");

// La comprobación de certificados: lee los almacenes de Windows con .NET (sin la unidad Cert:,
// que no existe si se abre desde PowerShell 7). Los nombres llegan en SIA_CERTS, separados por |.
// Responde SIA-OK, SIA-FALTAN:<los que faltan o han caducado> o SIA-ERROR.
const CERTS_PS: &str = "try { $all=@(); foreach($l in 'CurrentUser','LocalMachine'){ foreach($n in 'Root','CertificateAuthority'){ $st=New-Object System.Security.Cryptography.X509Certificates.X509Store($n,$l); $st.Open('ReadOnly'); $all+=$st.Certificates; $st.Close() } }; $now=[DateTime]::Now; $m=@(); foreach($n in $env:SIA_CERTS.Split('|')){ $ok=$false; foreach($c in $all){ if($c.NotAfter -gt $now -and $c.Subject -match ('(^|, )CN=' + [regex]::Escape($n) + '(,|$)')){ $ok=$true } }; if(-not $ok){ $m+=$n } }; if($m.Count){ 'SIA-FALTAN:' + ($m -join ', ') } else { 'SIA-OK' } } catch { 'SIA-ERROR' }";

pub const COPILOT_CLI: &str = include_str!("../../../build/copilot-cli.cmd");
pub const COPILOT_CLI_NOMBRE: &str = "copilot-cli.cmd";

// SIA instalado, por usuario o para todos. El NSIS lo registra en las aplicaciones de Windows como
// «SIA <versión>» bajo su GUID, y la carpeta la guarda en Software\<GUID> (la misma que lee
// customInit en build/installer.nsh).
pub fn instalado() -> Option<Instalado> {
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

pub fn sia_abierto() -> bool {
    Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq SIA.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("SIA.exe"))
        .unwrap_or(false)
}

pub fn carpeta_propuesta() -> String {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_default();
    format!(r"{base}\Programs\SIA")
}

// Del registro, no de «ver»: su salida va en la codificación de la consola
pub fn sistema_operativo() -> String {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    let Ok(k) = winreg::RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") else {
        return "Windows".into();
    };
    let build: String = k.get_value("CurrentBuild").unwrap_or_default();
    let version: String = k.get_value("DisplayVersion").unwrap_or_default();
    // desde la compilación 22000 es Windows 11, aunque ProductName siga diciendo 10
    let nombre = if build.parse::<u32>().unwrap_or(0) >= 22000 { "Windows 11" } else { "Windows 10" };
    format!("{nombre} {version} (compilación {build})")
}

pub fn carpeta_registros() -> PathBuf {
    PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("SIA Setup").join("registros")
}

// La orden de cada comprobación: los certificados con PowerShell; Copilot CLI y su sesión con
// copilot-cli.cmd. El inicio de sesión, en su propia ventana y a la vista; WinGet instalando, fuera
// del job de la ventana, para que siga aunque se cierre (cortarlo deja su registro roto).
pub fn orden(paso: &str, cli: &Path, certs: &[String]) -> Command {
    if paso == "certs" {
        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", CERTS_PS])
            .env("SIA_CERTS", certs.join("|"))
            .creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    let extra = match paso {
        "copilot-install" => " -Install",
        "session" => " -Session",
        "login" => " -Login",
        _ => "",
    };
    let mut cmd = Command::new("cmd.exe");
    cmd.raw_arg(format!(r#"/c call "{}"{extra}"#, cli.display()));
    cmd.creation_flags(match paso {
        "login" => CREATE_NEW_CONSOLE,
        "copilot-install" => CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB,
        _ => CREATE_NO_WINDOW,
    });
    cmd
}

// Si el job de la ventana no deja salir de él, WinGet se lanza como lo demás
pub fn lanzar(mut cmd: Command, paso: &str) -> std::io::Result<std::process::Child> {
    if paso != "login" {
        cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    }
    match cmd.spawn() {
        Err(_) if paso == "copilot-install" => cmd.creation_flags(CREATE_NO_WINDOW).spawn(),
        r => r,
    }
}

pub fn matar(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

// El NSIS, listo para lanzar: el que va dentro del .exe se escribe en una carpeta temporal (y se
// borra al acabar, con `borrar` a true)
fn nsis_listo(p: &Paquete) -> Result<(PathBuf, bool), String> {
    if let Some(dir) = crate::prueba("SIA_SETUP_PAYLOAD") {
        let nsis = Path::new(&dir).join(&p.archivo);
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
    Err(crate::SIN_PAQUETE.into())
}

// La carpeta temporal donde el NSIS descomprime SIA antes de copiarlo (extractAppPackage.nsh de
// electron-builder): %TEMP%\nsXXXX.tmp\7z-out, la más reciente creada desde que empezó.
fn descomprimiendo(desde: std::time::SystemTime) -> Option<PathBuf> {
    std::fs::read_dir(std::env::temp_dir())
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
// cada una, según lo que ya ocupa cada carpeta frente a lo que ocupará SIA. Devuelve el código del
// NSIS.
pub async fn instalar(app: AppHandle, p: Paquete, carpeta: String, actualizar: bool) -> Result<i32, String> {
    let (nsis, borrar) = nsis_listo(&p)?;
    let hecho = Arc::new(AtomicBool::new(false));
    {
        let (app, hecho, dir, total) = (app.clone(), hecho.clone(), PathBuf::from(&carpeta), p.bytes.max(1) as f64);
        let desde = std::time::SystemTime::now() - Duration::from_secs(2);
        let antes = if actualizar { tamano(&dir) as f64 } else { 0.0 };
        std::thread::spawn(move || {
            let mut temp: Option<PathBuf> = None;
            let (mut fase, mut max) = (if antes > 0.0 { 0 } else { 1 }, 0u32);
            let inicio = if antes > 0.0 { 15.0 } else { 0.0 }; // al actualizar, preparando empieza en 15 %
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
                        if dentro >= 0.995 {
                            fase = 3;
                        }
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
    // "/D=…" va el último y entre comillas: electron-builder vuelve a leerlo con
    // StdUtils.GetParameter (multiUser.nsh), que sin comillas corta la ruta en el primer espacio.
    let lanzado = nsis.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&lanzado);
        cmd.raw_arg("/S");
        if !actualizar {
            cmd.raw_arg(format!("\"/D={carpeta}\""));
        }
        cmd.creation_flags(CREATE_NO_WINDOW).status()
    })
    .await
    .map_err(|e| e.to_string())?;
    hecho.store(true, Ordering::Relaxed);
    if borrar {
        let _ = std::fs::remove_file(&nsis);
    }
    let codigo = res.map_err(|e| format!("No se pudo lanzar la instalación: {e}"))?.code().unwrap_or(-1);
    if codigo == 0 { Ok(0) } else { Err(format!("La instalación no ha terminado (código {codigo}).")) }
}

pub fn abrir_sia(carpeta: &str) -> std::io::Result<()> {
    Command::new(Path::new(carpeta).join("SIA.exe")).spawn().map(|_| ())
}

pub fn abrir_fichero(ruta: &Path) -> std::io::Result<()> {
    Command::new("notepad.exe").arg(ruta).spawn().map(|_| ())
}

pub fn abrir_url(url: &str) -> std::io::Result<()> {
    Command::new("explorer.exe").arg(url).spawn().map(|_| ())
}
