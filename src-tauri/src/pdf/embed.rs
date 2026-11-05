//! Putting a font into the PDF: a font the PDF names but doesn't hold is drawn in the font the
//! user chose for it (or found for it) by writing that font's file into the font's entry. The
//! page is drawn from that copy, and saving keeps it, so other PDF readers show the same font.

use lopdf::{Dictionary, Object, ObjectId, Stream};
use std::collections::HashMap;

use super::font::{Kind, PdfFont, Standard, standard_font};

/// A font file ready to be put into a PDF.
struct Program {
    /// One font (a collection's face taken out on its own).
    data: Vec<u8>,
    /// PostScript outlines (an OpenType "OTTO" font) rather than TrueType ones.
    cff: bool,
    ps_name: String,
    /// head: units per em and the glyphs' bounding box.
    upem: f32,
    bbox: [f32; 4],
    italic_angle: f32,
    /// OS/2 fsType says the font may not be put into documents.
    restricted: bool,
}

fn u16_at(d: &[u8], at: usize) -> Option<u16> {
    d.get(at..at + 2).map(|b| u16::from_be_bytes([b[0], b[1]]))
}

fn u32_at(d: &[u8], at: usize) -> Option<u32> {
    d.get(at..at + 4).map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

/// The tables of face `index` of a font file: (tag, offset, length).
fn tables(data: &[u8], index: u32) -> Option<Vec<([u8; 4], usize, usize)>> {
    let start = if data.get(0..4) == Some(b"ttcf") {
        let count = u32_at(data, 8)?;
        if index >= count {
            return None;
        }
        u32_at(data, 12 + 4 * index as usize)? as usize
    } else {
        0
    };
    let n = u16_at(data, start + 4)? as usize;
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let r = start + 12 + 16 * i;
        let tag: [u8; 4] = data.get(r..r + 4)?.try_into().ok()?;
        let (off, len) = (u32_at(data, r + 8)? as usize, u32_at(data, r + 12)? as usize);
        data.get(off..off.checked_add(len)?)?;
        out.push((tag, off, len));
    }
    Some(out)
}

/// The face's PostScript name (name table, ID 6).
fn ps_name(name: &[u8]) -> Option<String> {
    let count = u16_at(name, 2)? as usize;
    let strings = u16_at(name, 4)? as usize;
    let mut mac = None;
    for i in 0..count {
        let r = 6 + 12 * i;
        let (platform, id) = (u16_at(name, r)?, u16_at(name, r + 6)?);
        if id != 6 {
            continue;
        }
        let (len, off) = (u16_at(name, r + 8)? as usize, u16_at(name, r + 10)? as usize);
        let Some(bytes) = name.get(strings + off..strings + off + len) else { continue };
        match platform {
            3 | 0 => {
                let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
                return String::from_utf16(&units).ok();
            }
            1 => mac = Some(bytes.iter().map(|&b| b as char).collect()),
            _ => {}
        }
    }
    mac
}

fn program(face: &wordcraft_fonts::FontFace) -> Option<Program> {
    if face.is_variable() {
        // Only its default style could be drawn from the file.
        return None;
    }
    let data = face.data();
    let list = tables(data, face.index())?;
    let table = |tag: &[u8; 4]| list.iter().find(|t| &t.0 == tag).map(|&(_, o, l)| &data[o..o + l]);
    let head = table(b"head")?;
    let upem = u16_at(head, 18)? as f32;
    let bbox = [36, 38, 40, 42].map(|o| u16_at(head, o).map(|v| v as i16 as f32).unwrap_or(0.0));
    let italic_angle = table(b"post").and_then(|p| u32_at(p, 4)).map(|v| v as i32 as f32 / 65536.0).unwrap_or(0.0);
    let fs_type = table(b"OS/2").and_then(|t| u16_at(t, 8)).unwrap_or(0);
    let cff = table(b"CFF ").is_some();
    if !cff && table(b"glyf").is_none() {
        return None;
    }
    let ps = table(b"name").and_then(ps_name).unwrap_or_else(|| face.family.replace(' ', ""));
    // A collection's face as a font file of its own: its tables, one after another.
    let bytes = if data.get(0..4) == Some(b"ttcf") || face.index() > 0 {
        let n = list.len() as u16;
        let mut pow = 1u16;
        while pow * 2 <= n {
            pow *= 2;
        }
        let mut out = Vec::new();
        out.extend_from_slice(if cff { b"OTTO" } else { &[0, 1, 0, 0] });
        out.extend_from_slice(&n.to_be_bytes());
        out.extend_from_slice(&(pow * 16).to_be_bytes());
        out.extend_from_slice(&(pow.trailing_zeros() as u16).to_be_bytes());
        out.extend_from_slice(&(n * 16 - pow * 16).to_be_bytes());
        let records = header_record(data, face.index())?;
        let mut body = Vec::new();
        for (r, &(tag, off, len)) in list.iter().enumerate() {
            let checksum = u32_at(data, records + 16 * r + 4).unwrap_or(0);
            let at = 12 + 16 * list.len() + body.len();
            out.extend_from_slice(&tag);
            out.extend_from_slice(&checksum.to_be_bytes());
            out.extend_from_slice(&(at as u32).to_be_bytes());
            out.extend_from_slice(&(len as u32).to_be_bytes());
            body.extend_from_slice(&data[off..off + len]);
            while body.len() % 4 != 0 {
                body.push(0);
            }
        }
        out.extend_from_slice(&body);
        out
    } else {
        data.to_vec()
    };
    Some(Program { data: bytes, cff, ps_name: ps, upem: upem.max(1.0), bbox, italic_angle, restricted: fs_type & 0x000f == 0x0002 })
}

