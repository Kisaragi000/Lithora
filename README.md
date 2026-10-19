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

## Install

Download the installer from the [Releases](https://github.com/Kisaragi000/Lithora/releases) page:

- **Windows 10/11:** `Lithora_<version>_x64-setup.exe`. It installs for your user only, so it
  does not need administrator rights. Windows SmartScreen may warn that the publisher is
  unknown, because the installer is not code-signed yet; choose *More info*, then *Run anyway*.
- **Linux:** the `.deb` (Ubuntu, Debian, Mint), the `.rpm` (Fedora, openSUSE) or the
  `.AppImage` (any distribution; make it executable and run it).

Lithora is self-contained: nothing else needs to be installed. In the app, press
**Ctrl+Shift+E** to switch to the new document view, where Lithora's own engine lays out and
edits the pages.

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
[Tauri](https://tauri.app). Its document engine is built on the Rust crates of
[WordCraft](https://github.com/storytold/wordcraft) (MIT OR Apache-2.0), which read and write
.docx, .rtf and .odt, lay out pages and export PDF. Lithora adds its own interface and
Armenian and Russian support on top. Code from [LibreOffice](https://www.libreoffice.org)
(MPL-2.0) may be borrowed file by file where it helps fidelity.

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

To build a Windows installer from Linux, install `nsis` and `mingw-w64`, add the Rust target
with `rustup target add x86_64-pc-windows-gnu`, then run
`npm run tauri build -- --target x86_64-pc-windows-gnu --bundles nsis`.

Pushing a tag such as `v0.2.0` runs the Release workflow in GitHub Actions, which builds the
Windows and Linux installers and attaches them to a draft release.

## Project layout

| Path | What it holds |
|---|---|
| `src/` | The React app: components, file format services, translations |
| `src/services/` | Parsers and writers for .docx, .rtf, .doc, .odt and Word XML |
| `src/i18n/` | Interface translations |
| `src-tauri/` | The Tauri desktop shell (Rust) |
| `src-tauri/src/engine/` | The document engine bridge: open, draw, edit and save pages |
| `third-party/` | Licenses and notices of bundled third-party code and fonts |
| `public/` | Logo and static assets |

## License

Lithora is licensed under either of

- MIT license ([LICENSE-MIT](LICENSE-MIT))
- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))

at your option.

Unless you explicitly state otherwise, any contribution you submit for inclusion in Lithora
shall be dual licensed as above, without any additional terms or conditions.

Lithora includes third-party code and fonts under their own licenses; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
