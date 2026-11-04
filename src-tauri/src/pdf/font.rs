//! The fonts a PDF's text is set in: how its character codes split up, what each code reads
//! as (Unicode), how wide each glyph is, and which new letters it can show.
//!
//! An edited line keeps the PDF's own font where it can: a letter the font's subset already
//! holds is written with the font's own code. A letter it lacks is drawn in a replacement
//! font (an installed copy of the same font, the font the user picked in Missing fonts, or the
//! closest installed one), as Adobe's apps do.

use lopdf::{Dictionary, Document, Object, ObjectId};
use std::collections::{HashMap, HashSet};

/// How a font's glyph program is in the file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Embedded {
    /// Not in the file: viewers draw it with an installed font.
    No,
    /// Only the letters the PDF uses (the name starts "ABCDEF+").
    Subset,
    /// The whole font.
    Full,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// One byte per code (Type1, TrueType, MMType1).
    Simple,
    /// Codes of one to four bytes mapped to CIDs (Type0).
    Composite,
    /// Glyphs drawn by PDF procedures (Type3).
    Type3,
}

/// Code lengths: (bytes, low, high) ranges, byte by byte.
#[derive(Clone, Debug, Default)]
pub struct CodeSpace(Vec<(u8, u32, u32)>);

impl CodeSpace {
    fn fixed(len: u8) -> Self {
        CodeSpace(vec![(len, 0, if len >= 4 { u32::MAX } else { (1u32 << (8 * len as u32)) - 1 })])
    }

    /// Split a shown string into (code, length) pairs.
    pub fn split(&self, bytes: &[u8]) -> Vec<(u32, u8)> {
        let mut out = Vec::new();
        let mut i = 0;
        while i < bytes.len() {
            let mut found = None;
            for len in 1..=4u8 {
                if i + len as usize > bytes.len() {
                    break;
                }
                let code = bytes[i..i + len as usize].iter().fold(0u32, |a, b| (a << 8) | *b as u32);
                if self.0.iter().any(|&(l, lo, hi)| l == len && in_range(code, lo, hi, len)) {
                    found = Some((code, len));
                    break;
                }
            }
            // A code outside every range: take the shortest range's length, as Acrobat does.
            let (code, len) = found.unwrap_or_else(|| {
                let len = self.0.iter().map(|r| r.0).min().unwrap_or(1).min((bytes.len() - i) as u8).max(1);
                (bytes[i..i + len as usize].iter().fold(0u32, |a, b| (a << 8) | *b as u32), len)
            });
            out.push((code, len));
            i += len as usize;
        }
        out
    }
}

/// Each byte of `code` within the range's bounds for that byte.
fn in_range(code: u32, lo: u32, hi: u32, len: u8) -> bool {
    (0..len as u32).all(|i| {
        let s = 8 * i;
        let b = (code >> s) & 0xff;
        ((lo >> s) & 0xff) <= b && b <= ((hi >> s) & 0xff)
    })
}

/// A parsed `ToUnicode` CMap: codes to text, and single letters back to codes.
#[derive(Clone, Debug, Default)]
pub struct UnicodeMap {
    pub space: CodeSpace,
    pub to_text: HashMap<(u8, u32), String>,
    /// The first code that reads as each single character.
    pub from_char: HashMap<char, (u32, u8)>,
}

