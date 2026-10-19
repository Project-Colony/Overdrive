# Roadmap

Overdrive rewrites MediaChips (Electron + Vue 3 + Express + SQLite/drizzle)
as a native Rust app on iced 0.14 and colony-ui, conforming to
Project-Colony-Resources from the first commit.

The upstream code in `reference/mediachips/` is the functional spec: read the
relevant part before porting a feature, and port behaviour, not structure.
On a detail, the upstream code wins; on scope, this roadmap wins.

## Goals

- Feature parity with MediaChips v1.12.0 for the desktop use case, measured
  against the parity inventory (Phase 0); then improve on MediaChips.
- MediaChips users keep their library: data, tag images and user-chosen
  thumbnails, imported from the 1.12.0 schema (see the Phase 2 importer).
- A fully new UI built on colony-ui: sidebar navigation, Colony themes,
  typography, Preferences, en/fr i18n (see Resources `design/*.md`).
- Windows, macOS Apple Silicon and Linux, first-class on all three; Intel
  macOS too while its asset ships (see Open decisions). Every phase is done
  when it works on those OS, not just Linux (see Definition of done).
- One raw binary per platform, listed in the Colony store through
  `colony.json`, released with Release Please and signed by the shared
  workflow.
- Smooth on libraries of hundreds of thousands of files (see Performance).

## Non-goals

- No activation key, license server, device limit or unregistered mode.
  Everything upstream gates behind registration, the 100-item free library
  cap included, is simply available.
- No telemetry, no cloud, no account.
- Not a port of the Electron or Express architecture.
- No in-app updater: updates come from the Colony launcher. No in-app
  feedback upload: About links to the repository issues.
- UI languages are en and fr only (Resources `design/i18n.md`). Upstream's
  cn, de, es, ja, pt and ru translations are not ported: those users keep
  their data and get English.
- Upstream appearance settings (dark mode, theme colours, gradients, fonts,
  zoom) are replaced by colony-ui themes, accents and text sizes.
- No live transcoding for browser playback: native playback does not need
  it. It only returns if a LAN or browser mode is kept (see Open decisions).

## Known limitations

- Screen readers: iced 0.14 exposes no accessibility tree, so screen readers
  cannot read the window. Full keyboard operation of every view is the
  mitigation until iced ships one.
- Wayland: winit 0.30 has no drag and drop on Wayland, so an "Add files or
  folder" action (Phase 4) replaces inbound file drops there.

## Constraints

- **License:** GPL-3.0-only, because upstream is GPL-3.0 and we cannot add
  "or later" without the copyright holders. Upstream declares `GPL-3.0`, the
  deprecated SPDX alias of `GPL-3.0-only`. This is the one exception to the
  org's GPL-3.0-or-later rule: `[workspace.package]` says
  `license = "GPL-3.0-only"`, and the README badge and License section
  override the template. Keep upstream copyright notices.
- **Repository layout:** follow Resources `design/repository-layout.md`.
- **`reference/`:** study material, never compiled, never edited. Excluded
  from lints, dash and typo checks, and exempt from the Resources writing
  rules. No asset (image, icon, font, logo, flag, sample media) is copied
  from it: Overdrive uses colony-ui fonts and icons and its own brand.
  Upstream's own `.gitignore` made git skip its tracked `.editorconfig`; on
  any re-import, compare blob SHAs with the upstream tree.
- **Upstream tracking:** parity is frozen at v1.12.0 (`d7554a9`). Later
  upstream features are out of scope unless an open decision adopts them.
  Each phase gate checks upstream releases for new
  `api/db/migrations-drizzle` files; accepting a newer schema in the
  importer is a deliberate change with its own fixtures, studied from the
  upstream tag without refreshing `reference/`. Refreshing `reference/`
  moves the parity target, so it needs an open decision and its own commit
  that also updates the README commit hash.
- **One file per platform:** Colony installs exactly one file per platform
  (`releaseFiles.<platform>.binary` extracts a single entry, Colony
  `src/download/files.rs`). Every native runtime (player, ffmpeg, ffprobe,
  image decoders, ML runtimes) is linked in, embedded and extracted,
  downloaded on demand, or a system package, with a clear in-app message
  when it is missing.
- **Startup:** `overdrive --version` prints and exits 0 before any iced,
  media runtime or ffmpeg initialisation or extraction: the release template
  smoke-tests it on runners without media runtimes. A missing media runtime
  degrades to the external player, never to a failed start. Phase 1 picks
  the mechanism, since gstreamer-rs and libmpv link at load time.
- **Dependencies:** latest releases (Resources `design/dependencies.md`).
  Any pin behind latest is recorded, with its exit plan, in a comment next to
  the pin and in Resources `design/dependencies.md` through a Resources PR.
