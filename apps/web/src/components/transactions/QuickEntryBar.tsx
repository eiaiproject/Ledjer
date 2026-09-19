/* eslint-disable react-refresh/only-export-components -- modul murni + komponen satu file by design */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import type { Database } from "@sqlite.org/sqlite-wasm";
import {
  buildDraft,
  extractOriginalParty,
  extractOriginalText,
  matchProducts,
  normalizePartyName,
  parseQuickEntryText,
  type ProductLite,
  type QuickEntryDraft,
  type QuickEntryParsed,
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
/** Pilihan beli-ambigu: stok atau beban (null = belum pilih). */
export type AmbiguousChoice = "purchase" | "expense" | null;

/** Kolom jumlah yang bisa diubah di pratinjau. */
export type AmountField = "quantity" | "unitPrice" | "total";

function toProductLite(p: {
  id: string;
  name: string;
  unit: string;
  is_active: number;
  current_stock: number;
}): ProductLite {
  return { id: p.id, name: p.name, unit: p.unit, is_active: p.is_active, current_stock: p.current_stock };
}

// ── Validasi draf (modul murni) ──────────────────────────────────

export interface GoodsValidation {
  productId: string;
  qty: number;
  price: number;
  totalNum: number;
  incomeReady: boolean;
  isSale: boolean;
  insufficient: boolean;
}

export function isGoodsDraftValid(v: GoodsValidation): boolean {
  if (v.productId === "") return false;
  if (!Number.isFinite(v.qty) || v.qty <= 0) return false;
  if (!Number.isFinite(v.price) || v.price <= 0) return false;
  if (!Number.isInteger(v.totalNum) || v.totalNum <= 0) return false;
  if (v.isSale && !v.incomeReady) return false;
  return !v.insufficient;
}

export interface AmbiguousValidation {
  productId: string;
  qty: number;
  price: number;
  totalNum: number;
  expenseReady: boolean;
}

export function isAmbiguousDraftValid(
  choice: AmbiguousChoice,
  v: AmbiguousValidation,
): boolean {
  if (choice === "expense") {
    return Number.isInteger(v.totalNum) && v.totalNum > 0 && v.expenseReady;
  }
  if (choice === "purchase") {
    return (
      v.productId !== "" &&
      Number.isFinite(v.qty) && v.qty > 0 &&
      Number.isFinite(v.price) && v.price > 0 &&
      Number.isInteger(v.totalNum) && v.totalNum > 0
    );
  }
  return false;
}

export interface DraftValidationParams {
  draft: QuickEntryDraft | null;
  posting: boolean;
  hasCash: boolean;
  insufficientCash: boolean;
  isFuture: boolean;
  tooOld: boolean;
  productId: string;
  qty: number;
  price: number;
  totalNum: number;
  incomeAccountId: string;
  incomeCount: number;
  expenseAccountId: string;
  expenseCount: number;
  ambiguousChoice: AmbiguousChoice;
  insufficient: boolean;
  equityDepositId: string;
  equityWithdrawalId: string;
}

export function isDraftValid(p: DraftValidationParams): boolean {
  if (p.draft === null || p.posting) return false;
  if (!p.hasCash || p.insufficientCash || p.isFuture || p.tooOld) return false;
  const kind = p.draft.kind;
  if (kind === "sale" || kind === "purchase") {
    return isGoodsDraftValid({
      productId: p.productId,
      qty: p.qty,
      price: p.price,
      totalNum: p.totalNum,
      incomeReady: kind === "purchase" || p.incomeAccountId !== "" || p.incomeCount > 0,
      isSale: kind === "sale",
      insufficient: p.insufficient,
    });
  }
  if (kind === "stock_loss") {
    return p.productId !== "" && Number.isFinite(p.qty) && p.qty > 0 && !p.insufficient;
  }
  if (kind === "expense") {
    return (
      Number.isInteger(p.totalNum) && p.totalNum > 0 &&
      (p.expenseAccountId !== "" || p.expenseCount > 0)
    );
  }
  if (kind === "ambiguous_buy") {
    return isAmbiguousDraftValid(p.ambiguousChoice, {
      productId: p.productId,
      qty: p.qty,
      price: p.price,
      totalNum: p.totalNum,
      expenseReady: p.expenseAccountId !== "" || p.expenseCount > 0,
    });
  }
  if (kind === "deposit") {
    return Number.isInteger(p.totalNum) && p.totalNum > 0 && p.equityDepositId !== "";
  }
  if (kind === "withdrawal") {
    return Number.isInteger(p.totalNum) && p.totalNum > 0 && p.equityWithdrawalId !== "";
  }
  return Number.isInteger(p.totalNum) && p.totalNum > 0;
}

export interface NewProductValidation {
  name: string;
  unit: string;
  quantity: string;
  total: number | undefined;
  hasCash: boolean;
  cashBalance: number | null;
  isFuture: boolean;
  tooOld: boolean;
  creating: boolean;
  isOnline: boolean;
}

/** Seluruh syarat tombol "Buat & catat" dalam satu predikat teruji. */
export function isNewProductSubmittable(v: NewProductValidation): boolean {
  const nameLen = v.name.trim().length;
  if (nameLen < 1 || nameLen > 80) return false;
  const unitLen = v.unit.trim().length;
  if (unitLen < 1 || unitLen > 20) return false;
  const qty = Number(v.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (v.total === undefined || !Number.isInteger(v.total) || v.total <= 0) return false;
  if (!v.hasCash) return false;
  if (v.cashBalance !== null && v.total > v.cashBalance) return false;
  if (v.isFuture || v.tooOld) return false;
  if (v.creating || !v.isOnline) return false;
  return true;
}

/** WAC beku produk lokal (null bila tak ada) untuk movement jual/susut. */
export function readFrozenWacMinor(db: Database | null, productId: string): number | null {
  if (!db) return null;
  const product = getProductById(db, productId);
  if (!product || product.average_cost_minor <= 0) return null;
  return product.average_cost_minor;
}

// ── Penyiapan posting (modul murni) ──────────────────────────────

export type PostTransactionType =
  | "cash_in" | "cash_out" | "transfer" | "owner_deposit" | "owner_withdrawal" | "purchase";

export interface PostSpecInput {
  transactionType: PostTransactionType;
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
}

export interface PreparedPost {
  input: PostSpecInput;
  description: string;
  postedTotal: number;
}

export interface SelectedProductLike {
  unit: string;
  name: string;
}

/** Satuan presisi + milli dari nominal ketikan (total tercatat persis). */
export function preciseUnitParts(qty: number, totalNum: number): {
  quantityMilli: number;
  preciseMinor: number;
  preciseUnit: number;
} {
  const quantityMilli = Math.round(qty * 1000);
  const preciseMinor = Math.round((totalNum * 10_000) / qty);
  return { quantityMilli, preciseMinor, preciseUnit: preciseMinor / 10_000 };
}

export interface GoodsPostContext {
  qty: number;
  totalNum: number;
  productId: string;
  selectedUnit: string;
  selectedName: string;
  partyText: string;
  db: Database | null;
  userId: string | undefined;
  cashAccountId: string;
  incomeAccountId: string;
  saleWacMinor: number | null;
}

export function prepareGoodsPost(kind: "sale" | "purchase", ctx: GoodsPostContext): PreparedPost {
  const isSale = kind === "sale";
  const { quantityMilli, preciseMinor, preciseUnit } = preciseUnitParts(ctx.qty, ctx.totalNum);
  const verb = isSale ? "Jual" : "Beli";
  let partySuffix = "";
  if (ctx.partyText) {
    partySuffix = isSale ? ` ke ${ctx.partyText}` : ` dari ${ctx.partyText}`;
  }
  const description = `${verb} ${ctx.qty} ${ctx.selectedUnit} ${ctx.selectedName}${partySuffix} (via cepat)`;
  const partyType = isSale ? "customer" : "supplier";
  const partyId = ctx.partyText ? resolvePartyId(ctx.db, ctx.userId, ctx.partyText, partyType) : null;
  if (isSale) {
    return {
      input: {
        transactionType: "cash_in",
        description,
        cashAccountId: ctx.cashAccountId,
        counterAccountId: ctx.incomeAccountId,
        amountIdr: ctx.totalNum,
        partyId,
        productId: ctx.productId,
        quantityMilli,
        unitCostMinor: ctx.saleWacMinor ?? preciseMinor,
        items: [{ productId: ctx.productId, quantity: ctx.qty, unitPriceIdr: preciseUnit }],
      },
      description,
      postedTotal: ctx.totalNum,
    };
  }
  return {
    input: {
      transactionType: "purchase",
      description,
      cashAccountId: ctx.cashAccountId,
      amountIdr: ctx.totalNum,
      partyId,
      productId: ctx.productId,
      quantityMilli,
      unitCostMinor: preciseMinor,
      items: [{ productId: ctx.productId, quantity: ctx.qty, unitCostIdr: preciseUnit }],
    },
    description,
    postedTotal: ctx.totalNum,
  };
}

export function prepareExpensePost(
  description: string | undefined,
  total: number,
  cashAccountId: string,
  expenseAccountId: string,
): PreparedPost {
  const resolved = `Bayar ${description ?? "beban"} (via cepat)`;
  return {
    input: {
      transactionType: "cash_out",
      description: resolved,
      cashAccountId,
      counterAccountId: expenseAccountId,
      amountIdr: total,
    },
    description: resolved,
    postedTotal: total,
  };
}

export interface LossPostContext {
  qty: number;
  productId: string;
  selectedUnit: string;
  selectedName: string;
  reason: string | undefined;
  cashAccountId: string;
  db: Database | null;
  fallbackMinor: number;
}

export function prepareLossPost(ctx: LossPostContext): PreparedPost {
  const description = `${ctx.selectedName} ${ctx.reason ?? "pecah"} ${ctx.qty} ${ctx.selectedUnit} (via cepat)`;
  // WAC dibaca dari produk lokal (sumber kebenaran); fallback harga input.
  const frozenMinor = readFrozenWacMinor(ctx.db, ctx.productId) ?? ctx.fallbackMinor;
  return {
    input: {
      transactionType: "cash_out",
      description,
      cashAccountId: ctx.cashAccountId,
      amountIdr: 1,
      productId: ctx.productId,
      quantityMilli: Math.round(ctx.qty * 1000),
      unitCostMinor: frozenMinor,
      stockLoss: true,
    },
    description,
    postedTotal: 0,
  };
}

export interface MoneyPostContext {
  note: string | undefined;
  totalNum: number;
  cashAccountId: string;
  targetCashId: string;
  equityDepositId: string;
  equityWithdrawalId: string;
}

export function prepareMoneyPost(
  kind: "transfer" | "deposit" | "withdrawal",
  ctx: MoneyPostContext,
): PreparedPost | null {
  if (kind === "transfer") {
    const amount = formatIDR(ctx.totalNum);
    const description = ctx.note ? `Transfer ${ctx.note} ${amount} (via cepat)` : `Transfer ${amount} (via cepat)`;
    return {
      input: {
        transactionType: "transfer",
        description,
        cashAccountId: ctx.cashAccountId,
        counterAccountId: ctx.targetCashId,
        amountIdr: ctx.totalNum,
      },
      description,
      postedTotal: ctx.totalNum,
    };
  }
  if (kind === "deposit") {
    if (!ctx.equityDepositId) return null;
    const amount = formatIDR(ctx.totalNum);
    const description = ctx.note ? `Setor ${ctx.note} ${amount} (via cepat)` : `Setor modal ${amount} (via cepat)`;
    return {
      input: {
        transactionType: "owner_deposit",
        description,
        cashAccountId: ctx.cashAccountId,
        counterAccountId: ctx.equityDepositId,
        amountIdr: ctx.totalNum,
      },
      description,
      postedTotal: ctx.totalNum,
    };
  }
  if (!ctx.equityWithdrawalId) return null;
  const amount = formatIDR(ctx.totalNum);
  const description = ctx.note ? `Ambil ${ctx.note} ${amount} (via cepat)` : `Ambil prive ${amount} (via cepat)`;
  return {
    input: {
      transactionType: "owner_withdrawal",
      description,
      cashAccountId: ctx.cashAccountId,
      counterAccountId: ctx.equityWithdrawalId,
      amountIdr: ctx.totalNum,
    },
    description,
    postedTotal: ctx.totalNum,
  };
}

export interface PreparePostContext {
  qty: number;
  totalNum: number;
  price: number;
  productId: string;
  selected: SelectedProductLike | null;
  partyName: string;
  draftPartyQuery?: string;
  userId: string | undefined;
  db: Database | null;
  cashAccountId: string;
  incomeAccountId: string;
  expenseAccountId: string;
  equityDepositId: string;
  equityWithdrawalId: string;
  ambiguousChoice: AmbiguousChoice;
  targetCashId: string;
  draftDescription?: string;
  draftReason?: string;
}

/** Susun input posting dari draf + state pratinjau (null = tak bisa posting). */
export function preparePost(kind: QuickEntryDraft["kind"], a: PreparePostContext): PreparedPost | null {
  switch (kind) {
    case "sale":
    case "purchase": {
      if (!a.selected) return null;
      const partyText = a.partyName.trim() || a.draftPartyQuery?.trim() || "";
      return prepareGoodsPost(kind, {
        qty: a.qty,
        totalNum: a.totalNum,
        productId: a.productId,
        selectedUnit: a.selected.unit,
        selectedName: a.selected.name,
        partyText,
        db: a.db,
        userId: a.userId,
        cashAccountId: a.cashAccountId,
        incomeAccountId: a.incomeAccountId,
        saleWacMinor: kind === "sale" ? readFrozenWacMinor(a.db, a.productId) : null,
      });
    }
    case "expense":
      return prepareExpensePost(a.draftDescription, a.totalNum, a.cashAccountId, a.expenseAccountId);
    case "ambiguous_buy": {
      if (a.ambiguousChoice === "expense") {
        return prepareExpensePost(a.draftDescription, a.totalNum, a.cashAccountId, a.expenseAccountId);
      }
      if (!a.selected) return null;
      return prepareGoodsPost("purchase", {
        qty: a.qty,
        totalNum: a.totalNum,
        productId: a.productId,
        selectedUnit: a.selected.unit,
        selectedName: a.selected.name,
        partyText: a.partyName.trim(),
        db: a.db,
        userId: a.userId,
        cashAccountId: a.cashAccountId,
        incomeAccountId: a.incomeAccountId,
        saleWacMinor: null,
      });
    }
    case "stock_loss": {
      if (!a.selected) return null;
      return prepareLossPost({
        qty: a.qty,
        productId: a.productId,
        selectedUnit: a.selected.unit,
        selectedName: a.selected.name,
        reason: a.draftReason,
        cashAccountId: a.cashAccountId,
        db: a.db,
        fallbackMinor: Math.round(a.price * 10_000),
      });
    }
    case "transfer":
    case "deposit":
    case "withdrawal":
      return prepareMoneyPost(kind, {
        note: a.draftDescription,
        totalNum: a.totalNum,
        cashAccountId: a.cashAccountId,
        targetCashId: a.targetCashId,
        equityDepositId: a.equityDepositId,
        equityWithdrawalId: a.equityWithdrawalId,
      });
    default:
      return null;
  }
}

/** Pihak: cocok persis (case-insensitive) atau buat baru. */
export function resolvePartyId(
  db: Database | null,
  userId: string | undefined,
  name: string,
  type: "customer" | "supplier",
): string | null {
  if (!db || !userId || !name.trim()) return null;
  const needle = name.trim().toLowerCase();
  const existing = getAllParties(db, userId).find((p) => p.name.toLowerCase() === needle);
  if (existing) return existing.id;
  return createPartyLocal(db, userId, { name: name.trim(), partyType: type }).id;
}

/** Produk yang namanya persis sama (untuk pilihan ambigu-Stok). */
export function findExactProduct(
  catalog: ProductLite[],
  description: string,
): ProductLite | undefined {
  const needle = description.trim().toLowerCase();
  if (!needle) return undefined;
  return catalog.find((p) => p.name.toLowerCase() === needle);
}

export interface AmountState {
  quantity: string;
  unitPrice: string;
  total: string;
}

/** Satuan presisi diturunkan dari total ÷ jumlah (maks 4 desimal, tanpa pembulatan rupiah). */
export function deriveUnit(qn: number, tn: number): string {
  return String(Number((tn / qn).toFixed(4)));
}

/** Hitung ulang pasangan qty/total; satuan selalu diturunkan dari total. */
export function computeAmountUpdate(
  field: AmountField,
  value: string,
  state: AmountState,
): AmountState {
  const nextQty = field === "quantity" ? value : state.quantity;
  const nextPrice = field === "unitPrice" ? value : state.unitPrice;
  const nextTotal = field === "total" ? value : state.total;
  const qn = Number(nextQty);
  const pn = Number(nextPrice);
  const tn = Number(nextTotal);
  if (field !== "total" && Number.isFinite(qn) && qn > 0 && Number.isFinite(pn) && pn > 0) {
    return { quantity: nextQty, unitPrice: nextPrice, total: String(Math.round(qn * pn)) };
  }
  if (Number.isFinite(qn) && qn > 0 && Number.isInteger(tn) && tn > 0) {
    return { quantity: nextQty, unitPrice: deriveUnit(qn, tn), total: nextTotal };
  }
  return { quantity: nextQty, unitPrice: nextPrice, total: nextTotal };
}

/** Total pratinjau sebagai string (nominal atau jumlah). */
export function formatTotalInput(seed: QuickEntryDraft): string {
  if (seed.totalIdr !== undefined) return String(seed.totalIdr);
  if (seed.amountIdr !== undefined) return String(seed.amountIdr);
  return "";
}

export function computeSuggestions(
  text: string,
  draft: QuickEntryDraft | null,
  catalog: ProductLite[],
): { id: string; name: string }[] {
  if (!text.trim() || draft) return [];
  const probe = parseQuickEntryText(text);
  if (!probe.ok) return [];
  if (probe.kind !== "sale" && probe.kind !== "purchase" && probe.kind !== "stock_loss") return [];
  return matchProducts(probe.productQuery, catalog, "purchase").slice(0, 4);
}

export interface NewProductSeed {
  name: string;
  unit: string;
  quantity: string;
  total: number;
  party?: string;
}

export type SendAction =
  | { type: "parseError"; message: string }
  | { type: "draftError"; message: string }
  | { type: "draft"; draft: QuickEntryDraft; partyName: string | null }
  | { type: "newProduct"; seed: NewProductSeed };

/** Terjemahkan teks chat menjadi aksi pratinjau (murni, tanpa state). */
export function resolveSendAction(text: string, catalog: ProductLite[]): SendAction {
  const parsed = parseQuickEntryText(text);
  if (!parsed.ok) return { type: "parseError", message: parsed.message };
  const built = buildDraft(parsed, catalog);
  if ("error" in built) {
    if (parsed.kind === "purchase") {
      return {
        type: "newProduct",
        seed: {
          name: extractOriginalText(text, parsed.productQuery),
          unit: parsed.unit ?? "",
          quantity: String(parsed.quantity),
          total: parsed.totalIdr ?? 0,
          party: extractSendPartyName(text, parsed) ?? undefined,
        },
      };
    }
    return { type: "draftError", message: built.error };
  }
  return { type: "draft", draft: built, partyName: extractSendPartyName(text, parsed) };
}

function extractSendPartyName(text: string, parsed: QuickEntryParsed): string | null {
  const query = "partyQuery" in parsed ? parsed.partyQuery : undefined;
  if (typeof query !== "string" || !query) return null;
  return normalizePartyName(extractOriginalParty(text, query));
}

export type AmbiguousResolution =
  | { type: "existing"; draft: QuickEntryDraft }
  | { type: "new"; seed: NewProductSeed }
  | null;

/** Pilihan Stok untuk beli-ambigu: produk persis → draf biasa, sisanya panel baru. */
export function resolveAmbiguousStock(
  draft: QuickEntryDraft | null,
  catalog: ProductLite[],
  text: string,
): AmbiguousResolution {
  if (draft?.kind !== "ambiguous_buy") return null;
  const description = draft.description;
  const amountIdr = draft.amountIdr;
  if (!description) return null;
  const found = findExactProduct(catalog, description);
  if (found) {
    return {
      type: "existing",
      draft: {
        kind: "purchase",
        productId: found.id,
        candidates: [{ id: found.id, name: found.name }],
        quantity: undefined,
        unit: undefined,
        unitMismatch: false,
        unitPriceIdr: undefined,
        totalIdr: amountIdr,
        warnings: [],
      },
    };
  }
  return {
    type: "new",
    seed: {
      name: extractOriginalText(text, description),
      unit: "",
      quantity: "",
      total: amountIdr ?? 0,
    },
  };
}

/** Produk ada → pakai; belum ada → buat (tahan balapan nama-kembar). */
export async function resolveOrCreateProductId(
  name: string,
  unit: string,
): Promise<{ id: string; createdNow: boolean }> {
  const fresh = await listProducts(true);
  const existing = fresh.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.is_active === 1);
  if (existing) return { id: existing.id, createdNow: false };
  try {
    const created = await createProduct({ name, unit, sellingPriceIdr: 0 });
    return { id: created.id, createdNow: true };
  } catch (err) {
    if (!isApiError(err) || err.code !== "product_name_taken") throw err;
    const retry = (await listProducts(true)).find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (!retry) throw err;
    return { id: retry.id, createdNow: false };
  }
}

/** Terapkan aksi kirim ke setter (murni kecuali efek yang di-pass). */
export function applySendAction(
  action: SendAction,
  fx: {
    showParseError: (message: string) => void;
    showDraftError: (message: string) => void;
    startDraft: (draft: QuickEntryDraft) => void;
    setPartyName: (name: string) => void;
    openNewProduct: (seed: NewProductSeed) => void;
  },
): void {
  switch (action.type) {
    case "parseError":
      fx.showParseError(action.message);
      return;
    case "draftError":
      fx.showDraftError(action.message);
      return;
    case "newProduct":
      fx.openNewProduct(action.seed);
      return;
    case "draft":
      fx.startDraft(action.draft);
      if (action.partyName) fx.setPartyName(action.partyName);
      return;
  }
}

export interface NewProductSubmission {
  name: string;
  unit: string;
  qty: number;
  total: number;
  party?: string;
  cashAccountId: string;
  txDate: string;
}

export type SubmissionOutcome =
  | { ok: true; description: string; postedTotal: number }
  | { ok: false; message: string };

/** Buat produk lalu catat pembelian; kembalikan hasil akhir yang siap tampil. */
export async function submitNewProductPurchase(
  form: NewProductSubmission,
  api: {
    resolveProduct: (name: string, unit: string) => Promise<{ id: string; createdNow: boolean }>;
    post: (input: PostSpecInput, date: string) => Promise<void>;
    resolveParty: (name: string) => string | null;
  },
): Promise<SubmissionOutcome> {
  let resolved: { id: string; createdNow: boolean };
  try {
    resolved = await api.resolveProduct(form.name.trim(), form.unit.trim());
  } catch (err) {
    return { ok: false, message: `Gagal membuat produk: ${translateError(err)}` };
  }
  const { id: productId, createdNow } = resolved;
  const quantityMilli = Math.round(form.qty * 1000);
  const preciseMinor = Math.round((form.total * 10_000) / form.qty);
  const partyId = form.party ? api.resolveParty(form.party) : null;
  const partySuffix = form.party ? ` dari ${form.party}` : "";
  const description = `Beli ${form.qty} ${form.unit.trim()} ${form.name.trim()}${partySuffix} (via cepat)`;
  try {
    await api.post(
      {
        transactionType: "purchase",
        description,
        cashAccountId: form.cashAccountId,
        amountIdr: form.total,
        partyId,
        productId,
        quantityMilli,
        unitCostMinor: preciseMinor,
        items: [{ productId, quantity: form.qty, unitCostIdr: preciseMinor / 10_000 }],
      },
      form.txDate,
    );
  } catch (err) {
    if (createdNow) {
      return {
        ok: false,
        message: `Produk '${form.name.trim()}' sudah dibuat, pembelian gagal: ${translateError(err)} Ulangi pencatatan dari chat.`,
      };
    }
    return { ok: false, message: translateError(err) };
  }
  return { ok: true, description, postedTotal: form.total };
}

export interface EffectiveIds {
  cashAccountId: string;
  incomeAccountId: string;
  expenseAccountId: string;
  equityDepositId: string;
  equityWithdrawalId: string;
  hasCash: boolean;
}

interface AccountLike {
  id: string;
  name: string;
  code?: string;
}

/** Akun efektif + flag kas dari state + hasil query (murni). */
export function resolveEffectiveIds(args: {
  cashAccountId: string;
  incomeAccountId: string;
  expenseAccountId: string;
  cash: AccountLike[] | undefined;
  income: AccountLike[] | undefined;
  expense: AccountLike[] | undefined;
  equity: AccountLike[] | undefined;
}): EffectiveIds {
  return {
    cashAccountId: args.cashAccountId !== "" ? args.cashAccountId : (args.cash?.[0]?.id ?? ""),
    incomeAccountId: args.incomeAccountId !== "" ? args.incomeAccountId : (args.income?.[0]?.id ?? ""),
    expenseAccountId: args.expenseAccountId !== "" ? args.expenseAccountId : (args.expense?.[0]?.id ?? ""),
    equityDepositId: args.equity?.find((a) => a.code === "3110")?.id ?? "",
    equityWithdrawalId: args.equity?.find((a) => a.code === "3120")?.id ?? "",
    hasCash: args.cashAccountId !== "" || (args.cash?.length ?? 0) > 0,
  };
}

export interface PreviewGuards {
  insufficient: boolean;
  insufficientCash: boolean;
  isFuture: boolean;
  tooOld: boolean;
  equityLabel: string | null;
}

/** Guard pratinjau + label ekuitas hilang (murni, tanpa state). */
export function computePreviewGuards(args: {
  draftKind: QuickEntryDraft["kind"] | undefined;
  qty: number;
  stock: number;
  cashBalance: number | null;
  outflowAmount: number | null;
  txDate: string;
  todayStr: string;
  maxDate: string | null;
  equityDepositId: string;
  equityWithdrawalId: string;
}): PreviewGuards {
  const stockShort =
    (args.draftKind === "sale" || args.draftKind === "stock_loss") &&
    Number.isFinite(args.qty) &&
    args.qty > args.stock;
  const cashShort =
    args.outflowAmount !== null && args.cashBalance !== null && args.cashBalance < args.outflowAmount;
  return {
    insufficient: stockShort,
    insufficientCash: cashShort,
    isFuture: args.txDate > args.todayStr,
    tooOld: args.maxDate !== null && args.txDate < args.maxDate,
    equityLabel: missingEquityLabel(args.draftKind, args.equityDepositId, args.equityWithdrawalId),
  };
}

function missingEquityLabel(
  kind: QuickEntryDraft["kind"] | undefined,
  equityDepositId: string,
  equityWithdrawalId: string,
): string | null {
  if (kind === "deposit" && equityDepositId === "") return "Modal Pemilik (3110)";
  if (kind === "withdrawal" && equityWithdrawalId === "") return "Pengambilan Pemilik (3120)";
  return null;
}

/** Pratinjau tampil bila ada draf (barang butuh produk terpilih). */
export function shouldShowPreview(draft: QuickEntryDraft | null, hasProduct: boolean): boolean {
  if (!draft) return false;
  if (draft.kind === "sale" || draft.kind === "purchase" || draft.kind === "stock_loss") {
    return hasProduct;
  }
  return true;
}

/** Error jaringan/server yang aman diperlakukan optimis (outbox menyusul). */
export function isBenignSyncError(err: unknown, hasLocalDb: boolean): boolean {
  if (!hasLocalDb) return false;
  return !isApiError(err) || err.status >= 500 || err.status === 408 || err.status === 429;
}

/** Nominal arus keluar pratinjau (null bila bukan arus keluar / belum valid). */
export function computeOutflowAmount(
  kind: QuickEntryDraft["kind"] | undefined,
  ambiguousChoice: AmbiguousChoice,
  totalNum: number,
): number | null {
  if (kind === undefined || !Number.isInteger(totalNum) || totalNum <= 0) return null;
  if (
    kind === "purchase" ||
    kind === "expense" ||
    kind === "withdrawal" ||
    kind === "transfer"
  ) {
    return totalNum;
  }
  if (kind === "ambiguous_buy" && ambiguousChoice !== null) return totalNum;
  return null;
}

interface OptionLike {
  value: string;
  label: string;
}

interface GuideSectionProps {
  show: boolean;
  onToggle: () => void;
  onSelect: (example: string) => void;
}

function GuideSection({ show, onToggle, onSelect }: Readonly<GuideSectionProps>) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={show}
        aria-controls="quick-entry-guide"
        className="min-h-[44px] rounded-md px-1 py-1 text-left text-sm font-medium text-wood-600 underline decoration-wood-300 underline-offset-4 hover:text-wood-700"
      >
        {show ? "Sembunyikan contoh dan cara pakai" : "Lihat contoh dan cara pakai"}
      </button>
      {show && (
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
                    onClick={() => onSelect(example)}
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
  );
}

interface FeedbackSectionProps {
  parseError: string | null;
  draftError: string | null;
  suggestions: { id: string; name: string }[];
  draftKind: QuickEntryDraft["kind"] | undefined;
  catalog: ProductLite[];
  onStartDraft: (draft: QuickEntryDraft) => void;
  onClearDraftError: () => void;
  doneMessage: string | null;
  onHelpExample: (example: string) => void;
}

function FeedbackSection({ parseError, draftError, suggestions, draftKind, catalog, onStartDraft, onClearDraftError, doneMessage, onHelpExample }: Readonly<FeedbackSectionProps>) {
  const pickSuggestion = (s: { id: string; name: string }) => {
    if (draftKind !== "sale" && draftKind !== "purchase" && draftKind !== "stock_loss") return;
    const rebuilt = buildDraft(
      { ok: true, kind: "sale", productQuery: s.name, quantity: 1, unitPriceIdr: 1 },
      catalog,
    );
    if ("error" in rebuilt) return;
    onStartDraft({ ...rebuilt, productId: s.id });
    onClearDraftError();
  };
  return (
    <div aria-live="polite">
      {parseError && (
        <div className="space-y-2 rounded-lg bg-wood-100 px-3 py-2 text-sm">
          <p className="text-text-secondary">Tidak dimengerti. {parseError}</p>
          <div className="flex flex-wrap gap-2">
            {HELP_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onHelpExample(example)}
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
                    onClick={() => pickSuggestion(s)}
                  className="rounded-md border border-wood-300 px-2 py-1 text-xs text-wood-700 hover:bg-cream-100"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {doneMessage && <p className="text-sm text-text-secondary">{doneMessage}</p>}
    </div>
  );
}

interface DraftSummaryProps {
  draft: QuickEntryDraft;
  productName: string | null;
  unit: string;
  qty: number;
  price: number;
  totalNum: number;
  stock: number;
  insufficient: boolean;
  insufficientCash: boolean;
  cashBalance: number | null;
  outflowAmount: number | null;
  equityLabel: string | null;
  isFuture: boolean;
  tooOld: boolean;
  maxDate: string | null;
  txDate: string;
}

function DraftSummary({ draft, productName, unit, qty, price, totalNum, stock, insufficient, insufficientCash, cashBalance, outflowAmount, equityLabel, isFuture, tooOld, maxDate, txDate }: Readonly<DraftSummaryProps>) {
  return (
    <>
      <p className="text-sm font-medium text-text-primary">
        {DRAFT_LABEL[draft.kind] ?? draft.kind}
        {productName && (draft.kind === "sale" || draft.kind === "purchase") && (
          <> {productName} ×{formatQuantity(qty)} @
          {formatDecimalIDR(Number.isFinite(price) ? price : 0)} = {formatIDR(Number.isInteger(totalNum) ? totalNum : 0)}</>
        )}
        {productName && draft.kind === "stock_loss" && (
          <> {productName} ×{formatQuantity(qty)} {unit} ({draft.reason})</>
        )}
        {(draft.kind === "expense" || draft.kind === "transfer" || draft.kind === "deposit" || draft.kind === "withdrawal") && (
          <> {formatIDR(Number.isInteger(totalNum) ? totalNum : 0)}{draft.description ? ` · ${draft.description}` : ""}</>
        )}
        {draft.kind === "sale" && Number.isFinite(qty) && productName && (
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
          Stok tidak cukup (tersedia {formatQuantity(stock)} {unit}).
        </p>
      )}
      {insufficientCash && cashBalance !== null && outflowAmount !== null && (
        <p className="text-sm font-medium text-error">
          Kas tidak cukup (saldo {formatIDR(cashBalance)}, butuh {formatIDR(outflowAmount)}).
        </p>
      )}
      {equityLabel && (
        <p className="text-sm font-medium text-error">
          Akun {equityLabel} tidak ditemukan. Pulihkan bagan akun di halaman Akun.
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
    </>
  );
}

interface DraftFieldsProps {
  draft: QuickEntryDraft;
  candidates: { id: string; name: string }[];
  productId: string;
  catalog: ProductLite[];
  onProductIdChange: (id: string) => void;
  quantity: string;
  unitPrice: string;
  total: string;
  onAmountChange: (field: AmountField, value: string) => void;
  onTotalChange: (value: string) => void;
  partyName: string;
  onPartyChange: (value: string) => void;
  cashOptions: OptionLike[];
  cashValue: string;
  onCashChange: (value: string) => void;
  incomeOptions: OptionLike[];
  incomeValue: string;
  onIncomeChange: (value: string) => void;
  expenseOptions: OptionLike[];
  expenseAccountId: string;
  onExpenseChange: (value: string) => void;
  ambiguousChoice: AmbiguousChoice;
  onAmbiguousStock: () => void;
  onAmbiguousExpense: () => void;
  txDate: string;
  todayStr: string;
  onTxDateChange: (value: string) => void;
}

function DraftFields({ draft, candidates, catalog, productId, onProductIdChange, quantity, unitPrice, total, onAmountChange, onTotalChange, partyName, onPartyChange, cashOptions, cashValue, onCashChange, incomeOptions, incomeValue, onIncomeChange, expenseOptions, expenseAccountId, onExpenseChange, ambiguousChoice, onAmbiguousStock, onAmbiguousExpense, txDate, todayStr, onTxDateChange }: Readonly<DraftFieldsProps>) {
  return (
    <>
      {draft.kind === "ambiguous_buy" && (
        <fieldset className="m-0 flex gap-2 border-0 p-0">
          <legend className="sr-only">Jenis pembelian</legend>
          <Button
            variant={ambiguousChoice === "purchase" ? "primary" : "secondary"}
            onClick={onAmbiguousStock}
          >
            Stok
          </Button>
          <Button
            variant={ambiguousChoice === "expense" ? "primary" : "secondary"}
            onClick={onAmbiguousExpense}
          >
            Beban
          </Button>
        </fieldset>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label="Tanggal"
          type="date"
          value={txDate}
          max={todayStr}
          onChange={(e) => onTxDateChange(e.target.value)}
        />
        {(draft.kind === "sale" || draft.kind === "purchase" || draft.kind === "stock_loss") && (
          <Select
            label="Produk"
            value={productId}
            onChange={(e) => {
              const next = catalog.find((p) => p.id === e.target.value);
              if (!next) return;
              onProductIdChange(next.id);
            }}
            options={candidates.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        {(draft.kind === "sale" || draft.kind === "purchase" || draft.kind === "stock_loss") && (
          <Input label="Jumlah" inputMode="decimal" value={quantity} onChange={(e) => onAmountChange("quantity", e.target.value)} />
        )}
        {(draft.kind === "sale" || draft.kind === "purchase") && (
          <>
            <Input label="Harga satuan (Rp)" value={unitPrice} readOnly helperText="Otomatis: total ÷ jumlah" />
            <Input label="Total (Rp)" inputMode="numeric" value={total} onChange={(e) => onAmountChange("total", e.target.value)} />
          </>
        )}
        {(draft.kind === "expense" || draft.kind === "transfer" || draft.kind === "deposit" || draft.kind === "withdrawal" || (draft.kind === "ambiguous_buy" && ambiguousChoice === "expense")) && (
          <Input label="Nominal (Rp)" inputMode="numeric" value={total} onChange={(e) => onTotalChange(e.target.value)} />
        )}
        {(draft.kind === "sale" || draft.kind === "purchase") && (
          <Input label={draft.kind === "sale" ? "Pelanggan (ke)" : "Supplier (dari)"} value={partyName} onChange={(e) => onPartyChange(e.target.value)} placeholder={draft.kind === "sale" ? "cth: Nadia" : "cth: Vitantri"} />
        )}
        <Select
          label="Kas"
          value={cashValue}
          onChange={(e) => onCashChange(e.target.value)}
          options={[
            { value: "", label: "Pilih kas" },
            ...cashOptions,
          ]}
        />
        {draft.kind === "sale" && (
          <Select
            label="Akun pendapatan"
            value={incomeValue}
            onChange={(e) => onIncomeChange(e.target.value)}
            options={[
              { value: "", label: "Pilih pendapatan" },
              ...incomeOptions,
            ]}
          />
        )}
                {draft.kind === "expense" && (
                  <Select
                    label="Kategori beban"
                    value={expenseAccountId !== "" ? expenseAccountId : (expenseOptions[0]?.value ?? "")}
                    onChange={(e) => onExpenseChange(e.target.value)}
            options={[
              { value: "", label: "Pilih beban" },
              ...expenseOptions,
            ]}
          />
        )}
      </div>
    </>
  );
}

interface DraftActionsProps {
  draftKind: string;
  valid: boolean;
  posting: boolean;
  onConfirm: () => void;
}

function DraftActions({ draftKind, valid, posting, onConfirm }: Readonly<DraftActionsProps>) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={draftKind === "sale" ? "success" : "info"} size="sm">
        {draftKind === "sale" ? "Penjualan" : "Pembelian"}
      </Badge>
      <div className="flex-1" />
      <Button onClick={onConfirm} disabled={!valid} loading={posting}>
        Catat
      </Button>
    </div>
  );
}

interface NewProductPanelProps {
  form: { name: string; unit: string; quantity: string; total: number; party?: string };
  txDate: string;
  todayStr: string;
  cashOptions: OptionLike[];
  cashValue: string;
  onUnitChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onTxDateChange: (value: string) => void;
  onCashChange: (value: string) => void;
  cashBalance: number | null;
  isFuture: boolean;
  tooOld: boolean;
  maxDate: string | null;
  isOnline: boolean;
  error: string | null;
  creating: boolean;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function NewProductPanel({ form, txDate, todayStr, cashOptions, cashValue, onUnitChange, onQuantityChange, onTxDateChange, onCashChange, cashBalance, isFuture, tooOld, maxDate, isOnline, error, creating, canSubmit, onCancel, onSubmit }: Readonly<NewProductPanelProps>) {
  const cashShort = cashBalance !== null && form.total > cashBalance;
  return (
    <div className="space-y-3 rounded-lg border border-wood-200 px-3 py-3">
      <p className="text-sm font-medium text-text-primary">
        Produk baru: {form.name}
      </p>
      <p className="text-xs text-text-tertiary">
        Produk &apos;{form.name}&apos; akan dibuat
        (satuan di bawah, harga jual Rp0 — margin disembunyikan sampai diisi).
        Pembelian {formatIDR(form.total)} akan dicatat: kas berkurang, stok bertambah.
        {form.party ? ` Supplier: ${form.party}.` : ""}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label="Satuan"
          value={form.unit}
          onChange={(e) => onUnitChange(e.target.value)}
          placeholder="cth: pcs"
          helperText="Wajib diisi"
        />
        <Input
          label="Jumlah"
          inputMode="decimal"
          value={form.quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
        />
        <Input label="Total (Rp)" value={formatIDR(form.total)} readOnly />
        <Input
          label="Tanggal"
          type="date"
          value={txDate}
          max={todayStr}
          onChange={(e) => onTxDateChange(e.target.value)}
        />
        <Select
          label="Kas"
          value={cashValue}
          onChange={(e) => onCashChange(e.target.value)}
          options={[
            { value: "", label: "Pilih kas" },
            ...cashOptions,
          ]}
        />
      </div>
      {cashShort && cashBalance !== null && (
        <p className="text-sm font-medium text-error">
          Kas tidak cukup (saldo {formatIDR(cashBalance)}, butuh {formatIDR(form.total)}).
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
      {error && (
        <p className="text-sm font-medium text-error">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <Button variant="secondary" onClick={onCancel}>
          Batal
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit} loading={creating}>
          Buat &amp; catat
        </Button>
      </div>
    </div>
  );
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
  const [ambiguousChoice, setAmbiguousChoice] = useState<AmbiguousChoice>(null);
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
    setTotal(formatTotalInput(seed));
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
    applySendAction(resolveSendAction(text, catalog), {
      showParseError: (message) => {
        setParseError(message);
        setDraft(null);
        setDraftError(null);
      },
      showDraftError: (message) => {
        setDraft(null);
        setDraftError(message);
      },
      startDraft,
      setPartyName,
      openNewProduct,
    });
  };

  const qty = Number(quantity);
  const price = Number(unitPrice);
  const totalNum = Number(total);
  const stock = selectedProduct?.current_stock ?? 0;
  const ids = resolveEffectiveIds({
    cashAccountId,
    incomeAccountId,
    expenseAccountId,
    cash: cashQuery.data,
    income: incomeQuery.data,
    expense: expenseQuery.data,
    equity: equityQuery.data,
  });
  const effectiveCashId = ids.cashAccountId;
  const effectiveIncomeId = ids.incomeAccountId;
  const effectiveExpenseId = ids.expenseAccountId;
  const equityDepositId = ids.equityDepositId;
  const equityWithdrawalId = ids.equityWithdrawalId;
  const hasCash = ids.hasCash;
  // Kecukupan kas sumber untuk arus keluar. Saldo unknown (offline/query gagal)
  // berarti tidak diblokir — local-first tetap bisa mencatat tanpa koneksi.
  const cashBalance = cashQuery.data?.find((a) => a.id === effectiveCashId)?.balance_idr ?? null;
  const outflowAmount = computeOutflowAmount(draft?.kind, ambiguousChoice, totalNum);
  // Append-only kronologis: tanggal mundur hanya boleh bila belum ada catatan
  // yang lebih baru. maxDate null = belum ada catatan / unknown (offline) → bebas.
  const todayStr = formatDateInputValue();
  const guards = computePreviewGuards({
    draftKind: draft?.kind,
    qty,
    stock,
    cashBalance,
    outflowAmount,
    txDate,
    todayStr,
    maxDate,
    equityDepositId,
    equityWithdrawalId,
  });
  const insufficient = guards.insufficient;
  const insufficientCash = guards.insufficientCash;
  const isFuture = guards.isFuture;
  const tooOld = guards.tooOld;
  const valid = isDraftValid({
    draft,
    posting,
    hasCash,
    insufficientCash,
    isFuture,
    tooOld,
    productId,
    qty,
    price,
    totalNum,
    incomeAccountId,
    incomeCount: incomeQuery.data?.length ?? 0,
    expenseAccountId,
    expenseCount: expenseQuery.data?.length ?? 0,
    ambiguousChoice,
    insufficient,
    equityDepositId,
    equityWithdrawalId,
  });

  /** Satu handler untuk qty/total: field yang diubah menghitung ulang pasangannya.
   *  Satuan selalu diturunkan (read-only di pratinjau) — nominal ketikanlah yang tercatat. */
  const handleAmountChange = (field: AmountField, value: string) => {
    const updated = computeAmountUpdate(field, value, { quantity, unitPrice, total });
    applyAmounts(updated.quantity, updated.unitPrice, updated.total);
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
  const handleConfirm = async () => {
    if (!valid || !draft || !userId) return;
    setPosting(true);
    try {
      let description = "";
      let postedTotal = totalNum;
      const targetCashId = cashQuery.data?.find((a) => a.id !== effectiveCashId)?.id ?? effectiveCashId;
      const prepared = preparePost(draft.kind, {
        qty,
        totalNum,
        price,
        productId,
        selected: selectedProduct ? { unit: selectedProduct.unit, name: selectedProduct.name } : null,
        partyName,
        draftPartyQuery: draft.partyQuery,
        userId,
        db: localDb,
        cashAccountId: effectiveCashId,
        incomeAccountId: effectiveIncomeId,
        expenseAccountId: effectiveExpenseId,
        equityDepositId,
        equityWithdrawalId,
        ambiguousChoice,
        targetCashId,
        draftDescription: draft.description,
        draftReason: draft.reason,
      });
      if (!prepared) return;
      description = prepared.description;
      postedTotal = prepared.postedTotal;
      await postLocalThenServer(prepared.input);
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
    const resolved = resolveAmbiguousStock(draft, catalog, text);
    if (!resolved) return;
    if (resolved.type === "existing") {
      startDraft(resolved.draft);
      return;
    }
    openNewProduct(resolved.seed);
  };

  const canCreateProduct = isNewProductSubmittable({
    name: newProduct?.name ?? "",
    unit: newProduct?.unit ?? "",
    quantity: newProduct?.quantity ?? "",
    total: newProduct?.total,
    hasCash,
    cashBalance,
    isFuture,
    tooOld,
    creating: creatingProduct,
    isOnline,
  });

  const handleCreateAndPost = async () => {
    if (!newProduct || !userId || !canCreateProduct) return;
    setCreatingProduct(true);
    setNewProductError(null);
    const outcome = await submitNewProductPurchase(
      {
        name: newProduct.name,
        unit: newProduct.unit,
        qty: Number(newProduct.quantity),
        total: newProduct.total,
        party: newProduct.party,
        cashAccountId: effectiveCashId,
        txDate,
      },
      {
        resolveProduct: resolveOrCreateProductId,
        post: postLocalThenServer,
        resolveParty: (name) => resolvePartyId(localDb, userId, name, "supplier"),
      },
    );
    setCreatingProduct(false);
    if (!outcome.ok) {
      setNewProductError(outcome.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.products.allProducts() });
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.allDashboard() });
    queryClient.invalidateQueries({ queryKey: ["max-transaction-date"] });
    toast.success("Produk dibuat dan pembelian tercatat.");
    setDoneMessage(`Transaksi tercatat: ${outcome.description} = ${formatIDR(outcome.postedTotal)}.`);
    setText("");
    setNewProduct(null);
    setParseError(null);
    setDraftError(null);
  };

  const suggestions = useMemo(
    () => computeSuggestions(text, draft, catalog),
    [text, catalog, draft],
  );

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

        <GuideSection
          show={showGuide}
          onToggle={() => setShowGuide((v) => !v)}
          onSelect={(example) => {
            setText(example);
            setShowGuide(false);
            inputRef.current?.focus();
          }}
        />

        <FeedbackSection
          parseError={parseError}
          draftError={draftError}
          suggestions={suggestions}
          draftKind={draft?.kind}
          catalog={catalog}
          onStartDraft={startDraft}
          onClearDraftError={() => setDraftError(null)}
          doneMessage={null}
          onHelpExample={(example) => setText(example)}
        />

          {shouldShowPreview(draft, selectedProduct !== undefined) && draft && (
            <div className="space-y-3 rounded-lg border border-wood-200 px-3 py-3">
              <DraftSummary
                draft={draft}
                productName={selectedProduct?.name ?? null}
                unit={selectedProduct?.unit ?? ""}
                qty={qty}
                price={price}
                totalNum={totalNum}
                stock={stock}
                insufficient={insufficient}
                insufficientCash={insufficientCash}
                cashBalance={cashBalance}
                outflowAmount={outflowAmount}
                equityLabel={guards.equityLabel}
                isFuture={isFuture}
                tooOld={tooOld}
                maxDate={maxDate}
                txDate={txDate}
              />
              <DraftFields
                draft={draft}
                candidates={draft.candidates ?? []}
                productId={productId}
                catalog={catalog}
                onProductIdChange={(id) => setProductId(id)}
                quantity={quantity}
                unitPrice={unitPrice}
                total={total}
                onAmountChange={(field, value) => handleAmountChange(field, value)}
                onTotalChange={(value) => setTotal(value)}
                partyName={partyName}
                onPartyChange={(value) => setPartyName(value)}
                cashOptions={(cashQuery.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
                cashValue={effectiveCashId}
                onCashChange={(value) => setCashAccountId(value)}
                incomeOptions={(incomeQuery.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
                incomeValue={effectiveIncomeId}
                onIncomeChange={(value) => setIncomeAccountId(value)}
                expenseOptions={(expenseQuery.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
                expenseAccountId={expenseAccountId}
                onExpenseChange={(value) => setExpenseAccountId(value)}
                ambiguousChoice={ambiguousChoice}
                onAmbiguousStock={() => chooseAmbiguousStock()}
                onAmbiguousExpense={() => setAmbiguousChoice("expense")}
                txDate={txDate}
                todayStr={todayStr}
                onTxDateChange={(value) => setTxDate(value)}
              />
              <DraftActions
                draftKind={draft.kind}
                valid={valid}
                posting={posting}
                onConfirm={() => handleConfirm()}
              />
            </div>
          )}

          {newProduct && (
            <NewProductPanel
              form={newProduct}
              txDate={txDate}
              todayStr={todayStr}
              cashOptions={(cashQuery.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              cashValue={effectiveCashId}
              onUnitChange={(value) => setNewProduct({ ...newProduct, unit: value })}
              onQuantityChange={(value) => setNewProduct({ ...newProduct, quantity: value })}
              onTxDateChange={(value) => setTxDate(value)}
              onCashChange={(value) => setCashAccountId(value)}
              cashBalance={cashBalance}
              isFuture={isFuture}
              tooOld={tooOld}
              maxDate={maxDate}
              isOnline={isOnline}
              error={newProductError}
              creating={creatingProduct}
              canSubmit={canCreateProduct}
              onCancel={() => { setNewProduct(null); setNewProductError(null); }}
              onSubmit={() => handleCreateAndPost()}
            />
          )}

          {doneMessage && <p className="text-sm text-text-secondary">{doneMessage}</p>}
      </CardContent>
    </Card>
  );
}
