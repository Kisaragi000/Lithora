//! Lithora's document engine, built on WordCraft's Rust crates
//! (MIT OR Apache-2.0, https://github.com/storytold/wordcraft).
//!
//! The engine opens Word, RTF and OpenDocument files, lays out their pages and draws
//! them as bitmaps. The React interface shows those bitmaps and sends typing, keys,
//! clicks and commands back here. Everything runs inside Lithora: nothing else needs
//! to be installed.
//!
//! Each open document (one per tab) has its own engine session, named by a number.

use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;
use wordcraft_engine::doc::Block;
use wordcraft_engine::render::{RenderOptions, render_page};
use wordcraft_engine::{Region, Session};

/// The open documents, by id.
#[derive(Default)]
pub struct EngineState(Mutex<Documents>);

#[derive(Default)]
pub struct Documents {
    next_id: u32,
    sessions: HashMap<u32, Session>,
}

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

/// What the interface needs to lay out the pages, draw the cursor and light up the ribbon.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocState {
    pub id: u32,
    /// The file name shown on the tab.
    pub name: String,
    /// Where the document is saved, if it has been.
    pub path: Option<String>,
    pub pages: Vec<PageSize>,
    pub cursor: Option<Mark>,
    pub selection: Vec<Mark>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub dirty: bool,
    /// Formatting at the cursor: font, size, bold, style and so on (WordCraft's format.state).
    pub format: Value,
    /// The paragraph's own alignment: left, center, right, justify, or null when it comes from its style.
    pub align: Option<String>,
}

/// What a command returns: the new state, and the command's own answer (Copy's text, for one).
#[derive(Serialize)]
pub struct CommandReply {
    pub state: DocState,
    pub result: Value,
}

/// The paper and units of the computer's region (A4 in most of the world, Letter in the US).
fn system_region() -> Region {
    Region::from_locale_vars(|name| std::env::var(name).ok(), sys_locale::get_locale)
}

fn lock<'a>(state: &'a State<EngineState>) -> Result<std::sync::MutexGuard<'a, Documents>, String> {
    state.0.lock().map_err(|_| "the engine stopped".to_string())
}

fn with_doc<T>(
    state: &State<EngineState>,
    doc: u32,
    f: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let mut docs = lock(state)?;
    let session = docs.sessions.get_mut(&doc).ok_or("that document is closed")?;
    f(session)
}

fn file_name(s: &Session) -> String {
    s.path
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .or_else(|| s.file_name.clone())
        .unwrap_or_else(|| "Document.docx".into())
}

fn doc_state(id: u32, s: &mut Session) -> DocState {
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
    let format = s.run("format.state", &json!({})).unwrap_or(Value::Null);
    let align = s
        .doc
        .para_at(&s.sel.focus)
        .and_then(|p| p.props.align)
        .map(|a| format!("{a:?}").to_lowercase());
    DocState {
        id,
        name: file_name(s),
        path: s.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
        pages,
        cursor,
        selection,
        can_undo: s.can_undo(),
        can_redo: s.can_redo(),
        dirty: s.dirty,
        format,
        align,
    }
}

fn run(s: &mut Session, id: &str, params: Value) -> Result<Value, String> {
    s.run(id, &params).map_err(|e| e.to_string())
}

fn add(state: &State<EngineState>, mut session: Session) -> Result<DocState, String> {
    let mut docs = lock(state)?;
    docs.next_id += 1;
    let id = docs.next_id;
    let result = doc_state(id, &mut session);
    docs.sessions.insert(id, session);
    Ok(result)
}

/// Open a document in a new tab.
#[tauri::command]
pub fn engine_open(state: State<EngineState>, path: String) -> Result<DocState, String> {
    let path = PathBuf::from(path);
    let (doc, _encrypted) = wordcraft_engine::io::open_path_in(&path, None, &system_region())?;
    let mut session = Session::new(doc);
    session.system_region = system_region();
    session.path = Some(path);
    add(&state, session)
}