- **Storage:** through `colony_ui::paths` (Resources `design/filesystem.md`).
  `config_dir("Overdrive")` holds preferences under `preferences/`;
  `data_dir` holds databases, backups, tag images, user-chosen thumbnails and
  the log file, each in its own sub-directory, because config and data are
  the same directory on Windows and macOS; `cache_dir` holds generated
  previews and extracted or downloaded runtimes. Anything the user would
  miss is not cache, and "Clear generated images" only ever deletes cache.
- **File safety:** deletes go to the OS trash; permanent delete needs an
  explicit confirmation; cross-volume moves copy, verify, then delete; the
  database path changes in the same transaction as the file operation. An
  offline volume is "offline", not "missing", and is never purged
  automatically.
- **Secrets:** API keys go to the OS credential store, passwords are stored
  as a hash, never in plain text.
- **Shortcuts:** mnemonic shortcuts (M, P, T, F, `/`, ...) bind to the
  logical key, using the Latin key on non-Latin layouts. Positional clusters
  (digit row, player transport) bind to the physical key. The shortcuts list
  shows labels from the user's layout.
- **Privacy:** README `## Privacy` lists every outbound endpoint and what it
  sends (TMDB, ThePornDB, model and runtime downloads, ...), and changes in
  the same PR as the feature that adds it. Every remote lookup is opt-in.
- **Commits:** conventional commits, squash-merged PRs. The repository
  allows squash merges only, with `PR_TITLE` as the squash title and
  `COMMIT_MESSAGES` as the message, and deletes branches on merge (Resources
  `design/releases.md`).
- **Local workflow rules:** at most 4 open hand-written PRs at a time,
  grouped by theme (Dependabot and release-please PRs do not count); at most
  2 parallel cargo builds on the dev machine.

## Testing

- Golden fixture libraries made once by MediaChips 1.12.0 (database, `meta/`
  tag images, previews, backup zip), one row per edge case the importer
  handles. Kept outside `reference/`.
- Upstream's 573 `.test.ts` files are the behavioural spec for queries,
  filters, path regex, oshash and chip recipes: port the relevant cases as
  Rust tests with the feature.
- A synthetic media corpus generated by a script with ffmpeg: every target
  container and codec, audio-only, images, text, broken files, odd names.
- Each phase lands with its tests, and CI runs them on the three OS.

## Definition of done

A phase is done when its checklist passes on Linux, Windows, macOS Apple
Silicon, and macOS Intel while that asset ships. CI covers build, tests and
`--version` wherever a runner exists. A manual smoke checklist per phase
covers the rest (playback, file dialogs, drag and drop, permissions), on the
machines Phase 1 names. A per-OS exception counts only when the phase records
it (for example ML on Intel Macs in Phase 9).

## Performance

One performance corpus, generated by a script (separate from the Testing
media corpus): 200,000 synthetic media items, the low end of "hundreds of
thousands", mixed types, with tags and previews. Phase 1 sets the grid
budget (frame time while scrolling, memory); Phase 2 adds filter and search
p95 and scan rate on the same corpus. Every later phase keeps both.

## Phase 0 - Foundation

- [ ] Parity inventory: one row per upstream endpoint (`api/routes/**/*.ts`,
      where `Task.routes.ts` alone holds most background tasks, and
      `app/server/builtinRoutes.ts`), Electron main-process feature or IPC
      channel (`electron/*.ts`: tray, app menu, jump list, drag-out, window
      bounds, player window), page, dialog, settings key (settings table and
      `config.json`) and database table, each marked with a target phase,
      "later" or "dropped (reason)". Parity in Goals means every row marked
      with a target phase is done.
- [ ] Cargo workspace per `design/repository-layout.md`: `crates/overdrive`
      binary, `crates/overdrive-core` for library, DB and scanning logic,
      with no iced, wgpu or player runtime dependency, so its tests build and
      run on CI legs with no GStreamer or libmpv installed. That build
      boundary is the reason for the split, recorded in
      `docs/internals/architecture.md`. Edition, rust-version and resolver
      as in Resources (2021, 1.88, 3).
- [ ] Latest colony-ui (0.1.6 today), pinned in `[workspace.dependencies]`
      next to `iced = "0.14.0"`. App shell with sidebar navigation, theme,
      typography, en/fr strings, and a Preferences skeleton: General,
      Appearance, Accessibility, Library, Files, Maintenance, About.
