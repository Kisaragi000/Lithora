mod engine;
mod print;
mod proofread;
mod recovery;
mod signatures;
mod title_bar;
mod updater;
mod window_layout;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // One Lithora at a time: opening a file while Lithora runs sends it to the open window,
        // which shows it in a new tab.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = engine::files_from_args(args.into_iter().skip(1), std::path::Path::new(&cwd));
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(window_layout::plugin())
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
            engine::engine_double_click,
            engine::engine_command,
            engine::engine_save,
            engine::engine_fonts,
            engine::startup_files,
            proofread::engine_proofread,
            proofread::engine_proofread_fix,
            print::print_printers,
            print::engine_print,
            recovery::recovery_list,
            recovery::recovery_open,
            recovery::recovery_discard,
            recovery::recovery_set_interval,
            signatures::signatures_list,
            signatures::signature_add,
            signatures::signature_delete,
            updater::check_update,
            updater::install_update,
            updater::open_releases_page,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                title_bar::apply(&window);
                window_layout::restore(&window);
            }
            setup_engine(app.handle());
            proofread::warm_up();
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

/// Point the engine at Lithora's spelling dictionaries, the custom dictionary and the
/// AutoRecover folder, and start keeping recovery copies.
fn setup_engine(app: &tauri::AppHandle) {
    // The Russian and Armenian dictionaries ship with Lithora (src-tauri/dictionaries).
    let bundled = app.path().resource_dir().ok().map(|d| d.join("dictionaries")).filter(|d| d.is_dir());
    let dev = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("dictionaries");
    let dictionaries = bundled.or_else(|| (cfg!(debug_assertions) && dev.is_dir()).then_some(dev));
    wordcraft_engine::proof::set_dictionaries_folder(dictionaries);
    // Read the big dictionaries now, so the first Russian or Armenian word typed doesn't wait.
    std::thread::spawn(|| {
        wordcraft_engine::proof::hy::has_dictionary();
        wordcraft_engine::proof::is_correct_in("привет", wordcraft_engine::proof::ProofLang::Ru);
    });
    if let Ok(data) = app.path().app_data_dir() {
        let user_dict = data.join("custom-dictionary.txt");
        let _ = std::fs::create_dir_all(&data);
        wordcraft_engine::proof::load_user_dictionary(&user_dict);
        let recovery_dir = data.join("recovery");
        let _ = std::fs::create_dir_all(&recovery_dir);
        if let Ok(mut docs) = app.state::<engine::EngineState>().lock() {
            docs.user_dict = Some(user_dict);
            docs.recovery_dir = Some(recovery_dir);
        }
    }
    recovery::start(app.clone());
}