impl UnicodeMap {
    pub fn parse(data: &[u8]) -> UnicodeMap {
        let toks = tokens(data);
        let mut map = UnicodeMap::default();
        let mut i = 0;
        let hex = |t: &Tok| match t {
            Tok::Hex(b) => Some(b.clone()),
            _ => None,
        };
        let code_of = |b: &[u8]| (b.iter().fold(0u32, |a, x| (a << 8) | *x as u32), b.len().clamp(1, 4) as u8);
        let text_of = |b: &[u8]| {
            let units: Vec<u16> = b.chunks(2).map(|c| if c.len() == 2 { u16::from_be_bytes([c[0], c[1]]) } else { c[0] as u16 }).collect();
            String::from_utf16_lossy(&units)
        };
        while i < toks.len() {
            match &toks[i] {
                Tok::Word(w) if w == "begincodespacerange" => {
                    i += 1;
                    while i + 1 < toks.len() && !matches!(&toks[i], Tok::Word(w) if w == "endcodespacerange") {
                        if let (Some(lo), Some(hi)) = (hex(&toks[i]), hex(&toks[i + 1])) {
                            let (l, len) = code_of(&lo);
                            map.space.0.push((len, l, code_of(&hi).0));
                        }
                        i += 2;
                    }
                }
                Tok::Word(w) if w == "beginbfchar" => {
                    i += 1;
                    while i + 1 < toks.len() && !matches!(&toks[i], Tok::Word(w) if w == "endbfchar") {
                        if let (Some(src), Some(dst)) = (hex(&toks[i]), hex(&toks[i + 1])) {
                            let (code, len) = code_of(&src);
                            map.insert(code, len, text_of(&dst));
                        }
                        i += 2;
                    }
                }
                Tok::Word(w) if w == "beginbfrange" => {
                    i += 1;
                    while i + 2 < toks.len() && !matches!(&toks[i], Tok::Word(w) if w == "endbfrange") {
                        let (Some(lo), Some(hi)) = (hex(&toks[i]), hex(&toks[i + 1])) else {
                            i += 1;
                            continue;
                        };
                        let (lo_code, len) = code_of(&lo);
                        let hi_code = code_of(&hi).0;
                        // A broken range must not run for billions of codes.
                        let count = hi_code.saturating_sub(lo_code).min(0xffff);
                        match &toks[i + 2] {
                            Tok::Hex(dst) => {
                                let mut units: Vec<u16> = dst.chunks(2).map(|c| if c.len() == 2 { u16::from_be_bytes([c[0], c[1]]) } else { c[0] as u16 }).collect();
                                for k in 0..=count {
                                    map.insert(lo_code + k, len, String::from_utf16_lossy(&units));
                                    if let Some(last) = units.last_mut() {
                                        *last = last.wrapping_add(1);
                                    }
                                }
                                i += 3;
                            }
                            Tok::ArrayStart => {
                                let mut j = i + 3;
                                let mut k = 0;
                                while j < toks.len() && !matches!(toks[j], Tok::ArrayEnd) {
                                    if let Tok::Hex(dst) = &toks[j] {
                                        map.insert(lo_code + k, len, text_of(dst));
                                        k += 1;
                                    }
                                    j += 1;
                                }
                                i = j + 1;
                            }
                            _ => i += 3,
                        }
                    }
                }
                _ => {}
            }
            i += 1;
        }
        map
    }

    fn insert(&mut self, code: u32, len: u8, text: String) {
        let mut chars = text.chars();
        if let (Some(c), None) = (chars.next(), chars.next()) {
            // Prefer the lowest code for a letter (later duplicates are usually alternates).
            self.from_char.entry(c).or_insert((code, len));
        }
        self.to_text.insert((len, code), text);
    }
}

#[derive(Debug, Clone)]
enum Tok {
    Hex(Vec<u8>),
    Word(String),
    ArrayStart,
    ArrayEnd,
    Other,
}

/// The tokens of a CMap file (hex strings, keywords, array brackets).
fn tokens(data: &[u8]) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < data.len() {
        let c = data[i];
        match c {
            b'%' => {
                while i < data.len() && data[i] != b'\n' && data[i] != b'\r' {
                    i += 1;
                }
            }
            b'<' if data.get(i + 1) == Some(&b'<') => {
                out.push(Tok::Other);
                i += 2;
                continue;
            }
            b'>' if data.get(i + 1) == Some(&b'>') => {
                out.push(Tok::Other);
                i += 2;
                continue;
            }
            b'<' => {
                let mut digits = Vec::new();
                i += 1;
                while i < data.len() && data[i] != b'>' {
                    if data[i].is_ascii_hexdigit() {
                        digits.push(data[i]);
                    }
                    i += 1;
                }
                if digits.len() % 2 == 1 {
                    digits.push(b'0');
                }
                let bytes = digits
                    .chunks(2)
                    .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap_or("00"), 16).unwrap_or(0))
                    .collect();
                out.push(Tok::Hex(bytes));
            }
            b'[' => out.push(Tok::ArrayStart),
            b']' => out.push(Tok::ArrayEnd),
            b'(' => {
                // Literal strings don't appear in the parts we read; skip them whole.
                let mut depth = 0;
                while i < data.len() {
                    match data[i] {
                        b'\\' => i += 1,
                        b'(' => depth += 1,
                        b')' => {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        _ => {}
                    }
                    i += 1;
                }
                out.push(Tok::Other);
            }
            c if c.is_ascii_whitespace() => {}
            _ => {
                let start = i;
                while i < data.len() && !data[i].is_ascii_whitespace() && !b"<>[]()/%".contains(&data[i]) {
                    i += 1;
                }
                if i == start {
                    // A '/' name start or a stray delimiter.
                    out.push(Tok::Other);
                    i += 1;
                    continue;
                }
                out.push(Tok::Word(String::from_utf8_lossy(&data[start..i]).into_owned()));
                continue;
            }
        }
        i += 1;
    }
    out
}

