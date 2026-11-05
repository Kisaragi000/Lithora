//! Reading a PDF page: its text, line by line, with where each letter is and how it is set,
//! and the pictures and shapes on it, so they can be edited and moved.
//!
//! The page's content stream is run like a viewer runs it (text state, text and graphics
//! matrices, colours), but instead of drawing, each glyph is noted with the content operation
//! and string position it came from. Editing a line later blanks exactly those glyphs (each
//! becomes a gap of its own width, so nothing after it moves) and writes the new text.

use super::font::{self, PdfFont, deref, get};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::HashMap;

/// An affine transform [a b c d e f]: a point (x, y) goes to (ax + cy + e, bx + dy + f).
pub type Mat = [f64; 6];

pub const IDENTITY: Mat = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

/// `a` then `b`.
pub fn mul(a: &Mat, b: &Mat) -> Mat {
    [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5],
    ]
}

pub fn apply(m: &Mat, x: f64, y: f64) -> (f64, f64) {
    (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
}

pub fn invert(m: &Mat) -> Option<Mat> {
    let det = m[0] * m[3] - m[1] * m[2];
    if det.abs() < 1e-12 {
        return None;
    }
    let a = m[3] / det;
    let b = -m[1] / det;
    let c = -m[2] / det;
    let d = m[0] / det;
    Some([a, b, c, d, -(m[4] * a + m[5] * c), -(m[4] * b + m[5] * d)])
}

/// A content stream: the page's own (all its Contents streams as one), or a form XObject's.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Unit {
    Page,
    Form(ObjectId),
}

/// Where a glyph is in the content: operation, array element (0 for Tj), byte offset.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GlyphRef {
    pub unit: Unit,
    pub op: usize,
    pub elem: usize,
    pub start: usize,
    pub len: u8,
    /// How far the glyph moves the text position, in text space (spacing included).
    pub advance: f64,
    /// Font size × horizontal scaling, to turn that into a TJ gap.
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "space", rename_all = "camelCase")]
pub enum Color {
    Gray { v: f32 },
    Rgb { r: f32, g: f32, b: f32 },
    Cmyk { c: f32, m: f32, y: f32, k: f32 },
}

impl Color {
    pub const BLACK: Color = Color::Gray { v: 0.0 };

    pub fn rgb(&self) -> [f32; 3] {
        match *self {
            Color::Gray { v } => [v, v, v],
            Color::Rgb { r, g, b } => [r, g, b],
            Color::Cmyk { c, m, y, k } => [(1.0 - c) * (1.0 - k), (1.0 - m) * (1.0 - k), (1.0 - y) * (1.0 - k)],
        }
    }

    pub fn hex(&self) -> String {
        let [r, g, b] = self.rgb();
        let c = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        format!("#{:02x}{:02x}{:02x}", c(r), c(g), c(b))
    }

    pub fn from_hex(s: &str) -> Option<Color> {
        let s = s.trim_start_matches('#');
        if s.len() != 6 {
            return None;
        }
        let p = |i: usize| u8::from_str_radix(&s[i..i + 2], 16).ok().map(|v| v as f32 / 255.0);
        Some(Color::Rgb { r: p(0)?, g: p(2)?, b: p(4)? })
    }
}

/// How a run of text is set, in page units (points of user space).
#[derive(Clone, Debug, PartialEq)]
pub struct Style {
    /// The PDF font (index into the document's fonts).
    pub font: usize,
    /// Font size on the page.
    pub size: f64,
    /// Horizontal scale (1 = normal).
    pub hs: f64,
    /// Character and word spacing added after each glyph, on the page.
    pub tc: f64,
    pub tw: f64,
    pub rise: f64,
    /// Horizontal shear (slanted text), x per y.
    pub skew: f64,
    /// Text rendering mode (0 fill, 1 stroke, 2 both, 3 invisible…).
    pub mode: i64,
    pub color: Color,
}

