MentorLoop · Build Blueprint

**MentorLoop**

Mentor–Startup Matching Platform

**Build Blueprint: phases, sprints and product specification**

KIIT E-Cell Tech Domain, Assignment 4

This document is the single source of truth for the build. The product is split into 10 phases and 52 numbered sprints (1.1, 1.2 and so on). Each sprint is small enough to be delivered as complete files, verified, and committed on its own. Assembling the sprints in order produces the final working product.

| **Item** | **Decision** |
| --- | --- |
| Backend | Separate Express + TypeScript API with BullMQ workers |
| Frontend | Next.js (App Router) + TypeScript |
| Database | PostgreSQL 16 with pgvector, Redis 7 |
| Mentor onboarding | Open signup with admin approval |
| LLM | Groq (free tier) for explanations, briefs and extraction |
| Embeddings | Local model in the API worker (see Section 3, Groq has no embeddings endpoint) |
| Delivery format | Every sprint delivered as complete files via PowerShell here-strings |

# 1. Product Overview

## 1.1 The problem

Student founders struggle to find mentors who fit their domain and stage. Mentors have no visibility into which startups they could actually help. Today this happens through WhatsApp groups, cold messages and spreadsheets, so good matches are missed, sessions are hard to arrange, and nothing from a session is tracked afterwards.

## 1.2 The solution and what makes it stand out

MentorLoop is a two-sided platform where the right mentor and the right founder find each other, book a session, and keep making progress after it. The pitch in one line: **matching that explains itself, and sessions that compound.**

- **Explainable matching.** Every recommendation shows a score breakdown (semantic fit, domain overlap, stage fit, availability overlap, track record) and a plain-English “why this mentor” written by an LLM.

- **Two-way discovery.** Founders get ranked mentors. Mentors get a ranked feed of startups that need them and can invite them directly.

- **Conflict-proof scheduling.** Timezone-aware slots, database-level double-booking prevention, reschedule and cancel flows, reminders, calendar files and Meet links.

- **AI session copilot.** Founders submit a pre-session brief, the mentor gets an AI digest, and after the session notes become tracked action items. This turns a booking tool into a progress tool.

- **Feedback loop.** Ratings and outcomes feed back into ranking and into an admin analytics view, so match quality improves over time.

## 1.3 Roles

| **Role** | **Who** | **Can do** |
| --- | --- | --- |
| Founder | KIIT student with a startup (verified @kiit.ac.in email) | Create startup profile, discover ranked mentors, request connections, book sessions, submit briefs, track action items, give feedback |
| Mentor | Industry or alumni mentor, signs up openly, approved by admin | Build expertise profile, set availability and capacity, browse matched startups, invite or accept, run sessions, add notes, track action items |
| Admin | E-Cell team | Approve mentors, moderate users, view analytics and audit log, tune matching |

## 1.4 Core user journeys

**Founder:** sign up with KIIT email, complete the startup wizard, see ranked mentors with reasons, request a connection with an intro message, get accepted, pick a slot, submit a brief, attend the session, review the action items, rate the mentor.

**Mentor:** sign up, complete the expertise wizard, wait for admin approval, set weekly availability and capacity, receive requests and a ranked startup feed, accept, get an AI digest before the session, add notes after it, and track the founder's follow-through.

**Admin:** review the mentor queue, approve or reject with a reason, watch platform health and match quality on the dashboard, review the audit trail.

# 2. Architecture and Tech Stack

| **Layer** | **Choice** | **Why** |
| --- | --- | --- |
| Web | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, TanStack Query, Zod | Fast to build polished UI, strong typing, shared validation |
| API | Node 20, Express, TypeScript, Zod validation, Pino logging, Helmet, rate limiting | Separate backend shows real backend depth |
| ORM / DB | Drizzle ORM, PostgreSQL 16, pgvector, btree_gist, pgcrypto | Typed SQL, vector search and range exclusion constraints in one database |
| Queue / cache | Redis 7, BullMQ | Embedding jobs, emails, reminders, LLM calls with retries |
| Realtime | Socket.IO | Live notifications, session status, chat |
| Auth | Own auth: argon2, JWT access token, rotating refresh token in httpOnly cookie, Google OAuth | Full control of roles and KIIT verification |
| LLM | Groq SDK (Llama 3.3 70B for quality tasks, Llama 3.1 8B for cheap ones; confirm current model names at build time) | Free tier, very fast, JSON mode |
| Embeddings | all-MiniLM-L6-v2 (384 dimensions) via @xenova/transformers, run locally in the worker | Free, no external dependency, good quality for profile text |
| Email | Resend (free tier) | Transactional email with simple API |
| Calendar | .ics files always; Google Calendar + Meet links as an optional upgrade | Works with or without Google Cloud setup |
| Infra | Docker Compose locally; GitHub Actions CI; web on Vercel; API and workers in Docker on Railway, Render or a VPS; managed Postgres with pgvector | Production-style delivery |
| Quality | Vitest (unit), Playwright (end-to-end), Sentry | Proof the critical flows work |