/// One font of the PDF, read from its dictionary.
pub struct PdfFont {
    /// The font dictionary's object, when it is one (fonts are shared by it).
    pub obj: Option<ObjectId>,
    /// The dictionary itself.
    pub dict: Dictionary,
    /// The PostScript name without the subset tag ("Calibri-Bold").
    pub ps_name: String,
    /// The family people know it by ("Calibri").
    pub family: String,
    pub bold: bool,
    pub italic: bool,
    pub serif: bool,
    pub mono: bool,
    pub kind: Kind,
    pub embedded: Embedded,
    /// One of the 14 fonts every PDF reader has, named exactly, and not in the file.
    pub builtin: bool,
    space: CodeSpace,
    unicode: Option<UnicodeMap>,
    /// A simple font's letters by code, from its encoding.
    simple_chars: Option<Box<[Option<char>; 256]>>,
    /// A simple font's glyph names by code, from its encoding's differences.
    widths: Widths,
    /// Glyph units (thousandths of the font size) above and below the baseline.
    pub ascent: f32,
    pub descent: f32,
    /// Codes the document draws with this font somewhere: their glyphs are in the subset.
    pub seen: HashSet<u32>,
    /// A Type0 font's code-to-CID map, when it isn't Identity.
    cid_map: Option<hayro::hayro_interpret::hayro_cmap::CMap>,
}

enum Widths {
    Simple { first: u32, widths: Vec<f32>, missing: f32 },
    Cid { map: HashMap<u32, f32>, default: f32 },
    /// Type3: widths in glyph space, times the font matrix's x scale (×1000).
    Type3 { first: u32, widths: Vec<f32>, scale: f32 },
}

/// What `name` (a PDF name or string) says, as text.
fn name_text(o: &Object) -> Option<String> {
    match o {
        Object::Name(n) => Some(String::from_utf8_lossy(n).into_owned()),
        Object::String(s, _) => Some(String::from_utf8_lossy(s).into_owned()),
        _ => None,
    }
}

pub(crate) fn deref<'a>(doc: &'a Document, o: &'a Object) -> &'a Object {
    doc.dereference(o).map(|(_, o)| o).unwrap_or(o)
}

pub(crate) fn get<'a>(doc: &'a Document, d: &'a Dictionary, key: &[u8]) -> Option<&'a Object> {
    d.get(key).ok().map(|o| deref(doc, o))
}

pub(crate) fn num(doc: &Document, d: &Dictionary, key: &[u8]) -> Option<f32> {
    get(doc, d, key).and_then(|o| o.as_float().ok())
}

/// The plain bytes of a stream, decoded.
pub(crate) fn stream_bytes(o: &Object) -> Option<Vec<u8>> {
    let s = o.as_stream().ok()?;
    s.get_plain_content_with_limit(256 << 20).ok().or_else(|| if s.filters().map(|f| f.is_empty()).unwrap_or(true) { Some(s.content.clone()) } else { None })
}

/// "ABCDEF+Name" → "Name".
pub fn strip_subset(name: &str) -> (&str, bool) {
    match name.split_once('+') {
        Some((tag, rest)) if tag.len() == 6 && tag.bytes().all(|b| b.is_ascii_uppercase()) => (rest, true),
        _ => (name, false),
    }
}

