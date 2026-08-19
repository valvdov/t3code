# Context: Phase 1 — Installable Fork Package

**Generated:** 2026-08-19 during discuss-phase
**Phase Goal:** Produce a pacman-installable desktop artifact that includes the fork and updates standalone Codex from the provider card.
**Requirements Covered:** PKG-01, PKG-02, PKG-03, FORK-01, FORK-02, FORK-03, CDX-01, CDX-02, CDX-03

## Implementation Decisions

### Arch Package Shape

**Decision:** Extend the existing `scripts/build-desktop-artifact.ts` flow with the electron-builder `pacman` target and an explicit root script such as `dist:desktop:pacman`; keep the application ID, executable, URL schemes, icons, bundled server, and release naming owned by the shared builder.
**Alternatives considered:** Create a handwritten PKGBUILD around an unpacked Electron bundle; ship AppImage; maintain a separate packaging repository.
**Rationale:** The shared builder already stages every native dependency and resource correctly. The electron-builder pacman target produces a native package and a package-type marker consumed by `electron-updater`.
**Implications:** Package-specific dependencies and compression live in the existing generated build config. No second application layout is introduced.

### Version Identity

**Decision:** Stamp the desktop, bundled server, web client, artifact, and release metadata with the exact official upstream nightly version, while recording fork provenance separately.
**Alternatives considered:** Add `-agy` or `-fork` to the SemVer version.
**Rationale:** T3 clients compare version strings exactly; a fork suffix causes false version-drift warnings.
**Implications:** Release notes and build metadata, not the version string, distinguish the fork.

### Fork Integration

**Decision:** Build from the existing fork commit series on top of upstream nightly and keep fork-specific changes small, marked with `Fork-added`, and covered by focused tests.
**Alternatives considered:** Copy only Antigravity files into an otherwise clean checkout during build; maintain a permanent divergent branch without patch reproducibility.
**Rationale:** The current commit/patch workflow is already exercised on the server and fails safely on upstream conflicts.
**Implications:** An incompatible upstream stops before packaging. Conflict repair remains a deliberate maintainer action.

### Codex Standalone Update

**Decision:** Add a native maintenance strategy to `CodexDriver` for standalone paths such as `~/.local/bin/codex`. It executes `/bin/sh -c 'curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh'` through the existing provider-maintenance runner.
**Alternatives considered:** Continue `npm install -g`; download and replace the binary ourselves; run the interactive installer unchanged.
**Rationale:** This is OpenAI's supported standalone installer, the user explicitly requested it, and non-interactive mode prevents the T3 action from hanging on prompts.
**Implications:** npm, pnpm, bun, and Homebrew installations retain their existing manager-specific update behavior. Only a recognized standalone path uses the installer.

### Command Execution and Reporting

**Decision:** Reuse the typed provider-maintenance action, lock, timeout, bounded output capture, receipts, provider refresh, and existing `Update now` UI.
**Alternatives considered:** Add a desktop IPC endpoint or renderer-side shell invocation.
**Rationale:** Provider maintenance belongs to the environment that owns the CLI and already works for local, remote, and desktop-hosted servers.
**Implications:** No new UI contract is needed. Tests must assert executable, arguments, lock key, and path detection.

### Privilege Boundary

**Decision:** Phase 1 packaging and Codex updating run entirely as the desktop user. Desktop package elevation is deferred to Phase 2 and will use the updater's on-demand `pkexec` path.
**Alternatives considered:** Install a setuid helper or background root daemon with the package.
**Rationale:** Neither building the package nor installing Codex into the user's home requires root privileges.
**Implications:** The package does not gain permanent elevated access.

### Verification Boundary

**Decision:** Phase 1 verification consists of focused provider-maintenance tests, fork tests affected by current upstream, build-script tests, desktop/server typechecks scoped to changed packages, and a real pacman artifact build. Installation and UI-driven update verification occur in later phases.
**Alternatives considered:** Treat compilation as sufficient; run the full monorepo suite.
**Rationale:** This follows repository guidance and proves the smallest relevant surface without expensive unrelated checks.
**Implications:** Browser/computer-use verification is not needed in Phase 1.

## Open Questions

- GitHub API authentication for `gh` is expired. GitHub SSH authentication works as `valvdov`, so this does not block Phase 1; refresh `gh` before Phase 3 repository/release setup.
- Final public repository name and release retention count are deferred to Phase 3 discussion.

## Pointers

Decisions added to PROJECT.md Key Decisions table: native pacman package, exact nightly versioning, built-in updater reuse, on-demand elevation, official non-interactive Codex installer.

---

_Captured: 2026-08-19_
