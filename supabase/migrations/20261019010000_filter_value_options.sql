-- Distinct values for the Filters popover.
--
-- Text columns that hold a small set of repeated values (district, feeder, loan
-- bank…) are offered as a dropdown when the condition is "is" / "is not", so a
-- reader picks "Kota" instead of guessing how it was typed. PostgREST cannot
-- select DISTINCT, and fetching every row to dedupe in the browser does not
-- scale, so the list comes from here.
--
-- A fixed allow-list of keys, one static query each — no dynamic SQL, so the
-- function cannot be pointed at an arbitrary column. SECURITY INVOKER: the
-- caller's RLS applies, so a telecaller is offered only values from leads they
-- can already see.

CREATE OR REPLACE FUNCTION public.filter_value_options(p_key text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(v ORDER BY v), '{}')
  FROM (
    -- Raw values, not trimmed: "is" is an exact match, so a tidied value would
    -- miss the rows it was tidied from. It is case-insensitive, though, so
    -- "kota" and "Kota" are one choice that finds both.
    SELECT min(val) AS v
    FROM (
      SELECT district     AS val FROM public.leads    WHERE p_key = 'lead_district'
      UNION ALL
      SELECT village_city        FROM public.leads    WHERE p_key = 'lead_village_city'
      UNION ALL
      SELECT feeder_name         FROM public.leads    WHERE p_key = 'lead_feeder_name'
      UNION ALL
      SELECT loan_bank           FROM public.projects WHERE p_key = 'project_loan_bank'
      UNION ALL
      SELECT panel_brand         FROM public.projects WHERE p_key = 'project_panel_brand'
      UNION ALL
      SELECT inverter_brand      FROM public.projects WHERE p_key = 'project_inverter_brand'
    ) src
    WHERE val IS NOT NULL AND btrim(val) <> ''
    GROUP BY lower(val)
    -- A dropdown past this size is a search box; the text conditions remain.
    LIMIT 1000
  ) d;
$$;

REVOKE ALL ON FUNCTION public.filter_value_options(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.filter_value_options(text) TO authenticated;
