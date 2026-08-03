import { useState, useMemo, useEffect, startTransition } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { PageShell } from "@/components/ui/page-shell";

interface PreviewRow {
  index: number;
  row: Record<string, string>;
  parsed: Record<string, unknown> | null;
  errors: string[];
}

interface PreviewPayload {
  headers: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: PreviewRow[];
  errors: { row: number; field: string; message: string }[];
}

/** Render preview rows as a table (fields from parsed data or raw CSV row). */
function PreviewTable({ preview }: { readonly preview: PreviewPayload }) {
  const sample = preview.rows[0];
  const headers = sample ? Object.keys(sample.parsed ?? sample.row) : [];
  const shown = preview.rows.slice(0, 20);
  return (
    <div className="space-y-2">
      <p className="text-xs text-wood-500">
        {preview.totalRows} baris — {preview.validRows} valid, {preview.errorRows} error
        {preview.totalRows > shown.length ? ` (menampilkan ${shown.length} pertama)` : ""}
      </p>
      <div className="overflow-x-auto rounded-lg border border-wood-100">
        <table className="w-full text-left text-xs">
          <thead className="bg-wood-50">
            <tr>
              <th className="px-2 py-1.5 font-medium text-wood-500">#</th>
              {headers.map((h) => <th key={h} className="px-2 py-1.5 font-medium text-wood-600">{h}</th>)}
              <th className="px-2 py-1.5 font-medium text-wood-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-wood-50">
            {shown.map((r) => {
              const data = r.parsed ?? r.row;
              return (
                <tr key={r.index} className="align-top">
                  <td className="px-2 py-1.5 text-wood-400">{r.index + 1}</td>
              {headers.map((h) => (
                    <td key={h} className="px-2 py-1.5 text-wood-700">
                      {typeof data[h] === "object" && data[h] !== null
                        ? JSON.stringify(data[h])
                        : String(data[h] ?? "")}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {r.errors.length === 0 ? (
                      <span className="text-leaf-600">✓ Valid</span>
                    ) : (
                      <span className="text-error" title={r.errors.join("; ")}>{r.errors.length} error</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview.errors.length > 0 && (
        <ul className="space-y-1 text-xs text-error">
          {preview.errors.slice(0, 10).map((e) => (
            <li key={e.row}>Baris {e.row}: {e.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type EntityType = "coa" | "products" | "parties" | "opening-balance";

const ENTITY_LABELS: Record<EntityType, string> = {
  coa: "Chart of Akun (COA)",
  products: "Produk & Jasa",
  parties: "Pelanggan & Pemasok",
  "opening-balance": "Saldo Awal",
};

const EXPECTED_FIELDS: Record<EntityType, string[]> = {
  coa: ["code", "name", "type", "normal_balance"],
  products: ["code", "name", "purchase_price", "selling_price", "unit"],
  parties: ["name", "party_type", "phone", "email"],
  "opening-balance": ["kode_akun", "saldo", "deskripsi"],
};

const TEMPLATES: Record<EntityType, string> = {
  coa: "code,name,type,normal_balance\n1110,Kas,asset,debit\n2110,Utang Usaha,liability,credit\n3110,Modal,equity,credit\n4110,Pendapatan,income,credit\n6100,Beban,expense,debit",
  products: "code,name,purchase_price,selling_price,unit\nWGT-001,Widget A,50000,100000,pcs\nGDT-001,Gadget A,150000,250000,pcs",
  parties: "name,party_type,phone,email\nToko ABC,customer,08123456789,abc@email.com\nPT Supplier Jaya,supplier,08987654321,jaya@email.com",
  "opening-balance": "kode_akun,saldo,deskripsi\n1110,5000000,Kas awal\n1120,3000000,Saldo Bank BCA\n1300,1500000,Persediaan awal\n2100,-2000000,Utang usaha\n3100,7500000,Modal pemilik",
};

const FIELD_LABELS: Record<string, string> = {
  code: "Kode", name: "Nama", type: "Tipe", normal_balance: "Saldo Normal",
  purchase_price: "Harga Beli", selling_price: "Harga Jual", unit: "Satuan",
  party_type: "Tipe (customer/supplier)", phone: "Telepon", email: "Email",
  kode_akun: "Kode Akun", saldo: "Jumlah (Rp)", deskripsi: "Deskripsi",
};

interface ImportResult {
  rowsProcessed?: number;
  rowsSucceeded?: number;
  rowsFailed?: number;
  errors?: string[];
}

/** Simple string hash for duplicate detection. */
function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + (s.codePointAt(i) ?? 0)) | 0; } // NOSONAR intentional 32-bit truncation
  return String(h);
}

/** Detect delimiter by trying comma, semicolon, tab, pipe. */
function detectDelimiter(csv: string): string {
  const firstLine = csv.trim().split("\n")[0];
  const delimiters = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of delimiters) {
    const count = firstLine.split(d).length;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

/** Parse CSV headers from first line. */
function parseHeaders(csv: string): string[] {
  const first = csv.trim().split("\n")[0];
  const delim = detectDelimiter(first);
  return first.split(delim).map((h) => h.trim());
}

/** Remap CSV using field→column mapping. */
function remapCsv(csv: string, mapping: Record<string, string>): string {
  const delim = detectDelimiter(csv);
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return csv;
  const headers = lines[0].split(delim).map((h) => h.trim());
  const idxToField: Record<number, string> = {};
  for (const [field, col] of Object.entries(mapping)) {
    const idx = headers.indexOf(col);
    if (idx !== -1) idxToField[idx] = field;
  }
  const newHeaders = EXPECTED_FIELDS[getEntityType(csv) as EntityType] || Object.keys(mapping);
  const remapped = [newHeaders.join(",")];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim);
    const row: string[] = [];
    for (const field of newHeaders) {
      const srcIdx = Object.entries(idxToField).find(([, f]) => f === field)?.[0];
      row.push(srcIdx !== undefined ? (cells[Number(srcIdx)] ?? "") : "");
    }
    remapped.push(row.join(","));
  }
  return remapped.join("\n");
}

function getEntityType(csv: string): string {
  const h = parseHeaders(csv).join(",");
  if (h.includes("normal_balance") || h.includes("type")) return "coa";
  if (h.includes("purchase_price") || h.includes("selling_price")) return "products";
  if (h.includes("saldo") || h.includes("kode_akun")) return "opening-balance";
  return "parties";
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<EntityType>("coa");
  const [step, setStep] = useState<"input" | "mapping" | "preview" | "result">("input");
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ImportResult & { id?: string; insertedRows?: number } | null>(null);
  const [undoResult, setUndoResult] = useState<{ success: boolean; message: string } | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);

  const headers = useMemo(() => {
    if (!csv.trim()) return [];
    return parseHeaders(csv);
  }, [csv]);

  // Auto-detect entity type from headers (side effect, not in useMemo)
  useEffect(() => {
    if (!csv.trim()) return;
    const detected = getEntityType(csv);
    if (["coa", "products", "parties", "opening-balance"].includes(detected)) {
      startTransition(() => {
        setEntityType(detected as EntityType);
      });
    }
  }, [csv, setEntityType]);

  // Auto-map headers to expected fields by name similarity
  const autoMapping = useMemo(() => {
    const m: Record<string, string> = {};
    for (const expected of EXPECTED_FIELDS[entityType]) {
      const match = headers.find(
        (h) => h.toLowerCase().replace(/[^a-z]/g, "") === expected.toLowerCase().replace(/[^a-z]/g, "")
      );
      if (match) m[expected] = match;
    }
    return m;
  }, [headers, entityType]);

  const remappedCsv = useMemo(() => {
    if (Object.keys(mapping).length === 0) return csv;
    return remapCsv(csv, mapping);
  }, [csv, mapping]);

  const importedHashes = new Set(JSON.parse(localStorage.getItem("import-hashes") || "[]"));
  const csvHash = useMemo(() => hashStr(csv.trim()), [csv]);
  const isDuplicate = csv.trim().length > 0 && importedHashes.has(csvHash);

  const previewMutation = useMutation({
    mutationFn: () => apiRequest(`/api/import/${entityType}/preview`, {
      method: "POST", body: JSON.stringify({ csv: remappedCsv }),
    }),
    onSuccess: (data) => { setPreview(data as Record<string, unknown>); setStep("preview"); },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const data = await apiRequest(`/api/import/${entityType}/execute`, {
        method: "POST", body: JSON.stringify({ csv: remappedCsv }),
      });
      // Store hash to prevent duplicate
      const hashes = JSON.parse(localStorage.getItem("import-hashes") || "[]");
      hashes.push(csvHash);
      localStorage.setItem("import-hashes", JSON.stringify(hashes));
      return data as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      queryClient.invalidateQueries({ queryKey: ["opening-balance"] });
    },
  });

  const handleLoadExample = () => {
    setCsv(TEMPLATES[entityType]);
    setPreview(null);
    setResult(null);
    setStep("input");
  };

  const handleNextToMapping = () => {
    // Build mapping from auto-map
    setMapping(autoMapping);
    setStep("mapping");
  };

  const handleRemapAndPreview = () => {
    previewMutation.mutate();
  };

  const handleUndo = async (importResult: ImportResult & { id?: string; insertedRows?: number }) => {
    const importId = importResult.id;
    if (!importId) {
      // If no import ID, try to find the latest by re-running preview hash
      setUndoResult({ success: false, message: "Tidak dapat membatalkan: ID import tidak tersedia" });
      return;
    }
    setUndoLoading(true);
    try {
      const res = await apiRequest(`/api/import/${entityType}/undo`, {
        method: "POST",
        body: JSON.stringify({ importId }),
      });
      const data = res as { success: boolean; message: string };
      setUndoResult(data);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      queryClient.invalidateQueries({ queryKey: ["opening-balance"] });
    } catch (err) {
      setUndoResult({ success: false, message: (err as Error)?.message ?? "Gagal membatalkan import" });
    } finally {
      setUndoLoading(false);
    }
  };

  return (
    <PageShell
      header={{
        title: "Import Data",
        description: "Import data dari CSV",
      }}
    >


      {/* Entity type tabs */}
      <div className="flex gap-2 border-b border-wood-200 overflow-x-auto">
        {(["coa", "products", "parties", "opening-balance"] as EntityType[]).map((type) => (
          <button
            key={type}
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px shrink-0 ${
              entityType === type
                ? "border-wood-800 text-wood-800"
                : "border-transparent text-wood-500 hover:text-wood-600"
            }`}
            onClick={() => { setEntityType(type); setPreview(null); setResult(null); setStep("input"); }}
          >
            {ENTITY_LABELS[type]}
          </button>
        ))}
      </div>

      {step === "input" && (
        <>
          <p className="text-xs text-wood-500">
            Kolom yang diharapkan: {EXPECTED_FIELDS[entityType].map((f) => FIELD_LABELS[f] ?? f).join(", ")}
          </p>

          {/* Template download */}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              const blob = new Blob([TEMPLATES[entityType]], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url;
              a.download = `template-${entityType}.csv`; a.click(); URL.revokeObjectURL(url);
            }}>
              Download Template CSV
            </Button>
          </div>

          {/* CSV input */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <label htmlFor="csv-input" className="text-sm font-medium text-wood-700">Data CSV</label>
                <Button variant="ghost" size="sm" onClick={handleLoadExample}>Muat Contoh</Button>
              </div>
              <textarea
                id="csv-input"
                className="w-full rounded-md border border-wood-200 bg-white px-3 py-2 text-sm font-mono min-h-[180px] resize-y"
                value={csv}
                onChange={(e) => { setCsv(e.target.value); setPreview(null); setResult(null); }}
                placeholder={TEMPLATES[entityType]}
              />

              {/* Duplicate warning */}
              {isDuplicate && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Data ini sudah pernah diimport. Hapus centang duplikat untuk mengimport ulang.
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleNextToMapping}
                  disabled={!csv.trim() || headers.length === 0}
                >
                  Lanjut ke Pemetaan Kolom
                </Button>
              </div>
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-wood-700 mb-2">Preview</h3>
                <PreviewTable preview={preview as unknown as PreviewPayload} />
              </CardContent>
            </Card>
          )}

          {previewMutation.isError && (
            <ErrorState message={(previewMutation.error as Error)?.message ?? "Preview gagal"} />
          )}
        </>
      )}

      {step === "mapping" && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <h2 className="text-sm font-semibold text-wood-700">Pemetaan Kolom</h2>
            <p className="text-xs text-wood-500">Cocokkan kolom CSV dengan field sistem.</p>

            {EXPECTED_FIELDS[entityType].map((field) => (
              <div key={field} className="grid grid-cols-2 gap-3 items-center">
                <label className="text-sm font-medium text-wood-700">{FIELD_LABELS[field] ?? field}</label>
                <Select
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  options={[
                    { value: "", label: "— Pilih kolom —" },
                    ...headers.map((h) => ({ value: h, label: h })),
                  ]}
                />
              </div>
            ))}

            {/* Remapped preview */}
            <div className="mt-4">
              <h3 className="text-xs font-medium text-wood-600 mb-1">CSV setelah pemetaan:</h3>
              <pre className="text-xs font-mono text-wood-600 bg-wood-50 rounded p-2 overflow-x-auto max-h-32">
                {remappedCsv.slice(0, 500)}
              </pre>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep("input")}>Kembali</Button>
              <Button
                onClick={handleRemapAndPreview}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? "..." : "Preview"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && preview && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-wood-700">Preview Data</h3>
            <PreviewTable preview={preview as unknown as PreviewPayload} />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep("mapping")}>Kembali</Button>
              <Button
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? "Mengimpor..." : "Konfirmasi Import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {previewMutation.isError && step !== "mapping" && (
        <ErrorState message={(previewMutation.error as Error)?.message ?? "Preview gagal"} />
      )}

      {executeMutation.isError && (
        <ErrorState message={(executeMutation.error as Error)?.message ?? "Import gagal"} />
      )}

      {step === "result" && result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-wood-700">Hasil Import</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="block text-wood-500">Diproses</span><span className="font-medium">{result.rowsProcessed ?? 0}</span></div>
              <div><span className="block text-wood-500">Berhasil</span><span className="font-medium text-emerald-600">{result.rowsSucceeded ?? 0}</span></div>
              <div><span className="block text-wood-500">Gagal</span><span className="font-medium text-red-600">{result.rowsFailed ?? 0}</span></div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-600 mb-1">Error:</p>
                <ul className="list-disc list-inside text-xs text-red-500 space-y-0.5">
                  {result.errors.map((e, i) => <li key={e + "-" + i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => { setStep("input"); setCsv(""); setPreview(null); setResult(null); }}>
                Import Lagi
              </Button>
            </div>

            {/* Undo button — shown when import succeeded */}
            {(result.rowsSucceeded ?? result.insertedRows ?? 0) > 0 && !undoResult && !undoLoading && (
              <div className="border-t border-wood-200 pt-3 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUndo(result)}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                >
                  Batalkan Import
                </Button>
                <p className="text-xs text-wood-500 mt-1">
                  Akan menonaktifkan data yang baru saja diimport. Data tidak akan dihapus permanen.
                </p>
              </div>
            )}

            {undoResult && (
              <div className={`border-t border-wood-200 pt-3 mt-2`}>
                <p className={`text-sm font-medium ${undoResult.success ? "text-amber-600" : "text-red-600"}`}>
                  {undoResult.message}
                </p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setStep("input"); setCsv(""); setPreview(null); setResult(null); setUndoResult(null); }}>
                  Import Lagi
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
