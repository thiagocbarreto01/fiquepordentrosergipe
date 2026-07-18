
UPDATE public.profiles
   SET role = 'super_admin'
 WHERE is_founder = true AND role <> 'super_admin';
