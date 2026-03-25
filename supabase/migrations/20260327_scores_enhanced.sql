-- ================================================================
-- Enhanced Lawyer Performance Score + Case Health Score
-- PRD Section 3.2
-- ================================================================

-- 1. Store computed lawyer score per case (cached, refreshed on events)
CREATE TABLE IF NOT EXISTS public.lawyer_scores (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  lawyer_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total            SMALLINT    NOT NULL DEFAULT 0,
  activity         SMALLINT    NOT NULL DEFAULT 0,
  recency          SMALLINT    NOT NULL DEFAULT 0,
  deadline_respect SMALLINT    NOT NULL DEFAULT 0,
  responsiveness   SMALLINT    NOT NULL DEFAULT 0,
  logs_count       INTEGER     NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, lawyer_id)
);

CREATE INDEX IF NOT EXISTS idx_lawyer_scores_case   ON public.lawyer_scores(case_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_scores_lawyer ON public.lawyer_scores(lawyer_id);

ALTER TABLE public.lawyer_scores ENABLE ROW LEVEL SECURITY;

-- Client can read scores for their own cases only
CREATE POLICY "lawyer_scores_client_read" ON public.lawyer_scores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE id = lawyer_scores.case_id AND client_id = auth.uid())
  );

-- Service role (cron) can write
CREATE POLICY "lawyer_scores_service_write" ON public.lawyer_scores
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Enhanced calculate_health_score — now includes document completeness + deadline proximity
CREATE OR REPLACE FUNCTION public.calculate_health_score(p_case_id UUID)
RETURNS SMALLINT
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_score           SMALLINT := 100;
  v_open_critical   INTEGER  := 0;
  v_open_high       INTEGER  := 0;
  v_open_medium     INTEGER  := 0;
  v_missed          INTEGER  := 0;
  v_pending         INTEGER  := 0;
  v_last_activity   TIMESTAMPTZ;
  v_days_idle       NUMERIC;
  v_doc_count       INTEGER  := 0;
  v_next_deadline   TIMESTAMPTZ;
  v_days_to_next    NUMERIC;
  v_lawyer_assigned BOOLEAN  := false;
BEGIN
  -- NDE flags
  SELECT
    COUNT(*) FILTER (WHERE severity = 'critical' AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE severity = 'high'     AND resolved_at IS NULL),
    COUNT(*) FILTER (WHERE severity = 'medium'   AND resolved_at IS NULL)
  INTO v_open_critical, v_open_high, v_open_medium
  FROM public.nde_flags WHERE case_id = p_case_id;

  -- Missed and pending deadlines
  SELECT
    COUNT(*) FILTER (WHERE status = 'missed'),
    COUNT(*) FILTER (WHERE status = 'pending')
  INTO v_missed, v_pending
  FROM public.deadlines WHERE case_id = p_case_id;

  -- Days since last timeline activity
  SELECT MAX(created_at) INTO v_last_activity
  FROM public.timeline_events WHERE case_id = p_case_id;
  v_days_idle := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_last_activity, NOW() - INTERVAL '1 day'))) / 86400;

  -- Document count (completeness bonus/penalty)
  SELECT COUNT(*) INTO v_doc_count FROM public.documents WHERE case_id = p_case_id;

  -- Next deadline proximity
  SELECT MIN(due_date) INTO v_next_deadline
  FROM public.deadlines WHERE case_id = p_case_id AND status = 'pending' AND due_date > NOW();
  IF v_next_deadline IS NOT NULL THEN
    v_days_to_next := EXTRACT(EPOCH FROM (v_next_deadline - NOW())) / 86400;
  END IF;

  -- Lawyer assigned?
  SELECT EXISTS (
    SELECT 1 FROM public.case_lawyers
    WHERE case_id = p_case_id AND status = 'active'
  ) INTO v_lawyer_assigned;

  -- ── Deductions ──────────────────────────────────────────────
  -- NDE flags
  v_score := v_score - (v_open_critical * 30);
  v_score := v_score - (v_open_high     * 20);
  v_score := v_score - (v_open_medium   * 10);

  -- Missed deadlines
  v_score := v_score - (v_missed * 15);

  -- Inactivity: -5 per day over 7 idle days (max -30)
  IF v_days_idle > 7 THEN
    v_score := v_score - LEAST(FLOOR((v_days_idle - 7) * 5)::INTEGER, 30);
  END IF;

  -- Upcoming deadline pressure: -10 if < 3 days to next deadline
  IF v_days_to_next IS NOT NULL AND v_days_to_next < 3 THEN
    v_score := v_score - 10;
  END IF;

  -- ── Bonuses ─────────────────────────────────────────────────
  -- Documents uploaded: +2 per doc up to +10
  v_score := v_score + LEAST(v_doc_count * 2, 10);

  -- Lawyer assigned: +5
  IF v_lawyer_assigned THEN
    v_score := v_score + 5;
  END IF;

  RETURN GREATEST(LEAST(v_score, 100), 0);
