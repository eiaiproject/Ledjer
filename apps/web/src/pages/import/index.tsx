import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

type EntityType = "coa" | "products" | "parties";

const ENTITY_LABELS: Record<EntityType, string> = {
  coa: "Chart of Akun (COA)",
  products: "Produk & Jasa",
  parties: "Pelanggan & Pemasok",
};

const CSV_EXAMPLES: Record<EntityType, string> = {
  coa: "code,name,type,normal_balance\n1110,Kas,asset,debit\n2110,Utang Usaha,liability,credit\n3110,Modal,equity,credit",
  products: "code,name,purchase_price,selling_price,unit\nWGT-001,Widget A,50000,100000,pcs\nWGT-002,Widget B,75000,150000,pcs",
  parties: "name,party_type,phone,email\nToko ABC,customer,08123456789,abc@email.com\nPT Supplier Jaya,supplier,08987654321,jaya@email.com",
};

const TEMPLATE_HELPERS: Record<EntityType, string> = {
  coa: "Kolom: code, name, type (asset/liability/equity/income/expense/cogs), normal_balance (debit/credit)",
  products: "Kolom: code, name, purchase_price (dalam Rupiah), selling_price (dalam Rupiah), unit",
  parties: "Kolom: name, party_type (customer/supplier/employee/owner/other), phone, email",
};

const TEMPLATES: Record<EntityType, string> = {
  coa: "code,name,type,normal_balance\n1110,Kas,asset,debit\n2110,Utang Usaha,liability,credit\n3110,Modal,equity,credit\n4110,Pendapatan,income,credit\n6100,Beban,expense,debit",
  products: "code,name,purchase_price,selling_price,unit\nWGT-001,Widget A,50000,100000,pcs\nGDT-001,Gadget A,150000,250000,pcs",
  parties: "name,party_type,phone,email\nToko ABC,customer,08123456789,abc@email.com\nPT Supplier Jaya,supplier,08987654321,jaya@email.com",
};

interface ImportResult {
  rowsProcessed?: number;
  rowsSucceeded?: number;
  rowsFailed?: number;
  errors?: string[];
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<EntityType>("coa");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => apiRequest(`/api/import/${entityType}/preview`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),
    onSuccess: (data) => {
      setPreview(data as Record<string, unknown>);
      setResult(null);
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/import/${entityType}/execute`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),
    onSuccess: (data) => {
      setResult(data as ImportResult);
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
    },
  });

  const handleLoadExample = () => {
    setCsv(CSV_EXAMPLES[entityType]);
    setPreview(null);
    setResult(null);
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
            onClick={() => { setEntityType(type); setPreview(null); setResult(null); }}
          >
            {ENTITY_LABELS[type]}
          </button>
        ))}
      </div>

      {/* Helper text */}
      <p className="text-xs text-wood-500">{TEMPLATE_HELPERS[entityType]}</p>

      {/* Template download */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const blob = new Blob([TEMPLATES[entityType]], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `template-${entityType}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
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
            placeholder={CSV_EXAMPLES[entityType]}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!csv.trim() || previewMutation.isPending}
            >
              {previewMutation.isPending ? "..." : "Preview"}
            </Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={!csv.trim() || executeMutation.isPending}
            >
              {executeMutation.isPending ? "Mengimpor..." : "Import"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {previewMutation.isError && (
        <ErrorState message={(previewMutation.error as Error)?.message ?? "Preview gagal"} />
      )}

      {preview && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-wood-700 mb-2">Preview</h3>
            <pre className="text-xs text-wood-600 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(preview, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-semibold text-wood-700">Hasil Import</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="block text-wood-500">Diproses</span>
                <span className="font-medium text-wood-800">{result.rowsProcessed ?? 0}</span>
              </div>
              <div>
                <span className="block text-wood-500">Berhasil</span>
                <span className="font-medium text-emerald-600">{result.rowsSucceeded ?? 0}</span>
              </div>
              <div>
                <span className="block text-wood-500">Gagal</span>
                <span className="font-medium text-red-600">{result.rowsFailed ?? 0}</span>
              </div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-600 mb-1">Error:</p>
                <ul className="list-disc list-inside text-xs text-red-500 space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
