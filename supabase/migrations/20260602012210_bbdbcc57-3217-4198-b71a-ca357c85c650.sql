
-- Fix profiles table security vulnerabilities

-- 1. Remove public SELECT policy that exposes all profile data including roles
DROP POLICY IF EXISTS "Perfis visíveis por todos" ON public.profiles;

-- 2. Remove weak UPDATE policy that allows role escalation
-- (the stronger 'Users can update own profile' policy remains with proper role immutability checks)
DROP POLICY IF EXISTS "Usuários editam o próprio perfil" ON public.profiles;

-- Fix financial table policies: change from public to authenticated role
-- Drop duplicate public policies and recreate as authenticated-only

-- financial_categories
DROP POLICY IF EXISTS "Users can manage their own categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Gestão total categorias" ON public.financial_categories;
CREATE POLICY "Users can manage their own categories"
  ON public.financial_categories
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- financial_transactions
DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Gestão total transações" ON public.financial_transactions;
CREATE POLICY "Users can manage their own transactions"
  ON public.financial_transactions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- financial_budgets
DROP POLICY IF EXISTS "Users can manage their own budgets" ON public.financial_budgets;
DROP POLICY IF EXISTS "Gestão total orçamentos" ON public.financial_budgets;
CREATE POLICY "Users can manage their own budgets"
  ON public.financial_budgets
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
