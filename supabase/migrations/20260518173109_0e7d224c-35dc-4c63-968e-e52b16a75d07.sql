
REVOKE EXECUTE ON FUNCTION public.punch_attendance(text,numeric,numeric,numeric,text,numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_salary(uuid,int,int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_salary_paid(uuid,numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_user_event(text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_performance(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.punch_attendance(text,numeric,numeric,numeric,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_salary(uuid,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_salary_paid(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_event(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_performance(date,date) TO authenticated;
