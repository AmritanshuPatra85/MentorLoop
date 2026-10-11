# MentorLoop Engineering Handoff

Snapshot: 2026-10-10. This document describes the checked-in code and the current working tree, not the blueprint's intended state. The blueprint is `docs/MentorLoop_Build_Blueprint.md`.

## 1. Sprint status

Status reflects implementation presence and known gaps; it is not a claim that every live integration has been production-verified.

- 1.1 — **done**: workspace/repository foundation and initial project structure.
- 1.2 — **partial**: Docker Compose and environment validation exist; no dedicated Windows setup/bootstrap script.
- 1.3 — **done**: PostgreSQL/Drizzle base schema and migration flow.
- 1.4 — **done**: Express API foundation, health checks, request logging, and error handling.
- 1.5 — **done**: Next.js app shell and shared design system.
- 2.1 — **done**: email/password registration and login.
- 2.2 — **partial**: Google OAuth and email verification flows exist; email delivery is console-only, and development verification exposes `devCode`.
- 2.3 — **partial**: API role/status guards enforce access; web route guards are client-side rather than server middleware.
- 2.4 — **done**: taxonomy catalogs and seed data.
- 2.5 — **done**: founder onboarding wizard, completion/profile persistence, and routing.
- 2.6 — **done**: mentor onboarding draft/resume and profile submission.
- 2.7 — **done**: admin mentor approval/rejection workflow and bootstrap script.
- 3.1 — **done**: profile editing, public profile views, and local avatar storage; avatar storage is filesystem-local.
- 3.2 — **done**: 384-dimensional profile embedding service and HNSW index.
- 3.3 — **done**: embedding refresh queue/worker and profile content hashing.
- 3.4 — **partial**: completeness indicators/nudges exist; completeness is not an independent ranking signal or score penalty.
- 4.1 — **done**: SQL candidate eligibility and capacity/availability/connection filters.
- 4.2 — **partial**: bidirectional pgvector retrieval and HNSW path exist; production-scale latency/query-plan validation is not established.
- 4.3 — **partial**: five-signal scoring, settings-based weights, breakdown, boost, and stable ordering exist; track-record data is only a neutral prior until ratings exist and does not model confidence robustly.
- 4.4 — **done**: asynchronous Groq match explanations with deterministic cached templates.
- 4.5 — **done**: founder discovery UI consumes ranked mentors and supports match actions.
- 4.6 — **done**: mentor discovery feed and startup invite flow exist; this is an in-app connection invite, not a separate email invitation system.
- 4.7 — **done**: match signal/event instrumentation and admin matching-weight controls.
- 5.1 — **done**: connection lifecycle, request/accept/invite/decline/withdraw/expiry states.
- 5.2 — **done**: mentor recurring availability and exceptions.
- 5.3 — **done**: slot generation and booking engine with overlap/idempotency protections.
- 5.4 — **done**: session lifecycle, reschedule/cancel/completion actions, and calendar download.
- 5.5 — **done**: Google Calendar OAuth/event integration; live credentials/configuration require external setup, with manual meeting URLs as fallback.
- 5.6 — **done**: scheduling/session UI for availability, slots, bookings, and session pages.
- 6.1 — **done**: founder brief, queued Groq digest, mentor display, and pending/failed fallback.
- 6.2 — **partial**: notes-to-action-items extraction/review/save exists; Whisper/audio transcription is not implemented, and extraction is synchronous in the request.
- 6.3 — **done**: action-item persistence, ownership/status updates, and session views.
- 6.4 — **done**: participant feedback/ratings and admin feedback access.
- 6.5 — **done**: startup milestones and stage timeline.

## 2. Repo map

