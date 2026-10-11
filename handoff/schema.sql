--
-- PostgreSQL database dump
--

\restrict XIKiQDmrLfOWJLjXiocOfpClClSjKXIpKp5fhlc0Wd7Om74G4aa23CtjP2fECwt

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg12+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg12+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: connection_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.connection_state AS ENUM (
    'requested',
    'invited',
    'accepted',
    'declined',
    'withdrawn',
    'expired'
);


--
-- Name: match_candidate_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_candidate_type AS ENUM (
    'mentor',
    'startup'
);


--
-- Name: match_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_event_type AS ENUM (
    'view',
    'save',
    'dismiss',
    'request'
);


--
-- Name: session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.session_status AS ENUM (
    'scheduled',
    'rescheduled',
    'cancelled',
    'completed',
    'no_show'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'founder',
    'mentor',
    'admin'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'pending_approval',
    'rejected',
    'suspended'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: availability_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mentor_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT availability_exceptions_positive_window_ck CHECK ((starts_at < ends_at))
);


--
-- Name: availability_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mentor_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT availability_rules_day_ck CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT availability_rules_positive_window_ck CHECK ((start_time < end_time))
);


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    startup_id uuid NOT NULL,
    mentor_id uuid NOT NULL,
    initiated_by uuid NOT NULL,
    state public.connection_state NOT NULL,
    intro_message text,
    responded_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_declined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT connections_decline_timestamp_ck CHECK (((state <> 'declined'::public.connection_state) OR (last_declined_at IS NOT NULL))),
    CONSTRAINT connections_pending_expiry_ck CHECK (((state <> ALL (ARRAY['requested'::public.connection_state, 'invited'::public.connection_state])) OR (expires_at IS NOT NULL)))
);


--
-- Name: domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: founder_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.founder_profiles (
    user_id uuid NOT NULL,
    founder_title text,
    linkedin_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_calendar_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_calendar_accounts (
    user_id uuid NOT NULL,
    encrypted_refresh_token text NOT NULL,
    calendar_id text DEFAULT 'primary'::text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: match_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    candidate_type public.match_candidate_type NOT NULL,
    candidate_mentor_id uuid,
    candidate_startup_id uuid,
    event_type public.match_event_type NOT NULL,
    dismissal_reason text,
    connection_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_events_candidate_kind_ck CHECK ((((candidate_type = 'mentor'::public.match_candidate_type) AND (candidate_mentor_id IS NOT NULL) AND (candidate_startup_id IS NULL)) OR ((candidate_type = 'startup'::public.match_candidate_type) AND (candidate_startup_id IS NOT NULL) AND (candidate_mentor_id IS NULL)))),
    CONSTRAINT match_events_connection_ck CHECK ((((event_type = 'request'::public.match_event_type) AND (connection_id IS NOT NULL)) OR ((event_type <> 'request'::public.match_event_type) AND (connection_id IS NULL)))),
    CONSTRAINT match_events_reason_ck CHECK ((((event_type = 'dismiss'::public.match_event_type) AND ((dismissal_reason IS NULL) OR (char_length(dismissal_reason) <= 500))) OR ((event_type <> 'dismiss'::public.match_event_type) AND (dismissal_reason IS NULL))))
);


--
-- Name: match_explanations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_explanations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    startup_content_hash text NOT NULL,
    mentor_content_hash text NOT NULL,
    explanation text NOT NULL,
    source text NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT match_explanations_source_ck CHECK ((source = ANY (ARRAY['groq'::text, 'template'::text])))
);


