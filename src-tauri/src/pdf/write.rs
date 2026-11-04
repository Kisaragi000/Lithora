//! Writing the edits into the PDF.
//!
//! Nothing the edits don't touch is rewritten: the changed pages, forms and new objects are
//! appended to the original file as an incremental update (the way Acrobat saves), so every
//! other byte of the file — fonts, pictures, links, bookmarks, forms, metadata — stays exactly as
//! it was.
//!
//! On an edited page, the glyphs of edited lines are blanked in place (each becomes a gap its own
//! width, so text after it doesn't move) and the new text is drawn after the page's own content.
//! Letters in the PDF's own fonts are written with those fonts; letters a font lacks, and
//! signatures, are drawn with Krilla into a small form XObject placed on the page.

use super::edit::{self, Edits, Placed, Replacements, Src, TextKey};
use super::font::{PdfFont, code_bytes, deref};
use super::read::{self, Fonts, Mat, PageModel, Unit, apply, invert, mul};
use lopdf::content::{Content, Operation};
use lopdf::{Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use std::collections::{BTreeMap, HashMap, HashSet};

/// What one page's content needs changed.
#[derive(Default)]
struct Patches {
    /// Glyphs to blank, by operation: (array element, byte offset, length, advance, scale).
    blank: HashMap<usize, Vec<(usize, usize, u8, f64, f64)>>,
    before: HashMap<usize, Vec<Operation>>,
    after: HashMap<usize, Vec<Operation>>,
    remove: HashSet<usize>,
}

fn real(v: f64) -> Object {
    // Rounded so the file doesn't fill with float noise.
    let r = (v * 10000.0).round() / 10000.0;
    if r == r.trunc() && r.abs() < 1e9 { Object::Integer(r as i64) } else { Object::Real(r as f32) }
}

fn op(name: &str, args: Vec<Object>) -> Operation {
    Operation::new(name, args)
}

fn cm(m: &Mat) -> Operation {
    op("cm", m.iter().map(|v| real(*v)).collect())
}

/// Blank glyphs inside a text-showing operation: each becomes a TJ gap of its width.
fn blank_glyphs(o: &Operation, blanks: &[(usize, usize, u8, f64, f64)]) -> Vec<Operation> {
    let mut pre = Vec::new();
    let (elems, name): (Vec<Object>, &str) = match o.operator.as_str() {
        "TJ" => (o.operands.first().and_then(|a| a.as_array().ok()).cloned().unwrap_or_default(), "TJ"),
        "Tj" => (o.operands.first().cloned().into_iter().collect(), "Tj"),
        "'" => {
            pre.push(op("T*", vec![]));
            (o.operands.first().cloned().into_iter().collect(), "'")
        }
        "\"" => {
            pre.push(op("Tw", vec![o.operands.first().cloned().unwrap_or(Object::Integer(0))]));
            pre.push(op("Tc", vec![o.operands.get(1).cloned().unwrap_or(Object::Integer(0))]));
            pre.push(op("T*", vec![]));
            (o.operands.get(2).cloned().into_iter().collect(), "\"")
        }
        _ => return vec![o.clone()],
    };
    let _ = name;
    let mut out: Vec<Object> = Vec::new();
    for (e, obj) in elems.iter().enumerate() {
        let Object::String(bytes, fmt) = obj else {
            out.push(obj.clone());
            continue;
        };
        let mut here: Vec<&(usize, usize, u8, f64, f64)> = blanks.iter().filter(|b| b.0 == e).collect();
        if here.is_empty() {
            out.push(obj.clone());
            continue;
        }
        here.sort_by_key(|b| b.1);
        let mut pos = 0usize;
        let mut kept: Vec<u8> = Vec::new();
        let mut gap = 0.0f64;
        let flush_kept = |kept: &mut Vec<u8>, out: &mut Vec<Object>| {
            if !kept.is_empty() {
                out.push(Object::String(std::mem::take(kept), *fmt));
            }
        };
        let flush_gap = |gap: &mut f64, out: &mut Vec<Object>| {
            if *gap != 0.0 {
                out.push(real(*gap));
                *gap = 0.0;
            }
        };
        for b in here {
            if b.1 < pos || b.1 >= bytes.len() {
                continue;
            }
            if b.1 > pos {
                flush_gap(&mut gap, &mut out);
                kept.extend_from_slice(&bytes[pos..b.1]);
            }
            flush_kept(&mut kept, &mut out);
            if b.4.abs() > 1e-9 {
                gap += -b.3 * 1000.0 / b.4;
            }
            pos = b.1 + b.2 as usize;
        }
        flush_gap(&mut gap, &mut out);
        if pos < bytes.len() {
            kept.extend_from_slice(&bytes[pos..]);
        }
        flush_kept(&mut kept, &mut out);
    }
    pre.push(op("TJ", vec![Object::Array(out)]));
    pre
}

fn patched(ops: &[Operation], p: &Patches) -> Vec<Operation> {
    let mut out = Vec::with_capacity(ops.len() + 16);
    for (i, o) in ops.iter().enumerate() {
        if let Some(b) = p.before.get(&i) {
            out.extend(b.iter().cloned());
        }
        if !p.remove.contains(&i) {
            match p.blank.get(&i) {
                Some(bl) => out.extend(blank_glyphs(o, bl)),
                None => out.push(o.clone()),
            }
        }
        if let Some(a) = p.after.get(&i) {
            out.extend(a.iter().cloned());
        }
    }
    out
}

/// The page's MediaBox (x0, y0, x1, y1), inherited if need be.
pub fn media_box(doc: &Document, page: ObjectId) -> [f64; 4] {
    let mut node = doc.get_dictionary(page).ok();
    let mut depth = 0;
    while let Some(d) = node {
        if let Some(a) = super::font::get(doc, d, b"MediaBox").and_then(|o| o.as_array().ok())
            && a.len() == 4
        {
            let v: Vec<f64> = a.iter().map(|o| deref(doc, o).as_float().unwrap_or(0.0) as f64).collect();
            return [v[0].min(v[2]), v[1].min(v[3]), v[0].max(v[2]), v[1].max(v[3])];
        }
        node = d.get(b"Parent").ok().and_then(|p| p.as_reference().ok()).and_then(|id| doc.get_dictionary(id).ok());
        depth += 1;
        if depth > 32 {
            break;
        }
    }
    [0.0, 0.0, 612.0, 792.0]
}

/// A resource dictionary we can add to: every sub-dictionary made direct.
fn own_resources(doc: &Document, res: &Dictionary) -> Dictionary {
    let mut out = Dictionary::new();
    for (k, v) in res.iter() {
        let v = deref(doc, v);
        out.set(k.clone(), v.clone());
    }
    out
}

fn add_resource(res: &mut Dictionary, kind: &[u8], name: &str, value: Object) {
    if !matches!(res.get(kind), Ok(Object::Dictionary(_))) {
        res.set(kind.to_vec(), Object::Dictionary(Dictionary::new()));
    }
    if let Ok(Object::Dictionary(d)) = res.get_mut(kind) {
        d.set(name.as_bytes().to_vec(), value);
    }
}

/// The ops that draw letters in the PDF's own fonts.
fn text_ops(placed: &[Placed], edit: &edit::TextEdit, fonts: &[PdfFont], used: &mut BTreeMap<usize, ()>, baseline: f64) -> Vec<Operation> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < placed.len() {
        let Src::Code { font, .. } = placed[i].src else {
            i += 1;
            continue;
        };
        let style_idx = placed[i].style;
        let st = &edit.styles[style_idx];
        // The run: letters in this font and style (blanks inside it are just gaps).
        let mut j = i;
        let mut glyphs: Vec<&Placed> = Vec::new();
        while j < placed.len() && placed[j].style == style_idx {
            match placed[j].src {
                Src::Code { font: f, .. } if f == font => glyphs.push(&placed[j]),
                Src::Blank => {}
                _ => break,
            }
            j += 1;
        }
        used.insert(font, ());
        let f = &fonts[font];
        let hs = if st.hs.abs() < 1e-6 { 1.0 } else { st.hs };
        let scale = st.size * hs;
        out.push(op("BT", vec![]));
        out.push(op("Tf", vec![Object::Name(format!("LthF{font}").into_bytes()), real(st.size)]));
        out.push(op("Tz", vec![real(hs * 100.0)]));
        out.push(op("Tc", vec![real(st.tc / hs)]));
        out.push(op("Tw", vec![real(st.tw / hs)]));
        out.push(op("Ts", vec![real(st.rise)]));
        out.push(op("Tr", vec![Object::Integer(st.mode.clamp(0, 7))]));
        out.extend(color_ops(&st.color, st.mode == 1 || st.mode == 2));
        let x0 = glyphs.first().map(|g| g.x).unwrap_or(0.0);
        out.push(op("Tm", vec![real(1.0), real(0.0), real(st.skew), real(1.0), real(x0), real(baseline)]));
        let mut arr: Vec<Object> = Vec::new();
        let mut pen = x0;
        for g in &glyphs {
            let Src::Code { code, len, .. } = g.src else { continue };
            let gap = g.x - pen;
            if gap.abs() > 1e-4 && scale.abs() > 1e-9 {
                arr.push(real(-gap * 1000.0 / scale));
            }
            arr.push(Object::String(code_bytes(code, len), StringFormat::Hexadecimal));
            let w = f.width(code) as f64 / 1000.0;
            let natural = w * st.size * hs + st.tc + if len == 1 && code == 32 { st.tw } else { 0.0 };
            pen = g.x + natural;
        }
        out.push(op("TJ", vec![Object::Array(arr)]));
        out.push(op("ET", vec![]));
        i = j.max(i + 1);
    }
    // Underlines, for letters set underlined.
    for p in placed {
        let st = &edit.styles[p.style];
        if st.underline && p.advance > 0.0 {
            out.push(op("q", vec![]));
            out.extend(color_ops(&st.color, false));
            out.push(op("re", vec![real(p.x), real(baseline - st.size * 0.12), real(p.advance), real((st.size * 0.06).max(0.4))]));
            out.push(op("f", vec![]));
            out.push(op("Q", vec![]));
        }
    }
    out
}

