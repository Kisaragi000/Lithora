//! The LibreOffice engine, reached through LibreOfficeKit (LOK).
//!
//! LibreOffice loads the document, lays out its pages and draws them as bitmaps;
//! the React interface shows those bitmaps and sends keys, clicks and commands back.
//! LOK must always be called from the same thread, so one engine thread owns it and
//! the Tauri commands below talk to that thread over a channel.

mod lok_sys;

use lok_sys::*;
use serde::Serialize;
use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

// LOK callback and event numbers (LibreOfficeKitEnums.h).
const CALLBACK_INVALIDATE_TILES: c_int = 0;
const CALLBACK_INVALIDATE_VISIBLE_CURSOR: c_int = 1;
const CALLBACK_TEXT_SELECTION: c_int = 2;
const KEYEVENT_KEYINPUT: c_int = 0;
const KEYEVENT_KEYUP: c_int = 1;
const MOUSEEVENT_BUTTONDOWN: c_int = 0;
const MOUSEEVENT_BUTTONUP: c_int = 1;
const MOUSE_LEFT: c_int = 1;

/// Twips per inch. LOK measures everything in twips.
const TWIPS_PER_INCH: f64 = 1440.0;

/// How long to wait for LibreOffice to report what changed after an edit.
const EDIT_SETTLE: Duration = Duration::from_millis(400);

#[derive(Clone, Copy, Serialize)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
}

/// What the interface needs to lay out the pages and draw the cursor.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocState {
    pub pages: Vec<Rect>,
    pub cursor: Option<Rect>,
    pub selection: Vec<Rect>,
    /// Set when another program holds the file's lock, so LibreOffice opened it read-only.
    pub locked_by: Option<String>,
}

enum Event {
    Invalidate,
    Cursor(String),
    Selection(String),
}

type Reply<T> = Sender<Result<T, String>>;

enum Job {
    Open {
        path: PathBuf,
        reply: Reply<DocState>,
    },
    Render {
        page: usize,
        dpi: f64,
        reply: Reply<Vec<u8>>,
    },
    Key {
        char_code: i32,
        key_code: i32,
        reply: Reply<DocState>,
    },
    Click {
        x: i64,
        y: i64,
        reply: Reply<DocState>,
    },
    Command {
        command: String,
        reply: Reply<DocState>,
    },
    SaveAs {
        path: PathBuf,
        format: String,
        reply: Reply<()>,
    },
    Close,
}

/// Tauri state: the channel to the engine thread, started on first use.
#[derive(Default)]
pub struct EngineState(Mutex<Option<Sender<Job>>>);

impl EngineState {
    fn send(&self, app: &AppHandle, job: Job) -> Result<(), String> {
        let mut guard = self.0.lock().map_err(|_| "engine lock poisoned")?;
        if guard.is_none() {
            let profile = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("libreoffice-profile");
            let (tx, rx) = channel();
            std::thread::Builder::new()
                .name("libreoffice".into())
                .spawn(move || engine_thread(rx, profile))
                .map_err(|e| e.to_string())?;
            *guard = Some(tx);
        }
        guard
            .as_ref()
            .unwrap()
            .send(job)
            .map_err(|_| "the LibreOffice engine stopped".to_string())
    }
}

impl EngineState {
    /// Closes the open document so LibreOffice removes its lock file. Called when the app quits.
    pub fn close(&self) {
        if let Ok(guard) = self.0.lock()
            && let Some(tx) = guard.as_ref()
        {
            let _ = tx.send(Job::Close);
        }
    }
}

fn ask<T>(
    state: &EngineState,
    app: &AppHandle,
    make: impl FnOnce(Reply<T>) -> Job,
) -> Result<T, String> {
    let (tx, rx) = channel();
    state.send(app, make(tx))?;
    rx.recv()
        .map_err(|_| "the LibreOffice engine stopped".to_string())?
}

