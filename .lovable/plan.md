## Add Admin User

Create a new admin account with:
- Email: `ankushrathor1996@gmail.com`
- Password: `admin`
- Role: `admin`

### Steps

1. Use the backend admin API to create an auth user with the email above, password `admin`, and email pre-confirmed (so they can log in immediately).
2. Insert a matching row into `public.staff` (full_name: "Ankush Rathor", email, active).
3. Insert an `admin` role into `public.user_roles` for the new user.
4. Verify the admin count stays within the 2-admin cap before inserting; abort if already at cap.

### Notes / Warnings

- The password `admin` is only 5 characters and extremely weak. Supabase's minimum password length may reject it (default 6). If it fails, I'll pad to `admin1` or a similar minimal variant — please confirm which you prefer, or allow me to use `admin123`.
- Because this is a permanent admin (not a staff-created user needing PIN reset), `must_change_password` will be set to `false`.
- Weak passwords on admin accounts are a serious security risk — recommend changing it after first login.

Confirm and I'll run the migration + user creation.
