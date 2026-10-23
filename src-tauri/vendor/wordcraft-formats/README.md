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
- Saving as RTF keeps the page looking the same (0.5.1): each paragraph's spacing, line
  spacing and indents (its style's included); each run's size, font, bold, italic and colour
  from its paragraph style; the document's default text size (`\defchp`); the paragraph
  mark's size, which sets an empty line's height (read too); the table's position (`\trleft`,
  read too); the page's vertical alignment (`\vertalc`…, read too); and each section's
  headers and footers. A table style's "header row" look no longer makes RTF and ODT copies
  repeat and bold the first row on every page.