fn color_ops(c: &read::Color, stroke: bool) -> Vec<Operation> {
    let mut v = Vec::new();
    let (fill, strokeop, args): (&str, &str, Vec<f32>) = match *c {
        read::Color::Gray { v } => ("g", "G", vec![v]),
        read::Color::Rgb { r, g, b } => ("rg", "RG", vec![r, g, b]),
        read::Color::Cmyk { c, m, y, k } => ("k", "K", vec![c, m, y, k]),
    };
    v.push(op(fill, args.iter().map(|x| real(*x as f64)).collect()));
    if stroke {
        v.push(op(strokeop, args.iter().map(|x| real(*x as f64)).collect()));
    }
    v
}

/// Something Krilla draws on a page: a run of replacement-font letters, or a picture.
enum Overlay {
    Run { glyphs: Vec<(u32, f64, std::ops::Range<usize>)>, text: String, face: &'static wordcraft_fonts::FontFace, size: f64, hs: f64, skew: f64, x: f64, y: f64, color: [f32; 3] },
    Picture { png: std::sync::Arc<Vec<u8>>, rect: [f64; 4] },
}

fn overlay_runs(placed: &[Placed], edit: &edit::TextEdit, baseline: f64, out: &mut Vec<Overlay>) {
    let mut i = 0;
    while i < placed.len() {
        let Src::Face { face, .. } = placed[i].src else {
            i += 1;
            continue;
        };
        let style = placed[i].style;
        let st = &edit.styles[style];
        let mut glyphs = Vec::new();
        let mut text = String::new();
        let mut j = i;
        while j < placed.len() && placed[j].style == style {
            match placed[j].src {
                Src::Face { face: f, gid } if f.id() == face.id() => {
                    let start = text.len();
                    text.push(placed[j].ch);
                    glyphs.push((gid, placed[j].x, start..text.len()));
                }
                _ => break,
            }
            j += 1;
        }
        out.push(Overlay::Run {
            glyphs,
            text,
            face,
            size: st.size,
            hs: if st.hs.abs() < 1e-6 { 1.0 } else { st.hs },
            skew: st.skew,
            x: placed[i].x,
            y: baseline + st.rise,
            color: st.color.rgb(),
        });
        i = j;
    }
}

/// Draw the overlays of each page with Krilla: one PDF, a page per edited page.
fn krilla_overlays(pages: &[([f64; 4], Vec<Overlay>)]) -> Result<Vec<u8>, String> {
    use krilla::Document as KDoc;
    use krilla::color::rgb;
    use krilla::geom::{Point, Size, Transform};
    use krilla::num::NormalizedF32;
    use krilla::page::PageSettings;
    use krilla::paint::{Fill, FillRule};
    use krilla::text::{Font, GlyphId, KrillaGlyph};
    let settings = krilla::SerializeSettings { enable_tagging: false, xmp_metadata: false, ..Default::default() };
    let mut doc = KDoc::new_with(settings);
    let mut fonts: HashMap<u32, Font> = HashMap::new();
    for (mb, items) in pages {
        let (w, h) = ((mb[2] - mb[0]) as f32, (mb[3] - mb[1]) as f32);
        let mut page = doc.start_page_with(PageSettings::from_wh(w.max(1.0), h.max(1.0)).ok_or("bad page size")?);
        let mut surface = page.surface();
        for item in items {
            match item {
                Overlay::Run { glyphs, text, face, size, hs, skew, x, y, color } => {
                    let font = match fonts.get(&face.id()) {
                        Some(f) => f.clone(),
                        None => {
                            let data: Vec<u8> = face.data().to_vec();
                            let f = Font::new(data.into(), face.index()).ok_or_else(|| format!("couldn't use the font {}", face.family))?;
                            fonts.insert(face.id(), f.clone());
                            f
                        }
                    };
                    let upem = face.units_per_em();
                    let kg: Vec<KrillaGlyph> = glyphs
                        .iter()
                        .enumerate()
                        .map(|(k, (gid, gx, range))| {
                            let natural = face.advance(*gid) / upem;
                            let adv = match glyphs.get(k + 1) {
                                Some((_, nx, _)) => (nx - gx) / hs / size,
                                None => natural,
                            };
                            KrillaGlyph {
                                glyph_id: GlyphId::new(*gid),
                                text_range: range.clone(),
                                x_advance: adv as f32,
                                x_offset: 0.0,
                                y_offset: 0.0,
                                y_advance: 0.0,
                                location: None,
                            }
                        })
                        .collect();
                    let tx = (x - mb[0]) as f32;
                    let ty = (mb[3] - y) as f32;
                    surface.push_transform(&Transform::from_row(*hs as f32, 0.0, -*skew as f32, 1.0, tx, ty));
                    let c = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
                    surface.set_fill(Some(Fill {
                        paint: rgb::Color::new(c(color[0]), c(color[1]), c(color[2])).into(),
                        opacity: NormalizedF32::ONE,
                        rule: FillRule::default(),
                    }));
                    surface.draw_glyphs(Point::from_xy(0.0, 0.0), &kg, font, text, *size as f32, false);
                    surface.pop();
                }
                Overlay::Picture { png, rect } => {
                    let image = krilla::image::Image::from_png(png.as_ref().clone().into(), true).map_err(|e| format!("couldn't read the picture: {e}"))?;
                    let (iw, ih) = ((rect[2] - rect[0]) as f32, (rect[3] - rect[1]) as f32);
                    surface.push_transform(&Transform::from_translate((rect[0] - mb[0]) as f32, (mb[3] - rect[3]) as f32));
                    if let Some(size) = Size::from_wh(iw.max(0.1), ih.max(0.1)) {
                        surface.draw_image(image, size);
                    }
                    surface.pop();
                }
            }
        }
        surface.finish();
        page.finish();
    }
    doc.finish().map_err(|e| format!("couldn't draw the new text: {e:?}"))
}

/// Copy an object from another document, giving each object it refers to a new number.
fn copy_object(src: &Document, o: &Object, map: &mut HashMap<ObjectId, ObjectId>, next: &mut u32, out: &mut Vec<(ObjectId, Object)>) -> Object {
    match o {
        Object::Reference(id) => {
            if let Some(n) = map.get(id) {
                return Object::Reference(*n);
            }
            let new = (*next, 0);
            *next += 1;
            map.insert(*id, new);
            let target = src.get_object(*id).cloned().unwrap_or(Object::Null);
            let copied = copy_object(src, &target, map, next, out);
            out.push((new, copied));
            Object::Reference(new)
        }
        Object::Array(a) => Object::Array(a.iter().map(|x| copy_object(src, x, map, next, out)).collect()),
        Object::Dictionary(d) => {
            let mut nd = Dictionary::new();
            for (k, v) in d.iter() {
                nd.set(k.clone(), copy_object(src, v, map, next, out));
            }
            Object::Dictionary(nd)
        }
        Object::Stream(s) => {
            let mut nd = Dictionary::new();
            for (k, v) in s.dict.iter() {
                nd.set(k.clone(), copy_object(src, v, map, next, out));
            }
            Object::Stream(Stream::new(nd, s.content.clone()).with_compression(false))
        }
        other => other.clone(),
    }
}

/// Everything the writer needs to know about the document.
pub struct Source<'a> {
    pub doc: &'a Document,
    pub pages: &'a [ObjectId],
    pub models: &'a HashMap<usize, PageModel>,
    pub fonts: &'a Fonts,
    pub repl: &'a Replacements,
}

