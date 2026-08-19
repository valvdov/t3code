# T3 Code Arch Desktop Nightly Fork

## What This Is

Personal Arch Linux desktop distribution of T3 Code built from upstream nightly with the existing Antigravity fork. It installs as a native pacman package, connects through T3 Connect, updates itself from GitHub Releases without a terminal, and updates the standalone Codex CLI from the provider card.

## Core Value

The primary Arch computer always has a working, current T3 Code desktop app with Antigravity, and routine updates require only clicks inside T3.

## Config

- **Mode:** yolo
- **Depth:** quality
- **Existing patterns to respect:** T3's typed contracts and Effect services, existing desktop updater state machine, existing provider-maintenance receipts, the 17-patch fork workflow, performance and multi-surface rules in `AGENTS.md`

## Requirements

### Validated

- [x] The existing fork adds the Antigravity provider and account usage UI.
- [x] The existing fork patches apply to upstream nightly `4347f14b` and pass their focused tests.

### Active

- [ ] Build an x86_64 native Arch package from upstream nightly plus the fork.
- [ ] Publish fork nightly releases from a public GitHub repository.
- [ ] Let the packaged desktop app download and install its pacman update through the existing Settings UI and a polkit prompt.
- [ ] Update standalone Codex from its provider card with OpenAI's official installer in non-interactive mode.
- [ ] Include the public T3 Connect configuration in every desktop build.
- [ ] Install and verify the first build on `valvdov@10.0.0.2`.

### Out of Scope

- AUR publication — GitHub Releases is enough for one personal machine.
- AppImage, Flatpak, Snap, Debian, RPM, ARM64, macOS, and Windows fork artifacts — this milestone targets the Arch x86_64 primary computer.
- Permanent root privileges or a privileged background daemon — package installation must use an on-demand polkit prompt.
- Automatic conflict resolution when upstream changes overlap fork patches — CI should fail clearly and preserve the last good release.
- Automatic installation of Antigravity CLI credentials — existing local Antigravity configuration is reused or configured separately.

## Context

- Target machine: Arch Linux x86_64, kernel `7.1.5-zen1-2-zen`, user `valvdov`, SSH `10.0.0.2`.
- Target has `pacman`, `sudo`, and `pkexec`; T3 is not installed yet.
- `electron-builder` supports the `pacman` target and writes a package-type marker.
- Installed `electron-updater` contains `PacmanUpdater`, which downloads `.pacman` releases and invokes `pacman -U` through `pkexec` for non-root users.
- T3 currently disables Linux updates unless `APPIMAGE` is present; this guard must recognize a packaged pacman build.
- Official Codex documentation recommends `curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh` for unattended updates.
- Public repositories can use standard GitHub-hosted Actions runners without billed minutes; release retention will be limited to avoid unnecessary storage.

## Constraints

- **Security:** downloaded desktop packages must come from the configured GitHub release feed and retain electron-updater checksum validation; elevation occurs only during installation.
- **Reliability:** a failed build or update must leave the currently installed desktop app usable.
- **Compatibility:** desktop version and bundled server version must match the upstream nightly version exactly.
- **Connectivity:** GitHub release updates and T3 Connect must work away from the home LAN.
- **Usability:** normal desktop and Codex updates require no terminal commands after the first installation.
- **Maintenance:** fork changes remain small, marked, tested, and reproducible from the upstream base plus fork commits/patches.

## Key Decisions

| Decision                                                       | Rationale                                                             | Outcome   |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| Native pacman package                                          | Best Arch integration and accepted by the user                        | — Pending |
| Public GitHub repository and Releases                          | Global availability and free standard Actions for public repositories | — Pending |
| Reuse electron-updater `PacmanUpdater`                         | Smaller and safer than creating a custom privileged updater           | — Pending |
| Use on-demand polkit elevation                                 | Avoids permanent root access while keeping updates terminal-free      | — Pending |
| Use OpenAI standalone installer with `CODEX_NON_INTERACTIVE=1` | Matches the requested installer and avoids UI-blocking prompts        | — Pending |
| Track the nightly channel only                                 | The fork is intentionally based on current upstream nightly           | — Pending |

---

_Last updated: 2026-08-19 after Phase 1 research_
