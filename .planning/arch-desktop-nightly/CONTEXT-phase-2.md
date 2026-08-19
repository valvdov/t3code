# Context: Phase 2 — In-App Updates and Connect

**Discussed:** 2026-08-19

## Decisions

- Keep the existing desktop update UI/state machine; only widen the Linux eligibility gate for packaged `pacman` builds.
- Detect the package format from Electron Builder's `resources/package-type` marker. Missing or unsupported Linux package types remain disabled.
- Continue using `electron-updater`'s built-in `PacmanUpdater`, which downloads against `nightly-linux.yml`, validates the advertised SHA-512, and invokes `pkexec` + `pacman -U --noconfirm` during install.
- Keep cancellation/failure handling in the existing desktop update state machine so failed elevation or installation resets quitting state and leaves the installed package untouched.
- Treat T3 Connect relay, Clerk publishable key, and CLI OAuth client ID as public build configuration. They must enter the build environment but must not be committed as a `.env` file.
- Keep both `t3code` and `t3code-dev` URL protocol handlers in the Arch desktop entry so browser OAuth callbacks can return to the installed app.

## Evidence already available

- The real package contains `resources/package-type` with value `pacman` and `resources/app-update.yml` generated for `valvdov/t3code` nightly prereleases.
- `nightly-linux.yml` contains the exact `.pkg.tar.zst` path, size, and SHA-512.
- The package contains a desktop entry with the two T3 URL schemes.
- The server bundle was built from the local public T3 Connect configuration and exposes the connect implementation.

## Boundaries

- Publishing a GitHub release and exercising a true newer-version download belong to Phases 3–4.
- No background root service or passwordless sudo rule will be introduced.
- AppImage behavior must remain unchanged; deb/rpm/unknown Linux packages stay unsupported by the update UI.
