//! PDF documents: open a PDF, edit its text in place (keeping the fonts, sizes, colours and
//! positions it has), move or remove its pictures and shapes, sign it, and save it again.
//!
//! The page is drawn by hayro from the file itself, with the edits applied, so what the window
//! shows is what the saved file holds. Edits are kept apart from the file until it is saved,
//! so each one can be undone; saving appends them to the original file (see [`write`]).

mod edit;
mod embed;
mod font;
mod read;
mod render;
mod tables;
mod write;

use edit::{EStyle, Edits, FontChoice, GraphicEdit, Stamp, TextEdit, TextKey};
use lopdf::{Document, ObjectId};
use read::{Fonts, PageModel, apply, invert};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

/// PDF tabs share the numbering with the document engine's tabs: their ids start here.
const FIRST_ID: u32 = 1 << 20;

#[derive(Default)]
pub struct PdfState(Mutex<PdfDocs>);

#[derive(Default)]
pub struct PdfDocs {
    next_id: u32,
    docs: HashMap<u32, PdfDoc>,
}

impl PdfState {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, PdfDocs>, String> {
        self.0.lock().map_err(|_| "the PDF editor stopped".to_string())
    }
}

pub struct PdfDoc {
    name: String,
    path: Option<PathBuf>,
    /// The file as it was opened (or last saved).
    original: Arc<Vec<u8>>,
    /// The file the edits are appended to for drawing (the original, unless it was encrypted
    /// or damaged and had to be written out again).
    base: Arc<Vec<u8>>,
    doc: Document,
    password: Option<String>,
    encrypted: bool,
    pages: Vec<ObjectId>,
    geometry: Vec<render::Geometry>,
    models: HashMap<usize, PageModel>,
    fonts: Fonts,
    edits: Edits,
    saved: Edits,
    undo: Vec<Edits>,
    redo: Vec<Edits>,
    /// Replacement families the user picked, by font.
    repl: edit::Replacements,
    /// The file with the edits, for drawing; rebuilt when the edits change.
    current: Arc<Vec<u8>>,
    stale: bool,
    /// The font list's version `current` was made with.
    font_generation: u64,
}

#[derive(Serialize)]
pub struct PageSize {
    width: f64,
    height: f64,
}

/// What the window needs about an open PDF.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfInfo {
    id: u32,
    name: String,
    path: Option<String>,
    pages: Vec<PageSize>,
    dirty: bool,
    can_undo: bool,
    can_redo: bool,
    encrypted: bool,
    /// Fonts the PDF uses that aren't installed here.
    missing_fonts: usize,
}

fn info(id: u32, d: &PdfDoc) -> PdfInfo {
    PdfInfo {
        id,
        name: d.name.clone(),
        path: d.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
        pages: d.geometry.iter().map(|g| PageSize { width: g.width, height: g.height }).collect(),
        dirty: d.edits != d.saved,
        can_undo: !d.undo.is_empty(),
        can_redo: !d.redo.is_empty(),
        encrypted: d.encrypted,
        // A missing font the user chose a replacement for is dealt with.
        missing_fonts: font_reports(d).iter().filter(|f| f.status == font::FontStatus::Missing && !f.replaced).count(),
    }
}

/// Read a PDF from its bytes.
fn load(bytes: Vec<u8>, password: Option<&str>) -> Result<(Document, Arc<Vec<u8>>, bool), String> {
    let options = match password {
        Some(p) => lopdf::LoadOptions::with_password(p),
        None => lopdf::LoadOptions::default(),
    };
    let doc = Document::load_mem_with_options(&bytes, options).map_err(|e| {
        let text = e.to_string().to_ascii_lowercase();
        if text.contains("password") || text.contains("decrypt") {
            if password.is_some() { "WRONG_PASSWORD".to_string() } else { "PASSWORD_REQUIRED".to_string() }
        } else {
            format!("this PDF couldn't be read ({e})")
        }
    })?;
    if doc.is_encrypted() && doc.encryption_state.is_none() {
        return Err(if password.is_some() { "WRONG_PASSWORD" } else { "PASSWORD_REQUIRED" }.into());
    }
    let encrypted = doc.encryption_state.is_some();
    if encrypted || doc.xref_recovery.is_some() {
        // Written out again (decrypted, its cross-references rebuilt) for drawing and editing.
        let mut copy = doc.clone();
        copy.trailer.remove(b"Encrypt");
        copy.encryption_state = None;
        let mut out = Vec::new();
        copy.save_to(&mut out).map_err(|e| format!("this PDF couldn't be read ({e})"))?;
        let doc = Document::load_mem(&out).map_err(|e| format!("this PDF couldn't be read ({e})"))?;
        return Ok((doc, Arc::new(out), encrypted));
    }
    Ok((doc, Arc::new(bytes), false))
}

