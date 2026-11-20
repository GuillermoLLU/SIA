// Si setup/scripts/empaquetar.mjs ha dejado lo que se instala en payload/ (el NSIS de SIA para
// Windows, SIA.app comprimido para Mac), va dentro del ejecutable (cfg `embebido`). Sin él, en
// desarrollo, se lee de SIA_SETUP_PAYLOAD.
use std::path::Path;

fn main() {
    println!("cargo::rustc-check-cfg=cfg(embebido)");
    println!("cargo:rerun-if-changed=payload");
    let archivo = match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("macos") => "payload/sia-app.zip",
        _ => "payload/sia-nsis.exe",
    };
    if Path::new("payload/paquete.json").exists() && Path::new(archivo).exists() {
        println!("cargo:rustc-cfg=embebido");
    }
    tauri_build::build()
}
