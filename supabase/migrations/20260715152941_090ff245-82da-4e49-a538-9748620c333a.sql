
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  status_counts jsonb;
  sources_day jsonb;
  sources_week jsonb;
  sources_month jsonb;
  now_ts timestamptz := now();
  sp_start_day timestamptz;
  sp_start_week timestamptz;
  sp_start_month timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  sp_start_day := (date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo'))) AT TIME ZONE 'America/Sao_Paulo';
  sp_start_week := sp_start_day - interval '7 days';
  sp_start_month := sp_start_day - interval '30 days';

  SELECT jsonb_object_agg(status_text, cnt) INTO status_counts FROM (
    SELECT status::text AS status_text, count(*) AS cnt FROM public.posts GROUP BY status
  ) t;

  SELECT jsonb_agg(row_to_json(x)) INTO sources_day FROM (
    SELECT COALESCE(ns.name,
      CASE WHEN p.source_url ILIKE '%instagram.com%' THEN 'Instagram' ELSE 'Manual' END
    ) AS name, count(*) AS count
    FROM public.posts p
    LEFT JOIN public.news_sources ns ON ns.id = p.source_id
    WHERE p.created_at >= sp_start_day
    GROUP BY 1 ORDER BY count(*) DESC LIMIT 25
  ) x;

  SELECT jsonb_agg(row_to_json(x)) INTO sources_week FROM (
    SELECT COALESCE(ns.name,
      CASE WHEN p.source_url ILIKE '%instagram.com%' THEN 'Instagram' ELSE 'Manual' END
    ) AS name, count(*) AS count
    FROM public.posts p
    LEFT JOIN public.news_sources ns ON ns.id = p.source_id
    WHERE p.created_at >= sp_start_week
    GROUP BY 1 ORDER BY count(*) DESC LIMIT 25
  ) x;

  SELECT jsonb_agg(row_to_json(x)) INTO sources_month FROM (
    SELECT COALESCE(ns.name,
      CASE WHEN p.source_url ILIKE '%instagram.com%' THEN 'Instagram' ELSE 'Manual' END
    ) AS name, count(*) AS count
    FROM public.posts p
    LEFT JOIN public.news_sources ns ON ns.id = p.source_id
    WHERE p.created_at >= sp_start_month
    GROUP BY 1 ORDER BY count(*) DESC LIMIT 25
  ) x;

  result := jsonb_build_object(
    'total_posts', (SELECT count(*) FROM public.posts),
    'total_archived', (SELECT count(*) FROM public.posts WHERE status = 'arquivada'),
    'total_views', (SELECT COALESCE(sum(views),0) FROM public.posts),
    'denuncias_novas', (SELECT count(*) FROM public.denuncias WHERE status = 'nova'),
    'banners_ativos', (
      SELECT count(*) FROM public.banners
       WHERE is_active = true
         AND (starts_at IS NULL OR starts_at <= now_ts)
         AND (ends_at   IS NULL OR ends_at   >= now_ts)
    ),
    'duplicadas_hoje', (
      (SELECT count(*) FROM public.posts WHERE status = 'duplicada' AND created_at >= sp_start_day)
      + (SELECT count(*) FROM public.duplicate_decisions WHERE decision IN ('mesclar','marcar_duplicada') AND created_at >= sp_start_day)
    ),
    'status_counts', COALESCE(status_counts, '{}'::jsonb),
    'sources_day',   COALESCE(sources_day,   '[]'::jsonb),
    'sources_week',  COALESCE(sources_week,  '[]'::jsonb),
    'sources_month', COALESCE(sources_month, '[]'::jsonb),
    'generated_at', now_ts
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
