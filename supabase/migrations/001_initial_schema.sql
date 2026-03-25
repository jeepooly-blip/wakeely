-- ============================================================
-- Wakeela · Migration 001 · Full Schema v1.1
-- PRD Section 8.2
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM types (safe re-run) ─────────────────────────────────
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('client','lawyer','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_tier AS ENUM ('basic','pro','premium'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE data_region AS ENUM ('uae','ksa','eu'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE case_status AS ENUM ('active','closed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE case_type AS ENUM ('employment','family','commercial','property','criminal','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE deadline_type AS ENUM ('court','submission','internal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE deadline_status AS ENUM ('pending','completed','missed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE nde_severity AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('active','past_due','canceled','trialing'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE currency_code AS ENUM ('AED','SAR','KWD','USD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lawyer_permission AS ENUM ('read','write'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── updated_at helper ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── 1. users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                     UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                  TEXT              UNIQUE NOT NULL,
  phone                  TEXT,
  full_name              TEXT              NOT NULL DEFAULT '',
  role                   user_role         NOT NULL DEFAULT 'client',
  locale                 TEXT              NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ar')),
  timezone               TEXT              NOT NULL DEFAULT 'Asia/Dubai',
  data_region            data_region       NOT NULL DEFAULT 'eu',
  subscription_tier      subscription_tier NOT NULL DEFAULT 'basic',
  avatar_url             TEXT,
  notification_email     BOOLEAN           NOT NULL DEFAULT TRUE,
  notification_whatsapp  BOOLEAN           NOT NULL DEFAULT FALSE,
  notification_sms       BOOLEAN           NOT NULL DEFAULT FALSE,
  quiet_hours_start      TEXT              NOT NULL DEFAULT '22:00',
  quiet_hours_end        TEXT              NOT NULL DEFAULT '07:00',
  mfa_enabled            BOOLEAN           NOT NULL DEFAULT FALSE,
  last_seen_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Trigger: sync auth.users → public.users on signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, locale, data_region)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client'),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'en'),
    COALESCE((NEW.raw_user_meta_data->>'data_region')::data_region, 'eu')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    locale      = EXCLUDED.locale,
    data_region = EXCLUDED.data_region,
    updated_at  = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. cases ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cases (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL,
  case_type         case_type   NOT NULL DEFAULT 'other',
  jurisdiction      TEXT,
  city              TEXT,
  status            case_status NOT NULL DEFAULT 'active',
  health_score      SMALLINT    NOT NULL DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
  lawyer_name       TEXT,
  lawyer_bar_number TEXT,
  lawyer_phone      TEXT,
  lawyer_email      TEXT,
  description       TEXT,
  draft_data        JSONB,
  draft_step        SMALLINT    DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS cases_updated_at ON public.cases;
CREATE TRIGGER cases_updated_at BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. case_lawyers ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.case_lawyers (
  id          UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id     UUID              NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  lawyer_id   UUID              NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  permissions lawyer_permission NOT NULL DEFAULT 'read',
  UNIQUE (case_id, lawyer_id)
);

-- ── 4. timeline_events — IMMUTABLE (no UPDATE/DELETE ever) ───
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id             UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_id            UUID        NOT NULL,
  event_type          TEXT        NOT NULL,
  payload             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_system_generated BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. documents ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id     UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  uploader_id UUID        NOT NULL REFERENCES public.users(id),
  file_path   TEXT        NOT NULL,
  file_name   TEXT        NOT NULL,
  file_size   BIGINT      NOT NULL CHECK (file_size > 0),
  file_hash   TEXT        NOT NULL,
  mime_type   TEXT,
  version     SMALLINT    NOT NULL DEFAULT 1,
  parent_id   UUID        REFERENCES public.documents(id),
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. deadlines ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deadlines (
  id            UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id       UUID            NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title         TEXT            NOT NULL,
  description   TEXT,
  due_date      TIMESTAMPTZ     NOT NULL,
  type          deadline_type   NOT NULL DEFAULT 'court',
  reminder_days SMALLINT[]      NOT NULL DEFAULT '{7,3,1}',
  status        deadline_status NOT NULL DEFAULT 'pending',
  created_by    UUID            NOT NULL REFERENCES public.users(id),
  completed_at  TIMESTAMPTZ,
  completed_by  UUID            REFERENCES public.users(id),
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS deadlines_updated_at ON public.deadlines;
CREATE TRIGGER deadlines_updated_at BEFORE UPDATE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 7. messages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  sender_id         UUID        NOT NULL REFERENCES public.users(id),
  content_encrypted TEXT        NOT NULL,
  read_at           TIMESTAMPTZ,
  attachment_doc_id UUID        REFERENCES public.documents(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 8. nde_flags ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nde_flags (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id      UUID         NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  rule_id      SMALLINT     NOT NULL CHECK (rule_id BETWEEN 1 AND 7),
  triggered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  severity     nde_severity NOT NULL,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID         REFERENCES public.users(id),
  action_taken TEXT
);

-- ── 9. subscriptions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID                NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_subscription_id   TEXT                UNIQUE,
  stripe_customer_id       TEXT,
  hyperpay_subscription_id TEXT,
  tier                     subscription_tier   NOT NULL DEFAULT 'basic',
  status                   subscription_status NOT NULL DEFAULT 'active',
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN             NOT NULL DEFAULT FALSE,
  currency                 currency_code       NOT NULL DEFAULT 'USD',
  amount_cents             INTEGER,
  created_at               TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 10. consent_logs (GDPR/PDPL immutable) ───────────────────
CREATE TABLE IF NOT EXISTS public.consent_logs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  consent_type TEXT        NOT NULL,
  version      TEXT        NOT NULL DEFAULT '2026-03-01',
  ip_address   INET,
  user_agent   TEXT,
  granted      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 11. audit_logs (immutable) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        REFERENCES public.users(id),
  action      TEXT        NOT NULL,
  resource    TEXT,
  resource_id UUID,
  ip_address  INET,
  metadata    JSONB       DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cases_client_id    ON public.cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status        ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_timeline_case_id    ON public.timeline_events(case_id);
CREATE INDEX IF NOT EXISTS idx_timeline_created    ON public.timeline_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_type       ON public.timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_docs_case_id        ON public.documents(case_id);
CREATE INDEX IF NOT EXISTS idx_docs_hash           ON public.documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_deadlines_case_id   ON public.deadlines(case_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date  ON public.deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status    ON public.deadlines(status);
CREATE INDEX IF NOT EXISTS idx_nde_case_id         ON public.nde_flags(case_id);
CREATE INDEX IF NOT EXISTS idx_nde_open            ON public.nde_flags(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nde_severity        ON public.nde_flags(severity);
CREATE INDEX IF NOT EXISTS idx_messages_case_id    ON public.messages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_lawyers_case   ON public.case_lawyers(case_id);
CREATE INDEX IF NOT EXISTS idx_case_lawyers_lawyer ON public.case_lawyers(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_consent_user_id     ON public.consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id       ON public.audit_logs(user_id);