- Root workspaces: `apps/api` (Express, Drizzle, workers), `apps/web` (Next.js 15/React 19), `packages/shared` (shared Zod schemas/types).
- `infra/docker-compose.yml`: local PostgreSQL 16 with pgvector and Redis 7.
- `docs/`: blueprint, sprint notes, and this handoff.
- API modules (`apps/api/src/modules`):
  - `admin`: mentor approvals, feedback, user/analytics console, matching settings; `admin/*routes.ts`, `mentor-approvals.service.ts`.
  - `auth`: registration, password/Google login, refresh sessions, email verification; `auth.routes.ts`, `auth.service.ts`, `google.ts`, `verification.service.ts`.
  - `connections`: requests/invites and lifecycle/participant access; `connections.routes.ts`, `lifecycle.routes.ts`.
  - `debug`: development-only diagnostic endpoints; `debug.routes.ts`.
  - `embeddings`: profile text, queue, model inference, persistence/backfill; `embedding.*.ts`, `profile-text.ts`.
  - `founder-onboarding`: founder draft/complete flow; `founder-onboarding.routes.ts`, `founder-onboarding.service.ts`.
  - `health`: liveness/readiness endpoints; `health.routes.ts`.
  - `matching`: eligibility, vector retrieval, scoring, event capture; `matching.routes.ts`, `matching.service.ts`, `eligibility.service.ts`, `track-record.ts`.
  - `matching/explanations`: template/Groq generation and cache/queue; `explanation.*.ts`.
  - `mentor-onboarding`: mentor draft/complete flow; `mentor-onboarding.routes.ts`, `mentor-onboarding.service.ts`.
  - `profiles`: profile reads/updates, completeness, avatar and public profiles; `profiles.routes.ts`.
  - `scheduling`: availability, sessions, Google Calendar, briefs, action items, feedback; `sessions.routes.ts`, `availability.*`, `calendar*`, `session-*`.
  - `taxonomy`: domain/skill/stage catalog; `taxonomy.routes.ts`, `taxonomy.service.ts`.
  - `timeline`: startup milestones and stage history; `timeline.routes.ts`.
- API workers (`apps/api/src/workers`): `embedding.worker.ts` refreshes profile vectors; `match-explanation.worker.ts` generates/caches explanations; `session-brief.worker.ts` creates session digests.

## 3. API surface

