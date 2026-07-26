# Parser tests come from feedparser and are guarded from outside the repo

Nobody reviews the diffs here, so a test the implementing agent also wrote proves
nothing — it can be satisfied trivially or weakened until it passes. The parser's
acceptance tests are therefore vendored from `kurtmckee/feedparser`'s test corpus
(BSD, attribution retained): XML fixtures with their expected results, written by
a third party years ago and tuned to nobody's convenience.

Vendored fixtures alone are not enough, because an agent with write access can
edit whatever grades it. Two CI checks close that: one re-downloads the fixtures
from upstream at a pinned commit and diffs them against the vendored copy, and one
fails any PR touching `tests/fixtures/**`. The second lives in a separate
repository and is called by SHA, because a required status check that never
reports blocks the merge — so deleting the caller cannot disarm it.

## Consequences

Adding or changing a fixture is deliberately awkward: it means a commit to the
guard repo, not just to this one. Feedparser's `Expect:` assertions are Python
against its own dict API, so they are translated once, by hand, into a declarative
expectations file before any implementation work starts — a translation error
weakens the oracle silently, which is the main risk this design carries.