fn open_bytes(name: String, path: Option<PathBuf>, bytes: Vec<u8>, password: Option<String>) -> Result<PdfDoc, String> {
    let original = Arc::new(bytes.clone());
    let (doc, base, encrypted) = load(bytes, password.as_deref())?;
    let pdf = hayro::hayro_syntax::Pdf::new(base.clone()).map_err(|e| format!("this PDF couldn't be read ({e:?})"))?;
    let geometry = render::geometry(&pdf);
    let pages: Vec<ObjectId> = doc.page_iter().collect();
    if pages.len() != geometry.len() || pages.is_empty() {
        return Err("this PDF's pages couldn't be read".into());
    }
    let mut fonts = Fonts::default();
    for (i, p) in pages.iter().enumerate() {
        fonts.scan_page(&doc, i, &read::page_resources(&doc, *p));
    }
    Ok(PdfDoc {
        name,
        path,
        original,
        base: base.clone(),
        doc,
        password,
        encrypted,
        pages,
        geometry,
        models: HashMap::new(),
        fonts,
        edits: Edits::default(),
        saved: Edits::default(),
        undo: Vec::new(),
        redo: Vec::new(),
        repl: HashMap::new(),
        current: base,
        // Fonts of this computer may go into the copy that is drawn.
        stale: true,
        font_generation: 0,
    })
}

impl PdfDoc {
    fn model(&mut self, page: usize) -> Result<&PageModel, String> {
        if !self.models.contains_key(&page) {
            let id = *self.pages.get(page).ok_or("no such page")?;
            let mut m = read::read_page(&self.doc, &mut self.fonts, page, id);
            read::measure(&mut m.lines, &self.fonts);
            self.models.insert(page, m);
        }
        Ok(&self.models[&page])
    }

    fn source(&self, for_file: bool) -> write::Source<'_> {
        write::Source { doc: &self.doc, pages: &self.pages, models: &self.models, fonts: &self.fonts, repl: &self.repl, embed: self.font_files(), for_file }
    }

    /// The fonts the PDF names but doesn't hold that are drawn in a font of this computer: the
    /// one the user chose, or the font itself when it is installed (or was found). That font
    /// goes into the PDF, so the page shows it and other readers show it too.
    fn font_files(&self) -> Vec<(usize, String)> {
        self.fonts
            .list
            .iter()
            .enumerate()
            .filter(|(_, f)| f.embedded == font::Embedded::No && f.kind == font::Kind::Simple)
            .filter_map(|(k, f)| match self.repl.get(&k) {
                Some(r) => Some((k, r.clone())),
                None if !f.builtin => font::installed_family(f).map(|i| (k, i)),
                None => None,
            })
            .collect()
    }

    /// The file with the edits applied.
    fn current(&mut self) -> Result<Arc<Vec<u8>>, String> {
        // A font added since is drawn too.
        let generation = wordcraft_fonts::FontDb::global().generation();
        if self.stale || generation != self.font_generation {
            let objects = write::objects(&self.source(false), &self.edits)?;
            self.current = if objects.is_empty() { self.base.clone() } else { Arc::new(write::append(&self.base, &self.doc.trailer, &objects, None)?) };
            self.stale = false;
            self.font_generation = generation;
        }
        Ok(self.current.clone())
    }

    /// Bytes to write to disk.
    fn file_bytes(&mut self) -> Result<Vec<u8>, String> {
        // Unchanged, and no font replaced: the file as it was.
        if self.edits.texts.is_empty() && self.edits.graphics.is_empty() && self.edits.stamps.is_empty() && self.repl.is_empty() {
            return Ok(self.original.as_ref().clone());
        }
        let objects = write::objects(&self.source(true), &self.edits)?;
        if !self.encrypted {
            return write::append(&self.base, &self.doc.trailer, &objects, None);
        }
        // Encrypted: saved with the same password and protection, written out whole.
        let mut doc = self.doc.clone();
        for (id, o) in objects {
            doc.objects.insert(id, o);
            doc.max_id = doc.max_id.max(id.0);
        }
        let original = Document::load_mem_with_options(&self.original, self.password.as_deref().map(lopdf::LoadOptions::with_password).unwrap_or_default())
            .map_err(|e| e.to_string())?;
        if let Some(state) = original.encryption_state.clone() {
            if let Ok(enc) = original.trailer.get(b"Encrypt").cloned() {
                doc.trailer.set("Encrypt", enc);
            }
            doc.encrypt(&state).map_err(|e| format!("couldn't keep the password: {e}"))?;
        }
        let mut out = Vec::new();
        doc.save_to(&mut out).map_err(|e| e.to_string())?;
        Ok(out)
    }

    fn change(&mut self, f: impl FnOnce(&mut Edits)) {
        self.undo.push(self.edits.clone());
        if self.undo.len() > 200 {
            self.undo.remove(0);
        }
        self.redo.clear();
        f(&mut self.edits);
        self.stale = true;
    }

    fn editable_reason(&self, page: usize) -> Option<&'static str> {
        let g = self.geometry.get(page)?;
        let d = g.display;
        let upright = d[1].abs() < 1e-9 && d[2].abs() < 1e-9 && d[0] > 0.0 && d[3] < 0.0;
        (!upright).then_some("rotated")
    }

    /// Page-space vector for a view-space move.
    fn to_page_delta(&self, page: usize, dx: f64, dy: f64) -> (f64, f64) {
        let d = self.geometry[page].display;
        let inv = invert(&d).unwrap_or(read::IDENTITY);
        let (x0, y0) = apply(&inv, 0.0, 0.0);
        let (x1, y1) = apply(&inv, dx, dy);
        (x1 - x0, y1 - y0)
    }

    fn to_page(&self, page: usize, x: f64, y: f64) -> (f64, f64) {
        let inv = invert(&self.geometry[page].display).unwrap_or(read::IDENTITY);
        apply(&inv, x, y)
    }

    fn to_view_rect(&self, page: usize, b: [f64; 4]) -> [f64; 4] {
        let d = &self.geometry[page].display;
        let pts = [apply(d, b[0], b[1]), apply(d, b[2], b[1]), apply(d, b[0], b[3]), apply(d, b[2], b[3])];
        let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
        for (x, y) in pts {
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x);
            y1 = y1.max(y);
        }
        [x0, y0, x1 - x0, y1 - y0]
    }
}

