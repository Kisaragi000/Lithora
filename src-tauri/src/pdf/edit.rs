//! The changes made to a PDF, and how an edited line is set again.
//!
//! Letters the edit didn't touch stay exactly where the PDF had them (justified spacing and
//! kerning included); text after an insertion or deletion moves along by the difference, as in
//! Acrobat. Each letter keeps the PDF's own font when the font has it, and is drawn in a
//! replacement font when it doesn't (see [`super::font`]).

use super::font::{Embedded, PdfFont};
use super::read::{Color, Line, Style};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use wordcraft_fonts::FontFace;

/// Which font a run is set in.
#[derive(Clone, Debug, PartialEq)]
pub enum FontChoice {
    /// One of the PDF's fonts.
    Pdf(usize),
    /// An installed font, by family.
    Family { name: String, bold: bool, italic: bool },
}

/// How a run of an edited line is set.
#[derive(Clone, Debug, PartialEq)]
pub struct EStyle {
    pub font: FontChoice,
    pub size: f64,
    pub hs: f64,
    pub tc: f64,
    pub tw: f64,
    pub rise: f64,
    pub skew: f64,
    pub mode: i64,
    pub color: Color,
    pub underline: bool,
}

impl EStyle {
    pub fn from(s: &Style) -> EStyle {
        EStyle {
            font: FontChoice::Pdf(s.font),
            size: s.size,
            hs: s.hs,
            tc: s.tc,
            tw: s.tw,
            rise: s.rise,
            skew: s.skew,
            mode: s.mode,
            color: s.color,
            underline: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct EChar {
    pub ch: char,
    pub style: usize,
    /// The original letter (index into the line's letters) this still is, unchanged.
    pub orig: Option<usize>,
}

/// One edited line, or a new text box.
#[derive(Clone, Debug, PartialEq)]
pub struct TextEdit {
    pub chars: Vec<EChar>,
    pub styles: Vec<EStyle>,
    /// Where the text starts (page x) and its baseline (page y), before any move.
    pub x: f64,
    pub baseline: f64,
    /// How far it was moved.
    pub dx: f64,
    pub dy: f64,
}

impl TextEdit {
    pub fn from_line(line: &Line) -> TextEdit {
        TextEdit {
            chars: line.chars.iter().enumerate().map(|(i, c)| EChar { ch: c.ch, style: c.style, orig: Some(i) }).collect(),
            styles: line.styles.iter().map(EStyle::from).collect(),
            x: line.x0(),
            baseline: line.baseline,
            dx: 0.0,
            dy: 0.0,
        }
    }

    pub fn text(&self) -> String {
        self.chars.iter().map(|c| c.ch).collect()
    }

    /// Replace the text, keeping each untouched letter as it was. Letters typed in take the
    /// style of the letter before them (or after, at the start).
    pub fn set_text(&mut self, text: &str) {
        let new: Vec<char> = text.chars().collect();
        let old = &self.chars;
        let prefix = old.iter().zip(&new).take_while(|(a, b)| a.ch == **b).count();
        let max_suffix = old.len().min(new.len()) - prefix;
        let suffix = old.iter().rev().zip(new.iter().rev()).take(max_suffix).take_while(|(a, b)| a.ch == **b).count();
        let style_at = if prefix > 0 {
            old[prefix - 1].style
        } else if suffix > 0 {
            old[old.len() - suffix].style
        } else {
            old.first().map(|c| c.style).unwrap_or(0)
        };
        let mut chars: Vec<EChar> = old[..prefix].to_vec();
        for &ch in &new[prefix..new.len() - suffix] {
            chars.push(EChar { ch, style: style_at, orig: None });
        }
        chars.extend_from_slice(&old[old.len() - suffix..]);
        self.chars = chars;
        if self.styles.is_empty() {
            self.styles.push(default_style());
        }
    }

    /// Set letters `from..to` (char indices) in `style`: they no longer keep their original glyphs.
    pub fn restyle(&mut self, from: usize, to: usize, f: impl Fn(&mut EStyle)) {
        let to = to.min(self.chars.len());
        for i in from.min(to)..to {
            let mut s = self.styles[self.chars[i].style].clone();
            f(&mut s);
            let k = match self.styles.iter().position(|x| *x == s) {
                Some(k) => k,
                None => {
                    self.styles.push(s);
                    self.styles.len() - 1
                }
            };
            if k != self.chars[i].style {
                self.chars[i].style = k;
                self.chars[i].orig = None;
            }
        }
    }
}

pub fn default_style() -> EStyle {
    EStyle {
        font: FontChoice::Family { name: "Arial".into(), bold: false, italic: false },
        size: 12.0,
        hs: 1.0,
        tc: 0.0,
        tw: 0.0,
        rise: 0.0,
        skew: 0.0,
        mode: 0,
        color: Color::BLACK,
        underline: false,
    }
}

/// A picture or shape moved, resized or removed: `m` maps its old place to its new one (page space).
#[derive(Clone, Debug, PartialEq)]
pub struct GraphicEdit {
    pub m: super::read::Mat,
    pub deleted: bool,
}

/// A picture placed on a page (a signature): PNG data in a page-space box (x0, y0, x1, y1).
#[derive(Clone, Debug, PartialEq)]
pub struct Stamp {
    pub id: u32,
    pub page: usize,
    pub rect: [f64; 4],
    pub png: Arc<Vec<u8>>,
}

/// Which text an edit is: a line of the page, or a new text box.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TextKey {
    Line(usize),
    New(u32),
}

/// Everything changed, by page. Cloned for each Undo step.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Edits {
    pub texts: BTreeMap<(usize, TextKey), TextEdit>,
    pub graphics: BTreeMap<(usize, usize), GraphicEdit>,
    pub stamps: Vec<Stamp>,
    pub next_id: u32,
}

impl Edits {
    pub fn pages(&self) -> Vec<usize> {
        let mut p: Vec<usize> = self.texts.keys().map(|k| k.0).chain(self.graphics.keys().map(|k| k.0)).chain(self.stamps.iter().map(|s| s.page)).collect();
        p.sort();
        p.dedup();
        p
    }
}

/// Where a letter's glyph comes from.
#[derive(Clone)]
pub enum Src {
    /// A code of one of the PDF's fonts.
    Code { font: usize, code: u32, len: u8 },
    /// A glyph of an installed font.
    Face { face: &'static FontFace, gid: u32 },
    /// Nothing drawn (a space, or the second letter of a ligature).
    Blank,
}

/// A letter set on the page.
#[derive(Clone)]
pub struct Placed {
    pub ch: char,
    /// Page x where it starts, and how far to the next letter.
    pub x: f64,
    pub advance: f64,
    pub style: usize,
    pub src: Src,
}

/// What replaces a PDF font: the user's choice (family), else none.
pub type Replacements = HashMap<usize, String>;

/// The installed face to draw `c` in for `style`.
fn face_for(style: &EStyle, fonts: &[PdfFont], repl: &Replacements, c: char) -> Option<&'static FontFace> {
    let (family, bold, italic) = match &style.font {
        FontChoice::Family { name, bold, italic } => (name.clone(), *bold, *italic),
        FontChoice::Pdf(k) => {
            let f = &fonts[*k];
            let fam = repl.get(k).cloned().or_else(|| super::font::installed_family(f)).unwrap_or_else(|| f.family.clone());
            (fam, f.bold, f.italic)
        }
    };
    let resolved = wordcraft_fonts::word::resolve(&family, bold, italic);
    let face = resolved.face.get();
    if face.covers(c) {
        return Some(face);
    }
    let db = wordcraft_fonts::FontDb::global();
    db.fallback_styled(c, face.id(), bold, italic).map(|f| {
        // Faces in the database live as long as the program.
        let f: &'static FontFace = wordcraft_fonts::FaceRef::of(&f).get();
        f
    })
}

/// Is `style` still the PDF font it was (not replaced by the user)?
fn pdf_font(style: &EStyle, repl: &Replacements) -> Option<usize> {
    match style.font {
        FontChoice::Pdf(k) if !repl.contains_key(&k) => Some(k),
        _ => None,
    }
}

/// Set an edited line: each letter's place and glyph.
pub fn layout(edit: &TextEdit, line: Option<&Line>, fonts: &[PdfFont], repl: &Replacements) -> Vec<Placed> {
    let mut out: Vec<Placed> = Vec::with_capacity(edit.chars.len());
    // A ligature's letters keep their shared glyph only while all of them are still there.
    let intact = |i: usize| -> bool {
        let (Some(line), Some(o)) = (line, edit.chars[i].orig) else { return false };
        let g = line.chars[o].group;
        let first = line.chars.iter().position(|c| c.group == g).unwrap_or(o);
        let count = line.chars.iter().filter(|c| c.group == g).count();
        let start = i as isize - (o as isize - first as isize);
        start >= 0
            && (0..count).all(|k| {
                let j = start as usize + k;
                edit.chars.get(j).and_then(|c| c.orig) == Some(first + k)
            })
    };
    let mut pen = edit.x;
    let mut shift = 0.0;
    let mut prev_orig: Option<usize> = None;
    let mut flowed = true;
    for (i, c) in edit.chars.iter().enumerate() {
        let style = &edit.styles[c.style];
        let anchored = c.orig.is_some() && line.is_some() && intact(i) && pdf_font(style, repl).is_some();
        if anchored {
            let line = line.unwrap_or_else(|| unreachable!());
            let o = c.orig.unwrap_or(0);
            let lc = &line.chars[o];
            if flowed || prev_orig.is_none_or(|p| p + 1 != o) {
                shift = pen - lc.x0;
                if prev_orig.is_none() && out.is_empty() {
                    shift = 0.0;
                }
            }
            let src = match (lc.glyph, lc.code) {
                (Some(_), Some((code, len))) => Src::Code { font: line.styles[lc.style].font, code, len },
                _ => Src::Blank,
            };
            out.push(Placed { ch: c.ch, x: lc.x0 + shift, advance: lc.x1 - lc.x0, style: c.style, src });
            pen = lc.x1 + shift;
            prev_orig = Some(o);
            flowed = false;
            continue;
        }
        // A letter set anew, after the one before it.
        let (src, width) = new_glyph(c.ch, style, fonts, repl);
        let space = c.ch == ' ';
        let advance = width * style.size * style.hs + style.tc + if space { style.tw } else { 0.0 };
        out.push(Placed { ch: c.ch, x: pen, advance, style: c.style, src });
        pen += advance;
        flowed = true;
        prev_orig = None;
    }
    for p in &mut out {
        p.x += edit.dx;
    }
    out
}

/// A new letter's glyph and width (in font-size units).
fn new_glyph(ch: char, style: &EStyle, fonts: &[PdfFont], repl: &Replacements) -> (Src, f64) {
    if let Some(k) = pdf_font(style, repl) {
        let f = &fonts[k];
        if let Some((code, len)) = f.code_for(ch) {
            let w = f.width(code) as f64 / 1000.0;
            // A font without widths (one of the standard 14, not in the file) is measured
            // with the installed font viewers will draw it with.
            if w > 0.0 || ch == ' ' && f.has_widths() {
                return (Src::Code { font: k, code, len }, w);
            }
            if f.embedded == Embedded::No
                && let Some(face) = face_for(style, fonts, repl, ch)
            {
                let gid = face.glyph_for(ch);
                return (Src::Code { font: k, code, len }, face.advance(gid) / face.units_per_em());
            }
        }
    }
    if ch.is_whitespace() {
        let w = face_for(style, fonts, repl, ' ').map(|f| f.advance(f.glyph_for(' ')) / f.units_per_em()).unwrap_or(0.25);
        return (Src::Blank, w);
    }
    match face_for(style, fonts, repl, ch) {
        Some(face) => {
            let gid = face.glyph_for(ch);
            (Src::Face { face, gid }, face.advance(gid) / face.units_per_em())
        }
        None => (Src::Blank, 0.5),
    }
}

/// Does setting this edit need a font the PDF doesn't have (for the Missing fonts notice)?
pub fn substituted_fonts(placed: &[Placed], edit: &TextEdit) -> Vec<FontChoice> {
    let mut out = Vec::new();
    for p in placed {
        if let Src::Face { .. } = p.src {
            let f = edit.styles[p.style].font.clone();
            if !out.contains(&f) {
                out.push(f);
            }
        }
    }
    out
}
