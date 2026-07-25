import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";

type EntityType = "coa" | "products" | "parties";

const ENTITY_LABELS: Record<EntityType, string> = {
  coa: "Chart of Akun (COA)",
  products: "Produk & Jasa",
  parties: "Pelanggan & Pemasok",
};

const EXPECTED_FIELDS: Record<EntityType, string[]> = {
  coa: ["code", "name", "type", "normal_balance"],
  products: ["code", "name", "purchase_price", "selling_price", "unit"],
  parties: ["name", "party_type", "phone", "email"],
};

const TEMPLATES: Record<EntityType, string> = {
  coa: "code,name,type,normal_balance\n1110,Kas,asset,debit\n2110,Utang Usaha,liability,credit\n3110,Modal,equity,credit\n4110,Pendapatan,income,credit\n6100,Beban,expense,debit",
  products: "code,name,purchase_price,selling_price,unit\nWGT-001,Widget A,50000,100000,pcs\nGDT-001,Gadget A,150000,250000,pcs",
  parties: "name,party_type,phone,email\nToko ABC,customer,08123456789,abc@email.com\nPT Supplier Jaya,supplier,08987654321,jaya@email.com",
};

const FIELD_LABELS: Record<string, string> = {
  code: "Kode", name: "Nama", type: "Tipe", normal_balance: "Saldo Normal",
  purchase_price: "Harga Beli", selling_price: "Harga Jual", unit: "Satuan",
  party_type: "Tipe (customer/supplier)", phone: "Telepon", email: "Email",
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
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return String(h);
}

/** Parse CSV headers from first line. */
function parseHeaders(csv: string): string[] {
  const first = csv.trim().split("\n")[0];
  return first.split(",").map((h) => h.trim());
}

/** Remap a CSV using field→column mapping. */
function remapCsv(csv: string, mapping: Record<string, string>): string {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return csv;
  // Build index: source column index → target field name
  const headers = lines[0].split(",").map((h) => h.trim());
  const idxToField: Record<number, string> = {};
  for (const [field, col] of Object.entries(mapping)) {
    const idx = headers.indexOf(col);
    if (idx !== -1) idxToField[idx] = field;
  }
  // Build remapped header
  const newHeaders = EXPECTED_FIELDS[getEntityType(csv) as EntityType] || Object.keys(mapping);
  const remapped = [newHeaders.join(",")];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
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
  return "parties";
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<EntityType>("coa");
  const [step, setStep] = useState<"input" | "mapping" | "preview" | "result">("input");
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const headers = useMemo(() => {
    if (!csv.trim()) return [];
    const h = parseHeaders(csv);
    // Auto-detect entity type from headers
    const detected = getEntityType(csv);
    if (["coa", "products", "parties"].includes(detected)) {
      setEntityType(detected as EntityType);
    }
    return h;
  }, [csv]);

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-wood-800">Import Data</h1>
        <p className="text-sm text-wood-500">Import data dari CSV</p>
      </div>

      {/* Entity type tabs */}
      <div className="flex gap-2 border-b border-wood-200">
        {(["coa", "products", "parties"] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              entityType === type
                ? "border-wood-800 text-wood-800"
                : "border-transparent text-wood-400 hover:text-wood-600"
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
                <pre className="text-xs text-wood-600 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(preview, null, 2)}</pre>
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
            <pre className="text-xs text-wood-600 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(preview, null, 2)}</pre>
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
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => { setStep("input"); setCsv(""); setPreview(null); setResult(null); }}>
                Import Lagi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
