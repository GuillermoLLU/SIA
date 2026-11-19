// Si setup/scripts/empaquetar.mjs ha dejado lo que se instala en payload/, va dentro del .exe
// (cfg `embebido`, en src/main.rs). Sin él, en desarrollo, se lee de SIA_SETUP_PAYLOAD.
use std::path::Path;

fn main() {
    println!("cargo::rustc-check-cfg=cfg(embebido)");
    println!("cargo:rerun-if-changed=payload");
    if Path::new("payload/paquete.json").exists() && Path::new("payload/sia-nsis.exe").exists() {
        println!("cargo:rustc-cfg=embebido");
    }
    tauri_build::build()
}
