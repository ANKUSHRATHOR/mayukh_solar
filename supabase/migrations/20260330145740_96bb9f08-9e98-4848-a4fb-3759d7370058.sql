
INSERT INTO public.staff (user_id, full_name, mobile, must_change_password)
VALUES ('cd4844a4-3f0b-4275-95be-6f5c29d40511', 'Admin', '7024976909', false)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('cd4844a4-3f0b-4275-95be-6f5c29d40511', 'admin')
ON CONFLICT DO NOTHING;