/// A new blank document on the computer's paper size, in a new tab.
#[tauri::command]
pub fn engine_new(state: State<EngineState>, name: String) -> Result<DocState, String> {
    let region = system_region();
    let mut session = Session::new(wordcraft_engine::blank_document(&region));
    session.system_region = region;
    session.file_name = Some(name);
    session.dirty = false;
    add(&state, session)
}

/// Close a document's tab. Unsaved changes are lost, so the interface asks first.
#[tauri::command]
pub fn engine_close(state: State<EngineState>, doc: u32) -> Result<(), String> {
    lock(&state)?.sessions.remove(&doc);
    Ok(())
}

/// A document's pages, cursor and selection.
#[tauri::command]
pub fn engine_state(state: State<EngineState>, doc: u32) -> Result<DocState, String> {
    with_doc(&state, doc, |s| Ok(doc_state(doc, s)))
}

/// Draw one page (0-based) at `scale` pixels per point. The reply is the width and
/// height as two little-endian u32s, followed by RGBA pixels.
#[tauri::command]
pub fn engine_render_page(
    state: State<EngineState>,
    doc: u32,
    page: usize,
    scale: f32,
) -> Result<tauri::ipc::Response, String> {
    with_doc(&state, doc, |s| {
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
pub fn engine_type(state: State<EngineState>, doc: u32, text: String) -> Result<DocState, String> {
    with_doc(&state, doc, |s| {
        run(s, "text.insert", json!({ "text": text }))?;
        Ok(doc_state(doc, s))
    })
}

/// Run the command bound to a key such as `Mod+B`, `Shift+Left` or `Backspace`, as
/// WordCraft's own window does. Returns `None` when no command is bound to the key.
#[tauri::command]
pub fn engine_key(state: State<EngineState>, doc: u32, key: String) -> Result<Option<DocState>, String> {
    with_doc(&state, doc, |s| {
        let reg = s.registry.clone();
        if let Some(spec) = s.keymap.resolve(&reg, &key) {
            run(s, spec.id, json!({}))?;
            return Ok(Some(doc_state(doc, s)));
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
                return Ok(Some(doc_state(doc, s)));
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
    doc: u32,
    page: usize,
    x: f32,
    y: f32,
    extend: bool,
) -> Result<DocState, String> {
    with_doc(&state, doc, |s| {
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
        Ok(doc_state(doc, s))
    })
}

/// Run an engine command by id, such as `format.bold`, `edit.copy` or `insert.table`.
#[tauri::command]
pub fn engine_command(
    state: State<EngineState>,
    doc: u32,
    command: String,
    params: Option<Value>,
) -> Result<CommandReply, String> {
    with_doc(&state, doc, |s| {
        let pasting = command.starts_with("edit.paste");
        let before = if pasting { s.doc.body.clone() } else { Vec::new() };
        let result = run(s, &command, params.unwrap_or_else(|| json!({})))?;
        if pasting {
            fit_pasted_tables(s, &before);
        }
        Ok(CommandReply { state: doc_state(doc, s), result })
    })
}

/// Tables copied from another program (a web page, or Word with wider margins) can be wider
/// than this document's text column, and would run off the page. Shrink the tables a paste
/// added to the text width, keeping their column proportions. `before` is the body before
/// the paste: blocks it shares were already there.
fn fit_pasted_tables(s: &mut Session, before: &[Arc<Block>]) {
    let max_w = s
        .doc
        .sections()
        .iter()
        .map(|(_, sp)| sp.text_width())
        .fold(f32::INFINITY, f32::min);
    if !max_w.is_finite() || max_w <= 36.0 {
        return;
    }
    let mut changed = false;
    for block in s.doc.body.iter_mut() {
        if before.iter().any(|old| Arc::ptr_eq(old, block)) {
            continue;
        }
        let Block::Table(table) = &**block else { continue };
        let indent = table.props.indent.unwrap_or(0.0).max(0.0);
        let total: f32 = table.grid.iter().sum::<f32>() + indent;
        // A point or two over is how Word lays out cell padding; leave those alone.
        if total <= max_w + 2.0 {
            continue;
        }
        let k = max_w / total;
        if let Block::Table(table) = Arc::make_mut(block) {
            for w in &mut table.grid {
                *w *= k;
            }
            if let Some(w) = &mut table.props.width {
                *w *= k;
            }
            if let Some(i) = &mut table.props.indent {
                *i *= k;
            }
            for row in &mut table.rows {
                for cell in &mut row.cells {
                    if let Some(w) = &mut cell.props.width {
                        *w *= k;
                    }
                }
            }
            changed = true;
        }
    }
    if changed {
        s.relayout();
    }
}

/// Save the document: to `path` when given (the format follows its extension: docx, doc,
/// rtf, odt, pdf, html, md, txt and more), else over the file it was opened from.
#[tauri::command]
pub fn engine_save(state: State<EngineState>, doc: u32, path: Option<String>) -> Result<DocState, String> {
    with_doc(&state, doc, |s| {
        match path {
            Some(path) => run(s, "file.saveAs", json!({ "path": path }))?,
            None if s.path.is_some() => run(s, "file.save", json!({}))?,
            None => return Err("choose where to save the document".into()),
        };
        Ok(doc_state(doc, s))
    })
}

/// Font families the engine can draw, for the font menu.
#[tauri::command]
pub fn engine_fonts(state: State<EngineState>, doc: u32) -> Result<Value, String> {
    with_doc(&state, doc, |s| {
        let r = run(s, "font.list", json!({ "all": true }))?;
        Ok(r.get("families").cloned().unwrap_or_else(|| json!([])))
    })
}

/// Documents passed on the command line (`lithora report.docx`).
#[tauri::command]
pub fn startup_files() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .map(|p| {
            std::path::absolute(&p)
                .unwrap_or(p)
                .to_string_lossy()
                .into_owned()
        })
        .collect()
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
        let st = doc_state(1, &mut s);
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

    #[test]
    fn pasted_tables_wider_than_the_page_are_fitted() {
        let mut s = Session::new(wordcraft_engine::blank_document(&Region::default()));
        let text_width = s.doc.sections()[0].1.text_width();
        let html = "<table border=1 width=900 style='width:675pt'><tr><td width=300>a</td><td width=600>b</td></tr></table>";
        let before = s.doc.body.clone();
        run(&mut s, "edit.paste", json!({ "html": html, "text": "a\tb" })).unwrap();
        fit_pasted_tables(&mut s, &before);
        let table = s
            .doc
            .body
            .iter()
            .find_map(|b| match &**b {
                Block::Table(t) => Some(t.clone()),
                _ => None,
            })
            .expect("the paste added a table");
        let total: f32 = table.grid.iter().sum();
        assert!(total <= text_width + 2.0, "table {total}pt, text {text_width}pt");
    }

    /// Renders every page of $LITHORA_RENDER_FILE to PPM images in $LITHORA_RENDER_OUT.
    #[test]
    #[ignore]
    fn render_file_to_images() {
        let file = std::env::var("LITHORA_RENDER_FILE").unwrap();
        let out = std::env::var("LITHORA_RENDER_OUT").unwrap();
        let mut s = if file.ends_with(".html") {
            // Paste the HTML into a blank document, as copying from Word does.
            let mut s = Session::new(wordcraft_engine::blank_document(&system_region()));
            let html = std::fs::read_to_string(&file).unwrap();
            let before = s.doc.body.clone();
            run(&mut s, "edit.paste", json!({ "html": html, "text": "x" })).unwrap();
            fit_pasted_tables(&mut s, &before);
            s
        } else {
            let (doc, _) = wordcraft_engine::io::open_path_in(std::path::Path::new(&file), None, &system_region()).unwrap();
            Session::new(doc)
        };
        let layout = s.layout();
        for (i, page) in layout.pages.iter().enumerate() {
            let r = render_page(&s.doc, page, 1.5, &RenderOptions::default());
            let (w, h) = (r.width, r.height);
            let pixels = r.to_straight();
            let mut ppm = format!("P6 {w} {h} 255\n").into_bytes();
            for px in pixels.chunks(4) {
                let a = px[3] as u32;
                for c in &px[..3] {
                    ppm.push(((*c as u32 * a + 255 * (255 - a)) / 255) as u8);
                }
            }
            std::fs::write(format!("{out}/page{i}.ppm"), ppm).unwrap();
        }
    }
}
