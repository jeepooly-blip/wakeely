-- ================================================================
-- Hijri Calendar Toggle (PRD §7.1 — Gap Analysis Task 7)
--
-- Adds a per-user preference for showing Hijri dates alongside
-- Gregorian dates in the deadline tracker and timeline views.
-- Default: false (Gregorian only).
-- ================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hijri_calendar BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.hijri_calendar IS
  'When true, UI shows Hijri (islamic-umalqura) date alongside Gregorian. Court dates always show Gregorian in parentheses for legal accuracy.';