fn parse_key(key: &str) -> Result<TextKey, String> {
    let (kind, n) = key.split_at(1);
    let n: u32 = n.parse().map_err(|_| "bad text id")?;
    match kind {
        "l" => Ok(TextKey::Line(n as usize)),
        "n" => Ok(TextKey::New(n)),
        _ => Err("bad text id".into()),
    }
}

fn key_name(k: TextKey) -> String {
    match k {
        TextKey::Line(n) => format!("l{n}"),
        TextKey::New(n) => format!("n{n}"),
    }
}

/// A line of text on the page, as the window shows and edits it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextItem {
    key: String,
    text: String,
    /// Its box in the view (points, from the page's top-left corner).
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    /// The baseline's y in the view.
    baseline: f64,
    /// Where each letter starts in the view, and where the last one ends (letters + 1 values).
    edges: Vec<f64>,
    /// The font as named in the PDF ("Calibri Bold"), and its family for the interface.
    font: String,
    family: String,
    font_key: Option<usize>,
    size: f64,
    color: String,
    bold: bool,
    italic: bool,
    underline: bool,
    editable: bool,
    edited: bool,
    /// Fonts some of its letters had to be drawn in because the PDF's font lacks them.
    substituted: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicItem {
    id: usize,
    kind: read::GraphicKind,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    edited: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StampItem {
    id: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageItems {
    page: usize,
    /// Why the page's text can't be edited, if it can't ("rotated").
    locked: Option<&'static str>,
    texts: Vec<TextItem>,
    graphics: Vec<GraphicItem>,
    stamps: Vec<StampItem>,
}

fn style_font_info(st: &EStyle, fonts: &Fonts, repl: &edit::Replacements) -> (String, String, Option<usize>, bool, bool) {
    match &st.font {
        FontChoice::Pdf(k) => {
            let f = &fonts.list[*k];
            let family = repl.get(k).cloned().unwrap_or_else(|| f.family.clone());
            (f.display_name(), family, Some(*k), f.bold, f.italic)
        }
        FontChoice::Family { name, bold, italic } => {
            let mut n = name.clone();
            if *bold {
                n.push_str(" Bold");
            }
            if *italic {
                n.push_str(" Italic");
            }
            (n, name.clone(), None, *bold, *italic)
        }
    }
}

fn text_item(d: &PdfDoc, page: usize, key: TextKey, te: &TextEdit, edited: bool, locked: bool) -> TextItem {
    let model = &d.models[&page];
    let line = match key {
        TextKey::Line(l) => model.lines.get(l),
        TextKey::New(_) => None,
    };
    let placed = edit::layout(te, line, &d.fonts.list, &d.repl);
    let disp = &d.geometry[page].display;
    let baseline_u = te.baseline + te.dy;
    // The line's height, from its fonts.
    let (mut asc, mut desc) = (0.0f64, 0.0f64);
    for st in &te.styles {
        let (a, dd) = match st.font {
            FontChoice::Pdf(k) => (d.fonts.list[k].ascent as f64 / 1000.0, d.fonts.list[k].descent as f64 / 1000.0),
            _ => (0.9, -0.22),
        };
        asc = asc.max(a * st.size + st.rise);
        desc = desc.min(dd * st.size + st.rise);
    }
    if let Some(l) = line {
        asc = asc.max(l.ascent);
        desc = desc.min(l.descent);
    }
    if asc <= 0.0 {
        asc = 9.0;
        desc = -2.5;
    }
    let start = placed.first().map(|p| p.x).unwrap_or(te.x + te.dx);
    let end = placed.last().map(|p| p.x + p.advance).unwrap_or(start);
    let mut edges: Vec<f64> = placed.iter().map(|p| apply(disp, p.x, baseline_u).0).collect();
    edges.push(apply(disp, end, baseline_u).0);
    let r = d.to_view_rect(page, [start, baseline_u + desc, end.max(start + 1.0), baseline_u + asc]);
    let first = te.chars.first().map(|c| c.style).unwrap_or(0);
    let st = te.styles.get(first).cloned().unwrap_or_else(edit::default_style);
    let (font, family, font_key, bold, italic) = style_font_info(&st, &d.fonts, &d.repl);
    let scale = (disp[3]).abs().max(1e-9);
    TextItem {
        key: key_name(key),
        text: te.text(),
        x: r[0],
        y: r[1],
        width: r[2],
        height: r[3],
        baseline: apply(disp, start, baseline_u).1,
        edges,
        font,
        family,
        font_key,
        size: st.size * scale,
        color: st.color.hex(),
        bold,
        italic,
        underline: st.underline,
        editable: !locked,
        edited,
        // Fonts whose new letters had to come from another font: the PDF's copy lacks them and
        // the font isn't installed (or replaced by the user's choice).
        substituted: edit::substituted_fonts(&placed, te)
            .into_iter()
            .filter_map(|f| match f {
                FontChoice::Pdf(k) => {
                    let pf = &d.fonts.list[k];
                    (font::installed_family(pf).is_none() && !d.repl.contains_key(&k)).then(|| pf.display_name())
                }
                FontChoice::Family { name, .. } => (!wordcraft_fonts::FontDb::global().has_family(&name)).then_some(name),
            })
            .collect(),
    }
}

fn page_items(d: &mut PdfDoc, page: usize) -> Result<PageItems, String> {
    d.model(page)?;
    let locked = d.editable_reason(page);
    let model = &d.models[&page];
    let mut texts = Vec::new();
    for (i, line) in model.lines.iter().enumerate() {
        let key = TextKey::Line(i);
        match d.edits.texts.get(&(page, key)) {
            // An emptied line stays listed (with no width), so it can be typed in again.
            Some(te) => texts.push(text_item(d, page, key, te, true, locked.is_some())),
            None => texts.push(text_item(d, page, key, &TextEdit::from_line(line), false, locked.is_some())),
        }
    }
    for ((p, key), te) in &d.edits.texts {
        if *p == page && matches!(key, TextKey::New(_)) {
            texts.push(text_item(d, page, *key, te, true, locked.is_some()));
        }
    }
    let g = &d.geometry[page];
    let page_area = g.width * g.height;
    let mut graphics = Vec::new();
    for (i, gr) in model.graphics.iter().enumerate() {
        let e = d.edits.graphics.get(&(page, i));
        if e.is_some_and(|e| e.deleted) {
            continue;
        }
        let mut b = gr.bbox;
        if let Some(e) = e {
            let (x0, y0) = apply(&e.m, b[0], b[1]);
            let (x1, y1) = apply(&e.m, b[2], b[3]);
            b = [x0.min(x1), y0.min(y1), x0.max(x1), y0.max(y1)];
        }
        let r = d.to_view_rect(page, b);
        // Backgrounds covering the page, and specks, aren't offered for moving.
        if r[2] * r[3] > 0.85 * page_area || r[2] < 2.0 && r[3] < 2.0 || !r.iter().all(|v| v.is_finite()) {
            continue;
        }
        graphics.push(GraphicItem { id: i, kind: gr.kind, x: r[0], y: r[1], width: r[2], height: r[3], edited: e.is_some() });
    }
    let stamps = d
        .edits
        .stamps
        .iter()
        .filter(|s| s.page == page)
        .map(|s| {
            let r = d.to_view_rect(page, s.rect);
            StampItem { id: s.id, x: r[0], y: r[1], width: r[2], height: r[3] }
        })
        .collect();
    Ok(PageItems { page, locked, texts, graphics, stamps })
}

fn font_reports(d: &PdfDoc) -> Vec<font::FontReport> {
    let mut out: Vec<font::FontReport> = Vec::new();
    for (k, f) in d.fonts.list.iter().enumerate() {
        if f.kind == font::Kind::Type3 {
            continue;
        }
        let pages: Vec<usize> = d.fonts.pages.get(&k).map(|p| p.iter().map(|x| x + 1).collect()).unwrap_or_default();
        let installed = font::installed_family(f).is_some();
        let (replacement, replaced) = match d.repl.get(&k) {
            Some(r) => (r.clone(), true),
            None => (font::substitute_family(f), false),
        };
        // One entry per font name: subsets of one font on several pages are one font.
        if let Some(o) = out.iter_mut().find(|o| o.name == f.display_name()) {
            for p in pages {
                if !o.pages.contains(&p) {
                    o.pages.push(p);
                }
            }
            o.pages.sort();
            continue;
        }
        out.push(font::FontReport {
            key: k,
            name: f.display_name(),
            family: f.family.clone(),
            bold: f.bold,
            italic: f.italic,
            embedded: f.embedded,
            installed,
            status: font::font_status(f),
            replacement,
            replaced,
            pages,
        });
    }
    out.sort_by(|a, b| a.status.cmp(&b.status).then(a.name.cmp(&b.name)));
    out
}

fn base_name(path: &std::path::Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Document.pdf".into())
}

fn with<T>(state: &State<PdfState>, doc: u32, f: impl FnOnce(&mut PdfDoc) -> Result<T, String>) -> Result<T, String> {
    let mut docs = state.lock()?;
    let d = docs.docs.get_mut(&doc).ok_or("that PDF is closed")?;
    f(d)
}

// ---- Commands -------------------------------------------------------------------------------

/// Open a PDF in a new tab.
#[tauri::command(async)]
pub fn pdf_open(state: State<PdfState>, path: String, password: Option<String>) -> Result<PdfInfo, String> {
    let path = PathBuf::from(path);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let d = open_bytes(base_name(&path), Some(path), bytes, password.filter(|p| !p.is_empty()))?;
    let mut docs = state.lock()?;
    if docs.next_id < FIRST_ID {
        docs.next_id = FIRST_ID;
    }
    docs.next_id += 1;
    let id = docs.next_id;
    let i = info(id, &d);
    docs.docs.insert(id, d);
    Ok(i)
}

#[tauri::command(async)]
pub fn pdf_close(state: State<PdfState>, doc: u32) -> Result<(), String> {
    state.lock()?.docs.remove(&doc);
    Ok(())
}

#[tauri::command(async)]
pub fn pdf_state(state: State<PdfState>, doc: u32) -> Result<PdfInfo, String> {
    with(&state, doc, |d| Ok(info(doc, d)))
}

/// Draw a page (or the view rectangle `rect` of it: x, y, width, height in points) at `scale`
/// pixels per point. The reply is four little-endian u32s (width and height in pixels, and
/// where the drawing starts on the page, in pixels), then the RGBA pixels.
#[tauri::command(async)]
pub fn pdf_render_page(state: State<PdfState>, doc: u32, page: usize, scale: f64, rect: Option<[f64; 4]>) -> Result<tauri::ipc::Response, String> {
    let (bytes, repl) = with(&state, doc, |d| {
        // The font each font the PDF doesn't hold is drawn in: the user's choice, else the same
        // stand-in the Fonts panel names and new letters are typed in.
        let mut repl: HashMap<String, String> = d
            .fonts
            .list
            .iter()
            .filter(|f| f.embedded == font::Embedded::No && !f.builtin && f.kind != font::Kind::Type3)
            .map(|f| (f.ps_name.to_ascii_lowercase(), font::substitute_family(f)))
            .collect();
        repl.extend(d.repl.iter().map(|(k, v)| (d.fonts.list[*k].ps_name.to_ascii_lowercase(), v.clone())));
        Ok((d.current()?, repl))
    })?;
    let pdf = hayro::hayro_syntax::Pdf::new(bytes).map_err(|e| format!("couldn't draw the page ({e:?})"))?;
    let (w, h, x, y, px) = render::draw(&pdf, page, scale.clamp(0.05, 12.0), rect, &render::settings(repl))?;
    let mut out = Vec::with_capacity(16 + px.len());
    for v in [w, h, x, y] {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out.extend_from_slice(&px);
    Ok(tauri::ipc::Response::new(out))
}

/// The page's text lines, pictures and shapes, and placed signatures.
#[tauri::command(async)]
pub fn pdf_page_items(state: State<PdfState>, doc: u32, page: usize) -> Result<PageItems, String> {
    with(&state, doc, |d| page_items(d, page))
}

/// The reply to an edit: the document's state and the page's items as they are now.
#[derive(Serialize)]
pub struct EditReply {
    info: PdfInfo,
    items: PageItems,
}

fn reply(doc: u32, d: &mut PdfDoc, page: usize) -> Result<EditReply, String> {
    let items = page_items(d, page)?;
    Ok(EditReply { info: info(doc, d), items })
}

fn edit_of<'a>(d: &'a mut PdfDoc, page: usize, key: TextKey) -> Result<&'a mut TextEdit, String> {
    if !d.edits.texts.contains_key(&(page, key)) {
        let TextKey::Line(l) = key else { return Err("that text box is gone".into()) };
        let line = d.models.get(&page).and_then(|m| m.lines.get(l)).ok_or("no such line")?;
        let te = TextEdit::from_line(line);
        d.edits.texts.insert((page, key), te);
    }
    Ok(d.edits.texts.get_mut(&(page, key)).unwrap_or_else(|| unreachable!()))
}

/// Set a line's text. `undoable`: start a new Undo step (the first change of an editing session).
#[tauri::command(async)]
pub fn pdf_set_text(state: State<PdfState>, doc: u32, page: usize, key: String, text: String, undoable: bool) -> Result<EditReply, String> {
    let key = parse_key(&key)?;
    with(&state, doc, |d| {
        d.model(page)?;
        if d.editable_reason(page).is_some() {
            return Err("text on rotated pages can't be edited yet".into());
        }
        if undoable {
            d.change(|_| {});
        }
        edit_of(d, page, key)?.set_text(&text);
        // Back to the original text: no edit at all.
        if let TextKey::Line(l) = key {
            let orig = TextEdit::from_line(&d.models[&page].lines[l]);
            if d.edits.texts.get(&(page, key)) == Some(&orig) {
                d.edits.texts.remove(&(page, key));
            }
        }
        d.stale = true;
        reply(doc, d, page)
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleChange {
    family: Option<String>,
    size: Option<f64>,
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
    color: Option<String>,
}

/// Restyle letters `from..to` of a line (all of it when both are 0).
#[tauri::command(async)]
pub fn pdf_style_text(state: State<PdfState>, doc: u32, page: usize, key: String, from: usize, to: usize, change: StyleChange) -> Result<EditReply, String> {
    let key = parse_key(&key)?;
    with(&state, doc, |d| {
        d.model(page)?;
        d.change(|_| {});
        let scale = d.geometry[page].display[3].abs().max(1e-9);
        let fonts: Vec<(String, bool, bool)> = d.fonts.list.iter().map(|f| (f.family.clone(), f.bold, f.italic)).collect();
        let repl = d.repl.clone();
        let te = edit_of(d, page, key)?;
        let (from, to) = if from == 0 && to == 0 { (0, te.chars.len()) } else { (from, to) };
        te.restyle(from, to, |s| {
            let (fam, b, i) = match &s.font {
                FontChoice::Pdf(k) => {
                    let (f, b, i) = fonts[*k].clone();
                    (repl.get(k).cloned().unwrap_or(f), b, i)
                }
                FontChoice::Family { name, bold, italic } => (name.clone(), *bold, *italic),
            };
            let (nf, nb, ni) = (change.family.clone().unwrap_or(fam), change.bold.unwrap_or(b), change.italic.unwrap_or(i));
            let same_font = matches!(s.font, FontChoice::Pdf(k) if fonts[k].0 == nf && fonts[k].1 == nb && fonts[k].2 == ni);
            if !same_font {
                // A PDF font of that family and style, if the document has one; else the installed font.
                s.font = match fonts.iter().position(|f| f.0.eq_ignore_ascii_case(&nf) && f.1 == nb && f.2 == ni) {
                    Some(k) => FontChoice::Pdf(k),
                    None => FontChoice::Family { name: nf, bold: nb, italic: ni },
                };
            }
            if let Some(sz) = change.size {
                s.size = (sz / scale).clamp(1.0, 500.0);
            }
            if let Some(u) = change.underline {
                s.underline = u;
            }
            if let Some(c) = change.color.as_deref().and_then(read::Color::from_hex) {
                s.color = c;
            }
        });
        d.stale = true;
        reply(doc, d, page)
    })
}

/// Move a line or text box by (dx, dy) view points.
#[tauri::command(async)]
pub fn pdf_move_text(state: State<PdfState>, doc: u32, page: usize, key: String, dx: f64, dy: f64) -> Result<EditReply, String> {
    let key = parse_key(&key)?;
    with(&state, doc, |d| {
        d.model(page)?;
        let (ux, uy) = d.to_page_delta(page, dx, dy);
        d.change(|_| {});
        let te = edit_of(d, page, key)?;
        te.dx += ux;
        te.dy += uy;
        d.stale = true;
        reply(doc, d, page)
    })
}

/// A new text box with its baseline starting at view point (x, y); it starts in the style
/// of the text nearest to it.
#[tauri::command(async)]
pub fn pdf_add_text(state: State<PdfState>, doc: u32, page: usize, x: f64, y: f64, text: String) -> Result<(String, EditReply), String> {
    with(&state, doc, |d| {
        d.model(page)?;
        let (ux, uy) = d.to_page(page, x, y);
        let near = d.models[&page]
            .lines
            .iter()
            .min_by(|a, b| {
                let da = (a.baseline - uy).abs() + (a.x0() - ux).abs() * 0.2;
                let db = (b.baseline - uy).abs() + (b.x0() - ux).abs() * 0.2;
                da.total_cmp(&db)
            })
            .and_then(|l| l.chars.first().map(|c| EStyle::from(&l.styles[c.style])));
        let mut style = near.unwrap_or_else(edit::default_style);
        // New text uses the nearby font only if that font can draw it; else an installed font.
        if let FontChoice::Pdf(k) = style.font {
            let f = &d.fonts.list[k];
            if f.embedded == font::Embedded::Subset && !text.chars().all(|c| f.code_for(c).is_some()) {
                style.font = FontChoice::Family { name: font::installed_family(f).unwrap_or_else(|| f.family.clone()), bold: f.bold, italic: f.italic };
            }
        }
        d.change(|_| {});
        let id = d.edits.next_id;
        d.edits.next_id += 1;
        let mut te = TextEdit { chars: Vec::new(), styles: vec![style], x: ux, baseline: uy, dx: 0.0, dy: 0.0 };
        te.set_text(&text);
        d.edits.texts.insert((page, TextKey::New(id)), te);
        d.stale = true;
        Ok((key_name(TextKey::New(id)), reply(doc, d, page)?))
    })
}

/// Remove a line or text box.
#[tauri::command(async)]
pub fn pdf_delete_text(state: State<PdfState>, doc: u32, page: usize, key: String) -> Result<EditReply, String> {
    let key = parse_key(&key)?;
    with(&state, doc, |d| {
        d.model(page)?;
        d.change(|_| {});
        match key {
            TextKey::New(_) => {
                d.edits.texts.remove(&(page, key));
            }
            TextKey::Line(_) => edit_of(d, page, key)?.set_text(""),
        }
        d.stale = true;
        reply(doc, d, page)
    })
}

/// Put a picture or shape in the view rectangle (x, y, w, h), or remove it (`rect` none).
#[tauri::command(async)]
pub fn pdf_place_graphic(state: State<PdfState>, doc: u32, page: usize, id: usize, rect: Option<[f64; 4]>) -> Result<EditReply, String> {
    with(&state, doc, |d| {
        d.model(page)?;
        let old = d.models[&page].graphics.get(id).ok_or("no such picture")?.bbox;
        let edit = match rect {
            None => GraphicEdit { m: read::IDENTITY, deleted: true },
            Some([x, y, w, h]) => {
                let (ax, ay) = d.to_page(page, x, y);
                let (bx, by) = d.to_page(page, x + w, y + h);
                let (nx0, ny0, nx1, ny1) = (ax.min(bx), ay.min(by), ax.max(bx), ay.max(by));
                let ow = (old[2] - old[0]).max(1e-6);
                let oh = (old[3] - old[1]).max(1e-6);
                let sx = (nx1 - nx0) / ow;
                let sy = (ny1 - ny0) / oh;
                GraphicEdit { m: [sx, 0.0, 0.0, sy, nx0 - old[0] * sx, ny0 - old[1] * sy], deleted: false }
            }
        };
        d.change(|e| {
            e.graphics.insert((page, id), edit);
        });
        reply(doc, d, page)
    })
}

/// Place a picture (a signature: PNG, base64) in the view rectangle; returns its id.
#[tauri::command(async)]
pub fn pdf_add_stamp(state: State<PdfState>, doc: u32, page: usize, png: String, rect: [f64; 4]) -> Result<(u32, EditReply), String> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD.decode(png.trim()).map_err(|_| "bad picture data")?;
    with(&state, doc, |d| {
        d.model(page)?;
        let (ax, ay) = d.to_page(page, rect[0], rect[1]);
        let (bx, by) = d.to_page(page, rect[0] + rect[2], rect[1] + rect[3]);
        let id = d.edits.next_id;
        let stamp = Stamp { id, page, rect: [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)], png: Arc::new(data) };
        d.change(|e| {
            e.next_id += 1;
            e.stamps.push(stamp);
        });
        Ok((id, reply(doc, d, page)?))
    })
}

/// Move a placed picture to the view rectangle, or remove it (`rect` none).
#[tauri::command(async)]
pub fn pdf_place_stamp(state: State<PdfState>, doc: u32, page: usize, id: u32, rect: Option<[f64; 4]>) -> Result<EditReply, String> {
    with(&state, doc, |d| {
        let r = rect.map(|r| {
            let (ax, ay) = d.to_page(page, r[0], r[1]);
            let (bx, by) = d.to_page(page, r[0] + r[2], r[1] + r[3]);
            [ax.min(bx), ay.min(by), ax.max(bx), ay.max(by)]
        });
        d.change(|e| match r {
            Some(r) => {
                if let Some(s) = e.stamps.iter_mut().find(|s| s.id == id) {
                    s.rect = r;
                }
            }
            None => e.stamps.retain(|s| s.id != id),
        });
        reply(doc, d, page)
    })
}

#[derive(Serialize)]
pub struct UndoReply {
    info: PdfInfo,
    /// Pages whose drawing changed.
    pages: Vec<usize>,
}

fn changed_pages(a: &Edits, b: &Edits) -> Vec<usize> {
    let mut p = a.pages();
    p.extend(b.pages());
    p.sort();
    p.dedup();
    p
}

#[tauri::command(async)]
pub fn pdf_undo(state: State<PdfState>, doc: u32) -> Result<UndoReply, String> {
    with(&state, doc, |d| {
        let Some(prev) = d.undo.pop() else { return Ok(UndoReply { info: info(doc, d), pages: vec![] }) };
        let now = std::mem::replace(&mut d.edits, prev);
        let pages = changed_pages(&now, &d.edits);
        d.redo.push(now);
        d.stale = true;
        Ok(UndoReply { info: info(doc, d), pages })
    })
}

#[tauri::command(async)]
pub fn pdf_redo(state: State<PdfState>, doc: u32) -> Result<UndoReply, String> {
    with(&state, doc, |d| {
        let Some(next) = d.redo.pop() else { return Ok(UndoReply { info: info(doc, d), pages: vec![] }) };
        let now = std::mem::replace(&mut d.edits, next);
        let pages = changed_pages(&now, &d.edits);
        d.undo.push(now);
        d.stale = true;
        Ok(UndoReply { info: info(doc, d), pages })
    })
}

/// Save the PDF, over its file or to `path`. The edits stay as they are (and can still be
/// undone): each save writes the opened file with all of them added.
#[tauri::command(async)]
pub fn pdf_save(state: State<PdfState>, doc: u32, path: Option<String>) -> Result<PdfInfo, String> {
    let mut docs = state.lock()?;
    let d = docs.docs.get_mut(&doc).ok_or("that PDF is closed")?;
    let target = match path {
        Some(p) => PathBuf::from(p),
        None => d.path.clone().ok_or("choose where to save the PDF")?,
    };
    let bytes = d.file_bytes()?;
    // Read it back first: a file that doesn't open again isn't written over the original.
    let mut check = open_bytes(base_name(&target), Some(target.clone()), bytes.clone(), d.password.clone())
        .map_err(|e| format!("the edited PDF didn't come out right, so it wasn't saved ({e})"))?;
    for p in 0..check.pages.len().min(3) {
        check.model(p).map_err(|e| format!("the edited PDF didn't come out right, so it wasn't saved ({e})"))?;
    }
    let tmp = target.with_extension("pdf.lithora-tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &target).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;
    d.saved = d.edits.clone();
    d.name = base_name(&target);
    d.path = Some(target);
    Ok(info(doc, d))
}

/// The fonts the PDF uses, for the Missing fonts panel.
#[tauri::command(async)]
pub fn pdf_fonts(state: State<PdfState>, doc: u32) -> Result<Vec<font::FontReport>, String> {
    with(&state, doc, |d| Ok(font_reports(d)))
}

/// Draw a font (and every font of the same name) in `family` instead, or as it was (`None`).
#[tauri::command(async)]
pub fn pdf_replace_font(state: State<PdfState>, doc: u32, key: usize, family: Option<String>) -> Result<PdfInfo, String> {
    with(&state, doc, |d| {
        let name = d.fonts.list.get(key).ok_or("no such font")?.display_name();
        let same: Vec<usize> = d.fonts.list.iter().enumerate().filter(|(_, f)| f.display_name() == name).map(|(i, _)| i).collect();
        for k in same {
            match &family {
                Some(f) if !f.trim().is_empty() => {
                    d.repl.insert(k, f.trim().to_string());
                }
                _ => {
                    d.repl.remove(&k);
                }
            }
        }
        d.stale = true;
        Ok(info(doc, d))
    })
}

/// Print the PDF as it is now (with the edits): all of it, or the pages chosen.
#[tauri::command]
pub async fn pdf_print(state: State<'_, PdfState>, doc: u32, options: crate::print::PrintOptions) -> Result<String, String> {
    let (bytes, title, count) = with(&state, doc, |d| Ok((d.current()?, d.name.clone(), d.pages.len())))?;
    let pages = options.pages(count)?;
    let pdf = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let Some(keep) = pages else { return Ok(bytes.as_ref().clone()) };
        // Only those pages: the others are taken out of a copy.
        let mut copy = Document::load_mem(&bytes).map_err(|e| e.to_string())?;
        let drop: Vec<u32> = (1..=count as u32).filter(|p| !keep.contains(&(*p as usize - 1))).collect();
        copy.delete_pages(&drop);
        let mut out = Vec::new();
        copy.save_to(&mut out).map_err(|e| e.to_string())?;
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())??;
    crate::print::submit(pdf, crate::print::job(options, title)).await
}

/// Add a font file to Lithora (kept for next time too). Returns the families it holds.
#[tauri::command(async)]
pub fn fonts_add_file(path: String) -> Result<Vec<String>, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = std::path::Path::new(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "font.ttf".into());
    let r = wordcraft_fonts::FontDb::global().install_font(&name, &bytes).map_err(|e| e.to_string())?;
    Ok(r.font.families())
}

/// Every installed font family, for the replacement list.
#[tauri::command(async)]
pub fn fonts_installed() -> Vec<String> {
    wordcraft_fonts::FontDb::global().families()
}

#[cfg(test)]
mod tests;
