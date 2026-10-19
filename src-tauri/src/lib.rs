mod engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine::EngineState::default())
        .invoke_handler(tauri::generate_handler![
            engine::engine_open,
            engine::engine_render_page,
            engine::engine_key,
            engine::engine_click,
            engine::engine_command,
            engine::engine_save_as,
            engine::startup_file,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Close the document so LibreOffice removes its lock file.
                use tauri::Manager;
                app.state::<engine::EngineState>().close();
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        });
}
