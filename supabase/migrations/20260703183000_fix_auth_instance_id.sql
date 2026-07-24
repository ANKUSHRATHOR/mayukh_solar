-- Fix instance_id NULL scan errors in auth.users by setting it to the nil UUID default
UPDATE auth.users
SET instance_id = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid);
