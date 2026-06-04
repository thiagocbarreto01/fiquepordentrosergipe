-- Add status and role to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Update existing users
-- Making the first user admin and approved
UPDATE public.profiles SET status = 'approved', role = 'admin' WHERE user_id = '09e1bf85-3b09-46a7-9bb4-1359920a809f';
-- Making other existing users approved
UPDATE public.profiles SET status = 'approved' WHERE user_id != '09e1bf85-3b09-46a7-9bb4-1359920a809f';

-- Drop existing policies
DROP POLICY IF EXISTS "profiles authenticated read" ON public.profiles;
DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;

-- Policy: Admins can manage everything
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Users can view all profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users can update their own profile (restricted fields)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  (
    -- If not admin, cannot change role or status
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR (
      role = (SELECT role FROM public.profiles WHERE user_id = auth.uid()) AND
      status = (SELECT status FROM public.profiles WHERE user_id = auth.uid())
    )
  )
);
