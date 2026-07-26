import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/utils";
import { createInvoice } from "@/lib/api/invoices";
import { listParties } from "@/lib/api/parties";

interface LineItem {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

function toMinor(rupiah: number): number {
  return Math.round(rupiah * 100);
}

export default function NewInvoicePage() {
  const navigate = useNavigate();
  const { data: orgData, isLoading: orgLoading } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [partyId, setPartyId] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");

  const { data: parties, isLoading: partiesLoading } = useQuery({
    queryKey: queryKeys.parties.fullList(orgId!),
    queryFn: () => listParties(),
    enabled: !!orgId,
  });

  const mutation = useMutation({
    mutationFn: () => {
      return createInvoice({
        invoiceDate,
        dueDate,
        partyId,
        lines: lines.map((l) => ({
          description: l.description,
          quantityMilli: Math.round(l.quantity * 1000),
          unitPriceMinor: toMinor(l.unitPrice),
          amountMinor: toMinor(l.quantity * l.unitPrice),
        })),
        discountMinor: toMinor(discount),
        taxMinor: toMinor(tax),
        notes,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all() });
      navigate(`/invoices/${data.id}`);
    },
  });

  const addLine = () => setLines([...lines, { description: "", quantity: 1, unitPrice: 0 }]);
  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    const copy = lines.map((l, j) => (j === i ? { ...l, [field]: value } : l));
    setLines(copy);
  };
  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, j) => j !== i));
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = subtotal + tax - discount;

  if (orgLoading || partiesLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-wood-800">Faktur Baru</h1>
        <p className="text-sm text-wood-500">Buat faktur untuk pelanggan</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Date fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="inv-date" className="mb-1 block text-xs font-medium text-wood-600">Tanggal Faktur</label>
              <Input id="inv-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="inv-due" className="mb-1 block text-xs font-medium text-wood-600">Jatuh Tempo</label>
              <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Party select */}
          <div>
            <label htmlFor="inv-party" className="mb-1 block text-xs font-medium text-wood-600">Pelanggan</label>
            <Select
              id="inv-party"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="w-full"
              placeholder="Pilih pelanggan..."
              options={(parties?.customers ?? parties?.suppliers ?? []).map((p: { id: string; name: string }) => ({ value: p.id, label: p.name }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-wood-700">Item</h2>
            <Button variant="ghost" size="sm" onClick={addLine}>+ Tambah Item</Button>
          </div>
          {lines.map((line, i) => (
            <div key={line.description + "-" + i} className="grid grid-cols-12 gap-2 items-end border-b border-wood-100 pb-2">
              <div className="col-span-5">
                <label htmlFor={`inv-line-${i}-desc`} className="block text-xs text-wood-500 mb-0.5">Deskripsi</label>
                <Input id={`inv-line-${i}-desc`} value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Nama item" />
              </div>
              <div className="col-span-2">
                <label htmlFor={`inv-line-${i}-qty`} className="block text-xs text-wood-500 mb-0.5">Qty</label>
                <Input id={`inv-line-${i}-qty`} type="number" min={0} step={1} value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number.parseFloat(e.target.value) || 0)} />
              </div>
              <div className="col-span-2">
                <label htmlFor={`inv-line-${i}-price`} className="block text-xs text-wood-500 mb-0.5">Harga</label>
                <Input id={`inv-line-${i}-price`} type="number" min={0} value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", Number.parseFloat(e.target.value) || 0)} />
              </div>
              <div className="col-span-2 text-right text-sm text-wood-700 pt-5">
                {formatIDR(line.quantity * line.unitPrice * 100)}
              </div>
              <div className="col-span-1 pt-5">
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700 text-sm" aria-label="Hapus item">×</button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Discount, Tax, Notes */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="inv-discount" className="mb-1 block text-xs font-medium text-wood-600">Diskon (Rp)</label>
              <Input id="inv-discount" type="number" min={0} value={discount} onChange={(e) => setDiscount(Number.parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label htmlFor="inv-tax" className="mb-1 block text-xs font-medium text-wood-600">Pajak (Rp)</label>
              <Input id="inv-tax" type="number" min={0} value={tax} onChange={(e) => setTax(Number.parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label htmlFor="inv-notes" className="mb-1 block text-xs font-medium text-wood-600">Catatan</label>
            <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Catatan untuk faktur..." />
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="text-right space-y-1 text-sm">
        <div className="text-wood-600">Subtotal: {formatIDR(subtotal * 100)}</div>
        {discount > 0 && <div className="text-red-600">Diskon: -{formatIDR(discount * 100)}</div>}
        {tax > 0 && <div className="text-wood-600">Pajak: {formatIDR(tax * 100)}</div>}
        <div className="text-lg font-semibold text-wood-800 border-t border-wood-200 pt-1">Total: {formatIDR(total * 100)}</div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate("/invoices")}>Batal</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!partyId || lines.some((l) => !l.description) || mutation.isPending}
        >
          {mutation.isPending ? "Menyimpan..." : "Simpan Faktur"}
        </Button>
      </div>

      {mutation.isError && (
        <ErrorState message={(mutation.error as Error)?.message ?? "Gagal menyimpan faktur"} />
      )}
    </div>
  );
}
