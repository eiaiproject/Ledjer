import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import {
  buildDraft,
  extractOriginalParty,
  matchProducts,
  normalizePartyName,
  parseQuickEntryText,
  type ProductLite,
  type QuickEntryDraft,
} from "@/lib/quick-entry";
import { listProducts } from "@/lib/api/products";
import { listAccounts, listCashBankAccounts } from "@/lib/api/accounts";
import { postTransaction } from "@/lib/api/transactions";
import { isApiError } from "@/lib/api/client";
import { useLocalDb } from "@/lib/db/provider";
import { useMaxTransactionDate } from "@/hooks/useMaxTransactionDate";
import { getAllParties, getProductById, createPartyLocal, postTransactionLocal } from "@/lib/db/repos";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatDateInputValue, formatIDR, formatQuantity, formatShortDate } from "@/lib/utils";

const GUIDE_GROUPS: { title: string; note?: string; examples: string[] }[] = [
  {
    title: "Stok",
    note: "Produk dibuat dulu di halaman Produk. Jual dan susut butuh stok.",
    examples: [
      "jual kopi 10 butir 50rb",
      "beli kopi 100 butir 400rb",
      "kopi pecah 2 butir",
      "beli kopi dari supplier 400rb dapat 100 butir",
    ],
  },
  {
    title: "Uang",
    note: "Tanpa produk. Nama kas atau bank yang diketik tidak memilih akun.",
    examples: [
      "bayar sewa 500rb",
      "transfer 200rb",
      "setor modal awal 1jt",
      "ambil prive 300rb",
    ],
  },
];

const HELP_EXAMPLES = GUIDE_GROUPS.flatMap((g) => g.examples).slice(0, 4);

