use super::*;

/// A small PDF drawn with Krilla: three lines in two fonts and colours, Russian and Armenian
/// text, and a square.
pub(crate) fn fixture() -> Vec<u8> {
    use krilla::color::rgb;
    use krilla::geom::{PathBuilder, Point, Rect};
    use krilla::num::NormalizedF32;
    use krilla::page::PageSettings;
    use krilla::paint::{Fill, FillRule};
    use krilla::text::{Font, TextDirection};
    let db = wordcraft_fonts::FontDb::global();
    let sans = db.face("Source Sans 3", "Regular");
    let serif = db.face("Source Serif 4", "Bold");
    let font = |f: &wordcraft_fonts::FontFace| Font::new(f.data().to_vec().into(), f.index()).unwrap();
    let (sans_f, serif_f) = (font(&sans), font(&serif));
    let mut doc = krilla::Document::new();
    let mut page = doc.start_page_with(PageSettings::from_wh(595.0, 842.0).unwrap());
    let mut s = page.surface();
    let fill = |r, g, b| Fill { paint: rgb::Color::new(r, g, b).into(), opacity: NormalizedF32::ONE, rule: FillRule::default() };
    s.set_fill(Some(fill(0, 0, 0)));
    s.draw_text(Point::from_xy(72.0, 100.0), serif_f.clone(), 24.0, "Quarterly Report", false, TextDirection::Auto);
    s.set_fill(Some(fill(20, 60, 160)));
    s.draw_text(Point::from_xy(72.0, 140.0), sans_f.clone(), 12.0, "Sales grew by 12 percent in the north region.", false, TextDirection::Auto);
    s.set_fill(Some(fill(0, 0, 0)));
    s.draw_text(Point::from_xy(72.0, 160.0), sans_f.clone(), 12.0, "Привет, мир.", false, TextDirection::Auto);
    // Source Sans has no Armenian letters: those come from an installed font that has them.
    if let Some(hy) = db.fallback_for('Բ', 0) {
        s.draw_text(Point::from_xy(72.0, 180.0), font(&hy), 12.0, "Բարև աշխարհ.", false, TextDirection::Auto);
    }
    s.set_fill(Some(fill(200, 40, 40)));
    let mut pb = PathBuilder::new();
    pb.push_rect(Rect::from_xywh(72.0, 200.0, 100.0, 60.0).unwrap());
    s.draw_path(&pb.finish().unwrap());
    s.finish();
    page.finish();
    doc.finish().unwrap()
}

fn texts(d: &mut PdfDoc, page: usize) -> Vec<String> {
    page_items(d, page).unwrap().texts.into_iter().map(|t| t.text).collect()
}

#[test]
fn reads_lines_of_a_pdf() {
    let mut d = open_bytes("t.pdf".into(), None, fixture(), None).unwrap();
    let t = texts(&mut d, 0);
    let mut want = vec!["Quarterly Report", "Sales grew by 12 percent in the north region.", "Привет, мир."];
    // Armenian, where this computer has a font for it.
    if wordcraft_fonts::FontDb::global().fallback_for('Բ', 0).is_some() {
        want.push("Բարև աշխարհ.");
    }
    assert_eq!(t, want, "{t:?}");
    let items = page_items(&mut d, 0).unwrap();
    assert_eq!(items.graphics.len(), 1);
    let head = &items.texts[0];
    assert!((head.size - 24.0).abs() < 0.1, "{}", head.size);
    assert!(head.bold);
    assert_eq!(items.texts[1].color, "#143ca0");
}

/// Edit a line, save, open the saved file: the new text is there, in the PDF's own font where
/// it has the letters, and the other lines haven't moved.
#[test]
fn edits_survive_saving_and_reopening() {
    let mut d = open_bytes("t.pdf".into(), None, fixture(), None).unwrap();
    let before = page_items(&mut d, 0).unwrap();
    d.model(0).unwrap();
    edit_of(&mut d, 0, TextKey::Line(1)).unwrap().set_text("Sales grew by 21 percent in the north region.");
    d.stale = true;
    let after = page_items(&mut d, 0).unwrap();
    let t = &after.texts[1];
    assert_eq!(t.text, "Sales grew by 21 percent in the north region.");
    assert!(t.substituted.is_empty(), "letters the subset has stay in its font: {:?}", t.substituted);
    // The untouched start of the line is where it was.
    assert!((t.edges[0] - before.texts[1].edges[0]).abs() < 0.01);
    assert!((t.edges[10] - before.texts[1].edges[10]).abs() < 0.01);
    let bytes = d.file_bytes().unwrap();
    let mut again = open_bytes("t.pdf".into(), None, bytes, None).unwrap();
    let items = page_items(&mut again, 0).unwrap();
    let find = |s: &str| items.texts.iter().find(|t| t.text == s).unwrap_or_else(|| panic!("{s:?} in {:?}", items.texts.iter().map(|t| &t.text).collect::<Vec<_>>()));
    // The edited line is where it was, and no trace of the old text is left.
    let edited = find("Sales grew by 21 percent in the north region.");
    assert!((edited.baseline - before.texts[1].baseline).abs() < 0.01);
    assert!((edited.edges[0] - before.texts[1].edges[0]).abs() < 0.01);
    assert!(!items.texts.iter().any(|t| t.text.contains("12 percent")));
    assert!((find("Quarterly Report").y - before.texts[0].y).abs() < 0.01);
    assert!((find("Привет, мир.").y - before.texts[2].y).abs() < 0.01);
}

