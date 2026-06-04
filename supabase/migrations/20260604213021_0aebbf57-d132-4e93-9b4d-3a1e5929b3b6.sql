
-- Public read for published posts
CREATE POLICY "public read published posts"
ON public.posts
FOR SELECT
TO anon, authenticated
USING (status = 'publicada'::public.post_status);

-- Public read for active banners (within scheduled window when set)
CREATE POLICY "public read active banners"
ON public.banners
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >= now())
);

-- Fix privilege escalation in text overload of has_role:
-- remove implicit admin -> {editor, redator, super_admin} inheritance.
-- Callers should pass exact role names; admin role grants only 'admin'.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  );
$function$;
