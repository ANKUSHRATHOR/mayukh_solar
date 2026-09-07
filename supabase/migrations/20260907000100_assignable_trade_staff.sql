-- Who can be assigned as a welder or electrician.
--
-- `user_roles` is readable only by admins, or by a user for their own row
-- (20260525014949 — "Admins can view all roles" / "Users can view own role").
-- Both existing assignment surfaces build their dropdown by reading
-- `user_roles` straight from the client, so for an operator — the role the
-- operator project page exists for — that dropdown comes back empty and
-- assignment silently cannot be done.
--
-- SECURITY DEFINER, as get_assignable_sales_persons (20260515170139) already is
-- for sales. It exposes only active staff holding the requested trade role, and
-- only name and mobile.
--
-- Unlike that precedent this one also checks the CALLER. Bypassing user_roles
-- RLS without a caller check would let any signed-in user — including a welder
-- — enumerate the staff directory, which is a wider grant than the precedent
-- intended rather than a reason to repeat it. Only the roles that can actually
-- write an assignment (admin, operator, per the projects UPDATE policies) can
-- list the candidates.

CREATE OR REPLACE FUNCTION public.get_assignable_trade_staff(_trade text)
RETURNS TABLE (user_id uuid, full_name text, mobile text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, s.full_name, s.mobile
  FROM public.staff s
  JOIN public.user_roles ur ON ur.user_id = s.user_id
  WHERE _trade IN ('welder', 'electrician')
    AND ur.role = _trade::app_role
    AND s.is_active = true
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'operator'::app_role)
    )
  ORDER BY s.full_name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_assignable_trade_staff(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_assignable_trade_staff(text) TO authenticated;
