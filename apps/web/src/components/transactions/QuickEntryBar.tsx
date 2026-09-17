import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import {
  buildDraft,
  extractOriginalParty,
  extractOriginalText,
  matchProducts,
  normalizePartyName,
  parseQuickEntryText,
  type ProductLite,
  type QuickEntryDraft,
} from "@/lib/quick-entry";
import { createProduct, listProducts } from "@/lib/api/products";
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
import { formatDateInputValue, formatDecimalIDR, formatIDR, formatQuantity, formatShortDate } from "@/lib/utils";

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
  // Pembuatan produk baru butuh server (ID + kode PRD berurutan) — lacak online.
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  // Panel produk baru dari info beli: semua field wajib dikonfirmasi eksplisit.
  const [newProduct, setNewProduct] = useState<{
    name: string;
    unit: string;
    quantity: string;
    total: number;
    party?: string;
  } | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductError, setNewProductError] = useState<string | null>(null);
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
      // Beli produk tak dikenal + nol kandidat mirip → tawarkan buat produk baru
      // (wajib konfirmasi eksplisit, bukan diam-diam). Ada kandidat = alur biasa.
      if (parsed.ok && parsed.kind === "purchase") {
        setDraft(null);
        setDraftError(null);
        openNewProduct({
          name: extractOriginalText(text, parsed.productQuery),
          unit: parsed.unit ?? "",
          quantity: String(parsed.quantity),
          total: parsed.totalIdr ?? 0,
          party: parsed.partyQuery
            ? normalizePartyName(extractOriginalParty(text, parsed.partyQuery))
            : undefined,
        });
        return;
      }
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
        Number.isFinite(price) && price > 0 &&
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
          Number.isFinite(price) && price > 0 && Number.isInteger(totalNum) && totalNum > 0;
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

  /** Satuan presisi diturunkan dari total ÷ jumlah (maks 4 desimal, tanpa pembulatan rupiah). */
  const deriveUnit = (qn: number, tn: number): string => String(Number((tn / qn).toFixed(4)));

  /** Satu handler untuk qty/total: field yang diubah menghitung ulang pasangannya.
   *  Satuan selalu diturunkan (read-only di pratinjau) — nominal ketikanlah yang tercatat. */
  const handleAmountChange = (field: "quantity" | "unitPrice" | "total", value: string) => {
    const nextQty = field === "quantity" ? value : quantity;
    const nextPrice = field === "unitPrice" ? value : unitPrice;
    let nextTotal = field === "total" ? value : total;
    const qn = Number(nextQty);
    const pn = Number(nextPrice);
    const tn = Number(nextTotal);
    if (field !== "total" && Number.isFinite(qn) && qn > 0 && Number.isFinite(pn) && pn > 0) {
      nextTotal = String(Math.round(qn * pn));
    } else if (field === "total" && Number.isFinite(qn) && qn > 0 && Number.isInteger(tn) && tn > 0) {
      return applyAmounts(nextQty, deriveUnit(qn, tn), nextTotal);
    } else if (field === "quantity" && nextPrice === "" && Number.isFinite(qn) && qn > 0 && Number.isInteger(tn) && tn > 0) {
      // Jumlah dilengkapi belakangan (mis. beli produk yang sudah ada dari
      // pilihan ambigu): turunkan satuan dari total yang sudah pasti.
      return applyAmounts(nextQty, deriveUnit(qn, tn), nextTotal);
    }
    applyAmounts(nextQty, nextPrice, nextTotal);
  };

  const applyAmounts = (nextQty: string, nextPrice: string, nextTotal: string) => {
    setQuantity(nextQty);
    setUnitPrice(nextPrice);
    setTotal(nextTotal);
  };

  // Local-first: tulis ke SQLite perangkat dulu (offline), sync jalan di background.
  // Server tetap dipanggil bila reachable agar backup/cross-device tidak tertinggal;
  // kegagalan jaringan bukan kegagalan pencatatan.
  const postLocalThenServer = async (
    input: {
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
      },
      transactionDate: string = txDate,
    ) => {
    if (localDb) {
      if (!userId) throw new Error("Not authenticated");
      postTransactionLocal(localDb, userId, {
        transactionType: input.transactionType,
        transactionDate,
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
        transactionDate,
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
    if (!localDb || !userId || !name.trim()) return null;
    const needle = name.trim().toLowerCase();
    const existing = getAllParties(localDb, userId).find((p) => p.name.toLowerCase() === needle);
    if (existing) return existing.id;
    return createPartyLocal(localDb, userId, { name: name.trim(), partyType: type }).id;
  };

  const handleConfirm = async () => {
    if (!valid || !draft || !userId) return;
    setPosting(true);
    try {
      let description = "";
      let postedTotal = totalNum;
      if (draft.kind === "sale" || draft.kind === "purchase") {
        if (!selectedProduct) return;
        const isSale = draft.kind === "sale";
        const partyText = partyName.trim() || draft.partyQuery?.trim() || "";
        const party = partyText ? (isSale ? ` ke ${partyText}` : ` dari ${partyText}`) : "";
        description = `${isSale ? "Jual" : "Beli"} ${qty} ${selectedProduct.unit} ${selectedProduct.name}${party} (via cepat)`;
        // Presisi penuh dari nominal ketikan: minor bulat = round(total×10000/qty),
        // satuan = minor/10000 (maks 4 desimal). Total tercatat persis = totalNum.
        const quantityMilli = Math.round(qty * 1000);
        const preciseMinor = Math.round((totalNum * 10_000) / qty);
        const preciseUnit = preciseMinor / 10_000;
        const partyId = partyText ? resolvePartyId(partyText, isSale ? "customer" : "supplier") : null;
        if (isSale) {
          // Movement jual memakai WAC beku (bukan harga jual) agar HPP lokal benar.
          const localProduct = localDb ? getProductById(localDb, productId) : null;
          const saleWacMinor = localProduct && localProduct.average_cost_minor > 0
            ? localProduct.average_cost_minor
            : preciseMinor;
          await postLocalThenServer({
            transactionType: "cash_in",
            description,
            cashAccountId: effectiveCashId,
            counterAccountId: effectiveIncomeId,
            amountIdr: totalNum,
            partyId,
            productId,
            quantityMilli,
            unitCostMinor: saleWacMinor,
            items: [{ productId, quantity: qty, unitPriceIdr: preciseUnit }],
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
            unitCostMinor: preciseMinor,
            items: [{ productId, quantity: qty, unitCostIdr: preciseUnit }],
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
          const preciseMinor = Math.round((totalNum * 10_000) / qty);
          const preciseUnit = preciseMinor / 10_000;
          await postLocalThenServer({
            transactionType: "purchase",
            description,
            cashAccountId: effectiveCashId,
            amountIdr: totalNum,
            partyId: partyText ? resolvePartyId(partyText, "supplier") : null,
            productId,
            quantityMilli,
            unitCostMinor: preciseMinor,
            items: [{ productId, quantity: qty, unitCostIdr: preciseUnit }],
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

  // ── Produk baru dari info beli ──────────────────────────────────────

  const openNewProduct = (seed: {
    name: string;
    unit: string;
    quantity: string;
    total: number;
    party?: string;
  }) => {
    setNewProduct(seed);
    setNewProductError(null);
    setDraft(null);
    setDraftError(null);
    setDoneMessage(null);
  };

  // Pilihan Stok untuk beli-ambigu: produk yang namanya persis sama dipakai
  // (jumlah dilengkapi di pratinjau biasa); sisanya masuk panel produk baru.
  const chooseAmbiguousStock = () => {
    if (!draft || draft.kind !== "ambiguous_buy" || !draft.description) return;
    const needle = draft.description.trim().toLowerCase();
    const found = catalog.find((p) => p.name.toLowerCase() === needle);
    if (found) {
      startDraft({
        kind: "purchase",
        productId: found.id,
        candidates: [{ id: found.id, name: found.name }],
        quantity: undefined,
        unit: undefined,
        unitMismatch: false,
        unitPriceIdr: undefined,
        totalIdr: draft.amountIdr,
        warnings: [],
      });
      return;
    }
    openNewProduct({
      name: extractOriginalText(text, draft.description),
      unit: "",
      quantity: "",
      total: draft.amountIdr ?? 0,
    });
  };

  const npQty = Number(newProduct?.quantity ?? "");
  const npNameOk =
    (newProduct?.name.trim().length ?? 0) >= 1 && (newProduct?.name.trim().length ?? 0) <= 80;
  const npUnitOk =
    (newProduct?.unit.trim().length ?? 0) >= 1 && (newProduct?.unit.trim().length ?? 0) <= 20;
  const npQtyOk = Number.isFinite(npQty) && npQty > 0;
  const npTotalOk =
    newProduct !== null && Number.isInteger(newProduct.total) && newProduct.total > 0;
  const npCashOk = hasCash;
  const npCashEnough =
    newProduct === null || cashBalance === null || newProduct.total <= cashBalance;
  const npCashShort =
    newProduct !== null && cashBalance !== null && newProduct.total > cashBalance;
  const npDateOk = !isFuture && !(maxDate !== null && txDate < maxDate);
  const canCreateProduct =
    newProduct !== null &&
    !creatingProduct &&
    npNameOk && npUnitOk && npQtyOk && npTotalOk && npCashOk && npCashEnough && npDateOk &&
    isOnline;

  const handleCreateAndPost = async () => {
    if (!newProduct || !userId || !canCreateProduct) return;
    setCreatingProduct(true);
    setNewProductError(null);
    try {
      const name = newProduct.name.trim();
      const unit = newProduct.unit.trim();
      const qty = Number(newProduct.quantity);
      const total = newProduct.total;
      // Aman dari balapan/kegagalan-sebagian: pakai yang sudah ada bila namanya sama.
      const fresh = await listProducts(true);
      const existing = fresh.find(
        (p) => p.name.toLowerCase() === name.toLowerCase() && p.is_active === 1,
      );
      let productId: string;
      let createdNow = false;
      if (existing) {
        productId = existing.id;
      } else {
        try {
          productId = (await createProduct({ name, unit, sellingPriceIdr: 0 })).id;
          createdNow = true;
        } catch (err) {
          if (isApiError(err) && err.code === "product_name_taken") {
            const retry = (await listProducts(true)).find(
              (p) => p.name.toLowerCase() === name.toLowerCase(),
            );
            if (!retry) throw err;
            productId = retry.id;
          } else {
            throw err;
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.allProducts() });
      const quantityMilli = Math.round(qty * 1000);
      const preciseMinor = Math.round((total * 10_000) / qty);
      const partyId = newProduct.party ? resolvePartyId(newProduct.party, "supplier") : null;
      const party = newProduct.party ? ` dari ${newProduct.party}` : "";
      try {
        await postLocalThenServer(
          {
            transactionType: "purchase",
            description: `Beli ${qty} ${unit} ${name}${party} (via cepat)`,
            cashAccountId: effectiveCashId,
            amountIdr: total,
            partyId,
            productId,
            quantityMilli,
            unitCostMinor: preciseMinor,
            items: [{ productId, quantity: qty, unitCostIdr: preciseMinor / 10_000 }],
          },
          txDate,
        );
      } catch (err) {
        if (createdNow) {
          setNewProductError(
            `Produk '${name}' sudah dibuat, pembelian gagal: ${translateError(err)} Ulangi pencatatan dari chat.`,
          );
        } else {
          setNewProductError(translateError(err));
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.products.allProducts() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allDashboard() });
      queryClient.invalidateQueries({ queryKey: ["max-transaction-date"] });
      toast.success("Produk dibuat dan pembelian tercatat.");
      setDoneMessage(`Produk '${name}' dibuat dan pembelian ${formatIDR(total)} tercatat.`);
      setText("");
      setNewProduct(null);
      setParseError(null);
      setDraftError(null);
    } catch (err) {
      setNewProductError(`Gagal membuat produk: ${translateError(err)}`);
    } finally {
      setCreatingProduct(false);
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
                  {formatDecimalIDR(Number.isFinite(price) ? price : 0)} = {formatIDR(Number.isInteger(totalNum) ? totalNum : 0)}</>
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
              {draft.kind === "ambiguous_buy" && (
                <div className="flex gap-2" role="group" aria-label="Jenis pembelian">
                  <Button
                    variant={ambiguousChoice === "purchase" ? "primary" : "secondary"}
                    onClick={() => chooseAmbiguousStock()}
                  >
                    Stok
                  </Button>
                  <Button
                    variant={ambiguousChoice === "expense" ? "primary" : "secondary"}
                    onClick={() => setAmbiguousChoice("expense")}
                  >
                    Beban
                  </Button>
                </div>
              )}
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
                    <Input label="Harga satuan (Rp)" value={unitPrice} readOnly helperText="Otomatis: total ÷ jumlah" />
                    <Input label="Total (Rp)" inputMode="numeric" value={total} onChange={(e) => handleAmountChange("total", e.target.value)} />
                  </>
                )}
                {(draft.kind === "expense" || draft.kind === "transfer" || draft.kind === "deposit" || draft.kind === "withdrawal" || (draft.kind === "ambiguous_buy" && ambiguousChoice === "expense")) && (
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

          {newProduct && (
            <div className="space-y-3 rounded-lg border border-wood-200 px-3 py-3">
              <p className="text-sm font-medium text-text-primary">
                Produk baru: {newProduct.name}
              </p>
              <p className="text-xs text-text-tertiary">
                Produk &apos;{newProduct.name}&apos; akan dibuat
                (satuan di bawah, harga jual Rp0 — margin disembunyikan sampai diisi).
                Pembelian {formatIDR(newProduct.total)} akan dicatat: kas berkurang, stok bertambah.
                {newProduct.party ? ` Supplier: ${newProduct.party}.` : ""}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="Satuan"
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                  placeholder="cth: pcs"
                  helperText="Wajib diisi"
                />
                <Input
                  label="Jumlah"
                  inputMode="decimal"
                  value={newProduct.quantity}
                  onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })}
                />
                <Input label="Total (Rp)" value={formatIDR(newProduct.total)} readOnly />
                <Input
                  label="Tanggal"
                  type="date"
                  value={txDate}
                  max={todayStr}
                  onChange={(e) => setTxDate(e.target.value)}
                />
                <Select
                  label="Kas"
                  value={effectiveCashId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  options={[
                    { value: "", label: "Pilih kas" },
                    ...(cashQuery.data ?? []).map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </div>
              {npCashShort && cashBalance !== null && (
                <p className="text-sm font-medium text-error">
                  Kas tidak cukup (saldo {formatIDR(cashBalance)}, butuh {formatIDR(newProduct.total)}).
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
              {!isOnline && (
                <p className="text-sm font-medium text-error">
                  Butuh koneksi internet sekali untuk daftarkan produk baru.
                </p>
              )}
              {newProductError && (
                <p className="text-sm font-medium text-error">{newProductError}</p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1" />
                <Button variant="secondary" onClick={() => { setNewProduct(null); setNewProductError(null); }}>
                  Batal
                </Button>
                <Button onClick={handleCreateAndPost} disabled={!canCreateProduct} loading={creatingProduct}>
                  Buat &amp; catat
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