/// Guess a family and style from a PostScript name: "TimesNewRomanPS-BoldItalicMT" →
/// ("Times New Roman", bold, italic).
pub fn family_and_style(ps: &str) -> (String, bool, bool) {
    let (base, style) = match ps.split_once(['-', ',']) {
        Some((b, s)) => (b, s.to_ascii_lowercase()),
        None => (ps, String::new()),
    };
    let lower = ps.to_ascii_lowercase();
    let bold = ["bold", "black", "heavy", "semibold", "demi", "extrabold", "ultrabold"].iter().any(|w| style.contains(w))
        || lower.ends_with("bold")
        || lower.ends_with("bd");
    let italic = ["italic", "oblique", "ital"].iter().any(|w| style.contains(w)) || lower.ends_with("italic") || style == "it";
    let mut base = base.to_string();
    for suffix in ["PSMT", "PS", "MT", "Std", "Pro", "LT"] {
        if base.len() > suffix.len() + 2 && base.ends_with(suffix) {
            base.truncate(base.len() - suffix.len());
        }
    }
    // "TimesNewRoman" → "Times New Roman", "SourceSans3" → "Source Sans 3": a space before each
    // capital or digit that follows a lowercase letter.
    let mut family = String::new();
    let mut prev: Option<char> = None;
    for c in base.chars() {
        if (c.is_ascii_uppercase() || c.is_ascii_digit()) && prev.is_some_and(|p| p.is_ascii_lowercase()) {
            family.push(' ');
        }
        family.push(c);
        prev = Some(c);
    }
    (family, bold, italic)
}

/// The standard font a PostScript name stands for, and whether it names it exactly
/// ("Helvetica-Bold") or by a look-alike ("ArialMT").
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Standard {
    Helvetica,
    Times,
    Courier,
    Symbol,
    Dingbats,
}

pub fn standard_font(ps: &str) -> Option<(Standard, bool)> {
    let lower = ps.to_ascii_lowercase();
    let exact = matches!(
        ps,
        "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique" | "Helvetica-BoldOblique" | "Courier" | "Courier-Bold" | "Courier-Oblique" | "Courier-BoldOblique"
            | "Times-Roman" | "Times-Bold" | "Times-Italic" | "Times-BoldItalic" | "Symbol" | "ZapfDingbats"
    );
    let std = if lower.contains("dingbats") {
        Standard::Dingbats
    } else if lower == "symbol" || lower.starts_with("symbol,") || lower.starts_with("symbolmt") {
        Standard::Symbol
    } else if lower.contains("courier") || lower.contains("mono") {
        Standard::Courier
    } else if lower.contains("times") || lower.contains("serif") {
        Standard::Times
    } else if lower.contains("helvetica") || lower.contains("arial") || lower.contains("sans") {
        Standard::Helvetica
    } else {
        return None;
    };
    Some((std, exact))
}

/// A standard font's widths by code, through the font's encoding.
fn standard_widths(std: Standard, bold: bool, italic: bool, chars: &[Option<char>; 256]) -> Vec<f32> {
    use super::tables::*;
    let table: Option<&[(u32, u16)]> = match (std, bold, italic) {
        (Standard::Helvetica, false, _) => Some(&W_HELVETICA),
        (Standard::Helvetica, true, _) => Some(&W_HELVETICA_BOLD),
        (Standard::Times, false, false) => Some(&W_TIMES_ROMAN),
        (Standard::Times, true, false) => Some(&W_TIMES_BOLD),
        (Standard::Times, false, true) => Some(&W_TIMES_ITALIC),
        (Standard::Times, true, true) => Some(&W_TIMES_BOLD_ITALIC),
        _ => None,
    };
    (0..256)
        .map(|code| match std {
            Standard::Courier => 600.0,
            Standard::Symbol => W_SYMBOL[code] as f32,
            Standard::Dingbats => W_ZAPF_DING_BATS[code] as f32,
            _ => chars[code]
                .and_then(|c| {
                    let t = table?;
                    t.binary_search_by_key(&(c as u32), |&(k, _)| k).ok().map(|i| t[i].1 as f32)
                })
                .unwrap_or(0.0),
        })
        .collect()
}

