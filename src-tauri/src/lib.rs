mod engine;
mod title_bar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(engine::EngineState::default())
        .invoke_handler(tauri::generate_handler![
            engine::engine_open,
            engine::engine_new,
            engine::engine_close,
            engine::engine_state,
            engine::engine_render_page,
            engine::engine_type,
            engine::engine_key,
            engine::engine_click,
            engine::engine_command,
            engine::engine_save,
            engine::engine_fonts,
            engine::startup_files,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                title_bar::apply(&window);
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
