
-- ============================================================
-- 1. RE-ATTACH MISSING TRIGGERS
-- ============================================================

-- updated_at triggers
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_projects ON public.projects;
CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_documents ON public.documents;
CREATE TRIGGER set_updated_at_documents BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_staff ON public.staff;
CREATE TRIGGER set_updated_at_staff BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_push_subscriptions ON public.push_subscriptions;
CREATE TRIGGER set_updated_at_push_subscriptions BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification triggers
DROP TRIGGER IF EXISTS notify_lead_assigned_trigger ON public.leads;
CREATE TRIGGER notify_lead_assigned_trigger AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_lead_assigned();

DROP TRIGGER IF EXISTS notify_lead_assigned_insert ON public.leads;
CREATE TRIGGER notify_lead_assigned_insert AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_lead_assigned();

DROP TRIGGER IF EXISTS notify_worker_assigned_trigger ON public.projects;
CREATE TRIGGER notify_worker_assigned_trigger AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_worker_assigned();

DROP TRIGGER IF EXISTS notify_project_status_change_trigger ON public.projects;
CREATE TRIGGER notify_project_status_change_trigger AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_project_status_change();

DROP TRIGGER IF EXISTS notify_document_rejected_trigger ON public.documents;
CREATE TRIGGER notify_document_rejected_trigger AFTER UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_document_rejected();

-- Audit triggers
DROP TRIGGER IF EXISTS audit_lead_changes ON public.leads;
CREATE TRIGGER audit_lead_changes AFTER UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.audit_lead_cancel_or_delete();

DROP TRIGGER IF EXISTS audit_project_status ON public.projects;
CREATE TRIGGER audit_project_status AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_status_change();

DROP TRIGGER IF EXISTS audit_project_delete_trigger ON public.projects;
CREATE TRIGGER audit_project_delete_trigger AFTER DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_delete();

-- ============================================================
-- 2. NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  in_app_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification prefs" ON public.notification_preferences;
CREATE POLICY "Users manage own notification prefs"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all notification prefs" ON public.notification_preferences;
CREATE POLICY "Admins view all notification prefs"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS set_updated_at_notification_prefs ON public.notification_preferences;
CREATE TRIGGER set_updated_at_notification_prefs BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update push dispatcher to honour preferences
CREATE OR REPLACE FUNCTION public.dispatch_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://yuaehplccjzsahckdhvc.supabase.co/functions/v1/send-push';
  push_on boolean;
BEGIN
  SELECT push_enabled INTO push_on
    FROM public.notification_preferences WHERE user_id = NEW.user_id;
  IF push_on IS NOT NULL AND push_on = false THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'entity_type', NEW.entity_type,
      'entity_id', NEW.entity_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_push_after_notification ON public.notifications;
CREATE TRIGGER dispatch_push_after_notification AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_on_notification();

-- ============================================================
-- 3. ASSIGNMENT HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  from_user_id uuid,
  to_user_id uuid,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view all lead assignments" ON public.lead_assignments;
CREATE POLICY "Admins view all lead assignments" ON public.lead_assignments
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Staff view related lead assignments" ON public.lead_assignments;
CREATE POLICY "Staff view related lead assignments" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (changed_by = auth.uid() OR from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.assigned_to_user_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id) THEN
    INSERT INTO public.lead_assignments (lead_id, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id,
            CASE WHEN TG_OP='UPDATE' THEN OLD.assigned_to_user_id ELSE NULL END,
            NEW.assigned_to_user_id,
            auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS log_lead_assignment_trigger ON public.leads;
CREATE TRIGGER log_lead_assignment_trigger AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_assignment();

CREATE TABLE IF NOT EXISTS public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  role_column text NOT NULL,
  from_user_id uuid,
  to_user_id uuid,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view all project assignments" ON public.project_assignments;
CREATE POLICY "Admins view all project assignments" ON public.project_assignments
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Staff view related project assignments" ON public.project_assignments;
CREATE POLICY "Staff view related project assignments" ON public.project_assignments
  FOR SELECT TO authenticated
  USING (changed_by = auth.uid() OR from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_project_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_sales_person_id IS DISTINCT FROM OLD.assigned_sales_person_id THEN
    INSERT INTO public.project_assignments (project_id, role_column, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id, 'sales_person', OLD.assigned_sales_person_id, NEW.assigned_sales_person_id, auth.uid());
  END IF;
  IF NEW.assigned_welder_id IS DISTINCT FROM OLD.assigned_welder_id THEN
    INSERT INTO public.project_assignments (project_id, role_column, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id, 'welder', OLD.assigned_welder_id, NEW.assigned_welder_id, auth.uid());
  END IF;
  IF NEW.assigned_electrician_id IS DISTINCT FROM OLD.assigned_electrician_id THEN
    INSERT INTO public.project_assignments (project_id, role_column, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id, 'electrician', OLD.assigned_electrician_id, NEW.assigned_electrician_id, auth.uid());
  END IF;
  IF NEW.assigned_operator_id IS DISTINCT FROM OLD.assigned_operator_id THEN
    INSERT INTO public.project_assignments (project_id, role_column, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id, 'operator', OLD.assigned_operator_id, NEW.assigned_operator_id, auth.uid());
  END IF;
  IF NEW.assigned_telecaller_id IS DISTINCT FROM OLD.assigned_telecaller_id THEN
    INSERT INTO public.project_assignments (project_id, role_column, from_user_id, to_user_id, changed_by)
    VALUES (NEW.id, 'telecaller', OLD.assigned_telecaller_id, NEW.assigned_telecaller_id, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS log_project_assignment_trigger ON public.projects;
CREATE TRIGGER log_project_assignment_trigger AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_project_assignment();

-- ============================================================
-- 4. QUOTATION TOTALS (DEDUPED) HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public.quotation_totals()
RETURNS TABLE(total_value numeric, total_kw numeric, project_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (project_id) project_id, total_amount, capacity_kw
    FROM public.quotations
    WHERE project_id IS NOT NULL
    ORDER BY project_id, created_at DESC
  )
  SELECT COALESCE(SUM(total_amount),0), COALESCE(SUM(capacity_kw),0), COUNT(*)::bigint FROM latest;
$$;
GRANT EXECUTE ON FUNCTION public.quotation_totals() TO authenticated;

-- ============================================================
-- 5. PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to_user_id) WHERE is_in_bin = false;
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status) WHERE is_in_bin = false;
CREATE INDEX IF NOT EXISTS idx_projects_sales ON public.projects(assigned_sales_person_id);
CREATE INDEX IF NOT EXISTS idx_projects_welder ON public.projects(assigned_welder_id);
CREATE INDEX IF NOT EXISTS idx_projects_electrician ON public.projects(assigned_electrician_id);
CREATE INDEX IF NOT EXISTS idx_projects_operator ON public.projects(assigned_operator_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_project ON public.documents(project_id);
CREATE INDEX IF NOT EXISTS idx_quotations_project ON public.quotations(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id, created_at DESC);

-- ============================================================
-- 6. UNIQUE GUARD ON user_roles (prevent duplicate role rows)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_role_unique'
  ) THEN
    -- Clean any duplicates first
    DELETE FROM public.user_roles a USING public.user_roles b
      WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.role = b.role;
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role);
  END IF;
END $$;
