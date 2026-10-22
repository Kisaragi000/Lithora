# Third-party notices

Lithora includes the following third-party software. Each keeps its own license.

## WordCraft

Lithora's document engine is built on the Rust crates of WordCraft
(https://github.com/storytold/wordcraft).
Lithora ships modified copies of its `wordcraft-formats` and `wordcraft-proof` crates in
`src-tauri/vendor/` (changes listed in each crate's README).

Copyright (c) 2026 ArtCraft Team and the WordCraft contributors.
Licensed under the MIT License or the Apache License, Version 2.0, at your option. See
[third-party/wordcraft/LICENSE-MIT](third-party/wordcraft/LICENSE-MIT) and
[third-party/wordcraft/LICENSE-APACHE](third-party/wordcraft/LICENSE-APACHE).

WordCraft bundles fonts (Source Sans 3, Source Serif 4, Inter, JetBrains Mono, under the SIL Open
Font License 1.1) and hyphenation and spelling data under their own licenses. These are listed
in [third-party/wordcraft/NOTICE](third-party/wordcraft/NOTICE) and
[third-party/wordcraft/ATTRIBUTION.md](third-party/wordcraft/ATTRIBUTION.md), with the font
licenses in `third-party/wordcraft/OFL-*.txt`.

The WordCraft and ArtCraft names and logos are trademarks of the ArtCraft Team and are not used
by Lithora.

## craft-print

Printing uses the `craft-print` crate of craft-libs (https://github.com/storytold/craft-libs),
Copyright (c) 2026 ArtCraft Team and the craft-libs contributors. Licensed under the MIT License
or the Apache License, Version 2.0, at your option. See
[third-party/craft-libs/](third-party/craft-libs/) for the license texts and notice.

## Harper

Proofread checks English grammar and style with `harper-core`, the engine of Harper
(https://github.com/Automattic/harper), Copyright (c) Automattic and the Harper contributors.
Licensed under the Apache License, Version 2.0; see
[third-party/harper/LICENSE-APACHE](third-party/harper/LICENSE-APACHE). It runs inside Lithora,
offline.

## Armenian spelling dictionary (HySpell)

`src-tauri/dictionaries/hy_AM.aff` and `hy_AM.dic` are the Reformed-orthography Hunspell
dictionary of HySpell 3.0.1 (https://github.com/hyspell/HySpell_3.0.1, files `hy-r.aff` and
`hy-r.dic`, renamed; Lithora added the word "տեքստ", which it lacked). Copyright (c) 2017 hyspell.com, author Haro Mherian. MIT License; the full
notice is in [src-tauri/dictionaries/LICENSE-hy_AM.txt](src-tauri/dictionaries/LICENSE-hy_AM.txt).

## Russian spelling dictionary

`src-tauri/dictionaries/ru_RU.aff` and `ru_RU.dic` come from the LibreOffice dictionaries
(https://github.com/LibreOffice/dictionaries, `ru_RU`). Copyright (c) 1997-2008 Alexander I.
Lebedev, with changes by Laszlo Nemeth. BSD-style license; the full notice is in
[src-tauri/dictionaries/LICENSE-ru_RU.txt](src-tauri/dictionaries/LICENSE-ru_RU.txt).

## Interface fonts

The menus use Plus Jakarta Sans (Copyright 2020 The Plus Jakarta Sans Project Authors), Sora
(Copyright 2019 The Sora Project Authors) and Noto Sans Armenian (Copyright 2022 The Noto Project Authors),
under the SIL Open Font License 1.1. They ship inside Lithora through the Fontsource npm
packages (`@fontsource/plus-jakarta-sans`, `@fontsource/sora`, `@fontsource/noto-sans-armenian`),
whose LICENSE files hold the full license text.

## Rust and JavaScript libraries

Lithora's other dependencies (Tauri, React and the crates and npm packages listed in
`src-tauri/Cargo.lock` and `package-lock.json`) are under permissive licenses such as MIT,
Apache-2.0 and BSD.
