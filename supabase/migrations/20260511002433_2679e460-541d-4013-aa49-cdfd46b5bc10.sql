-- Function to populate default categories
CREATE OR REPLACE FUNCTION public.handle_new_financial_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Default Incomes
    INSERT INTO public.financial_categories (user_id, name, type, icon, color)
    VALUES 
    (NEW.user_id, 'Salário', 'income', 'TrendingUp', '#22c55e'),
    (NEW.user_id, 'Investimentos', 'income', 'PieChart', '#3b82f6'),
    (NEW.user_id, 'Outros', 'income', 'PlusCircle', '#64748b');

    -- Default Expenses
    INSERT INTO public.financial_categories (user_id, name, type, icon, color)
    VALUES 
    (NEW.user_id, 'Alimentação', 'expense', 'Utensils', '#ef4444'),
    (NEW.user_id, 'Transporte', 'expense', 'Car', '#f59e0b'),
    (NEW.user_id, 'Moradia', 'expense', 'Home', '#6366f1'),
    (NEW.user_id, 'Lazer', 'expense', 'Music', '#ec4899'),
    (NEW.user_id, 'Saúde', 'expense', 'Heart', '#06b6d4');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create defaults when a profile is created
CREATE TRIGGER on_profile_created_financial
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_financial_user();