- [ ] Runtime paths through `colony_ui::paths` (see Storage).
- [ ] `colony.json` from `manifests/examples/minimal.json`, category
      `multimedia`. `release-please-config.json` with `release-type`
      `simple` and `extra-files: ["Cargo.toml"]` (a workspace), one
      `[workspace.package]` version marked `x-release-please-version`, and
      `.release-please-manifest.json`. `simple` does not touch `Cargo.lock`,
      which pins each workspace member's version: copy Eidos's "Keep
      Cargo.lock in step with the version" release-job step, or every
      `--locked` build of a release fails. `.github/workflows/release.yml`
      from `templates/sign-and-publish-caller.yml`; `.github/dependabot.yml`
      from `templates/dependabot.yml`. CI on the 3 OS: fmt, clippy, test,
      msrv, `overdrive --version`, and the dash check outside `reference/`.
      While the repository is private, GitHub Free caps Actions minutes
      (2,000 a month, macOS billed at 10x): keep macOS legs lean.
- [ ] Release-please PRs stay unmerged until the repository is public (see
      Release).
- [ ] Repository settings: squash merges only, `PR_TITLE` and
      `COMMIT_MESSAGES`, delete branch on merge.
- [ ] If `reference/` stays vendored (see Open decisions): `.gitattributes`
      with `reference/** linguist-vendored`, and a policy for dependency
      alerts raised by its npm manifests.
- [ ] README on the `templates/program/README.md` skeleton: Status
      blockquote, badges (GPL-3.0-only), Why Overdrive, What it does,
      Installation, Documentation, `## Code signing policy`, `## Privacy`,
      License, plus Origin.

## Phase 1 - Spikes (decision gate)

Inline playback, shipping a media runtime as one file, and a smooth
200,000-item grid are the main technical risks in iced. Settle them before
building the UI around them, and record the outcome with its measurements in
`docs/project/video-backend.md`.

### Media runtime

- [ ] Throwaway spike with `iced_video_player` 0.6.0 (iced 0.14, gstreamer-rs
      0.23): play, pause, seek by dragging, loop, speed change, frame
      capture (for "set frame as thumbnail"), a second window and
      fullscreen, on MP4 / MKV / WebM / HEVC files from a real library,
      4K 10-bit HEVC and 4K60 H.264 included.
- [ ] Audio-only files (MP3, FLAC, OGG, M4A, some with cover art):
      iced_video_player cannot open them, so the decision names the audio
      path too.
- [ ] If GStreamer falls short, try libmpv's render API: software or
      offscreen OpenGL readback into a wgpu texture first, since released
      libmpv has no Vulkan or Metal render backend (mpv master added a D3D11
      one in October 2026, unreleased: recheck it for Windows). Zero-copy
      GPU interop is a later, separate spike. Embedding by window id is not
      an option on Wayland.
- [ ] Measured on each OS against thresholds written in
      `docs/project/video-backend.md` before the run: seek latency while
      dragging, hardware decoding active, A/V sync, CPU and dropped frames
      at 4K, memory after opening and closing 50 players, size added to each
      release asset, and glitch-free rendering on the dev machine's NVIDIA +
      Wayland (Hyprland) session.
- [ ] Packaging, pass or fail on Windows and macOS. A stock GStreamer is a
      tree (libraries, a plugin directory, the plugin scanner, environment
      variables set before `gst_init`); one file means a static build or
      `gstreamer-full`, whose Windows support is experimental. libmpv is one
      self-contained DLL on Windows (third-party shinchiro builds), a dylib
      closure to relocate and re-sign or a static build on macOS, and the
      system `libmpv.so.2` on Linux.
- [ ] gstreamer-rs (so iced_video_player) and libmpv link their libraries at
      load time: a missing one stops the process before `main`, `--version`
      included. Keeping them optional needs the player in a separate process
      (a worker mode, as in Phase 9), dlopen through own bindings
      (gstreamer-rs has no dlopen mode), `/DELAYLOAD` on Windows as SAM's
      `build.rs` does, or weak linking on macOS. A search-path re-exec, as
      SAM does on macOS and Linux, only finds an extracted copy; it never
      makes a missing library optional.
- [ ] Linux system packages: fallback to the external player and an
      "install X" message when missing. Test on a stock Fedora VM (no HEVC,
      H.264 only through OpenH264) as well as Arch.
- [ ] Builds without a cache in 3-OS CI and in the template's four release
      legs, including the Intel macOS leg cross-compiled on an arm64 runner;
      record where that leg gets its x86_64 libraries. Every leg that can run
      its binary (not the cross-compiled Intel macOS one) also runs a media
      check, for example `overdrive --check-media` decoding a small clip,
      since `--version` runs before media initialisation. Decide whether the
      Intel macOS asset ships (see Open decisions).
- [ ] One runtime for probing, previews and playback is preferred over two.
      Decide how ffmpeg and ffprobe ship (size and source per OS; BtbN has
      no macOS build), or replace them with the player runtime or linked
      libav*. Decide the image decoders (HEIC, AVIF, SVG, EXIF) the same
      way, or route image thumbnails through ffmpeg.
