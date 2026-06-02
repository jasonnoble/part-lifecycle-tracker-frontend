# Decisions (A vs B)

## 2026-06-02 — Frontend per-PR diff-coverage gate tool (JAS-65)

**Decision: `diff-cover` (Python CLI), run as a step in the existing CI job.**

We need a per-PR gate that fails when the *lines changed in a PR* aren't
covered (the diff-coverage half of the backend's `undercover`; the global
floor lives in `vite.config.ts` from JAS-64). JS has no single drop-in
`undercover` equivalent, so the choice was:

- **A — `diff-cover` CLI** *(chosen)*: consumes the `lcov.info` Vitest already
  emits plus the git diff vs the base branch, and fails under `--fail-under`.
  Mature, language-agnostic, no third-party Action to trust/version, and it's
  the same tool/command a developer can run locally (`npm run coverage:diff`).
  Cost: a Python toolchain in CI (trivial — `actions/setup-python` + `pip`).
- **B — a purpose-built GitHub Action**: JS-native, posts a PR comment and a
  status check. Rejected: ties the gate's behavior to a third-party Action's
  versioning/maintenance, and isn't runnable locally with the same command.

**Threshold:** changed-line coverage must be ≥ **90%** (`--fail-under=90`).
Stricter than the global floor (80% in `vite.config.ts`) because it only judges
new/changed code. Tune as the suite matures.
