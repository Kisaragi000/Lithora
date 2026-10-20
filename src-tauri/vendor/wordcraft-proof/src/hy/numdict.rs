//! A Hunspell dictionary with numeric flags (`FLAG num`), as HySpell's Armenian one uses: more
//! affix classes than [`crate::affix::AffixDict`]'s character flags can hold. Supports what that
//! dictionary needs: prefixes and suffixes with strip, add and a condition, prefix + suffix
//! combinations (cross product), `TRY` and `REP` for suggestions.

use std::collections::{HashMap, HashSet};

/// One character position of an affix condition: a set of characters, or any but a set.
#[derive(Debug, Clone)]
enum CondChar {
    Any,
    In(Vec<char>),
    NotIn(Vec<char>),
}

impl CondChar {
    fn matches(&self, c: char) -> bool {
        match self {
            CondChar::Any => true,
            CondChar::In(v) => v.contains(&c),
            CondChar::NotIn(v) => !v.contains(&c),
        }
    }
}

fn parse_condition(s: &str) -> Vec<CondChar> {
    if s == "." {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '.' => out.push(CondChar::Any),
            '[' => {
                let neg = chars.peek() == Some(&'^');
                if neg {
                    chars.next();
                }
                let mut set = Vec::new();
                for c in chars.by_ref() {
                    if c == ']' {
                        break;
                    }
                    set.push(c);
                }
                out.push(if neg { CondChar::NotIn(set) } else { CondChar::In(set) });
            }
            c => out.push(CondChar::In(vec![c])),
        }
    }
    out
}

#[derive(Debug, Clone)]
struct Affix {
    flag: u16,
    cross: bool,
    strip: String,
    add: String,
    cond: Vec<CondChar>,
}

impl Affix {
    /// Does a suffix's condition hold at the end of `stem`?
    fn ends(&self, stem: &str) -> bool {
        let chars: Vec<char> = stem.chars().collect();
        if chars.len() < self.cond.len() {
            return false;
        }
        let tail = &chars[chars.len() - self.cond.len()..];
        self.cond.iter().zip(tail).all(|(c, &ch)| c.matches(ch))
    }
    /// Does a prefix's condition hold at the start of `stem`?
    fn starts(&self, stem: &str) -> bool {
        let chars: Vec<char> = stem.chars().take(self.cond.len()).collect();
        chars.len() == self.cond.len() && self.cond.iter().zip(&chars).all(|(c, &ch)| c.matches(ch))
    }
}

/// The dictionary: stems with their affix classes, and the affix rules.
#[derive(Default)]
pub struct NumDict {
    stems: HashMap<String, Box<[u16]>>,
    prefixes: Vec<Affix>,
    suffixes: Vec<Affix>,
    try_chars: Vec<char>,
    rep: Vec<(String, String)>,
}

impl NumDict {
    pub fn is_empty(&self) -> bool {
        self.stems.is_empty()
    }

    pub fn len(&self) -> usize {
        self.stems.len()
    }

    /// Read a dictionary from its `.aff` and `.dic` text (UTF-8).
    pub fn parse(aff: &str, dic: &str) -> Result<NumDict, String> {
        let aff = aff.strip_prefix('\u{feff}').unwrap_or(aff);
        let dic = dic.strip_prefix('\u{feff}').unwrap_or(dic);
        let mut d = NumDict::default();
        let mut cross: HashMap<(bool, u16), bool> = HashMap::new();
        for line in aff.lines() {
            let line = line.trim_start_matches('\u{feff}');
            let f: Vec<&str> = line.split_whitespace().collect();
            match f.first().copied() {
                Some("TRY") if f.len() > 1 => d.try_chars = f[1].chars().collect(),
                Some("REP") if f.len() > 2 => d.rep.push((f[1].replace('_', " "), f[2].replace('_', " "))),
                Some(kind @ ("PFX" | "SFX")) if f.len() >= 4 => {
                    let prefix = kind == "PFX";
                    let Ok(flag) = f[1].parse::<u16>() else { continue };
                    if (f[2] == "Y" || f[2] == "N") && f[3].parse::<usize>().is_ok() && f.len() == 4 {
                        cross.insert((prefix, flag), f[2] == "Y");
                        continue;
                    }
                    if f.len() < 4 {
                        continue;
                    }
                    let strip = if f[2] == "0" { String::new() } else { f[2].to_string() };
                    // An affix's own continuation classes (`/n`) aren't used by this dictionary.
                    let add = f[3].split('/').next().unwrap_or("");
                    let add = if add == "0" { String::new() } else { add.to_string() };
                    let cond = parse_condition(f.get(4).copied().unwrap_or("."));
                    let a = Affix { flag, cross: *cross.get(&(prefix, flag)).unwrap_or(&false), strip, add, cond };
                    if prefix {
                        d.prefixes.push(a);
                    } else {
                        d.suffixes.push(a);
                    }
                }
                _ => {}
            }
        }
        if d.prefixes.is_empty() && d.suffixes.is_empty() {
            return Err("no affix rules".into());
        }
        d.stems.reserve(200_000);
        for (n, line) in dic.lines().enumerate() {
            let Some(tok) = line.split_whitespace().next() else { continue };
            if n == 0 && tok.parse::<usize>().is_ok() {
                continue;
            }
            let (word, flags) = tok.split_once('/').unwrap_or((tok, ""));
            if word.is_empty() {
                continue;
            }
            let mut fl: Vec<u16> = flags.split(',').filter_map(|x| x.trim().parse().ok()).collect();
            fl.sort_unstable();
            fl.dedup();
            match d.stems.get_mut(word) {
                // A homonym: the same stem twice takes both lists.
                Some(old) => {
                    let mut all: Vec<u16> = old.iter().copied().chain(fl).collect();
                    all.sort_unstable();
                    all.dedup();
                    *old = all.into_boxed_slice();
                }
                None => {
                    d.stems.insert(word.to_string(), fl.into_boxed_slice());
                }
            }
        }
        Ok(d)
    }

