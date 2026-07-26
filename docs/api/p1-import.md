# P1.1 — Import Framework API

## POST /api/import/coa/preview
Preview Chart of Accounts import.

**Body (JSON):** `{ csv: string }`
- CSV with header row. Columns: `code,name,type,normal_balance`
- Type: `asset|liability|equity|revenue|expense|cogs|other`
- Normal balance: `debit|credit`
- Indonesian labels accepted: `aset|kewajiban|modal|pendapatan|beban`

**Response:** `{ rows: ImportRow[], errors: ImportError[], totalRows: number }`

**Permissions:** `accounts:write`

---

## POST /api/import/coa/execute
Execute validated CoA import.

**Body:** `{ csv: string }`

**Response:** `{ created: number, errors: ImportError[] }`

**Permissions:** `accounts:write`

---

## POST /api/import/products/preview
Preview product import.

**CSV columns:** `name,code,purchase_price,selling_price,stock,unit,type`
- Type: `product|service`
- Prices in IDR (integer).

**Permissions:** `products:write`

## POST /api/import/products/execute
Execute product import.

**Permissions:** `products:write`

---

## POST /api/import/parties/preview
Preview party (customer/supplier) import.

**CSV columns:** `name,type,phone,email,address,tax_id`
- Type: `customer|supplier|pelanggan|pemasok`

**Permissions:** `transactions:create`

## POST /api/import/parties/execute
Execute party import.

**Permissions:** `transactions:create`
