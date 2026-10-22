//! Word's everyday tools that need more than one engine command: the Navigation pane's
//! headings, the Paragraph dialog's settings, print preview pages, pasting what the clipboard
//! holds (formatted text or a picture), new documents from templates and comparing documents.

use super::{
    CommandReply, DocState, EngineState, add, doc_state, lock, page_reply, run, system_region,
    with_doc,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::path::PathBuf;
use tauri::State;
use wordcraft_engine::Session;
use wordcraft_engine::doc::styles::StyleSheet;
use wordcraft_engine::doc::{Block, Pos};
use wordcraft_engine::render::{RenderOptions, render_page};

/// One heading in the Navigation pane.
#[derive(Serialize)]
pub struct Heading {
    /// The paragraph's place in the body (its block index).
    pub index: usize,
    /// 1 for Heading 1, 2 for Heading 2 and so on.
    pub level: u8,
    pub text: String,
}

/// The document's headings, in order, for the Navigation pane.
#[tauri::command(async)]
pub fn engine_headings(state: State<EngineState>, doc: u32) -> Result<Vec<Heading>, String> {
    with_doc(&state, doc, |s| Ok(headings(s)))
}

fn headings(s: &Session) -> Vec<Heading> {
    let mut out = Vec::new();
    for (index, block) in s.doc.body.iter().enumerate() {
        let Block::Para(p) = &**block else { continue };
        let Some(level) = s.doc.styles.resolve_para(&p.props).outline_level else {
            continue;
        };
        // Outline level 9 is body text.
        if level >= 9 {
            continue;
        }
        let text: String = p.plain_text().chars().filter(|c| !c.is_control()).collect();
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        out.push(Heading {
            index,
            level: level + 1,
            text: text.chars().take(200).collect(),
        });
    }
    out
}

/// The cursor paragraph's settings as they come out on the page (its style's included), for
/// the Paragraph dialog.
#[tauri::command(async)]
pub fn engine_paragraph(state: State<EngineState>, doc: u32) -> Result<Value, String> {
    with_doc(&state, doc, |s| {
        let Some(p) = s.doc.para_at(&s.sel.focus) else {
            return Ok(Value::Null);
        };
        let r = s.doc.styles.resolve_para(&p.props);
        serde_json::to_value(&r).map_err(|e| e.to_string())
    })
}

/// Draw a page for Print Preview: the whole page every time, without touching what the
/// editing view keeps of its own pages. Same reply as `engine_render_page`.
#[tauri::command(async)]
pub fn engine_preview_page(
    state: State<EngineState>,
    doc: u32,
    page: usize,
    scale: f32,
) -> Result<tauri::ipc::Response, String> {
    let mut docs = lock(&state)?;
    let s = docs
        .sessions
        .get_mut(&doc)
        .ok_or("that document is closed")?;
    // As it prints: no spelling squiggles.
    let layout = s.export_layout();
    let p = layout.pages.get(page).ok_or("no such page")?;
    let r = render_page(&s.doc, p, scale.clamp(0.05, 2.0), &RenderOptions::default());
    let pixels = r.to_straight();
    Ok(tauri::ipc::Response::new(page_reply(
        r.width, r.height, 0, r.height, &pixels,
    )))
}

/// What the system clipboard holds.
#[derive(Default)]
struct Clip {
    text: Option<String>,
    html: Option<String>,
    /// A picture, as PNG.
    png: Option<Vec<u8>>,
}

fn read_clipboard() -> Clip {
    let Ok(mut board) = arboard::Clipboard::new() else {
        return Clip::default();
    };
    let text = board.get_text().ok().filter(|t| !t.is_empty());
    let html = board.get().html().ok().filter(|t| !t.trim().is_empty());
    let png = board.get_image().ok().and_then(|img| {
        let rgba = image::RgbaImage::from_raw(
            img.width as u32,
            img.height as u32,
            img.bytes.into_owned(),
        )?;
        let mut out = std::io::Cursor::new(Vec::new());
        rgba.write_to(&mut out, image::ImageFormat::Png).ok()?;
        Some(out.into_inner())
    });
    Clip { text, html, png }
}

/// Paste what the clipboard holds. `mode`: "keep" (keep source formatting), "merge" (match the
/// text around it), "text" (keep text only) or "picture". A copied picture (a screenshot, say)
/// goes in as a picture whichever is chosen, unless there is text and the choice is text.
#[tauri::command(async)]
pub fn engine_paste(
    state: State<EngineState>,
    doc: u32,
    mode: String,
) -> Result<CommandReply, String> {
    use base64::Engine as _;
    let clip = read_clipboard();
    with_doc(&state, doc, |s| {
        let mut params = serde_json::Map::new();
        if let Some(t) = &clip.text {
            params.insert("text".into(), json!(t));
        }
        if let Some(h) = &clip.html
            && mode != "text"
        {
            params.insert("html".into(), json!(h));
        }
        let picture = clip
            .png
            .as_ref()
            .map(|png| base64::engine::general_purpose::STANDARD.encode(png));
        let result = match (mode.as_str(), picture) {
            ("picture", Some(data)) => run(s, "insert.picture", json!({ "data": data }))?,
            (_, Some(data)) if params.is_empty() => {
                run(s, "insert.picture", json!({ "data": data }))?
            }
            _ if params.is_empty() => return Err("the clipboard is empty".into()),
            ("text", _) => run(s, "edit.pasteText", Value::Object(params))?,
            ("merge", _) => run(s, "edit.pasteMerge", Value::Object(params))?,
            _ => run(s, "edit.paste", Value::Object(params))?,
        };
        Ok(CommandReply {
            state: doc_state(doc, s),
            result,
        })
    })
}

/// What Paste can offer right now: whether the clipboard holds text and a picture.
#[tauri::command(async)]
pub fn clipboard_kinds() -> Value {
    let clip = read_clipboard();
    json!({ "text": clip.text.is_some() || clip.html.is_some(), "picture": clip.png.is_some() })
}

/// A new untitled document made from a template (.dotx, .dot, .ott, or any document): its text,
/// styles and page setup, saved somewhere new.
#[tauri::command(async)]
pub fn engine_new_from_template(
    state: State<EngineState>,
    path: String,
    name: String,
) -> Result<DocState, String> {
    let (doc, _) =
        wordcraft_engine::io::open_path_in(&PathBuf::from(path), None, &system_region())?;
    let mut session = Session::new(doc);
    session.system_region = system_region();
    session.file_name = Some(name);
    session.dirty = false;
    add(&state, session)
}

/// Compare two versions of a document: a new untitled document shows the revised one, with
/// every difference from the original marked as a tracked change.
#[tauri::command(async)]
pub fn engine_compare(
    state: State<EngineState>,
    original: String,
    revised: String,
    name: String,
) -> Result<DocState, String> {
    let (doc, _) =
        wordcraft_engine::io::open_path_in(&PathBuf::from(&original), None, &system_region())?;
    let mut session = Session::new(doc);
    session.system_region = system_region();
    session.author = super::user_name().unwrap_or_else(|| "Lithora User".to_string());
    run(&mut session, "review.compare", json!({ "path": revised }))?;
    session.file_name = Some(name);
    session.dirty = true;
    add(&state, session)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wordcraft_engine::Region;

    fn session(body: &str) -> Session {
        let dir = std::env::temp_dir().join(format!("lithora-extra-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{}.txt", body.len()));
        std::fs::write(&path, body).unwrap();
        let (doc, _) = wordcraft_engine::io::open_path_in(&path, None, &Region::default()).unwrap();
        Session::new(doc)
    }

    #[test]
    fn headings_list_heading_paragraphs_with_their_levels() {
        let mut s = session("Introduction\nSome text.\nDetails\nMore text.");
        run(&mut s, "para.style", json!({ "style": "Heading1" })).unwrap();
        run(
            &mut s,
            "caret.set",
            json!({ "pos": { "story": "body", "path": [2], "off": 0 } }),
        )
        .unwrap();
        run(&mut s, "para.style", json!({ "style": "Heading2" })).unwrap();
        let h = headings(&s);
        let got: Vec<(usize, u8, &str)> = h
            .iter()
            .map(|h| (h.index, h.level, h.text.as_str()))
            .collect();
        assert_eq!(got, vec![(0, 1, "Introduction"), (2, 2, "Details")]);
    }

    #[test]
    fn built_in_styles_the_file_lacks_can_still_be_applied() {
        let mut s = session("Title line");
        s.doc
            .styles
            .styles
            .retain(|st| !st.id.starts_with("Heading"));
        let params = json!({ "style": "Heading2" });
        assert!(run(&mut s, "para.style", params.clone()).is_err());
        add_missing_builtin_style(&mut s, "para.style", &params);
        run(&mut s, "para.style", params).unwrap();
        assert_eq!(headings(&s).first().map(|h| h.level), Some(2));
    }

    #[test]
    fn a_password_protected_document_needs_its_password_to_open() {
        let mut s = session("Secret plans");
        run(&mut s, "file.encrypt", json!({ "password": "hunter2" })).unwrap();
        let path = std::env::temp_dir().join(format!("lithora-pw-{}.docx", std::process::id()));
        run(
            &mut s,
            "file.saveAs",
            json!({ "path": path.to_string_lossy() }),
        )
        .unwrap();
        let region = Region::default();
        let Err(no_pw) = wordcraft_engine::io::open_path_in(&path, None, &region) else {
            panic!("opened without its password")
        };
        assert!(wordcraft_engine::io::needs_password(&no_pw), "{no_pw}");
        let Err(wrong) = wordcraft_engine::io::open_path_in(&path, Some("nope"), &region) else {
            panic!("opened with a wrong password")
        };
        assert!(wordcraft_engine::io::wrong_password(&wrong), "{wrong}");
        let (doc, encrypted) =
            wordcraft_engine::io::open_path_in(&path, Some("hunter2"), &region).unwrap();
        assert!(encrypted);
        assert!(
            Session::new(doc)
                .doc
                .body
                .iter()
                .any(|b| matches!(&**b, Block::Para(p) if p.plain_text().contains("Secret")))
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn the_thesaurus_finds_english_synonyms_for_the_selected_word() {
        let mut s = session("A quick test document");
        run(
            &mut s,
            "caret.set",
            json!({ "pos": { "story": "body", "path": [0], "off": 2 } }),
        )
        .unwrap();
        run(
            &mut s,
            "caret.set",
            json!({ "pos": { "story": "body", "path": [0], "off": 8 }, "extend": true }),
        )
        .unwrap();
        let r = thesaurus(&mut s);
        assert_eq!(r["word"], "quick");
        let syn: Vec<&str> = r["synonyms"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|x| x.as_str())
            .collect();
        assert!(syn.contains(&"fast"), "{syn:?}");
        assert_eq!(
            (r["anchor"]["off"].as_u64(), r["focus"]["off"].as_u64()),
            (Some(2), Some(7))
        );
    }

    #[test]
    fn formatting_marks_watermark_and_page_color_redraw_the_page() {
        let mut docs = super::super::Documents::default();
        docs.sessions.insert(1, session("Hello"));
        let rows = |r: &[u8]| u32::from_le_bytes(r[12..16].try_into().unwrap());
        let paint = |docs: &mut super::super::Documents| {
            super::super::paint(docs, 1, 0, 0.5, true).unwrap()
        };
        paint(&mut docs);
        assert_eq!(rows(&paint(&mut docs)), 0, "nothing changed");
        for (cmd, params) in [
            ("view.marks", json!({})),
            ("design.watermark", json!({ "text": "DRAFT" })),
            ("design.pageColor", json!({ "color": "FBF8F0" })),
            ("design.pageBorders", json!({ "kind": "box" })),
        ] {
            run(docs.sessions.get_mut(&1).unwrap(), cmd, params).unwrap();
            assert!(rows(&paint(&mut docs)) > 0, "{cmd} redraws the page");
        }
    }
}

/// Word's built-in styles (Heading 2, Quote and so on) are always there to apply, even when a
/// file never defined them. Before a style command, add the built-in style the document lacks,
/// with the styles it is based on and linked to.
pub(crate) fn add_missing_builtin_style(s: &mut Session, command: &str, params: &Value) {
    if command != "para.style" && command != "format.charStyle" {
        return;
    }
    let Some(name) = params.get("style").and_then(Value::as_str) else {
        return;
    };
    if s.doc.styles.find(name).is_some() {
        return;
    }
    let builtin = StyleSheet::builtin();
    let Some(first) = builtin.find(name) else {
        return;
    };
    let mut todo = vec![first.id.clone()];
    while let Some(id) = todo.pop() {
        if s.doc.styles.get(&id).is_some() {
            continue;
        }
        let Some(st) = builtin.get(&id) else { continue };
        if s.doc.styles.find(&st.name).is_some() {
            continue;
        }
        todo.extend(st.based_on.iter().chain(st.linked.iter()).cloned());
        s.doc.styles.styles.push(st.clone());
    }
}

/// A built-in equation from the gallery goes on a line of its own, centred, like Word's. When
/// the cursor's paragraph already has text, start a new paragraph for it first.
pub(crate) fn equation_on_its_own_line(
    s: &mut Session,
    command: &str,
    params: &Value,
) -> Result<(), String> {
    if command != "insert.equation" || params.get("ownLine").and_then(Value::as_bool) != Some(true)
    {
        return Ok(());
    }
    let Some(len) = s
        .doc
        .para_at(&s.sel.focus)
        .filter(|p| !p.is_empty())
        .map(|p| p.len())
    else {
        return Ok(());
    };
    let end = Pos {
        off: len,
        ..s.sel.focus.clone()
    };
    run(s, "caret.set", json!({ "pos": end }))?;
    run(s, "text.newParagraph", json!({}))?;
    Ok(())
}

/// Synonyms for the word at the cursor (or the first selected word), for the Thesaurus. English
/// words use Harper's thesaurus (bundled with the proofreader); other languages use the
/// engine's own short list. The word's place comes back too, for replacing it.
#[tauri::command(async)]
pub fn engine_thesaurus(state: State<EngineState>, doc: u32) -> Result<Value, String> {
    with_doc(&state, doc, |s| Ok(thesaurus(s)))
}

fn thesaurus(s: &mut Session) -> Value {
    let (start, _) = s.sel.ordered();
    let at = if s.sel.is_collapsed() {
        s.sel.focus.clone()
    } else {
        start
    };
    let Some(p) = s.doc.para_at(&at) else {
        return json!({ "word": "", "synonyms": [] });
    };
    // Like Word's, the engine's word takes the space after it; the replacement keeps that space.
    let (a, b) = p.word_at(at.off);
    let raw = p.text.get(a..b).unwrap_or("");
    let a = a + (raw.len() - raw.trim_start().len());
    let b = b - (raw.len() - raw.trim_end().len());
    let word = p.text.get(a..b).unwrap_or("").to_string();
    if word.is_empty() {
        return json!({ "word": "", "synonyms": [] });
    }
    let lower = word.to_lowercase();
    let mut synonyms: Vec<String> = if lower
        .chars()
        .all(|c| c.is_ascii_alphabetic() || c == '\'' || c == '-')
    {
        harper_thesaurus::thesaurus()
            .get_synonyms_freq_sorted(&lower)
            .map(|l| {
                l.into_iter()
                    .filter(|w| !w.eq_ignore_ascii_case(&lower))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    if synonyms.is_empty()
        && let Ok(r) = run(s, "review.thesaurus", json!({ "word": lower }))
    {
        synonyms = r["synonyms"]
            .as_array()
            .map(|l| {
                l.iter()
                    .filter_map(|x| x.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
    }
    synonyms.truncate(40);
    let range = |off: usize| Pos { off, ..at.clone() };
    json!({ "word": word, "synonyms": synonyms, "anchor": range(a), "focus": range(b) })
}
