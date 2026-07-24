-- Fix auth.users scan errors by setting created_at and updated_at to now() if they are NULL

UPDATE auth.users
SET 
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());
