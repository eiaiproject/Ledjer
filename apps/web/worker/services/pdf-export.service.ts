import {
  PDFDocument,
  StandardFonts,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PublicOrganization } from "./organization.service";
import {
  getBalanceSheet,
  getGeneralLedger,
  getProfitLoss,
  getTrialBalance,
  type BalanceSheetRow,
  type GeneralLedgerRow,
  type ProfitLossRow,
} from "./reports.service";

export interface PdfExportResponse {
  pdf: Uint8Array;
  filename: string;
}

/** A4 page size in PDF points (1 pt = 1/72 inch). */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const MARGIN_BOTTOM = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 16;

/** Safety cap for report rows rendered into a PDF (keeps CPU/memory bounded). */
const MAX_PDF_ROWS = 2_000;

const INK = rgb(0.2, 0.17, 0.14);
const MUTED = rgb(0.47, 0.44, 0.4);
const LINE = rgb(0.78, 0.75, 0.7);
const BAND = rgb(0.94, 0.92, 0.89);

export function pdfHeaders(filename: string): Headers {
  return new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${safeFilename(filename)}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

function safeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, "_");
}

function filenameFor(prefix: string, date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix}_${yyyy}${mm}${dd}.pdf`;
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTimeLong(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function truncateText(
  font: PDFFont,
  size: number,
  text: string,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (
    truncated.length > 1
    && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

interface PdfHeader {
  organizationName: string;
  title: string;
  subtitle: string;
}

interface Cell {
  text: string;
  width: number;
  align?: "left" | "right";
  font?: PDFFont;
  color?: Color;
  size?: number;
}

interface Column {
  label: string;
  width: number;
  align?: "left" | "right";
}

/**
 * Minimal paginated PDF writer used by the report exporters.
 * Draws a repeatable header block (org name, title, period) on every page,
 * a page footer, and rows with automatic page breaks.
 */
class PdfBuilder {
  private readonly header: PdfHeader;
  private doc!: PDFDocument;
  private font!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y!: number;
  private pageNo = 1;

  private constructor(header: PdfHeader) {
    this.header = header;
  }

  static async create(header: PdfHeader): Promise<PdfBuilder> {
    const builder = new PdfBuilder(header);
    builder.doc = await PDFDocument.create();
    builder.font = await builder.doc.embedFont(StandardFonts.Helvetica);
    builder.bold = await builder.doc.embedFont(StandardFonts.HelveticaBold);
    builder.page = builder.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    builder.drawHeader();
    return builder;
  }

  // ── Header / footer ───────────────────────────────────────────────

  private drawHeader(): void {
    const top = PAGE_HEIGHT - MARGIN;
    this.drawText(this.header.organizationName, {
      size: 14,
      font: this.bold,
      x: MARGIN,
      y: top,
    });
    this.drawText(this.header.title, {
      size: 12,
      font: this.bold,
      x: MARGIN,
      y: top - 20,
    });
    this.drawText(this.header.subtitle, {
      size: 10,
      color: MUTED,
      x: MARGIN,
      y: top - 36,
    });
    this.drawText(`Dokumen dihasilkan Ledjer • ${formatDateTimeLong(new Date())}`, {
      size: 8,
      color: MUTED,
      x: MARGIN,
      y: top - 50,
    });
    this.page.drawLine({
      start: { x: MARGIN, y: top - 58 },
      end: { x: PAGE_WIDTH - MARGIN, y: top - 58 },
      thickness: 0.8,
      color: LINE,
    });
    this.y = top - 58 - 14;
  }

  private drawPageFooter(): void {
    const label = `Halaman ${this.pageNo}`;
    const width = this.font.widthOfTextAtSize(label, 8);
    this.page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - width,
      y: 28,
      size: 8,
      font: this.font,
      color: MUTED,
    });
  }

  // ── Primitives ────────────────────────────────────────────────────

  private drawText(
    text: string,
    opts: {
      size: number;
      font?: PDFFont;
      color?: Color;
      x: number;
      y: number;
      maxWidth?: number;
    },
  ): void {
    const font = opts.font ?? this.font;
    const label = opts.maxWidth
      ? truncateText(font, opts.size, text, opts.maxWidth)
      : text;
    this.page.drawText(label, {
      x: opts.x,
      y: opts.y,
      size: opts.size,
      font,
      color: opts.color ?? INK,
    });
  }

  ensureSpace(height: number): void {
    if (this.y - height < MARGIN_BOTTOM) {
      this.drawPageFooter();
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.pageNo += 1;
      this.drawHeader();
    }
  }

  row(cells: readonly Cell[], opts?: { height?: number; fill?: boolean }): void {
    const height = opts?.height ?? ROW_HEIGHT;
    this.ensureSpace(height);
    if (opts?.fill) {
      this.page.drawRectangle({
        x: MARGIN,
        y: this.y - height,
        width: CONTENT_WIDTH,
        height,
        color: BAND,
      });
    }
    const baseline = this.y - height + 4.5;
    let x = MARGIN;
    for (const cell of cells) {
      const font = cell.font ?? this.font;
      const size = cell.size ?? 9;
      const text = truncateText(font, size, cell.text, Math.max(cell.width - 4, 10));
      const textWidth = font.widthOfTextAtSize(text, size);
      const cellX = cell.align === "right"
        ? x + cell.width - textWidth - 2
        : x + 2;
      this.page.drawText(text, {
        x: cellX,
        y: baseline,
        size,
        font,
        color: cell.color ?? INK,
      });
      x += cell.width;
    }
    this.y -= height;
  }

  boldRow(cells: readonly Cell[], opts?: { height?: number; fill?: boolean }): void {
    this.row(cells.map((cell) => ({ ...cell, font: this.bold })), opts);
  }

  divider(): void {
    this.ensureSpace(6);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 3 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y - 3 },
      thickness: 0.5,
      color: LINE,
    });
    this.y -= 6;
  }

  sectionTitle(label: string): void {
    this.row(
      [{ text: label, width: CONTENT_WIDTH, size: 10 }],
      { height: 20, fill: true },
    );
  }

  tableHeader(columns: readonly Column[]): void {
    this.row(
      columns.map((column) => ({
        text: column.label,
        width: column.width,
        align: column.align,
        size: 8.5,
        color: MUTED,
      })),
      { height: 18 },
    );
    this.divider();
  }

  /** Small muted note drawn below the current cursor; consumes its own space. */
  note(text: string, opts?: { size?: number; color?: Color }): void {
    const gap = 12;
    this.ensureSpace(gap + 14);
    this.drawText(text, {
      size: opts?.size ?? 8.5,
      color: opts?.color ?? MUTED,
      x: MARGIN,
      y: this.y - gap,
      maxWidth: CONTENT_WIDTH,
    });
    this.y -= gap + 14;
  }

  async save(): Promise<Uint8Array> {
    this.drawPageFooter();
    return this.doc.save();
  }
}

// ── Shared column layouts ───────────────────────────────────────────

const ACCOUNT_NAME_COLUMN = {
  label: "Nama Akun",
  width: CONTENT_WIDTH - 56 - 96 - 96,
  align: "left" as const,
};

const AMOUNT_COLUMN = (label: string): Column => ({
  label,
  width: 96,
  align: "right",
});

const TRIAL_BALANCE_COLUMNS: readonly Column[] = [
  { label: "Kode", width: 56 },
  ACCOUNT_NAME_COLUMN,
  AMOUNT_COLUMN("Debit"),
  AMOUNT_COLUMN("Kredit"),
];

const SECTION_REPORT_COLUMNS: readonly Column[] = [
  { label: "Nama Akun", width: CONTENT_WIDTH - 110, align: "left" },
  { label: "Jumlah", width: 110, align: "right" },
];

const GENERAL_LEDGER_COLUMNS: readonly Column[] = [
  { label: "Tanggal", width: 58 },
  { label: "No. Ref", width: 90 },
  { label: "Keterangan", width: CONTENT_WIDTH - 58 - 90 - 78 - 78 - 86 },
  { label: "Debit", width: 78, align: "right" as const },
  { label: "Kredit", width: 78, align: "right" as const },
  { label: "Saldo", width: 86, align: "right" as const },
];

// ── Report exporters ────────────────────────────────────────────────

export async function exportTrialBalancePdf(
  db: D1Database,
  organization: Pick<PublicOrganization, "id" | "name">,
  asOfDate: string,
): Promise<PdfExportResponse> {
  const rows = await getTrialBalance(db, organization.id, asOfDate);
  const builder = await PdfBuilder.create({
    organizationName: organization.name,
    title: "Neraca Saldo",
    subtitle: `Per ${formatDateLong(asOfDate)}`,
  });
  builder.tableHeader(TRIAL_BALANCE_COLUMNS);

  const visible = capRows(rows, builder, "saldo akun");
  for (const row of visible) {
    builder.row([
      { text: String(row.account_code), width: 56 },
      { text: row.account_name, width: ACCOUNT_NAME_COLUMN.width },
      { text: row.ending_debit > 0 ? formatIDR(row.ending_debit) : "", width: 96, align: "right" },
      { text: row.ending_credit > 0 ? formatIDR(row.ending_credit) : "", width: 96, align: "right" },
    ]);
  }

  builder.divider();
  const totalDebit = rows.reduce((sum, row) => sum + row.ending_debit, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.ending_credit, 0);
  builder.boldRow([
    { text: "Total", width: 56 + ACCOUNT_NAME_COLUMN.width },
    { text: formatIDR(totalDebit), width: 96, align: "right" },
    { text: formatIDR(totalCredit), width: 96, align: "right" },
  ], { fill: true });

  builder.note(
    totalDebit === totalCredit
      ? "Neraca saldo seimbang."
      : `Neraca saldo tidak seimbang. Selisih: ${formatIDR(Math.abs(totalDebit - totalCredit))}`,
    { size: 9, color: INK },
  );

  return { pdf: await builder.save(), filename: filenameFor("neraca_saldo") };
}

export async function exportProfitLossPdf(
  db: D1Database,
  organization: Pick<PublicOrganization, "id" | "name">,
  fromDate: string,
  toDate: string,
): Promise<PdfExportResponse> {
  const rows = await getProfitLoss(db, organization.id, fromDate, toDate);
  const builder = await PdfBuilder.create({
    organizationName: organization.name,
    title: "Laporan Laba Rugi",
    subtitle: `Periode ${formatDateLong(fromDate)} – ${formatDateLong(toDate)}`,
  });
  builder.tableHeader(SECTION_REPORT_COLUMNS);

  const sections = buildProfitLossSections(rows);
  const totals = sections.reduce<Record<string, number>>((acc, section) => {
    acc[section.key] = section.total;
    return acc;
  }, {});

  const revenue = totals.revenue ?? 0;
  const cogs = totals.cogs ?? 0;
  const expense = totals.expense ?? 0;
  const otherIncome = totals.other_income ?? 0;
  const otherExpense = totals.other_expense ?? 0;
  const grossResult = revenue - cogs;
  const operatingResult = grossResult - expense;
  const netResult = operatingResult + otherIncome - otherExpense;

  renderSections(builder, sections);
  renderResultRow(builder, resultLabel(grossResult, "Laba Kotor", "Rugi Kotor"), grossResult);
  renderResultRow(builder, resultLabel(operatingResult, "Laba Operasional", "Rugi Operasional"), operatingResult);
  renderResultRow(builder, resultLabel(netResult, "Laba Bersih", "Rugi Bersih"), netResult, true);

  return { pdf: await builder.save(), filename: filenameFor("laba_rugi") };
}

export async function exportBalanceSheetPdf(
  db: D1Database,
  organization: Pick<PublicOrganization, "id" | "name">,
  asOfDate: string,
): Promise<PdfExportResponse> {
  const rows = await getBalanceSheet(db, organization.id, asOfDate);
  const builder = await PdfBuilder.create({
    organizationName: organization.name,
    title: "Neraca",
    subtitle: `Posisi aset, kewajiban, dan ekuitas per ${formatDateLong(asOfDate)}`,
  });
  builder.tableHeader(SECTION_REPORT_COLUMNS);

  const sections = buildBalanceSheetSections(rows);
  const totals = sections.reduce<Record<string, number>>((acc, section) => {
    acc[section.key] = section.total;
    return acc;
  }, {});

  renderSections(builder, sections);

  const asset = totals.asset ?? 0;
  const totalLiabEquity = (totals.liability ?? 0) + (totals.equity ?? 0);
  builder.divider();
  builder.boldRow([
    { text: "Kewajiban + Ekuitas", width: CONTENT_WIDTH - 110 },
    { text: formatIDR(totalLiabEquity), width: 110, align: "right" },
  ], { fill: true });

  builder.note(
    Math.abs(asset - totalLiabEquity) < 1
      ? "Neraca seimbang."
      : `Neraca tidak seimbang. Selisih: ${formatIDR(Math.abs(asset - totalLiabEquity))}`,
    { size: 9, color: INK },
  );

  return { pdf: await builder.save(), filename: filenameFor("neraca") };
}

export async function exportGeneralLedgerPdf(
  db: D1Database,
  organization: Pick<PublicOrganization, "id" | "name">,
  filters: { accountId?: string; fromDate: string; toDate: string },
): Promise<PdfExportResponse> {
  const rows = await getGeneralLedger(db, organization.id, filters);
  const builder = await PdfBuilder.create({
    organizationName: organization.name,
    title: "Buku Besar",
    subtitle: `Periode ${formatDateLong(filters.fromDate)} – ${formatDateLong(filters.toDate)}`,
  });

  const groups = groupLedgerEntries(rows);
  if (groups.length === 0) {
    builder.tableHeader(GENERAL_LEDGER_COLUMNS);
    builder.row([{ text: "Tidak ada transaksi pada periode ini.", width: CONTENT_WIDTH }]);
    return { pdf: await builder.save(), filename: filenameFor("buku_besar") };
  }

  const truncated = rows.length > MAX_PDF_ROWS;
  let rendered = 0;
  for (const group of groups) {
    if (rendered >= MAX_PDF_ROWS) break;
    builder.sectionTitle(`${group.code} - ${group.name}`);
    builder.tableHeader(GENERAL_LEDGER_COLUMNS);
    rendered += renderLedgerEntries(builder, group.entries, MAX_PDF_ROWS - rendered);
    builder.boldRow([
      { text: `Subtotal ${group.code}`, width: 58 + 90 + GENERAL_LEDGER_COLUMNS[2].width },
      { text: formatIDR(group.totalDebit), width: 78, align: "right" },
      { text: formatIDR(group.totalCredit), width: 78, align: "right" },
      { text: formatIDR(group.runningBalance), width: 86, align: "right" },
    ], { height: 18, fill: true });
    builder.divider();
  }

  if (truncated) {
    builder.note(
      `Catatan: hasil PDF dibatasi hingga ${MAX_PDF_ROWS} baris dari total ${rows.length}.`,
    );
  }

  return { pdf: await builder.save(), filename: filenameFor("buku_besar") };
}

// ── Section builders (mirror the frontend report model) ─────────────

interface ReportSectionModel {
  key: string;
  label: string;
  items: Array<{ code: number | string; name: string; amount: number }>;
  total: number;
}

const PROFIT_LOSS_SECTION_META: Record<string, { label: string; order: number }> = {
  revenue: { label: "Pendapatan", order: 1 },
  cogs: { label: "Harga Pokok Penjualan", order: 2 },
  expense: { label: "Beban Operasional", order: 3 },
  other_income: { label: "Pendapatan Lain", order: 4 },
  other_expense: { label: "Beban Lain", order: 5 },
};

const BALANCE_SHEET_SECTION_META: Record<string, { label: string; order: number }> = {
  asset: { label: "Aset", order: 1 },
  liability: { label: "Kewajiban", order: 2 },
  equity: { label: "Ekuitas", order: 3 },
};

function buildProfitLossSections(rows: ProfitLossRow[]): ReportSectionModel[] {
  return buildSections(rows, PROFIT_LOSS_SECTION_META);
}

function buildBalanceSheetSections(rows: BalanceSheetRow[]): ReportSectionModel[] {
  return buildSections(rows, BALANCE_SHEET_SECTION_META);
}

function buildSections(
  rows: Array<{ section: string; account_code: number; account_name: string; amount: number }>,
  meta: Record<string, { label: string; order: number }>,
): ReportSectionModel[] {
  const grouped = new Map<string, ReportSectionModel>();
  for (const row of rows) {
    const definition = meta[row.section];
    if (!definition) continue;
    let section = grouped.get(row.section);
    if (!section) {
      section = {
        key: row.section,
        label: definition.label,
        items: [],
        total: 0,
      };
      grouped.set(row.section, section);
    }
    section.items.push({
      code: row.account_code,
      name: row.account_name,
      amount: row.amount,
    });
    section.total += row.amount;
  }
  return [...grouped.values()].sort((a, b) => meta[a.key].order - meta[b.key].order);
}

function renderSections(builder: PdfBuilder, sections: ReportSectionModel[]): void {
  for (const section of sections) {
    builder.sectionTitle(section.label);
    for (const item of section.items) {
      builder.row([
        { text: `${item.code}  ${item.name}`, width: CONTENT_WIDTH - 110 },
        { text: formatIDR(item.amount), width: 110, align: "right" },
      ]);
    }
    builder.boldRow([
      { text: `Total ${section.label}`, width: CONTENT_WIDTH - 110 },
      { text: formatIDR(section.total), width: 110, align: "right" },
    ], { height: 18, fill: true });
  }
}

function renderResultRow(
  builder: PdfBuilder,
  label: string,
  value: number,
  final = false,
): void {
  builder.boldRow([
    { text: label, width: CONTENT_WIDTH - 110 },
    { text: formatIDR(value), width: 110, align: "right" },
  ], { height: final ? 22 : 18, fill: final });
  if (!final) builder.divider();
}

function resultLabel(value: number, gain: string, loss: string): string {
  return value >= 0 ? gain : loss;
}

// ── General ledger grouping ─────────────────────────────────────────

interface LedgerGroup {
  code: number;
  name: string;
  entries: GeneralLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  runningBalance: number;
}

function groupLedgerEntries(rows: GeneralLedgerRow[]): LedgerGroup[] {
  const groups = new Map<number, LedgerGroup>();
  for (const entry of rows) {
    let group = groups.get(entry.account_code);
    if (!group) {
      group = {
        code: entry.account_code,
        name: entry.account_name,
        entries: [],
        totalDebit: 0,
        totalCredit: 0,
        runningBalance: 0,
      };
      groups.set(entry.account_code, group);
    }
    group.entries.push(entry);
    group.totalDebit += entry.debit;
    group.totalCredit += entry.credit;
    group.runningBalance = entry.running_balance;
  }
  return [...groups.values()].sort((a, b) => a.code - b.code);
}

/** Render journal lines for one ledger account, bounded by the PDF row cap.
 *  Returns the number of lines actually rendered. */
function renderLedgerEntries(
  builder: PdfBuilder,
  entries: GeneralLedgerRow[],
  maxRows: number,
): number {
  let rendered = 0;
  for (const entry of entries) {
    if (rendered >= maxRows) return rendered;
    builder.row([
      { text: entry.entry_date, width: 58 },
      { text: entry.transaction_number ?? entry.entry_number, width: 90, size: 8 },
      { text: entry.description, width: GENERAL_LEDGER_COLUMNS[2].width },
      { text: entry.debit > 0 ? formatIDR(entry.debit) : "", width: 78, align: "right" },
      { text: entry.credit > 0 ? formatIDR(entry.credit) : "", width: 78, align: "right" },
      { text: formatIDR(entry.running_balance), width: 86, align: "right" },
    ]);
    rendered += 1;
  }
  return rendered;
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Rows above the cap are skipped (with a note) so large exports stay
 * bounded. Returns the rows to render.
 */
function capRows<T>(rows: T[], builder: PdfBuilder, label: string): T[] {
  if (rows.length <= MAX_PDF_ROWS) return rows;
  builder.note(
    `Catatan: hasil PDF dibatasi hingga ${MAX_PDF_ROWS} ${label} dari total ${rows.length}.`,
  );
  return rows.slice(0, MAX_PDF_ROWS);
}
