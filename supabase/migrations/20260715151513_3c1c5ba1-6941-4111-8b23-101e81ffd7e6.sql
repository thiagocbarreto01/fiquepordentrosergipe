
-- Recreate trigger that populates public.profiles on new auth.users signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any auth.users that don't have a profile yet (includes the recent signup)
INSERT INTO public.profiles (user_id, display_name, email, role, status, approved_at)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1)),
  u.email,
  CASE WHEN lower(u.email) = 'thiagocbarreto@hotmail.com' THEN 'super_admin' ELSE 'user' END,
  CASE WHEN lower(u.email) = 'thiagocbarreto@hotmail.com' THEN 'approved' ELSE 'pending' END,
  CASE WHEN lower(u.email) = 'thiagocbarreto@hotmail.com' THEN now() ELSE NULL END
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;
