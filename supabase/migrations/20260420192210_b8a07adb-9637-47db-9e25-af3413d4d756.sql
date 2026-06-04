-- Garante extensão pg_net habilitada
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Recria função do trigger usando net.http_post (pg_net) em vez de extensions.http_post
CREATE OR REPLACE FUNCTION public.trigger_instagram_draft_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  fn_url text := 'https://owyonvtzhmmikewknlnm.supabase.co/functions/v1/generate-instagram-draft';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eW9udnR6aG1taWtld2tubG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDMxMTcsImV4cCI6MjA5MjExOTExN30.rbKVxJOlsrlKjWWdKHQDmj4Fjqpf5w-EVMK1Mfuxvhw';
BEGIN
  IF NEW.status = 'publicada'::post_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM net.http_post(
        url := fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object('post_id', NEW.id::text)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Não bloqueia a publicação se a chamada HTTP falhar
      RAISE NOTICE 'Falha ao acionar generate-instagram-draft: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- Garante o trigger correto (idempotente)
DROP TRIGGER IF EXISTS posts_instagram_draft_after_publish ON public.posts;
CREATE TRIGGER posts_instagram_draft_after_publish
AFTER INSERT OR UPDATE OF status ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.trigger_instagram_draft_on_publish();