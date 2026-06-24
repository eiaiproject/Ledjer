-- A legacy deployment left this 12-argument overload beside the current
-- 16-argument function. PostgREST cannot resolve calls using their shared
-- parameter names, so keep one public transaction-posting signature.
DROP FUNCTION IF EXISTS public.post_transaction(
  UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID,
  TEXT, DATE, TEXT, TEXT
);

NOTIFY pgrst, 'reload schema';
