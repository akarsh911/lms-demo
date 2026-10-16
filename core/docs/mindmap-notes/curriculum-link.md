# Mind maps: the curriculum link

Written 2026-10-02. This is phase 5 of `docs/MINDMAP-INTEGRATION-PLAN.md`: one read-only route that
says which chapters of which books a curriculum node opens. It builds on `read-path.md`. The code
carries no comments; this file is where the reasoning lives.

## What was built

```
GET /curriculum-nodes/{id}/mindmaps
```

```
{"curriculum_node_id", "kind",
 "mindmaps": [{"content_item_id", "title", "placement_id", "inherited",
               "page_start", "page_end", "mindmap_state", "match_basis",
               "sections": [{"section_id", "display", "page_start", "page_end", "overlap_pages"}]}],
 "count"}
```

| Piece | Where |
|---|---|
| Handler, tier selection, page matching | `internal/transport/http/mindmap_curriculum.go` |
| Mount | one line in `mountCurriculum`, `internal/transport/http/server.go` |
| Chapter list with pages, cached | `Client.Sections`, `SectionsOf` in `internal/service/mindmap/` |

No table, no migration, no write. `curriculum.go`, `placement.go` and `resolve.go` are not edited;
the handler calls their existing helpers (`curriculumNodeLineage`, `placementsResolving`,
`readablePlacedItems`, `refuseUnboundedResolution`).

## The order of checks

1. Switched on, or 503.
2. `core.mindmaps.read`, in the route middleware.
3. No query parameters; an unknown one is a 400.
4. `core.content_placements.read`, or 403 naming it; then its field policy must permit the book,
   node, pages and status of a placement, or 403 naming the withheld fields.
5. `core.library.read`, or 403 naming it (the same explicit check the map routes make, for the same
   reason: `LibraryItemsFor` does not look at `Allowed`).
6. The node under `CurriculumNodesFor`, or 404.
7. Confirmed placements on the node, its ancestors and its curriculum, under
   `ContentPlacementsFor`; more than 500 is the existing 409 `placements_unbounded`.
8. The books of those placements under `LibraryItemsFor`. An unreadable book is dropped and leaves
   no trace in the answer.
9. The nearest tier (below).
10. More than 8 distinct indexed books is a 409 `mindmap_link_unbounded`.
11. A CAS slug, only if at least one book is indexed.
12. One chapter-list call per distinct indexed book, then the page match.

Everything through step 11 is database work under one deadline that has ended before step 12
begins; `TestCurriculumLinkFromPostgresFinishesItsDatabaseWorkBeforeItCallsOut` counts statements
at the first outbound call and at the end and requires them equal.

## Decisions

### The nearest tier, not every tier

`resolve.go` with `include_ancestors` returns the node's own placements, its ancestors' and the
curriculum-grain ones together, each marked `exact` or not. For retrieval that is right: more scope
is more to search. For a map it is wrong: a topic placed on pages 12 to 14 of a book, under a
chapter placed on pages 10 to 30 of the same book, would come back as two entries for one book and
the caller would have to guess which to open.

So the link answers with **one tier**: the node's own placements if any of them is on a readable
book, otherwise its parent's, and so on up, with curriculum-grain placements last. `inherited` is
true exactly when that tier is not the node itself. This is the contract's "a topic with none of
its own resolves through its chapter".

"Any" means any on a book the caller can read. A topic whose only placement is on a book the caller
cannot open falls through to its chapter's readable book rather than answering nothing. The caller
learns nothing from that: they are shown strictly placements on books they may read, and the
unreadable placement is not mentioned.

