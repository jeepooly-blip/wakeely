-- ============================================================
-- Wakeela · Migration 004 · Helper Functions & Views
-- Run AFTER migration 003
-- ============================================================

-- ── Function: recalculate case health score ──────────────────
-- Called after any significant case update.
-- Score = 100, then deducted by open flags, inactivity, etc.
CREATE OR REPLACE FUNCTION public.calculate_health_score(p_case_id UUID)
RETURNS SMALLINT
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_score         SMALLINT := 100;
  v_open_critical INTEGER;
  v_open_high     INTEGER;
  v_open_medium   INTEGER;
  v_missed        INTEGER;
  v_last_activity TIMESTAMPTZ;
  v_days_idle     NUMERIC;
BEGIN
  -- Count open NDE flags by severity
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical' AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE severity = 'high'     AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE severity = 'medium'   AND resolved_at IS NULL)
  INTO v_open_critical, v_open_high, v_open_medium
  FROM public.nde_flags WHERE case_id = p_case_id;

  -- Count missed deadlines
  SELECT COUNT(*) INTO v_missed
  FROM public.deadlines
  WHERE case_id = p_case_id AND status = 'missed';

  -- Days since last activity
  SELECT MAX(created_at) INTO v_last_activity
  FROM public.timeline_events WHERE case_id = p_case_id;

  v_days_idle := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_last_activity, NOW()))) / 86400;

  -- Apply deductions
  v_score := v_score - (v_open_critical * 30);
  v_score := v_score - (v_open_high     * 20);
  v_score := v_score - (v_open_medium   * 10);
  v_score := v_score - (v_missed        * 15);

  -- Inactivity penalty: -5 per day over 7 days idle
  IF v_days_idle > 7 THEN
    v_score := v_score - LEAST(FLOOR((v_days_idle - 7) * 5)::INTEGER, 30);
  END IF;

  RETURN GREATEST(v_score, 0);
END; $$;

-- Trigger: auto-update health_score when NDE flag is inserted/resolved
CREATE OR REPLACE FUNCTION public.update_case_health_on_flag()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.cases
  SET health_score = public.calculate_health_score(
    COALESCE(NEW.case_id, OLD.case_id)
  )
  WHERE id = COALESCE(NEW.case_id, OLD.case_id);
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS nde_flag_health_update ON public.nde_flags;
CREATE TRIGGER nde_flag_health_update
  AFTER INSERT OR UPDATE ON public.nde_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_case_health_on_flag();

-- ── Function: get case summary for a user ────────────────────
CREATE OR REPLACE FUNCTION public.get_case_summary(p_user_id UUID)
RETURNS TABLE (
  case_id       UUID,
  title         TEXT,
  case_type     case_type,
  status        case_status,
  health_score  SMALLINT,
  open_flags    BIGINT,
  next_deadline TIMESTAMPTZ,
  last_activity TIMESTAMPTZ
)
SECURITY DEFINER SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT
    c.id,
    c.title,
    c.case_type,
    c.status,
    c.health_score,
    (SELECT COUNT(*) FROM public.nde_flags f
     WHERE f.case_id = c.id AND f.resolved_at IS NULL),
    (SELECT MIN(d.due_date) FROM public.deadlines d
     WHERE d.case_id = c.id AND d.status = 'pending' AND d.due_date > NOW()),
    (SELECT MAX(t.created_at) FROM public.timeline_events t
     WHERE t.case_id = c.id)
  FROM public.cases c
  WHERE c.client_id = p_user_id AND c.status = 'active'
  ORDER BY c.updated_at DESC;
$$;

-- ── View: active cases with derived fields ───────────────────
CREATE OR REPLACE VIEW public.v_active_cases AS
SELECT
  c.id,
  c.client_id,
  c.title,
  c.case_type,
  c.jurisdiction,
  c.status,
  c.health_score,
  c.lawyer_name,
  c.created_at,
  c.updated_at,
  (SELECT COUNT(*) FROM public.nde_flags f
   WHERE f.case_id = c.id AND f.resolved_at IS NULL) AS open_flags,
  (SELECT COUNT(*) FROM public.documents d
   WHERE d.case_id = c.id) AS document_count,
  (SELECT MAX(t.created_at) FROM public.timeline_events t
   WHERE t.case_id = c.id) AS last_activity_at,
  (SELECT MIN(d.due_date) FROM public.deadlines d
   WHERE d.case_id = c.id AND d.status = 'pending'
   AND d.due_date > NOW()) AS next_deadline
FROM public.cases c
WHERE c.status = 'active';

-- RLS still applies through the underlying tables
