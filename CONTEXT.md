# Feed Reader

A single-user reader that fetches RSS and Atom feeds on a schedule and shows
their items in one list.

## Language

**Feed**:
One subscribed source, identified by the URL its XML is fetched from.
_Avoid_: Channel, Subscription, Source, Site

**Item**:
One post within a Feed. Carries a title, link, id, and published date.
_Avoid_: Entry, Post, Article, Story

**Item id**:
The value a Feed publishes to identify an Item across refetches — RSS `guid`,
Atom `id`. Distinct from the database primary key.
_Avoid_: guid, uid

**Fixture**:
A stored feed XML file paired with the parsed result it must produce. Vendored
from feedparser's test corpus and treated as read-only truth.
_Avoid_: Test case, sample, mock

**Read state**:
Whether the reader has opened an Item. Set by clicking through to the link, never
unset.
_Avoid_: Seen, viewed, opened

**Refresh**:
One pass fetching every configured Feed and inserting Items not already stored.
Runs at boot and on a timer.
_Avoid_: Sync, poll, update, crawl

## Gotchas

**Render's free tier has no persistent disk**:
The SQLite file lives on the container filesystem and is destroyed on every
restart, redeploy, and wake from spin-down. Items are refetched at boot, so only
read state is actually lost. Baking a `.db` file into the image seeds a starting
state; it does not persist anything.

**The service sleeps after 15 minutes idle**:
A wake takes roughly a minute, during which the boot Refresh runs before the first
response. The `setInterval` refresh only fires while the process happens to be
alive — correctness comes from the boot Refresh, not the timer.

**Feed dates arrive in several formats, some malformed**:
RFC 822, RFC 3339 and W3CDTF all appear in the wild, plus variants that parse in
no standard at all. An Item whose date cannot be parsed stores a null `published`
and sorts by `first_seen`.
