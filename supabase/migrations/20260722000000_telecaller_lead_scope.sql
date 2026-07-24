-- Scopes telecaller lead visibility to their own work.
--
-- Two policies currently contradict each other. RLS policies are OR'd, so the
-- permissive one wins:
--
--   "Sales persons can view authorized leads"  ... OR has_role(uid,'telecaller')
--   "Telecallers can view own leads"           created_by_user_id = uid
--
-- The blanket clause in the first means every telecaller sees every lead, and
-- the second policy is dead code. This removes that clause so a telecaller sees
-- only leads assigned to them or created by them.
--
-- Note this NARROWS what existing telecallers can see. Anything they need to
-- keep working on must be assigned to them — see the bulk assignment tool on
-- the leads list.

DROP POLICY IF EXISTS "Sales persons can view authorized leads" ON public.leads;
CREATE POLICY "Sales persons can view authorized leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  (
    has_role(auth.uid(), 'sales_person'::app_role)
    AND is_in_bin = false
    AND (
      created_by_user_id = auth.uid()
      OR assigned_to_user_id = auth.uid()
      OR status = 'visit_created'
    )
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
);

-- Replaces the created-by-only version, which never took effect.
DROP POLICY IF EXISTS "Telecallers can view own leads" ON public.leads;
CREATE POLICY "Telecallers can view own leads"
ON public.leads FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'telecaller'::app_role)
  AND is_in_bin = false
  AND (created_by_user_id = auth.uid() OR assigned_to_user_id = auth.uid())
);

-- A telecaller may work the leads they can see, but not reassign them: that
-- would let them pull any lead to themselves. Assignment stays with admins.
DROP POLICY IF EXISTS "Telecallers can update own leads" ON public.leads;
CREATE POLICY "Telecallers can update own leads"
ON public.leads FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'telecaller'::app_role)
  AND is_in_bin = false
  AND (created_by_user_id = auth.uid() OR assigned_to_user_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'telecaller'::app_role)
  AND (created_by_user_id = auth.uid() OR assigned_to_user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- Bulk assignment
-- ---------------------------------------------------------------------------
-- One statement rather than a loop of single updates, so a large reassignment
-- is atomic and does not leave a partial result if it fails midway.

CREATE OR REPLACE FUNCTION public.bulk_assign_leads(
  _lead_ids uuid[],
  _assignee uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated int;
  assignee_role app_role;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)) THEN
    RAISE EXCEPTION 'Only an admin or operator can reassign leads.';
  END IF;

  IF _assignee IS NOT NULL THEN
    SELECT role INTO assignee_role FROM public.user_roles WHERE user_id = _assignee LIMIT 1;
    IF assignee_role IS NULL THEN
      RAISE EXCEPTION 'That person has no role assigned and cannot receive leads.';
    END IF;
  END IF;

  UPDATE public.leads
     SET assigned_to_user_id = _assignee,
         updated_at = now()
   WHERE id = ANY(_lead_ids);

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', updated);
END $$;

REVOKE EXECUTE ON FUNCTION public.bulk_assign_leads(uuid[], uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bulk_assign_leads(uuid[], uuid) TO authenticated;
