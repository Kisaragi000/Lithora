//! Printing: the engine draws the pages as a print-ready PDF, and the system's spooler (CUPS on
//! Linux, the Windows print API on Windows) sends it to the printer. WordCraft's craft-print
//! crate does the spooler part.
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

use crate::engine::EngineState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    name: String,
    default: bool,
    /// Whether the printer can print on both sides; null when the system doesn't say.
    two_sided: Option<bool>,
}

/// The printers the computer knows, the default one marked.
#[tauri::command]
pub async fn print_printers() -> Vec<PrinterInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        craft_print::printers()
            .into_iter()
            .map(|p| PrinterInfo { name: p.name, default: p.default, two_sided: p.two_sided })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintOptions {
    /// None: the system's default printer.
    printer: Option<String>,
    copies: u32,
    collate: bool,
    /// "all", "current", "selection" or "custom" (with `pages`).
    range: String,
    pages: Option<String>,
    /// "printerDefault", "off", "longEdge" or "shortEdge".
    duplex: String,
    grayscale: bool,
    /// The page the cursor is on, for range "current".
    current_page: Option<usize>,
}

/// Print a document. Returns the spooler's message (CUPS names the job).
#[tauri::command]
pub async fn engine_print(state: State<'_, EngineState>, doc: u32, options: PrintOptions) -> Result<String, String> {
    let dir = std::env::temp_dir().join(format!("lithora-print-{}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("job-{doc}-{}.pdf", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)));
    let title;
    {
        let mut docs = state.lock()?;
        let s = docs.sessions.get_mut(&doc).ok_or("that document is closed")?;
        if let Some(page) = options.current_page {
            s.page_hint = page;
        }
        let mut params = json!({ "path": file.to_string_lossy(), "range": options.range });
        if let Some(pages) = options.pages.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
            params["pages"] = json!(pages);
            params["range"] = json!("custom");
        }
        s.run("file.printPdf", &params).map_err(|e| e.to_string())?;
        title = s
            .path
            .as_ref()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned())
            .or_else(|| s.file_name.clone())
            .unwrap_or_else(|| "Lithora document".into());
    }
    let pdf = std::fs::read(&file).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&file);
    let pdf = pdf?;
    let job = craft_print::Job {
        printer: options.printer.filter(|p| !p.is_empty()),
        copies: options.copies.clamp(1, 999),
        collate: options.collate,
        duplex: match options.duplex.as_str() {
            "off" => Some(craft_print::Duplex::Off),
            "longEdge" => Some(craft_print::Duplex::LongEdge),
            "shortEdge" => Some(craft_print::Duplex::ShortEdge),
            _ => None,
        },
        scaling: craft_print::Scaling::ShrinkToFit,
        grayscale: options.grayscale,
        title,
        options: Vec::new(),
    };
    tauri::async_runtime::spawn_blocking(move || craft_print::submit(&pdf, &job).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