impl PdfFont {
    pub fn read(doc: &Document, obj: Option<ObjectId>, dict: &Dictionary) -> PdfFont {
        let subtype = get(doc, dict, b"Subtype").and_then(name_text).unwrap_or_default();
        let kind = match subtype.as_str() {
            "Type0" => Kind::Composite,
            "Type3" => Kind::Type3,
            _ => Kind::Simple,
        };
        let base_name = get(doc, dict, b"BaseFont").and_then(name_text).unwrap_or_else(|| "Unnamed".into());
        let (ps, subset) = strip_subset(&base_name);
        let ps_name = ps.to_string();
        // A Type0 font's glyphs and metrics are in its descendant.
        let descendant: Option<&Dictionary> = if kind == Kind::Composite {
            get(doc, dict, b"DescendantFonts")
                .and_then(|o| o.as_array().ok())
                .and_then(|a| a.first())
                .and_then(|o| deref(doc, o).as_dict().ok())
        } else {
            None
        };
        let desc_src = descendant.unwrap_or(dict);
        let descriptor = get(doc, desc_src, b"FontDescriptor").and_then(|o| o.as_dict().ok());
        let flags = descriptor.and_then(|d| get(doc, d, b"Flags")).and_then(|o| o.as_i64().ok()).unwrap_or(0);
        let has_program = descriptor.is_some_and(|d| d.has(b"FontFile") || d.has(b"FontFile2") || d.has(b"FontFile3"));
        let embedded = match (has_program || kind == Kind::Type3, subset) {
            (false, _) => Embedded::No,
            (true, true) => Embedded::Subset,
            (true, false) => Embedded::Full,
        };
        let (mut family, mut bold, mut italic) = family_and_style(&ps_name);
        if let Some(f) = descriptor.and_then(|d| get(doc, d, b"FontFamily")).and_then(name_text).filter(|f| !f.trim().is_empty()) {
            family = f;
        } else if let Some(f) = known_family(&family) {
            // "Deja Vu Sans" → "DejaVu Sans": as the installed font spells it.
            family = f;
        }
        let weight = descriptor.and_then(|d| num(doc, d, b"FontWeight")).unwrap_or(0.0);
        if weight >= 600.0 || flags & (1 << 18) != 0 {
            bold = true;
        }
        if flags & (1 << 6) != 0 || descriptor.and_then(|d| num(doc, d, b"ItalicAngle")).is_some_and(|a| a.abs() > 1.0) {
            italic = true;
        }
        let ascent = descriptor.and_then(|d| num(doc, d, b"Ascent")).filter(|a| *a > 100.0 && *a < 2000.0).unwrap_or(800.0);
        let descent = descriptor.and_then(|d| num(doc, d, b"Descent")).map(|d| -d.abs()).filter(|d| *d < -10.0 && *d > -1000.0).unwrap_or(-200.0);

        let unicode = get(doc, dict, b"ToUnicode").and_then(stream_bytes).map(|b| UnicodeMap::parse(&b));
        let (space, cid_map) = match kind {
            Kind::Composite => composite_codes(doc, dict),
            _ => (CodeSpace::fixed(1), None),
        };
        let simple_chars = (kind != Kind::Composite).then(|| simple_encoding(doc, dict, &subtype, flags));
        let widths = match kind {
            Kind::Composite => {
                let d = descendant.unwrap_or(dict);
                let default = num(doc, d, b"DW").unwrap_or(1000.0);
                let mut map = HashMap::new();
                if let Some(w) = get(doc, d, b"W").and_then(|o| o.as_array().ok()) {
                    let mut i = 0;
                    while i < w.len() {
                        let first = deref(doc, &w[i]).as_float().unwrap_or(0.0) as u32;
                        match w.get(i + 1).map(|o| deref(doc, o)) {
                            Some(Object::Array(list)) => {
                                for (k, v) in list.iter().enumerate() {
                                    map.insert(first + k as u32, deref(doc, v).as_float().unwrap_or(default));
                                }
                                i += 2;
                            }
                            Some(last) => {
                                let last = last.as_float().unwrap_or(0.0) as u32;
                                let v = w.get(i + 2).map(|o| deref(doc, o).as_float().unwrap_or(default)).unwrap_or(default);
                                for c in first..=last.min(first.saturating_add(0xffff)) {
                                    map.insert(c, v);
                                }
                                i += 3;
                            }
                            None => break,
                        }
                    }
                }
                Widths::Cid { map, default }
            }
            Kind::Simple | Kind::Type3 => {
                let first = num(doc, dict, b"FirstChar").unwrap_or(0.0).max(0.0) as u32;
                let widths: Vec<f32> = get(doc, dict, b"Widths")
                    .and_then(|o| o.as_array().ok())
                    .map(|a| a.iter().map(|o| deref(doc, o).as_float().unwrap_or(0.0)).collect())
                    .unwrap_or_default();
                if kind == Kind::Type3 {
                    let scale = get(doc, dict, b"FontMatrix")
                        .and_then(|o| o.as_array().ok())
                        .and_then(|a| a.first().map(|o| deref(doc, o).as_float().unwrap_or(0.001)))
                        .unwrap_or(0.001)
                        * 1000.0;
                    Widths::Type3 { first, widths, scale }
                } else {
                    let missing = descriptor.and_then(|d| num(doc, d, b"MissingWidth")).unwrap_or(0.0);
                    match (widths.is_empty(), standard_font(&ps_name), &simple_chars) {
                        // The standard fonts may leave their widths out: every reader knows them.
                        (true, Some((std, _)), Some(chars)) => Widths::Simple { first: 0, widths: standard_widths(std, bold, italic, chars), missing },
                        _ => Widths::Simple { first, widths, missing },
                    }
                }
            }
        };
        let builtin = embedded == Embedded::No && standard_font(&ps_name).is_some_and(|(_, exact)| exact);
        PdfFont {
            obj,
            dict: dict.clone(),
            ps_name,
            family: family.trim().to_string(),
            bold,
            italic,
            serif: flags & (1 << 1) != 0,
            mono: flags & 1 != 0,
            kind,
            embedded,
            builtin,
            space,
            unicode,
            simple_chars,
            widths,
            ascent,
            descent,
            seen: HashSet::new(),
            cid_map,
        }
    }

