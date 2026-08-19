# Plan: Phase 3 — GitHub Nightly Pipeline

**Generated:** 2026-08-19
**Source CONTEXT:** CONTEXT-phase-3.md
**Total plans:** 3

## Plan 3-01: Safe Upstream Sync

Create a public-runner workflow that fetches upstream, rebases the fork patch stack, skips duplicate scheduled nightlies, and publishes nothing on conflict.

## Plan 3-02: Verified Arch Release

Require public Connect variables, run focused fork tests and type-aware lint, build the native package, inspect its marker/metadata, push with force-with-lease, and create a GitHub prerelease.

## Plan 3-03: Repository Bootstrap and Retention

Create `valvdov/t3code`, configure the three public repository variables, push `main`, manually dispatch the first build, and retain only the five newest fork nightlies.

## Completion gate

Plans 3-01 and 3-02 are local code. Plan 3-03 requires valid GitHub API authorization for repository creation and variable configuration; SSH authentication alone is insufficient.
