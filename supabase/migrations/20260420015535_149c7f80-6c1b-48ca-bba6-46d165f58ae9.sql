-- Function: ao criar um novo usuário, se não existe NENHUM admin no sistema, promove ele a admin
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger no auth.users — roda DEPOIS do handle_new_user existente
DROP TRIGGER IF EXISTS on_auth_user_bootstrap_admin ON auth.users;
CREATE TRIGGER on_auth_user_bootstrap_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.bootstrap_first_admin();