import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import {
  buildDraft,
  matchProducts,
  parseQuickEntryText,
  type ProductLite,
  type QuickEntryDraft,
} from "@/lib/quick-entry";
import { listProducts } from "@/lib/api/products";
import { listAccounts, listCashBankAccounts } from "@/lib/api/accounts";
import { postTransaction } from "@/lib/api/transactions";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatDateInputValue, formatIDR, formatQuantity } from "@/lib/utils";

const HELP_EXAMPLES = ["jual kopi 10pcs 50000", "beli gula 5kg 20000"];

function toProductLite(p: {
  id: string;
  name: string;
  unit: string;
  is_active: number;
  current_stock: number;
}): ProductLite {
  return { id: p.id, name: p.name, unit: p.unit, is_active: p.is_active, current_stock: p.current_stock };
}

export function QuickEntryBar() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuickEntryDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  // Edit lokal pratinjau.
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [total, setTotal] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState("");

  const productsQuery = useQuery({
    queryKey: queryKeys.products.all(orgId),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listProducts(true);
    },
    enabled: !!orgId,
  });
  const cashQuery = useQuery({
    queryKey: queryKeys.accounts.all(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listCashBankAccounts();
    },
    enabled: !!orgId,
  });
  const incomeQuery = useQuery({
    queryKey: [...queryKeys.accounts.all(orgId ?? ""), "income"],
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      const accounts = await listAccounts();
      return accounts.filter((a) => a.account_class === "income" && a.is_active === 1);
    },
    enabled: !!orgId,
  });

  const catalog: ProductLite[] = useMemo(
    () => (productsQuery.data ?? []).map(toProductLite),
    [productsQuery.data],
  );
  const selectedProduct = catalog.find((p) => p.id === productId);

  // Default akun: kas pertama + pendapatan pertama (derived, tanpa effect).

  const startDraft = (seed: QuickEntryDraft) => {
    setDraft(seed);
    setProductId(seed.productId);
    setQuantity(String(seed.quantity));
    setUnitPrice(String(seed.unitPriceIdr));
    setTotal(String(seed.totalIdr));
    setDraftError(null);
    setDoneMessage(null);
  };

  const handleSend = () => {
    setDoneMessage(null);
    const parsed = parseQuickEntryText(text);
    if (!parsed.ok) {
      setParseError(parsed.message);
      setDraft(null);
      setDraftError(null);
      return;
    }
    setParseError(null);
    const built = buildDraft(parsed, catalog);
    if ("error" in built) {
      setDraft(null);
      setDraftError(built.error);
      return;
    }
    startDraft(built);
    if (built.candidates.length > 1) {
      // Biarkan pengguna memilih lewat dropdown kandidat.
    }
  };

  const qty = Number(quantity);
  const price = Number(unitPrice);
  const totalNum = Number(total);
  const stock = selectedProduct?.current_stock ?? 0;
  const effectiveCashId = cashAccountId !== "" ? cashAccountId : (cashQuery.data?.[0]?.id ?? "");
  const effectiveIncomeId = incomeAccountId !== "" ? incomeAccountId : (incomeQuery.data?.[0]?.id ?? "");
  const insufficient = draft?.kind === "sale" && Number.isFinite(qty) && qty > stock;
  const valid =
    draft !== null &&
    productId !== "" &&
    Number.isFinite(qty) && qty > 0 &&
    Number.isInteger(price) && price > 0 &&
    Number.isInteger(totalNum) && totalNum > 0 &&
    (cashAccountId !== "" || (cashQuery.data?.length ?? 0) > 0) &&
    (draft.kind === "purchase" || incomeAccountId !== "" || (incomeQuery.data?.length ?? 0) > 0) &&
    !insufficient &&
    !posting;

  const handleQtyChange = (value: string) => {
    setQuantity(value);
    const q = Number(value);
    if (Number.isFinite(q) && q > 0 && Number.isInteger(price) && price > 0) {
      setTotal(String(q * price));
    }
  };

  const handlePriceChange = (value: string) => {
    setUnitPrice(value);
    const p = Number(value);
    if (Number.isFinite(qty) && qty > 0 && Number.isInteger(p) && p > 0) {
      setTotal(String(qty * p));
    }
  };

  const handleTotalChange = (value: string) => {
    setTotal(value);
    const t = Number(value);
    if (Number.isFinite(qty) && qty > 0 && Number.isInteger(t) && t > 0) {
      setUnitPrice(String(Math.round(t / qty)));
    }
  };

  const handleConfirm = async () => {
    if (!valid || !draft || !selectedProduct) return;
    setPosting(true);
    try {
      const isSale = draft.kind === "sale";
      const description = `${isSale ? "Jual" : "Beli"} ${qty} ${selectedProduct.unit} ${selectedProduct.name} (via cepat)`;
      const base = {
        transactionDate: formatDateInputValue(),
        cashAccountId: effectiveCashId,
        description,
        idempotencyKey: crypto.randomUUID(),
      };
      if (isSale) {
        await postTransaction({
          ...base,
          transactionType: "cash_in",
          counterAccountId: effectiveIncomeId,
          amountIdr: totalNum,
          items: [{ productId, quantity: qty, unitPriceIdr: price }],
        });
      } else {
        await postTransaction({
          ...base,
          transactionType: "purchase",
          items: [{ productId, quantity: qty, unitCostIdr: price }],
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.products.allProducts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allDashboard() });
      toast.success("Transaksi tercatat.");
      setDoneMessage(`Transaksi tercatat: ${description} = ${formatIDR(totalNum)}.`);
      setText("");
      setDraft(null);
      setParseError(null);
      setDraftError(null);
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setPosting(false);
    }
  };

  const suggestions = useMemo(() => {
    if (!text.trim()) return [];
    const probe = parseQuickEntryText(text);
    if (!probe.ok || draft) return [];
    return matchProducts(probe.productQuery, catalog, probe.kind).slice(0, 4);
  }, [text, catalog, draft]);

  return (
    <Card elevated>
      <CardContent className="space-y-3 p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              label="Input cepat"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="cth: jual kopi 10pcs 50000"
              inputMode="text"
              enterKeyHint="send"
              className="text-base"
            />
          </div>
          <Button type="submit" className="min-h-[44px] shrink-0" disabled={productsQuery.isLoading}>
            Kirim
          </Button>
        </form>

        <div aria-live="polite">
          {parseError && (
            <div className="space-y-2 rounded-lg bg-wood-100 px-3 py-2 text-sm">
              <p className="text-text-secondary">Tidak dimengerti. {parseError}</p>
              <div className="flex flex-wrap gap-2">
                {HELP_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setText(example)}
                    className="rounded-md border border-wood-300 px-2 py-1 font-mono text-xs text-wood-700 hover:bg-cream-100"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {draftError && (
            <div className="space-y-2 rounded-lg bg-wood-100 px-3 py-2 text-sm">
              <p className="text-text-secondary">{draftError}</p>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const rebuilt = buildDraft(
                          { ok: true, kind: draft?.kind ?? "sale", productQuery: s.name, quantity: 1, unitPriceIdr: 1 },
                          catalog,
                        );
                        if (!("error" in rebuilt)) {
                          const forced = { ...rebuilt, productId: s.id };
                          startDraft(forced);
                          setDraftError(null);
                        }
                      }}
                      className="rounded-md border border-wood-300 px-2 py-1 text-xs text-wood-700 hover:bg-cream-100"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {draft && selectedProduct && (
            <div className="space-y-3 rounded-lg border border-wood-200 px-3 py-3">
              <p className="text-sm font-medium text-text-primary">
                {draft.kind === "sale" ? "Jual" : "Beli"} {selectedProduct.name} ×{formatQuantity(qty)} @
                {formatIDR(Number.isInteger(price) ? price : 0)} = {formatIDR(Number.isInteger(totalNum) ? totalNum : 0)}
                {draft.kind === "sale" && Number.isFinite(qty) && (
                  <span className="text-text-tertiary"> · stok {formatQuantity(stock)}→{formatQuantity(stock - qty)}</span>
                )}
              </p>
              {draft.warnings.map((warning) => (
                <p key={warning} className="text-xs text-text-tertiary">
                  {warning}
                </p>
              ))}
              {insufficient && (
                <p className="text-sm font-medium text-error">
                  Stok tidak cukup (tersedia {formatQuantity(stock)} {selectedProduct.unit}).
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  label="Produk"
                  value={productId}
                  onChange={(e) => {
                    const next = catalog.find((p) => p.id === e.target.value);
                    if (!next) return;
                    setProductId(next.id);
                  }}
                  options={draft.candidates.map((c) => ({ value: c.id, label: c.name }))}
                />
                <Input label="Jumlah" inputMode="decimal" value={quantity} onChange={(e) => handleQtyChange(e.target.value)} />
                <Input label="Harga satuan (Rp)" inputMode="numeric" value={unitPrice} onChange={(e) => handlePriceChange(e.target.value)} />
                <Input label="Total (Rp)" inputMode="numeric" value={total} onChange={(e) => handleTotalChange(e.target.value)} />
                <Select
                  label="Kas"
                  value={effectiveCashId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  options={[
                    { value: "", label: "Pilih kas" },
                    ...(cashQuery.data ?? []).map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
                {draft.kind === "sale" && (
                  <Select
                    label="Akun pendapatan"
                    value={effectiveIncomeId}
                    onChange={(e) => setIncomeAccountId(e.target.value)}
                    options={[
                      { value: "", label: "Pilih pendapatan" },
                      ...(incomeQuery.data ?? []).map((a) => ({ value: a.id, label: a.name })),
                    ]}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={draft.kind === "sale" ? "success" : "info"} size="sm">
                  {draft.kind === "sale" ? "Penjualan" : "Pembelian"}
                </Badge>
                <div className="flex-1" />
                <Button onClick={handleConfirm} disabled={!valid} loading={posting}>
                  Catat
                </Button>
              </div>
            </div>
          )}

          {doneMessage && <p className="text-sm text-text-secondary">{doneMessage}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
