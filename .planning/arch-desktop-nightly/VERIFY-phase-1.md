# Verification: Phase 1 — Installable Fork Package

**Verified:** 2026-08-19
**Upstream base:** `cf251c3bd00ff0e0cc90a78b20c043cf58f330ad`
**Result:** passed

## Automated checks

- Codex/provider maintenance and desktop artifact suites: 69/69 passed.
- Version-stamping and affected server suites: 72/72 passed.
- Targeted type-aware lint passed for all changed server and artifact-builder files.
- All 21 fork commits applied cleanly to the exact upstream base before the final build.

## Real Arch artifact

- Host: `valvdov@10.0.0.2`, Arch Linux x86_64.
- Artifact: `/home/valvdov/t3code-nightly-build/release/t3-code-nightly-0.0.33-nightly.20260819.1-x64.pkg.tar.zst`
- SHA-256: `d14c8ce8d2fceb989280776561f7ad9965e98b51f25a3058b5981ee123e46785`
- `pacman -Qp`: `t3-code-nightly 0.0.33_nightly.20260819.1-1`.
- `pacman -U --print` succeeded and every declared dependency resolved from configured Arch repositories.
- Updater metadata: `nightly-linux.yml` names the exact package and contains its SHA-512 and size.

## Package inspection

- Desktop launcher: `usr/share/applications/t3code.desktop`.
- Runtime: `opt/T3 Code (Nightly)/resources/app.asar` and resource monitor.
- Updater marker: `resources/package-type` contains `pacman`.
- Antigravity implementation and official Codex installer URL are embedded in `app.asar`.
- Desktop version: `0.0.33-nightly.20260819.1`.
- Bundled server version: `t3 v0.0.33-nightly.20260819.1`.
- T3 Connect public-config code and registered `t3code`/`t3code-dev` protocols are present.

## Issues found and corrected by the real build

- Added required FPM homepage and maintainer metadata.
- Replaced electron-builder's obsolete `http-parser` dependency with current Arch runtime packages.
- Changed the artifact name from `.pacman` to the standard `.pkg.tar.zst` form.
- Propagated the artifact version into the web/server build so all packaged surfaces agree.

## Requirement result

`PKG-01..03`, `FORK-01..03`, and `CDX-01..03` pass. Installation and interactive flows remain assigned to Phases 2–4.
