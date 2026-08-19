# Verification: Phase 2 — In-App Updates and Connect

**Verified:** 2026-08-19
**Result:** implementation passed; interactive account acceptance remains in Phase 4

## Pacman updater chain

- Packaged Linux eligibility now accepts AppImage or `resources/package-type=pacman`; deb, rpm, missing, and unknown markers remain disabled.
- Focused desktop updater suites pass 20/20, including a cancelled native authorization event that resets quitting state, retains the downloaded update, and exposes retry.
- The rebuilt package contains `package-type=pacman` and the new eligibility code.
- `resources/app-update.yml` targets `valvdov/t3code`, prerelease channel `nightly`.
- `nightly-linux.yml` points to the exact `.pkg.tar.zst`; its independently recalculated SHA-512 matches metadata.
- Final Phase 2 package SHA-256: `6aef13176a7599128a5a21aced9ed0ad6d8faff07879301258c1fb3286b0e99d`.

## Privilege and failure behavior

The pinned `electron-updater` Linux implementation was inspected locally:

- `package-type=pacman` selects `PacmanUpdater`.
- Download requires checksum metadata and validates SHA-512 while streaming.
- Install chooses `pkexec` when available and executes `/bin/bash -c 'pacman -U --noconfirm <download>'`.
- Successful forced install calls Electron relaunch; an updater error resets T3's quitting/install state and leaves retry available.

No passwordless sudo rule or privileged service was added.

## T3 Connect and OAuth

- Running packaged `t3 connect --help` exposes login, link, publish, status, unlink, and logout subcommands, proving build-time Connect config is present.
- The packaged desktop entry contains `%U` plus `x-scheme-handler/t3code` and `x-scheme-handler/t3code-dev`.
- GitHub Actions must receive `T3CODE_RELAY_URL`, `T3CODE_CLERK_PUBLISHABLE_KEY`, and `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID` as public build variables.

## Deferred acceptance

A real GitHub release and a second version are required to exercise download/install/relaunch end to end. Interactive Clerk sign-in also requires the user's browser session. Both are scheduled after Phase 3 publishing in Phase 4.