- [ ] Embed and extract, if chosen, adapts SAM Colony Edition's
      `bootstrap.rs` (it embeds one small library and reads it back on every
      launch) with these changes: a versioned directory in the Colony cache
      dir, a hash marker instead of reading the file back, atomic write and
      rename, executable permission for ffmpeg and ffprobe, and search paths
      set even when the write fails. It suits ffmpeg, ffprobe or one
      self-contained library, not a stock GStreamer tree.
- [ ] Per delivery option, how Windows Defender treats an unsigned ffmpeg,
      ffprobe, libmpv or GStreamer file written to and run from the Colony
      cache dir, and whether SignPath can sign it: the release signature
      covers only the release file.
- [ ] Licence plan for every shipped runtime: exact build configuration (a
      GPL build compatible with GPLv3, or LGPL with user-replaceable
      libraries), a note on H.264/HEVC patents for bundled decoders, a
      THIRD-PARTY notices file (Rust crates included), corresponding source
      for each release, and a setting that points at a user-supplied runtime
      directory the bootstrap never overwrites.
- [ ] If iced_video_player is adopted, record its gstreamer-rs pin (two
      majors behind) as a dependency deviation, and vendor or fork it (MIT OR
      Apache-2.0) if it lags an iced bump in colony-ui.
- [ ] Fallback in every case, "Open in external player": the OS default app
      by default; mpv on every OS and IINA on macOS, auto-detected and
      configurable, with markers passed as a chapters file. Spec:
      `api/services/externalPlayerLaunch.ts`, `ffmetadataChapters.ts`.

### Grid

- [ ] A windowed grid of 200,000 synthetic items (iced 0.14 has no
      virtualised list or grid): `scrollable` viewport, spacers, responsive
      column count, off-thread thumbnail decoding, hover scrub on one card.
      Measure frame time while scrolling and memory on the three OS. Shape
      Phase 2 queries for windowed paging.

### Platform

- [ ] Tray icon and drag-out to other apps on the 3 OS; where drag-out
      fails, Copy path and Reveal in file manager replace it.
- [ ] macOS: launch from Colony, scan a library on an external disk and on
      an SMB share, and record which program the permission prompts name.
- [ ] Name the machine or VM for the manual smoke checklist on Windows,
      macOS Apple Silicon and macOS Intel; the release workflow only checks
      the Intel asset's architecture, it never runs it.

Dev machine reference: Arch, Hyprland, NVIDIA; GStreamer 1.28.8 with base,
good, bad and libav plugins (no ugly); mpv 0.41; ffmpeg 9.0.2.

## Phase 2 - Data core

Schema spec: `api/db/schema/*.ts`, `api/db/schemaRepair.ts` (columns and a
table that no migration creates) and `api/db/searchFts.ts`. The 31 drizzle
migrations are history only. Overdrive has its own schema covering upstream
behaviour, with foreign keys, and imports into it one way.

- [ ] Background job runner: progress, cancel, per-tool concurrency limits
      (ffmpeg 2, ffprobe 2, conversion 1, hashing 4). SQLite in WAL mode, one
      writer thread, a read pool; the UI never waits on a write, and progress
      arrives as iced messages.
- [ ] rusqlite with `bundled`: the same SQLite and FTS5 on the 3 OS.
      Forward-only embedded migrations tracked in `user_version`, a backup
      before each migration, and a refusal to open a database newer than the
      binary.
- [ ] Schema. Glossary (Overdrive term = upstream name): media type =
      `mediaTypes`; field (chip) = `meta` row; field type = `meta.type`;
      marker = `marks`; saved view = `savedFilters` +
      `filterRowsInSavedFilters` + `filterRows` + `tagsInFilterRows`. The
      schema covers:
  - media types: built-in video, image, audio and text, plus custom types
    with their own extension lists; per-type field assignment
    (`metaInMediaTypes`); media, views and saved views scoped by type;
  - fields, tags and values, with two hierarchies: the field tree
    (`meta.parentMetaId`, three levels at most) and fields on tags:
    `pinnedMetas` lists which fields a field's tags carry, and a tag's values
    for them sit in `tagsInTags` (tag-type fields, which is how tags nest)
    and `valuesInTags` (other types). `tags.parentTagId` exists upstream,
    but 1.12.0 never sets it from the UI and no feature uses it, so the
    importer ignores it. Tag synonyms are a CSV column upstream;
  - typed markers (bookmark, favorite, tag) with an optional end and a tag
    link; a chapter is a bookmark with the chapter icon. Upstream stores
    every tag marker as type `meta` (`tag` exists only in its UI) and old
    chapters as `scene`: the importer maps `meta` to tag and `scene` to a
    chapter;
  - playlists, saved views, page settings, tabs, watched folders;
  - trash: soft delete with 30-day retention for media, tags, markers,
    playlists and saved views.
