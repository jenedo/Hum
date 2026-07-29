-- Drop RLS policies before dropping the table
DROP POLICY IF EXISTS "users can insert own row" ON public.app_users;
DROP POLICY IF EXISTS "users can update own row" ON public.app_users;
DROP POLICY IF EXISTS "users can view own row" ON public.app_users;

-- Drop the obsolete legacy table
DROP TABLE IF EXISTS public.app_users;
