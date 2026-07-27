# The per-Feed timeout is a promise race, not `AbortSignal.timeout()`

Story 33 caps a Feed fetch at 10 seconds. The obvious implementation is
`fetch(url, { signal: AbortSignal.timeout(10_000) })` at the HTTP call, and it is
the wrong one here.

The timeout belongs to the fetch seam's caller, not to the seam. Only `refresh()`
knows that a Feed which never answers must cost one Feed and nothing else, and
the seam is deliberately not HTTP-shaped — it is a `(url) => Promise<FetchedFeed>`
that tests satisfy with a local stub. A timeout inside the production HTTP
implementation would leave every stub able to hang the app forever, which is
precisely the failure the story is about.

So `refresh()` races the seam's promise against a `setTimeout`, and the losing
timer is cleared.

## Consequences

The race is what makes the story testable. `tests/refresh-resilience.test.ts`
hands the seam a promise that never settles and advances Vitest's fake timers;
fake timers replace `setTimeout` and therefore drive the race, while
`AbortSignal.timeout()` is not fake-timer driven and would hang that spec
forever — a deadlock rather than a failure, which is the worst shape a test can
have.

The cost is that a timed-out fetch is abandoned, not cancelled: the underlying
HTTP request keeps running until Node's own socket handling ends it, and its
result is discarded. For a handful of Feeds polled on an interval that is cheap.
If the Feed count ever grows enough for abandoned sockets to matter, the fix is
an `AbortController` owned by `refresh()` and passed to the seam — the race
stays, and the abort becomes an optimisation on top of it.
