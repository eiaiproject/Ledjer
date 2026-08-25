import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatAmountInput, parseAmountInput } from "@/lib/utils";

import {
  postManualJournal,
  previewManualJournal,
  saveJournalTemplate,
  listJournalTemplates,
  deleteJournalTemplate,
  type JournalLineInput,
  type PostManualJournalInput,
  type PreviewManualJournalResult,
} from "@/lib/api/manual-journals";
import { listAccounts } from "@/lib/api/accounts";
import {
  Plus,
  Trash2,
  Save,
  Check,
  X,
  Eye,
  BookOpen,
  InfoCircle,
} from "reicon-react";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";
import { FieldHelp } from "@/components/ui/help-tooltip";

interface LineEntry {
  id: string;
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  description: string;
  accountName?: string;
  accountCode?: string;
}

type JournalStatusTone = "neutral" | "warning" | "error" | "success";

/** Tailwind classes per status tone - lookup map instead of a nested ternary. */
const TONE_CLASSES: Record<JournalStatusTone, string> = {
  success: "border-leaf-200 bg-leaf-50 text-leaf-800",
  error: "border-error-border bg-error-bg text-error",
  warning: "border-honey-300 bg-honey-50 text-honey-800",
  neutral: "border-wood-200 bg-wood-50 text-wood-700",
};

let lineCounter = 0;
function newLine(): LineEntry {
  lineCounter++;
  return { id: `line-${lineCounter}`, accountId: "", debitMinor: 0, creditMinor: 0, description: "" };
}