#[tauri::command]
pub fn engine_open(
    app: AppHandle,
    state: State<EngineState>,
    path: String,
) -> Result<DocState, String> {
    ask(&state, &app, |reply| Job::Open {
        path: PathBuf::from(path),
        reply,
    })
}

/// Returns the page as 8 bytes of size (width, height as little-endian u32) followed by RGBA pixels.
#[tauri::command]
pub fn engine_render_page(
    app: AppHandle,
    state: State<EngineState>,
    page: usize,
    dpi: f64,
) -> Result<tauri::ipc::Response, String> {
    let bytes = ask(&state, &app, |reply| Job::Render { page, dpi, reply })?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn engine_key(
    app: AppHandle,
    state: State<EngineState>,
    char_code: i32,
    key_code: i32,
) -> Result<DocState, String> {
    ask(&state, &app, |reply| Job::Key {
        char_code,
        key_code,
        reply,
    })
}

/// `x` and `y` are document coordinates in twips.
#[tauri::command]
pub fn engine_click(
    app: AppHandle,
    state: State<EngineState>,
    x: i64,
    y: i64,
) -> Result<DocState, String> {
    ask(&state, &app, |reply| Job::Click { x, y, reply })
}

/// Runs a LibreOffice command such as `.uno:Bold`.
#[tauri::command]
pub fn engine_command(
    app: AppHandle,
    state: State<EngineState>,
    command: String,
) -> Result<DocState, String> {
    if !command.starts_with(".uno:") {
        return Err("only .uno: commands are allowed".into());
    }
    ask(&state, &app, |reply| Job::Command { command, reply })
}

/// Saves the open document. `format` is a LibreOffice filter short name: docx, rtf, odt, pdf, doc, txt.
#[tauri::command]
pub fn engine_save_as(
    app: AppHandle,
    state: State<EngineState>,
    path: String,
    format: String,
) -> Result<(), String> {
    const ALLOWED: [&str; 6] = ["docx", "rtf", "odt", "pdf", "doc", "txt"];
    if !ALLOWED.contains(&format.as_str()) {
        return Err(format!("unsupported format: {format}"));
    }
    ask(&state, &app, |reply| Job::SaveAs {
        path: PathBuf::from(path),
        format,
        reply,
    })
}

/// The document passed on the command line (`lithora report.docx`), if any.
#[tauri::command]
pub fn startup_file() -> Option<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|p| p.is_file())
        .map(|p| {
            std::path::absolute(&p)
                .unwrap_or(p)
                .to_string_lossy()
                .into_owned()
        })
}

// ---------------------------------------------------------------------------
// Engine thread

struct Engine {
    _lib: libloading::Library,
    lok: *mut LibreOfficeKit,
    doc: *mut LibreOfficeKitDocument,
    events: Receiver<Event>,
    events_tx: *mut Sender<Event>,
    pages: Vec<Rect>,
    cursor: Option<Rect>,
    selection: Vec<Rect>,
    locked_by: Option<String>,
    profile_url: String,
}

fn engine_thread(jobs: Receiver<Job>, profile: PathBuf) {
    let mut engine: Option<Engine> = None;
    let mut start_error: Option<String> = None;
    for job in jobs {
        if engine.is_none() && start_error.is_none() {
            match unsafe { Engine::start(&profile) } {
                Ok(e) => engine = Some(e),
                Err(e) => start_error = Some(e),
            }
        }
        let Some(engine) = engine.as_mut() else {
            let err = start_error.clone().unwrap_or_default();
            match job {
                Job::Open { reply, .. }
                | Job::Key { reply, .. }
                | Job::Click { reply, .. }
                | Job::Command { reply, .. } => {
                    let _ = reply.send(Err(err));
                }
                Job::Render { reply, .. } => {
                    let _ = reply.send(Err(err));
                }
                Job::SaveAs { reply, .. } => {
                    let _ = reply.send(Err(err));
                }
                Job::Close => {}
            }
            continue;
        };
        unsafe {
            match job {
                Job::Open { path, reply } => {
                    let _ = reply.send(engine.open(&path));
                }
                Job::Render { page, dpi, reply } => {
                    let _ = reply.send(engine.render(page, dpi));
                }
                Job::Key {
                    char_code,
                    key_code,
                    reply,
                } => {
                    let _ = reply.send(engine.key(char_code, key_code));
                }
                Job::Click { x, y, reply } => {
                    let _ = reply.send(engine.click(x, y));
                }
                Job::Command { command, reply } => {
                    let _ = reply.send(engine.command(&command));
                }
                Job::SaveAs {
                    path,
                    format,
                    reply,
                } => {
                    let _ = reply.send(engine.save_as(&path, &format));
                }
                Job::Close => engine.close(),
            }
        }
    }
}