Rejected: returning every tier and letting the client choose; deciding the tier before the
readability check (a pupil would be told "nothing" while their chapter's own book sat one level up).

### Matching by page overlap

A placement's page range selects the engine sections whose pages intersect it. `overlap_pages` is
the size of the intersection.

- A section's pages are its declared `page_start` and `page_end` from the confirmed chapter map.
  When those are not recorded (the engine serves null) the computed `page_range` is used. A section
  with neither cannot overlap anything and is left out of an overlap match.
- A placement with only a start, or only an end, is that one page. One stored backwards is read the
  right way round. `placement.go` does not validate either today, so the link does not assume it.
- **Order: best match first.** Largest overlap, then the narrower section, then page, then id. A
  book-level section spanning every page overlaps any range as fully as the chapter does; putting
  the narrower one first means the chapter comes before the book.

`match_basis`:

| Value | When |
|---|---|
| `page_overlap` | the placement has pages and at least one section overlaps them |
| `whole_item` | the placement has no pages and the book is `available`; every section is listed, in page order |
| `none` | no section overlaps, or the book is not `available`, or the service lists no chapters for it |

`sections` is empty unless `mindmap_state` is `available`; a held, parked, pending or failed book
is listed with its state so the caller can say why there is no map, never dropped.

Under `whole_item` a section with no recorded pages has null `page_start`, `page_end` and
`overlap_pages`. Null and not zero: the engine's own rule is that zero would read as a page before
the cover. Under `page_overlap` all three are always numbers.

No match is never an error. An outage is never "no match": anything other than a 404 from the
mind-map service fails the whole request with the same status mapping as the map routes.

### A 404 for one book is "no chapters", not a failed request

The mind-map service answers 404 for a document the engine does not show this caller. One such book
among several placements would otherwise turn the whole link into a 404. It is listed with empty
`sections` and `match_basis: none`, and a step is logged. A 401, 403, 5xx or an unreachable service
is about the caller or the deployment, not the book, and is relayed.

### The cap, and what it says when it bites

At most **8 distinct indexed books** per request are asked about. The calls are sequential and
share the router's 30 second ceiling. Two placements on one book are one call.

Past the cap the route answers 409 `mindmap_link_unbounded`, naming the count and the cap, and
calls nobody. This follows `placements_unbounded` on `/curriculum-nodes/{id}/content`: an answer
that named chapters for eight books and none for the ninth would read as a ninth book with no
matching chapter, and `match_basis` has no value that means "not asked".

Rejected: truncating silently; a 200 with a marker field (a shape change the contract does not
have); counting only uncached books against the cap (the same node would then succeed or fail
depending on who asked a minute earlier).

### One cache, extended

`mindmap.Client` already cached section ids per (slug, document) for the membership check. It now
keeps each section's display text and pages alongside, and `Client.Sections` answers from it.

- The link is the first caller that is **answered from the cache**. The membership check only ever
  used it to confirm. So a chapter renamed on the engine can show its old title here for up to 60
  seconds. The map routes are unaffected: an unknown section is still asked for again.
- What the cache holds is no longer only ids. It is served only after `LibraryItemsFor` has passed
  for this caller on this request, which is the same rule the engine mirrors as labels.
- An empty list and a refusal are still never stored.

### An entry belongs to the caller who earned it

The cache was first keyed by (slug, document). A run against a real engine showed what that meant:
after a caller holding a book's gate label listed it, a caller with no bearer at all was answered
from the cache for 60 seconds. The engine is meant to be a second check behind this server's own.
On the map, node, trace, drill and grade routes it still was, because those go upstream with the
caller's token straight afterwards. The mastery routes and this link make no further call, so for
them the cached answer was the only engine-side check, and somebody else had earned it.

The key is now (slug, document, SHA-256 of the caller's `Authorization` value). A cached answer is
used only by the credential that obtained it.

- The token is hashed, never stored and never logged. `TestTheSectionCacheNeverKeepsTheBearerItself`
  prints every key and looks for the token.
- A caller the engine refuses is refused, and nothing is stored for them, so they are asked about
  again every time. The accepted caller's entry is a different key and is neither evicted nor
  overwritten by that refusal.
- Callers with no token (`AUTH_DISABLED`) share one entry: they present the same credential.
- A refreshed access token is a new credential and earns its own entry; the old one expires.
- **The bound is unchanged at 512 entries, but it now counts callers times books, not books.**
  A class of forty opening three books is 120 entries. Past 512 the expired entries go first and
  then the soonest to expire, and a caller whose entry was evicted pays one more upstream call.
  Nothing is answered wrongly at the bound; the hit rate falls. Each entry repeats the book's
  section list, a few kilobytes. If a deployment has more than about 500 pupils active in a book
  within a minute, raising `SectionCacheLimit` is a one-line change and the cost is memory.

The digest cache in `structure.go` is deliberately **not** keyed by caller. It is filled through
the indexing client with the admin token, the answer is the same whoever is asking, and nothing
from it is returned to a caller: the digest is only written onto the caller's own mastery row. It
has its own key type so the two cannot be confused.

Mutation-tested: with the caller taken out of the key,
`TestACachedChapterListAnswersOnlyTheCallerWhoEarnedIt` fails, and so do the two tenant-database
tests named `...DoesNotLendOneCallersChapterListToAnother`, for the mastery routes and for this
link.

The same change fixed a defect in the read path: the engine serves each section's `children` as a
count, and the previous decoder expected a list, so every real chapter list was unreadable and every
chapter route a 502. `children` and `sections` are now walked only when they are lists.

### No structure digest in the answer

The plan wanted the link to carry the document's `structure_digest`, so a caller could see that a
book moved since a placement was confirmed. The contract defers it: it is a second engine call per
book. Mastery rows record it (see `mastery.md`); the link does not.

### A slug only when it is needed

A school with no CAS slug can still be told that a node's books are held or not indexed, from this
server's own columns. The 503 `mindmap_tenant_unmapped` is raised only when a chapter list must
actually be fetched.

## Tests

Real tenant database, in `internal/transport/http/mindmap_curriculumdb_test.go`: a chapter matched
by overlap with an unreadable book and a proposed placement both omitted; a topic through its
chapter (`inherited: true`) and a topic with its own placement; `whole_item`; pages nothing covers;
a held book; a node with no placement; an unknown document, a relayed 403 and an outage; the cap at
8 and at 9; the two keys and the field policy; the slug. Fixtures use a root `chapter` with topics
beneath it, as the shape checks on `curriculum_nodes` require.

## What was rejected

- **Storing the join.** It is computed on request. Engine section ids re-mint on re-ingest.
- **Joining engine topic ids.** A topic is opened as its chapter's map focused on the placement's
  pages; every map node carries a page.
- **A second cache** for chapter lists.
- **`include_proposed` and `include_ancestors` parameters.** Only confirmed placements link, and
  the tier rule replaces the flag.

## Open

- Production has no chapter placements with page ranges (plan 3.2), so the link has nothing to
  answer there until that content exists.
- Repagination: a re-parse that moves pages while keeping titles leaves a page-range join pointing
  at the wrong pages, with nothing here to disagree. Detecting it is the stored content-node
  binding's job.
- The cap of 8 is a guess at what fits in the request ceiling, not a measurement.