## 2.1 Repository layout

- **apps/web**: Next.js frontend

- **apps/api**: Express API, with `src/modules/*` (auth, users, taxonomy, matching, connections, scheduling, sessions, notifications, admin), plus `src/workers/*` for BullMQ processors

- **packages/shared**: Zod schemas, enums and types used by both apps

- **infra**: docker-compose, CI workflows, deployment notes

## 2.2 Design principles

- **Every sprint ships its own migration.** The schema grows with the product instead of being designed up front and drifting.

- **Rules live in the database where possible.** Double-booking is prevented by an exclusion constraint, not just application code.

- **LLM calls are never on the critical path.** They run through the queue, results are cached, and a template fallback is used when Groq is rate limited.

- **Shared Zod schemas** validate the same shapes in the API and the web app.

## 2.3 Important technical flag: embeddings

Groq does not offer an embeddings endpoint, so semantic matching cannot use it. The plan uses a small local embedding model running inside the worker process. It is free, needs no API key and handles profile-length text well. The trade-off is a one-time model download and a slightly heavier worker. If you would rather use a hosted embeddings API, only Sprint 3.2 changes.

# 3. Data Model Overview

Tables are introduced by the sprint that needs them. This is the full picture by the end of the build.

| **Group** | **Tables** |
| --- | --- |
| Identity | users, refresh_tokens, email_verifications |
| Profiles | founder_profiles, startups, mentor_profiles, domains, skills, stages, mentor_domains, mentor_skills, startup_domains, profile_embeddings (vector 384) |
| Matching | match_cache, match_explanations, match_events (view, save, dismiss, request) |
| Connections | connections (state machine), connection_messages |
| Scheduling | availability_rules, availability_exceptions, sessions (with tstzrange and exclusion constraint) |
| Copilot | session_briefs, session_notes, action_items, feedback, milestones |
| Comms | notifications, notification_preferences, email_jobs |
| Admin | audit_logs, platform_settings (match weights) |

# 4. Matching Algorithm Specification

Matching runs in three stages: hard filters, vector retrieval, then weighted re-ranking.

### Stage 1: hard filters (a mentor is excluded if any fail)

- Mentor is approved and active

- Mentor has not reached their maximum mentee capacity

- No existing active connection, and no recent decline between the same pair (cooldown)

- Mentor has at least one open availability window in the next 14 days

### Stage 2: semantic retrieval

The startup profile text (one-liner, description, goals, help needed) and the mentor profile text (bio, expertise, experience) are embedded. pgvector returns the nearest 50 mentors by cosine distance using an HNSW index.

### Stage 3: weighted re-ranking

| **Signal** | **Weight** | **How it is computed** |
| --- | --- | --- |
| Semantic similarity | 35% | Cosine similarity, rescaled to 0–1 |
| Domain overlap | 25% | Weighted Jaccard of startup domains versus mentor domains, primary domain counts double |
| Stage fit | 15% | 1.0 if mentor works with the startup stage, 0.5 for adjacent stage, 0 otherwise |
| Availability overlap | 15% | Share of the founder's preferred windows that overlap mentor free slots in the next 14 days |
| Track record | 10% | Blend of average rating, response rate and completion rate, with a neutral prior for new mentors |

Weights are stored in platform_settings so the admin can tune them. Each result returns the final score and the per-signal breakdown. A new-mentor boost prevents established mentors from dominating. The top results get a Groq-written explanation, cached by (startup version, mentor version).

# 5. Roadmap at a Glance

