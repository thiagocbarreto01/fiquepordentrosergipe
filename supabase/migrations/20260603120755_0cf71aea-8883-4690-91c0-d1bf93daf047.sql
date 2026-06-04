CREATE OR REPLACE FUNCTION public.trigger_instagram_draft_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  fn_url text := 'https://owyonvtzhmmikewknlnm.supabase.co/functions/v1/secure-publish-trigger';
BEGIN
  IF NEW.status = 'publicada'::post_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('post_id', NEW.id::text)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Falha ao acionar secure-publish-trigger: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;