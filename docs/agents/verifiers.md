# Verifiers

The commands that decide whether a change is done. Do not invent others, and do
not weaken or skip one to get a green result.

| Check       | Command                | What it proves                       |
| ----------- | ---------------------- | ------------------------------------ |
| Types       | `npm run typecheck`    | `tsc --noEmit` is clean              |
| Lint        | `npm run lint`         | typescript-eslint, type-aware rules  |
| Format      | `npm run format:check` | Prettier reports no drift            |
| Unit        | `npm test`             | Vitest, including parser fixtures    |
| End-to-end  | `npm run test:e2e`     | Playwright against the built app     |
| Image       | `docker build .`       | The production image still builds    |
| Oracle      | CI job `oracle-guard`  | Fixtures match upstream and untouched |

All seven are required status checks on `main`.

## Failure policy

When a verifier fails: fix the code and run it again. If it fails a second time,
**stop**. Leave the branch and the PR in place and report which check failed,
with its output.

No third attempt. Never delete, skip, weaken, or rewrite a test to make it pass.
If you believe a test is wrong, say so and stop — do not change it.

## Pull requests

One branch per ticket. When the work is done and the verifiers are green, open a
PR whose body contains `Closes #N` for the ticket it implements. Do not merge —
a human merges, and the merge closes the issue.

## The oracle

`tests/fixtures/**` is vendored from feedparser and is not yours to edit. CI
diffs it against pinned upstream and fails any PR that touches it. See
`docs/adr/0002-oracle-vendored-from-feedparser-and-externally-guarded.md`.
