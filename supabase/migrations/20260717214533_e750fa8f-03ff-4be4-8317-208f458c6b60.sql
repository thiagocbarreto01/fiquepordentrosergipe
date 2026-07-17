
DELETE FROM public.denuncia_status_history WHERE denuncia_id IN (SELECT id FROM public.denuncias WHERE title LIKE '[TESTE_DENUNCIAS]%');
DELETE FROM public.denuncias WHERE title LIKE '[TESTE_DENUNCIAS]%';
DELETE FROM public.denuncia_rate_limits;