END; $$;

-- 3. Trigger health update on MORE events (not just NDE flags)
CREATE OR REPLACE FUNCTION public.update_health_on_any_event()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE v_cid UUID;
BEGIN
  v_cid := COALESCE(
    CASE TG_TABLE_NAME
      WHEN 'timeline_events' THEN COALESCE(NEW.case_id, OLD.case_id)
      WHEN 'deadlines'       THEN COALESCE(NEW.case_id, OLD.case_id)
      WHEN 'documents'       THEN COALESCE(NEW.case_id, OLD.case_id)
      WHEN 'case_lawyers'    THEN COALESCE(NEW.case_id, OLD.case_id)
      ELSE NULL
    END
  );
  IF v_cid IS NOT NULL THEN
    UPDATE public.cases
    SET health_score = public.calculate_health_score(v_cid),
        updated_at   = NOW()
    WHERE id = v_cid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

-- Attach to all relevant tables
DROP TRIGGER IF EXISTS health_on_timeline  ON public.timeline_events;
DROP TRIGGER IF EXISTS health_on_deadlines ON public.deadlines;
DROP TRIGGER IF EXISTS health_on_documents ON public.documents;
DROP TRIGGER IF EXISTS health_on_lawyers   ON public.case_lawyers;

CREATE TRIGGER health_on_timeline
  AFTER INSERT OR UPDATE ON public.timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.update_health_on_any_event();

CREATE TRIGGER health_on_deadlines
  AFTER INSERT OR UPDATE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.update_health_on_any_event();

CREATE TRIGGER health_on_documents
  AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_health_on_any_event();

CREATE TRIGGER health_on_lawyers
  AFTER INSERT OR UPDATE ON public.case_lawyers
  FOR EACH ROW EXECUTE FUNCTION public.update_health_on_any_event();

-- 4. Function: compute and cache lawyer score (called by cron + on-demand)
CREATE OR REPLACE FUNCTION public.compute_lawyer_score(p_case_id UUID, p_lawyer_id UUID)
RETURNS SMALLINT
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_case_created   TIMESTAMPTZ;
  v_case_age_days  NUMERIC;
  v_logs_count     INTEGER := 0;
  v_last_log       TIMESTAMPTZ;
  v_first_log      TIMESTAMPTZ;
  v_completed_dls  INTEGER := 0;
  v_missed_dls     INTEGER := 0;
  v_activity       SMALLINT;
  v_recency        SMALLINT;
  v_dl_respect     SMALLINT;
  v_responsiveness SMALLINT;
  v_total          SMALLINT;
  v_logs_per_week  NUMERIC;
  v_days_since     NUMERIC;
  v_hours_to_first NUMERIC;
