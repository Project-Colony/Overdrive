# Overdrive

**A local media library for videos, images, audio and text: custom metadata
("chips"), deep tags and filters, visual previews.**

Overdrive is a fork of [MediaChips](https://github.com/fupdec/MediaChips)
1.12.0, the Electron + Vue desktop app. It keeps the MediaChips code and
removes the activation key: every feature works, with no library size limit
and no license server. It is part of Project-Colony.

> **Status:** 1.12.1 is the first release: MediaChips 1.12.0 renamed, unlocked
> and with safer defaults (see [CHANGELOG.md](CHANGELOG.md)). Builds are not
> code-signed. A native Rust rewrite is planned in
> [docs/project/roadmap.md](docs/project/roadmap.md).

## What it does

- **Chips and tags:** built-in and custom field types (tags, ratings,
  favorites, bookmarks, text, dates, numbers, colors), tag profiles with
  images, countries, nested fields and synonyms, chip recipes, tag hierarchy,
  merge tools, virtual folder tags.
- **Filters and search:** filter on any field or tag, exact and negative
  conditions, saved filters, sort and group-by, global search (`/`), optional
  scene search and on-device face tools.
- **Browse and preview:** tags sidebar, inspector, docked filters, hover
  preview, 3x3 storyboard grids, timeline scrub, built-in player with markers,
  chapters and playlists.
- **Library tools:** path tags and regex extraction, watched folders, bulk
  edit, duplicate finder, multiple libraries, backup and restore, importers
  (Stash, Jellyfin, Plex, Emby, TMDB).

## Installation

Download the file for your system from the
[latest release](https://github.com/Project-Colony/Overdrive/releases/latest).

| System | File |
|---|---|
| Windows | `Overdrive.v<version>.Windows.Installer.exe`, or `.Windows.Portable.exe` (no install) |
| macOS, Apple Silicon | `Overdrive.v<version>.Mac.arm64.dmg` |
| macOS, Intel | `Overdrive.v<version>.Mac.x64.dmg` |
| Linux | `Overdrive.v<version>.Linux.AppImage` |

The builds are not signed, so each system warns on first launch:

- **Windows:** SmartScreen says "Windows protected your PC": click
  **More info**, then **Run anyway**.
- **macOS:** open the `.dmg` and drag Overdrive to Applications. The first
  launch is blocked: open **System Settings > Privacy & Security** and click
  **Open Anyway** next to the Overdrive message. If macOS reports the app as
  damaged, run `xattr -dr com.apple.quarantine /Applications/Overdrive.app`.
- **Linux:** make the AppImage executable (`chmod +x Overdrive.v*.AppImage`)
  and run it. Some distributions need the `fuse2` / `libfuse2` package.

Overdrive keeps its settings and libraries in its own `Overdrive` folder, so
it does not touch an existing MediaChips install.

## Build from source

Node.js 22 is the reference version (`.nvmrc`); builds also work on Node 26.

```bash
npm ci
npm run electron        # development: Vite dev server + Electron
npm run dist -- --linux # installers in release/ (--win and --mac need those OS)
npm test
```

The release workflow (`.github/workflows/release.yml`) builds Windows, macOS
and Linux on GitHub Actions when a `v*` tag is pushed.

## Privacy

Overdrive sends no telemetry and never contacts a license server. Your media
and metadata stay on your computer.

- The built-in server listens on this computer only. LAN and phone access is
  off until you turn it on in Settings, and then it has no password unless you
  set one.
- The update check at startup is off by default.
- The first time it generates previews, Overdrive downloads the CLIP model
  from huggingface.co for scene search and similar media. Other ML features
  (faces, query translation, local assistant, image upscaling) download their
  models from Hugging Face or GitHub when you first use them. No media or
  personal data is sent.
- Integrations (TMDB, ThePornDB, Stash, Jellyfin, Plex, Emby) contact their
  service only when you use them, with the API key you provide.

## Origin

Overdrive is built on MediaChips by the MediaChips contributors, from upstream
commit `d7554a9526f713f6be93b31f5313c1ad322537dd` (v1.12.0).

## License

GPL-3.0-only, inherited from MediaChips (declared as `GPL-3.0`, the SPDX alias
of `GPL-3.0-only`, in its `package.json` and README). See [LICENSE](LICENSE).

Copyright © 2020-2026 MediaChips contributors.
Copyright © 2026 Project-Colony.
