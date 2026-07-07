-- Fix CSV export RPC runtime errors.
-- Signatures stay unchanged; only the aggregate bodies are corrected.

CREATE OR REPLACE FUNCTION public.export_transactions_csv(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_transaction_type TEXT DEFAULT NULL,
  p_status public.transaction_status DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Tanggal,No Transaksi,Jenis,Partai,Deskripsi,Nominal,Status';
  v_search TEXT := NULLIF(regexp_replace(trim(COALESCE(p_search, '')), '[,%()]', ' ', 'g'), '');
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  SELECT string_agg(
    public.csv_escape(to_char(t.transaction_date, 'YYYY-MM-DD')) || ',' ||
    public.csv_escape(t.transaction_number) || ',' ||
    public.csv_escape(t.transaction_type) || ',' ||
    public.csv_escape(COALESCE(t.party_name, '')) || ',' ||
    public.csv_escape(t.description) || ',' ||
    public.csv_escape(COALESCE(t.amount::TEXT, '0')) || ',' ||
    public.csv_escape(t.status::TEXT),
    E'\n'
    ORDER BY t.transaction_date, t.transaction_number
  ) INTO v_result
  FROM (
    SELECT
      te.transaction_date, te.transaction_number, te.transaction_type,
      te.description, te.amount, te.status,
      pt.name AS party_name
    FROM public.transactions te
    LEFT JOIN public.parties pt ON pt.id = te.party_id
    WHERE te.organization_id = p_organization_id
      AND te.status IN ('posted', 'voided')
      AND (p_from_date IS NULL OR te.transaction_date >= p_from_date)
      AND (p_to_date IS NULL OR te.transaction_date <= p_to_date)
      AND (p_transaction_type IS NULL OR te.transaction_type = p_transaction_type)
      AND (p_status IS NULL OR te.status = p_status)
      AND (
        v_search IS NULL
        OR te.description ILIKE '%' || v_search || '%'
        OR te.transaction_number ILIKE '%' || v_search || '%'
      )
  ) t;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_transactions_csv(UUID, DATE, DATE, TEXT, TEXT, public.transaction_status) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_transactions_csv(UUID, DATE, DATE, TEXT, TEXT, public.transaction_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_transactions_csv(UUID, DATE, DATE, TEXT, TEXT, public.transaction_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.export_accounts_csv(
  p_organization_id UUID
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Kode,Nama Akun,Tipe,Saldo Normal,Aktif';
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_manage_accounts') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;

  SELECT string_agg(
    public.csv_escape(a.code::TEXT) || ',' ||
    public.csv_escape(a.name) || ',' ||
    public.csv_escape(a.account_type::TEXT) || ',' ||
    public.csv_escape(a.normal_balance::TEXT) || ',' ||
    public.csv_escape(a.is_active::TEXT),
    E'\n'
    ORDER BY a.code
  ) INTO v_result
  FROM public.accounts a
  WHERE a.organization_id = p_organization_id;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_accounts_csv(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_accounts_csv(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_accounts_csv(UUID) TO authenticated;
