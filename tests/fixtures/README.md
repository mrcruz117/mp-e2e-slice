# Vendored oracle

Feed XML fixtures copied verbatim from
[kurtmckee/feedparser](https://github.com/kurtmckee/feedparser) at commit
`06b8f292e66676aaab0e9824ba65e2469616e600`, together with `expectations.json` derived from them.
feedparser is BSD-licensed; its licence is next to this file as `LICENSE`, and
the fixtures remain the work of the feedparser contributors.

**This directory is read-only.** It grades the code in this repository, so
nothing in this repository may edit it. Two checks enforce that: `oracle-guard`
(hosted in a separate repository, fails any pull request touching this path) and
`oracle-upstream` (re-downloads the corpus at the pinned commit and diffs).

Only the fixtures whose `Expect:` comment falls inside a mechanically
transcribable subset are vendored — one comparison against one top-level field of
`feed` or `entries[0]`. `expectations.json` is generated from those comments
by `node scripts/oracle.ts derive` and re-derived on every test run, so it
cannot drift from the fixtures. Field names in it are feedparser's, untranslated.

See `docs/adr/0002-oracle-vendored-from-feedparser-and-externally-guarded.md`.
