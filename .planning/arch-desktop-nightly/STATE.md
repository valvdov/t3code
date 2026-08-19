# Project State

## Project Reference

See: PROJECT.md (updated 2026-08-19)

**Core value:** The primary Arch computer always has a working, current T3 Code desktop app with Antigravity, and routine updates require only clicks inside T3.
**Current focus:** Phase 3 — GitHub Nightly Pipeline

## Current Position

Phase: 3 of 4 (GitHub Nightly Pipeline)
Plan: 2 of 3 in current phase
Status: In progress — workflow implemented; GitHub repository bootstrap pending
Last activity: 2026-08-19 — Added safe upstream rebase, focused verification, native Arch prerelease, and five-release retention workflow.

Progress: [██████░░░░] 60%

## Accumulated Context

### Recent decisions affecting current work

- [Phase 1]: Work in yolo mode with quality depth.
- [Phase 1]: Ship a native x86_64 pacman package rather than AppImage.
- [Phase 1]: Use a public GitHub repository and Releases for the nightly feed.
- [Phase 1]: Reuse electron-updater's built-in `PacmanUpdater` with on-demand polkit elevation.
- [Phase 1]: Use OpenAI's standalone Codex installer with non-interactive mode.
- [Phase 1]: Detect standalone installs only at `~/.local/bin/codex`; preserve npm and Homebrew update behavior everywhere else.
- [Phase 1]: Name the native Arch package `t3-code-nightly` and publish it on the `nightly` prerelease channel.
- [Phase 1]: Replace electron-builder's obsolete pacman dependency defaults with current Arch runtime packages.
- [Phase 1]: Stamp desktop, web, and bundled server with the same nightly artifact version.
- [Phase 2]: Reuse `electron-updater` PacmanUpdater and the existing desktop update state machine; do not add a privileged background service.
- [Phase 2]: Keep unsupported Linux package types disabled and preserve AppImage behavior.
- [Phase 2]: Use the public GitHub feed metadata as the single checksum source; no separate privileged updater service.
- [Phase 2]: Defer interactive Connect sign-in and controlled newer-version installation to Phase 4.
- [Phase 3]: Run daily at 03:17 UTC and on manual dispatch using `ubuntu-24.04` public runners.
- [Phase 3]: Retain five fork nightly prereleases.

### Pending todos

- Select or create the public GitHub repository before Phase 3.
- Configure public T3 Connect values for GitHub Actions without committing the local `.env`.
- Decide the exact nightly retention count during Phase 3 discussion.

### Open questions

- None blocking Phase 1.

---

_Last updated: 2026-08-19_
