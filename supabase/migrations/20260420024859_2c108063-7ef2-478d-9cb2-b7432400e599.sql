-- Reescreve a policy de INSERT de denuncias com lógica explícita e defensiva
-- Intenção: se is_anonymous = true, contatos DEVEM ser NULL.
-- Se is_anonymous = false, contatos podem ser preenchidos.

DROP POLICY IF EXISTS "anyone submits denuncia" ON public.denuncias;

CREATE POLICY "anyone submits denuncia"
ON public.denuncias
FOR INSERT
TO public
WITH CHECK (
  char_length(title) BETWEEN 5 AND 200
  AND char_length(description) BETWEEN 10 AND 5000
  AND status = 'nova'::denuncia_status
  AND (
    -- Caso 1: identificada -> contatos podem existir (e nada exigido)
    (is_anonymous = false)
    OR
    -- Caso 2: anônima -> TODOS os contatos obrigatoriamente NULL
    (is_anonymous = true
     AND contact_name IS NULL
     AND contact_phone IS NULL
     AND contact_email IS NULL)
  )
);