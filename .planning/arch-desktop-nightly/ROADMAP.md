# Roadmap: T3 Code Arch Desktop Nightly Fork

## Overview

First prove that the existing fork can produce a native Arch desktop package with the requested Codex updater. Then enable safe in-app package updates and T3 Connect, automate public nightly releases, and finally install and verify the complete flow on the target computer.

## Phases

- [ ] **Phase 1: Installable Fork Package** - Produce a native Arch package containing Antigravity and the official Codex updater action.
- [ ] **Phase 2: In-App Updates and Connect** - Make the installed package update through polkit and verify T3 Connect configuration.
- [ ] **Phase 3: GitHub Nightly Pipeline** - Publish reproducible fork nightlies and updater metadata from a public repository.
- [ ] **Phase 4: Target-Machine Rollout** - Install and verify the full user flow on the Arch computer.

## Phase Details

### Phase 1: Installable Fork Package

**Goal**: Produce a pacman-installable desktop artifact that includes the fork and updates standalone Codex from the provider card.
**Depends on**: Nothing
**Requirements**: PKG-01, PKG-02, PKG-03, FORK-01, FORK-02, FORK-03, CDX-01, CDX-02, CDX-03
**Success Criteria**:

1. A focused build command produces an x86_64 pacman artifact with matching desktop/server nightly versions.
2. Focused fork and provider-maintenance tests pass against the chosen upstream base.
3. The Codex card advertises and executes the standalone non-interactive installer for a standalone Codex path.
   **Plans**: 3 plans — standalone Codex updater, native pacman target, real Linux artifact proof

### Phase 2: In-App Updates and Connect

**Goal**: The installed Arch app can update itself safely and use T3 Connect.
**Depends on**: Phase 1
**Requirements**: UPD-01, UPD-02, UPD-03, UPD-04, UPD-05, CON-01, CON-02, CON-03
**Success Criteria**:

1. A packaged pacman build enables the existing updater while unpackaged Linux and unsupported package formats remain disabled.
2. Download and installation use GitHub updater metadata, checksum validation, a polkit prompt, and `pacman -U`.
3. T3 Connect sign-in and OAuth callback configuration are present in the package.
   **Plans**: TBD

### Phase 3: GitHub Nightly Pipeline

**Goal**: A public GitHub repository continuously produces installable fork nightlies.
**Depends on**: Phase 1, Phase 2
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria**:

1. Manual dispatch builds and publishes the pacman artifact plus nightly updater metadata.
2. Scheduled runs publish only when a new upstream nightly is available.
3. Patch, test, or build failures publish nothing and leave the prior release intact.
4. Old fork nightlies are pruned according to a documented retention rule.
   **Plans**: TBD

### Phase 4: Target-Machine Rollout

**Goal**: The Arch primary computer runs the fork and receives future updates without console work.
**Depends on**: Phase 3
**Requirements**: VER-01, VER-02, VER-03
**Success Criteria**:

1. The initial package installs on `10.0.0.2` and launches from the application menu.
2. Antigravity is available and can start a turn.
3. Codex CLI update completes from the provider card.
4. A controlled newer fork release downloads and installs through the desktop update UI.
5. T3 Connect signs in and exposes the primary environment.
   **Plans**: TBD

---

_Roadmap created: 2026-08-19_
_Last updated: 2026-08-19_
