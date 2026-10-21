//! AutoRecover: every open document with unsaved changes keeps a copy in the app's data folder
//! (WordCraft's recovery store), refreshed every few minutes while it is edited (5 by default;
//! Settings changes it). Saving or closing it on purpose removes the copy. When Lithora starts
//! after a crash, the copies left behind are offered back.
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::{AppHandle, Manager, State};
use wordcraft_engine::Session;

use crate::engine::{DocState, EngineState, add_to};

/// How often a document with unsaved changes gets a fresh recovery copy, in seconds.
static INTERVAL_SECS: AtomicU64 = AtomicU64::new(300);

/// Set how often recovery copies are made (20 seconds to an hour).
#[tauri::command]
pub fn recovery_set_interval(seconds: u64) {
    INTERVAL_SECS.store(seconds.clamp(20, 3600), Ordering::Relaxed);
}

/// Keep every document's copy up to date, from a background thread.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        // When each document's changes were last copied (or first seen unsaved).
        let mut copied: HashMap<u32, Instant> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let state = app.state::<EngineState>();
            let Ok(mut docs) = state.lock() else { return };
            let interval = Duration::from_secs(INTERVAL_SECS.load(Ordering::Relaxed));
            let now = Instant::now();
            copied.retain(|id, _| docs.sessions.get(id).is_some_and(|s| s.dirty));
            for (id, s) in docs.sessions.iter_mut() {
                if !s.dirty {
                    // Saved: the copy goes.
                    s.recovery_tick();
                    continue;
                }
                let since = *copied.entry(*id).or_insert(now);
                if now.duration_since(since) >= interval {
                    s.recovery_tick();
                    // The copy is made (or under way): wait a whole interval again.
                    if s.recovery_wait().is_none() {
                        copied.insert(*id, now);
                    }
                }
            }
        }
    });
}

/// A blank session watching the recovery folder, after its first look at the folder.
fn probe(dir: std::path::PathBuf) -> Result<Session, String> {
    let mut s = Session::new(wordcraft_engine::doc::Document::new());
    s.enable_recovery(dir, Arc::new(|| {}))?;
    let until = Instant::now() + Duration::from_secs(5);
    while !s.recovery_ready() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(25));
        s.recovery_tick();
    }
    Ok(s)
}

/// Documents left behind by a Lithora that didn't close normally: [{id, name, savedAt}].
/// Copies of documents open right now are locked, so they aren't listed.
#[tauri::command]
pub fn recovery_list(state: State<EngineState>) -> Result<Value, String> {
    let Some(dir) = state.lock()?.recovery_dir.clone() else { return Ok(json!([])) };
    let s = probe(dir)?;
    Ok(serde_json::to_value(s.recovery_documents()).unwrap_or(json!([])))
}

/// Open a recovered copy in a new tab. It has no file yet: Save asks where to put it.
#[tauri::command]
pub fn recovery_open(state: State<EngineState>, id: String, name: String) -> Result<DocState, String> {
    let Some(dir) = state.lock()?.recovery_dir.clone() else { return Err("AutoRecover is off".into()) };
    let mut s = probe(dir)?;
    s.run("file.recover", &json!({ "restore": id })).map_err(|e| e.to_string())?;
    let until = Instant::now() + Duration::from_secs(30);
    loop {
        s.recovery_tick();
        if s.dirty {
            break;
        }
        if let Some(e) = s.recovery_error() {
            return Err(e.to_string());
        }
        if Instant::now() > until {
            return Err("the recovered copy took too long to load".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    s.file_name = Some(name);
    let mut docs = state.lock()?;
    // `probe` already watches the recovery folder; the copy is adopted as this document's own.
    let dir = docs.recovery_dir.take();
    let result = add_to(&mut docs, s);
    docs.recovery_dir = dir;
    result
}

/// Delete a recovered copy the user doesn't want.
#[tauri::command]
pub fn recovery_discard(state: State<EngineState>, id: String) -> Result<(), String> {
    let Some(dir) = state.lock()?.recovery_dir.clone() else { return Ok(()) };
    let mut s = probe(dir)?;
    s.run("file.recover", &json!({ "discard": id })).map_err(|e| e.to_string())?;
    let until = Instant::now() + Duration::from_secs(5);
    while s.recovery_busy() && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(25));
        s.recovery_tick();
    }
    Ok(())
}
