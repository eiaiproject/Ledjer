import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissAll,
  dismissNotification,
  type NotificationCategory,
} from "@/lib/api/notifications";
import { Bell, Trash2, Eye, AlertTriangle, Clock, Package, Lock, Ban, Refresh, Upload, Download, Shield, Check } from "reicon-react";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { PageGuide } from "@/components/ui/page-guide";
import { FieldHelp } from "@/components/ui/help-tooltip";

const CATEGORY_LABELS: Record<string, string> = {
  overdue_receivable: "Piutang Jatuh Tempo",
  upcoming_payable: "Tagihan Mendekati Jatuh Tempo",
  low_stock: "Stok Menipis",
  unclosed_period: "Periode Belum Ditutup",
  team_invitation: "Undangan Tim",
  import_failed: "Import Gagal",
  export_completed: "Ekspor Selesai",
  backup_failed: "Backup Gagal",
  role_changed: "Perubahan Peran",
  new_device_login: "Login Perangkat Baru",
  system: "Sistem",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  overdue_receivable: <AlertTriangle className="h-4 w-4" />,
  upcoming_payable: <Clock className="h-4 w-4" />,
  low_stock: <Package className="h-4 w-4" />,
  unclosed_period: <Lock className="h-4 w-4" />,
  team_invitation: <Shield className="h-4 w-4" />,
  import_failed: <Upload className="h-4 w-4" />,
  export_completed: <Download className="h-4 w-4" />,
  backup_failed: <Ban className="h-4 w-4" />,
  role_changed: <Shield className="h-4 w-4" />,
  new_device_login: <Shield className="h-4 w-4" />,
  system: <Refresh className="h-4 w-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  overdue_receivable: "text-error bg-error-bg",
  upcoming_payable: "text-warning bg-warning-bg",
  low_stock: "text-honey-600 bg-honey-50",
  unclosed_period: "text-sky-700 bg-sky-100",
  team_invitation: "text-leaf-700 bg-success-bg",
  import_failed: "text-error bg-error-bg",
  export_completed: "text-leaf-700 bg-success-bg",
  backup_failed: "text-error bg-error-bg",
  role_changed: "text-sky-700 bg-sky-100",
  new_device_login: "text-clay-600 bg-clay-50",
  system: "text-wood-600 bg-wood-50",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Kritis", high: "Penting", medium: "Sedang", low: "Ringan", info: "Info",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-error-bg text-error",
  high: "bg-clay-50 text-clay-700",
  medium: "bg-honey-50 text-honey-700",
  low: "bg-sky-100 text-sky-700",
  info: "bg-wood-100 text-wood-600",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari`;
  return new Date(ts).toLocaleDateString("id-ID");
}

const CATEGORIES: { value: NotificationCategory | ""; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "overdue_receivable", label: "Piutang" },
  { value: "upcoming_payable", label: "Utang" },
  { value: "low_stock", label: "Stok" },
  { value: "unclosed_period", label: "Periode" },
  { value: "system", label: "Sistem" },
];

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory | "">("");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", "list", categoryFilter],
    queryFn: () => listNotifications(false, 100, 0),
  });

  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
  });

  const filtered = categoryFilter
    ? notifications.filter((n) => n.category === categoryFilter)
    : notifications;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dismissAllMutation = useMutation({
    mutationFn: () => dismissAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = unreadData?.total ?? 0;

  // S3358 — flatten nested ternary into if/else + S2681 extract shared handler
  const handleNotificationEvent = (notif: typeof filtered[number]) => {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    if (notif.actionUrl) navigate(notif.actionUrl);
  };

  let notificationListContent: React.ReactNode;
  if (isLoading) {
    notificationListContent = (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-wood-100" />
        ))}
      </div>
    );
  } else if (!filtered.length) {
    notificationListContent = (
      <div className="flex flex-col items-center gap-3 py-12 text-wood-500">
        <Bell className="h-10 w-10" />
        <p className="text-sm font-medium">Tidak ada notifikasi</p>
        <p className="text-xs">
          {categoryFilter ? "Tidak ada notifikasi untuk kategori ini" : "Notifikasi akan muncul di sini"}
        </p>
      </div>
    );
  } else {
    notificationListContent = (
      <div className="space-y-2">
        {filtered.map((notif) => (
          <div // NOSONAR typescript:S6848,typescript:S6845,typescript:S6819 — can't nest <button> inside <button>
            key={notif.id}
            className={`group relative flex items-start gap-4 rounded-xl border p-4 transition-all cursor-pointer ${
              !notif.isRead
                ? "border-leaf-200 bg-leaf-50/50"
                : "border-wood-200 bg-surface hover:border-wood-300"
            }`}
            onClick={() => handleNotificationEvent(notif)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleNotificationEvent(notif); } }}
            role="button"
            tabIndex={0}
          >
            {/* Icon */}
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CATEGORY_COLORS[notif.category] ?? "bg-wood-100 text-wood-500"}`}>
              {CATEGORY_ICONS[notif.category] ?? <Bell className="h-4 w-4" />}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${!notif.isRead ? "text-text-primary" : "text-text-secondary"}`}>
                  {notif.title}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[notif.severity] ?? ""}`}>
                  {SEVERITY_LABELS[notif.severity] ?? notif.severity}
                </span>
                {!notif.isRead && (
                  <span className="h-2 w-2 rounded-full bg-leaf-500" aria-label="Belum dibaca" />
                )}
              </div>
              <p className="mt-0.5 text-sm text-text-secondary">{notif.message}</p>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-wood-500">
                <span>{CATEGORY_LABELS[notif.category] ?? notif.category}</span>
                <span>{timeAgo(notif.createdAt)}</span>
                {notif.actionUrl && (
                  <span className="text-ink underline">Lihat</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notif.isRead && (
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(notif.id); }}
                  className="flex h-7 w-7 items-center justify-center rounded text-wood-500 hover:bg-wood-100 hover:text-wood-600"
                  title="Tandai dibaca"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              <button type="button"
                onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(notif.id); }}
                className="flex h-7 w-7 items-center justify-center rounded text-wood-500 hover:bg-error-bg hover:text-error"
                title="Hapus"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <PageShell
      header={{
        title: "Pusat Notifikasi",
        description: unreadCount > 0
          ? `${unreadCount} notifikasi belum dibaca`
          : "Semua notifikasi sudah dibaca",
        actions: unreadCount > 0 ? [
          { key: "mark-read", children: (
            <Button type="button" variant="outline" size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
              Baca Semua
            </Button>
          ) },
          { key: "dismiss", children: (
            <Button type="button" variant="outline" size="sm"
              className="border-error-border text-error hover:bg-error-bg"
              onClick={() => {
                if (window.confirm(`Hapus semua ${unreadCount} notifikasi?`)) {
                  dismissAllMutation.mutate();
                }
              }}
              disabled={dismissAllMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Hapus Semua
            </Button>
          ) },
        ] : undefined,
      }}
      className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8"
    >
      {/* Panduan halaman */}
      <PageGuide guideKey="notifications" />

      {/* Category filter */}
      <FieldHelp topic="notification_triggers" label="Notifikasi datang dari apa saja?" />
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button type="button"
            key={c.value}
            onClick={() => setCategoryFilter(c.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              (c.value === "" && !categoryFilter) || categoryFilter === c.value
                ? "bg-wood-500 text-white"
                : "bg-wood-100 text-wood-700 hover:bg-wood-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      {notificationListContent}
    </PageShell>
  );
}
