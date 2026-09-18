-- "Not Connected" as a lead status.
--
-- A telecaller who rings a lead and gets no answer had nowhere to record it: the
-- call log offered only the lead statuses, so an unanswered call either went in
-- as free text or moved the lead somewhere untrue. As a status it can be
-- filtered, counted and churned later.
--
-- Alone in its own migration on purpose: Postgres refuses to use a new enum
-- value in the same transaction that adds it, so anything referencing
-- 'not_connected' must run afterwards (see 20260918000100).

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'not_connected';