unsafe extern "C" fn on_callback(kind: c_int, payload: *const c_char, data: *mut c_void) {
    let tx = unsafe { &*(data as *const Sender<Event>) };
    let text = || {
        if payload.is_null() {
            String::new()
        } else {
            unsafe { CStr::from_ptr(payload) }
                .to_string_lossy()
                .into_owned()
        }
    };
    let event = match kind {
        CALLBACK_INVALIDATE_TILES => Event::Invalidate,
        CALLBACK_INVALIDATE_VISIBLE_CURSOR => Event::Cursor(text()),
        CALLBACK_TEXT_SELECTION => Event::Selection(text()),
        _ => return,
    };
    let _ = tx.send(event);
}

impl Engine {
    unsafe fn start(profile: &Path) -> Result<Engine, String> {
        let program = find_install().ok_or(
            "LibreOffice was not found. Install LibreOffice, or set LOK_PROGRAM_PATH to its \"program\" folder.",
        )?;
        let lib = unsafe { load_library(&program) }?;
        type Hook2 = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut LibreOfficeKit;
        let hook: libloading::Symbol<Hook2> = unsafe { lib.get(b"libreofficekit_hook_2") }
            .map_err(|e| format!("this LibreOffice has no LibreOfficeKit: {e}"))?;
        let program_c =
            CString::new(program.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        // A separate profile keeps Lithora from locking or changing the user's own LibreOffice settings.
        let _ = std::fs::create_dir_all(profile);
        let profile_url = file_url(profile);
        let profile_c = CString::new(profile_url.clone()).map_err(|e| e.to_string())?;
        let lok = unsafe { hook(program_c.as_ptr(), profile_c.as_ptr()) };
        if lok.is_null() {
            return Err("LibreOffice failed to start".into());
        }
        let (tx, rx) = channel();
        Ok(Engine {
            _lib: lib,
            lok,
            doc: std::ptr::null_mut(),
            events: rx,
            events_tx: Box::into_raw(Box::new(tx)),
            pages: Vec::new(),
            cursor: None,
            selection: Vec::new(),
            locked_by: None,
            profile_url,
        })
    }

    unsafe fn class(&self) -> &LibreOfficeKitClass {
        unsafe { &*(*self.lok).pClass }
    }

    unsafe fn doc_class(&self) -> Result<&LibreOfficeKitDocumentClass, String> {
        if self.doc.is_null() {
            return Err("no document is open".into());
        }
        Ok(unsafe { &*(*self.doc).pClass })
    }

    unsafe fn open(&mut self, path: &Path) -> Result<DocState, String> {
        // The engine keeps one document for now; close the previous one first.
        self.close();
        self.locked_by = foreign_lock(path, &self.profile_url);
        let url = CString::new(file_url(path)).map_err(|e| e.to_string())?;
        let cls = unsafe { self.class() };
        let doc =
            unsafe { (cls.documentLoad.ok_or("documentLoad missing")?)(self.lok, url.as_ptr()) };
        if doc.is_null() {
            let msg = unsafe { cls.getError.map(|f| f(self.lok)) }
                .filter(|p| !p.is_null())
                .map(|p| unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned())
                .unwrap_or_default();
            return Err(format!("LibreOffice could not open the file. {msg}"));
        }
        self.doc = doc;
        self.cursor = None;
        self.selection.clear();
        let dcls = unsafe { self.doc_class() }?;
        let empty = CString::new("").unwrap();
        unsafe {
            (dcls
                .initializeForRendering
                .ok_or("initializeForRendering missing")?)(doc, empty.as_ptr());
            if let Some(register) = dcls.registerCallback {
                register(doc, Some(on_callback), self.events_tx as *mut c_void);
            }
        }
        self.settle(Duration::from_millis(100));
        unsafe { self.state() }
    }

    /// Closes the document, which also removes LibreOffice's lock file next to it.
    fn close(&mut self) {
        if self.doc.is_null() {
            return;
        }
        if let Ok(cls) = unsafe { self.doc_class() }
            && let Some(destroy) = cls.destroy
        {
            unsafe { destroy(self.doc) };
        }
        self.doc = std::ptr::null_mut();
        // Drop events from the old document.
        while self.events.try_recv().is_ok() {}
    }

    unsafe fn render(&mut self, page: usize, dpi: f64) -> Result<Vec<u8>, String> {
        let dcls = unsafe { self.doc_class() }?;
        let r = *self.pages.get(page).ok_or("no such page")?;
        let dpi = dpi.clamp(24.0, 400.0);
        let w = ((r.width as f64) * dpi / TWIPS_PER_INCH).round().max(1.0) as i32;
        let h = ((r.height as f64) * dpi / TWIPS_PER_INCH).round().max(1.0) as i32;
        let mut out = vec![0u8; 8 + (w as usize) * (h as usize) * 4];
        out[0..4].copy_from_slice(&(w as u32).to_le_bytes());
        out[4..8].copy_from_slice(&(h as u32).to_le_bytes());
        let pixels = &mut out[8..];
        unsafe {
            (dcls.paintTile.ok_or("paintTile missing")?)(
                self.doc,
                pixels.as_mut_ptr(),
                w,
                h,
                r.x as c_int,
                r.y as c_int,
                r.width as c_int,
                r.height as c_int,
            );
        }
        // LOK paints BGRA; the canvas wants RGBA.
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
        }
        Ok(out)
    }