    /// The codes in a shown string.
    pub fn codes(&self, bytes: &[u8]) -> Vec<(u32, u8)> {
        self.space.split(bytes)
    }

    /// What a code reads as.
    pub fn text(&self, code: u32, len: u8) -> String {
        if let Some(t) = self.unicode.as_ref().and_then(|u| u.to_text.get(&(len, code))) {
            return t.clone();
        }
        if let Some(c) = self.simple_chars.as_ref().and_then(|m| m.get(code as usize).copied().flatten()) {
            return c.to_string();
        }
        if self.kind == Kind::Composite {
            return "\u{FFFD}".into();
        }
        char::from_u32(code).filter(|c| !c.is_control()).map(|c| c.to_string()).unwrap_or_else(|| "\u{FFFD}".into())
    }

    /// A glyph's width in thousandths of the font size.
    pub fn width(&self, code: u32) -> f32 {
        match &self.widths {
            Widths::Simple { first, widths, missing } => code.checked_sub(*first).and_then(|i| widths.get(i as usize)).copied().unwrap_or(*missing),
            Widths::Type3 { first, widths, scale } => code.checked_sub(*first).and_then(|i| widths.get(i as usize)).copied().unwrap_or(0.0) * scale,
            Widths::Cid { map, default } => {
                let cid = self.cid(code);
                map.get(&cid).copied().unwrap_or(*default)
            }
        }
    }

    fn cid(&self, code: u32) -> u32 {
        match &self.cid_map {
            Some(m) => m.lookup_cid_code(code, if code > 0xffff { 3 } else { 2 }).unwrap_or(code),
            None => code,
        }
    }

    /// Does a simple font give widths of its own (the 14 standard fonts may not)?
    pub fn has_widths(&self) -> bool {
        match &self.widths {
            Widths::Simple { widths, .. } | Widths::Type3 { widths, .. } => !widths.is_empty(),
            Widths::Cid { .. } => true,
        }
    }

