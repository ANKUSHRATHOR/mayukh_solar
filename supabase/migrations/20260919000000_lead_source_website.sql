-- "Website" joins the lead sources.
--
-- The enum has carried `online` since 20260330144615, which covers every
-- internet enquiry at once — marketplace, social, aggregator, and the company's
-- own site. That made "how many leads did the website bring us" unanswerable,
-- which is the one an ad spend is judged on.
--
-- Added rather than split: existing `online` rows keep their meaning, and
-- nothing has to be reclassified. New enquiries from mayukhsolar's own site go
-- to `website` from here.
--
-- ADD VALUE is additive and irreversible — Postgres has no DROP VALUE — so the
-- only thing to get right is the spelling, which the UI reads from
-- LEAD_SOURCES in src/lib/statusMeta.ts.

ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'website';