| **Phase** | **Name** | **Sprints** | **Outcome** |
| --- | --- | --- | --- |
| 1 | Foundation | 1.1–1.5 | Empty but running API and web app, database and Redis up, shared types |
| 2 | Identity, Roles and Onboarding | 2.1–2.7 | Users can sign up, verify, onboard as founder or mentor; admin approves mentors |
| 3 | Profiles and Embeddings | 3.1–3.4 | Rich profiles with vectors generated and kept in sync |
| 4 | Matching Engine | 4.1–4.7 | Ranked, explained matches for both sides with discovery UIs |
| 5 | Connections and Scheduling | 5.1–5.6 | Request, accept, set availability, book, reschedule, cancel, calendar files |
| 6 | Session Copilot and Progress | 6.1–6.5 | Briefs, AI digests, notes to action items, feedback, milestones |
| 7 | Realtime and Communication | 7.1–7.5 | Notifications, live updates, emails, reminders, chat |
| 8 | Admin and Analytics | 8.1–8.4 | Dashboard, moderation, audit log, match quality analytics |
| 9 | Hardening and Delivery | 9.1–9.6 | Secure, tested, seeded, containerized, deployed, polished |
| 10 | Submission Package | 10.1–10.3 | README, demo script and video, final QA |

## How we assemble the sprints

- One sprint at a time, in order. A sprint is not started until the previous one's “Done when” is verified.

- Each sprint is delivered as complete files, written through PowerShell here-string commands to the exact path, with the install, migration and run commands in PowerShell syntax.

- Each sprint ends with a short verification checklist and a suggested git commit message.

- Genuine design decisions inside a sprint are raised for discussion before the code is written.

- If a sprint turns out too large, it is split into a/b rather than rushed.

# Phase 1 — Foundation

Create the skeleton everything else plugs into. Nothing user-facing yet, but every later sprint depends on this being clean.

**Phase outcome:** Running API and web app, Postgres with pgvector and Redis up, shared types, migrations working.

### Sprint 1.1 — Monorepo scaffold and tooling

| **Goal** | One repository with three workspaces and shared types. |
| --- | --- |
| **Build** | npm workspaces: apps/web, apps/api, packages/shared Strict TypeScript config shared across workspaces, ESLint and Prettier Root scripts for dev, build, lint and typecheck packages/shared exporting a first Zod schema consumed by both apps |
| **Done when** | `npm run dev` starts both apps and the shared package imports cleanly in each. |
| **Depends on** | Nothing |

### Sprint 1.2 — Local infrastructure and config

| **Goal** | Reproducible local environment with validated configuration. |
| --- | --- |
| **Build** | docker-compose with Postgres 16 (pgvector image) and Redis 7 Typed env loader using Zod that fails fast with a clear message .env.example for both apps PowerShell helper scripts for up, down and reset |
| **Done when** | Containers are healthy and the API refuses to boot with missing or invalid env values. |
| **Depends on** | 1.1 |

### Sprint 1.3 — Database foundation and migrations

| **Goal** | Working migration pipeline and base tables. |
| --- | --- |
| **Build** | Drizzle configuration and migration runner Enable extensions: vector, btree_gist, pgcrypto Base tables: users, refresh_tokens Seed runner entry point |
| **Done when** | Migrations apply and roll forward cleanly on a fresh database; extensions are confirmed active. |
| **Depends on** | 1.2 |

### Sprint 1.4 — API skeleton

| **Goal** | Production-style Express foundation. |
| --- | --- |
| **Build** | App factory with Helmet, CORS, JSON limits and cookie parsing Pino logging with request IDs Central error handler with typed AppError classes Zod validation middleware /health endpoint checking Postgres and Redis |
| **Done when** | Health endpoint reports both dependencies and errors return a consistent JSON shape. |
| **Depends on** | 1.3 |

### Sprint 1.5 — Web skeleton and design system

| **Goal** | A clean, consistent UI shell to build every page into. |
| --- | --- |
| **Build** | Next.js App Router, Tailwind and shadcn/ui with design tokens and dark mode App shell: sidebar, top bar, responsive layout Typed API client with TanStack Query provider Toasts, error boundaries and loading skeleton patterns |
| **Done when** | The shell renders on desktop and mobile and calls the API health endpoint through the client. |
| **Depends on** | 1.1, 1.4 |

# Phase 2 — Identity, Roles and Onboarding

Get the right people into the system in the right role. Founders are verified as KIIT students; mentors sign up openly and wait for admin approval.

**Phase outcome:** A user can sign up, verify, choose a role, complete onboarding, and an admin can approve mentors.

### Sprint 2.1 — Email and password auth

