# GitHub-ready repository cleanup design

Date: 2026-08-29
Status: Approved

## Goal

Prepare Pingdou for a public GitHub upload without waiting for a physical print or product photograph.

## Keep

- Application source, tests, build scripts, lockfile, license, upstream attribution, contribution guide, and GitHub Pages workflow.
- The heart source PNG, editable project JSON, and grouped 3MF as the primary reproducible example.
- The solid and layered 3MF fixtures used by automated tests.
- A short, factual Bambu Studio compatibility record that separates verified behavior from unverified physical printing.

## Remove

- Internal Superpowers plans, specifications, task reports, and review artifacts.
- Old screenshots and source images that are not referenced by the application or public README.
- The internal release copy deck and checklist.
- README comments and wording that make a physical print, photograph, or sub-30-minute measurement a prerequisite for publishing the repository.

Ignored dependencies, build output, logs, editor files, and local worktrees remain untracked; no installed software or user application data is touched.

## Public documentation

The English and Chinese READMEs lead with the browser-local image-to-editable-3MF promise, live demo, and downloadable heart sample. They state that physical printing has not yet been verified without presenting that missing evidence as a release gate.

The compatibility record retains useful observed Bambu Studio results and current automated archive verification, while removing obsolete hashes, internal controller notes, and requested future evidence filenames.

## Acceptance

- `git status` contains only intentional public-repository changes.
- Every tracked file has a public purpose.
- README links resolve to tracked files.
- `npm run verify` passes.
- All tracked 3MF files pass ZIP integrity checks and regenerate deterministically.
- No physical-print or photograph requirement blocks GitHub upload.
- The main worktree's existing uncommitted changes are untouched.
