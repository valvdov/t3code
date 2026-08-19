# Plan: Phase 1 — Installable Fork Package

**Generated:** 2026-08-19 during plan-phase
**Source CONTEXT:** CONTEXT-phase-1.md
**Total plans:** 3

## Plan 1-01: Standalone Codex Updater

**Goal:** Make the existing Codex provider-card action update standalone Codex with OpenAI's official non-interactive installer.

**Dependencies:** none

**Files affected:**

- `apps/server/src/provider/Drivers/CodexDriver.ts`
- `apps/server/src/provider/providerMaintenance.test.ts` or a focused Codex driver test
- `FORK.md`

**Steps:**

1. Add a narrowly scoped standalone-Codex path predicate covering the official Unix installer location without claiming npm, bun, pnpm, or Homebrew installations.
2. Configure Codex's native maintenance action to execute `/bin/sh -c` with the official installer pipeline and `CODEX_NON_INTERACTIVE=1`.
3. Add tests for standalone-path selection, command arguments, lock key, and preservation of existing package-manager strategies.
4. Document the fork-specific Codex update behavior and its user-home installation scope.

**Done when:**

- A Codex binary resolved below the official standalone path exposes the installer command through the existing provider snapshot.
- Other recognized installation methods keep their current updater.
- Focused provider-maintenance tests pass.

**Risks:**

- Shell quoting could change the requested pipeline — assert the exact `sh -c` argument in tests.
- A broad path matcher could hijack unrelated Codex installations — match only documented standalone locations.

## Plan 1-02: Native Pacman Desktop Target

**Goal:** Add a first-class x86_64 Arch packaging command without creating a second desktop build system.

**Dependencies:** none

**Files affected:**

- `package.json`
- `scripts/build-desktop-artifact.ts`
- `scripts/build-desktop-artifact.test.ts`
- `FORK.md`

**Steps:**

1. Add an explicit `dist:desktop:pacman` command using platform `linux`, target `pacman`, and architecture `x64`.
2. Extend generated Linux build configuration with pacman package metadata, dependencies, and deterministic compression while retaining shared icons, protocols, executable name, resources, and publish feed.
3. Add build-config tests proving the pacman target, package identity, update metadata eligibility, and unchanged AppImage configuration.
4. Document the local build command, expected artifact, required build dependencies, and exact nightly version stamping.

**Done when:**

- The root command resolves to the existing artifact builder with `--target pacman --arch x64`.
- Generated config produces a pacman package with T3 desktop integration and the standard GitHub update feed metadata.
- Focused build-script tests pass.

**Risks:**

- electron-builder's default Arch dependency list may contain obsolete package names — inspect the generated package and adjust only when the target machine proves a mismatch.
- FPM tooling may be absent locally — build on the Arch target or supported Linux CI and report the exact missing dependency.

## Plan 1-03: Reproducible Fork Artifact Proof

**Goal:** Produce and inspect a real pacman artifact from the current nightly fork before enabling installation or release automation.

**Dependencies:** 1-01, 1-02

**Files affected:**

- No additional production files expected
- `.planning/arch-desktop-nightly/STATE.md`
- Build output under the configured release directory (gitignored)

**Steps:**

1. Run the focused Codex maintenance, build-script, Antigravity, and fork rate-limit tests.
2. Run scoped typechecks for the server, desktop, and directly affected contracts/shared packages.
3. Build the x86_64 pacman artifact with the exact current official nightly version and T3 Connect public configuration.
4. Inspect package metadata and contents for application launcher, icons, protocol handlers, bundled server, package-type marker, and matching versions.
5. Record artifact identity and verification evidence in project state; do not install it during Phase 1.

**Done when:**

- A pacman-installable artifact exists and package inspection proves all required resources are present.
- Desktop and bundled server versions match the selected nightly exactly.
- All focused tests and scoped typechecks pass.

**Risks:**

- Building on macOS cannot reliably produce an Arch FPM package — use `valvdov@10.0.0.2` as the Linux build host if cross-build tooling rejects the target.
- Current local branch may lag the latest upstream used on the server — establish and record one exact upstream SHA before the build.

## Coverage Check

| Success Criterion                                                                      | Plan(s)    |
| -------------------------------------------------------------------------------------- | ---------- |
| Build produces an x86_64 pacman artifact with matching desktop/server nightly versions | 1-02, 1-03 |
| Focused fork and provider-maintenance tests pass against the chosen upstream base      | 1-01, 1-03 |
| Codex card advertises and executes the standalone non-interactive installer            | 1-01       |
| Antigravity and usage UI remain included in the artifact                               | 1-03       |
| Incompatible fork changes fail before packaging                                        | 1-03       |

---

_Plan finalized: 2026-08-19_