    unsafe fn key(&mut self, char_code: i32, key_code: i32) -> Result<DocState, String> {
        let dcls = unsafe { self.doc_class() }?;
        let post = dcls.postKeyEvent.ok_or("postKeyEvent missing")?;
        unsafe {
            post(self.doc, KEYEVENT_KEYINPUT, char_code, key_code);
            post(self.doc, KEYEVENT_KEYUP, char_code, key_code);
        }
        self.wait_for_change();
        unsafe { self.state() }
    }

    unsafe fn click(&mut self, x: i64, y: i64) -> Result<DocState, String> {
        let dcls = unsafe { self.doc_class() }?;
        let post = dcls.postMouseEvent.ok_or("postMouseEvent missing")?;
        unsafe {
            post(
                self.doc,
                MOUSEEVENT_BUTTONDOWN,
                x as c_int,
                y as c_int,
                1,
                MOUSE_LEFT,
                0,
            );
            post(
                self.doc,
                MOUSEEVENT_BUTTONUP,
                x as c_int,
                y as c_int,
                1,
                MOUSE_LEFT,
                0,
            );
        }
        self.settle(Duration::from_millis(80));
        unsafe { self.state() }
    }

    unsafe fn command(&mut self, command: &str) -> Result<DocState, String> {
        let dcls = unsafe { self.doc_class() }?;
        let cmd = CString::new(command).map_err(|e| e.to_string())?;
        let args = CString::new("").unwrap();
        unsafe {
            (dcls.postUnoCommand.ok_or("postUnoCommand missing")?)(
                self.doc,
                cmd.as_ptr(),
                args.as_ptr(),
                false,
            )
        };
        self.wait_for_change();
        unsafe { self.state() }
    }