| **Goal** | Secure sessions without third-party dependence. |
| --- | --- |
| **Build** | argon2 password hashing Short-lived access JWT plus rotating refresh token in httpOnly cookie, stored hashed in the database Refresh token reuse detection Register, login, logout and me endpoints; login and register pages |
| **Done when** | Login persists across refresh, logout invalidates the refresh token, and reusing an old refresh token revokes the session family. |
| **Depends on** | 1.4, 1.5 |

### Sprint 2.2 — Google OAuth and KIIT verification

| **Goal** | Easy login and trusted founder identity. |
| --- | --- |
| **Build** | Google sign-in flow Founders must have a verified @kiit.ac.in email (Google account or emailed OTP) Mentors may use any email, with email verification Verification emails print to console until Resend arrives in 7.3 |
| **Done when** | A non-KIIT email cannot become a founder; a KIIT email can, through Google or OTP. |
| **Depends on** | 2.1 |

### Sprint 2.3 — Role-based access control

| **Goal** | Every route knows who may use it. |
| --- | --- |
| **Build** | requireRole and requireApproved middleware Next.js middleware route guards Role-aware navigation Post-login redirect based on role and onboarding state |
| **Done when** | A founder cannot open mentor or admin routes in the UI or the API, and each role lands on the correct page. |
| **Depends on** | 2.1 |

### Sprint 2.4 — Taxonomy and seed data

| **Goal** | A shared vocabulary for matching. |
| --- | --- |
| **Build** | Tables and seed for domains (fintech, edtech, healthtech, SaaS, D2C, AI, and so on), skills and startup stages (idea, prototype, MVP, early traction, growth) Public read endpoints with caching Reusable multi-select and stage components |
| **Done when** | Taxonomy endpoints return seeded data and the components render it. |
| **Depends on** | 1.3, 1.5 |

### Sprint 2.5 — Founder onboarding wizard

| **Goal** | Capture everything needed to match a startup. |
| --- | --- |
| **Build** | Steps: founder basics, startup identity, domains, stage, what help is needed, goals, preferred session times Save-as-draft and resume Zod validation shared with the API Tables: founder_profiles, startups, startup_domains |
| **Done when** | A new founder completes the wizard and lands on the dashboard with a saved profile. |
| **Depends on** | 2.3, 2.4 |

### Sprint 2.6 — Mentor onboarding wizard

| **Goal** | Capture expertise, limits and preferences. |
| --- | --- |
| **Build** | Steps: bio and experience, domains, skills, stages comfortable with, maximum mentees, session length, timezone, links Ends in a “pending approval” state with a clear waiting screen Tables: mentor_profiles, mentor_domains, mentor_skills |
| **Done when** | A new mentor completes the wizard and sees the pending-approval screen with no access to mentor features. |
| **Depends on** | 2.3, 2.4 |

### Sprint 2.7 — Admin mentor approval queue

| **Goal** | Open signup with human quality control. |
| --- | --- |
| **Build** | Admin-only queue of pending mentors with full profile view Approve or reject with a reason Status change visible to the mentor Script to create the first admin |
| **Done when** | Approving a mentor unlocks mentor features; rejecting shows the reason and allows re-submission. |
| **Depends on** | 2.6 |

# Phase 3 — Profiles and Embeddings

Turn profiles into something a matching engine can search. Profiles must be editable, presentable and always in sync with their vectors.

**Phase outcome:** Polished profiles, plus an automatic pipeline that keeps embeddings current.

### Sprint 3.1 — Profile management and public profile pages

| **Goal** | Profiles people actually want to read. |
| --- | --- |
| **Build** | Edit pages for founder, startup and mentor profiles Avatar upload (local or object storage) with validation Public profile views with privacy-respecting fields Optimistic updates |
| **Done when** | Edits save and the public view reflects them; private fields never leak. |
| **Depends on** | Phase 2 |

### Sprint 3.2 — Embedding service

| **Goal** | Free, local semantic vectors. |
| --- | --- |
| **Build** | Embedding module wrapping all-MiniLM-L6-v2 via @xenova/transformers Deterministic text builders: startup text and mentor text Model loaded once per worker, warm-up on boot Table: profile_embeddings (vector 384) with HNSW index |
| **Done when** | Given a profile, the service returns a 384-dimension vector and similar profiles score higher than unrelated ones in a quick test. |
| **Depends on** | 1.3 |

### Sprint 3.3 — Embedding pipeline

| **Goal** | Vectors stay in sync automatically. |
| --- | --- |
| **Build** | BullMQ queue and worker for embedding jobs Jobs enqueued on profile create and update, with debouncing Content hash to skip unchanged profiles Backfill script for existing profiles |
| **Done when** | Editing a profile updates its embedding within seconds and unchanged edits trigger no work. |
| **Depends on** | 3.1, 3.2 |

