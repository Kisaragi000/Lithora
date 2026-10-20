# wordcraft-proof (Lithora copy)

This is WordCraft's proofing crate from https://github.com/storytold/wordcraft at commit
117aea31a8e61bd3e306e9210800cdc42897e3c1, used in place of the upstream crate through
`[patch]` in `src-tauri/Cargo.toml`. It is licensed MIT OR Apache-2.0, the same as WordCraft
(see `third-party/wordcraft/` for the license texts and copyright). The word lists and
hyphenation patterns under `assets/` come from the same commit.

Lithora's changes:

- Armenian (`hy`, `hy-AM`) is a proofing language (`src/hy`): spelling and suggestions from a
  Hunspell `hy_AM` dictionary. Lithora ships HySpell's dictionary (MIT) in `src-tauri/dictionaries`.
- Armenian in-word marks (՚ ՛ ՜ ՞) no longer split a word in two.
- A word in another script than its run's language is checked in that script's language
  (`by_script` in `src/lib.rs`): Cyrillic words in English text are Russian, Armenian ones
  Armenian, the way Word picks the language from the keyboard.
- The asset paths use `CARGO_MANIFEST_DIR`, so the crate builds outside WordCraft's workspace.
