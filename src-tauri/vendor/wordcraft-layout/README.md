# wordcraft-layout (Lithora copy)

This is WordCraft's layout crate from https://github.com/storytold/wordcraft at commit
00bc6a4b028013b2dfb0e85e8b326aeed3ecff6d, used in place of the upstream crate through
`[patch]` in `src-tauri/Cargo.toml`. It is licensed MIT OR Apache-2.0, the same as WordCraft
(see `third-party/wordcraft/` for the license texts and copyright).

Lithora's changes:

- A word that starts with a full stop, comma, colon or semicolon after a space (".docx")
  can wrap to the next line whole, as in Word. Before, Unicode's rules joined it to the word
  before it, and in a narrow table cell the pair split mid-letter (".d" / "ocx").