/// One letter of a line.
#[derive(Clone, Debug)]
pub struct LChar {
    pub ch: char,
    /// Where it starts and where the next letter starts, along the baseline (page x).
    pub x0: f64,
    pub x1: f64,
    pub style: usize,
    /// The glyph it came from (none: a space the PDF only left as a gap).
    pub glyph: Option<GlyphRef>,
    /// The font code it was drawn with.
    pub code: Option<(u32, u8)>,
    /// Letters drawn by one glyph (a ligature) share this.
    pub group: u32,
}

/// One line of text as the PDF draws it.
#[derive(Clone, Debug)]
pub struct Line {
    pub chars: Vec<LChar>,
    pub styles: Vec<Style>,
    /// The baseline's y on the page (user space, y up).
    pub baseline: f64,
    pub ascent: f64,
    pub descent: f64,
}

impl Line {
    pub fn text(&self) -> String {
        self.chars.iter().map(|c| c.ch).collect()
    }
    pub fn x0(&self) -> f64 {
        self.chars.first().map(|c| c.x0).unwrap_or(0.0)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GraphicKind {
    Image,
    Shape,
}

/// A picture or shape on the page, and the content operations that move it.
#[derive(Clone, Debug)]
pub struct Graphic {
    pub kind: GraphicKind,
    pub unit: Unit,
    /// The q … Q block that holds this drawing alone (with its clipping), if there is one.
    pub block: Option<(usize, usize)>,
    /// The operations that draw it (a path's construction and painting, or the Do).
    pub ops: (usize, usize),
    /// The transform (CTM) where the move is inserted.
    pub ctm: Mat,
    /// Its bounding box on the page (user space): x0, y0, x1, y1.
    pub bbox: [f64; 4],
}

/// A content stream, parsed.
pub struct UnitOps {
    pub ops: Vec<Operation>,
    /// It parsed cleanly, so writing it back loses nothing.
    pub exact: bool,
}

/// What was read from one page.
#[derive(Default)]
pub struct PageModel {
    pub lines: Vec<Line>,
    pub graphics: Vec<Graphic>,
    pub units: HashMap<Unit, UnitOps>,
}

/// The fonts read so far, by object (or, for a font written inside a dictionary, by where).
#[derive(Default)]
pub struct Fonts {
    pub list: Vec<PdfFont>,
    by_obj: HashMap<ObjectId, usize>,
    by_place: HashMap<(Unit, Vec<u8>), usize>,
    /// Pages (0-based) each font is used on.
    pub pages: HashMap<usize, Vec<usize>>,
}

impl Fonts {
    pub fn lookup(&mut self, doc: &Document, unit: Unit, name: &[u8], res: &Dictionary) -> Option<usize> {
        let fonts = get(doc, res, b"Font")?.as_dict().ok()?;
        let entry = fonts.get(name).ok()?;
        if let Object::Reference(id) = entry {
            if let Some(k) = self.by_obj.get(id) {
                return Some(*k);
            }
            let dict = doc.get_object(*id).ok()?.as_dict().ok()?;
            let k = self.list.len();
            self.list.push(PdfFont::read(doc, Some(*id), dict));
            self.by_obj.insert(*id, k);
            return Some(k);
        }
        let key = (unit, name.to_vec());
        if let Some(k) = self.by_place.get(&key) {
            return Some(*k);
        }
        let dict = entry.as_dict().ok()?;
        let k = self.list.len();
        self.list.push(PdfFont::read(doc, None, dict));
        self.by_place.insert(key, k);
        Some(k)
    }

    /// Note every font the page's resources (and its forms') name, read or not.
    pub fn scan_page(&mut self, doc: &Document, page: usize, res: &Dictionary) {
        let mut seen = Vec::new();
        self.scan(doc, page, Unit::Page, res, &mut seen, 0);
    }

    fn scan(&mut self, doc: &Document, page: usize, unit: Unit, res: &Dictionary, seen: &mut Vec<ObjectId>, depth: u32) {
        if depth > 8 {
            return;
        }
        if let Some(fonts) = get(doc, res, b"Font").and_then(|o| o.as_dict().ok()) {
            let names: Vec<Vec<u8>> = fonts.iter().map(|(k, _)| k.clone()).collect();
            for n in names {
                if let Some(k) = self.lookup(doc, unit, &n, res) {
                    let pages = self.pages.entry(k).or_default();
                    if !pages.contains(&page) {
                        pages.push(page);
                    }
                }
            }
        }
        if let Some(xs) = get(doc, res, b"XObject").and_then(|o| o.as_dict().ok()) {
            for (_, o) in xs.iter() {
                let Object::Reference(id) = o else { continue };
                if seen.contains(id) {
                    continue;
                }
                seen.push(*id);
                if let Ok(Object::Stream(s)) = doc.get_object(*id)
                    && s.dict.get(b"Subtype").and_then(|o| o.as_name()).ok() == Some(b"Form")
                    && let Some(r) = get(doc, &s.dict, b"Resources").and_then(|o| o.as_dict().ok())
                {
                    self.scan(doc, page, Unit::Form(*id), r, seen, depth + 1);
                }
            }
        }
    }
}

/// A page's resources, inherited from its parents when it has none of its own.
pub fn page_resources(doc: &Document, page: ObjectId) -> Dictionary {
    let mut node = doc.get_dictionary(page).ok();
    let mut depth = 0;
    while let Some(d) = node {
        if let Some(r) = get(doc, d, b"Resources").and_then(|o| o.as_dict().ok()) {
            return r.clone();
        }
        node = d.get(b"Parent").ok().and_then(|p| p.as_reference().ok()).and_then(|id| doc.get_dictionary(id).ok());
        depth += 1;
        if depth > 32 {
            break;
        }
    }
    Dictionary::new()
}

/// Decode a content stream; `exact` when it parsed without anything skipped.
pub fn decode(data: &[u8]) -> UnitOps {
    match Content::decode_strict(data) {
        Ok(c) => UnitOps { ops: c.operations, exact: true },
        Err(_) => UnitOps { ops: Content::decode(data).map(|c| c.operations).unwrap_or_default(), exact: false },
    }
}

#[derive(Clone)]
struct TextState {
    font: Option<usize>,
    size: f64,
    tc: f64,
    tw: f64,
    th: f64,
    tl: f64,
    rise: f64,
    mode: i64,
}

#[derive(Clone)]
struct GState {
    ctm: Mat,
    fill: Color,
    /// Components the fill colour space takes (scn).
    fill_n: usize,
    ts: TextState,
}

/// A glyph as drawn, before lines are formed.
struct Drawn {
    text: String,
    x0: f64,
    x1: f64,
    y: f64,
    style: Style,
    glyph: GlyphRef,
    code: (u32, u8),
    /// A gap of at least a space's width came before it, inside the same TJ.
    gap_before: bool,
}

struct Block {
    start: usize,
    end: Option<usize>,
    draws: u32,
    /// The transform where the block starts.
    ctm: Mat,
}

struct Reader<'a> {
    doc: &'a Document,
    fonts: &'a mut Fonts,
    drawn: Vec<Drawn>,
    graphics: Vec<(Graphic, Vec<usize>)>,
    units: HashMap<Unit, UnitOps>,
    depth: u32,
}

/// Read one page.
pub fn read_page(doc: &Document, fonts: &mut Fonts, page_index: usize, page: ObjectId) -> PageModel {
    let res = page_resources(doc, page);
    fonts.scan_page(doc, page_index, &res);
    let content = doc.get_page_content(page);
    let unit = decode(&content);
    let mut r = Reader { doc, fonts, drawn: Vec::new(), graphics: Vec::new(), units: HashMap::new(), depth: 0 };
    let state = GState {
        ctm: IDENTITY,
        fill: Color::BLACK,
        fill_n: 1,
        ts: TextState { font: None, size: 0.0, tc: 0.0, tw: 0.0, th: 1.0, tl: 0.0, rise: 0.0, mode: 0 },
    };
    let ops = unit.ops.clone();
    r.units.insert(Unit::Page, unit);
    let mut blocks = Vec::new();
    r.run(Unit::Page, &ops, &res, state, &mut blocks);
    r.settle_blocks(Unit::Page, &blocks);
    let lines = form_lines(std::mem::take(&mut r.drawn));
    // Glyphs the document draws are in their font's subset.
    for l in &lines {
        for c in &l.chars {
            if let Some((code, _)) = c.code {
                r.fonts.list[l.styles[c.style].font].seen.insert(code);
            }
        }
    }
    let graphics = r.graphics.into_iter().map(|(g, _)| g).collect();
    PageModel { lines, graphics, units: r.units }
}

impl Reader<'_> {
    /// Pick, for each graphic of `unit`, the outermost q … Q block holding it alone.
    fn settle_blocks(&mut self, unit: Unit, blocks: &[Block]) {
        for (g, active) in self.graphics.iter_mut() {
            if g.unit != unit {
                continue;
            }
            if let Some(b) = active.iter().map(|&b| &blocks[b]).find(|b| b.draws == 1 && b.end.is_some()) {
                g.block = Some((b.start, b.end.unwrap_or(b.start)));
                g.ctm = b.ctm;
            }
        }
    }

