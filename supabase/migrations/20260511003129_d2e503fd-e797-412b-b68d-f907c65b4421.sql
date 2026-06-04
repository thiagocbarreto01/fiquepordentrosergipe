-- Limpeza de possíveis conflitos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_created_financial ON public.profiles;

-- 1. UTILITÁRIOS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. PERFIS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'approved',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Verificar se as políticas já existem antes de criar
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Perfis visíveis por todos') THEN
        CREATE POLICY "Perfis visíveis por todos" ON public.profiles FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Usuários editam o próprio perfil') THEN
        CREATE POLICY "Usuários editam o próprio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Gatilho de Perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, role, status)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    'user',
    'approved'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. FINANCEIRO
CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.financial_categories(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    period TEXT DEFAULT 'monthly',
    start_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, category_id, start_date)
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_budgets ENABLE ROW LEVEL SECURITY;

-- Políticas Financeiras com Verificação
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Gestão total categorias') THEN
        CREATE POLICY "Gestão total categorias" ON public.financial_categories FOR ALL USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Gestão total transações') THEN
        CREATE POLICY "Gestão total transações" ON public.financial_transactions FOR ALL USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Gestão total orçamentos') THEN
        CREATE POLICY "Gestão total orçamentos" ON public.financial_budgets FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;

-- Automação de Categorias
CREATE OR REPLACE FUNCTION public.handle_new_financial_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.financial_categories (user_id, name, type, icon, color)
    VALUES 
    (NEW.user_id, 'Salário', 'income', 'TrendingUp', '#22c55e'),
    (NEW.user_id, 'Investimentos', 'income', 'PieChart', '#3b82f6'),
    (NEW.user_id, 'Alimentação', 'expense', 'Utensils', '#ef4444'),
    (NEW.user_id, 'Transporte', 'expense', 'Car', '#f59e0b'),
    (NEW.user_id, 'Moradia', 'expense', 'Home', '#6366f1'),
    (NEW.user_id, 'Lazer', 'expense', 'Music', '#ec4899');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_financial
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_financial_user();

-- Atualização automática de timestamps
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_financial_categories_updated_at ON public.financial_categories;
CREATE TRIGGER update_financial_categories_updated_at BEFORE UPDATE ON public.financial_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_financial_transactions_updated_at ON public.financial_transactions;
CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_financial_budgets_updated_at ON public.financial_budgets;
CREATE TRIGGER update_financial_budgets_updated_at BEFORE UPDATE ON public.financial_budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
