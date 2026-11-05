# Third-party notices

Lithora includes the following third-party software. Each keeps its own license.

## WordCraft

Lithora's document engine is built on the Rust crates of WordCraft
(https://github.com/storytold/wordcraft).
Lithora ships modified copies of its `wordcraft-formats`, `wordcraft-proof` and `wordcraft-layout` crates in
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
offline. The English Thesaurus (Review › Thesaurus) uses Harper's word list, `harper-thesaurus`,
under the same license (its synonym list is based on the public-domain Moby Thesaurus).

## Armenian spelling dictionary (HySpell)

`src-tauri/dictionaries/hy_AM.aff` and `hy_AM.dic` are the Reformed-orthography Hunspell
dictionary of HySpell 3.0.1 (https://github.com/hyspell/HySpell_3.0.1, files `hy-r.aff` and
`hy-r.dic`, renamed; modified by Lithora, which added the word "տեքստ"). Copyright (c) 2017 hyspell.com, author Haro Mherian. MIT License; the full
notice is in [src-tauri/dictionaries/LICENSE-hy_AM.txt](src-tauri/dictionaries/LICENSE-hy_AM.txt).

## Russian spelling dictionary

`src-tauri/dictionaries/ru_RU.aff` and `ru_RU.dic` come from the LibreOffice dictionaries
(https://github.com/LibreOffice/dictionaries, `ru_RU`). Copyright (c) 1997-2008 Alexander I.
Lebedev, with changes by Laszlo Nemeth. Lithora ships the files unmodified. BSD-style license;
the full notice is in
[src-tauri/dictionaries/LICENSE-ru_RU.txt](src-tauri/dictionaries/LICENSE-ru_RU.txt).

## Interface fonts

The menus use Plus Jakarta Sans (Copyright 2020 The Plus Jakarta Sans Project Authors), Sora
(Copyright 2019 The Sora Project Authors) and Noto Sans Armenian (Copyright 2022 The Noto Project Authors),
under the SIL Open Font License 1.1. They ship inside Lithora through the Fontsource npm
packages (`@fontsource/plus-jakarta-sans`, `@fontsource/sora`, `@fontsource/noto-sans-armenian`),
whose LICENSE files hold the full license text.

## PDF editing

PDF files are read and written with lopdf (MIT) and drawn with hayro (Apache-2.0 OR MIT, by
Laurenz Stampfl). The character tables in `src-tauri/src/pdf/tables.rs` were generated from
hayro-font's tables (Apache-2.0 OR MIT), which come from Apache PDFBox (Apache-2.0), the Adobe
Glyph List (BSD-3-Clause) and Adobe's font metrics for the 14 standard PDF fonts (Copyright
1985-1997 Adobe Systems Incorporated; "may be used, copied, and distributed for any purpose and
without charge, with or without modification, provided that all copyright notices are
retained").

## Rust and JavaScript libraries

Lithora is also built from about 670 Rust crates (including Tauri and the krilla PDF library)
and a few npm packages (including React, Tauri's JavaScript API and the Lucide icons). Their
names, versions, licenses and full license texts are listed in
[third-party/DEPENDENCY-LICENSES.txt](third-party/DEPENDENCY-LICENSES.txt), which ships inside
every installer. Run `python3 scripts/collect_licenses.py` to refresh it; the release workflow
does this before each build.

Most are under MIT, Apache-2.0, BSD, ISC, Zlib or Unicode licenses. A few crates
(`cssparser`, `cssparser-macros`, `selectors`, `dtoa-short`, `option-ext`, `colored`) are under the
Mozilla Public License 2.0. Lithora uses them unmodified, and their source code is available
from crates.io (https://crates.io) under the same names and versions. The `webpki-roots` and
`webpki-root-certs` crates carry data under the Community Data License Agreement Permissive 2.0.

## Trademarks

Microsoft, Word and Windows are trademarks of the Microsoft group of companies. Lithora is an
independent project and is not affiliated with, sponsored by or endorsed by Microsoft. Other
product names mentioned are the property of their owners and are used only to describe the
file formats Lithora works with.
