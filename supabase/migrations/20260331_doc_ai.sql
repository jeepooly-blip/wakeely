-- ================================================================
-- AI Document Analysis — Migration
-- ================================================================

-- Store AI extraction results per document
CREATE TABLE IF NOT EXISTS public.document_analyses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  case_id          UUID        REFERENCES public.cases(id) ON DELETE SET NULL,
  document_id      UUID        REFERENCES public.documents(id) ON DELETE SET NULL,
  file_name        TEXT        NOT NULL,
  file_size        INTEGER,
  detected_lang    TEXT        NOT NULL DEFAULT 'en' CHECK (detected_lang IN ('en','ar','mixed')),
  case_type        TEXT,
  case_title       TEXT,
  summary          TEXT,
  parties          JSONB       NOT NULL DEFAULT '[]',
  key_dates        JSONB       NOT NULL DEFAULT '[]',
  obligations      JSONB       NOT NULL DEFAULT '[]',
  risks            JSONB       NOT NULL DEFAULT '[]',
  next_actions     JSONB       NOT NULL DEFAULT '[]',
  risk_score       TEXT        CHECK (risk_score IN ('low','medium','high')),
  raw_ai_response  JSONB,
  confirmed        BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_analyses_user ON public.document_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_analyses_case ON public.document_analyses(case_id);

ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_analyses_own" ON public.document_analyses
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
