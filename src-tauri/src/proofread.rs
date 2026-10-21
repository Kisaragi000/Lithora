//! Proofread: every spelling, grammar and style issue in a document, for the Proofread panel,
//! and fixing them (one at a time or all misspellings at once, as a single Undo step).
//!
//! Spelling and the built-in grammar rules are WordCraft's (English and Russian; Armenian and
//! Russian spelling use Lithora's bundled dictionaries). English grammar and style also come
//! from Harper (https://github.com/Automattic/harper, Apache-2.0), which runs offline inside
//! Lithora. A few simple checks (a word twice in a row, extra spaces, a space before a comma,
//! Armenian punctuation) cover Russian and Armenian text too.

use crate::engine::{DocState, EngineState, doc_state, lock};
use harper_core::linting::{LintGroup, Linter, Suggestion};
use harper_core::parsers::PlainEnglish;
use harper_core::spell::FstDictionary;
use harper_core::{Dialect, Document};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::ops::Range;
use std::sync::mpsc::{Sender, channel};
use std::sync::{Mutex, OnceLock};
use tauri::State;
use wordcraft_engine::Session;
use wordcraft_engine::doc::{Pos, StoryRef};
use wordcraft_engine::layout::para::{ProofRun, is_list_item, paragraph_issues, proof_runs};
use wordcraft_engine::proof::{IssueKind, ProofLang};

/// One issue for the panel.
#[derive(Serialize, Clone, Debug)]
pub struct ProofIssue {
    pub start: Pos,
    pub end: Pos,
    /// The text the issue covers.
    pub text: String,
    /// "spelling", "grammar" or "style".
    pub kind: &'static str,
    pub message: String,
    pub suggestions: Vec<String>,
    /// The sentence around it, to show in the panel.
    pub context: String,
    /// Where `text` is in `context`, in UTF-16 units (as the window counts).
    pub at: [usize; 2],
    /// A misspelling Fix all corrects: its first suggestion is close, and it isn't a name.
    #[serde(rename = "autoFix")]
    pub auto_fix: bool,
}

/// A change to make: replace the text between `start` and `end`, if it still reads `text`.
#[derive(Deserialize)]
pub struct Fix {
    pub start: Pos,
    pub end: Pos,
    pub text: String,
    pub replacement: String,
}

/// Most issues listed at once; a document with more is fixed a screenful at a time.
const MAX_ISSUES: usize = 2000;

#[tauri::command(async)]
pub fn engine_proofread(state: State<EngineState>, doc: u32) -> Result<Vec<ProofIssue>, String> {
    let mut docs = lock(&state)?;
    let s = docs.sessions.get_mut(&doc).ok_or("that document is closed")?;
    Ok(proofread(s))
}

/// Make these changes, last first so earlier positions stay right, as one Undo step. A change
/// whose text no longer reads as it did is skipped.
#[tauri::command(async)]
pub fn engine_proofread_fix(state: State<EngineState>, doc: u32, fixes: Vec<Fix>) -> Result<DocState, String> {
    let mut docs = lock(&state)?;
    let s = docs.sessions.get_mut(&doc).ok_or("that document is closed")?;
    apply(s, fixes)?;
    Ok(doc_state(doc, s))
}

pub(crate) fn apply(s: &mut Session, mut fixes: Vec<Fix>) -> Result<usize, String> {
    let key = |p: &Pos| (s.doc.para_paths(p.story).iter().position(|q| *q == p.path).unwrap_or(usize::MAX), p.off);
    let mut keyed: Vec<_> = fixes.drain(..).map(|f| (key(&f.start), f)).collect();
    keyed.sort_by(|a, b| b.0.cmp(&a.0));
    let mut done = 0;
    let mut last_start: Option<(usize, usize)> = None;
    for (k, f) in keyed {
        // Overlapping changes: only the later one.
        if last_start.is_some_and(|l| f.end.path == f.start.path && (k.0, f.end.off) > l) {
            continue;
        }
        let Some(p) = s.doc.para(f.start.story, &f.start.path) else { continue };
        if f.start.path != f.end.path || p.text.get(f.start.off..f.end.off) != Some(f.text.as_str()) {
            continue;
        }
        let range = json!({ "anchor": f.start, "focus": f.end });
        s.run("select.range", &range).map_err(|e| e.to_string())?;
        // Every change after the first joins its Undo step.
        if done > 0 {
            s.join_next_undo();
        }
        if f.replacement.is_empty() {
            s.run("text.delete", &json!({})).map_err(|e| e.to_string())?;
        } else {
            s.run("text.insert", &json!({ "text": f.replacement })).map_err(|e| e.to_string())?;
        }
        done += 1;
        last_start = Some(k);
    }
    Ok(done)
}

