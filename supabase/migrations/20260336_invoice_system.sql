-- ================================================================
-- Invoice System (Jordan JoFotara-compliant legal invoicing)
--
-- Lawyer creates invoice against a case → items auto-pulled from
-- action_logs → client views & pays in portal → audit trail logged
--
-- Tables:
--   invoices              — master invoice record
--   invoice_items         — line items (services + disbursements)
--   disbursement_receipts — proof-of-payment uploads per disbursement
-- ================================================================

-- ── Enums ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'draft',      -- lawyer building it
    'sent',       -- delivered to client portal
    'viewed',     -- client opened it
    'paid',       -- payment confirmed
    'overdue',    -- past due date, not paid
    'cancelled'   -- voided
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_item_type AS ENUM (
    'professional_service',  -- billable hours
    'disbursement'           -- reimbursable expense (no markup)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── invoices ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              UUID          NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  lawyer_id            UUID          NOT NULL REFERENCES public.users(id),
  client_id            UUID          NOT NULL REFERENCES public.users(id),

  -- Invoice identity
  invoice_number       TEXT          NOT NULL,  -- e.g. INV-2026-04567 (auto-generated)
  invoice_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date             DATE          NOT NULL,  -- default invoice_date + 30 days

  -- JoFotara / tax fields
  jofotara_ref         TEXT,         -- assigned by JoFotara after submission
  tax_id               TEXT,         -- lawyer / firm VAT registration
  tax_rate             NUMERIC(5,2)  NOT NULL DEFAULT 16.00,  -- Jordan GST 16%

  -- Matter description
  matter_description   TEXT          NOT NULL,

  -- Computed totals (denormalised for fast queries)
  subtotal_services    NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_disbursements NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency             TEXT          NOT NULL DEFAULT 'JOD',

  -- Retainer
  retainer_applied     NUMERIC(12,2) NOT NULL DEFAULT 0,
  retainer_balance     NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Payment
  status               invoice_status NOT NULL DEFAULT 'draft',
  payment_method       TEXT,         -- bank_transfer | card | local_gateway
  payment_reference    TEXT,         -- bank ref / transaction id
  paid_at              TIMESTAMPTZ,
  payment_proof_path   TEXT,         -- storage path for payment receipt

  -- Notes
  notes                TEXT,
  late_payment_rate    NUMERIC(5,2)  DEFAULT 1.50,  -- % per month

  -- Audit
  sent_at              TIMESTAMPTZ,
  viewed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Auto-generate invoice numbers: INV-YYYY-NNNNN
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1000;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-'
      || LPAD(nextval('invoice_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_invoice_number ON public.invoices;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- Auto-set due_date = invoice_date + 30 days if not provided
CREATE OR REPLACE FUNCTION public.set_invoice_due_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := NEW.invoice_date + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_invoice_due_date ON public.invoices;
CREATE TRIGGER set_invoice_due_date
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_due_date();

-- updated_at trigger
DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── invoice_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID          NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_type       invoice_item_type NOT NULL DEFAULT 'professional_service',
  sort_order      INTEGER       NOT NULL DEFAULT 0,

  -- Link to source data (optional — for auto-pull from action_logs)
  action_log_id   UUID          REFERENCES public.action_logs(id) ON DELETE SET NULL,

  item_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT          NOT NULL,

  -- Professional services: hours × rate
  hours           NUMERIC(8,2),
  rate            NUMERIC(12,2),

  -- Disbursements: quantity × unit_cost (usually 1 × actual cost)
  quantity        NUMERIC(8,2)  NOT NULL DEFAULT 1,
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Computed
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,  -- hours*rate OR qty*unit_cost

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Auto-compute amount before insert/update
CREATE OR REPLACE FUNCTION public.compute_invoice_item_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.item_type = 'professional_service' THEN
    NEW.amount := COALESCE(NEW.hours, 0) * COALESCE(NEW.rate, 0);
  ELSE
    NEW.amount := COALESCE(NEW.quantity, 1) * COALESCE(NEW.unit_cost, 0);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS compute_item_amount ON public.invoice_items;
CREATE TRIGGER compute_item_amount
  BEFORE INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_invoice_item_amount();

-- Recalculate invoice totals whenever items change
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_services      NUMERIC(12,2);
  v_disbursements NUMERIC(12,2);
  v_tax_rate      NUMERIC(5,2);
  v_tax           NUMERIC(12,2);
  v_total         NUMERIC(12,2);
  v_retainer      NUMERIC(12,2);
BEGIN
  -- Use invoice_id from whichever row triggered this
  DECLARE v_invoice_id UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
  BEGIN
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE item_type = 'professional_service'), 0),
      COALESCE(SUM(amount) FILTER (WHERE item_type = 'disbursement'), 0)
    INTO v_services, v_disbursements
    FROM public.invoice_items
    WHERE invoice_id = v_invoice_id;

    SELECT tax_rate, retainer_applied
    INTO v_tax_rate, v_retainer
    FROM public.invoices
    WHERE id = v_invoice_id;

    v_tax   := ROUND((v_services + v_disbursements) * v_tax_rate / 100, 2);
    v_total := v_services + v_disbursements + v_tax - COALESCE(v_retainer, 0);

    UPDATE public.invoices SET
      subtotal_services      = v_services,
      subtotal_disbursements = v_disbursements,
      tax_amount             = v_tax,
      total_amount           = GREATEST(v_total, 0),
      updated_at             = now()
    WHERE id = v_invoice_id;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS invoice_totals_on_item_change ON public.invoice_items;
CREATE TRIGGER invoice_totals_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_invoice_totals();

-- ── disbursement_receipts ─────────────────────────────────────────
-- Proof uploads for every disbursement line item
CREATE TABLE IF NOT EXISTS public.disbursement_receipts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id UUID          NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  uploaded_by     UUID          NOT NULL REFERENCES public.users(id),
  file_path       TEXT          NOT NULL,  -- Supabase storage path
  file_name       TEXT          NOT NULL,
  file_size       INTEGER,
  file_hash       TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_case_id     ON public.invoices(case_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lawyer_id   ON public.invoices(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id   ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_inv    ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_disbursement_item    ON public.disbursement_receipts(invoice_item_id);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disbursement_receipts ENABLE ROW LEVEL SECURITY;

-- Invoices: lawyer can manage their own; client can view invoices on their cases
CREATE POLICY "invoice_lawyer_all"
  ON public.invoices FOR ALL
  USING  (lawyer_id = auth.uid())
  WITH CHECK (lawyer_id = auth.uid());

CREATE POLICY "invoice_client_select"
  ON public.invoices FOR SELECT
  USING (client_id = auth.uid() AND status != 'draft');

-- Items: same access pattern as parent invoice
CREATE POLICY "invoice_items_lawyer_all"
  ON public.invoice_items FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.lawyer_id = auth.uid()));

CREATE POLICY "invoice_items_client_select"
  ON public.invoice_items FOR SELECT
  USING  (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.client_id = auth.uid() AND i.status != 'draft'));

