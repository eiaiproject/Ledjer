import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getUnreadCount,
  listNotifications,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  type NotificationOutput,
} from "@/lib/api/notifications";
import { Bell, Loader, Eye, Trash2, AlertTriangle, Clock, Package, Lock, Ban, Refresh, Upload, Download, Shield, Check } from "reicon-react";

interface CategoryConfig {
  icon: React.ReactNode;
  color: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  overdue_receivable: { icon: <AlertTriangle className="h-4 w-4" />, color: "text-error bg-error-bg" },
  upcoming_payable: { icon: <Clock className="h-4 w-4" />, color: "text-warning bg-warning-bg" },
  low_stock: { icon: <Package className="h-4 w-4" />, color: "text-honey-600 bg-honey-50" },
  unclosed_period: { icon: <Lock className="h-4 w-4" />, color: "text-sky-700 bg-sky-100" },
  team_invitation: { icon: <Upload className="h-4 w-4" />, color: "text-leaf-700 bg-success-bg" },
  import_failed: { icon: <Upload className="h-4 w-4" />, color: "text-error bg-error-bg" },
  export_completed: { icon: <Download className="h-4 w-4" />, color: "text-leaf-700 bg-success-bg" },
  backup_failed: { icon: <Ban className="h-4 w-4" />, color: "text-error bg-error-bg" },
  role_changed: { icon: <Shield className="h-4 w-4" />, color: "text-sky-700 bg-sky-100" },
  new_device_login: { icon: <Shield className="h-4 w-4" />, color: "text-clay-600 bg-clay-50" },
  system: { icon: <Refresh className="h-4 w-4" />, color: "text-wood-600 bg-wood-50" },
};

function getCategoryIcon(category: string): React.ReactNode {
  return CATEGORY_CONFIG[category]?.icon ?? <Bell className="h-4 w-4" />;
}

function getCategoryColor(category: string): string {
  return CATEGORY_CONFIG[category]?.color ?? "bg-wood-100 text-wood-500";
}

const SEVERITY_DOTS: Record<string, string> = {
  critical: "bg-error",
  high: "bg-clay-500",
  medium: "bg-honey-500",
  low: "bg-sky-500",
  info: "bg-wood-400",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}h`;
  return new Date(ts).toLocaleDateString("id-ID");
}

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Unread count — poll every 60s
  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  // Recent notifications for dropdown
  const { data: recentNotifs, isLoading } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => listNotifications(false, 10, 0),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const unreadCount = unreadData?.total ?? 0;
  const notifications = recentNotifs ?? [];

  const handleNotificationClick = useCallback((notif: NotificationOutput) => {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.actionUrl) {
      setOpen(false);
      navigate(notif.actionUrl);
    }
  }, [navigate, markReadMutation]);

  // S3358 — flatten nested ternary into if/else
  let notificationListContent: React.ReactNode;
  if (isLoading) {
    notificationListContent = (
      <div className="flex items-center justify-center py-8">
        <Loader className="h-5 w-5 animate-spin text-wood-500" />
      </div>
    );
  } else if (!notifications.length) {
    notificationListContent = (
      <div className="flex flex-col items-center gap-2 py-8 text-wood-500">
        <Bell className="h-6 w-6" />
        <p className="text-xs">Tidak ada notifikasi</p>
      </div>
    );
  } else {
    notificationListContent = (
      <div className="divide-y divide-wood-100">
        {notifications.map((notif) => (
          <div // NOSONAR typescript:S6848,typescript:S6845,typescript:S6819 — can't nest <button> inside <button>
            key={notif.id}
            role="button"
            tabIndex={0}
            className={`group relative flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer ${
              !notif.isRead ? "bg-leaf-50/30" : "hover:bg-wood-50"
            }`}
            onClick={() => handleNotificationClick(notif)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleNotificationClick(notif); } }}
          >
            {/* Unread dot */}
            {!notif.isRead && (
              <span className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-leaf-500" />
            )}

            {/* Icon */}
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${getCategoryColor(notif.category)}`}>
              {getCategoryIcon(notif.category)}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 pl-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium truncate ${!notif.isRead ? "text-text-primary" : "text-text-secondary"}`}>
                  {notif.title}
                </span>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOTS[notif.severity] ?? "bg-wood-400"}`} aria-hidden="true" />
              </div>
              <p className="mt-0.5 text-xs text-wood-500 line-clamp-2">{notif.message}</p>
              <p className="mt-0.5 text-[10px] text-wood-500">{timeAgo(notif.createdAt)}</p>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notif.isRead && (
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(notif.id); }}
                  className="flex h-6 w-6 items-center justify-center rounded text-wood-500 hover:bg-wood-100 hover:text-wood-600"
                  title="Tandai dibaca"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
              <button type="button"
                onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(notif.id); }}
                className="flex h-6 w-6 items-center justify-center rounded text-wood-500 hover:bg-error-bg hover:text-error"
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
    <div ref={dropdownRef} className="relative">
      <button         type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-wood-500 transition-colors hover:bg-wood-100 hover:text-wood-700"
        aria-label={`Notifikasi${unreadCount > 0 ? " (" + unreadCount + " belum dibaca)" : ""}`}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 origin-top-right rounded-xl border border-wood-200 bg-surface shadow-xl z-[var(--z-dropdown)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-wood-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">Notifikasi</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button type="button"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-wood-500 hover:bg-wood-100"
                  title="Tandai semua sudah dibaca"
                >
                  <Check className="h-3.5 w-3.5" />
                  Baca semua
                </button>
              )}
              <button type="button"
                onClick={() => { setOpen(false); navigate("/notifications"); }}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink hover:bg-wood-100"
              >
                Lihat semua
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[60vh] overflow-y-auto">
            {notificationListContent}
          </div>
        </div>
      )}
    </div>
  );
}