/// Every issue in the document's body, in order.
pub(crate) fn proofread(s: &mut Session) -> Vec<ProofIssue> {
    let story = StoryRef::Body;
    let spelling = s.prefs.spelling();
    let mut paras = Vec::new();
    for path in s.doc.para_paths(story) {
        let Some(p) = s.doc.para(story, &path) else { continue };
        if p.text.trim().is_empty() {
            continue;
        }
        let runs = proof_runs(&s.doc, p, None);
        let issues = paragraph_issues(p, &runs, &spelling, true, is_list_item(&s.doc, p));
        paras.push((path, p.text.clone(), runs, issues));
    }
    // English grammar and style for all paragraphs at once.
    let english: Vec<String> = paras.iter().map(|(_, text, runs, _)| english_text(text, runs)).collect();
    let harper = harper_lints(english.clone());
    let mut out = Vec::new();
    for (k, (path, text, runs, issues)) in paras.into_iter().enumerate() {
        let mut found: Vec<(Range<usize>, &'static str, String, Vec<String>)> = Vec::new();
        let lints = harper.get(k).map(Vec::as_slice).unwrap_or(&[]);
        for i in issues {
            let word = text.get(i.start..i.end).unwrap_or("");
            let (kind, suggestions) = if i.kind == IssueKind::Spelling {
                let mut list: Vec<String> = lints
                    .iter()
                    .filter(|l| l.1 == SPELLING_IDEAS && l.0 == (i.start..i.end))
                    .flat_map(|l| l.3.iter().take(3).cloned())
                    .collect();
                for w in wordcraft_engine::proof::suggest_in(word, 6, i.lang) {
                    if !list.contains(&w) {
                        list.push(w);
                    }
                }
                list.truncate(6);
                ("spelling", list)
            } else {
                ("grammar", i.suggestions.clone())
            };
            found.push((i.start..i.end, kind, i.message.clone(), suggestions));
        }
        for l in lints.iter().filter(|l| l.1 != SPELLING_IDEAS) {
            push_new(&mut found, l.clone());
        }
        let english_para = !english.get(k).is_none_or(|e| e.is_empty());
        for l in basic_issues(&text, &runs, english_para) {
            push_new(&mut found, l);
        }
        found.sort_by_key(|f| (f.0.start, f.0.end));
        for (r, kind, message, suggestions) in found {
            let (context, at) = context(&text, r.clone());
            let auto_fix = kind == "spelling" && suggestions.first().is_some_and(|w| safe_fix(&text, r.clone(), w));
            out.push(ProofIssue {
                start: Pos { story, path: path.clone(), off: r.start },
                end: Pos { story, path: path.clone(), off: r.end },
                text: text[r].to_string(),
                kind,
                message,
                suggestions,
                context,
                at,
                auto_fix,
            });
            if out.len() >= MAX_ISSUES {
                return out;
            }
        }
    }
    out
}

type Found = (Range<usize>, &'static str, String, Vec<String>);

/// Harper's spelling suggestions, used only to rank the dictionary's.
const SPELLING_IDEAS: &str = "spelling-ideas";

/// Add an issue unless one already covers that text.
fn push_new(found: &mut Vec<Found>, f: Found) {
    let overlaps = |r: &Range<usize>| r.start < f.0.end && f.0.start < r.end || (r.start == f.0.start && r.end == f.0.end);
    if !found.iter().any(|g| overlaps(&g.0)) {
        found.push(f);
    }
}

/// Latin letters (English and its accented neighbours).
fn latin(c: char) -> bool {
    c.is_ascii_alphabetic() || ('\u{00C0}'..='\u{024F}').contains(&c)
}

/// The paragraph with everything that isn't English blanked out with spaces (byte for byte, so
/// positions stay), or "" when it is mostly Russian or Armenian. Harper reads only English.
fn english_text(text: &str, runs: &[ProofRun]) -> String {
    let english = |off: usize| {
        let k = runs.partition_point(|r| r.range.end <= off);
        runs.get(k).filter(|r| r.range.start <= off).is_none_or(|r| r.lang == ProofLang::En && !r.skip)
    };
    let letters = text.chars().filter(|c| c.is_alphabetic());
    let (l, o) = letters.fold((0, 0), |(l, o), c| if latin(c) { (l + 1, o) } else { (l, o + 1) });
    if l == 0 || o > l {
        return String::new();
    }
    let mut out = String::with_capacity(text.len());
    for (i, c) in text.char_indices() {
        if english(i) && (!c.is_alphabetic() || latin(c)) {
            out.push(c);
        } else {
            out.extend(std::iter::repeat_n(' ', c.len_utf8()));
        }
    }
    out
}

/// Harper's issues for each text, as (byte range, kind, message, suggestions). Runs on its own
/// thread, which keeps Harper's dictionary loaded.
fn harper_lints(texts: Vec<String>) -> Vec<Vec<Found>> {
    let (reply, answer) = channel();
    if harper().lock().map(|h| h.send((texts, reply))).is_err() {
        return Vec::new();
    }
    answer.recv().unwrap_or_default()
}

type HarperJob = (Vec<String>, Sender<Vec<Vec<Found>>>);

fn harper() -> &'static Mutex<Sender<HarperJob>> {
    static H: OnceLock<Mutex<Sender<HarperJob>>> = OnceLock::new();
    H.get_or_init(|| {
        let (tx, rx) = channel::<HarperJob>();
        std::thread::Builder::new()
            .name("harper".into())
            .spawn(move || {
                let mut linter = LintGroup::new_curated(FstDictionary::curated(), dialect());
                for (texts, reply) in rx {
                    let all = texts.iter().map(|t| if t.trim().is_empty() { Vec::new() } else { lint(&mut linter, t) }).collect();
                    let _ = reply.send(all);
                }
            })
            .expect("harper thread");
        Mutex::new(tx)
    })
}

/// Load Harper's dictionary in the background, so the first Proofread is quick.
pub fn warm_up() {
    std::thread::spawn(|| {
        let _ = harper_lints(vec!["Lithora is ready.".into()]);
    });
}

/// The system's English: British, Australian, Canadian or Indian spelling, else American.
fn dialect() -> Dialect {
    match sys_locale::get_locale().unwrap_or_default().replace('_', "-").as_str() {
        "en-GB" | "en-IE" | "en-NZ" | "en-ZA" => Dialect::British,
        "en-AU" => Dialect::Australian,
        "en-CA" => Dialect::Canadian,
        "en-IN" => Dialect::Indian,
        _ => Dialect::American,
    }
}

fn lint(linter: &mut LintGroup, text: &str) -> Vec<Found> {
    use harper_core::linting::LintKind;
    let doc = Document::new_curated(text, &PlainEnglish);
    // Harper counts characters; the document counts bytes.
    let bytes: Vec<usize> = text.char_indices().map(|(i, _)| i).chain(std::iter::once(text.len())).collect();
    let mut out = Vec::new();
    for l in linter.lint(&doc) {
        let (Some(&a), Some(&b)) = (bytes.get(l.span.start), bytes.get(l.span.end)) else { continue };
        if a >= b {
            continue;
        }
        let covered = &text[a..b];
        let suggestions: Vec<String> = l
            .suggestions
            .iter()
            .map(|s| match s {
                Suggestion::ReplaceWith(c) => c.iter().collect(),
                Suggestion::InsertAfter(c) => format!("{covered}{}", c.iter().collect::<String>()),
                Suggestion::Remove => String::new(),
            })
            .collect();
        // Which words are misspelled comes from Lithora's own dictionaries (with the words you
        // added); Harper's ideas for them only rank the suggestions.
        let kind = match l.lint_kind {
            LintKind::Spelling => SPELLING_IDEAS,
            LintKind::Style | LintKind::Readability | LintKind::Enhancement | LintKind::Redundancy | LintKind::WordChoice | LintKind::Regionalism => "style",
            _ => "grammar",
        };
        out.push((a..b, kind, plain(&l.message), suggestions));
    }
    out
}

/// Harper's messages use Markdown backticks for words; the panel shows quotes.
fn plain(message: &str) -> String {
    let mut out = String::with_capacity(message.len());
    let mut open = true;
    for c in message.chars() {
        if c == '`' {
            out.push(if open { '“' } else { '”' });
            open = !open;
        } else {
            out.push(c);
        }
    }
    out
}

/// Checks for any language: a word twice in a row, two spaces between words, a space before a
/// comma or full stop, a missing space after a comma, and the Armenian full stop. In English
/// paragraphs Harper checks these, so there only Russian and Armenian words get them.
fn basic_issues(text: &str, runs: &[ProofRun], english_para: bool) -> Vec<Found> {
    let skip = |a: usize, b: usize| runs.iter().any(|r| r.skip && r.range.start < b && a < r.range.end);
    let armenian = |c: char| ('\u{0531}'..='\u{0587}').contains(&c);
    let cyrillic = |c: char| ('\u{0400}'..='\u{04FF}').contains(&c);
    // The message in the language of the nearest letter.
    let msg = |en: &str, ru: &str, hy: &str, at: usize| -> String {
        let near = text[at..].chars().find(|c| c.is_alphabetic()).or_else(|| text[..at].chars().rev().find(|c| c.is_alphabetic()));
        match near {
            Some(c) if armenian(c) => hy.into(),
            Some(c) if cyrillic(c) => ru.into(),
            _ => en.into(),
        }
    };
    let mut out: Vec<Found> = Vec::new();
    // A word twice in a row.
    let words = wordcraft_engine::proof::words(text);
    for w in words.windows(2) {
        let (a, b) = (&text[w[0].0..w[0].1], &text[w[1].0..w[1].1]);
        let between = &text[w[0].1..w[1].0];
        if a.chars().any(char::is_alphabetic)
            && a.to_lowercase() == b.to_lowercase()
            && !between.is_empty()
            && between.chars().all(|c| c == ' ')
            && !skip(w[0].0, w[1].1)
        {
            out.push((w[0].0..w[1].1, "grammar", msg("This word is repeated.", "Слово повторяется.", "Բառը կրկնվում է։", w[0].0), vec![a.to_string()]));
        }
    }
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let at = |i: usize| chars.get(i).map(|c| c.1);
    let mut i = 0;
    while i < chars.len() {
        let (off, c) = chars[i];
        // Two or more spaces between words.
        if c == ' ' && at(i + 1) == Some(' ') && i > 0 && at(i - 1).is_some_and(|p| !p.is_whitespace()) {
            let mut j = i;
            while at(j) == Some(' ') {
                j += 1;
            }
            if j < chars.len() && !skip(off, chars[j].0) {
                out.push((off..chars[j].0, "style", msg("Extra spaces between words.", "Лишние пробелы между словами.", "Ավելորդ բացատներ բառերի միջև։", off), vec![" ".into()]));
            }
            i = j;
            continue;
        }
        // A space before , . ; ! ? and Armenian ։ ՝ ՜ ՞.
        if c == ' '
            && i > 0
            && at(i - 1).is_some_and(char::is_alphanumeric)
            && let Some(p) = at(i + 1).filter(|p| matches!(p, ',' | '.' | ';' | '!' | '?' | '։' | '՝' | '՜' | '՞'))
            && at(i + 2).is_none_or(char::is_whitespace)
            && !skip(off, off + 1 + p.len_utf8())
        {
            let (prev_off, prev) = chars[i - 1];
            out.push((
                prev_off..off + 1 + p.len_utf8(),
                "grammar",
                msg("No space before punctuation.", "Перед знаком препинания пробел не нужен.", "Կետադրական նշանից առաջ բացատ պետք չէ։", off),
                vec![format!("{prev}{p}")],
            ));
        }
        // A comma right before a letter: "one,two".
        if c == ','
            && i > 0
            && at(i - 1).is_some_and(char::is_alphabetic)
            && let Some(next) = at(i + 1).filter(|n| n.is_alphabetic())
            && !skip(off, off + 1)
        {
            out.push((
                off..off + 1 + next.len_utf8(),
                "grammar",
                msg("Add a space after the comma.", "После запятой нужен пробел.", "Ստորակետից հետո բացատ է պետք։", off),
                vec![format!(", {next}")],
            ));
        }
        // Armenian ends a sentence with ։, not a colon or a Latin full stop.
        if matches!(c, ':' | '.') && i > 0 && at(i - 1).is_some_and(armenian) {
            let end_of_sentence = match at(i + 1) {
                None => true,
                Some(n) if n.is_whitespace() => chars[i + 1..].iter().find(|c| !c.1.is_whitespace()).is_none_or(|c| ('\u{0531}'..='\u{0556}').contains(&c.1)),
                _ => false,
            };
            if end_of_sentence && !skip(off, off + 1) {
                out.push((off..off + 1, "grammar", "Հայերենում նախադասությունն ավարտվում է վերջակետով (։)։".into(), vec!["։".into()]));
            }
        }
        i += 1;
    }
    if english_para {
        out.retain(|f| text[f.0.clone()].chars().any(|c| armenian(c) || cyrillic(c)));
    }
    out
}

/// Whether a misspelling can be fixed without asking: the suggestion is at most two letters away,
/// and a capitalised word starts a sentence (one in mid-sentence is likely a name).
fn safe_fix(text: &str, r: Range<usize>, suggestion: &str) -> bool {
    let word = &text[r.clone()];
    let capital = word.chars().next().is_some_and(char::is_uppercase);
    let before = text[..r.start].trim_end();
    let starts_sentence = before.is_empty() || before.ends_with(['.', '!', '?', '։', '…', ':']);
    if capital && !starts_sentence {
        return false;
    }
    distance(&word.to_lowercase(), &suggestion.to_lowercase()) <= 2
}

/// Edits (insert, delete, change, swap two neighbours) from `a` to `b`.
fn distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=b.len() {
        d[0][j] = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[a.len()][b.len()]
}

/// The sentence (or up to about 90 bytes) around `r`, and where `r` is in it.
fn context(text: &str, r: Range<usize>) -> (String, [usize; 2]) {
    let mut a = r.start.saturating_sub(45);
    while !text.is_char_boundary(a) {
        a -= 1;
    }
    let mut b = (r.end + 45).min(text.len());
    while !text.is_char_boundary(b) {
        b += 1;
    }
    // Start and end on a word boundary.
    if a > 0
        && let Some(sp) = text[a..r.start].find(' ')
    {
        a += sp + 1;
    }
    if b < text.len()
        && let Some(sp) = text[r.end..b].rfind(' ')
    {
        b = r.end + sp;
    }
    let lead = if a > 0 { "…" } else { "" };
    let tail = if b < text.len() { "…" } else { "" };
    let s = format!("{lead}{}{tail}", &text[a..b]);
    let start = r.start - a + lead.len();
    let utf16 = |bytes: usize| s[..bytes].encode_utf16().count();
    let at = [utf16(start), utf16(start + (r.end - r.start))];
    (s.replace('\t', " "), at)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(body: &str) -> Session {
        let dir = std::env::temp_dir().join(format!("lithora-proof-{}-{}", std::process::id(), body.len()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("p.txt");
        std::fs::write(&path, body).unwrap();
        let (doc, _) = wordcraft_engine::io::open_path_in(&path, None, &wordcraft_engine::Region::default()).unwrap();
        Session::new(doc)
    }

    fn text(s: &Session) -> String {
        let bytes = wordcraft_engine::io::save_bytes("out.txt", &s.doc).unwrap();
        String::from_utf8_lossy(&bytes).trim().to_string()
    }

    #[test]
    fn finds_spelling_grammar_and_style() {
        let mut s = session("This is an test. I could of done it better tomorow.\nThe the cat sat  on the mat.");
        let issues = proofread(&mut s);
        let has = |t: &str, kind: &str| issues.iter().any(|i| i.text == t && i.kind == kind);
        assert!(has("tomorow", "spelling"), "{issues:#?}");
        assert!(has("an", "grammar"), "{issues:#?}");
        assert!(issues.iter().any(|i| i.text.contains("could of") && i.suggestions.iter().any(|s| s == "could have")), "{issues:#?}");
        assert!(issues.iter().any(|i| i.text.eq_ignore_ascii_case("the the")), "{issues:#?}");
        for i in &issues {
            let units: Vec<u16> = i.context.encode_utf16().collect();
            assert_eq!(String::from_utf16_lossy(&units[i.at[0]..i.at[1]]), i.text);
        }
        assert!(issues.iter().any(|i| i.text == "tomorow" && i.auto_fix));
    }

    #[test]
    fn checks_russian_and_armenian_text() {
        let mut s = session("Привет привет ,мир.\nԲարեւ բարեւ աշխարհ: Ինչպես ես։");
        let issues = proofread(&mut s);
        assert!(issues.iter().any(|i| i.message == "Слово повторяется."), "{issues:#?}");
        assert!(issues.iter().any(|i| i.message == "Բառը կրկնվում է։"), "{issues:#?}");
        assert!(issues.iter().any(|i| i.text == ":" && i.suggestions == ["։"]), "{issues:#?}");
    }

    #[test]
    fn names_in_mid_sentence_are_not_fixed_automatically() {
        let mut s = session("We met Lithora tomorow.");
        let issues = proofread(&mut s);
        assert!(issues.iter().any(|i| i.text == "tomorow" && i.auto_fix), "{issues:#?}");
        assert!(!issues.iter().any(|i| i.text == "Lithora" && i.auto_fix), "{issues:#?}");
        assert_eq!(distance("teh", "the"), 1);
        assert_eq!(distance("misteak", "mistake"), 2);
    }

    #[test]
    fn fixes_all_misspellings_as_one_undo_step() {
        let mut s = session("I wnat to go tomorow.\nTheir is a speling misteak here.");
        let fixes: Vec<Fix> = proofread(&mut s)
            .into_iter()
            .filter(|i| i.kind == "spelling" && !i.suggestions.is_empty())
            .map(|i| Fix { start: i.start, end: i.end, text: i.text, replacement: i.suggestions[0].clone() })
            .collect();
        assert!(fixes.len() >= 3);
        let n = apply(&mut s, fixes).unwrap();
        assert!(n >= 3);
        let fixed = text(&s);
        assert!(fixed.contains("want to go tomorrow") && fixed.contains("spelling"), "{fixed}");
        s.run("edit.undo", &json!({})).unwrap();
        assert_eq!(text(&s).replace("\r\n", "\n"), "I wnat to go tomorow.\nTheir is a speling misteak here.");
    }

    #[test]
    fn a_fix_for_changed_text_is_skipped() {
        let mut s = session("A tomorow");
        let i = proofread(&mut s).into_iter().find(|i| i.kind == "spelling").unwrap();
        let n = apply(&mut s, vec![Fix { start: i.start, end: i.end, text: "something else".into(), replacement: "x".into() }]).unwrap();
        assert_eq!(n, 0);
        assert_eq!(text(&s), "A tomorow");
    }
}
