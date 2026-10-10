# Matching pipeline (Sprints 4.2–4.3)

## Sprint 4.2 retrieval

`GET /matches/mentors` (founder) and `GET /matches/startups` (approved mentor) compute the Sprint 4.1 eligibility IDs first. Retrieval requires a nonempty stored embedding whose `updated_at` is at least the source profile's `updated_at`; stale or absent vectors are omitted until the existing embedding worker refreshes them. It orders by pgvector cosine distance and candidate UUID, sets transaction-local `hnsw.ef_search=200` and `hnsw.iterative_scan='strict_order'`, and returns at most 50 rows. Both directions use the existing shared 384-dimensional HNSW index. The iterative scan allows Postgres to continue scanning after the eligibility UUID filter rather than returning fewer than 50 due to post-filtering.

## Sprint 4.3 weights and score

Migration `0014_matching_weights.sql` adds the minimal `platform_settings(key, value jsonb, updated_at, updated_by)` contract and seeds `matching.weights` with the blueprint defaults. Weights are parsed and validated at use time; all five are required, finite, between 0 and 100, and sum to 100 (within floating point tolerance). Missing or invalid weights fail the request rather than silently using defaults. Active verified admins can read or update them at `GET/PUT /admin/matching/weights`; updates are validated and attributed to the administrator.

For each top-50 retrieved candidate:

* Semantic similarity is `clamp(1 - cosine_distance / 2, 0, 1)`.
* Domain overlap is weighted Jaccard over shared taxonomy IDs; a startup primary domain has weight 2 and all other domain memberships have weight 1.
* Stage fit is 1 for equal taxonomy `display_order`, 0.5 for adjacent order, and 0 otherwise. Best matching stage pair is used.
* Availability overlap is actual available duration intersecting the startup's preferred local-time windows over the next 14 days, divided by the duration of those preferences in that same clipped 14-day horizon. Mentor recurring rules are converted in the mentor IANA timezone; minimum notice, closures, scheduled/rescheduled bookings and buffers are applied before the intersection, and only remaining continuous windows long enough for the mentor's session length count. An empty startup preference set receives neutral 0.5; it is never used as evidence that a mentor is available.
* Track record is the neutral constant 0.5 for every candidate. No feedback, rating, or completed-session metric is present yet, so it cannot change relative ordering.

The final score is the sum of each raw signal times its configured percentage divided by 100, plus a distinct 0.03 new-mentor boost for mentor candidates whose user account is at most 90 days old, capped at 1. Results sort by unrounded final score descending, semantic score descending, then candidate UUID ascending. Responses include each signal's raw score, weight and weighted contribution, plus the boost.

Profile completeness remains a hard prerequisite through Sprint 4.1 eligibility (`is_complete`); its advisory score is not an extra ranking signal. Embedding generation, profile text, and HNSW index remain the existing Sprint 3 implementations.

## Verification

`matching.test.ts` seeds actual profiles, recurring availability and vectors, tests both retrieval directions, default settings, score components and invalid weight totals. Sprint 4.1's database integration tests remain in the API suite and cover capacity, cooldowns and bookable availability. Production query-plan inspection should use representative data (small test fixtures often correctly plan a sequential scan); verify the existing HNSW index and strict-order iterative scan on production-like cardinalities before rollout.
