-- ============================================================
-- Wakeela · Migration 003 · Storage Bucket Policies
-- Run AFTER migration 002
-- NOTE: Create the 'evidence-vault' bucket in Supabase Dashboard
-- first (Storage → New Bucket), then run this SQL.
-- ============================================================

-- Storage RLS: users can only access files under their own user_id path
-- Path format enforced: {case_id}/{uploader_id}/{filename}

-- Allow authenticated users to upload to their own path
DROP POLICY IF EXISTS "vault_insert_own" ON storage.objects;
CREATE POLICY "vault_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence-vault'
    AND auth.uid()::text = (string_to_array(name, '/'))[2]
  );

-- Allow case participants to read vault files
DROP POLICY IF EXISTS "vault_select_participant" ON storage.objects;
CREATE POLICY "vault_select_participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence-vault'
    AND (
      -- Client who owns the case
      EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id::text = (string_to_array(name, '/'))[1]
          AND c.client_id = auth.uid()
      )
      OR
      -- Active lawyer on the case
      EXISTS (
        SELECT 1 FROM public.case_lawyers cl
        WHERE cl.case_id::text = (string_to_array(name, '/'))[1]
          AND cl.lawyer_id    = auth.uid()
          AND cl.accepted_at  IS NOT NULL
          AND cl.revoked_at   IS NULL
      )
    )
  );

-- Allow uploaders to delete their own files (for version replacement)
DROP POLICY IF EXISTS "vault_delete_own" ON storage.objects;
CREATE POLICY "vault_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence-vault'
    AND auth.uid()::text = (string_to_array(name, '/'))[2]
  );
