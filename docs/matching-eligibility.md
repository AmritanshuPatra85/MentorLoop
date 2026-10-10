# Matching eligibility (Sprint 4.1)

The eligibility service is a SQL-only prerequisite for vector retrieval. It returns IDs, not ranked results, and does not modify the embedding worker, HNSW index, or profile-completeness scorer. The service is not yet exposed as a discovery endpoint; Sprint 4.2 will consume it during retrieval.

## Connection and capacity policy

Connection states follow the blueprint: `requested`, `invited`, `accepted`, `declined`, `withdrawn`, and `expired`. Only `accepted` counts toward `mentor_profiles.max_mentees`. Pending requests and invitations do not reserve capacity, but an unexpired pending pair is omitted from repeated recommendations. The later acceptance handler must lock the mentor profile row and recheck capacity in its transaction; a candidate query alone cannot enforce concurrent writes.

Pending connections expire after 14 days. A decline by either participant sets `last_declined_at`; that pair is excluded for 30 days. The single pair row is retained, and `last_declined_at` must survive later requests so retrying cannot erase the cooldown. Expired, withdrawn, and declined pairs outside cooldown can become candidates again.

Approved mentor eligibility is represented by `users.role = 'mentor'`, `users.status = 'active'` (the existing admin approval result), verified email, and a complete mentor profile. Founder sources and startup candidates must also be active, email-verified, and have a complete startup. Unknown or zero mentor capacity and missing/nonpositive session length are treated as not bookable.

## Bookable availability

`availability_rules` store weekly local wall-clock windows, using the existing `mentor_profiles.timezone` as the IANA timezone. `availability_exceptions` are absolute-time closures. `sessions` use half-open `tstzrange` intervals; scheduled and rescheduled sessions block time. The database exclusion constraints prevent overlapping bookings for either participant. Buffers expand booked intervals on both sides.

For each recurring window, the query converts local day and time to instants, clips it to `[now + minimum_notice_minutes, now + 14 days)`, subtracts closure ranges and buffered booked-session ranges, then requires a remaining contiguous interval at least `session_length_minutes` long. `day_of_week` follows PostgreSQL's convention (Sunday is 0); overnight availability is represented by separate same-day rules. PostgreSQL `AT TIME ZONE` is the conversion authority for DST gaps and repeated local times.

Founder `preferred_session_times` is not queried by eligibility and is never used as proof of open time. It can be used as a preference signal in Sprint 4.3 only after actual mentor free windows are established.

## Later ranking prerequisites

There is no ratings, feedback, or completed-session track-record source yet. Until those source contracts and metric definitions exist, Sprint 4.3 should use a neutral raw `trackRecord` value of `0.5` for every candidate; that constant component cannot change relative ordering and does not invent a new signal. The blueprint's five default weights remain 35/25/15/15/10. `platform_settings` and those weights belong to Sprint 4.3 and are not part of Sprint 4.1 migrations.
