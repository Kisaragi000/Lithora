//! Lithora's document engine, built on WordCraft's Rust crates
//! (MIT OR Apache-2.0, https://github.com/storytold/wordcraft).
//!
//! The engine opens Word, RTF and OpenDocument files, lays out their pages and draws
//! them as bitmaps. The React interface shows those bitmaps and sends typing, keys,
//! clicks and commands back here. Everything runs inside Lithora: nothing else needs
//! to be installed.

use serde::Serialize;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use wordcraft_engine::render::{RenderOptions, render_page};
use wordcraft_engine::{Region, Session};

/// The open document, if any.
#[derive(Default)]
pub struct EngineState(Mutex<Option<Session>>);

/// A page's size in points (1/72 inch).
#[derive(Serialize)]
pub struct PageSize {
    pub width: f32,
    pub height: f32,
}

/// A rectangle on one page, in points from the page's top-left corner.
#[derive(Serialize)]
pub struct Mark {
    pub page: usize,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// What the interface needs to lay out the pages and draw the cursor.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocState {
    pub pages: Vec<PageSize>,
    pub cursor: Option<Mark>,
    pub selection: Vec<Mark>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub dirty: bool,
}

/// The paper and units of the computer's region (A4 in most of the world, Letter in the US).
fn system_region() -> Region {
    Region::from_locale_vars(|name| std::env::var(name).ok(), sys_locale::get_locale)
}

fn with_session<T>(
    state: &State<EngineState>,
    f: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.0.lock().map_err(|_| "the engine stopped".to_string())?;
    let session = guard.as_mut().ok_or("no document is open")?;
    f(session)
}

fn doc_state(s: &mut Session) -> DocState {
    let layout = s.layout();
    let pages = layout
        .pages
        .iter()
        .map(|p| PageSize { width: p.w, height: p.h })
        .collect();
    let sel = s.sel_ends().clone();
    let hint = s.page_hint;
    let (cursor, selection) = if sel.is_collapsed() {
        let cursor = layout.caret_on(&sel.focus, hint).map(|c| Mark {
            page: c.page,
            x: c.x,
            y: c.top,
            width: c.width.max(0.75),
            height: c.height,
        });
        (cursor, Vec::new())
    } else {
        let (a, b) = sel.ordered();
        let rects = layout
            .selection_rects(&s.doc, &a, &b, hint)
            .into_iter()
            .map(|(page, r)| Mark { page, x: r.x, y: r.y, width: r.w, height: r.h })
            .collect();
        (None, rects)
    };
    DocState {
        pages,
        cursor,
        selection,
        can_undo: s.can_undo(),
        can_redo: s.can_redo(),
        dirty: s.dirty,
    }
}

fn run(s: &mut Session, id: &str, params: Value) -> Result<(), String> {
    s.run(id, &params).map(|_| ()).map_err(|e| e.to_string())
}

/// Open a document and return its pages.
#[tauri::command]
pub fn engine_open(state: State<EngineState>, path: String) -> Result<DocState, String> {
    let path = PathBuf::from(path);
    let (doc, _encrypted) = wordcraft_engine::io::open_path_in(&path, None, &system_region())?;
    let mut session = Session::new(doc);
    session.system_region = system_region();
    session.path = Some(path);
    let result = doc_state(&mut session);
    *state.0.lock().map_err(|_| "the engine stopped".to_string())? = Some(session);
    Ok(result)
}

/// The current pages, cursor and selection.
#[tauri::command]
pub fn engine_state(state: State<EngineState>) -> Result<DocState, String> {
    with_session(&state, |s| Ok(doc_state(s)))
}

/// Draw one page (0-based) at `scale` pixels per point. The reply is the width and
/// height as two little-endian u32s, followed by RGBA pixels.
#[tauri::command]
pub fn engine_render_page(
    state: State<EngineState>,
    page: usize,
    scale: f32,
) -> Result<tauri::ipc::Response, String> {
    with_session(&state, |s| {
        let layout = s.layout();
        let p = layout.pages.get(page).ok_or("no such page")?;
        let r = render_page(&s.doc, p, scale, &RenderOptions::default());
        let mut out = Vec::with_capacity(8 + r.pixels.len());
        out.extend_from_slice(&r.width.to_le_bytes());
        out.extend_from_slice(&r.height.to_le_bytes());
        out.extend_from_slice(&r.to_straight());
        Ok(tauri::ipc::Response::new(out))
    })
}

/// Type text at the cursor, replacing any selection.
#[tauri::command]
pub fn engine_type(state: State<EngineState>, text: String) -> Result<DocState, String> {
    with_session(&state, |s| {
        run(s, "text.insert", json!({ "text": text }))?;
        Ok(doc_state(s))
    })
}

