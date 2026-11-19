// SIA Setup: la ventana del instalador. De momento solo muestra la maqueta (#143).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("no se pudo abrir SIA Setup");
}
