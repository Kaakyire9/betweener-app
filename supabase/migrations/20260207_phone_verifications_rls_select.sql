-- Allow authenticated users to read their own verified phone records

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'phone_verifications'
      AND policyname = 'phone_verifications_select_owner'
  ) THEN
    EXECUTE 'CREATE POLICY "phone_verifications_select_owner"
             ON public.phone_verifications
             FOR SELECT
             TO authenticated
             USING (user_id = auth.uid())';
  END IF;
END
$$;
