# wordcraft-formats (Lithora copy)

This is WordCraft's import/export crate from https://github.com/storytold/wordcraft at commit
117aea31a8e61bd3e306e9210800cdc42897e3c1, used in place of the upstream crate through
`[patch]` in `src-tauri/Cargo.toml`. It is licensed MIT OR Apache-2.0, the same as WordCraft
(see `third-party/wordcraft/` for the license texts and copyright).

Lithora's changes:

- RTF tables keep each row's height (`\trrh`: at least, or exact when negative) and the
  "don't break this row across pages" setting (`\trkeep`), when opening and when saving.
  Before, every row was as tall as its text, so forms with tall answer rows came out shorter
  than in Word and rows split across pages in the wrong places.