/// The objects that change, and the new ones, for `edits`.
pub fn objects(src: &Source, edits: &Edits) -> Result<Vec<(ObjectId, Object)>, String> {
    let doc = src.doc;
    let mut next = doc.max_id.max(doc.trailer.get(b"Size").and_then(|o| o.as_i64()).unwrap_or(0).saturating_sub(1) as u32) + 1;
    let mut out: Vec<(ObjectId, Object)> = Vec::new();
    let mut patches: HashMap<Unit, Patches> = HashMap::new();
    struct PageOut {
        index: usize,
        appended: Vec<Operation>,
        fonts: BTreeMap<usize, ()>,
        overlays: Vec<Overlay>,
    }
    let mut page_outs: Vec<PageOut> = Vec::new();
    for p in edits.pages() {
        let model = src.models.get(&p).ok_or("a page was edited before it was read")?;
        let page_id = *src.pages.get(p).ok_or("no such page")?;
        let mb = media_box(doc, page_id);
        let mut po = PageOut { index: p, appended: Vec::new(), fonts: BTreeMap::new(), overlays: Vec::new() };
        for ((_, key), te) in edits.texts.range((p, TextKey::Line(0))..=(p, TextKey::New(u32::MAX))) {
            let line = match key {
                TextKey::Line(l) => {
                    let line = model.lines.get(*l).ok_or("no such line")?;
                    // Blank the line's glyphs where the PDF drew them.
                    for c in &line.chars {
                        if let Some(g) = c.glyph {
                            let list = patches.entry(g.unit).or_default().blank.entry(g.op).or_default();
                            let entry = (g.elem, g.start, g.len, g.advance, g.scale);
                            if !list.iter().any(|b| b.0 == entry.0 && b.1 == entry.1) {
                                list.push(entry);
                            }
                        }
                    }
                    Some(line)
                }
                TextKey::New(_) => None,
            };
            let placed = edit::layout(te, line, &src.fonts.list, src.repl);
            let baseline = te.baseline + te.dy;
            po.appended.extend(text_ops(&placed, te, &src.fonts.list, &mut po.fonts, baseline));
            overlay_runs(&placed, te, baseline, &mut po.overlays);
        }
        for ((_, g), ge) in edits.graphics.range((p, 0)..=(p, usize::MAX)) {
            let gr = model.graphics.get(*g).ok_or("no such picture")?;
            let pt = patches.entry(gr.unit).or_default();
            if ge.deleted {
                let (s, e) = gr.block.unwrap_or(gr.ops);
                for i in s..=e {
                    pt.remove.insert(i);
                }
                continue;
            }
            let Some(inv) = invert(&gr.ctm) else { continue };
            let x = mul(&mul(&gr.ctm, &ge.m), &inv);
            match gr.block {
                Some((s, _)) => pt.after.entry(s).or_default().push(cm(&x)),
                None => {
                    let b = pt.before.entry(gr.ops.0).or_default();
                    b.push(op("q", vec![]));
                    b.push(cm(&x));
                    pt.after.entry(gr.ops.1).or_default().push(op("Q", vec![]));
                }
            }
        }
        for s in edits.stamps.iter().filter(|s| s.page == p) {
            po.overlays.push(Overlay::Picture { png: s.png.clone(), rect: s.rect });
        }
        let _ = mb;
        page_outs.push(po);
    }
    // Forms whose glyphs or drawings changed are written again.
    for (unit, pt) in &patches {
        let Unit::Form(id) = unit else { continue };
        let model = src.models.values().find_map(|m| m.units.get(unit)).ok_or("a form wasn't read")?;
        if !model.exact {
            return Err("this part of the page can't be edited".into());
        }
        let ops = patched(&model.ops, pt);
        let data = Content { operations: ops }.encode().map_err(|e| e.to_string())?;
        let Ok(Object::Stream(orig)) = doc.get_object(*id) else { continue };
        let mut dict = orig.dict.clone();
        dict.remove(b"Filter");
        dict.remove(b"DecodeParms");
        let mut s = Stream::new(dict, data);
        let _ = s.compress();
        out.push((*id, Object::Stream(s)));
    }
    // Pictures and replacement-font letters, drawn with Krilla, one page per edited page.
    let with_overlays: Vec<usize> = page_outs.iter().enumerate().filter(|(_, po)| !po.overlays.is_empty()).map(|(i, _)| i).collect();
    let mut overlay_forms: HashMap<usize, ObjectId> = HashMap::new();
    if !with_overlays.is_empty() {
        let input: Vec<([f64; 4], Vec<Overlay>)> = with_overlays
            .iter()
            .map(|&i| {
                let page_id = src.pages[page_outs[i].index];
                (media_box(doc, page_id), std::mem::take(&mut page_outs[i].overlays))
            })
            .collect();
        let boxes: Vec<[f64; 4]> = input.iter().map(|(b, _)| *b).collect();
        let bytes = krilla_overlays(&input)?;
        let kdoc = Document::load_mem(&bytes).map_err(|e| format!("couldn't read the new text back: {e}"))?;
        let kpages: Vec<ObjectId> = kdoc.page_iter().collect();
        let mut map = HashMap::new();
        for (n, &i) in with_overlays.iter().enumerate() {
            let Some(&kp) = kpages.get(n) else { continue };
            let content = kdoc.get_page_content(kp);
            let res = read::page_resources(&kdoc, kp);
            let res = copy_object(&kdoc, &Object::Dictionary(res), &mut map, &mut next, &mut out);
            let b = boxes[n];
            let mut dict = Dictionary::new();
            dict.set("Type", Object::Name(b"XObject".to_vec()));
            dict.set("Subtype", Object::Name(b"Form".to_vec()));
            dict.set("BBox", Object::Array(vec![real(0.0), real(0.0), real(b[2] - b[0]), real(b[3] - b[1])]));
            dict.set("Resources", res);
            let mut s = Stream::new(dict, content);
            let _ = s.compress();
            let id = (next, 0);
            next += 1;
            out.push((id, Object::Stream(s)));
            overlay_forms.insert(i, id);
        }
    }
    // The edited pages: new content (the old, its glyphs blanked, then the new text) and
    // resources of their own that name the fonts and drawings used.
    for (i, po) in page_outs.iter().enumerate() {
        let page_id = src.pages[po.index];
        let model = &src.models[&po.index];
        let body = match patches.get(&Unit::Page) {
            Some(pt) if page_has(pt) => {
                let unit = model.units.get(&Unit::Page).ok_or("the page wasn't read")?;
                if !unit.exact {
                    return Err("this page's content can't be edited".into());
                }
                Content { operations: patched(&unit.ops, pt) }.encode().map_err(|e| e.to_string())?
            }
            _ => doc.get_page_content(page_id),
        };
        let mut res = own_resources(doc, &read::page_resources(doc, page_id));
        for k in po.fonts.keys() {
            let f = &src.fonts.list[*k];
            let value = match f.obj {
                Some(id) => Object::Reference(id),
                None => Object::Dictionary(f.dict.clone()),
            };
            add_resource(&mut res, b"Font", &format!("LthF{k}"), value);
        }
        let mut tail = po.appended.clone();
        if let Some(id) = overlay_forms.get(&i) {
            add_resource(&mut res, b"XObject", "LthOverlay", Object::Reference(*id));
            let mb = media_box(doc, page_id);
            tail.push(op("q", vec![]));
            tail.push(cm(&[1.0, 0.0, 0.0, 1.0, mb[0], mb[1]]));
            tail.push(op("Do", vec![Object::Name(b"LthOverlay".to_vec())]));
            tail.push(op("Q", vec![]));
        }
        let mut data = b"q\n".to_vec();
        data.extend_from_slice(&body);
        data.extend_from_slice(b"\nQ\n");
        data.extend_from_slice(&Content { operations: tail }.encode().map_err(|e| e.to_string())?);
        let mut s = Stream::new(Dictionary::new(), data);
        let _ = s.compress();
        let content_id = (next, 0);
        next += 1;
        out.push((content_id, Object::Stream(s)));
        let mut page = doc.get_dictionary(page_id).map_err(|e| e.to_string())?.clone();
        page.set("Contents", Object::Reference(content_id));
        page.set("Resources", Object::Dictionary(res));
        out.push((page_id, Object::Dictionary(page)));
    }
    Ok(out)
}

