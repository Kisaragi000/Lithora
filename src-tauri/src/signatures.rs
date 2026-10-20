//! Signatures the user drew, kept as transparent PNG pictures in the app's data folder so they
//! can be put into any document again.
use base64::Engine as _;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct Signature {
    id: String,
    /// The PNG, base64.
    data: String,
}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("signatures");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// A file name made of letters and digits only, so an id can't reach outside the folder.
fn valid(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

/// The saved signatures, newest first.
#[tauri::command]
pub fn signatures_list(app: AppHandle) -> Result<Vec<Signature>, String> {
    let dir = folder(&app)?;
    let mut files: Vec<(std::time::SystemTime, String, PathBuf)> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let id = path.file_stem()?.to_str()?.to_string();
            (path.extension()? == "png" && valid(&id)).then(|| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), id, path))
        })
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(files
        .into_iter()
        .filter_map(|(_, id, path)| {
            let bytes = std::fs::read(path).ok()?;
            Some(Signature { id, data: base64::engine::general_purpose::STANDARD.encode(bytes) })
        })
        .collect())
}

/// Keep a newly drawn signature (a PNG, base64). Returns its id.
#[tauri::command]
pub fn signature_add(app: AppHandle, data: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"\x89PNG") || bytes.len() > 8 << 20 {
        return Err("not a PNG picture".into());
    }
    let id = format!("sig{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    std::fs::write(folder(&app)?.join(format!("{id}.png")), bytes).map_err(|e| e.to_string())?;
    Ok(id)
}

/// Forget a saved signature.
#[tauri::command]
pub fn signature_delete(app: AppHandle, id: String) -> Result<(), String> {
    if !valid(&id) {
        return Err("no such signature".into());
    }
    let _ = std::fs::remove_file(folder(&app)?.join(format!("{id}.png")));
    Ok(())
}
