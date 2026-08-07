-- is_staff_for_restaurant only needs to see the caller's own restaurant_staff
-- row (already allowed by RLS). SECURITY DEFINER is unnecessary and triggers
-- advisor lints 0028/0029 because the function is executable via /rest/v1/rpc.
ALTER FUNCTION public.is_staff_for_restaurant(uuid) SECURITY INVOKER;
