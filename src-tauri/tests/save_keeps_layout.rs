//! Saving and opening again must not move anything on the page.
use wordcraft_engine::layout::Placed;
use wordcraft_engine::{Region, Session};

/// Where each paragraph starts: page, story, path, top, left.
fn tops(s: &mut Session) -> Vec<(usize, String, f32, f32)> {
    let l = s.layout();
    let mut out = vec![];
    for (pi, p) in l.pages.iter().enumerate() {
        for it in p.items.iter().chain(p.header.iter()).chain(p.footer.iter()) {
            if let Placed::Lines { story, path, l0: 0, y, x, .. } = it {
                out.push((pi, format!("{story:?}/{path}"), *y, *x));
            }
        }
    }
    out
}

fn round_trip(name: &str, bytes: &[u8], out: &str) -> (Vec<(usize, String, f32, f32)>, Vec<(usize, String, f32, f32)>) {
    let (doc, _) = wordcraft_engine::io::open_bytes_in(name, bytes, None, &Region::default()).unwrap();
    let saved = wordcraft_engine::io::save_bytes(out, &doc).unwrap();
    let (back, _) = wordcraft_engine::io::open_bytes_in(out, &saved, None, &Region::default()).unwrap();
    (tops(&mut Session::new(doc)), tops(&mut Session::new(back)))
}

fn assert_same(a: &[(usize, String, f32, f32)], b: &[(usize, String, f32, f32)]) {
    assert_eq!(a.len(), b.len(), "paragraph count");
    for (x, y) in a.iter().zip(b) {
        assert!(x.0 == y.0 && x.1 == y.1 && (x.2 - y.2).abs() < 0.6 && (x.3 - y.3).abs() < 0.6, "{x:?} moved to {y:?}");
    }
}

/// A styled first row, spacing and indents on paragraphs, an empty big paragraph, a header and a
/// table that runs onto the next page: the things that used to move after saving as RTF.
fn sample() -> Vec<u8> {
    let mut rows = String::new();
    for i in 0..45 {
        rows.push_str(&format!(
            "\\trowd\\trgaph108\\trleft-108\\cellx3000\\cellx9000\\pard\\intbl\\sa0\\fs22 Row {i}\\cell Text {i}\\cell\\row\n"
        ));
    }
    format!(
        "{{\\rtf1\\ansi\\deff0{{\\fonttbl{{\\f0 Calibri;}}}}{{\\*\\defchp \\fs22}}\n\
         \\sectd\\vertalc{{\\header \\pard\\plain\\fs22 Page header\\par}}\n\
         \\pard\\plain\\qc\\sa200\\sl276\\slmult1\\fs22 Title line\\par\n\
         \\pard\\plain\\li720\\fi-360\\sb120\\sa200\\fs22 Indented paragraph\\par\n\
         \\pard\\plain\\fs48 \\par\n\
         {rows}\\pard\\plain\\fs22 After the table\\par}}"
    )
    .into_bytes()
}

#[test]
fn rtf_saved_as_rtf_keeps_its_layout() {
    let (a, b) = round_trip("a.rtf", &sample(), "b.rtf");
    assert!(a.iter().any(|t| t.0 == 1), "the sample spans two pages");
    assert_same(&a, &b);
}

#[test]
fn rtf_saved_as_word_keeps_its_layout() {
    let (a, b) = round_trip("a.rtf", &sample(), "b.docx");
    assert_same(&a, &b);
}

#[test]
fn word_saved_as_rtf_and_word_keeps_its_layout() {
    let (doc, _) = wordcraft_engine::io::open_bytes_in("a.rtf", &sample(), None, &Region::default()).unwrap();
    let docx = wordcraft_engine::io::save_bytes("a.docx", &doc).unwrap();
    for out in ["b.rtf", "b.docx"] {
        let (a, b) = round_trip("a.docx", &docx, out);
        assert_same(&a, &b);
    }
}
