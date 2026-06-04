-- Fix access for founder email
DO $$
DECLARE
    founder_email TEXT := 'thiagocbarreto@hotmail.com';
    v_user_id UUID;
BEGIN
    -- 1. Find the user ID for the founder email
    SELECT id INTO v_user_id FROM auth.users WHERE email = founder_email;
    
    -- 2. If user exists, ensure profile is admin and approved
    IF v_user_id IS NOT NULL THEN
        -- Insert profile if it doesn't exist, or update if it does
        INSERT INTO public.profiles (user_id, display_name, role, status)
        VALUES (
            v_user_id, 
            split_part(founder_email, '@', 1),
            'admin',
            'approved'
        )
        ON CONFLICT (user_id) DO UPDATE 
        SET role = 'admin', status = 'approved';
    END IF;
END $$;

-- 3. Update handle_new_user to automatically approve founder
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, role, status)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    CASE WHEN NEW.email = 'thiagocbarreto@hotmail.com' THEN 'admin' ELSE 'user' END,
    CASE WHEN NEW.email = 'thiagocbarreto@hotmail.com' THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE public.profiles.role END,
    status = CASE WHEN EXCLUDED.status = 'approved' THEN 'approved' ELSE public.profiles.status END;
  RETURN NEW;
END; $$;

-- 4. Add a trigger to prevent changing founder status/role
CREATE OR REPLACE FUNCTION public.ensure_founder_access()
RETURNS TRIGGER AS $$
DECLARE
    founder_email TEXT := 'thiagocbarreto@hotmail.com';
    current_email TEXT;
BEGIN
    -- We need to check the email from auth.users
    SELECT email INTO current_email FROM auth.users WHERE id = NEW.user_id;
    
    IF current_email = founder_email THEN
        NEW.role := 'admin';
        NEW.status := 'approved';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_founder_access ON public.profiles;
CREATE TRIGGER trg_ensure_founder_access
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_founder_access();