    fn has(&self, stem: &str, flag: u16) -> bool {
        self.stems.get(stem).is_some_and(|f| f.binary_search(&flag).is_ok())
    }

    /// `word` with a suffix of class `need` (or any class when `None`) taken off is a stem.
    fn suffixed(&self, word: &str, prefix_flag: Option<u16>) -> bool {
        self.suffixes.iter().any(|s| {
            if prefix_flag.is_some() && !s.cross {
                return false;
            }
            let Some(base) = word.strip_suffix(s.add.as_str()) else { return false };
            if base.is_empty() && s.strip.is_empty() {
                return false;
            }
            let stem = format!("{base}{}", s.strip);
            s.ends(&stem) && self.has(&stem, s.flag) && prefix_flag.is_none_or(|p| self.has(&stem, p))
        })
    }

    /// Is `word` (as written) in the dictionary, directly or through its affixes?
    fn known_exact(&self, word: &str) -> bool {
        if self.stems.contains_key(word) || self.suffixed(word, None) {
            return true;
        }
        self.prefixes.iter().any(|p| {
            let Some(rest) = word.strip_prefix(p.add.as_str()) else { return false };
            if rest.is_empty() {
                return false;
            }
            let stem = format!("{}{rest}", p.strip);
            (p.starts(&stem) && self.has(&stem, p.flag)) || (p.cross && self.suffixed(&stem, Some(p.flag)))
        })
    }

    /// Is `word` spelled correctly? A capitalized word may be a common word at a sentence start,
    /// and a word in capitals may be either.
    pub fn check(&self, word: &str) -> bool {
        if self.known_exact(word) {
            return true;
        }
        let lower = word.to_lowercase();
        if lower != word && self.known_exact(&lower) {
            return true;
        }
        let mut cs = lower.chars();
        let cap: String = cs.next().map(|c| c.to_uppercase().chain(cs).collect()).unwrap_or_default();
        cap != word && self.known_exact(&cap)
    }

    /// Spelling suggestions, best first: REP replacements, then one edit away (swap, drop, add
    /// or change a letter, split in two).
    pub fn suggest(&self, word: &str, max: usize) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let first_upper = word.chars().next().is_some_and(char::is_uppercase);
        let base = word.to_lowercase();
        let mut offer = |cand: String, out: &mut Vec<String>| {
            if out.len() < max && cand != base && seen.insert(cand.clone()) {
                let ok = if let Some((a, b)) = cand.split_once(' ') { self.check(a) && self.check(b) } else { self.check(&cand) };
                if ok {
                    out.push(cand);
                }
            }
        };
        for (from, to) in &self.rep {
            let mut start = 0;
            while let Some(i) = base[start..].find(from.as_str()) {
                let at = start + i;
                offer(format!("{}{}{}", &base[..at], to, &base[at + from.len()..]), &mut out);
                start = at + from.len().max(1);
                if start >= base.len() {
                    break;
                }
            }
        }
        let chars: Vec<char> = base.chars().collect();
        let n = chars.len();
        let s = |v: &[char]| v.iter().collect::<String>();
        for i in 0..n.saturating_sub(1) {
            let mut v = chars.clone();
            v.swap(i, i + 1);
            offer(s(&v), &mut out);
        }
        for i in 0..n {
            let mut v = chars.clone();
            v.remove(i);
            offer(s(&v), &mut out);
        }
        for i in 0..n {
            for &c in &self.try_chars {
                if c.is_uppercase() || c == chars[i] {
                    continue;
                }
                let mut v = chars.clone();
                v[i] = c;
                offer(s(&v), &mut out);
            }
        }
        for i in 0..=n {
            for &c in &self.try_chars {
                if c.is_uppercase() {
                    continue;
                }
                let mut v = chars.clone();
                v.insert(i, c);
                offer(s(&v), &mut out);
            }
        }
        for i in 2..n.saturating_sub(1) {
            offer(format!("{} {}", s(&chars[..i]), s(&chars[i..])), &mut out);
        }
        if first_upper {
            for w in &mut out {
                let mut cs = w.chars();
                *w = cs.next().map(|c| c.to_uppercase().chain(cs).collect()).unwrap_or_default();
            }
        }
        out
    }
}
