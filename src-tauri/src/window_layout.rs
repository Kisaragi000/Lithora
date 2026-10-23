//! The main window's size and place: the first launch opens maximized; later launches open the
//! way Lithora was last closed (maximized, or the size and place it had), always fitted to the
//! screen it opens on.

use tauri::{Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const FLAGS: StateFlags = StateFlags::SIZE.union(StateFlags::POSITION).union(StateFlags::MAXIMIZED);

/// Saves the window's size, place and maximized state (when it moves, and when Lithora closes).
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_window_state::Builder::default()
        .with_state_flags(FLAGS)
        // `restore` below puts it back, fitted to the screen.
        .skip_initial_state("main")
        // Windows a tab was dragged out into open where it was dropped, and aren't remembered.
        .with_filter(|label| label == "main")
        .build()
}

/// Open document `doc` in a window of its own at screen point (`x`, `y`), in logical pixels: a
/// tab dragged out of the tab bar.
#[tauri::command]
pub fn open_doc_window(app: tauri::AppHandle, doc: u32, title: String, x: f64, y: f64) -> Result<(), String> {
    use std::sync::atomic::{AtomicU32, Ordering};
    static NEXT: AtomicU32 = AtomicU32::new(1);
    let label = format!("doc-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let url = tauri::WebviewUrl::App(format!("index.html?doc={doc}").into());
    let (w, h) = (1100.0, 780.0);
    let window = tauri::WebviewWindowBuilder::new(&app, label, url)
        .title(format!("{title} - Lithora"))
        .inner_size(w, h)
        .min_inner_size(800.0, 560.0)
        // The window's top-left a little up and left of the pointer, so the tab lands under it.
        .position((x - 120.0).max(0.0), (y - 20.0).max(0.0))
        .theme(Some(tauri::Theme::Light))
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    crate::title_bar::apply(&window);
    // Keep the whole window on the screen the pointer is on.
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = *monitor.work_area();
        let scale = monitor.scale_factor();
        let (pw, ph) = ((w * scale) as i32, (h * scale) as i32);
        let px = ((x - 120.0) * scale) as i32;
        let py = ((y - 20.0) * scale) as i32;
        let left = area.position.x;
        let top = area.position.y;
        let right = left + area.size.width as i32;
        let bottom = top + area.size.height as i32;
        let nx = px.min(right - pw).max(left);
        let ny = py.min(bottom - ph).max(top);
        let _ = window.set_position(PhysicalPosition::new(nx, ny));
    }
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

/// The saved state of the main window, as the plugin writes it.
#[derive(serde::Deserialize)]
struct Saved {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    #[serde(default)]
    maximized: bool,
}

impl Saved {
    /// Where the un-maximized window goes. A window closed maximized has its maximized place
    /// saved (the plugin's earlier place is overwritten by the moves maximizing makes), so it
    /// is centered when un-maximized.
    fn place(&self) -> Option<(i32, i32)> {
        (!self.maximized).then_some((self.x, self.y))
    }
}

fn saved<R: Runtime>(window: &WebviewWindow<R>) -> Option<Saved> {
    let app = window.app_handle();
    let path = app.path().app_config_dir().ok()?.join(app.filename());
    let all: std::collections::HashMap<String, serde_json::Value> =
        serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    let s: Saved = serde_json::from_value(all.get(window.label())?.clone()).ok()?;
    (s.width > 0 && s.height > 0).then_some(s)
}

/// Size, place and show the main window. It starts hidden, so it never flashes at the wrong
/// size. A hidden window can't report its frame or place yet, so this works from the saved
/// numbers and the screen's work area (the part the taskbar leaves).
pub fn restore<R: Runtime>(window: &WebviewWindow<R>) {
    let monitor = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten());
    let saved = saved(window);
    if let Some(monitor) = monitor {
        let area = *monitor.work_area();
        let scale = monitor.scale_factor();
        // At most 90% of the screen's width and 85% of its height, leaving room for the title
        // bar; with nothing saved, 1280 by 840 points when that is smaller.
        let max_w = area.size.width * 9 / 10;
        let max_h = area.size.height * 85 / 100;
        let (w, h) = match &saved {
            Some(s) => (s.width.min(max_w), s.height.min(max_h)),
            None => (((1280.0 * scale) as u32).min(max_w), ((840.0 * scale) as u32).min(max_h)),
        };
        let centered = (
            area.position.x + (area.size.width.saturating_sub(w) / 2) as i32,
            area.position.y + (area.size.height.saturating_sub(h) / 3) as i32,
        );
        // Keep the saved place only when the whole window is on this screen (not on a monitor
        // that is gone, or half off the edge).
        let (x, y) = match saved.as_ref().and_then(Saved::place) {
            Some((x, y))
                if x >= area.position.x
                    && y >= area.position.y
                    && x + w as i32 <= area.position.x + area.size.width as i32
                    && y + h as i32 <= area.position.y + area.size.height as i32 =>
            {
                (x, y)
            }
            _ => centered,
        };
        let _ = window.set_size(PhysicalSize::new(w, h));
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    // The first launch opens maximized; later ones as Lithora was closed.
    if saved.as_ref().is_none_or(|s| s.maximized) {
        let _ = window.maximize();
    }
    let _ = window.show();
    let _ = window.set_focus();
}