    fn run(&mut self, unit: Unit, ops: &[Operation], res: &Dictionary, mut gs: GState, blocks: &mut Vec<Block>) {
        let doc = self.doc;
        let mut stack: Vec<GState> = Vec::new();
        let mut open: Vec<usize> = Vec::new();
        let mut tm = IDENTITY;
        let mut tlm = IDENTITY;
        let mut path_start: Option<usize> = None;
        let mut path_pts: Vec<(f64, f64)> = Vec::new();
        let f = |o: &Object| o.as_float().map(|v| v as f64).unwrap_or(0.0);
        for (i, op) in ops.iter().enumerate() {
            let a = &op.operands;
            let n = |k: usize| a.get(k).map(f).unwrap_or(0.0);
            match op.operator.as_str() {
                "q" => {
                    stack.push(gs.clone());
                    blocks.push(Block { start: i, end: None, draws: 0, ctm: gs.ctm });
                    open.push(blocks.len() - 1);
                }
                "Q" => {
                    if let Some(s) = stack.pop() {
                        gs = s;
                    }
                    if let Some(b) = open.pop() {
                        blocks[b].end = Some(i);
                    }
                }
                "cm" if a.len() == 6 => {
                    let m = [n(0), n(1), n(2), n(3), n(4), n(5)];
                    gs.ctm = mul(&m, &gs.ctm);
                }
                "g" => {
                    gs.fill = Color::Gray { v: n(0) as f32 };
                    gs.fill_n = 1;
                }
                "rg" => {
                    gs.fill = Color::Rgb { r: n(0) as f32, g: n(1) as f32, b: n(2) as f32 };
                    gs.fill_n = 3;
                }
                "k" => {
                    gs.fill = Color::Cmyk { c: n(0) as f32, m: n(1) as f32, y: n(2) as f32, k: n(3) as f32 };
                    gs.fill_n = 4;
                }
                "cs" => {
                    let name = a.first().and_then(|o| o.as_name().ok()).unwrap_or(b"DeviceGray");
                    gs.fill_n = color_components(doc, res, name);
                    gs.fill = Color::BLACK;
                }
                "sc" | "scn" => {
                    let nums: Vec<f32> = a.iter().filter_map(|o| o.as_float().ok()).collect();
                    gs.fill = match (gs.fill_n, nums.len()) {
                        (1, 1..) => Color::Gray { v: nums[0] },
                        (3, 3..) => Color::Rgb { r: nums[0], g: nums[1], b: nums[2] },
                        (4, 4..) => Color::Cmyk { c: nums[0], m: nums[1], y: nums[2], k: nums[3] },
                        _ => Color::BLACK,
                    };
                }
                "BT" => {
                    tm = IDENTITY;
                    tlm = IDENTITY;
                }
                "Tf" => {
                    let name = a.first().and_then(|o| o.as_name().ok()).unwrap_or(b"");
                    gs.ts.font = self.fonts.lookup(doc, unit, name, res);
                    gs.ts.size = n(1);
                }
                "Tc" => gs.ts.tc = n(0),
                "Tw" => gs.ts.tw = n(0),
                "Tz" => gs.ts.th = n(0) / 100.0,
                "TL" => gs.ts.tl = n(0),
                "Ts" => gs.ts.rise = n(0),
                "Tr" => gs.ts.mode = a.first().and_then(|o| o.as_i64().ok()).unwrap_or(0),
                "Td" => {
                    tlm = mul(&[1.0, 0.0, 0.0, 1.0, n(0), n(1)], &tlm);
                    tm = tlm;
                }
                "TD" => {
                    gs.ts.tl = -n(1);
                    tlm = mul(&[1.0, 0.0, 0.0, 1.0, n(0), n(1)], &tlm);
                    tm = tlm;
                }
                "Tm" if a.len() == 6 => {
                    tlm = [n(0), n(1), n(2), n(3), n(4), n(5)];
                    tm = tlm;
                }
                "T*" => {
                    tlm = mul(&[1.0, 0.0, 0.0, 1.0, 0.0, -gs.ts.tl], &tlm);
                    tm = tlm;
                }
                "Tj" | "TJ" | "'" | "\"" => {
                    if op.operator == "'" || op.operator == "\"" {
                        if op.operator == "\"" {
                            gs.ts.tw = n(0);
                            gs.ts.tc = n(1);
                        }
                        tlm = mul(&[1.0, 0.0, 0.0, 1.0, 0.0, -gs.ts.tl], &tlm);
                        tm = tlm;
                    }
                    for &b in &open {
                        blocks[b].draws += 1;
                    }
                    let elems: Vec<&Object> = match op.operator.as_str() {
                        "TJ" => a.first().and_then(|o| o.as_array().ok()).map(|v| v.iter().collect()).unwrap_or_default(),
                        "\"" => a.get(2).into_iter().collect(),
                        _ => a.first().into_iter().collect(),
                    };
                    self.show(unit, i, &elems, &gs, &mut tm);
                }
                "Do" => {
                    let name = a.first().and_then(|o| o.as_name().ok()).unwrap_or(b"");
                    let Some(Object::Reference(id)) = get(doc, res, b"XObject").and_then(|o| o.as_dict().ok()).and_then(|x| x.get(name).ok()) else {
                        continue;
                    };
                    let Ok(Object::Stream(s)) = doc.get_object(*id) else { continue };
                    let subtype = s.dict.get(b"Subtype").and_then(|o| o.as_name()).unwrap_or(b"");
                    if subtype == b"Image" {
                        for &b in &open {
                            blocks[b].draws += 1;
                        }
                        let bbox = bbox_of(&gs.ctm, &[(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]);
                        self.graphics.push((
                            Graphic { kind: GraphicKind::Image, unit, block: None, ops: (i, i), ctm: gs.ctm, bbox },
                            open.iter().copied().collect(),
                        ));
                    } else if subtype == b"Form" && self.depth < 12 {
                        let matrix = get(doc, &s.dict, b"Matrix")
                            .and_then(|o| o.as_array().ok())
                            .filter(|m| m.len() == 6)
                            .map(|m| {
                                let v: Vec<f64> = m.iter().map(|o| deref(doc, o).as_float().unwrap_or(0.0) as f64).collect();
                                [v[0], v[1], v[2], v[3], v[4], v[5]]
                            })
                            .unwrap_or(IDENTITY);
                        let form_res = get(doc, &s.dict, b"Resources").and_then(|o| o.as_dict().ok()).cloned().unwrap_or_else(|| res.clone());
                        let fu = Unit::Form(*id);
                        let parsed = match self.units.get(&fu) {
                            Some(u) => u.ops.clone(),
                            None => {
                                let data = font::stream_bytes(&Object::Stream(s.clone())).unwrap_or_default();
                                let u = decode(&data);
                                let ops = u.ops.clone();
                                self.units.insert(fu, u);
                                ops
                            }
                        };
                        let mut inner = gs.clone();
                        inner.ctm = mul(&matrix, &gs.ctm);
                        let before_drawn = self.drawn.len();
                        let before_graphics = self.graphics.len();
                        let mut form_blocks = Vec::new();
                        self.depth += 1;
                        self.run(fu, &parsed, &form_res, inner, &mut form_blocks);
                        self.depth -= 1;
                        self.settle_blocks(fu, &form_blocks);
                        let added_text = self.drawn.len() > before_drawn;
                        let added = self.graphics.len() - before_graphics;
                        let draws = if added_text { 2 } else { added as u32 };
                        for &b in &open {
                            blocks[b].draws += draws.max(1);
                        }
                        // A form drawing one picture or shape alone moves as a whole, here.
                        if !added_text && added == 1 {
                            let (inner_g, _) = self.graphics.pop().unwrap_or_else(|| unreachable!());
                            self.graphics.push((
                                Graphic { kind: inner_g.kind, unit, block: None, ops: (i, i), ctm: gs.ctm, bbox: inner_g.bbox },
                                open.iter().copied().collect(),
                            ));
                        }
                    }
                }
                "BI" => {
                    for &b in &open {
                        blocks[b].draws += 1;
                    }
                    let bbox = bbox_of(&gs.ctm, &[(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]);
                    self.graphics.push((Graphic { kind: GraphicKind::Image, unit, block: None, ops: (i, i), ctm: gs.ctm, bbox }, open.clone()));
                }
                "m" | "re" => {
                    if path_start.is_none() {
                        path_start = Some(i);
                    }
                    if op.operator == "re" {
                        let (x, y, w, h) = (n(0), n(1), n(2), n(3));
                        for p in [(x, y), (x + w, y), (x, y + h), (x + w, y + h)] {
                            path_pts.push(apply(&gs.ctm, p.0, p.1));
                        }
                    } else {
                        path_pts.push(apply(&gs.ctm, n(0), n(1)));
                    }
                }
                "l" => path_pts.push(apply(&gs.ctm, n(0), n(1))),
                "c" => {
                    for k in 0..3 {
                        path_pts.push(apply(&gs.ctm, n(2 * k), n(2 * k + 1)));
                    }
                }
                "v" | "y" => {
                    for k in 0..2 {
                        path_pts.push(apply(&gs.ctm, n(2 * k), n(2 * k + 1)));
                    }
                }
                "S" | "s" | "f" | "F" | "f*" | "B" | "B*" | "b" | "b*" => {
                    for &b in &open {
                        blocks[b].draws += 1;
                    }
                    if let Some(start) = path_start.take()
                        && !path_pts.is_empty()
                    {
                        let mut bbox = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
                        for &(x, y) in &path_pts {
                            bbox = [bbox[0].min(x), bbox[1].min(y), bbox[2].max(x), bbox[3].max(y)];
                        }
                        self.graphics.push((Graphic { kind: GraphicKind::Shape, unit, block: None, ops: (start, i), ctm: gs.ctm, bbox }, open.clone()));
                    }
                    path_pts.clear();
                }
                "n" => {
                    path_start = None;
                    path_pts.clear();
                }
                _ => {}
            }
        }
    }

    /// Note the glyphs a text-showing operation draws, and move the text position past them.
    fn show(&mut self, unit: Unit, op: usize, elems: &[&Object], gs: &GState, tm: &mut Mat) {
        let Some(fk) = gs.ts.font else { return };
        let ts = &gs.ts;
        let scale = ts.size * ts.th;
        let mut gap = false;
        for (e, o) in elems.iter().enumerate() {
            match o {
                Object::String(bytes, _) => {
                    let codes = self.fonts.list[fk].codes(bytes);
                    let mut offset = 0usize;
                    for (code, len) in codes {
                        let font = &self.fonts.list[fk];
                        let w0 = font.width(code) as f64 / 1000.0;
                        let space = len == 1 && code == 32;
                        let advance = (w0 * ts.size + ts.tc + if space { ts.tw } else { 0.0 }) * ts.th;
                        let m = mul(tm, &gs.ctm);
                        let (x0, y) = apply(&m, 0.0, 0.0);
                        let (x1, _) = apply(&m, advance, 0.0);
                        let upright = m[1].abs() < 1e-6 * m[0].abs().max(1e-9) && m[0] > 0.0 && m[3] > 0.0;
                        if upright && ts.mode != 3 && ts.mode != 7 {
                            let (sx, sy) = (m[0], m[3]);
                            let style = Style {
                                font: fk,
                                size: ts.size * sy,
                                hs: ts.th * sx / sy,
                                tc: ts.tc * ts.th * sx,
                                tw: ts.tw * ts.th * sx,
                                rise: ts.rise * sy,
                                skew: m[2] / sy,
                                mode: ts.mode,
                                color: gs.fill,
                            };
                            self.drawn.push(Drawn {
                                text: font.text(code, len),
                                x0,
                                x1,
                                y,
                                style,
                                glyph: GlyphRef { unit, op, elem: e, start: offset, len, advance, scale },
                                code: (code, len),
                                gap_before: gap,
                            });
                        }
                        gap = false;
                        offset += len as usize;
                        *tm = mul(&[1.0, 0.0, 0.0, 1.0, advance, 0.0], tm);
                    }
                }
                o => {
                    if let Ok(v) = o.as_float() {
                        let tx = -(v as f64) / 1000.0 * scale;
                        if -(v as f64) / 1000.0 > 0.2 {
                            gap = true;
                        }
                        *tm = mul(&[1.0, 0.0, 0.0, 1.0, tx, 0.0], tm);
                    }
                }
            }
        }
    }
}

/// How many components a fill colour space takes.
fn color_components(doc: &Document, res: &Dictionary, name: &[u8]) -> usize {
    match name {
        b"DeviceGray" | b"G" | b"CalGray" => return 1,
        b"DeviceRGB" | b"RGB" | b"CalRGB" => return 3,
        b"DeviceCMYK" | b"CMYK" => return 4,
        b"Pattern" => return 0,
        _ => {}
    }
    let Some(cs) = get(doc, res, b"ColorSpace").and_then(|o| o.as_dict().ok()).and_then(|d| d.get(name).ok()).map(|o| deref(doc, o)) else {
        return 0;
    };
    let arr = match cs {
        Object::Array(a) => a,
        Object::Name(n) => return color_components(doc, res, n),
        _ => return 0,
    };
    match arr.first().and_then(|o| o.as_name().ok()) {
        Some(b"ICCBased") => arr
            .get(1)
            .map(|o| deref(doc, o))
            .and_then(|o| o.as_stream().ok())
            .and_then(|s| s.dict.get(b"N").ok().and_then(|n| n.as_i64().ok()))
            .unwrap_or(3) as usize,
        Some(b"CalRGB") | Some(b"Lab") => 3,
        Some(b"CalGray") => 1,
        _ => 0,
    }
}

fn bbox_of(m: &Mat, pts: &[(f64, f64)]) -> [f64; 4] {
    let mut b = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
    for &(x, y) in pts {
        let (x, y) = apply(m, x, y);
        b = [b[0].min(x), b[1].min(y), b[2].max(x), b[3].max(y)];
    }
    b
}

/// Put drawn glyphs together into lines: glyphs on the same baseline with no wide gap between
/// them, in whatever order the file draws them (a later run can fill a gap in a line, as an
/// edited line's new letters do). A glyph drawn over one already there (a shadow, a fake bold)
/// starts a line of its own. A gap a space wide that holds no space glyph reads as a space.
fn form_lines(drawn: Vec<Drawn>) -> Vec<Line> {
    struct Group {
        baseline: f64,
        size: f64,
        x0: f64,
        x1: f64,
        items: Vec<Drawn>,
    }
    let mut groups: Vec<Group> = Vec::new();
    for d in drawn {
        let size = d.style.size.max(0.1);
        let fits = |g: &Group| {
            let s = g.size.max(size);
            if (g.baseline - d.y).abs() >= 0.2 * s || d.x0 > g.x1 + 1.3 * s || d.x1 < g.x0 - 1.3 * s {
                return false;
            }
            // At the end of the line, the usual case.
            if d.x0 >= g.x1 - 0.6 * s {
                return true;
            }
            // Before or inside it: only into free space.
            let w = (d.x1 - d.x0).max(0.0);
            !g.items.iter().any(|o| {
                let ow = (o.x1 - o.x0).max(0.0);
                let overlap = d.x1.min(o.x1) - d.x0.max(o.x0);
                w.min(ow) > 0.0 && overlap > 0.5 * w.min(ow)
            })
        };
        // Look back a little way: a line's letters are drawn close together in the file.
        let n = groups.len();
        let found = (n.saturating_sub(48)..n).rev().find(|&i| fits(&groups[i]));
        match found {
            Some(i) => {
                let g = &mut groups[i];
                g.x0 = g.x0.min(d.x0);
                g.x1 = g.x1.max(d.x1);
                g.size = g.size.max(size);
                g.items.push(d);
            }
            None => {
                if d.text.trim().is_empty() {
                    // A line doesn't start with a space.
                    continue;
                }
                groups.push(Group { baseline: d.y, size, x0: d.x0, x1: d.x1, items: vec![d] });
            }
        }
    }
    let mut lines: Vec<Line> = Vec::new();
    let mut group = 0u32;
    for mut g in groups {
        g.items.sort_by(|a, b| a.x0.total_cmp(&b.x0));
        // Spaces at the start of the line go.
        let skip = g.items.iter().take_while(|d| d.text.trim().is_empty()).count();
        let mut line = Line { chars: Vec::new(), styles: Vec::new(), baseline: g.baseline, ascent: 0.0, descent: 0.0 };
        for d in g.items.into_iter().skip(skip) {
            let size = d.style.size.max(0.1);
            let style = match line.styles.iter().position(|s| *s == d.style) {
                Some(i) => i,
                None => {
                    line.styles.push(d.style.clone());
                    line.styles.len() - 1
                }
            };
            // A gap that stands for a space (no space glyph in the file).
            if let Some(prev) = line.chars.last() {
                let gap = d.x0 - prev.x1;
                let spaced = prev.ch.is_whitespace() || d.text.starts_with(char::is_whitespace);
                if !spaced && (gap > 0.18 * size || d.gap_before && gap > 0.1 * size) {
                    let (x0, ps) = (prev.x1, prev.style);
                    group += 1;
                    line.chars.push(LChar { ch: ' ', x0, x1: d.x0, style: ps, glyph: None, code: None, group });
                }
            }
            group += 1;
            let chars: Vec<char> = d.text.chars().collect();
            let n = chars.len().max(1) as f64;
            for (k, ch) in chars.iter().enumerate() {
                let w = (d.x1 - d.x0) / n;
                line.chars.push(LChar {
                    ch: *ch,
                    x0: d.x0 + w * k as f64,
                    x1: d.x0 + w * (k + 1) as f64,
                    style,
                    glyph: Some(d.glyph),
                    code: (k == 0).then_some(d.code),
                    group,
                });
            }
        }
        if !line.text().trim().is_empty() {
            lines.push(line);
        }
    }
    lines
}

/// Fill in each line's height from its fonts.
pub fn measure(lines: &mut [Line], fonts: &Fonts) {
    for l in lines {
        let (mut a, mut d) = (0.0f64, 0.0f64);
        for s in &l.styles {
            let f = &fonts.list[s.font];
            a = a.max(f.ascent as f64 / 1000.0 * s.size + s.rise);
            d = d.min(f.descent as f64 / 1000.0 * s.size + s.rise);
        }
        l.ascent = a.max(0.5);
        l.descent = d.min(-0.1);
        // Trailing spaces don't belong to the line's box.
        while l.chars.len() > 1 && l.chars.last().is_some_and(|c| c.ch == ' ' && c.glyph.is_none()) {
            l.chars.pop();
        }
    }
}
