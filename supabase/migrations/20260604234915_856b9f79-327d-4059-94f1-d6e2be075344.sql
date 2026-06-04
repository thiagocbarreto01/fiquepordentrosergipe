DROP TRIGGER IF EXISTS on_profile_created_financial ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_financial_user();
DROP TABLE IF EXISTS public.financial_budgets;
DROP TABLE IF EXISTS public.financial_transactions;
DROP TABLE IF EXISTS public.financial_categories;