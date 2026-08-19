# Requirements: T3 Code Arch Desktop Nightly Fork

**Defined:** 2026-08-19
**Core Value:** The primary Arch computer always has a working, current T3 Code desktop app with Antigravity, and routine updates require only clicks inside T3.

## v1 Requirements

### Packaging

- [x] **PKG-01**: Maintainer can build an x86_64 pacman-installable T3 Code desktop artifact.
- [x] **PKG-02**: The package installs an application launcher, icons, URL protocol handlers, and the bundled T3 server.
- [x] **PKG-03**: Desktop and bundled server report the same upstream nightly version.

### Fork

- [x] **FORK-01**: The desktop build includes the Antigravity provider and its settings UI.
- [x] **FORK-02**: The desktop build includes provider rate-limit and context-window usage UI.
- [x] **FORK-03**: Applying fork changes to an incompatible upstream fails before publishing or installing anything.

### Desktop Updates

- [ ] **UPD-01**: The app checks the fork's GitHub Releases nightly feed from the existing update UI.
- [ ] **UPD-02**: The app downloads a pacman artifact and validates updater metadata/checksum before offering installation.
- [ ] **UPD-03**: Clicking install shows a polkit authorization dialog and runs the pacman upgrade without opening a terminal.
- [ ] **UPD-04**: A cancelled or failed update leaves the previous installation operational and reports the failure in the UI.
- [ ] **UPD-05**: The app restarts into the newly installed version after a successful update.

### Codex CLI

- [x] **CDX-01**: A Codex binary installed at the standalone installer path is recognized as one-click updatable.
- [x] **CDX-02**: Clicking Codex `Update now` runs OpenAI's official installer with `CODEX_NON_INTERACTIVE=1`.
- [x] **CDX-03**: T3 refreshes the provider snapshot and displays the resulting Codex version or a useful failure message.

### T3 Connect

- [ ] **CON-01**: Release builds contain the required public relay, Clerk, and OAuth configuration.
- [ ] **CON-02**: The desktop user can sign in to T3 Connect and expose/connect the primary environment.
- [ ] **CON-03**: OAuth callbacks open the installed Arch desktop application through the registered URL scheme.

### Release Automation

- [ ] **REL-01**: A public GitHub workflow builds the fork's pacman artifact on the nightly channel.
- [ ] **REL-02**: A successful workflow publishes the package and updater metadata to a GitHub prerelease.
- [ ] **REL-03**: The workflow supports manual dispatch and scheduled upstream checks.
- [ ] **REL-04**: Duplicate upstream nightlies do not create duplicate releases.
- [ ] **REL-05**: Release retention keeps a small number of recent fork nightlies while preserving the current working release.

### Installation and Verification

- [ ] **VER-01**: The initial package is installed on `valvdov@10.0.0.2`.
- [ ] **VER-02**: T3 launches from the desktop application menu on Arch.
- [ ] **VER-03**: Antigravity, Codex update, desktop update, and T3 Connect flows are verified on the target machine.

## v2 Requirements

### Distribution

- **DIST-01**: Publish an AUR package that follows the GitHub nightly channel.
- **DIST-02**: Support additional Linux package formats and architectures.
- **DIST-03**: Sign Arch packages with a dedicated package-signing key in addition to updater metadata checks.

## Out of Scope

| Feature                                | Reason                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Private release repository             | Adds authentication complexity to electron-updater; the fork may be public |
| Background root service                | Unnecessary privilege and maintenance burden                               |
| Local source compilation during update | Slow and fragile on the primary workstation                                |
| Silent privileged installation         | The user explicitly accepted a polkit prompt                               |

## Traceability

| Requirement                            | Phase   | Status   |
| -------------------------------------- | ------- | -------- |
| PKG-01, PKG-02, PKG-03                 | Phase 1 | Complete |
| FORK-01, FORK-02, FORK-03              | Phase 1 | Complete |
| CDX-01, CDX-02, CDX-03                 | Phase 1 | Complete |
| UPD-01, UPD-02, UPD-03, UPD-04, UPD-05 | Phase 2 | Pending  |
| CON-01, CON-02, CON-03                 | Phase 2 | Pending  |
| REL-01, REL-02, REL-03, REL-04, REL-05 | Phase 3 | Pending  |
| VER-01, VER-02, VER-03                 | Phase 4 | Pending  |

**Coverage:**

- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---

_Requirements defined: 2026-08-19_
_Last updated: 2026-08-19 after Phase 1 research_