    /// The code to write `c` with in this font, when the font surely has its glyph.
    pub fn code_for(&self, c: char) -> Option<(u32, u8)> {
        let from_unicode = self.unicode.as_ref().and_then(|u| u.from_char.get(&c).copied());
        let from_encoding = || {
            let m = self.simple_chars.as_ref()?;
            (0..256u32).find(|&i| m[i as usize] == Some(c)).map(|i| (i, 1u8))
        };
        let (code, len) = from_unicode.or_else(from_encoding)?;
        // A code longer or shorter than the font's codes would be read wrongly.
        if self.space.split(&code_bytes(code, len)).len() != 1 {
            return None;
        }
        let sure = match self.embedded {
            // Viewers draw a font that isn't in the file with their own: any letter works.
            Embedded::No => self.kind == Kind::Simple,
            // A subset holds what the document draws, which its ToUnicode map lists.
            Embedded::Subset => self.seen.contains(&code) || from_unicode.is_some(),
            Embedded::Full => self.kind != Kind::Composite || from_unicode.is_some(),
        };
        (sure && self.kind != Kind::Type3 || self.seen.contains(&code)).then_some((code, len))
    }

    /// A name for lists: "Calibri Bold".
    pub fn display_name(&self) -> String {
        let mut n = self.family.clone();
        if self.bold && !n.to_ascii_lowercase().contains("bold") {
            n.push_str(" Bold");
        }
        if self.italic && !n.to_ascii_lowercase().contains("italic") {
            n.push_str(" Italic");
        }
        n
    }
}

pub fn code_bytes(code: u32, len: u8) -> Vec<u8> {
    (0..len).rev().map(|i| (code >> (8 * i as u32)) as u8).collect()
}

/// A Type0 font's code lengths, and its code-to-CID map when it isn't Identity.
fn composite_codes(doc: &Document, dict: &Dictionary) -> (CodeSpace, Option<hayro::hayro_interpret::hayro_cmap::CMap>) {
    use hayro::hayro_interpret::hayro_cmap::{CMap, CMapName};
    match get(doc, dict, b"Encoding") {
        Some(Object::Name(n)) if n == b"Identity-H" || n == b"Identity-V" => (CodeSpace::fixed(2), None),
        Some(Object::Name(n)) => {
            let name = n.clone();
            let cmap = hayro::hayro_interpret::hayro_cmap::load_embedded(CMapName::from_bytes(&name))
                .and_then(|data| CMap::parse(data, hayro::hayro_interpret::hayro_cmap::load_embedded));
            (CodeSpace::fixed(2), cmap)
        }
        Some(o @ Object::Stream(_)) => {
            let data = stream_bytes(o).unwrap_or_default();
            let parsed = UnicodeMap::parse(&data);
            let space = if parsed.space.0.is_empty() { CodeSpace::fixed(2) } else { parsed.space };
            let cmap = CMap::parse(&data, hayro::hayro_interpret::hayro_cmap::load_embedded);
            (space, cmap)
        }
        _ => (CodeSpace::fixed(2), None),
    }
}

/// A simple font's letters by code: its base encoding with its differences.
fn simple_encoding(doc: &Document, dict: &Dictionary, subtype: &str, flags: i64) -> Box<[Option<char>; 256]> {
    use super::tables::{MAC_ROMAN, STANDARD, SYMBOL, WIN_ANSI};
    let table = |name: &[u8]| -> Option<&'static [u32; 256]> {
        match name {
            b"WinAnsiEncoding" => Some(&WIN_ANSI),
            b"MacRomanEncoding" => Some(&MAC_ROMAN),
            b"StandardEncoding" => Some(&STANDARD),
            _ => None,
        }
    };
    let symbolic = flags & (1 << 2) != 0 && flags & (1 << 5) == 0;
    let base_name = get(doc, dict, b"BaseFont").and_then(name_text).unwrap_or_default();
    let default: &[u32; 256] = if base_name.contains("Symbol") {
        &SYMBOL
    } else if subtype == "TrueType" {
        &WIN_ANSI
    } else {
        &STANDARD
    };
    let enc = get(doc, dict, b"Encoding");
    let base = match enc {
        Some(Object::Name(n)) => table(n).unwrap_or(default),
        Some(Object::Dictionary(d)) => get(doc, d, b"BaseEncoding").and_then(|o| o.as_name().ok()).and_then(table).unwrap_or(default),
        _ => default,
    };
    let mut out: Box<[Option<char>; 256]> = Box::new([None; 256]);
    for (i, g) in base.iter().enumerate() {
        out[i] = (*g != 0).then(|| char::from_u32(*g)).flatten();
    }
    if symbolic && enc.is_none() {
        // A symbol font's codes are its own: read them as Latin-1 so they at least round-trip.
        for (i, slot) in out.iter_mut().enumerate() {
            *slot = char::from_u32(i as u32).filter(|c| !c.is_control());
        }
    }
    if let Some(Object::Dictionary(d)) = enc
        && let Some(diffs) = get(doc, d, b"Differences").and_then(|o| o.as_array().ok())
    {
        let mut code = 0usize;
        for o in diffs {
            match deref(doc, o) {
                Object::Integer(n) => code = (*n).clamp(0, 255) as usize,
                Object::Name(name) => {
                    if code < 256 {
                        out[code] = glyph_char(name);
                    }
                    code += 1;
                }
                _ => {}
            }
        }
    }
    out
}