/// Where the table records of face `index` start in the file.
fn header_record(data: &[u8], index: u32) -> Option<usize> {
    let start = if data.get(0..4) == Some(b"ttcf") { u32_at(data, 12 + 4 * index as usize)? as usize } else { 0 };
    Some(start + 12)
}

/// A PDF name made of the PostScript name's plain letters.
fn pdf_name(s: &str) -> Vec<u8> {
    let n: Vec<u8> = s.bytes().filter(|b| b.is_ascii_graphic() && !b"()<>[]{}/%#".contains(b)).collect();
    if n.is_empty() { b"Font".to_vec() } else { n }
}

/// The objects that put `family` (by font) into the fonts that need it: each font's entry
/// again, a new descriptor, and the font file (shared by fonts drawn in the same face). For
/// the saved file (`for_file`) fonts whose makers forbid it are left out, and the files are
/// compressed.
pub fn font_objects(fonts: &[PdfFont], embed: &[(usize, String)], for_file: bool, next: &mut u32) -> Vec<(ObjectId, Object)> {
    let mut out: Vec<(ObjectId, Object)> = Vec::new();
    let mut files: HashMap<u32, (ObjectId, String, f32, [f32; 4], f32, bool)> = HashMap::new();
    for (k, family) in embed {
        let Some(f) = fonts.get(*k) else { continue };
        let Some(id) = f.obj else { continue };
        if f.kind != Kind::Simple || matches!(standard_font(&f.ps_name), Some((Standard::Symbol | Standard::Dingbats, _))) {
            continue;
        }
        if !f.dict.has(b"Widths") && f.width(65) == 0.0 {
            continue;
        }
        let face = wordcraft_fonts::word::resolve(family, f.bold, f.italic).face.get();
        let entry = match files.get(&face.id()) {
            Some(e) => e.clone(),
            None => {
                let Some(p) = program(face) else { continue };
                if for_file && p.restricted {
                    continue;
                }
                let mut dict = Dictionary::new();
                if p.cff {
                    dict.set("Subtype", Object::Name(b"OpenType".to_vec()));
                } else {
                    dict.set("Length1", Object::Integer(p.data.len() as i64));
                }
                let mut s = Stream::new(dict, p.data);
                if for_file {
                    let _ = s.compress();
                } else {
                    s = s.with_compression(false);
                }
                let fid = (*next, 0);
                *next += 1;
                out.push((fid, Object::Stream(s)));
                let e = (fid, p.ps_name, p.upem, p.bbox, p.italic_angle, p.cff);
                files.insert(face.id(), e.clone());
                e
            }
        };
        let (fid, ps, upem, bbox, italic_angle, cff) = entry;
        let scale = 1000.0 / upem;
        let name = pdf_name(&ps);
        // Not symbolic: the letters are found through the encoding's names and the font's
        // Unicode map. Italic as the face is.
        let mut flags = (f.flags & !(1 << 2)) | (1 << 5);
        if face.italic {
            flags |= 1 << 6;
        }
        let mut desc = Dictionary::new();
        desc.set("Type", Object::Name(b"FontDescriptor".to_vec()));
        desc.set("FontName", Object::Name(name.clone()));
        desc.set("Flags", Object::Integer(flags));
        desc.set("FontBBox", Object::Array(bbox.iter().map(|v| Object::Real(v * scale)).collect()));
        desc.set("ItalicAngle", Object::Real(italic_angle));
        desc.set("Ascent", Object::Real((face.ascent as f32) * scale));
        desc.set("Descent", Object::Real(-(face.descent as f32) * scale));
        desc.set("CapHeight", Object::Real((face.cap_height as f32) * scale));
        desc.set("StemV", Object::Integer(if face.weight >= 600.0 { 120 } else { 80 }));
        desc.set(if cff { "FontFile3" } else { "FontFile2" }, Object::Reference(fid));
        let did = (*next, 0);
        *next += 1;
        out.push((did, Object::Dictionary(desc)));
        let mut font = f.dict.clone();
        font.set("Subtype", Object::Name(if cff { b"Type1".to_vec() } else { b"TrueType".to_vec() }));
        font.set("BaseFont", Object::Name(name));
        font.set("FontDescriptor", Object::Reference(did));
        if !font.has(b"Widths") {
            // The 14 standard fonts may leave their widths out: write the ones the text was set with.
            font.set("FirstChar", Object::Integer(0));
            font.set("LastChar", Object::Integer(255));
            font.set("Widths", Object::Array((0..256).map(|c| Object::Real(f.width(c))).collect()));
        }
        if !font.has(b"Encoding") {
            font.set("Encoding", Object::Name(b"StandardEncoding".to_vec()));
        }
        out.push((id, Object::Dictionary(font)));
    }
    out
}