    unsafe fn save_as(&mut self, path: &Path, format: &str) -> Result<(), String> {
        let dcls = unsafe { self.doc_class() }?;
        let url = CString::new(file_url(path)).map_err(|e| e.to_string())?;
        let fmt = CString::new(format).map_err(|e| e.to_string())?;
        let ok = unsafe {
            (dcls.saveAs.ok_or("saveAs missing")?)(
                self.doc,
                url.as_ptr(),
                fmt.as_ptr(),
                std::ptr::null(),
            )
        };
        if ok == 0 {
            return Err("LibreOffice could not save the file".into());
        }
        Ok(())
    }

    /// Waits until LibreOffice reports a repaint, then drains what follows.
    fn wait_for_change(&mut self) {
        let deadline = std::time::Instant::now() + EDIT_SETTLE;
        loop {
            let left = deadline.saturating_duration_since(std::time::Instant::now());
            match self.events.recv_timeout(left) {
                Ok(Event::Invalidate) => break,
                Ok(e) => self.apply(e),
                Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        self.settle(Duration::from_millis(15));
    }

    /// Takes in every event that arrives within `quiet`.
    fn settle(&mut self, quiet: Duration) {
        while let Ok(e) = self.events.recv_timeout(quiet) {
            self.apply(e);
        }
    }

    fn apply(&mut self, event: Event) {
        match event {
            Event::Invalidate => {}
            Event::Cursor(p) => self.cursor = parse_rects(&p).into_iter().next(),
            Event::Selection(p) => self.selection = parse_rects(&p),
        }
    }

    unsafe fn state(&mut self) -> Result<DocState, String> {
        let dcls = unsafe { self.doc_class() }?;
        let raw = unsafe {
            (dcls
                .getPartPageRectangles
                .ok_or("getPartPageRectangles missing")?)(self.doc)
        };
        if raw.is_null() {
            return Err("LibreOffice returned no pages".into());
        }
        let text = unsafe { CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned();
        unsafe { libc_free(raw as *mut c_void) };
        self.pages = parse_rects(&text);
        Ok(DocState {
            pages: self.pages.clone(),
            cursor: self.cursor,
            selection: self.selection.clone(),
            locked_by: self.locked_by.clone(),
        })
    }
}

unsafe extern "C" {
    #[link_name = "free"]
    fn libc_free(p: *mut c_void);
}

/// LibreOffice opens a file read-only when another program holds its lock file
/// (`.~lock.<name>#`, holding `,user,host,date,profile;`). Returns the user named in
/// a lock that is not ours.
fn foreign_lock(path: &Path, our_profile: &str) -> Option<String> {
    let name = path.file_name()?.to_string_lossy();
    let lock = path.with_file_name(format!(".~lock.{name}#"));
    let text = std::fs::read_to_string(lock).ok()?;
    let fields: Vec<&str> = text.trim().trim_end_matches(';').split(',').collect();
    let owner_profile = fields.get(4).copied().unwrap_or("");
    if owner_profile == our_profile {
        return None; // our own lock, left by an earlier run; LibreOffice reuses it
    }
    let user = fields.get(1).copied().unwrap_or("").trim();
    Some(if user.is_empty() {
        "another program".to_string()
    } else {
        user.to_string()
    })
}

/// Parses "x, y, w, h; x, y, w, h" (and the JSON form with a "rectangle" field) into rectangles.
fn parse_rects(payload: &str) -> Vec<Rect> {
    let text = if payload.trim_start().starts_with('{') {
        serde_json::from_str::<serde_json::Value>(payload)
            .ok()
            .and_then(|v| {
                v.get("rectangle")
                    .and_then(|r| r.as_str())
                    .map(str::to_owned)
            })
            .unwrap_or_default()
    } else {
        payload.to_owned()
    };
    text.split(';')
        .filter_map(|part| {
            let n: Vec<i64> = part
                .split(',')
                .filter_map(|s| s.trim().parse().ok())
                .collect();
            (n.len() >= 4 && n[2] >= 0 && n[3] > 0).then(|| Rect {
                x: n[0],
                y: n[1],
                width: n[2],
                height: n[3],
            })
        })
        .collect()
}

/// Finds LibreOffice's "program" folder.
fn find_install() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("LOK_PROGRAM_PATH").map(PathBuf::from)
        && p.is_dir()
    {
        return Some(p);
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        for base in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(dir) = std::env::var_os(base) {
                candidates.push(PathBuf::from(dir).join("LibreOffice").join("program"));
            }
        }
    } else {
        candidates.push("/usr/lib/libreoffice/program".into());
        candidates.push("/usr/lib64/libreoffice/program".into());
        if let Ok(entries) = std::fs::read_dir("/opt") {
            let mut opt: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .is_some_and(|n| n.to_string_lossy().starts_with("libreoffice"))
                })
                .map(|p| p.join("program"))
                .collect();
            opt.sort();
            candidates.extend(opt.into_iter().rev());
        }
    }
    candidates.into_iter().find(|p| p.is_dir())
}

