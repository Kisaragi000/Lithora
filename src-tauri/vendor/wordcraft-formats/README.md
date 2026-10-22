# wordcraft-formats (Lithora copy)

This is WordCraft's import/export crate from https://github.com/storytold/wordcraft at commit
00bc6a4b028013b2dfb0e85e8b326aeed3ecff6d, used in place of the upstream crate through
`[patch]` in `src-tauri/Cargo.toml`. It is licensed MIT OR Apache-2.0, the same as WordCraft
(see `third-party/wordcraft/` for the license texts and copyright).

Lithora's changes:

- RTF tables keep each row's height (`\trrh`: at least, or exact when negative) and the
  "don't break this row across pages" setting (`\trkeep`), when opening and when saving.
  Before, every row was as tall as its text, so forms with tall answer rows came out shorter
  than in Word and rows split across pages in the wrong places.
- ODT and HTML files name Lithora, not WordCraft, as the program that wrote them.