### Sprint 3.4 — Profile completeness and nudges

| **Goal** | Better profiles produce better matches. |
| --- | --- |
| **Build** | Completeness score per profile with a checklist of what is missing Dashboard progress card Matching weight penalty or banner for very thin profiles |
| **Done when** | The score updates live as fields are filled and the checklist links to the right form step. |
| **Depends on** | 3.1 |

# Phase 4 — Matching Engine

The heart of the product. Retrieve, rank and explain, then expose it through two discovery experiences.

**Phase outcome:** Founders see ranked, explained mentors; mentors see a ranked startup feed and can invite.

### Sprint 4.1 — Candidate filtering

| **Goal** | Cheaply remove ineligible mentors. |
| --- | --- |
| **Build** | SQL filter for approved, active, capacity, existing or recently declined connections Availability presence check for the next 14 days Unit tests for each rule |
| **Done when** | Each filter has a passing test and a mentor failing any rule never appears. |
| **Depends on** | Phase 3 |

### Sprint 4.2 — Vector retrieval

| **Goal** | Find semantically close mentors fast. |
| --- | --- |
| **Build** | pgvector cosine query over the HNSW index returning the top 50 Same logic mirrored for the mentor-to-startup direction Query plan check to confirm index use |
| **Done when** | Retrieval returns relevant candidates in tens of milliseconds on the seed dataset. |
| **Depends on** | 4.1 |

### Sprint 4.3 — Hybrid scoring and ranking

| **Goal** | Combine all signals into one explainable score. |
| --- | --- |
| **Build** | Implement the five-signal formula from Section 4 Weights read from platform_settings Return per-signal breakdown with every result New-mentor boost and tie-breaking Thorough unit tests with fixed fixtures |
| **Done when** | Rankings are deterministic, tests cover each signal, and changing a weight changes the order as expected. |
| **Depends on** | 4.2 |

### Sprint 4.4 — Groq match explanations

| **Goal** | Make every match understandable. |
| --- | --- |
| **Build** | Groq client with timeout, retries and rate-limit backoff Prompt that uses only profile facts and the score breakdown, output 2 to 3 sentences Queue job and cache keyed by profile versions Template-based fallback if Groq fails |
| **Done when** | Top matches show explanations, repeat views hit the cache, and the fallback appears when Groq is unavailable. |
| **Depends on** | 4.3 |

### Sprint 4.5 — Founder discovery UI

| **Goal** | The main founder screen. |
| --- | --- |
| **Build** | Ranked mentor cards with score ring, breakdown popover and explanation Filters (domain, stage, availability) and sorting Mentor detail drawer Skeletons, empty states, pagination |
| **Done when** | A founder sees ranked mentors with reasons and can open a mentor in one click. |
| **Depends on** | 4.4 |

### Sprint 4.6 — Mentor discovery feed and invites

| **Goal** | The other side of the marketplace. |
| --- | --- |
| **Build** | Ranked feed of startups that fit the mentor, using the reverse query Startup detail view “Invite to connect” action that creates a mentor-initiated connection |
| **Done when** | A mentor sees relevant startups and can send an invite that appears on the founder side. |
| **Depends on** | 4.4, 5.1 |

### Sprint 4.7 — Match signals and events

| **Goal** | Capture data to learn from. |
| --- | --- |
| **Build** | Save and dismiss actions with optional reason match_events table logging views, saves, dismissals and requests Dismissed matches are down-ranked or hidden |
| **Done when** | Events are recorded and dismissed mentors stop surfacing at the top. |
| **Depends on** | 4.5 |

# Phase 5 — Connections and Scheduling

Move from “this is a good match” to “we have a session booked”, with strong guarantees against conflicts.

**Phase outcome:** Founders and mentors can connect, share availability, book, move and cancel sessions.

### Sprint 5.1 — Connection lifecycle

| **Goal** | A clean state machine for relationships. |
| --- | --- |
| **Build** | States: requested, invited, accepted, declined, withdrawn, expired Intro message on request Capacity enforcement and decline cooldown Founder and mentor connection inboxes |
| **Done when** | Every legal transition works, illegal ones are rejected, and capacity is respected under concurrent accepts. |
| **Depends on** | Phase 4 |

### Sprint 5.2 — Availability management

