<p align="center">
  <img src="public/Lithora-logo.svg" alt="Lithora logo" width="96">
</p>

<h1 align="center">Lithora</h1>

<p align="center">
  A free, open source word processor for the desktop, built for multilingual documents.<br>
  Open, edit and save Word (.docx) and RTF files in English, Russian, Armenian and more.
</p>

> **Status: early development.** Lithora is not ready for everyday work yet. Expect missing
> features and rough edges.

## Features today

- Opens .docx, .rtf, .doc (Word 97-2003), .odt and Word XML files.
- Saves .docx and .rtf. RTF output escapes Unicode correctly, so Armenian and Cyrillic text
  survives the round trip.
- Word-style ribbon, multiple documents in tabs, find and replace, outline, ruler.
- Interface in English, Russian (Русский) and Armenian (Հայերեն).
- Offline proofreading rules for English, Russian and Armenian.
- Missing-font detection with Google Fonts substitutes.

## Roadmap

Lithora keeps its React interface and runs as a native desktop app with
[Tauri](https://tauri.app). File handling, PDF export and spellchecking will move to Rust,
reusing parts of [WordCraft](https://github.com/storytold/wordcraft) (MIT OR Apache-2.0)
for higher fidelity with Word documents.

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer. For the desktop app you also need
[Rust](https://rustup.rs) and the
[Tauri system prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```sh
git clone https://github.com/Kisaragi000/Lithora.git
cd Lithora
npm install

npm run tauri dev     # run the desktop app
npm run tauri build   # build installers for your platform (output in src-tauri/target/release/bundle)

npm run dev           # or run in a browser at http://localhost:3000
npm run lint          # typecheck
```

## Project layout

| Path | What it holds |
|---|---|
| `src/` | The React app: components, file format services, translations |
| `src/services/` | Parsers and writers for .docx, .rtf, .doc, .odt and Word XML |
| `src/i18n/` | Interface translations |
| `src-tauri/` | The Tauri desktop shell (Rust) |
| `public/` | Logo and static assets |

## License

Lithora is licensed under either of

- MIT license ([LICENSE-MIT](LICENSE-MIT))
- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))

at your option.

Unless you explicitly state otherwise, any contribution you submit for inclusion in Lithora
shall be dual licensed as above, without any additional terms or conditions.