- [ ] File identity: unique path plus oshash, bit-exact with upstream, Stash
      and ThePornDB: the file size plus the little-endian u64 sums of the
      first and last 64 KiB, wrapping at 2^64, as 16 lowercase hex
      characters. Under 64 KiB both chunks are the size rounded down to a
      multiple of 8 and overlap; a file of 8 bytes or less has no oshash and
      is identified by its path alone. Computed on add, with known-answer
      test vectors (upstream's `oshash.test.ts` checks only the format) for
      a 9-byte file, a file under 64 KiB and one between 64 and 128 KiB. No
      full-file hash (upstream retired SHA-256).
- [ ] Add-time duplicate keys, as upstream when duplicate checking is on:
      media type, size and case-insensitive basename, then oshash within the
      media type; a match whose old path is gone is reported as moved, not
      duplicate.
- [ ] Paths: non-UTF-8 names kept losslessly, NFC comparison, a case policy
      per OS, offline distinct from missing, library root remap for a moved
      drive or mount point.
- [ ] Folder scanner that classifies every media type from the start.
      Probing: ffprobe for audio and video, EXIF for images, an excerpt and a
      full-text index for text.
- [ ] Watched folders: native watcher (`notify`), polling or periodic
      rescans for network and mounted paths, and rescans instead of failure
      on a watch limit (port `watchPathHints` and `watchFolderRisk`). Media
      inbox for new and lost files. Relink of missing or moved files by
      oshash and size.
- [ ] Libraries: create, switch, duplicate, delete, size and clear cache,
      merge from another library, reset. Backups: a snapshot through the
      SQLite backup API or `VACUUM INTO` plus tag images and user-chosen
      thumbnails, cache excluded, taken automatically before imports and
      migrations; restore staged in a temporary directory and swapped in
      atomically.
- [ ] Query engine for filters (any field or tag, nested fields, exact and
      negative conditions), sort, group-by and full-text search, headless
      and tested against fixtures. Phase 4 only adds its UI.
- [ ] MediaChips importer:
  - sources: libraries last opened by MediaChips 1.12.0 (all 31 known
    `__drizzle_migrations` hashes) and their backup zips. Anything else is
    refused with a message to open it once in MediaChips 1.12.0 first: a
    library with an unknown hash (newer than 1.12.0) or missing a known one,
    a library with no `__drizzle_migrations` table (Sequelize, which has
    `SequelizeMeta` instead), and a LowDB `dbs.json`. A Sequelize library
    already opened in 1.12.0 keeps `SequelizeMeta` and has every hash, so it
    is accepted;
  - discovery: `config.json` and `app_storage/<id>/db.sqlite` in the
    MediaChips app folder: `$MEDIA_CHIPS_DATA_DIR` if set, else Electron's
    userData (`$XDG_CONFIG_HOME/MediaChips` or `~/.config/MediaChips`,
    `%APPDATA%\MediaChips`, `~/Library/Application Support/MediaChips`); the
    legacy `databases/` folder; and a manual picker for portable and Docker
    installs. Relative `media.path` values, and those with a
    `databases|app_storage/<12hex>/` prefix, resolve against the source
    library folder as upstream does (spec:
    `api/services/activeDbFileResolver.ts`);
  - read-only: snapshot the source through the backup API (or copy the
    database with its `-wal` and `-shm` files), never open it for writing,
    warn if MediaChips is running;
  - user files: tag images
    (`meta/<metaId>/<tagId>_{main,avatar,alt,header,custom1,custom2}.jpg`)
    go to the data dir under remapped ids. Upstream writes a chosen frame, a
    crop, or a TPDB or TMDB poster over the generated
    `media/videos/thumbs/<id>.jpg` or `media/images/thumbs/<id>.jpg` and
    records nothing, so every imported video and image thumbnail goes to the
    data dir as user-chosen, under its new id, and can be reset to
    generated. Grids, marker thumbnails and audio covers are renamed to the
    new ids in the cache, or regenerated;
  - data: keep `oldId` values; keep resume position, view counts and view
    dates even when probe data is regenerated; carry trashed rows over as
    trashed (`deletedAt` NULL or `''` means active), with the real path from
    `trashOriginalPath`, the real tag name from `trashOriginalName`
    (upstream rewrites both to `__mediachips_trash__/<id>/...`) and
    `trashPurgeFile`; an active row can hold the same path or name, so
    Overdrive's unique path and tag-name indexes cover active rows only;
    probe columns with `PRAGMA table_info`, since two libraries at the same
    migration level can differ; parse the three text timestamp formats;
    split CSV synonyms; drop orphaned and duplicate join rows; for flags held
    both as `meta` columns and in `metaSettings`, take `meta` (the 1.12.0 UI
    reads and writes only those columns); rebuild FTS; recompute visual
    hashes; map Material Design Icons names to the `nf-md` glyphs of the
    Nerd Font colony-ui embeds, with a fallback glyph;
  - settings: map only what Overdrive supports; `locale` `fr` maps to fr and
    every other value to en, with a one-time notice; drop registration and
    the free-library flags; move every API key (`tpdbApiKey`, `tmdbApiKey`,
    `jellyfinApiKey`, `stashApiKey`, read from both `config.json` and the
    settings table) to the credential store; never import the lock `phrase`
    in plain text.

## Phase 3 - Previews pipeline

- [ ] Preview job types on the Phase 2 runner, generated on demand for
      visible cards first.
- [ ] Video thumbnail, 3x3 storyboard grid (also the timeline scrub source:
      upstream has no separate sprite), marker thumbnails, image thumbnails,
      audio cover art, folder thumbnails. Upstream's layout
      (`media/videos/{thumbs,grids,marks}`, `media/images/thumbs`,
      `media/audios/thumbs`) is kept so imported previews are reused.
- [ ] Cache in the Colony cache dir by default, location configurable in
      Preferences. Cleanup and regeneration.
- [ ] Hover scrub on cards from the grid frames (upstream's timeline mode),
      off when `colony_ui::effects_enabled()` is false.

## Phase 4 - Browse UI

- [ ] Widget kit: modal dialog, context menu, tag autocomplete chip input,
      date picker, colour picker, range slider, tree view, image crop, the
      Phase 1 grid, an internal drag-and-drop layer (reorder, drop targets).
      Note which ones belong in colony-ui.
- [ ] Browser layout: tags sidebar, media grid, inspector, docked filters.
      Decide whether the tags tree is the Colony sidebar's section list or a
      separate pane.
- [ ] Navigation per media type; media, tags and folders views;
      configurable cards; view modes (video: grid, timeline, minimal; image:
      grid, masonry, squares; every media type: list; tags: cards, chips,
      minimal, list). The grid lays out fixed rows and masonry columns from
      stored sizes; group-by may stay non-virtualised, as upstream.
- [ ] Filters UI on the Phase 2 engine, saved views, sort and group-by.
- [ ] Global search (`/`), command palette (Ctrl/Cmd+K), keyboard
      navigation and range multi-select in the grid, shortcuts help.
- [ ] An "Add files or folder" action in the browser and on the
      empty-library landing: the fallback for file drops on Wayland (see
      Known limitations).
- [ ] Trash: browse, restore, purge.
- [ ] Desktop integration: single instance, remembered window bounds, the
      macOS app menu, the Windows jump list; tray and drag-out (or Copy path
      and Reveal in file manager where it fails) per the Phase 1 Platform
      spike.
- [ ] First run: empty-library landing, starter fields, import from
      MediaChips.
- [ ] Accessibility: grid and cards sized with `sz()` and checked at 0.7225x
      and 1.68x and in OpenDyslexic; labels on user-chosen colours use
      `contrast_on()`; every action reachable from the keyboard. CJK and RTL
      file names and tags render on the 3 OS with both fonts, or a Resources
      issue asks for a fallback font.
- [ ] Smooth on the performance corpus (see Performance).

## Phase 5 - Chips and tags

- [ ] Field types: tags, text, number, checkbox, date, rating. Built-in
      favorite and bookmark. Per-field options: tag colours, country,
      synonyms, nesting, path regex.
- [ ] Tag profiles: six image slots, countries, nested fields, synonyms,
      field hierarchy UI, merge, tag pages. Flags come from a set with a
      GPL-compatible licence that covers the upstream country list
      (`gb-eng`, `gb-sct`, `gb-wls` included), recorded in the THIRD-PARTY
      notices.
- [ ] Virtual folder tags, with inheritance.
- [ ] Chip recipes: `.chiprecipe.json` import, export, preview and apply
      (spec: `shared/chipRecipe.ts`, `api/services/chipRecipe.ts`), the two
      upstream recipes embedded, no remote catalog (the upstream one is
      gone).
- [ ] Path tags and regex extraction. Upstream patterns use JavaScript regex
      syntax: use an engine with lookaround (for example `fancy-regex`), port
      `applyPathRegexReplace` as written, and validate imported patterns
      against upstream's `regexMeta` and `regexGenerator` tests. No ML here:
      upstream's word clustering uses MiniLM and belongs to Phase 9.
- [ ] Bulk edit.
- [ ] Triage: review mode, media inbox UI, session tag tray, quick tags.
- [ ] Icon picker over the shipped `nf-md` glyphs.

## Phase 6 - Player

- [ ] Built-in player (from the Phase 1 decision): a separate window by
      default as upstream, fullscreen, picture in picture, speed, loop,
      shuffle, autoplay and up next, restore position, view counting, wheel
      seek and volume. Audio playback.
- [ ] Timeline markers, chapters, auto-chapters (scene and silence
      detection).
- [ ] Playlists page: manual and smart playlists (from saved views), M3U8
      export.
- [ ] Markers page: browse, clip studio, reel order, clip export
      (concatenated or to a folder), on the Phase 1 ffmpeg decision.
- [ ] The display stays awake while playing, released on pause or close
      (portal Inhibit or `org.freedesktop.ScreenSaver` on Linux,
      `SetThreadExecutionState` on Windows, an IOPM assertion on macOS). OS
      media keys and now-playing controls (MPRIS, Windows SMTC, macOS Now
      Playing).

## Phase 7 - Library tools

- [ ] Duplicate finder: exact by oshash, near by visual hash (8x8 aHash of
      the 3x3 grid plus per-tile hashes; spec `visualHash.ts`,
      `visualHashSimilarity.ts`), shown in a visual grid. Similar media
      without ML (visual hash, tag co-occurrence).
- [ ] Video tools, if kept (see Open decisions): convert, trim (optionally
      deleting the original). Clip export lives on the Phase 6 Markers page.
- [ ] Library health: missing media list and relink UI (engine in Phase 2),
      bulk path edit, metadata backfills, clear generated images, startup
      health alerts.
- [ ] File operations (move, rename, delete) under File safety.
- [ ] Image viewer: zoom, fit, rotate, flip, filmstrip, info, slideshow,
      fullscreen; animated GIF and WebP; SVG; HEIC and AVIF per the Phase 1
      decoder decision; supported formats listed per OS.
- [ ] Audio and text at parity: text as plain text and Markdown (iced's
      markdown widget); HTML shown as text or opened externally.

## Phase 8 - Integrations (scope to confirm)

Upstream's plugins are first-party TypeScript packages built into its
standard builds: their UI is compiled into the host, and their backend runs
unsandboxed with full access. Nothing there calls for a plugin system in
Rust; the default is built-in modules behind Cargo features.

| Integration | Upstream behaviour | Port notes |
|---|---|---|
| Stash | import from the Stash SQLite file; push over GraphQL | the most valuable integration; import needs only the Phase 2 schema and oshash, so it can follow Phase 2; detect the Stash schema version; fixtures from several versions |
| Jellyfin, Emby | Jellyfin: import and push; Emby: import only, through the Jellyfin client | one client |
| Plex | import over HTTP with `X-Plex-Token` | |
| TMDB | movie and person scraper, user key | show the attribution TMDB requires |
| ThePornDB | scene and performer scraper by oshash, user key | |
| CamGirlFinder | uploads face images to identify real people | see Open decisions |

- [ ] `integrations/mpv` and `integrations/iina` are not ported: they need
      upstream's HTTP API.

## Phase 9 - Optional ML (scope to confirm)

Models are downloaded on demand from their original publisher or, where it
publishes no ONNX file (CLIP, OPUS-MT), from a named conversion (Xenova on
Hugging Face), pinned by sha256, after the user has seen their licence;
never bundled. Each row is marked in or out.

| Feature | Upstream model | Engine | Licence |
|---|---|---|---|
| Scene search, similar media, auto-chapter titles | CLIP (`clip-vit-base-patch32`) | ONNX Runtime | MIT |
| Faces: detection, recognition, landmarks, gender and age | InsightFace `buffalo_l` (SCRFD `det_10g`, `w600k_r50`, `2d106det`, `genderage`), from a third-party mirror | ONNX Runtime | non-commercial research only |
| Path-tag suggestions (word clustering) | MiniLM (`all-MiniLM-L6-v2`), bundled upstream | ONNX Runtime | Apache-2.0 |
| Scene search in other languages (query translated to English before CLIP) | OPUS-MT, Xenova conversions of Helsinki-NLP `opus-mt-{ru,zh,es,de,fr,ja}-en` (upstream's pt-en id does not exist) | ONNX Runtime | Apache-2.0 (es, de, fr, ja), CC-BY-4.0 with attribution (ru, zh) |
| Assistant: filters, playlist mix, regex help, chapter titles | Qwen2.5 1.5B Instruct GGUF | llama.cpp | Apache-2.0 |
| Tag image upscale | Real-ESRGAN, the 2022 `realesrgan-ncnn-vulkan` executable (release v0.2.5.0) | ncnn Vulkan | weights BSD-3-Clause; executable MIT, ncnn BSD-3-Clause |

- [ ] Face models: the InsightFace weights are for non-commercial research
      only. Overdrive never conveys them, so this is not a GPL conflict, but
      every user who downloads them is bound by those terms. Choose
      permissively licensed models (check each), or show InsightFace's terms
      and require consent; never default to the third-party mirror.
- [ ] Runtime: `ort` has no stable release (2.0.0-rc.15 today; every 1.x is
      yanked) and dropped Intel macOS in 2.0.0-rc.11, and ONNX Runtime 1.24
      and later ship no x86_64 macOS binaries. Load ONNX Runtime
      dynamically, downloaded on demand, and declare ML unsupported on Intel
      Macs, or evaluate a pure-Rust engine (tract, candle).
- [ ] Inference runs in a worker mode of the same binary
      (`overdrive --worker`) so a native crash does not take the UI down;
      ffmpeg and ffprobe stay subprocesses.
- [ ] Third-party model credits in About and the THIRD-PARTY notices.

## Release

GitHub Free does not give private repositories access to organisation
secrets, so the shared signing workflow cannot sign while Overdrive is
private. Going public comes before the first release, in this order:

- [ ] Move this roadmap to a private place outside the repository. The
      repository's issues and milestones are not that place: they become
      public with the repository. Every commit since `effad7b` contains the
      file, and so does every pull request opened while it is in the tree,
      whether or not the PR touches it. Once pushed, removing it means
      rewriting published history, and the copies under `refs/pull/*` are
      read-only: only GitHub Support can dereference those PRs, and it may
      decline. Removing it before the first push costs nothing.
- [ ] Apply the `reference/` decision (see Open decisions).
- [ ] Re-check the name decided before Phase 0 (see Open decisions) against
      any new filings.
- [ ] `SECURITY.md` modelled on Resources' (media parsing, database import,
      integrations, any network mode).
- [ ] THIRD-PARTY notices and corresponding source (Phase 1 licence plan).
- [ ] Check history and every ref for anything that must not be public.
- [ ] Make the repository public, turn on private vulnerability reporting,
      add it to the selected repositories of `COLONY_SIGNING_KEY_PEM`, then
      merge the release PR.
- [ ] First signed release; then `"signed": true` in `colony.json`.
- [ ] Conformity audit against all of Project-Colony-Resources, with the
      recorded exceptions (GPL-3.0-only, `reference/`, dependency
      deviations). A Resources PR records the GPL-3.0-only exception and
      names third-party study material such as `reference/` as an exception
      to the writing rules in `design/documentation.md`.

Phases 8 and 9 never block a release.

## Open decisions

Before Phase 0:

- The name: OverDrive, Inc. (the Libby app) holds a US registration for
  OVERDRIVE covering software for downloading digital content. Check USPTO,
  EUIPO and the app stores while renaming is still free.
- How `reference/` is published: vendored as it is (compiled third-party
  bundles without their licence notices, npm manifests feeding dependency
  alerts) or a submodule pinned to `d7554a9`. Decide before the first push:
  after it, the vendored tree stays in published history and in
  `refs/pull/*` unless history is rewritten.
- LAN, mobile browser, Docker and NAS modes from upstream: keeping them
  means a second product (HTTP API, web client, authentication, live
  transcoding) and changes the crate split. Proposed: out of scope, maybe a
  separate crate later. If kept: off by default, localhost only until
  enabled, authentication required, only library media and derived assets
  served.

Before Phase 2:

- ML in or out (Phase 9): decides whether the importer keeps face and CLIP
  rows, whose embeddings are model-specific.
- Intel macOS (Phase 1 outcome): ship the asset, or drop it, which narrows
  Goals and Definition of done and removes `-macos-x86` from the release
  workflow's asset lists.
- Zip-archive galleries (`a.zip!/entry` virtual paths): keep (separator,
  identity, hashing, thumbnails) or drop (the importer reports those rows
  instead of flagging them missing).
- App lock with idle auto-lock: keep (an argon2 hash, and the UI says it is
  not encryption) or drop. SFW blur mode: keep (blurred preview variants in
  Phase 3, a blur shader in the player) or drop.
- Tag names: unique across fields and case-insensitive (upstream folds
  ASCII only, through SQLite `lower(trim(name))`, so `Élise` and `élise` can
  both exist; Unicode case folding means the importer merges or renames
  such pairs), or unique per field.
- Marker precision: whole seconds (upstream) or milliseconds.

Later:

- Start page: a Home dashboard (which upstream widgets: health, continue
  watching, charts) or the library grid (Phase 4).
- Upstream's default video-on-hover and big preview: port or drop, once the
  Phase 1 player decision is made (they would land in Phase 3).
- Video tools: port or drop (Phase 7).
- Stash and Jellyfin push; CamGirlFinder (proposed: not ported); whether the
  store build enables the adult scrapers (Phase 8).
- First release: proposed once Phases 0 to 4 work (import, browse, filters,
  previews, external player).
- Licence: ask the MediaChips copyright holders for permission to use
  GPL-3.0-or-later; until then, GPL-3.0-only.
- New features and improvements beyond parity: to be defined.