| **Goal** | Mentors define when they can meet. |
| --- | --- |
| **Build** | Weekly recurring rules plus date exceptions Timezone stored per mentor and converted for display Buffer time and minimum notice settings Availability editor UI |
| **Done when** | A mentor saves a weekly schedule with an exception and it reads back correctly in another timezone. |
| **Depends on** | 2.6 |

### Sprint 5.3 — Slot generation and booking engine

| **Goal** | Bookable slots that can never collide. |
| --- | --- |
| **Build** | Generate slots from rules minus existing sessions and exceptions sessions table with tstzrange and an exclusion constraint (btree_gist) per mentor Transactional, idempotent booking endpoint Concurrency test with simultaneous bookings |
| **Done when** | Two simultaneous bookings of the same slot result in exactly one success and one clear error. |
| **Depends on** | 5.1, 5.2 |

### Sprint 5.4 — Session lifecycle

| **Goal** | Real-world changes to sessions. |
| --- | --- |
| **Build** | States: scheduled, rescheduled, cancelled, completed, no-show Reschedule and cancel with reason and policy windows Mark completed or no-show after the end time Full status history |
| **Done when** | Reschedule frees the old slot and takes the new one atomically; invalid transitions are rejected. |
| **Depends on** | 5.3 |

### Sprint 5.5 — Calendar and meeting links

| **Goal** | Sessions that show up where people live. |
| --- | --- |
| **Build** | Always generate an .ics file attachment and download Optional Google Calendar integration with auto-generated Meet link Manual meeting link fallback when Google is not connected |
| **Done when** | Every session has a downloadable calendar file and a meeting link, with Google or manual. |
| **Depends on** | 5.4 |

### Sprint 5.6 — Scheduling UI

| **Goal** | Booking that feels effortless. |
| --- | --- |
| **Build** | Week-view slot picker in the viewer's timezone Upcoming and past sessions lists for both roles Session detail page with actions Clear conflict and error states |
| **Done when** | A founder books, reschedules and cancels a session entirely through the UI. |
| **Depends on** | 5.3, 5.4 |

# Phase 6 — Session Copilot and Progress

The differentiator. Make each session more useful before it starts and trackable after it ends.

**Phase outcome:** Briefs, AI digests, action items, feedback and milestone tracking all connected to sessions.

### Sprint 6.1 — Pre-session brief and AI digest

| **Goal** | Mentors arrive prepared. |
| --- | --- |
| **Build** | Founder brief form: current status, specific questions, desired outcome Groq digest for the mentor: summary, key questions, suggested focus Digest generated through the queue and shown on the session page Table: session_briefs |
| **Done when** | Submitting a brief produces a digest on the mentor's session page within seconds. |
| **Depends on** | 5.4, 4.4 |

### Sprint 6.2 — Notes to action items

| **Goal** | Turn discussion into commitments. |
| --- | --- |
| **Build** | Mentor or founder pastes session notes Groq in JSON mode extracts action items with owner, due date and priority Editable review step before saving Stretch: audio upload transcribed with Groq Whisper |
| **Done when** | Messy notes become a reviewable list of structured action items that save correctly. |
| **Depends on** | 6.1 |

### Sprint 6.3 — Action item tracker

| **Goal** | Follow-through is visible. |
| --- | --- |
| **Build** | Both sides see and update items; statuses: open, in progress, done, blocked Due dates, overdue highlighting, filters Progress summary on the connection page |
| **Done when** | Items created from a session are visible to both sides and status changes are reflected instantly. |
| **Depends on** | 6.2 |

### Sprint 6.4 — Feedback and ratings

| **Goal** | Close the loop on match quality. |
| --- | --- |
| **Build** | Post-session feedback from both sides: rating, tags, written comment Private feedback to admin versus public feedback to the mentor Aggregates feed the mentor track-record signal in matching |
| **Done when** | Submitting feedback updates the mentor's aggregate and influences their ranking weight. |
| **Depends on** | 5.4 |

### Sprint 6.5 — Startup journey timeline

| **Goal** | Show progress over time. |
| --- | --- |
| **Build** | Milestones with dates and linked sessions Founder-requested stage progression Timeline view on the founder dashboard and connection page |
| **Done when** | A founder logs milestones and sees a coherent timeline across sessions. |
| **Depends on** | 6.3 |

# Phase 7 — Realtime and Communication

Keep both sides informed and engaged without them having to check the app.

**Phase outcome:** In-app and email notifications, reminders, live updates and per-connection chat.

