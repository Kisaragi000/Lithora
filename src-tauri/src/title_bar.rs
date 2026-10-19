//! Gives the window title bar Lithora's colors on Windows 11.
//!
//! The window is set to the light theme in tauri.conf.json, so Windows 10 and 11
//! draw a light title bar even when the system uses dark mode. Windows 11 also
//! lets an app pick the exact caption colors, which this module does.

#[cfg(windows)]
pub fn apply(window: &tauri::WebviewWindow) {
    use std::ffi::c_void;
    use windows_sys::Win32::Graphics::Dwm::{
        DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR, DwmSetWindowAttribute,
    };

    // COLORREF is 0x00BBGGRR.
    const fn colorref(rgb: u32) -> u32 {
        ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF)
    }
    const CAPTION: u32 = colorref(0xFFFFFF); // white, like the app header
    const TEXT: u32 = colorref(0x083B69); // logo navy
    const BORDER: u32 = colorref(0xE2E8F0); // the header's bottom border

    let Ok(hwnd) = window.hwnd() else { return };
    for (attribute, color) in [
        (DWMWA_CAPTION_COLOR, CAPTION),
        (DWMWA_TEXT_COLOR, TEXT),
        (DWMWA_BORDER_COLOR, BORDER),
    ] {
        // Windows 10 doesn't know these attributes and returns an error; the light theme covers it.
        unsafe {
            DwmSetWindowAttribute(
                hwnd.0 as _,
                attribute as u32,
                &color as *const u32 as *const c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(not(windows))]
pub fn apply(_window: &tauri::WebviewWindow) {}
