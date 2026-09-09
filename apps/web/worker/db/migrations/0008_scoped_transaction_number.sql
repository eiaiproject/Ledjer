-- Migration: 0008_scoped_transaction_number.sql
--
-- Nomor transaksi (TRX-YYYYMMDD-XXXX) selama ini unik GLOBAL
-- (UNIQUE INDEX atas transaction_number saja), sehingga dua organisasi
-- berbeda yang kebetulan mendapat suffix sama di hari yang sama akan
-- saling menggagalkan (transaction_number_collision lintas tenant).
--
-- Migrasi ini melingkupi keunikan per organisasi:
--   DROP INDEX global + CREATE UNIQUE (organization_id, transaction_number).
-- Aman: keunikan global menyiratkan keunikan per-org, jadi tidak ada baris
-- lama yang bisa melanggar index baru.

PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS idx_transactions_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_org_number
  ON transactions(organization_id, transaction_number);

PRAGMA foreign_key_check;
