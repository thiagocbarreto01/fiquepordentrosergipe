-- Create financial categories table
CREATE TABLE public.financial_categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    icon TEXT,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create financial transactions table
CREATE TABLE public.financial_transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create financial budgets table
CREATE TABLE public.financial_budgets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.financial_categories(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    period TEXT NOT NULL DEFAULT 'monthly',
    start_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, category_id, start_date)
);

-- Enable Row Level Security
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_budgets ENABLE ROW LEVEL SECURITY;

-- Policies for financial_categories
CREATE POLICY "Users can manage their own categories" 
ON public.financial_categories 
FOR ALL 
USING (auth.uid() = user_id);

-- Policies for financial_transactions
CREATE POLICY "Users can manage their own transactions" 
ON public.financial_transactions 
FOR ALL 
USING (auth.uid() = user_id);

-- Policies for financial_budgets
CREATE POLICY "Users can manage their own budgets" 
ON public.financial_budgets 
FOR ALL 
USING (auth.uid() = user_id);

-- Trigger for updated_at on all new tables
CREATE TRIGGER update_financial_categories_updated_at
BEFORE UPDATE ON public.financial_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_financial_transactions_updated_at
BEFORE UPDATE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_financial_budgets_updated_at
BEFORE UPDATE ON public.financial_budgets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