### Sprint 7.1 — Notification system

| **Goal** | One place for everything that needs attention. |
| --- | --- |
| **Build** | notifications and notification_preferences tables Notification service used by all modules In-app notification center with unread count and mark-as-read Per-channel preferences |
| **Done when** | Events from earlier phases create notifications that show in the center and respect preferences. |
| **Depends on** | Phase 5 |

### Sprint 7.2 — Realtime layer

| **Goal** | Live updates. |
| --- | --- |
| **Build** | Socket.IO with cookie-based authentication Per-user rooms; push notifications and session status changes Reconnect handling and fallback |
| **Done when** | A mentor accepting a request updates the founder's screen without refresh. |
| **Depends on** | 7.1 |

### Sprint 7.3 — Email infrastructure

| **Goal** | Reliable transactional email. |
| --- | --- |
| **Build** | Resend integration with branded templates BullMQ email queue with retries and failure logging Replace earlier console-printed emails (verification, approval, requests) |
| **Done when** | All key events send real emails and failures retry then log. |
| **Depends on** | 7.1 |

### Sprint 7.4 — Reminders and nudges

| **Goal** | Automation that keeps things moving. |
| --- | --- |
| **Build** | Delayed jobs: 24 hours and 1 hour before a session Overdue action item nudges Auto-expire stale connection requests Idempotent scheduling that survives reschedules and cancellations |
| **Done when** | Reminders fire at the right times and a rescheduled session never sends a stale reminder. |
| **Depends on** | 7.3, 5.4 |

### Sprint 7.5 — Connection chat

| **Goal** | Lightweight messaging between matched people. |
| --- | --- |
| **Build** | Messages per accepted connection with history Typing indicator and read receipts via Socket.IO Basic content limits and report action |
| **Done when** | Two users chat in real time and history persists after reload. |
| **Depends on** | 7.2 |

# Phase 8 — Admin and Analytics

Give E-Cell the tools to run the programme and prove it works.

**Phase outcome:** A dashboard, moderation tools, an audit trail and match quality insights.

### Sprint 8.1 — Admin dashboard

| **Goal** | Platform health at a glance. |
| --- | --- |
| **Build** | KPI cards: users, approved mentors, active connections, sessions this week, completion rate Charts for growth and activity Pending approvals shortcut |
| **Done when** | Dashboard numbers match the database and load quickly. |
| **Depends on** | Phase 7 |

### Sprint 8.2 — User management and moderation

| **Goal** | Control and safety. |
| --- | --- |
| **Build** | Search and filter users, view detail, suspend or reactivate Handle reported chat messages and low-rated mentors Mentor capacity override |
| **Done when** | A suspended user loses access immediately and disappears from matching. |
| **Depends on** | 8.1 |

### Sprint 8.3 — Audit log

| **Goal** | Accountability. |
| --- | --- |
| **Build** | audit_logs table written by admin and sensitive actions Filterable log viewer Immutable by design (insert-only) |
| **Done when** | Approvals, suspensions and weight changes appear in the log with actor and time. |
| **Depends on** | 8.2 |

### Sprint 8.4 — Match quality analytics

| **Goal** | Evidence that matching works. |
| --- | --- |
| **Build** | Request acceptance rate by score band Time from match to first session Average rating versus match score Admin screen to tune matching weights, logged to audit |
| **Done when** | Admin can see whether higher scores lead to better outcomes and adjust weights safely. |
| **Depends on** | 6.4, 4.7 |

# Phase 9 — Hardening and Delivery

Turn a working build into something that is secure, tested, demo-ready and deployed.

**Phase outcome:** A deployed, monitored, tested product with realistic demo data.

### Sprint 9.1 — Security hardening

| **Goal** | Close common holes. |
| --- | --- |
| **Build** | Rate limiting, brute-force protection, CSRF strategy for cookies Input sanitization, file upload checks, authorization review on every endpoint Secrets handling and dependency audit |
| **Done when** | A written checklist is completed and negative tests confirm blocked cases. |
| **Depends on** | Phase 8 |

### Sprint 9.2 — Automated tests

| **Goal** | Confidence in the critical paths. |
| --- | --- |
| **Build** | Vitest unit tests for matching, state machines and booking Playwright end-to-end: signup, approval, match, book, brief, notes, feedback Tests run in CI |
| **Done when** | The end-to-end suite passes headless and fails if the booking race condition is reintroduced. |
| **Depends on** | 9.1 |