fn page_has(p: &Patches) -> bool {
    !p.blank.is_empty() || !p.before.is_empty() || !p.after.is_empty() || !p.remove.is_empty()
}

/// Where the last cross-reference section starts (the number after the last `startxref`).
fn last_startxref(bytes: &[u8]) -> Option<usize> {
    let tail = &bytes[bytes.len().saturating_sub(4096)..];
    let pos = tail.windows(9).rposition(|w| w == b"startxref")?;
    let rest = &tail[pos + 9..];
    let digits: String = rest.iter().skip_while(|b| b.is_ascii_whitespace()).take_while(|b| b.is_ascii_digit()).map(|b| *b as char).collect();
    digits.parse().ok()
}

/// Is the section at `offset` an old-style table ("xref") rather than a stream?
fn is_table(bytes: &[u8], offset: usize) -> bool {
    bytes.get(offset..).is_some_and(|b| b.iter().skip_while(|c| c.is_ascii_whitespace()).take(4).eq(b"xref".iter()))
}

/// `base` with the objects appended as an incremental update.
pub fn append(base: &[u8], trailer: &Dictionary, objects: &[(ObjectId, Object)], encrypt: Option<&lopdf::EncryptionState>) -> Result<Vec<u8>, String> {
    let mut out = base.to_vec();
    if objects.is_empty() {
        return Ok(out);
    }
    let prev = last_startxref(base);
    if !out.ends_with(b"\n") {
        out.push(b'\n');
    }
    let mut offsets: BTreeMap<u32, (usize, u16)> = BTreeMap::new();
    for (id, obj) in objects {
        let mut obj = obj.clone();
        if let Some(state) = encrypt {
            lopdf::encryption::encrypt_object(state, *id, &mut obj).map_err(|e| format!("couldn't encrypt the changes: {e:?}"))?;
        }
        offsets.insert(id.0, (out.len(), id.1));
        out.extend_from_slice(format!("{} {} obj\n", id.0, id.1).as_bytes());
        lopdf::Writer::write_object(&mut out, &obj).map_err(|e| e.to_string())?;
        out.extend_from_slice(b"\nendobj\n");
    }
    let max = offsets.keys().last().copied().unwrap_or(0);
    let size = (max as i64 + 1).max(trailer.get(b"Size").and_then(|o| o.as_i64()).unwrap_or(0));
    let mut tr = Dictionary::new();
    tr.set("Size", Object::Integer(size));
    for key in [b"Root".as_slice(), b"Info", b"ID", b"Encrypt"] {
        if let Ok(v) = trailer.get(key) {
            tr.set(key.to_vec(), v.clone());
        }
    }
    if let Some(p) = prev {
        tr.set("Prev", Object::Integer(p as i64));
    }
    let xref_at = out.len();
    if prev.is_none_or(|p| is_table(base, p)) {
        // An old-style table after old-style tables.
        out.extend_from_slice(b"xref\n");
        let ids: Vec<u32> = offsets.keys().copied().collect();
        let mut k = 0;
        while k < ids.len() {
            let start = ids[k];
            let mut end = k;
            while end + 1 < ids.len() && ids[end + 1] == ids[end] + 1 {
                end += 1;
            }
            out.extend_from_slice(format!("{} {}\n", start, end - k + 1).as_bytes());
            for id in &ids[k..=end] {
                let (off, generation) = offsets[id];
                out.extend_from_slice(format!("{off:010} {generation:05} n\r\n").as_bytes());
            }
            k = end + 1;
        }
        out.extend_from_slice(b"trailer\n");
        lopdf::Writer::write_object(&mut out, &Object::Dictionary(tr)).map_err(|e| e.to_string())?;
    } else {
        // A cross-reference stream after cross-reference streams (PDF 1.5 and later).
        let self_id = (size as u32, 0u16);
        offsets.insert(self_id.0, (xref_at, 0));
        let mut index = Vec::new();
        let mut rows = Vec::new();
        let ids: Vec<u32> = offsets.keys().copied().collect();
        let mut k = 0;
        while k < ids.len() {
            let start = ids[k];
            let mut end = k;
            while end + 1 < ids.len() && ids[end + 1] == ids[end] + 1 {
                end += 1;
            }
            index.push(Object::Integer(start as i64));
            index.push(Object::Integer((end - k + 1) as i64));
            for id in &ids[k..=end] {
                let (off, generation) = offsets[id];
                rows.push(1u8);
                rows.extend_from_slice(&(off as u32).to_be_bytes());
                rows.extend_from_slice(&generation.to_be_bytes());
            }
            k = end + 1;
        }
        tr.set("Size", Object::Integer(size + 1));
        tr.set("Type", Object::Name(b"XRef".to_vec()));
        tr.set("W", Object::Array(vec![Object::Integer(1), Object::Integer(4), Object::Integer(2)]));
        tr.set("Index", Object::Array(index));
        let s = Stream::new(tr, rows);
        out.extend_from_slice(format!("{} 0 obj\n", self_id.0).as_bytes());
        lopdf::Writer::write_object(&mut out, &Object::Stream(s)).map_err(|e| e.to_string())?;
        out.extend_from_slice(b"\nendobj\n");
    }
    out.extend_from_slice(format!("\nstartxref\n{xref_at}\n%%EOF\n").as_bytes());
    Ok(out)
}

/// Where a point of the page is drawn on screen: `display` maps page space to the view
/// (points, y down), from the renderer.
pub fn to_view(display: &Mat, x: f64, y: f64) -> (f64, f64) {
    apply(display, x, y)
}
