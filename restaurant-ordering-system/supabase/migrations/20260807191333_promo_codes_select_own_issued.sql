-- Customers can read promo codes issued to their restaurant_customers row
-- (reward-offer redemptions). Staff SELECT policy remains unchanged.

DROP POLICY IF EXISTS promo_codes_select_own_issued ON public.promo_codes;
CREATE POLICY promo_codes_select_own_issued ON public.promo_codes
  FOR SELECT USING (
    issued_to_customer_id IN (
      SELECT id FROM public.restaurant_customers WHERE auth_user_id = auth.uid()
    )
  );