/// The letter a glyph name stands for ("Aacute" → 'Á', "uni0531" → 'Ա').
pub fn glyph_char(name: &[u8]) -> Option<char> {
    let name = name.split(|b| *b == b'.').next().unwrap_or(name);
    let text = std::str::from_utf8(name).ok()?;
    if let Ok(i) = super::tables::GLYPH_NAMES.binary_search_by(|(n, _)| n.cmp(&text)) {
        return char::from_u32(super::tables::GLYPH_NAMES[i].1);
    }
    let hex = text.strip_prefix("uni").filter(|h| h.len() >= 4).map(|h| &h[..4]).or_else(|| text.strip_prefix('u').filter(|h| (4..=6).contains(&h.len())));
    hex.and_then(|h| u32::from_str_radix(h, 16).ok()).and_then(char::from_u32)
}

/// What the PDF's fonts are and where each is used, for the Missing fonts panel.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FontReport {
    pub key: usize,
    /// "Calibri Bold".
    pub name: String,
    pub family: String,
    pub bold: bool,
    pub italic: bool,
    pub embedded: Embedded,
    /// Installed on this computer (or added to Lithora).
    pub installed: bool,
    pub status: FontStatus,
    /// The font new letters are drawn in when this one lacks them.
    pub replacement: String,
    /// The user chose the replacement.
    pub replaced: bool,
    /// Pages it's used on (1-based), as far as read.
    pub pages: Vec<usize>,
}

/// The installed family a guessed name stands for, spelled as installed: spaces, dashes and
/// case aside, the names are the same.
fn known_family(guess: &str) -> Option<String> {
    let squash = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect::<String>();
    let want = squash(guess);
    if want.is_empty() {
        return None;
    }
    wordcraft_fonts::FontDb::global().families().into_iter().find(|f| squash(f) == want)
}

/// How a font stands, for the Missing fonts panel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FontStatus {
    /// Not in the file and not on this computer: drawn with a stand-in.
    Missing,
    /// Part of it is in the file (the letters it uses); new letters need the font installed.
    Subset,
    /// All of it is in the file.
    Embedded,
    /// One of the 14 fonts every PDF reader has.
    Builtin,
    /// Installed on this computer (or added to Lithora).
    Installed,
}

pub fn font_status(font: &PdfFont) -> FontStatus {
    if installed_family(font).is_some() {
        FontStatus::Installed
    } else if font.builtin {
        FontStatus::Builtin
    } else {
        match font.embedded {
            Embedded::No => FontStatus::Missing,
            Embedded::Subset => FontStatus::Subset,
            Embedded::Full => FontStatus::Embedded,
        }
    }
}

/// Family names the font goes by, best first: its family, then its PostScript name.
pub fn installed_family(font: &PdfFont) -> Option<String> {
    let db = wordcraft_fonts::FontDb::global();
    [font.family.clone(), font.ps_name.clone(), font.family.replace(' ', "")]
        .into_iter()
        .find(|n| !n.is_empty() && db.has_family(n))
}