/// A letter the font's subset doesn't hold is drawn from the installed font, and reads back.
#[test]
fn new_letters_come_from_a_replacement_font() {
    let mut d = open_bytes("t.pdf".into(), None, fixture(), None).unwrap();
    d.model(0).unwrap();
    edit_of(&mut d, 0, TextKey::Line(0)).unwrap().set_text("Quarterly Report Ж");
    d.stale = true;
    let item = &page_items(&mut d, 0).unwrap().texts[0];
    assert_eq!(item.text, "Quarterly Report Ж");
    // Source Serif 4 is installed, so its own Ж is used and nothing is reported missing.
    assert!(item.substituted.is_empty(), "{:?}", item.substituted);
    let bytes = d.file_bytes().unwrap();
    let mut again = open_bytes("t.pdf".into(), None, bytes, None).unwrap();
    let t = texts(&mut again, 0);
    // The new letter, drawn in another font, reads back as part of the same line.
    assert!(t.iter().any(|l| l == "Quarterly Report Ж"), "{t:?}");
}

#[test]
fn moving_a_shape_and_undo() {
    let mut d = open_bytes("t.pdf".into(), None, fixture(), None).unwrap();
    let g = page_items(&mut d, 0).unwrap().graphics[0].x;
    let items = page_items(&mut d, 0).unwrap();
    let r = &items.graphics[0];
    let rect = [r.x + 50.0, r.y + 20.0, r.width, r.height];
    let old = d.models[&0].graphics[0].bbox;
    let edit = GraphicEdit { m: [1.0, 0.0, 0.0, 1.0, 50.0, -20.0], deleted: false };
    let _ = rect;
    let _ = old;
    d.change(|e| {
        e.graphics.insert((0, 0), edit);
    });
    let moved = page_items(&mut d, 0).unwrap().graphics[0].x;
    assert!((moved - g - 50.0).abs() < 0.01);
    let bytes = d.file_bytes().unwrap();
    let mut again = open_bytes("t.pdf".into(), None, bytes, None).unwrap();
    let x = page_items(&mut again, 0).unwrap().graphics[0].x;
    assert!((x - g - 50.0).abs() < 0.01, "{x} vs {g}");
    d.edits = d.undo.pop().unwrap();
    assert!((page_items(&mut d, 0).unwrap().graphics[0].x - g).abs() < 0.01);
}

/// Saving without edits writes the file as it was, byte for byte.
#[test]
fn unedited_save_is_the_same_file() {
    let bytes = fixture();
    let mut d = open_bytes("t.pdf".into(), None, bytes.clone(), None).unwrap();
    assert_eq!(d.file_bytes().unwrap(), bytes);
}

fn png(d: &mut PdfDoc, page: usize, out: &std::path::Path) {
    let bytes = d.current().unwrap();
    let pdf = hayro::hayro_syntax::Pdf::new(bytes.as_ref().clone()).unwrap();
    let (w, h, _, _, px) = render::draw(&pdf, page, 1.5, None, &render::settings(HashMap::new())).unwrap();
    let img = image::RgbaImage::from_raw(w, h, px).unwrap();
    img.save(out).unwrap();
}

