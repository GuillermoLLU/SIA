// Si setup/scripts/empaquetar.mjs ha dejado lo que se instala en payload/ (el NSIS de SIA para
// Windows, SIA.app comprimido para Mac), va dentro del ejecutable (cfg `embebido`). Sin él, en
// desarrollo, se lee de SIA_SETUP_PAYLOAD. Con SIA_SETUP_MODO=desinstalar sale «Desinstalar
// SIA.exe» (cfg `desinstalador`), sin nada dentro (setup/scripts/desinstalador.mjs).
use std::path::Path;

fn main() {
    println!("cargo::rustc-check-cfg=cfg(embebido)");
    println!("cargo::rustc-check-cfg=cfg(desinstalador)");
    println!("cargo:rerun-if-changed=payload");
    println!("cargo:rerun-if-env-changed=SIA_SETUP_MODO");
    if std::env::var("SIA_SETUP_MODO").as_deref() == Ok("desinstalar") {
        println!("cargo:rustc-cfg=desinstalador");
    } else {
        let archivo = match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
            Ok("macos") => "payload/sia-app.zip",
            _ => "payload/sia-nsis.exe",
        };
        if Path::new("payload/paquete.json").exists() && Path::new(archivo).exists() {
            println!("cargo:rustc-cfg=embebido");
        }
    }
    tauri_build::build()
}