### Sprint 9.3 — Demo seed dataset

| **Goal** | A demo that looks alive. |
| --- | --- |
| **Build** | Realistic seeded mentors (around 40), startups (around 25), sessions, notes and feedback Seed script is idempotent and safe to re-run Demo accounts for each role |
| **Done when** | A fresh environment seeded with one command shows convincing matches and history. |
| **Depends on** | 9.2 |

### Sprint 9.4 — Containers, CI/CD and deployment

| **Goal** | Production delivery. |
| --- | --- |
| **Build** | Dockerfiles for API and worker GitHub Actions: lint, typecheck, test, build, deploy Deploy web on Vercel and API plus worker with managed Postgres and Redis Migration step in the pipeline |
| **Done when** | A push to main deploys and the live app passes a smoke test. |
| **Depends on** | 9.2 |

### Sprint 9.5 — Observability

| **Goal** | Know when something breaks. |
| --- | --- |
| **Build** | Sentry in web and API Structured logs with request IDs Queue and worker health visibility |
| **Done when** | A forced error appears in Sentry with context. |
| **Depends on** | 9.4 |

### Sprint 9.6 — UX polish pass

| **Goal** | The last 10% that judges notice. |
| --- | --- |
| **Build** | Consistent empty, loading and error states Responsive layouts, accessibility checks, keyboard focus Micro-interactions and consistent copy Performance review of the main pages |
| **Done when** | Every main screen works on mobile and passes a basic accessibility check. |
| **Depends on** | 9.4 |

# Phase 10 — Submission Package

The brief asks for source code, a README explaining design choices, and a short demo. This phase makes that submission excellent.

**Phase outcome:** A complete, convincing submission.

### Sprint 10.1 — README and architecture documentation

| **Goal** | Explain the design choices clearly. |
| --- | --- |
| **Build** | README with problem, solution, architecture diagram, tech choices and trade-offs Decision log: separate backend, local embeddings, DB-level conflict prevention, queued LLM calls Setup instructions that work first time Screenshots |
| **Done when** | A reviewer can run the project locally from the README alone. |
| **Depends on** | Phase 9 |

### Sprint 10.2 — Demo script and video

| **Goal** | Tell the story in a few minutes. |
| --- | --- |
| **Build** | Script following one founder and one mentor end to end Highlight the “why this match” explanation, the booking conflict protection and the AI copilot Record a short, clean demo |
| **Done when** | A rehearsed demo under the time limit that shows the full working flow. |
| **Depends on** | 9.3 |

### Sprint 10.3 — Final QA and freeze

| **Goal** | No surprises on submission day. |
| --- | --- |
| **Build** | Full manual run through every role on the deployed build Fix list, then code freeze and tagged release Verify links, credentials and demo accounts |
| **Done when** | A tagged release is deployed, tested and ready to submit. |
| **Depends on** | 10.1, 10.2 |

# 6. Definition of Done (applies to every sprint)

- Complete files delivered, no partial diffs or placeholders

- Migration included if the sprint touches the schema

- Shared Zod schemas used on both ends where data crosses the API

- Typecheck and lint pass; relevant tests added

- “Done when” condition verified by running the app

- Committed with a clear message

# 7. Risks and Mitigations

| **Risk** | **Mitigation** |
| --- | --- |
| Groq free-tier rate limits | Queue and cache every LLM call; template fallback keeps the product working |
| Local embedding model slows the worker | Load once, warm up on boot, hash content to skip unchanged profiles |
| Google Calendar setup friction | Treat as optional; .ics and manual links are the guaranteed path |
| Scope size | Phases 1–6 are the core product and Phase 9–10 are the submission essentials; Phases 7 and 8 deepen it and can be trimmed last |
| Thin demo data hides matching quality | Sprint 9.3 seeds realistic, varied profiles |
| Time-zone bugs in scheduling | Store everything in UTC, convert at the edges, test across zones |

# 8. Decisions to Confirm Before Sprint 1.1

- **Embeddings:** confirm the local model approach described in Section 2.3.

- **Google Calendar and Meet:** go or no-go. It needs a Google Cloud project; without it, Sprint 5.5 ships the .ics and manual-link path.

- **Hosting:** confirm where the API and database will live (Railway, Render, VPS) so Sprint 9.4 has no surprises.

- **Chat (Sprint 7.5):** keep or defer. It is the most optional sprint in the plan.

- **Product name:** MentorLoop is a working title and can change anytime.

Page