UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE lower(email) = 'thiagocbarreto@hotmail.com';

INSERT INTO public.profiles (user_id, display_name, email, role, status, approved_at)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1)),
       u.email,
       'super_admin',
       'approved',
       now()
FROM auth.users u
WHERE lower(u.email) = 'thiagocbarreto@hotmail.com'
ON CONFLICT (user_id) DO UPDATE
  SET role = 'super_admin',
      status = 'approved',
      approved_at = COALESCE(public.profiles.approved_at, now()),
      email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'thiagocbarreto@hotmail.com'
ON CONFLICT (user_id, role) DO NOTHING;