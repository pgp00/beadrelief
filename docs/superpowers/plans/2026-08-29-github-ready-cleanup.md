# GitHub-ready cleanup implementation plan

**Goal:** Make the current launch branch a small, honest, reproducible public GitHub repository without requiring physical-print evidence.

**Constraints:** Work only in the isolated launch worktree. Do not install software, launch GUI applications, add dependencies, publish remotely, or modify the main worktree's uncommitted files.

## Task 1: Remove private process and unused presentation files

- Delete tracked `.superpowers/` reports.
- Delete `docs/superpowers/` plans and specifications after this plan is committed.
- Delete the internal release copy deck.
- Delete the unused blank/cartoon/realistic screenshots and source images.
- Confirm no remaining tracked file references a deleted path.

## Task 2: Make public documentation upload-ready

- Remove the physical-photo release-gate comments from both READMEs.
- Replace the blocking P2S release language with a short honest status: automated 3MF checks pass; physical printing remains unverified.
- Reduce the Bambu compatibility record to current, useful evidence and one clearly labeled historical slice result.
- Keep the heart PNG, editable project, and 3MF links as the primary reproducible example.

## Task 3: Verify the repository boundary

- Run `npm run verify`.
- Run ZIP integrity checks for every tracked 3MF.
- Regenerate samples twice and compare hashes for determinism.
- Check README links and search for deleted paths, release-gate markers, secrets, generated files, and tracked internal artifacts.
- Confirm the main worktree's pre-existing uncommitted changes remain untouched.
