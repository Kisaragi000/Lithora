# Privacy

Lithora is a desktop app. It has no accounts, no ads, no analytics and no tracking, and it does
not collect, send or sell any information about you or your documents.

## What stays on your computer

- Your documents, and the recovery copies AutoRecover keeps of unsaved work.
- Your settings, recent files list and saved signatures.
- Spelling, grammar and thesaurus checks, which run inside Lithora without going online.

You can delete the recovery copies, settings and saved signatures by removing Lithora's data
folders (`%APPDATA%\io.github.kisaragi000.lithora` and
`%LOCALAPPDATA%\io.github.kisaragi000.lithora` on Windows,
`~/.local/share/io.github.kisaragi000.lithora` and `~/.config/io.github.kisaragi000.lithora`
on Linux).

## When Lithora goes online

Lithora connects to GitHub only to look for updates:

- When it starts, it asks GitHub's public API which Lithora versions exist. You can turn this
  off in **Settings › Updates**.
- When you click **Check for updates**, it does the same, and if you choose to update it
  downloads the new installer from GitHub.

These requests send nothing about you or your documents. Like any web request they reveal your
IP address to GitHub, which handles it under the
[GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

## Questions

Open an [issue](https://github.com/Kisaragi000/Lithora/issues) on GitHub.
