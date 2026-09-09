-- Teach the two server-side gates that loan_cash involves a bank.
--
-- Both branched on `payment_type = 'loan'`, which silently treats anything else
-- as cash. A loan_cash project would therefore have skipped the bank gate
-- entirely: fabrication is meant to wait for the bank's first instalment, and
-- "not loan" would have waved it straight through.
--
-- The predicate is rewritten in place rather than the functions retyped, so the
-- hundred-odd lines around it cannot drift; each rewrite asserts it actually
-- matched, so a silent no-op fails the migration instead of shipping.

DO $mig$
DECLARE
  def text;
  updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'project_stage_requirements';

  updated := replace(
    def,
    '''is_loan'',                 p.payment_type = ''loan'',',
    '''is_loan'',                 p.payment_type IN (''loan'', ''loan_cash''),'
  );
  IF updated = def THEN
    RAISE EXCEPTION 'project_stage_requirements: is_loan predicate not found';
  END IF;
  EXECUTE updated;

  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'projects_kpis';

  updated := replace(
    def,
    'WHERE s.payment_type::text = ''loan''',
    'WHERE s.payment_type::text IN (''loan'', ''loan_cash'')'
  );
  IF updated = def THEN
    RAISE EXCEPTION 'projects_kpis: blocked-on-bank predicate not found';
  END IF;
  EXECUTE updated;
END $mig$;