BEGIN
  -- Case age
  SELECT created_at INTO v_case_created FROM public.cases WHERE id = p_case_id;
  v_case_age_days := GREATEST(EXTRACT(EPOCH FROM (NOW() - v_case_created)) / 86400, 1);

  -- Action logs
  SELECT COUNT(*), MAX(created_at), MIN(created_at)
  INTO v_logs_count, v_last_log, v_first_log
  FROM public.action_logs
  WHERE case_id = p_case_id AND lawyer_id = p_lawyer_id;

  -- Deadlines
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'missed')
  INTO v_completed_dls, v_missed_dls
  FROM public.deadlines WHERE case_id = p_case_id;

  -- 1. Activity score (logs per 7-day period)
  v_logs_per_week := v_logs_count::NUMERIC / GREATEST(v_case_age_days / 7.0, 1);
  v_activity := LEAST(100, ROUND(v_logs_per_week * 25)::INTEGER)::SMALLINT;

  -- 2. Recency score
  IF v_last_log IS NULL THEN
    v_days_since := v_case_age_days;
  ELSE
    v_days_since := EXTRACT(EPOCH FROM (NOW() - v_last_log)) / 86400;
  END IF;
  v_recency := GREATEST(0, ROUND(100 - v_days_since * 3.5))::SMALLINT;

  -- 3. Deadline respect
  IF (v_completed_dls + v_missed_dls) = 0 THEN
    v_dl_respect := 75;
  ELSE
    v_dl_respect := ROUND(v_completed_dls::NUMERIC / (v_completed_dls + v_missed_dls) * 100)::SMALLINT;
  END IF;

  -- 4. Responsiveness (hours to first log)
  IF v_first_log IS NULL THEN
    v_responsiveness := 50;
  ELSE
    v_hours_to_first := EXTRACT(EPOCH FROM (v_first_log - v_case_created)) / 3600;
    IF    v_hours_to_first <= 24  THEN v_responsiveness := 100;
    ELSIF v_hours_to_first <= 72  THEN v_responsiveness := 80;
    ELSIF v_hours_to_first <= 168 THEN v_responsiveness := 50;
    ELSE                               v_responsiveness := 20;
    END IF;
  END IF;

  -- Weighted total
  v_total := ROUND(
    v_activity      * 0.30 +
    v_recency       * 0.30 +
    v_dl_respect    * 0.25 +
    v_responsiveness * 0.15
  )::SMALLINT;

  -- Upsert cache
  INSERT INTO public.lawyer_scores
    (case_id, lawyer_id, total, activity, recency, deadline_respect, responsiveness, logs_count, last_activity_at, computed_at)
  VALUES
    (p_case_id, p_lawyer_id, v_total, v_activity, v_recency, v_dl_respect, v_responsiveness, v_logs_count, v_last_log, NOW())
  ON CONFLICT (case_id, lawyer_id) DO UPDATE SET
    total            = EXCLUDED.total,
    activity         = EXCLUDED.activity,
    recency          = EXCLUDED.recency,
    deadline_respect = EXCLUDED.deadline_respect,
    responsiveness   = EXCLUDED.responsiveness,
    logs_count       = EXCLUDED.logs_count,
    last_activity_at = EXCLUDED.last_activity_at,
    computed_at      = NOW();

  RETURN v_total;
END; $$;

-- 5. Trigger: recompute lawyer score when action_logs changes
CREATE OR REPLACE FUNCTION public.update_lawyer_score_on_log()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.compute_lawyer_score(
    COALESCE(NEW.case_id, OLD.case_id),
    COALESCE(NEW.lawyer_id, OLD.lawyer_id)
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS lawyer_score_on_log ON public.action_logs;
CREATE TRIGGER lawyer_score_on_log
  AFTER INSERT OR UPDATE OR DELETE ON public.action_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_lawyer_score_on_log();

-- 6. Bulk refresh function (called by cron)
CREATE OR REPLACE FUNCTION public.refresh_all_scores()
RETURNS INTEGER
SECURITY DEFINER SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT cl.case_id, cl.lawyer_id
    FROM public.case_lawyers cl
    JOIN public.cases c ON c.id = cl.case_id AND c.status = 'active'
    WHERE cl.status = 'active'
  LOOP
    PERFORM public.compute_lawyer_score(r.case_id, r.lawyer_id);
    -- Also refresh health
    UPDATE public.cases SET health_score = public.calculate_health_score(r.case_id) WHERE id = r.case_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;
