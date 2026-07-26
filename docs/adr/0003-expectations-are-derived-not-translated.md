# The expectations file is derived by a check, not translated by hand

ADR-0002 has the fixtures' `Expect:` comments translated once, by hand, and names
the risk it accepts: "a translation error weakens the oracle silently". Whoever
does that translation decides how hard the oracle is to satisfy, which is the
thing the oracle exists to take away from them.

Isolating the translator does not help. The risk is not that an agent remembers
writing the answer key; it is that the key it wrote persists in the repository and
grades everything afterwards.

So the translation is mechanical instead. `scripts/oracle.ts` transcribes each
fixture's `Expect:` comment into `tests/fixtures/expectations.json`, and both the
unit suite and CI re-derive that file and fail on any difference. The expectations
file is generated, not authored; a hand edit that weakened one is a failing check
rather than a silent loss.

`expectations.json` therefore lives _inside_ `tests/fixtures/`, under the same two
guards as the XML: it is part of the answer key, not part of the code being
graded.

## Consequences

The transcriber accepts only a narrow subset of Python: one comparison, against
one top-level field of `feed` or `entries[0]`, with a string or integer-tuple
literal that no escape sequence can make ambiguous. Anything else — nested
targets, multi-clause conjunctions, chained comparisons — is refused, and a
refused fixture is not vendored at all. 74 of the 434 wellformed RSS 2.0 and
Atom 1.0 fixtures qualify.

That is the trade: the oracle covers fewer fixtures than a human translator could
have, and in exchange nothing in it was decided by whoever is being graded. The
subset boundary is itself checked — `oracle-upstream` recomputes the selection
from upstream and fails if the set of qualifying fixtures has changed, so a
fixture cannot quietly drop out of the corpus.

Field names in the expectations file are feedparser's (`guid`, `id`, `published`,
`updated`, `published_parsed`), untranslated. Mapping them onto the reader's own
vocabulary is the implementing ticket's job, done in its specs where it can be
read, rather than baked into the answer key.
