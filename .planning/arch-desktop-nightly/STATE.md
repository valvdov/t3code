# Project State

## Project Reference

See: PROJECT.md (updated 2026-08-19)

**Core value:** The primary Arch computer always has a working, current T3 Code desktop app with Antigravity, and routine updates require only clicks inside T3.
**Current focus:** Phase 1 — Installable Fork Package

## Current Position

Phase: 1 of 4 (Installable Fork Package)
Plan: 3 of 3 in current phase
Status: In progress — producing the Linux artifact proof
Last activity: 2026-08-19 — Implemented the standalone Codex updater and pacman target; 69 focused tests and targeted type-aware lint pass.

Progress: [█████░░░░░] 50%

## Accumulated Context

### Recent decisions affecting current work

- [Phase 1]: Work in yolo mode with quality depth.
- [Phase 1]: Ship a native x86_64 pacman package rather than AppImage.
- [Phase 1]: Use a public GitHub repository and Releases for the nightly feed.
- [Phase 1]: Reuse electron-updater's built-in `PacmanUpdater` with on-demand polkit elevation.
- [Phase 1]: Use OpenAI's standalone Codex installer with non-interactive mode.
- [Phase 1]: Detect standalone installs only at `~/.local/bin/codex`; preserve npm and Homebrew update behavior everywhere else.
- [Phase 1]: Name the native Arch package `t3-code-nightly` and publish it on the `nightly` prerelease channel.

### Pending todos

- Select or create the public GitHub repository before Phase 3.
- Configure public T3 Connect values for GitHub Actions without committing the local `.env`.
- Decide the exact nightly retention count during Phase 3 discussion.

### Open questions

- None blocking Phase 1.

---

_Last updated: 2026-08-19_