/// Open the PDFs in LITHORA_PDFS (separated by ':'), read every page, then on page
/// LITHORA_PDF_PAGE (1-based, default 1) add a word in the middle of the first longer line and
/// move the first picture, save, open again and check. Pictures of each step go to
/// LITHORA_PDF_OUT (default: the temp folder).
/// `LITHORA_PDFS=a.pdf:b.pdf cargo test --lib pdf::tests::real_files -- --ignored --nocapture`
#[test]
#[ignore]
fn real_files() {
    let files = std::env::var("LITHORA_PDFS").unwrap_or_default();
    let out = PathBuf::from(std::env::var("LITHORA_PDF_OUT").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned()));
    let page: usize = std::env::var("LITHORA_PDF_PAGE").ok().and_then(|p| p.parse().ok()).unwrap_or(1).max(1) - 1;
    for f in files.split(':').filter(|f| !f.is_empty()) {
        let t0 = std::time::Instant::now();
        let bytes = std::fs::read(f).unwrap();
        let stem = std::path::Path::new(f).file_stem().unwrap().to_string_lossy().into_owned();
        let mut d = open_bytes(stem.clone(), None, bytes, None).unwrap();
        println!("{f}: {} pages, opened in {:?}", d.pages.len(), t0.elapsed());
        let t1 = std::time::Instant::now();
        let (mut lines, mut graphics) = (0, 0);
        for p in 0..d.pages.len() {
            let items = page_items(&mut d, p).unwrap();
            lines += items.texts.len();
            graphics += items.graphics.len();
        }
        println!("  all pages read in {:?}: {lines} lines, {graphics} pictures/shapes", t1.elapsed());
        for r in font_reports(&d) {
            println!("   font {:?} family {:?} {:?} pages {:?}", r.name, r.family, r.status, r.pages);
        }
        let items = page_items(&mut d, page).unwrap();
        for t in items.texts.iter().take(14) {
            println!("   [{}] {:?} {} {:.1}pt {} at ({:.1},{:.1})", t.key, t.text, t.font, t.size, t.color, t.x, t.y);
        }
        for g in items.graphics.iter().take(8) {
            println!("   graphic {} {:?} {:.0}x{:.0} at ({:.0},{:.0})", g.id, g.kind, g.width, g.height, g.x, g.y);
        }
        png(&mut d, page, &out.join(format!("{stem}-before.png")));
        {
            // How long drawing takes: the whole page, and a strip around one line (as when typing).
            let bytes = d.current().unwrap();
            let pdf = hayro::hayro_syntax::Pdf::new(bytes).unwrap();
            let settings = render::settings(HashMap::new());
            let t = std::time::Instant::now();
            render::draw(&pdf, page, 2.0, None, &settings).unwrap();
            let full = t.elapsed();
            let l = &items.texts[0];
            let t = std::time::Instant::now();
            render::draw(&pdf, page, 2.0, Some([l.x - 4.0, l.y - 4.0, l.width + 60.0, l.height + 8.0]), &settings).unwrap();
            println!("  drawn at 2x: whole page {full:?}, one line {:?}", t.elapsed());
        }
        let first = items.texts.iter().find(|t| t.text.chars().count() > 4 && t.editable).expect("a line to edit");
        let key = parse_key(&first.key).unwrap();
        let new_text = match first.text.split_once(' ') {
            Some((a, b)) => format!("{a} (edited) {b}"),
            None => format!("{} (edited)", first.text),
        };
        println!("  editing [{}] {:?} -> {:?}", first.key, first.text, new_text);
        edit_of(&mut d, page, key).unwrap().set_text(&new_text);
        if let Some(g) = items.graphics.iter().find(|g| g.kind == read::GraphicKind::Image).or(items.graphics.first()) {
            println!("  moving graphic {} ({:?})", g.id, g.kind);
            d.edits.graphics.insert((page, g.id), GraphicEdit { m: [1.0, 0.0, 0.0, 1.0, 30.0, -30.0], deleted: false });
        }
        d.stale = true;
        let t2 = std::time::Instant::now();
        let edited = page_items(&mut d, page).unwrap();
        let line = edited.texts.iter().find(|t| t.key == first.key).unwrap();
        println!("  substituted fonts: {:?}", line.substituted);
        png(&mut d, page, &out.join(format!("{stem}-edited.png")));
        println!("  edited and drawn in {:?}", t2.elapsed());
        let saved = d.file_bytes().unwrap();
        let path = out.join(format!("{stem}-edited.pdf"));
        std::fs::write(&path, &saved).unwrap();
        let mut again = open_bytes(stem.clone(), None, saved, None).unwrap();
        let t = texts(&mut again, page);
        assert!(t.iter().any(|l| *l == new_text), "{new_text:?} in {t:?}");
        png(&mut again, page, &out.join(format!("{stem}-reopened.png")));
        println!("  saved to {} and reopened: ok", path.display());
    }
}

#[test]
fn font_names_read_as_families() {
    use super::font::family_and_style;
    assert_eq!(family_and_style("ArialMT").0, "Arial");
    assert_eq!(family_and_style("TimesNewRomanPS-BoldItalicMT"), ("Times New Roman".to_string(), true, true));
    assert_eq!(family_and_style("MinionPro-Regular").0, "Minion Pro");
    assert_eq!(family_and_style("HelveticaNeueLTStd-Roman").0, "Helvetica Neue LT Std");
    assert_eq!(family_and_style("SourceSans3-Bold"), ("Source Sans 3".to_string(), true, false));
    assert_eq!(family_and_style("PTSans-Italic"), ("PT Sans".to_string(), false, true));
}
