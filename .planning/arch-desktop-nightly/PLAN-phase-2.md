# Plan: Phase 2 — In-App Updates and Connect

**Generated:** 2026-08-19
**Source CONTEXT:** CONTEXT-phase-2.md
**Total plans:** 3

## Plan 2-01: Pacman Update Eligibility

**Goal:** Enable the existing updater only when packaged Linux is an AppImage or native pacman build.

**Files affected:**

- `apps/desktop/src/updates/DesktopUpdates.ts`
- `apps/desktop/src/updates/DesktopUpdates.test.ts`

**Steps:**

1. Read `resources/package-type` once when the desktop updater service starts.
2. Allow `package-type=pacman` through the Linux support gate while preserving AppImage support.
3. Keep missing, deb, rpm, and unknown package types disabled with an accurate user-facing reason.
4. Cover the eligibility matrix with focused tests.

## Plan 2-02: Pacman Install Safety Proof

**Goal:** Prove the package and updater agree on feed, checksum, privilege flow, and failure behavior.

**Files affected:**

- Existing updater tests and Phase 2 verification artifacts
- Production code only if the real package exposes a mismatch

**Steps:**

1. Rebuild the Arch package with the eligibility change.
2. Inspect `package-type`, `app-update.yml`, and `nightly-linux.yml` as one consistent updater chain.
3. Verify the installed electron-updater implementation selects `PacmanUpdater`, validates metadata, and uses `pkexec` with `pacman -U --noconfirm`.
4. Run focused install-failure/reset tests so a cancelled polkit prompt cannot strand the app in quitting state.

## Plan 2-03: Packaged T3 Connect Proof

**Goal:** Prove release builds retain public Connect configuration and OAuth return paths.

**Files affected:**

- Phase 2 verification artifacts
- Phase 3 workflow inputs later

**Steps:**

1. Inspect or execute the packaged server CLI to prove `connect` is enabled rather than replaced by the hidden unavailable command.
2. Confirm the packaged desktop entry registers `t3code://` and `t3code-dev://` handlers.
3. Record the required public environment variable names for GitHub Actions without recording values.
4. Defer interactive account sign-in and remote exposure to target-machine verification.

## Coverage

| Requirement            | Plan                             |
| ---------------------- | -------------------------------- |
| UPD-01, UPD-02         | 2-01, 2-02                       |
| UPD-03, UPD-04, UPD-05 | 2-02                             |
| CON-01, CON-03         | 2-03                             |
| CON-02                 | Phase 4 interactive verification |
