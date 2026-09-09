-- A third payment type: part customer cash, part bank loan.
--
-- The Deals dashboard offered "loan + cash" but stored it as `loan` with a
-- free-text note in special_notes, so nothing downstream could tell the two
-- apart — not the payment schedule, not the stage gate, not the KPI counts.
-- Making it a real enum value is what lets those treat it as its own thing.
--
-- Added on its own: Postgres will not let a new enum value be used in the same
-- transaction that adds it, so the functions that branch on it are updated in
-- the migration that follows. Same reason 20260719000000 split the project
-- stage enum from 20260719000100.
--
-- Everything that gates on financing must read "involves a loan", not
-- "= 'loan'" — a loan_cash project still waits on the bank's first instalment
-- before fabrication.

ALTER TYPE public.payment_type ADD VALUE IF NOT EXISTS 'loan_cash';