export function ManualJournalPage() {
  const queryClient = useQueryClient();
  const { canManageAccounts } = useOrgPermissions();

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<string>("manual_journal");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<LineEntry[]>([newLine(), newLine()]);
  const [preview, setPreview] = useState<PreviewManualJournalResult | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  // Accounts query
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", "list"],
    queryFn: () => listAccounts(),
    enabled: canManageAccounts,
  });

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a] as const)),
    [accounts],
  );

  // Templates query
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ["journal-templates"],
    queryFn: () => listJournalTemplates(),
    enabled: showTemplates,
  });

  // Computed totals
  const totalDebit = lines.reduce((s, l) => s + (l.debitMinor || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.creditMinor || 0), 0);
  const balanced = totalDebit > 0 && totalCredit > 0 && totalDebit === totalCredit;
  const difference = Math.abs(totalDebit - totalCredit);
  const rupiah = (n: number) => n.toLocaleString("id-ID");

  // Status panduan inline - menjelaskan apa yang kurang agar tombol bisa dipakai
  const missingDescription = description.trim().length === 0;
  const missingAccount = lines.some((l) => !l.accountId);
  const status: { tone: JournalStatusTone; text: string } = (() => {
    if (missingDescription) return { tone: "neutral", text: "Langkah 1: isi Deskripsi jurnal di atas." };
    if (missingAccount) return { tone: "warning", text: "Pilih akun untuk semua baris jurnal agar bisa Preview." };
    if (!balanced) {
      return {
        tone: "error",
        text: `Jurnal belum balance - selisih Rp ${rupiah(difference)}. Samakan total Debit dan Kredit.`,
      };
    }
    if (!preview) return { tone: "warning", text: "Jurnal sudah balance. Klik Preview untuk memeriksa, lalu Posting Jurnal." };
    return { tone: "success", text: "Jurnal balance - siap diposting." };
  })();

  // Preview dianggap basi jika jurnal berubah setelah preview - cegah
  // posting data lama yang tidak sesuai isian terakhir.
  const invalidatePreview = useCallback(() => setPreview(null), []);

  // Mutations
  const postMutation = useMutation({
    mutationFn: (input: PostManualJournalInput) => postManualJournal(input),
    onSuccess: (result) => {
      toast.success(`Jurnal berhasil diposting: ${result.entryNumber}`);
      setLines([newLine(), newLine()]);
      setDescription("");
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const previewMutation = useMutation({
    mutationFn: (input: PostManualJournalInput) => previewManualJournal(input),
    onSuccess: setPreview,
    onError: (err) => toast.error(translateError(err)),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => saveJournalTemplate(
      templateName,
      `Template ${entryType}`,
      entryType,
      lines.map(l => ({
        accountId: l.accountId,
        debitMinor: l.debitMinor,
        creditMinor: l.creditMinor,
        description: l.description,
      })),
    ),
    onSuccess: () => {
      toast.success("Template berhasil disimpan");
      setTemplateName("");
      refetchTemplates();
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteJournalTemplate(id),
    onSuccess: () => {
      toast.success("Template berhasil dihapus");
      refetchTemplates();
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const handleAddLine = useCallback(() => {
    setPreview(null);
    setLines(prev => [...prev, newLine()]);
  }, []);

  const handleRemoveLine = useCallback((id: string) => {
    setPreview(null);
    setLines(prev => prev.filter(l => l.id !== id));
  }, []);

  const handleLineChange = useCallback((id: string, field: keyof LineEntry, value: string | number) => {
    setPreview(null);
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      // Auto-switch debit/credit
      if (field === "debitMinor" && Number(value) > 0) {
        updated.creditMinor = 0;
      }
      if (field === "creditMinor" && Number(value) > 0) {
        updated.debitMinor = 0;
      }
      if (field === "accountId") {
        const acct = accountMap.get(value as string);
        if (acct) {
          updated.accountName = acct.name;
          updated.accountCode = String(acct.code);
        }
      }
      return updated;
    }));
  }, [accountMap]);

  const handleLoadTemplate = useCallback((template: typeof templates[0]) => {
    const loadedLines = template.lines.map((l: JournalLineInput) => ({
      id: `loaded-${Math.random().toString(36).slice(2)}`, // NOSONAR - temp ID generation
      accountId: l.accountId,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      description: l.description,
      accountName: accountMap.get(l.accountId)?.name,
      accountCode: String(accountMap.get(l.accountId)?.code ?? ""),
    }));
    setLines(loadedLines.length >= 2 ? loadedLines : [newLine(), newLine()]);
    setDescription(template.description);
    setEntryType(template.entryType);
    setPreview(null);
    setShowTemplates(false);
  }, [accountMap]);


  const handlePreview = useCallback(() => {
    if (!description.trim()) {
      toast.error("Deskripsi jurnal harus diisi");
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error("Pilih akun untuk semua baris jurnal");
      return;
    }
    previewMutation.mutate({
      entryDate,
      entryType,
      description: description.trim(),
      lines: lines.map(l => ({
        accountId: l.accountId,
        debitMinor: l.debitMinor || 0,
        creditMinor: l.creditMinor || 0,
        description: l.description || description.trim(),
      })),
      idempotencyKey: `jm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, // NOSONAR - idempotency key
    });
  }, [entryDate, entryType, description, lines, previewMutation]);

  const handlePost = useCallback(() => {
    if (!preview) {
      toast.error("Klik Preview terlebih dahulu untuk memeriksa jurnal");
      return;
    }
    if (!balanced) {
      toast.error("Jurnal belum balance (debit ≠ kredit)");
      return;
    }
    postMutation.mutate({
      entryDate: preview.entryDate,
      entryType: preview.entryType,
      description: preview.description,
      lines: preview.lines.map(l => ({
        accountId: l.accountId,
        debitMinor: l.debitMinor,
        creditMinor: l.creditMinor,
        description: l.description,
      })),
      idempotencyKey: `jm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, // NOSONAR - idempotency key
    });
  }, [preview, balanced, postMutation]);

  if (!canManageAccounts) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Jurnal Manual</h1>
          <p className="mt-1 text-sm text-text-secondary">Buat jurnal akuntansi secara manual.</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-wood-500">Anda tidak memiliki izin untuk membuat jurnal manual.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PageShell
      header={{
        title: "Jurnal Manual",
        description: "Buat jurnal umum, penyesuaian, atau jurnal penutup.",
        actions: [
          { key: "templates", children: (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <BookOpen className="h-4 w-4" />
              Template
            </Button>
          )},
        ],
      }}
    >

      {/* Panduan halaman */}
      <PageGuide guideKey="journals" />

      {/* Journal form */}
      <Card>
        <CardContent className="space-y-4 py-4">
          {/* Entry metadata */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Tanggal"
              type="date"
              value={entryDate}
              onChange={(e) => { setEntryDate(e.target.value); invalidatePreview(); }}
            />
            <div>
              <Select
                id="journalEntryType"
                label="Jenis Jurnal"
                value={entryType}
                onChange={(e) => { setEntryType(e.target.value); invalidatePreview(); }}
              >
                <option value="manual_journal">Jurnal Manual</option>
                <option value="adjustment">Jurnal Penyesuaian</option>
                <option value="closing">Jurnal Penutup</option>
              </Select>
              <FieldHelp topic="journal_types" label="Kapan memakai masing-masing jenis" />
            </div>
            <Input
              label="Deskripsi"
              value={description}
              onChange={(e) => { setDescription(e.target.value); invalidatePreview(); }}
              placeholder="Deskripsi jurnal..."
            />
          </div>

          {/* Journal lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-wood-700">Baris Jurnal</p>
              <Badge variant={balanced ? "success" : totalDebit > 0 || totalCredit > 0 ? "error" : "neutral"} size="sm">{/* NOSONAR */}
                {balanced ? "Balance" : `Selisih: Rp ${rupiah(difference)}`}
              </Badge>
            </div>

            {/* Header row */}
            <div className="hidden grid-cols-[1fr_1fr_1fr_80px_80px_40px] gap-2 text-xs font-medium text-wood-500 sm:grid">
              <span>Akun</span>
              <span>Deskripsi</span>
              <span></span>
              <span className="text-right">Debit (Rp)</span>
              <span className="text-right">Kredit (Rp)</span>
              <span></span>
            </div>
            <p className="text-xs text-text-tertiary">
              Masukkan nominal dalam Rupiah - contoh: <strong>100000</strong> = Rp 100.000.
            </p>

            {lines.map((line, index) => (
              <div key={line.id} className="grid grid-cols-1 gap-2 rounded-md border border-wood-100 bg-cream-50 p-3 sm:grid-cols-[1fr_1fr_1fr_80px_80px_40px] sm:items-center">
                {/* Account selector */}
                <Select
                  size="sm"
                  value={line.accountId}
                  onChange={(e) => handleLineChange(line.id, "accountId", e.target.value)}
                  aria-label={`Akun baris ${index + 1}`}
                >
                  <option value="">Pilih akun...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {String(a.code)} - {a.name}
                    </option>
                  ))}
                </Select>

                {/* Description */}
                <Input
                  value={line.description}
                  onChange={(e) => handleLineChange(line.id, "description", e.target.value)}
                  placeholder={`Baris ${index + 1}`}
                  aria-label={`Deskripsi baris ${index + 1}`}
                  containerClassName="min-w-0"
                />

                {/* Line info */}
                {line.accountName && (
                  <p className="hidden truncate text-xs text-wood-500 sm:block">{line.accountCode}</p>
                )}
                {!line.accountName && <div className="hidden sm:block" />}

                {/* Debit - nominal dalam Rupiah (bukan sen); pemisah ribuan otomatis */}
                <input
                  type="text"
                  inputMode="numeric"
                  value={line.debitMinor ? formatAmountInput(line.debitMinor, true) : ""}
                  onChange={(e) => handleLineChange(line.id, "debitMinor", parseAmountInput(e.target.value, 0) ?? 0)}
                  className="num-mono min-h-[44px] w-full rounded-md border border-wood-200 bg-white px-2 py-1.5 text-right text-xs text-wood-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:min-h-0"
                  placeholder="0"
                  aria-label={`Debit baris ${index + 1}`}
                />

                {/* Credit - nominal dalam Rupiah (bukan sen); pemisah ribuan otomatis */}
                <input
                  type="text"
                  inputMode="numeric"
                  value={line.creditMinor ? formatAmountInput(line.creditMinor, true) : ""}
                  onChange={(e) => handleLineChange(line.id, "creditMinor", parseAmountInput(e.target.value, 0) ?? 0)}
                  className="num-mono min-h-[44px] w-full rounded-md border border-wood-200 bg-white px-2 py-1.5 text-right text-xs text-wood-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:min-h-0"
                  placeholder="0"
                  aria-label={`Kredit baris ${index + 1}`}
                />

                {/* Remove */}
                <button                   type="button"
                  onClick={() => handleRemoveLine(line.id)}
                  disabled={lines.length <= 2}
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-md text-wood-500 hover:bg-error/10 hover:text-error disabled:opacity-30 sm:h-8 sm:w-8"
                  aria-label={`Hapus baris ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleAddLine}>
                <Plus className="h-4 w-4" />
                Tambah baris
              </Button>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-wood-500">
                  Debit: <strong className="text-wood-700">Rp {rupiah(totalDebit)}</strong>
                </span>
                <span className="text-wood-500">|</span>
                <span className="text-wood-500">
                  Kredit: <strong className="text-wood-700">Rp {rupiah(totalCredit)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Preview section */}
          {preview && (
            <Callout variant="success" title="Preview Jurnal" className="p-3">
              <div className="space-y-1 text-xs">
                {preview.lines.map((line, i) => (
                  <div key={line.accountCode + "-" + i} className="flex justify-between">
                    <span>
                      {line.accountCode} - {line.accountName}
                      {line.debitMinor > 0 ? ` (Debit: Rp ${rupiah(line.debitMinor)})` : ""}
                      {line.creditMinor > 0 ? ` (Kredit: Rp ${rupiah(line.creditMinor)})` : ""}
                    </span>
                    <span className="text-leaf-600">{line.description}</span>
                  </div>
                ))}
                <div className="border-t border-leaf-300 pt-1 font-medium">
                  Total: Debit Rp {rupiah(preview.totalDebit)} = Kredit Rp {rupiah(preview.totalCredit)}
                  {preview.balanced ? (
                    <span className="inline-flex items-center gap-1 text-leaf-600">
                      <Check className="h-4 w-4" /> Balance
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-error">
                      <X className="h-4 w-4" /> Tidak balance
                    </span>
                  )}
                </div>
              </div>
            </Callout>
          )}

          {/* Status panduan inline - selalu terlihat */}
          <div
            role="status"
            aria-live="polite"
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${TONE_CLASSES[status.tone]}`}
          >
            <InfoCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{status.text}</span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handlePreview}
              loading={previewMutation.isPending}
              disabled={previewMutation.isPending}
            >
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handlePost}
              loading={postMutation.isPending}
              disabled={postMutation.isPending}
            >
              <Check className="h-4 w-4" />
              Posting Jurnal
            </Button>
            {balanced && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTemplates(true)}
              >
                <Save className="h-4 w-4" />
                Simpan sebagai template
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Templates panel */}
      {showTemplates && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-wood-700">Template Jurnal</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Save current as template */}
            {balanced && (
              <div className="mb-4 flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nama template..."
                  containerClassName="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => saveTemplateMutation.mutate()}
                  loading={saveTemplateMutation.isPending}
                  disabled={!templateName.trim()}
                >
                  <Save className="h-4 w-4" />
                  Simpan
                </Button>
              </div>
            )}

            {/* List templates */}
            {templates.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="Belum ada template"
                description="Simpan jurnal sebagai template untuk digunakan kembali."
              />
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-wood-100 bg-cream-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-wood-700">{t.name}</p>
                      <p className="text-xs text-wood-500">
                        {t.lines.length} baris | Rp {rupiah(t.totalDebitMinor)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleLoadTemplate(t)}>
                        <Eye className="h-4 w-4" />
                        Muat
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTemplateMutation.mutate(t.id)}
                        className="text-error hover:bg-error/10 hover:text-error"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
