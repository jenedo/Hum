-- Migration: Configure private-medical-records bucket and restrict storage.objects RLS policies

-- 1. Insert or update the private-medical-records bucket in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'private-medical-records',
  'private-medical-records',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[];

-- 2. Explicitly deny anon direct access to storage.objects
DROP POLICY IF EXISTS "Deny anon access to objects" ON storage.objects;
CREATE POLICY "Deny anon access to objects"
ON storage.objects
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 3. Restrict direct authenticated client access to private-medical-records bucket
DROP POLICY IF EXISTS "Restrict direct authenticated access to private-medical-records" ON storage.objects;
CREATE POLICY "Restrict direct authenticated access to private-medical-records"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id <> 'private-medical-records')
WITH CHECK (bucket_id <> 'private-medical-records');
