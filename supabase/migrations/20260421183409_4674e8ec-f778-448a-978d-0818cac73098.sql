-- Fix search path for security
ALTER FUNCTION public.ensure_founder_access() SET search_path = public;