--
-- Name: mentor_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_domains (
    mentor_id uuid NOT NULL,
    domain_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: mentor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_profiles (
    user_id uuid NOT NULL,
    "current_role" text,
    organization text,
    bio text,
    experience_summary text,
    years_experience integer,
    help_topics text,
    max_mentees integer,
    session_length_minutes integer,
    timezone text,
    preferred_session_times jsonb DEFAULT '[]'::jsonb NOT NULL,
    linkedin_url text,
    website_url text,
    is_complete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    buffer_minutes integer DEFAULT 0 NOT NULL,
    minimum_notice_minutes integer DEFAULT 0 NOT NULL,
    CONSTRAINT mentor_profiles_buffer_nonnegative_ck CHECK ((buffer_minutes >= 0)),
    CONSTRAINT mentor_profiles_minimum_notice_nonnegative_ck CHECK ((minimum_notice_minutes >= 0))
);


--
-- Name: mentor_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_skills (
    mentor_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: mentor_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_stages (
    mentor_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: profile_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    startup_id uuid,
    mentor_id uuid,
    embedding public.vector(384) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    content_hash text DEFAULT ''::text NOT NULL,
    CONSTRAINT profile_embeddings_exactly_one_profile_ck CHECK ((num_nonnulls(startup_id, mentor_id) = 1))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    user_agent text,
    ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_action_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_action_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    created_by uuid,
    submission_id uuid NOT NULL,
    submission_index integer NOT NULL,
    title text NOT NULL,
    description text,
    owner text NOT NULL,
    due_date date,
    priority text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_action_items_description_ck CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT session_action_items_owner_ck CHECK ((owner = ANY (ARRAY['founder'::text, 'mentor'::text, 'shared'::text, 'unassigned'::text]))),
    CONSTRAINT session_action_items_priority_ck CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT session_action_items_status_ck CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'blocked'::text]))),
    CONSTRAINT session_action_items_submission_index_ck CHECK (((submission_index >= 0) AND (submission_index <= 19))),
    CONSTRAINT session_action_items_title_ck CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);


