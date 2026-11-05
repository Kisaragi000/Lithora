//! Drawing PDF pages with hayro (pure Rust, Apache-2.0 OR MIT).

use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_interpret::font::{FontData, FontQuery};
use hayro::hayro_interpret::util::TransformExt;
use hayro::hayro_syntax::Pdf;
use hayro::vello_cpu::color::palette::css::WHITE;
use hayro::vello_cpu::{Pixmap, RasterizerSettings, RenderContext, Resources, TargetInit};
use hayro::{RenderCache, RenderSettings, render_into};
use std::collections::HashMap;
use std::sync::Arc;

use super::read::Mat;

/// A page's size as shown (points) and the transform from page space to the view (y down).
#[derive(Clone, Copy, Debug)]
pub struct Geometry {
    pub width: f64,
    pub height: f64,
    pub display: Mat,
}

pub fn geometry(pdf: &Pdf) -> Vec<Geometry> {
    pdf.pages()
        .iter()
        .map(|p| {
            let (w, h) = p.render_dimensions();
            let t = p.initial_transform(true).to_kurbo().as_coeffs();
            Geometry { width: w as f64, height: h as f64, display: t }
        })
        .collect()
}

/// Fonts the PDF names but doesn't hold: an installed font of that name, the font the user
/// chose in Missing fonts, or the closest installed one.
pub fn settings(replacements: HashMap<String, String>) -> InterpreterSettings {
    let face_data = |family: &str, bold: bool, italic: bool| -> (FontData, u32) {
        let face = wordcraft_fonts::word::resolve(family, bold, italic).face.get();
        let data: &'static [u8] = face.data();
        (Arc::new(data), face.index())
    };
    InterpreterSettings {
        font_resolver: Arc::new(move |q| match q {
            FontQuery::Standard(s) => {
                let name = s.postscript_name().to_ascii_lowercase();
                match replacements.get(&name) {
                    Some(f) => Some(face_data(f, name.contains("bold"), name.contains("italic") || name.contains("oblique"))),
                    None => Some(s.get_font_data()),
                }
            }
            FontQuery::Fallback(f) => {
                let name = f.post_script_name.clone().or_else(|| f.font_name.clone()).unwrap_or_default();
                let (base, _) = super::font::strip_subset(&name);
                if let Some(family) = replacements.get(&base.to_ascii_lowercase()) {
                    return Some(face_data(family, f.is_bold, f.is_italic));
                }
                let (family, bold, italic) = super::font::family_and_style(base);
                let family = f.font_family.clone().unwrap_or(family);
                match super::font::installed_as(&family, base) {
                    Some(fam) => Some(face_data(&fam, f.is_bold || bold, f.is_italic || italic)),
                    None => Some(f.pick_standard_font().get_font_data()),
                }
            }
        }),
        ..Default::default()
    }
}

/// Draw part of a page: the view rectangle (x, y, w, h in points; all of it when `None`) at
/// `scale` pixels per point. Returns its size in pixels, where it starts, and the RGBA pixels.
pub fn draw(pdf: &Pdf, page: usize, scale: f64, rect: Option<[f64; 4]>, settings: &InterpreterSettings) -> Result<(u32, u32, u32, u32, Vec<u8>), String> {
    let pages = pdf.pages();
    let p = pages.get(page).ok_or("no such page")?;
    let (w, h) = p.render_dimensions();
    let full_w = (w as f64 * scale).round().max(1.0);
    let full_h = (h as f64 * scale).round().max(1.0);
    let (x0, y0, x1, y1) = match rect {
        Some([x, y, rw, rh]) => {
            let x0 = (x * scale).floor().clamp(0.0, full_w);
            let y0 = (y * scale).floor().clamp(0.0, full_h);
            let x1 = ((x + rw) * scale).ceil().clamp(0.0, full_w);
            let y1 = ((y + rh) * scale).ceil().clamp(0.0, full_h);
            (x0, y0, x1, y1)
        }
        None => (0.0, 0.0, full_w, full_h),
    };
    let (pw, ph) = ((x1 - x0).max(1.0), (y1 - y0).max(1.0));
    if pw > 16384.0 || ph > 16384.0 {
        return Err("the page is too large to draw at this zoom".into());
    }
    let cache = RenderCache::new();
    let mut ctx = RenderContext::new(pw as u16, ph as u16);
    let transform = hayro::kurbo::Affine::translate((-x0, -y0)) * hayro::kurbo::Affine::scale(scale) * p.initial_transform(true).to_kurbo();
    render_into(p, &cache, settings, &RenderSettings::default(), &mut ctx, transform);
    ctx.flush();
    let mut pixmap = Pixmap::new(ctx.width(), ctx.height());
    ctx.render_with(&mut pixmap, &mut Resources::default(), RasterizerSettings { target_init: TargetInit::Clear(WHITE), ..Default::default() });
    let data = pixmap.data_as_u8_slice().to_vec();
    Ok((pixmap.width() as u32, pixmap.height() as u32, x0 as u32, y0 as u32, data))
}