All routes are mounted by `apps/api/src/app.ts`. “Approved” means authenticated, verified, active, and role-appropriate. Session/connection participant routes perform ownership checks in addition to role checks. API routes are proxied by Next rewrites in `apps/web/next.config.ts`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/ping`, `/health` | Public | Liveness and dependency readiness. |
| GET | `/taxonomy/domains`, `/taxonomy/skills`, `/taxonomy/stages` | Public | Read shared taxonomy. |
| POST | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Public / session | Create account, authenticate, rotate or clear refresh session. |
| GET | `/auth/me` | Authenticated | Current account/session data. |
| POST | `/auth/verify-email/request`, `/auth/verify-email/confirm` | Authenticated | Request and confirm email OTP. |
| GET | `/auth/google`, `/auth/google/callback` | Public | Google OAuth login callback. |
| GET/PUT | `/profiles/me` | Approved founder or mentor | Read/update own profile. |
| POST/DELETE | `/profiles/me/avatar` | Approved founder or mentor | Upload/remove own avatar. |
| GET | `/profiles/mentors/:id`, `/profiles/startups/:id` | Public | Public profile pages. |
| GET | `/uploads/avatars/:filename` | Public | Serve avatar file. |
| GET/PUT/POST | `/founder-onboarding`, `/founder-onboarding/draft`, `/founder-onboarding/complete` | Founder | Load, save draft, complete founder onboarding. |
| GET/PUT/POST | `/mentor-onboarding`, `/mentor-onboarding/draft`, `/mentor-onboarding/complete` | Mentor onboarding guard | Load/save/submit mentor profile; pending mentor access is limited to this flow. |
| GET | `/admin/mentor-approvals/` | Admin | List pending mentor applications. |
| POST | `/admin/mentor-approvals/:mentorId/approve`, `/admin/mentor-approvals/:mentorId/reject` | Admin | Approve or reject mentor. |
| GET | `/admin/feedback/` | Admin | Review submitted feedback. |
| GET | `/admin/users`, `/admin/analytics` | Admin | User list and analytics overview. |
| GET/PUT | `/admin/matching/weights` | Admin | Read/update five matching weights. |
| GET | `/matches/mentors` | Approved founder | Ranked mentor candidates and explanations. |
| GET | `/matches/startups` | Approved mentor | Ranked startup candidates. |
| POST | `/matches/:candidateType/:candidateId/events` | Approved founder/mentor by direction | Record match view/save/dismiss/request event. |
| GET | `/connections/incoming` | Approved founder | List incoming mentor invites. |
| POST | `/connections/invites` | Approved mentor | Invite a startup to connect. |
| GET | `/connections/all` | Approved founder/mentor | List own connections and lazily expire stale requests. |
| POST | `/connections/requests` | Approved founder | Request a mentor connection. |
| POST | `/connections/:connectionId/respond`, `/connections/:connectionId/withdraw` | Approved participant | Transition/withdraw own connection. |
| GET | `/connections/:connectionId/action-items`, `/connections/:connectionId/timeline` | Connection participant | Read connection action items/timeline. |
| GET/PUT | `/availability/me` | Approved mentor | Read/update recurring availability rules. |
| POST/DELETE | `/availability/me/exceptions`, `/availability/me/exceptions/:exceptionId` | Approved mentor | Add/remove availability exception. |
| GET | `/availability/connections/:connectionId/slots` | Approved connection participant | Find bookable slots. |
| POST/GET | `/sessions/` | Approved founder/mentor | Book a session / list own sessions. |
| GET | `/sessions/:sessionId`, `/sessions/:sessionId/calendar.ics` | Session participant | Read session / download calendar file. |
| POST | `/sessions/:sessionId/reschedule`, `/sessions/:sessionId/actions` | Session participant | Reschedule or cancel/complete/no-show transition as allowed. |
| PATCH | `/sessions/:sessionId/meeting-link` | Session participant | Set/update meeting link. |
| GET/PUT | `/sessions/:sessionId/brief` | Session participant read; founder write | Read brief/digest or create/update future-session brief. |
| POST | `/sessions/:sessionId/action-items/extract` | Session participant | Extract proposed action items from supplied notes using Groq. |
| GET/POST | `/sessions/:sessionId/action-items` | Session participant | List/save action items. |
| PATCH | `/sessions/:sessionId/action-items/:itemId` | Session participant | Update an action item. |
| GET/POST | `/sessions/:sessionId/feedback` | Session participant | Read/submit session feedback. |
| POST | `/calendar/google/connect` | Approved founder/mentor | Start Google Calendar OAuth. |
| GET | `/calendar/google/callback` | OAuth state validated | Complete calendar OAuth. |
| GET/DELETE | `/calendar/google/status`, `/calendar/google` | Approved founder/mentor | Read/disconnect calendar integration. |
| POST | `/calendar/sessions/:sessionId/google-event` | Session participant | Create Google Calendar event/Meet link. |
| GET | `/timeline`, `/timeline/milestones` | Approved founder | Read startup timeline/milestones. |
| POST/PATCH | `/timeline/milestones`, `/timeline/milestones/:milestoneId` | Approved founder | Create/update milestone. |
| POST | `/timeline/stage` | Approved founder | Record stage progression. |
| GET | `/connections/:connectionId/timeline` | Connection participant | Read connection-specific timeline. |
| GET/POST | `/debug/error`, `/debug/validate`, `/debug/echo` | Public, development only | Exercise error/validation behavior. |

## 4. Database

Schema definitions are in `apps/api/src/db/schema/`; the runner creates `vector`, `btree_gist`, and `pgcrypto` extensions before migrations. There are 28 tables:

| Table | Purpose and notable contract |
|---|---|
| `users` | Identity, role/status, verification; unique case-folded email and Google ID. |
| `refresh_tokens` | Hashed refresh sessions/families; unique token hash, user/family indexes. |
| `email_verifications` | OTP digest/expiry/attempt state; user and expiry lookup. |
| `domains`, `skills`, `stages` | Shared taxonomies; unique names/slugs. |
| `founder_profiles` | Founder onboarding/profile; one per user. |
| `startups` | Startup identity, stage, founder; unique founder. |
| `startup_domains` | Startup-domain join; unique pair. |
| `mentor_profiles` | Professional profile, capacity and booking policy; nonnegative buffer/minimum-notice checks. |
| `mentor_domains`, `mentor_skills`, `mentor_stages` | Mentor taxonomy joins; unique pairs. |
| `profile_embeddings` | Exactly one startup or mentor target, 384D vector, content hash/version; unique target and HNSW cosine index `profile_embeddings_embedding_hnsw_idx`. |
| `connections` | Startup/mentor pair lifecycle, expiry and decline time; unique pair, composite `(id,startup,mentor)` target, state checks and lookup indexes. Pending requested/invited expire after 14 days; accepted connections reserve capacity; declined pair cooldown is 30 days. |
| `availability_rules` | Weekly mentor-local bookable windows; day/range checks, unique recurring window, mentor/day index. |
| `availability_exceptions` | One-off unavailable windows; valid range check and mentor/start index. |
| `sessions` | Bookings with connection composite FK, finite `[)` `tstzrange`; idempotency unique `(booking_actor_user_id,idempotency_key)`; partial exclusion constraints prevent overlapping active sessions for mentor and startup. |
| `session_events` | Session lifecycle audit events; event type check and session/time index. |
| `google_calendar_accounts` | Encrypted OAuth tokens/account metadata; unique user. Encryption key derives from `JWT_ACCESS_SECRET`; rotating it can make stored tokens unreadable. |
| `platform_settings` | JSONB settings; key `matching.weights` contains the five default weights (35/25/15/15/10). |
| `match_explanations` | Explanation cache by startup/mentor content hashes; unique hash pair and source check (`groq`/`template`). |
| `match_events` | View/save/dismiss/request telemetry; event type, candidate kind, dismissal reason and connection checks; partial unique save/dismiss action indexes. |
| `session_briefs` | One brief per session, founder ownership, hash/digest/status; digest status and text/hash checks. |
| `session_action_items` | Persisted extracted/manual actions; title/description/owner/priority/status checks and submission/session indexes; unique submission slot. |
| `session_feedback` | One feedback per author/session; rating 1–5, visibility/tag/comment checks and mentor/time indexes. |
| `startup_milestones` | Founder-owned timeline milestone; title/description/status checks and startup/time index. |
| `startup_stage_events` | Stage transition history; unique change key and startup/time index. |

Enums: `user_role` = founder/mentor/admin; `user_status` = active/pending_approval/rejected/suspended; `connection_state` = requested/invited/accepted/declined/withdrawn/expired; `session_status` = scheduled/rescheduled/cancelled/completed/no_show; `match_candidate_type` = mentor/startup; `match_event_type` = view/save/dismiss/request. Several other finite-value columns are text with check constraints.

Migrations, in order: `0000_base_tables`, `0001_email_verifications`, `0002_supreme_scarlet_spider`, `0003_dark_sabretooth`, `0004_founder_onboarding`, `0005_mentor_onboarding`, `0006_admin_rejection_reason`, `0007_user_avatar`, `0008_sticky_stick`, `0009_public_tag`, `0010_matching_prerequisites`, `0011_mentor_availability_checks`, `0012_connection_state_checks`, `0013_initiator_delete_cascade`, `0014_matching_weights`, `0015_match_explanations`, `0016_match_events`, `0017_phase5_sessions_calendar`, `0018_phase5_booking_idempotency`, `0019_loud_rictor`, `0020_tiny_amazoness`, `0021_action_item_tracker`, `0022_session_feedback`, `0023_startup_timeline`.

## 5. Queues and jobs

All queues use Redis/BullMQ. There are no recurring/scheduled jobs. Connection expiry is applied lazily on reads; action-item note extraction is synchronous.

| Queue / job | ID and retries | Worker |
|---|---|---|
| `profile-embeddings` / `refresh-profile-embedding` | ID `profileType:profileId`; 1500 ms debounce; 5 attempts, exponential 2 s; retain 500 completed/1000 failed. | `embedding.worker.ts`, concurrency 2, rate limit 20/sec. |
| `match-explanations` / `generate-match-explanation` | ID `match-explanation-${sha256(startupHash:mentorHash)}`; 3 attempts, exponential 2 s; top 10 uncached only. | `match-explanation.worker.ts`, concurrency 2. |
| `session-brief-digests` / `generate-session-brief-digest` | ID `session-brief-${sha256(sessionId:contentHash)}`; 3 attempts, exponential 1.5 s; remove on completion/failure. | `session-brief.worker.ts`, concurrency 3. |

## 6. Matching

`matching.service.ts` and `eligibility.service.ts` filter for approved, active, verified, complete profiles; active/capacity-eligible connection state; no active pair or 30-day decline cooldown; and actual bookable availability in the next 14 days. Availability uses mentor timezone/recurring rules, notice, exceptions, booked sessions, and buffer. Preferred session times are a scoring preference only, not evidence that a time is free. Pending requests do not reserve capacity; accepted connections do.

Each direction prefilters eligible IDs, requires a current 384D embedding (`embedding.updated_at >= profile.updated_at`), sets pgvector HNSW search settings, orders by cosine distance, and retrieves up to 50. Scoring uses the configured weights in `platform_settings`:

- Semantic: `clamp(1 - cosineDistance / 2, 0, 1)`.
- Domain: weighted Jaccard; primary domain weight 2, other domains 1.
- Stage: exact ordinal match 1, adjacent stage 0.5, otherwise 0; best relevant pair used.
- Availability: overlap of founder preferred windows with actual free slots in the next 14 days; no preference data uses neutral 0.5.
- Track record: rating-derived value normalized to 0–1, then `(normalized + 1) / 3`; absent ratings use neutral 0.5. Rating count only gates the no-data case; confidence shrinkage is not implemented.
- Weighted sum uses 35/25/15/15/10 defaults; mentors created within 90 days receive +0.03; final score is clamped 0–1. Tie order: score desc, semantic desc, candidate ID asc.

Profile text is deterministically assembled and normalized in `embeddings/profile-text.ts`, then SHA-256 hashed. Profile updates enqueue refreshes; same hash/current vector is skipped, empty profile text deletes its vector, and version checks avoid stale writes. Explanations cache on `(startup_content_hash, mentor_content_hash)`. Requests return cache or deterministic template immediately; only the top 10 uncached matches enqueue Groq.

## 7. Groq usage

`lib/groq-client.ts` constructs an optional SDK client (`GROQ_API_KEY`); timeout is 60 seconds and SDK retries are configured. Empty key leaves template/fallback modes available.

- Match explanations: `matching/explanations/explanation.groq.ts`; model `GROQ_EXPLAIN_MODEL` (default `openai/gpt-oss-20b`), plain text, low reasoning effort, 1024 max completion tokens, 2–3 sentences. Queue retries; a final failure stores template source.
- Session brief digest: `scheduling/session-brief.groq.ts`; model `GROQ_QUALITY_MODEL` (default `openai/gpt-oss-120b`), JSON-object mode, low reasoning effort, 4096 max completion tokens, Zod validation, one repair completion, then failed status. Stale job hashes are discarded.
- Action item extraction: `scheduling/session-action-items.groq.ts`; `GROQ_QUALITY_MODEL`, JSON-object mode, low reasoning effort, 4096 tokens. It runs in the API request, validates output, has no repair retry, and returns an unavailable/manual-entry error when Groq is unconfigured. Notes are not stored.

No Whisper/audio transcription implementation was found. Prompts use only supplied profile/brief/note data and should be treated as untrusted input; avoid logging prompt bodies or keys. The reasoning token headroom is explicit in the configured max completion budgets.

## 8. Auth and roles

Passwords use Argon2. Access JWTs are short-lived; refresh tokens are random, stored hashed, delivered in HTTP-only `ml_refresh` cookie scoped to `/auth`, rotated on use, and family-revoked on replay. Web keeps access token in memory and restores sessions through refresh; 401 refresh is serialized with Web Locks. Founders are restricted to `@kiit.ac.in`; mentors enter `pending_approval`. OTPs are 6 digits, 10-minute TTL, 5 attempts, 60-second resend limit, HMAC-protected with the JWT secret. Mailer is console-only; development response includes `devCode`.

Google login uses state/PKCE and checks verified identity/domain. `requireAuth`, `requireRole`, `requireApproved`, and `requireAdmin` protect API routes; approval checks are backed by current DB state. Pending mentors can only use onboarding routes. Admin bootstrap (`npm run admin:bootstrap -w @mentorloop/api`) promotes an existing verified non-suspended user selected by `ADMIN_EMAIL`; it does not create the user. Re-login after promotion to refresh JWT claims. Web guards are UX only; API guards are the security boundary. No general authentication bypass exists; `/debug` is mounted only in development.

## 9. Environment variables

Names only; values intentionally omitted. API validation is in `apps/api/src/config/env.ts`.

| Variable | Required? | Missing behavior |
|---|---|---|
| `DATABASE_URL` | Required | API and workers cannot connect to PostgreSQL. |
| `REDIS_URL` | Required | Queues and Redis-backed work cannot start. |
| `JWT_ACCESS_SECRET` | Required | Auth/signing, OTP HMAC, and Google token encryption unavailable. |
| `NODE_ENV` | Optional; application default applies | Controls cookie security, debug routes, logging. |
| `PORT` | Optional; application default applies | API uses its default port. |
| `LOG_LEVEL` | Optional; application default applies | Pino uses its default level. |
| `WEB_URL` | Optional; application default applies | CORS/OAuth redirect target may be wrong. |
| `API_URL` | Optional; application default applies | OAuth callback URL may be wrong. |
| `ACCESS_TOKEN_TTL_MINUTES` | Optional; application default applies | Default access token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | Optional; application default applies | Default refresh lifetime. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Google sign-in/calendar connection disabled. |
| `GROQ_API_KEY` | Optional | Template explanations; digest fails/unavailable; extraction requires manual entry. |
| `GROQ_EXPLAIN_MODEL` | Optional; application default applies | Selects match explanation model. |
| `GROQ_QUALITY_MODEL` | Optional; application default applies | Selects session digest/action extraction model. |
| `ADMIN_EMAIL` | Script-only for bootstrap | `admin:bootstrap` cannot select target admin. |
| `AVATAR_STORAGE_DIR` | Optional, unvalidated | Avatar files use local default directory. |
| `NEXT_PUBLIC_API_URL` | Optional; empty means same-origin | Web API client uses same-origin paths. |
| `API_PROXY_URL` | Optional; application default applies | Next rewrites target local API default. |

## 10. Commands

Run from repository root in PowerShell. Root has no `test` or `db:reset` script. `infra:reset` destroys the local Docker volumes and all data.

| Task | Command |
|---|---|
| Start API + web | `npm run dev` |
| API only | `npm run dev -w @mentorloop/api` |
| Web only | `npm run dev -w @mentorloop/web` |
| Embedding worker | `npm run worker:embeddings -w @mentorloop/api` |
| Explanation worker | `npm run worker:match-explanations -w @mentorloop/api` |
| Brief worker | `npm run worker:session-briefs -w @mentorloop/api` |
| Build | `npm run build` (web workspace currently provides the build script) |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Tests | `npm run test -w @mentorloop/api`; `npm run test -w @mentorloop/web` |
| API embedding model test | `npm run test:embedding-model -w @mentorloop/api` |
| DB generate/migrate/seed/studio | `npm run db:generate`; `npm run db:migrate`; `npm run db:seed`; `npm run db:studio` |
| Infra up/down/reset/logs | `npm run infra:up`; `npm run infra:down`; `npm run infra:reset`; `npm run infra:logs` |
| Bootstrap admin | Set `ADMIN_EMAIL` in current shell, then `npm run admin:bootstrap -w @mentorloop/api` |

## 11. Conventions

- API modules are under `apps/api/src/modules/<module>`; use route/service/repository separation where the module has it.
- Shared request/response validation lives in `packages/shared` Zod schemas; route middleware validates params/query/body and returns typed validation errors.
- Use `AppError` and its subclasses; global JSON shape is `{ error: { code, message, details?, requestId } }`. Do not leak internal errors.
- Pino request logging includes request IDs and redacts authorization/cookie headers. Never log credentials, API keys, prompts, or private profile/session text at info level.
- API unit/integration tests use Node test runner and Vitest; DB/Redis integration tests require local services and clean up fixtures. Groq is mocked in tests; do not call real APIs.
- Web data access uses API client/auth context and React Query where appropriate. Session brief digest polls every 2–3 seconds only while pending and tab visible; stop on ready/failed/hidden. Render user/LLM text as plain text.
- Keep filenames descriptive (`*.routes.ts`, `*.service.ts`, `*.repository.ts`, `*.test.ts`); workers live under `apps/api/src/workers`.
- Keep migrations additive and Drizzle schema aligned. Do not weaken DB constraints or duplicate existing taxonomy/schema contracts.

## 12. Known issues and risks

- Email verification mail transport is a console logger; production OTP delivery is not implemented. Dev OTP response reveals `devCode` by design.
- Avatar files are local filesystem storage; not suitable for multi-instance deployment without shared/object storage.
- Google OAuth/calendar needs configured credentials and callback URLs; live external integration was not verified by automated tests. Calendar token decryption depends on stable `JWT_ACCESS_SECRET`.
- Whisper/audio transcription is absent. Action-item extraction is synchronous and can make the endpoint wait for Groq; no async queue was added for it.
- Track-record scoring is a neutral prior until feedback ratings exist; rating-count confidence adjustment is absent. Do not imply a richer outcome/retention metric exists.
- Embedding retrieval is correctness-tested but HNSW query plan and production-scale latency have not been established. Profiles without a current embedding are excluded until worker refresh succeeds.
- Current Discover local data may return no mentors when none meet all actual eligibility conditions (notably a current vector plus a bookable window). Preferred times alone do not make a mentor available.
- `infra:reset` removes volumes. Admin bootstrap only promotes an already-registered verified account.
- Current working tree contains unrelated admin-console and Discover empty-state edits; preserve them when continuing. Inspect `git status` before editing.

## 13. Test status (2026-10-10)

- `npm run typecheck`: **passed** (API, web, shared workspaces; zero TypeScript errors).
- `npm run lint`: **passed** (ESLint exit 0).
- `npm run test -w @mentorloop/web`: **passed**, 4 tests.
- `npm run build`: **passed** when rerun with normal filesystem access; Next compiled and generated all 22 pages. The sandboxed run first failed during Windows path canonicalization (`Access is denied`). Next reports an existing warning that its ESLint plugin is not detected.
- `npm run test -w @mentorloop/api`: **incomplete**; the full run did not produce a final summary and was interrupted. A focused `profiles.test.ts` run reported **6 passed, 1 failed**. The failing public-mentor allowlist assertion expects the pre-feedback response shape and does not include the now-returned `averageRating`, `ratingCount`, and `publicFeedback`; verify/update the assertion if that public rating data is intended. Do not treat the API suite as green.

## First 10 files to read

1. `docs/MentorLoop_Build_Blueprint.md`
2. `package.json`
3. `apps/api/src/app.ts`
4. `apps/api/src/config/env.ts`
5. `apps/api/src/db/schema/index.ts`
6. `apps/api/src/modules/matching/matching.service.ts`
7. `apps/api/src/modules/matching/eligibility.service.ts`
8. `apps/api/src/modules/embeddings/profile-text.ts`
9. `apps/api/src/modules/scheduling/sessions.routes.ts`
10. `apps/web/next.config.ts`