const DRAFT_LABEL: Record<string, string> = {
  sale: "Penjualan",
  purchase: "Pembelian",
  expense: "Beban",
  transfer: "Transfer",
  deposit: "Setoran modal",
  withdrawal: "Pengambilan pemilik",
  stock_loss: "Susut stok",
  ambiguous_buy: "Beli — pilih jenis",
};
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
  const { userId } = useBook();
  const queryClient = useQueryClient();
  const localDb = useLocalDb();
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
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [ambiguousChoice, setAmbiguousChoice] = useState<"purchase" | "expense" | null>(null);
  // Tutorial selalu tertutup tiap buka halaman — tanpa ingatan antar-sesi.
  const [showGuide, setShowGuide] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tanggal catat: default hari ini, bisa mundur (aturan append-only di bawah).
  const [txDate, setTxDate] = useState(formatDateInputValue());
  const maxDate = useMaxTransactionDate();
  const productsQuery = useQuery({
    queryKey: queryKeys.products.all(userId),
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      return listProducts(true);
    },
    enabled: !!userId,
  });
  const cashQuery = useQuery({
    queryKey: queryKeys.accounts.all(userId ?? ""),
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      return listCashBankAccounts();
    },
    enabled: !!userId,
  });
  const incomeQuery = useQuery({
    queryKey: [...queryKeys.accounts.all(userId ?? ""), "income"],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const accounts = await listAccounts();
      return accounts.filter((a) => a.account_class === "income" && a.is_active === 1);
    },
    enabled: !!userId,
  });
  const expenseQuery = useQuery({
    queryKey: [...queryKeys.accounts.all(userId ?? ""), "expense"],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const accounts = await listAccounts();
      return accounts.filter((a) => a.account_class === "expense" && a.is_active === 1);
    },
    enabled: !!userId,
  });
  // Lawan akun setor/ambil: Modal (3110) dan Prive (3120). Server mewajibkan
  // counter ekuitas (counter_account_required), jadi chat harus mengirimnya —
  // tanpanya transaksi ditolak 400 dan hilang dari semua daftar.
  const equityQuery = useQuery({
    queryKey: [...queryKeys.accounts.all(userId ?? ""), "equity"],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const accounts = await listAccounts();
      return accounts.filter((a) => a.account_class === "equity" && a.is_active === 1);
    },
    enabled: !!userId,
  });

  const catalog: ProductLite[] = useMemo(
    () => (productsQuery.data ?? []).map(toProductLite),
    [productsQuery.data],
  );
  const selectedProduct = catalog.find((p) => p.id === productId);

  // Default akun: kas pertama + pendapatan pertama (derived, tanpa effect).

  const startDraft = (seed: QuickEntryDraft) => {
    setDraft(seed);
    setProductId(seed.productId ?? "");
    setQuantity(seed.quantity !== undefined ? String(seed.quantity) : "");
    setUnitPrice(seed.unitPriceIdr !== undefined ? String(seed.unitPriceIdr) : "");
    setTotal(
      seed.totalIdr !== undefined ? String(seed.totalIdr)
        : seed.amountIdr !== undefined ? String(seed.amountIdr)
        : "",
    );
    setExpenseAccountId("");
    setPartyName(seed.partyQuery ?? "");
    setAmbiguousChoice(null);
    setTxDate(formatDateInputValue());
    setDraftError(null);
    setDoneMessage(null);
  };

  // Katalog belum ada (userId masih resolving → query disabled, atau fetch
  // perdana) berarti Kirim tak boleh diklik: draft dari katalog kosong selalu
  // "tidak ditemukan" walau produk sudah ada di server.
  const catalogReady = productsQuery.data !== undefined;

  const handleSend = () => {
    if (!catalogReady) return;
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
    // Kembalikan ejaan asli pihak dari ketikan (parser bekerja lowercase)
    // agar "Budi"/"PT Maju" tersimpan sebagaimana diketik, bukan kecil semua.
    if ("partyQuery" in built && typeof built.partyQuery === "string" && built.partyQuery) {
      setPartyName(normalizePartyName(extractOriginalParty(text, built.partyQuery)));
    }
    if ((built.candidates?.length ?? 0) > 1) {
      // Biarkan pengguna memilih lewat dropdown kandidat.
    }
  };

  const qty = Number(quantity);
  const price = Number(unitPrice);
  const totalNum = Number(total);
  const stock = selectedProduct?.current_stock ?? 0;
  const hasCash = cashAccountId !== "" || (cashQuery.data?.length ?? 0) > 0;
  const effectiveCashId = cashAccountId !== "" ? cashAccountId : (cashQuery.data?.[0]?.id ?? "");
  const effectiveIncomeId = incomeAccountId !== "" ? incomeAccountId : (incomeQuery.data?.[0]?.id ?? "");
  const effectiveExpenseId = expenseAccountId !== "" ? expenseAccountId : (expenseQuery.data?.[0]?.id ?? "");
  const equityDepositId = equityQuery.data?.find((a) => a.code === "3110")?.id ?? "";
  const equityWithdrawalId = equityQuery.data?.find((a) => a.code === "3120")?.id ?? "";
  const insufficient = (draft?.kind === "sale" || draft?.kind === "stock_loss") && Number.isFinite(qty) && qty > stock;
  // Kecukupan kas sumber untuk arus keluar. Saldo unknown (offline/query gagal)
  // berarti tidak diblokir — local-first tetap bisa mencatat tanpa koneksi.
  const cashBalance = cashQuery.data?.find((a) => a.id === effectiveCashId)?.balance_idr ?? null;
  const outflowAmount = (() => {
    if (!draft || !Number.isInteger(totalNum) || totalNum <= 0) return null;
    switch (draft.kind) {
      case "purchase":
      case "expense":
      case "withdrawal":
      case "transfer":
        return totalNum;
      case "ambiguous_buy":
        return ambiguousChoice === null ? null : totalNum;
      default:
        return null;
    }
  })();
  const insufficientCash = outflowAmount !== null && cashBalance !== null && cashBalance < outflowAmount;
  // Append-only kronologis: tanggal mundur hanya boleh bila belum ada catatan
  // yang lebih baru. maxDate null = belum ada catatan / unknown (offline) → bebas.
  const todayStr = formatDateInputValue();
  const isFuture = txDate > todayStr;
  const tooOld = maxDate !== null && txDate < maxDate;
  const valid = (() => {
    if (draft === null || posting) return false;
    if (!hasCash) return false;
    if (insufficientCash) return false;
    if (isFuture || tooOld) return false;
    if (draft.kind === "sale" || draft.kind === "purchase") {
      return productId !== "" &&
        Number.isFinite(qty) && qty > 0 &&
        Number.isInteger(price) && price > 0 &&
        Number.isInteger(totalNum) && totalNum > 0 &&
        (draft.kind === "purchase" || incomeAccountId !== "" || (incomeQuery.data?.length ?? 0) > 0) &&
        !insufficient;
    }
    if (draft.kind === "stock_loss") {
      return productId !== "" && Number.isFinite(qty) && qty > 0 && !insufficient;
    }
    if (draft.kind === "expense") {
      return Number.isInteger(totalNum) && totalNum > 0 &&
        (expenseAccountId !== "" || (expenseQuery.data?.length ?? 0) > 0);
    }
    if (draft.kind === "ambiguous_buy") {
      // Wajib pilih eksplisit dulu; tiap pilihan punya syaratnya sendiri.
      if (ambiguousChoice === "expense") {
        return Number.isInteger(totalNum) && totalNum > 0 &&
          (expenseAccountId !== "" || (expenseQuery.data?.length ?? 0) > 0);
      }
      if (ambiguousChoice === "purchase") {
        return productId !== "" && Number.isFinite(qty) && qty > 0 &&
          Number.isInteger(price) && price > 0 && Number.isInteger(totalNum) && totalNum > 0;
      }
      return false;
    }
    if (draft.kind === "deposit") {
      return Number.isInteger(totalNum) && totalNum > 0 && equityDepositId !== "";
    }
    if (draft.kind === "withdrawal") {
      return Number.isInteger(totalNum) && totalNum > 0 && equityWithdrawalId !== "";
    }
    return Number.isInteger(totalNum) && totalNum > 0;
  })();
  const missingEquity =
    (draft?.kind === "deposit" && equityDepositId === "") ||
    (draft?.kind === "withdrawal" && equityWithdrawalId === "");

  /** Satu handler untuk qty/harga/total: field yang diubah menghitung ulang pasangannya. */
  const handleAmountChange = (field: "quantity" | "unitPrice" | "total", value: string) => {
    const nextQty = field === "quantity" ? value : quantity;
    const nextPrice = field === "unitPrice" ? value : unitPrice;
    let nextTotal = field === "total" ? value : total;
    const qn = Number(nextQty);
    const pn = Number(nextPrice);
    const tn = Number(nextTotal);
    if (field !== "total" && Number.isFinite(qn) && qn > 0 && Number.isInteger(pn) && pn > 0) {
      nextTotal = String(qn * pn);
    } else if (field === "total" && Number.isFinite(qn) && qn > 0 && Number.isInteger(tn) && tn > 0) {
      return applyAmounts(nextQty, String(Math.round(tn / qn)), nextTotal);
    }
    applyAmounts(nextQty, nextPrice, nextTotal);
  };

  const applyAmounts = (nextQty: string, nextPrice: string, nextTotal: string) => {
    setQuantity(nextQty);
    setUnitPrice(nextPrice);
    setTotal(nextTotal);
  };

  const handleConfirm = async () => {
    if (!valid || !draft || !userId) return;
    setPosting(true);
    try {
      const date = txDate;
      let description = "";
      let postedTotal = totalNum;
      // Local-first: tulis ke SQLite perangkat dulu (offline), sync jalan di background.
      // Server tetap dipanggil bila reachable agar backup/cross-device tidak tertinggal;
      // kegagalan jaringan bukan kegagalan pencatatan.
      const postLocalThenServer = async (input: {
        transactionType: "cash_in" | "cash_out" | "transfer" | "owner_deposit" | "owner_withdrawal" | "purchase";
        description: string;
        cashAccountId: string;
        counterAccountId?: string;
        amountIdr: number;
        partyId?: string | null;
        productId?: string | null;
        quantityMilli?: number;
        unitCostMinor?: number;
        stockLoss?: boolean;
        items?: Array<{ productId: string; quantity: number; unitPriceIdr?: number; unitCostIdr?: number }>;
      }) => {
        if (localDb) {
          postTransactionLocal(localDb, userId, {
            transactionType: input.transactionType,
            transactionDate: date,
            description: input.description,
            partyId: input.partyId,
            productId: input.productId,
            cashAccountId: input.cashAccountId,
            counterAccountId: input.counterAccountId,
            amountIdr: input.amountIdr,
            quantityMilli: input.quantityMilli,
            unitCostMinor: input.unitCostMinor,
            stockLoss: input.stockLoss,
          });
        }
        try {
          const serverInput: Record<string, unknown> = {
            transactionType: input.transactionType,
            transactionDate: date,
            cashAccountId: input.cashAccountId,
            description: input.description,
            idempotencyKey: crypto.randomUUID(),
          };
          if (input.counterAccountId) serverInput.counterAccountId = input.counterAccountId;
          if (input.amountIdr > 0) serverInput.amountIdr = input.amountIdr;
          if (input.items) serverInput.items = input.items;
          await postTransaction(serverInput as unknown as Parameters<typeof postTransaction>[0]);
        } catch (err) {
          // Hanya kegagalan jaringan/server (bukan validasi) yang boleh optimis:
          // outbox menyimpan op untuk sync berikutnya. Error validasi 4xx
          // (mis. akun lawan hilang) harus terlihat agar tidak dikira tercatat.
          if (localDb && (!isApiError(err) || err.status >= 500 || err.status === 408 || err.status === 429)) return;
          throw err;
        }
      };
      const resolvePartyId = (name: string, type: "customer" | "supplier"): string | null => {
        if (!localDb || !name.trim()) return null;
        const needle = name.trim().toLowerCase();
        const existing = getAllParties(localDb, userId).find((p) => p.name.toLowerCase() === needle);
        if (existing) return existing.id;
        return createPartyLocal(localDb, userId, { name: name.trim(), partyType: type }).id;
      };
      if (draft.kind === "sale" || draft.kind === "purchase") {
        if (!selectedProduct) return;
        const isSale = draft.kind === "sale";
        const partyText = partyName.trim() || draft.partyQuery?.trim() || "";
        const party = partyText ? (isSale ? ` ke ${partyText}` : ` dari ${partyText}`) : "";
        description = `${isSale ? "Jual" : "Beli"} ${qty} ${selectedProduct.unit} ${selectedProduct.name}${party} (via cepat)`;
        // Local stock math butuh milli + minor (sama seperti Fase 2).
        const quantityMilli = Math.round(qty * 1000);
        const unitMinor = price * 10_000;
        const partyId = partyText ? resolvePartyId(partyText, isSale ? "customer" : "supplier") : null;
        if (isSale) {
          await postLocalThenServer({
            transactionType: "cash_in",
            description,
            cashAccountId: effectiveCashId,
            counterAccountId: effectiveIncomeId,
            amountIdr: totalNum,
            partyId,
            productId,
            quantityMilli,
            unitCostMinor: unitMinor,
            items: [{ productId, quantity: qty, unitPriceIdr: price }],
          });
        } else {
          await postLocalThenServer({
            transactionType: "purchase",
            description,
            cashAccountId: effectiveCashId,
            amountIdr: totalNum,
            partyId,
            productId,
            quantityMilli,
            unitCostMinor: unitMinor,
            items: [{ productId, quantity: qty, unitCostIdr: price }],
          });
        }
      } else if (draft.kind === "expense") {
        description = `Bayar ${draft.description ?? "beban"} (via cepat)`;
        postedTotal = Number(total);
        await postLocalThenServer({
          transactionType: "cash_out",
          description,
          cashAccountId: effectiveCashId,
          counterAccountId: effectiveExpenseId,
          amountIdr: postedTotal,
        });
      } else if (draft.kind === "ambiguous_buy") {
        // Pilihan eksplisit pengguna — tidak ada tebakan diam-diam.
        if (ambiguousChoice === "expense") {
          description = `Bayar ${draft.description ?? "beban"} (via cepat)`;
          postedTotal = Number(total);
          await postLocalThenServer({
            transactionType: "cash_out",
            description,
            cashAccountId: effectiveCashId,
            counterAccountId: effectiveExpenseId,
            amountIdr: postedTotal,
          });
        } else {
          if (!selectedProduct) return;
          const partyText = partyName.trim();
          const party = partyText ? ` dari ${partyText}` : "";
          description = `Beli ${qty} ${selectedProduct.unit} ${selectedProduct.name}${party} (via cepat)`;
          const quantityMilli = Math.round(qty * 1000);
          const unitMinor = price * 10_000;
          await postLocalThenServer({
            transactionType: "purchase",
            description,
            cashAccountId: effectiveCashId,
            amountIdr: totalNum,
            partyId: partyText ? resolvePartyId(partyText, "supplier") : null,
            productId,
            quantityMilli,
            unitCostMinor: unitMinor,
            items: [{ productId, quantity: qty, unitCostIdr: price }],
          });
        }
      } else if (draft.kind === "stock_loss") {
        if (!selectedProduct) return;
        description = `${selectedProduct.name} ${draft.reason ?? "pecah"} ${qty} ${selectedProduct.unit} (via cepat)`;
        postedTotal = 0;
        // Jurnal susut = HPP DR / Persediaan CR dari movement "loss" (Fase 2);
        // WAC dibaca dari produk lokal (sumber kebenaran); fallback harga input.
        const localProduct = localDb ? getProductById(localDb, productId) : null;
        const lossWacMinor = localProduct && localProduct.average_cost_minor > 0
          ? localProduct.average_cost_minor
          : price * 10_000;
        await postLocalThenServer({
          transactionType: "cash_out",
          description,
          cashAccountId: effectiveCashId,
          amountIdr: 1,
          productId,
          quantityMilli: Math.round(qty * 1000),
          unitCostMinor: lossWacMinor,
          stockLoss: true,
        });
      } else if (draft.kind === "transfer") {
        description = draft.description ? `Transfer ${draft.description} ${formatIDR(totalNum)} (via cepat)` : `Transfer ${formatIDR(totalNum)} (via cepat)`;
        postedTotal = totalNum;
        const targetCashId = cashQuery.data?.find((a) => a.id !== effectiveCashId)?.id ?? effectiveCashId;
        await postLocalThenServer({
          transactionType: "transfer",
          description,
          cashAccountId: effectiveCashId,
          counterAccountId: targetCashId,
          amountIdr: postedTotal,
        });
      } else if (draft.kind === "deposit") {
        if (!equityDepositId) return;
        description = draft.description ? `Setor ${draft.description} ${formatIDR(totalNum)} (via cepat)` : `Setor modal ${formatIDR(totalNum)} (via cepat)`;
        postedTotal = totalNum;
        await postLocalThenServer({
          transactionType: "owner_deposit",
          description,
          cashAccountId: effectiveCashId,
          counterAccountId: equityDepositId,
          amountIdr: postedTotal,
        });
      } else if (draft.kind === "withdrawal") {
        if (!equityWithdrawalId) return;
        description = draft.description ? `Ambil ${draft.description} ${formatIDR(totalNum)} (via cepat)` : `Ambil prive ${formatIDR(totalNum)} (via cepat)`;
        postedTotal = totalNum;
        await postLocalThenServer({
          transactionType: "owner_withdrawal",
          description,
          cashAccountId: effectiveCashId,
          counterAccountId: equityWithdrawalId,
          amountIdr: postedTotal,
        });
      } else {
        const label = DRAFT_LABEL[draft.kind] ?? draft.kind;
        description = `${label} ${formatIDR(totalNum)} (via cepat)`;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.products.allProducts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allDashboard() });
      queryClient.invalidateQueries({ queryKey: ["max-transaction-date"] });
      toast.success("Transaksi tercatat.");
      setDoneMessage(`Transaksi tercatat: ${description} = ${formatIDR(postedTotal)}.`);
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
    if (probe.kind !== "sale" && probe.kind !== "purchase" && probe.kind !== "stock_loss") return [];
    return matchProducts(probe.productQuery, catalog, "purchase").slice(0, 4);
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
              ref={inputRef}
              label="Input cepat"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="cth: jual kopi 10pcs 50000"
              inputMode="text"
              enterKeyHint="send"
              className="text-base"
            />
          </div>
          <Button type="submit" className="min-h-[44px] shrink-0" disabled={productsQuery.isLoading || !catalogReady} loading={productsQuery.isLoading}>
            Kirim
          </Button>
        </form>

        <div>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            aria-expanded={showGuide}
            aria-controls="quick-entry-guide"
            className="min-h-[44px] rounded-md px-1 py-1 text-left text-sm font-medium text-wood-600 underline decoration-wood-300 underline-offset-4 hover:text-wood-700"
          >
            {showGuide ? "Sembunyikan contoh dan cara pakai" : "Lihat contoh dan cara pakai"}
          </button>
          {showGuide && (
            <div id="quick-entry-guide" className="space-y-3 rounded-lg border border-wood-200 px-3 py-3">
              {GUIDE_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <p className="text-sm font-semibold text-text-primary">{group.title}</p>
                  {group.note && <p className="text-xs text-text-tertiary">{group.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    {group.examples.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setText(example);
                          setShowGuide(false);
                          inputRef.current?.focus();
                        }}
                        className="rounded-md border border-wood-300 px-2 py-1 font-mono text-xs text-wood-700 hover:bg-cream-100"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-text-tertiary">
                Pastikan dropdown Kas dan kategori di pratinjau sudah benar sebelum menekan Catat.
              </p>
            </div>
          )}
        </div>

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
                        if (draft?.kind !== "sale" && draft?.kind !== "purchase" && draft?.kind !== "stock_loss") return;
                        const rebuilt = buildDraft(
                          { ok: true, kind: "sale", productQuery: s.name, quantity: 1, unitPriceIdr: 1 },
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

          {draft && (draft.kind === "sale" || draft.kind === "purchase" || draft.kind === "stock_loss" ? selectedProduct : true) && (
            <div className="space-y-3 rounded-lg border border-wood-200 px-3 py-3">
              <p className="text-sm font-medium text-text-primary">
                {DRAFT_LABEL[draft.kind] ?? draft.kind}
                {selectedProduct && (draft.kind === "sale" || draft.kind === "purchase") && (
                  <> {selectedProduct.name} ×{formatQuantity(qty)} @
                  {formatIDR(Number.isInteger(price) ? price : 0)} = {formatIDR(Number.isInteger(totalNum) ? totalNum : 0)}</>
                )}
                {selectedProduct && draft.kind === "stock_loss" && (
                  <> {selectedProduct.name} ×{formatQuantity(qty)} {selectedProduct.unit} ({draft.reason})</>
                )}
                {(draft.kind === "expense" || draft.kind === "transfer" || draft.kind === "deposit" || draft.kind === "withdrawal") && (
                  <> {formatIDR(Number.isInteger(totalNum) ? totalNum : 0)}{draft.description ? ` · ${draft.description}` : ""}</>
                )}
                {draft.kind === "sale" && Number.isFinite(qty) && selectedProduct && (
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
                  Stok tidak cukup (tersedia {formatQuantity(stock)} {selectedProduct?.unit ?? ""}).
                </p>
              )}
              {insufficientCash && cashBalance !== null && outflowAmount !== null && (
                <p className="text-sm font-medium text-error">
                  Kas tidak cukup (saldo {formatIDR(cashBalance)}, butuh {formatIDR(outflowAmount)}).
                </p>
              )}
              {missingEquity && (
                <p className="text-sm font-medium text-error">
                  Akun {draft?.kind === "deposit" ? "Modal Pemilik (3110)" : "Pengambilan Pemilik (3120)"} tidak ditemukan. Pulihkan bagan akun di halaman Akun.
                </p>
              )}
              {isFuture && (
                <p className="text-sm font-medium text-error">
                  Tanggal tidak boleh lebih dari hari ini.
                </p>
              )}
              {tooOld && maxDate && (
                <p className="text-sm font-medium text-error">
                  Catatan terakhir tanggal {formatShortDate(maxDate)}. Untuk mencatat {formatShortDate(txDate)}, void dulu transaksi tanggal {formatShortDate(maxDate)} lalu catat ulang.{" "}
                  <Link to={`/transactions?fromDate=${maxDate}&toDate=${maxDate}`} className="underline underline-offset-2">
                    Lihat transaksi tanggal itu
                  </Link>
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="Tanggal"
                  type="date"
                  value={txDate}
                  max={todayStr}
                  onChange={(e) => setTxDate(e.target.value)}
                />
                {(draft.kind === "sale" || draft.kind === "purchase" || draft.kind === "stock_loss") && (
                  <Select
                    label="Produk"
                    value={productId}
                    onChange={(e) => {
                      const next = catalog.find((p) => p.id === e.target.value);
                      if (!next) return;
                      setProductId(next.id);
                    }}
                    options={(draft.candidates ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
                {(draft.kind === "sale" || draft.kind === "purchase" || draft.kind === "stock_loss") && (
                  <Input label="Jumlah" inputMode="decimal" value={quantity} onChange={(e) => handleAmountChange("quantity", e.target.value)} />
                )}
                {(draft.kind === "sale" || draft.kind === "purchase") && (
                  <>
                    <Input label="Harga satuan (Rp)" inputMode="numeric" value={unitPrice} onChange={(e) => handleAmountChange("unitPrice", e.target.value)} />
                    <Input label="Total (Rp)" inputMode="numeric" value={total} onChange={(e) => handleAmountChange("total", e.target.value)} />
                  </>
                )}
                {(draft.kind === "expense" || draft.kind === "transfer" || draft.kind === "deposit" || draft.kind === "withdrawal") && (
                  <Input label="Nominal (Rp)" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
                )}
                {(draft.kind === "sale" || draft.kind === "purchase") && (
                  <Input label={draft.kind === "sale" ? "Pelanggan (ke)" : "Supplier (dari)"} value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder={draft.kind === "sale" ? "cth: Nadia" : "cth: Vitantri"} />
                )}
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
                {draft.kind === "expense" && (
                  <Select
                    label="Kategori beban"
                    value={expenseAccountId !== "" ? expenseAccountId : (expenseQuery.data?.[0]?.id ?? "")}
                    onChange={(e) => setExpenseAccountId(e.target.value)}
                    options={[
                      { value: "", label: "Pilih beban" },
                      ...(expenseQuery.data ?? []).map((a) => ({ value: a.id, label: a.name })),
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