/// Run the command bound to a key such as `Mod+B`, `Shift+Left` or `Backspace`, as
/// WordCraft's own window does. Returns `None` when no command is bound to the key.
#[tauri::command]
pub fn engine_key(state: State<EngineState>, key: String) -> Result<Option<DocState>, String> {
    with_session(&state, |s| {
        let reg = s.registry.clone();
        if let Some(spec) = s.keymap.resolve(&reg, &key) {
            run(s, spec.id, json!({}))?;
            return Ok(Some(doc_state(s)));
        }
        // Shift extends caret movement when nothing is bound to the shifted key.
        if let Some(plain) = key.strip_prefix("Shift+").map(str::to_string).or_else(|| {
            key.contains("+Shift+").then(|| key.replacen("+Shift+", "+", 1))
        }) && let Some(spec) = s.keymap.resolve(&reg, &plain)
        {
            let params = if spec.id.starts_with("caret.") {
                Some(json!({ "extend": true }))
            } else if spec.id == "text.backspace" {
                Some(json!({}))
            } else {
                None
            };
            if let Some(params) = params {
                run(s, spec.id, params)?;
                return Ok(Some(doc_state(s)));
            }
        }
        Ok(None)
    })
}

/// Put the cursor at a point on a page (0-based page, points from its top-left).
/// With `extend`, the selection grows to that point instead.
#[tauri::command]
pub fn engine_click(
    state: State<EngineState>,
    page: usize,
    x: f32,
    y: f32,
    extend: bool,
) -> Result<DocState, String> {
    with_session(&state, |s| {
        if extend {
            let layout = s.layout();
            let story = s.story();
            if let Some(pos) = layout.hit(page, x, y, story) {
                run(s, "caret.set", json!({ "pos": pos, "extend": true }))?;
            }
        } else {
            // A click beside the text (in a margin) is not an error: the cursor stays put.
            let _ = run(s, "caret.set", json!({ "page": page, "x": x, "y": y }));
        }
        Ok(doc_state(s))
    })
}

/// Run an engine command by id, such as `format.bold` or `edit.undo`.
#[tauri::command]
pub fn engine_command(
    state: State<EngineState>,
    command: String,
    params: Option<Value>,
) -> Result<DocState, String> {
    with_session(&state, |s| {
        run(s, &command, params.unwrap_or_else(|| json!({})))?;
        Ok(doc_state(s))
    })
}

/// Save the document. The format follows the file's extension: docx, doc, rtf, odt,
/// pdf, html, md, txt and more.
#[tauri::command]
pub fn engine_save_as(state: State<EngineState>, path: String) -> Result<DocState, String> {
    with_session(&state, |s| {
        run(s, "file.saveAs", json!({ "path": path }))?;
        Ok(doc_state(s))
    })
}

/// The document passed on the command line (`lithora report.docx`), if any.
#[tauri::command]
pub fn startup_file() -> Option<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|p| p.is_file())
        .map(|p| {
            std::path::absolute(&p)
                .unwrap_or(p)
                .to_string_lossy()
                .into_owned()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(s: &Session) -> String {
        let bytes = wordcraft_engine::io::save_bytes("out.txt", &s.doc).unwrap();
        String::from_utf8_lossy(&bytes).trim().to_string()
    }

    fn session_for(name: &str, body: &str) -> Session {
        let dir = std::env::temp_dir().join(format!("lithora-test-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        let (doc, _) = wordcraft_engine::io::open_path_in(&path, None, &Region::default()).unwrap();
        Session::new(doc)
    }

    #[test]
    fn opens_rtf_with_armenian_and_russian_text() {
        let mut s = session_for(
            "a.rtf",
            r"{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}\f0 \u1344?\u1377?\u1397? \u1055?\u1088?\u1080?\par}",
        );
        assert_eq!(text(&s), "Հայ При");
        let st = doc_state(&mut s);
        assert_eq!(st.pages.len(), 1);
        assert!(st.cursor.is_some());
    }

    #[test]
    fn typing_and_keys_edit_the_document() {
        let mut s = session_for("b.txt", "world");
        run(&mut s, "text.insert", json!({ "text": "Բարև " })).unwrap();
        assert_eq!(text(&s), "Բարև world");
        let reg = s.registry.clone();
        let spec = s.keymap.resolve(&reg, "Backspace").unwrap();
        assert_eq!(spec.id.to_string(), "text.backspace");
    }

    #[test]
    fn saves_docx_rtf_and_pdf_that_reopen() {
        let mut s = session_for("d.txt", "Բարև Привет");
        let dir = std::env::temp_dir().join(format!("lithora-test-{}-save", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for ext in ["docx", "rtf", "odt"] {
            let out = dir.join(format!("out.{ext}"));
            run(&mut s, "file.saveAs", json!({ "path": out.to_string_lossy() })).unwrap();
            let (doc, _) = wordcraft_engine::io::open_path_in(&out, None, &Region::default()).unwrap();
            assert_eq!(text(&Session::new(doc)), "Բարև Привет", "{ext} round trip");
        }
        let pdf = dir.join("out.pdf");
        run(&mut s, "file.saveAs", json!({ "path": pdf.to_string_lossy() })).unwrap();
        assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
    }

    #[test]
    fn renders_a_page_to_pixels() {
        let mut s = session_for("c.txt", "Lithora");
        let layout = s.layout();
        let r = render_page(&s.doc, &layout.pages[0], 0.5, &RenderOptions::default());
        assert_eq!(r.pixels.len(), (r.width * r.height * 4) as usize);
    }
}