-- Receipts: same pattern
CREATE POLICY "receipts_lawyer_all"
  ON public.disbursement_receipts FOR ALL
  USING  (uploaded_by = auth.uid());

CREATE POLICY "receipts_client_select"
  ON public.disbursement_receipts FOR SELECT
  USING  (EXISTS (
    SELECT 1 FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.id = invoice_item_id
      AND i.client_id = auth.uid()
      AND i.status != 'draft'
  ));

-- ── Extend notifications CHECK for invoice events ─────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'nde_flag','deadline_reminder','lawyer_joined','lawyer_action',
    'chat_message','escalation_sent','subscription_updated','system',
    'invoice_issued','invoice_paid','invoice_overdue'
  ));

-- ── Storage bucket policy for disbursement receipts ───────────────
-- Create the 'disbursement-receipts' bucket in Supabase dashboard,
-- then run these policies.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('disbursement-receipts', 'disbursement-receipts', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_upload_own" ON storage.objects;
CREATE POLICY "receipts_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'disbursement-receipts'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

DROP POLICY IF EXISTS "receipts_read_participant" ON storage.objects;
CREATE POLICY "receipts_read_participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'disbursement-receipts'
    AND (
      auth.uid()::text = (string_to_array(name, '/'))[1]
      OR EXISTS (
        SELECT 1 FROM public.disbursement_receipts dr
        JOIN public.invoice_items ii ON ii.id = dr.invoice_item_id
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE dr.file_path = name AND inv.client_id = auth.uid()
      )
    )
  );