unsafe fn load_library(program: &Path) -> Result<libloading::Library, String> {
    let names: &[&str] = if cfg!(windows) {
        &["sofficeapp.dll", "mergedlo.dll"]
    } else {
        &["libsofficeapp.so", "libmergedlo.so"]
    };
    if cfg!(windows) {
        // LibreOffice's DLLs find each other through PATH, as LibreOfficeKitInit.h sets up.
        let ure = program.join("..").join("URE").join("bin");
        let old = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![program.to_path_buf(), ure];
        paths.extend(std::env::split_paths(&old));
        if let Ok(joined) = std::env::join_paths(paths) {
            unsafe { std::env::set_var("PATH", joined) };
        }
    }
    let mut last = String::new();
    for name in names {
        let path = program.join(name);
        if !path.exists() {
            continue;
        }
        // libsofficeapp.so can be a small stub in merged builds; fall through to the next name on failure.
        match unsafe { libloading::Library::new(&path) } {
            Ok(lib) if unsafe { lib.get::<*const c_void>(b"libreofficekit_hook_2") }.is_ok() => {
                return Ok(lib);
            }
            Ok(_) => last = format!("{} has no LibreOfficeKit entry point", path.display()),
            Err(e) => last = e.to_string(),
        }
    }
    Err(format!(
        "could not load LibreOffice from {}: {last}",
        program.display()
    ))
}

/// Turns a filesystem path into a file:// URL, percent-encoding anything unusual.
fn file_url(path: &Path) -> String {
    let abs = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    let s = abs.to_string_lossy().replace('\\', "/");
    let mut out = String::from("file://");
    if !s.starts_with('/') {
        out.push('/');
    }
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_and_json_rectangles() {
        let r = parse_rects("0, 0, 12240, 15840; 0, 16125, 12240, 15840");
        assert_eq!(r.len(), 2);
        assert_eq!(r[1].y, 16125);
        let j =
            parse_rects(r#"{"viewId":"0","rectangle":"1418, 1418, 0, 276","mispelledWord":"0"}"#);
        assert_eq!(j[0].x, 1418, "a zero-width cursor is kept");
        let j = parse_rects(r#"{"rectangle":"1418, 1418, 15, 276"}"#);
        assert_eq!(j[0].height, 276);
        assert!(parse_rects("EMPTY").is_empty());
    }

    #[test]
    fn detects_foreign_locks() {
        let dir = std::env::temp_dir().join(format!("lithora-lock-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let doc = dir.join("a.docx");
        assert_eq!(foreign_lock(&doc, "file:///ours"), None);
        std::fs::write(
            dir.join(".~lock.a.docx#"),
            ",anna,pc,19.10.2026 11:51,file:///theirs;",
        )
        .unwrap();
        assert_eq!(foreign_lock(&doc, "file:///ours").as_deref(), Some("anna"));
        assert_eq!(foreign_lock(&doc, "file:///theirs"), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn builds_file_urls() {
        assert_eq!(
            file_url(Path::new("/tmp/a b/Отчёт.docx")),
            "file:///tmp/a%20b/%D0%9E%D1%82%D1%87%D1%91%D1%82.docx"
        );
    }
}
