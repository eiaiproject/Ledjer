-- ============================================================
-- Standardize transaction numbering
-- Format: TRX-YYYYMM-000001
-- Scope: per organization, per transaction month
-- ============================================================

-- Temporarily move existing transaction numbers out of the target namespace so
-- the unique constraint cannot collide while historical rows are renumbered.
UPDATE public.transactions
SET transaction_number = 'REN-' || replace(id::TEXT, '-', '')
WHERE transaction_number !~ '^REN-[0-9a-f]{32}$';

WITH numbered_transactions AS (
  SELECT
    id,
    'TRX-' ||
      to_char(transaction_date, 'YYYYMM') ||
      '-' ||
      lpad(
        row_number() OVER (
          PARTITION BY organization_id, to_char(transaction_date, 'YYYYMM')
          ORDER BY transaction_date, created_at, id
        )::TEXT,
        6,
        '0'
      ) AS new_transaction_number
  FROM public.transactions
)
UPDATE public.transactions AS t
SET transaction_number = nt.new_transaction_number
FROM numbered_transactions AS nt
WHERE t.id = nt.id;

DELETE FROM public.organization_document_counters
WHERE counter_name = 'transaction_number'
   OR counter_name LIKE 'transaction_number:%';

INSERT INTO public.organization_document_counters (
  organization_id,
  counter_name,
  current_value,
  updated_at
)
SELECT
  organization_id,
  'transaction_number:' || to_char(transaction_date, 'YYYYMM') AS counter_name,
  COUNT(*)::INTEGER AS current_value,
  now() AS updated_at
FROM public.transactions
GROUP BY organization_id, to_char(transaction_date, 'YYYYMM')
ON CONFLICT (organization_id, counter_name)
DO UPDATE SET
  current_value = EXCLUDED.current_value,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.generate_transaction_number(
  p_organization_id UUID,
  p_transaction_date DATE
)
RETURNS TEXT AS $$
DECLARE
  v_period TEXT;
  v_next_num INTEGER;
BEGIN
  v_period := to_char(COALESCE(p_transaction_date, CURRENT_DATE), 'YYYYMM');
  v_next_num := public.get_next_counter(
    p_organization_id,
    'transaction_number:' || v_period
  );

  RETURN 'TRX-' || v_period || '-' || lpad(v_next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.generate_transaction_number(
  p_organization_id UUID
)
RETURNS TEXT AS $$
  SELECT public.generate_transaction_number(p_organization_id, CURRENT_DATE);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.standardize_transaction_number()
RETURNS TRIGGER AS $$
DECLARE
  v_period TEXT;
BEGIN
  v_period := to_char(NEW.transaction_date, 'YYYYMM');

  IF NEW.transaction_number IS NULL
     OR NEW.transaction_number !~ ('^TRX-' || v_period || '-[0-9]{6}$') THEN
    NEW.transaction_number := public.generate_transaction_number(
      NEW.organization_id,
      NEW.transaction_date
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS standardize_transaction_number_trigger ON public.transactions;
CREATE TRIGGER standardize_transaction_number_trigger
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.standardize_transaction_number();

ALTER FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) RENAME TO post_transaction_impl_20260702;

CREATE OR REPLACE FUNCTION public.post_transaction(
  p_organization_id UUID,
  p_transaction_date DATE,
  p_transaction_type TEXT,
  p_amount NUMERIC,
  p_party_id UUID DEFAULT NULL,
  p_category_name TEXT DEFAULT NULL,
  p_cash_account_id UUID DEFAULT NULL,
  p_destination_cash_account_id UUID DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'paid',
  p_partial_amount NUMERIC DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_description TEXT DEFAULT '',
  p_notes TEXT DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_quantity NUMERIC DEFAULT NULL,
  p_unit_price NUMERIC DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_transaction_id UUID;
  v_transaction_number TEXT;
BEGIN
  v_result := public.post_transaction_impl_20260702(
    p_organization_id,
    p_transaction_date,
    p_transaction_type,
    p_amount,
    p_party_id,
    p_category_name,
    p_cash_account_id,
    p_destination_cash_account_id,
    p_payment_status,
    p_partial_amount,
    p_due_date,
    p_description,
    p_notes,
    p_product_id,
    p_quantity,
    p_unit_price
  );

  v_transaction_id := (v_result ->> 'transaction_id')::UUID;

  SELECT transaction_number
  INTO v_transaction_number
  FROM public.transactions
  WHERE organization_id = p_organization_id
    AND id = v_transaction_id;

  IF v_transaction_number IS NOT NULL THEN
    v_result := jsonb_set(
      v_result,
      '{transaction_number}',
      to_jsonb(v_transaction_number),
      true
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.generate_transaction_number(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_transaction_number(UUID, DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.standardize_transaction_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_transaction_impl_20260702(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC
) TO authenticated;
