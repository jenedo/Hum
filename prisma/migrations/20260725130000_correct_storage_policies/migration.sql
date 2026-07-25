-- Migration: Correct storage policies by removing dangerously broad policies

DROP POLICY IF EXISTS "Deny anon access to objects" ON storage.objects;
DROP POLICY IF EXISTS "Restrict direct authenticated access to private-medical-records" ON storage.objects;
