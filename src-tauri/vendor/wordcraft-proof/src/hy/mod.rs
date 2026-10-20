//! Armenian proofing (Lithora addition). Spelling uses a Hunspell `hy_AM` dictionary: Lithora
//! ships HySpell's reformed-orthography dictionary (MIT, www.hyspell.com) in its dictionaries
//! folder. Suggestions use the same dictionary-driven ranking as Czech and Indonesian
//! ([`crate::cs::suggest`]). There are no Armenian grammar rules or hyphenation patterns.

mod numdict;

use std::sync::{Arc, RwLock};

pub use numdict::NumDict;

/// The Armenian dictionary: `None` until first use, then the installed one (or an empty one).
static DICT: RwLock<Option<Arc<NumDict>>> = RwLock::new(None);

/// File names of an Armenian Hunspell dictionary.
const NAMES: &[&str] = &["hy_AM", "hy-AM", "hy", "hy-r"];

/// The Armenian dictionary, read on first use (an empty one when none is installed).
pub fn dictionary() -> Arc<NumDict> {
    if let Some(d) = DICT.read().unwrap_or_else(|e| e.into_inner()).as_ref() {
        return d.clone();
    }
    let loaded = Arc::new(load_installed());
    let mut slot = DICT.write().unwrap_or_else(|e| e.into_inner());
    slot.get_or_insert(loaded).clone()
}

fn load_installed() -> NumDict {
    let Some((aff, dic)) = crate::hunspell::find(NAMES) else {
        log::info!("Armenian spelling: no Hunspell hy_AM dictionary installed");
        return NumDict::default();
    };
    let read = |p: &std::path::Path| std::fs::read(p).map_err(|e| format!("{}: {e}", p.display())).and_then(|b| String::from_utf8(b).map_err(|e| e.to_string()));
    let loaded = read(&aff).and_then(|a| read(&dic).and_then(|d| NumDict::parse(&a, &d)));
    crate::hunspell::note_load("hy_AM", &dic, loaded).unwrap_or_else(|e| {
        log::warn!("Armenian spelling: {e}");
        NumDict::default()
    })
}

/// Use this Armenian dictionary from now on (Hunspell `.aff` and `.dic` text).
pub fn install_dictionary(aff: &str, dic: &str) -> Result<(), String> {
    let d = NumDict::parse(aff, dic)?;
    *DICT.write().unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(d));
    Ok(())
}

/// Forget the loaded dictionary, so the next check looks for an installed one again.
pub fn reload_dictionary() {
    *DICT.write().unwrap_or_else(|e| e.into_inner()) = None;
}

/// The `.dic` file of the Armenian dictionary found now, if any.
pub fn installed_path() -> Option<std::path::PathBuf> {
    crate::hunspell::find(NAMES).map(|(_, dic)| dic)
}

/// Is an Armenian dictionary available (spelling is checked)?
pub fn has_dictionary() -> bool {
    !dictionary().is_empty()
}

/// Is `c` a letter of the Armenian script?
pub fn is_armenian_letter(c: char) -> bool {
    ('\u{0531}'..='\u{0556}').contains(&c) || ('\u{0561}'..='\u{0587}').contains(&c) || ('\u{FB13}'..='\u{FB17}').contains(&c)
}

/// Armenian marks written inside a word: apostrophe ՚, emphasis ՛, exclamation ՜ and question ՞.
pub fn is_in_word_mark(c: char) -> bool {
    matches!(c, '\u{055A}' | '\u{055B}' | '\u{055C}' | '\u{055E}')
}

/// The word without its in-word marks (`ի՞նչ` is spelled as `ինչ`), and with the ligature
/// `և` kept as it is (the dictionary has it).
fn plain(word: &str) -> String {
    word.chars().filter(|c| !is_in_word_mark(*c)).collect()
}

/// Is `word` spelled correctly in Armenian? Numbers, single letters, short words in capitals and
/// words in other scripts are accepted, and so is every word when no dictionary is installed.
pub fn is_correct(word: &str) -> bool {
    is_correct_with(&dictionary(), word)
}

/// [`is_correct`] against a given dictionary (an empty one accepts everything).
pub fn is_correct_with(d: &NumDict, word: &str) -> bool {
    if d.is_empty() {
        return true;
    }
    let w = word.trim_matches(|c: char| !c.is_alphanumeric());
    let w = plain(w);
    let n = w.chars().count();
    if n <= 1 || w.chars().any(|c| c.is_ascii_digit()) || !w.chars().any(char::is_alphabetic) {
        return true;
    }
    if w.chars().all(|c| !c.is_lowercase()) && n <= 6 {
        return true;
    }
    if !w.chars().any(is_armenian_letter) {
        return true;
    }
    if w.contains('-') {
        return w.split('-').all(|p| p.chars().count() <= 1 || known(d, p));
    }
    known(d, &w)
}

fn known(d: &NumDict, w: &str) -> bool {
    d.check(w) || crate::in_user_dictionary(&w.to_lowercase())
}

/// Spelling suggestions for a misspelled Armenian word, best first.
pub fn suggest(word: &str, max: usize) -> Vec<String> {
    dictionary().suggest(&plain(word), max)
}

#[cfg(test)]
mod tests {
    use super::*;

    const AFF: &str = "SET UTF-8\nFLAG num\nTRY ունը\nSFX 1 Y 1\nSFX 1 0 ը .\nPFX 300 Y 1\nPFX 300 0 ան .\n";
    const DIC: &str = "2\nտուն/1,300\nինչ\n";

    #[test]
    fn armenian_words_marks_and_affixes() {
        let d = NumDict::parse(AFF, DIC).unwrap();
        for w in ["տուն", "տունը", "անտուն", "անտունը", "ի՞նչ", "Տուն", "abc", "2026"] {
            assert!(is_correct_with(&d, w), "{w}");
        }
        for w in ["տուուն", "ինճ", "անինչ"] {
            assert!(!is_correct_with(&d, w), "{w}");
        }
        assert!(d.suggest("տուուն", 5).contains(&"տուն".to_string()));
    }
}