--
-- Name: session_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    founder_id uuid NOT NULL,
    current_status text NOT NULL,
    specific_questions text NOT NULL,
    desired_outcome text NOT NULL,
    content_hash text NOT NULL,
    digest jsonb,
    digest_status text DEFAULT 'pending'::text NOT NULL,
    digest_model text,
    digest_generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_briefs_content_hash_ck CHECK ((content_hash ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT session_briefs_current_status_ck CHECK (((length(btrim(current_status)) >= 1) AND (length(btrim(current_status)) <= 2000))),
    CONSTRAINT session_briefs_desired_outcome_ck CHECK (((length(btrim(desired_outcome)) >= 1) AND (length(btrim(desired_outcome)) <= 2000))),
    CONSTRAINT session_briefs_digest_status_ck CHECK ((digest_status = ANY (ARRAY['pending'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT session_briefs_specific_questions_ck CHECK (((length(btrim(specific_questions)) >= 1) AND (length(btrim(specific_questions)) <= 2000)))
);


--
-- Name: session_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    actor_user_id uuid,
    event_type text NOT NULL,
    from_status public.session_status,
    to_status public.session_status,
    old_starts_at timestamp with time zone,
    old_ends_at timestamp with time zone,
    new_starts_at timestamp with time zone,
    new_ends_at timestamp with time zone,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_events_type_ck CHECK ((event_type = ANY (ARRAY['created'::text, 'rescheduled'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text, 'meeting_link_updated'::text])))
);


--
-- Name: session_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    author_user_id uuid NOT NULL,
    rated_mentor_id uuid,
    rating integer NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    comment text,
    visibility text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_feedback_comment_length_ck CHECK (((comment IS NULL) OR (char_length(comment) <= 2000))),
    CONSTRAINT session_feedback_rating_ck CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT session_feedback_tags_ck CHECK ((tags <@ ARRAY['communication'::text, 'preparedness'::text, 'actionable_advice'::text, 'domain_expertise'::text, 'follow_through'::text, 'empathy'::text, 'other'::text])),
    CONSTRAINT session_feedback_visibility_ck CHECK ((visibility = ANY (ARRAY['public_to_mentor'::text, 'admin_private'::text])))
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    mentor_id uuid NOT NULL,
    startup_id uuid NOT NULL,
    time_range tstzrange NOT NULL,
    status public.session_status DEFAULT 'scheduled'::public.session_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_actor_user_id uuid,
    idempotency_key uuid,
    meeting_url text,
    google_event_id text,
    calendar_owner_user_id uuid,
    CONSTRAINT sessions_nonempty_half_open_range_ck CHECK (((NOT isempty(time_range)) AND lower_inc(time_range) AND (NOT upper_inc(time_range)) AND (NOT lower_inf(time_range)) AND (NOT upper_inf(time_range))))
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    display_order integer NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: startup_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startup_domains (
    startup_id uuid NOT NULL,
    domain_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


--
-- Name: startup_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startup_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    startup_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    milestone_date date NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    related_session_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT startup_milestones_description_ck CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT startup_milestones_status_ck CHECK ((status = ANY (ARRAY['planned'::text, 'achieved'::text, 'cancelled'::text]))),
    CONSTRAINT startup_milestones_title_ck CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);


--
-- Name: startup_stage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startup_stage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    startup_id uuid NOT NULL,
    previous_stage_id uuid,
    new_stage_id uuid NOT NULL,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: startups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.startups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    founder_id uuid NOT NULL,
    name text,
    one_liner text,
    description text,
    stage_id uuid,
    help_needed text,
    goals text,
    timezone text,
    preferred_session_times jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_complete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    email_verified_at timestamp with time zone,
    password_hash text,
    google_id text,
    full_name text NOT NULL,
    role public.user_role NOT NULL,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rejection_reason text,
    avatar_url text
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: availability_exceptions availability_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_exceptions
    ADD CONSTRAINT availability_exceptions_pkey PRIMARY KEY (id);


--
-- Name: availability_rules availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_rules
    ADD CONSTRAINT availability_rules_pkey PRIMARY KEY (id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: domains domains_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_name_unique UNIQUE (name);


--
-- Name: domains domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_pkey PRIMARY KEY (id);


--
-- Name: domains domains_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_slug_unique UNIQUE (slug);


--
-- Name: email_verifications email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);


--
-- Name: founder_profiles founder_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_profiles
    ADD CONSTRAINT founder_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: google_calendar_accounts google_calendar_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_accounts
    ADD CONSTRAINT google_calendar_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: match_events match_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_pkey PRIMARY KEY (id);


--
-- Name: match_explanations match_explanations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_explanations
    ADD CONSTRAINT match_explanations_pkey PRIMARY KEY (id);


--
-- Name: mentor_profiles mentor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_profiles
    ADD CONSTRAINT mentor_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: profile_embeddings profile_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_embeddings
    ADD CONSTRAINT profile_embeddings_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: session_action_items session_action_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_action_items
    ADD CONSTRAINT session_action_items_pkey PRIMARY KEY (id);


--
-- Name: session_briefs session_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_briefs
    ADD CONSTRAINT session_briefs_pkey PRIMARY KEY (id);


--
-- Name: session_events session_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_pkey PRIMARY KEY (id);


--
-- Name: session_feedback session_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_mentor_no_overlap_excl; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_mentor_no_overlap_excl EXCLUDE USING gist (mentor_id WITH =, time_range WITH &&) WHERE ((status = ANY (ARRAY['scheduled'::public.session_status, 'rescheduled'::public.session_status])));


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_startup_no_overlap_excl; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_startup_no_overlap_excl EXCLUDE USING gist (startup_id WITH =, time_range WITH &&) WHERE ((status = ANY (ARRAY['scheduled'::public.session_status, 'rescheduled'::public.session_status])));


--
-- Name: skills skills_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_name_unique UNIQUE (name);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: skills skills_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_slug_unique UNIQUE (slug);


--
-- Name: stages stages_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_name_unique UNIQUE (name);


--
-- Name: stages stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_pkey PRIMARY KEY (id);


--
-- Name: stages stages_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_slug_unique UNIQUE (slug);


--
-- Name: startup_milestones startup_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_milestones
    ADD CONSTRAINT startup_milestones_pkey PRIMARY KEY (id);


--
-- Name: startup_stage_events startup_stage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_stage_events
    ADD CONSTRAINT startup_stage_events_pkey PRIMARY KEY (id);


--
-- Name: startups startups_founder_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startups
    ADD CONSTRAINT startups_founder_id_unique UNIQUE (founder_id);


--
-- Name: startups startups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startups
    ADD CONSTRAINT startups_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: availability_exceptions_mentor_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX availability_exceptions_mentor_start_idx ON public.availability_exceptions USING btree (mentor_id, starts_at);


--
-- Name: availability_rules_mentor_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX availability_rules_mentor_day_idx ON public.availability_rules USING btree (mentor_id, day_of_week);


--
-- Name: availability_rules_window_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX availability_rules_window_uidx ON public.availability_rules USING btree (mentor_id, day_of_week, start_time, end_time);


--
-- Name: connections_identity_pair_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX connections_identity_pair_uidx ON public.connections USING btree (id, startup_id, mentor_id);


--
-- Name: connections_mentor_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_mentor_state_idx ON public.connections USING btree (mentor_id, state);


--
-- Name: connections_pair_declined_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_pair_declined_idx ON public.connections USING btree (startup_id, mentor_id, last_declined_at);


--
-- Name: connections_pair_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX connections_pair_uidx ON public.connections USING btree (startup_id, mentor_id);


--
-- Name: connections_startup_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX connections_startup_state_idx ON public.connections USING btree (startup_id, state);


--
-- Name: email_verifications_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verifications_user_created_idx ON public.email_verifications USING btree (user_id, created_at);


--
-- Name: match_events_action_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX match_events_action_uidx ON public.match_events USING btree (actor_user_id, candidate_type, candidate_mentor_id, candidate_startup_id, event_type) WHERE (event_type = ANY (ARRAY['save'::public.match_event_type, 'dismiss'::public.match_event_type]));


--
-- Name: match_events_actor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_events_actor_created_idx ON public.match_events USING btree (actor_user_id, created_at);


--
-- Name: match_events_actor_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_events_actor_type_created_idx ON public.match_events USING btree (actor_user_id, event_type, created_at);


--
-- Name: match_events_mentor_candidate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_events_mentor_candidate_idx ON public.match_events USING btree (candidate_mentor_id, event_type, created_at);


--
-- Name: match_events_startup_candidate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_events_startup_candidate_idx ON public.match_events USING btree (candidate_startup_id, event_type, created_at);


--
-- Name: match_explanations_versions_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX match_explanations_versions_uidx ON public.match_explanations USING btree (startup_content_hash, mentor_content_hash);


--
-- Name: mentor_domains_pair_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mentor_domains_pair_uidx ON public.mentor_domains USING btree (mentor_id, domain_id);


--
-- Name: mentor_skills_pair_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mentor_skills_pair_uidx ON public.mentor_skills USING btree (mentor_id, skill_id);


--
-- Name: mentor_stages_pair_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mentor_stages_pair_uidx ON public.mentor_stages USING btree (mentor_id, stage_id);


--
-- Name: profile_embeddings_embedding_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profile_embeddings_embedding_hnsw_idx ON public.profile_embeddings USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: profile_embeddings_mentor_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_embeddings_mentor_uidx ON public.profile_embeddings USING btree (mentor_id);


--
-- Name: profile_embeddings_startup_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profile_embeddings_startup_uidx ON public.profile_embeddings USING btree (startup_id);


--
-- Name: refresh_tokens_family_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_family_id_idx ON public.refresh_tokens USING btree (family_id);


--
-- Name: refresh_tokens_token_hash_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX refresh_tokens_token_hash_uidx ON public.refresh_tokens USING btree (token_hash);


--
-- Name: refresh_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_id_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: session_action_items_session_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_action_items_session_created_idx ON public.session_action_items USING btree (session_id, created_at);


--
-- Name: session_action_items_submission_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_action_items_submission_uidx ON public.session_action_items USING btree (created_by, submission_id, submission_index);


--
-- Name: session_briefs_founder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_briefs_founder_idx ON public.session_briefs USING btree (founder_id);


--
-- Name: session_briefs_session_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_briefs_session_uidx ON public.session_briefs USING btree (session_id);


--
-- Name: session_events_session_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_events_session_created_idx ON public.session_events USING btree (session_id, created_at);


--
-- Name: session_feedback_mentor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_feedback_mentor_created_idx ON public.session_feedback USING btree (rated_mentor_id, created_at);


--
-- Name: session_feedback_session_author_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_feedback_session_author_uidx ON public.session_feedback USING btree (session_id, author_user_id);


--
-- Name: session_feedback_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_feedback_visibility_idx ON public.session_feedback USING btree (visibility, created_at);


--
-- Name: sessions_booking_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_booking_idempotency_uidx ON public.sessions USING btree (booking_actor_user_id, idempotency_key);


--
-- Name: sessions_connection_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_connection_status_idx ON public.sessions USING btree (connection_id, status);


--
-- Name: sessions_participants_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_participants_start_idx ON public.sessions USING btree (startup_id, mentor_id);


--
-- Name: startup_domains_pair_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX startup_domains_pair_uidx ON public.startup_domains USING btree (startup_id, domain_id);


--
-- Name: startup_milestones_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX startup_milestones_session_idx ON public.startup_milestones USING btree (related_session_id);


--
-- Name: startup_milestones_startup_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX startup_milestones_startup_date_idx ON public.startup_milestones USING btree (startup_id, milestone_date, id);


--
-- Name: startup_stage_events_change_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX startup_stage_events_change_uidx ON public.startup_stage_events USING btree (startup_id, previous_stage_id, new_stage_id, created_at);


--
-- Name: startup_stage_events_startup_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX startup_stage_events_startup_created_idx ON public.startup_stage_events USING btree (startup_id, created_at, id);


--
-- Name: users_email_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_uidx ON public.users USING btree (lower(email));


--
-- Name: users_google_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_google_id_uidx ON public.users USING btree (google_id);


--
-- Name: availability_exceptions availability_exceptions_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_exceptions
    ADD CONSTRAINT availability_exceptions_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: availability_rules availability_rules_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability_rules
    ADD CONSTRAINT availability_rules_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: connections connections_initiated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_initiated_by_users_id_fk FOREIGN KEY (initiated_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: connections connections_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: connections connections_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: email_verifications email_verifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: founder_profiles founder_profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.founder_profiles
    ADD CONSTRAINT founder_profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: google_calendar_accounts google_calendar_accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_calendar_accounts
    ADD CONSTRAINT google_calendar_accounts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: match_events match_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: match_events match_events_candidate_mentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_candidate_mentor_id_fkey FOREIGN KEY (candidate_mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: match_events match_events_candidate_startup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_candidate_startup_id_fkey FOREIGN KEY (candidate_startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: match_events match_events_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;


--
-- Name: mentor_domains mentor_domains_domain_id_domains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_domains
    ADD CONSTRAINT mentor_domains_domain_id_domains_id_fk FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: mentor_domains mentor_domains_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_domains
    ADD CONSTRAINT mentor_domains_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: mentor_profiles mentor_profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_profiles
    ADD CONSTRAINT mentor_profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mentor_skills mentor_skills_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_skills
    ADD CONSTRAINT mentor_skills_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: mentor_skills mentor_skills_skill_id_skills_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_skills
    ADD CONSTRAINT mentor_skills_skill_id_skills_id_fk FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: mentor_stages mentor_stages_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_stages
    ADD CONSTRAINT mentor_stages_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: mentor_stages mentor_stages_stage_id_stages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_stages
    ADD CONSTRAINT mentor_stages_stage_id_stages_id_fk FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: profile_embeddings profile_embeddings_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_embeddings
    ADD CONSTRAINT profile_embeddings_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: profile_embeddings profile_embeddings_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_embeddings
    ADD CONSTRAINT profile_embeddings_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_action_items session_action_items_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_action_items
    ADD CONSTRAINT session_action_items_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: session_action_items session_action_items_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_action_items
    ADD CONSTRAINT session_action_items_session_id_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_briefs session_briefs_founder_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_briefs
    ADD CONSTRAINT session_briefs_founder_id_users_id_fk FOREIGN KEY (founder_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_briefs session_briefs_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_briefs
    ADD CONSTRAINT session_briefs_session_id_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_events session_events_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: session_events session_events_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_session_id_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_feedback session_feedback_author_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_author_user_id_users_id_fk FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_feedback session_feedback_connection_id_connections_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_connection_id_connections_id_fk FOREIGN KEY (connection_id) REFERENCES public.connections(id) ON DELETE CASCADE;


--
-- Name: session_feedback session_feedback_rated_mentor_id_mentor_profiles_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_rated_mentor_id_mentor_profiles_user_id_fk FOREIGN KEY (rated_mentor_id) REFERENCES public.mentor_profiles(user_id) ON DELETE CASCADE;


--
-- Name: session_feedback session_feedback_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_feedback
    ADD CONSTRAINT session_feedback_session_id_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_booking_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_booking_actor_user_id_users_id_fk FOREIGN KEY (booking_actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_calendar_owner_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_calendar_owner_user_id_users_id_fk FOREIGN KEY (calendar_owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_connection_pair_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_connection_pair_fk FOREIGN KEY (connection_id, startup_id, mentor_id) REFERENCES public.connections(id, startup_id, mentor_id) ON DELETE CASCADE;


--
-- Name: startup_domains startup_domains_domain_id_domains_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_domains
    ADD CONSTRAINT startup_domains_domain_id_domains_id_fk FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: startup_domains startup_domains_startup_id_startup_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_domains
    ADD CONSTRAINT startup_domains_startup_id_startup_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: startup_milestones startup_milestones_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_milestones
    ADD CONSTRAINT startup_milestones_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: startup_milestones startup_milestones_related_session_id_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_milestones
    ADD CONSTRAINT startup_milestones_related_session_id_sessions_id_fk FOREIGN KEY (related_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: startup_milestones startup_milestones_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_milestones
    ADD CONSTRAINT startup_milestones_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: startup_stage_events startup_stage_events_actor_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_stage_events
    ADD CONSTRAINT startup_stage_events_actor_user_id_users_id_fk FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: startup_stage_events startup_stage_events_new_stage_id_stages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_stage_events
    ADD CONSTRAINT startup_stage_events_new_stage_id_stages_id_fk FOREIGN KEY (new_stage_id) REFERENCES public.stages(id) ON DELETE RESTRICT;


--
-- Name: startup_stage_events startup_stage_events_previous_stage_id_stages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_stage_events
    ADD CONSTRAINT startup_stage_events_previous_stage_id_stages_id_fk FOREIGN KEY (previous_stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- Name: startup_stage_events startup_stage_events_startup_id_startups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startup_stage_events
    ADD CONSTRAINT startup_stage_events_startup_id_startups_id_fk FOREIGN KEY (startup_id) REFERENCES public.startups(id) ON DELETE CASCADE;


--
-- Name: startups startups_founder_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startups
    ADD CONSTRAINT startups_founder_id_users_id_fk FOREIGN KEY (founder_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: startups startups_stage_id_stages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.startups
    ADD CONSTRAINT startups_stage_id_stages_id_fk FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict XIKiQDmrLfOWJLjXiocOfpClClSjKXIpKp5fhlc0Wd7Om74G4aa23CtjP2fECwt

