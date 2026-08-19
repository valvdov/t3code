# Context: Phase 3 — GitHub Nightly Pipeline

**Discussed:** 2026-08-19

## Decisions

- Public repository: `valvdov/t3code`; GitHub-hosted public runners keep the workflow free.
- Schedule once daily at 03:17 UTC plus manual dispatch.
- Preserve the fork as a linear patch stack on top of `pingdotgg/t3code` `main`.
- CI rebases onto the newest upstream before tests. Any conflict, test failure, config failure, or build failure stops before pushing or publishing.
- Scheduled runs skip when the current verified commit already has a fork nightly tag. Manual runs always produce a unique run-numbered nightly.
- Push the verified rebase with an exact `--force-with-lease`, then create a prerelease containing only the `.pkg.tar.zst` and `nightly-linux.yml` updater metadata.
- Retain the five newest fork nightly prereleases and their tags.
- Store the three public T3 Connect values as GitHub repository variables, not committed files or secrets.

## Current external state

- `git@github.com:valvdov/t3code.git` does not exist yet.
- GitHub SSH authentication works, but the local `gh` API token is invalid. SSH alone cannot create a repository or configure Actions variables.
- Workflow implementation and local validation can be completed before resolving that external bootstrap step.
