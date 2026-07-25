import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { type ComponentType } from "react";
import * as Sentry from "@sentry/react";
import {
  Home,
  Receipt,
  BookOpen,
  Package,
  FileText,
  Chart,
  Settings,
  Plus,
  Logout,
  Menu,
  X,
  ChevronDown,
  AnglesLeft,
  Repeat,
} from "reicon-react";
import { useOrganization, useIsOwner, useOrgPermissions } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { GlobalSearchModal, SearchTrigger } from "@/components/global-search";
import { NotificationBell } from "@/components/notification-bell";

type NavItem =
  | { to: string; label: string; icon: ComponentType<{ className?: string }>; children?: never }
  | { label: string; icon: ComponentType<{ className?: string }>; children: { to: string; label: string }[]; to?: never };

type NavItemWithPerm = NavItem & { requires?: string };

const NAV_ITEMS: NavItemWithPerm[] = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/transactions", label: "Transaksi", icon: Receipt, requires: "canCreateTransaction" },
  { to: "/accounts", label: "Akun", icon: BookOpen, requires: "canManageAccounts" },
  { to: "/products", label: "Produk", icon: Package, requires: "canManageProducts" },
  { to: "/documents", label: "Dokumen", icon: FileText },
  { to: "/recurring-transactions", label: "Berulang", icon: Repeat },
  { to: "/invoices", label: "Faktur", icon: FileText, requires: "canCreateTransaction" },
  { to: "/journals", label: "Jurnal Manual", icon: BookOpen, requires: "canManageAccounts" },
  { to: "/reconciliation", label: "Rekonsiliasi", icon: BookOpen, requires: "canCreateTransaction" },
  { to: "/opening-balance", label: "Saldo Awal", icon: BookOpen, requires: "canManageAccounts" },
  { to: "/import", label: "Import Data", icon: FileText, requires: "canManageAccounts" },
  {
    label: "Laporan",
    icon: Chart,
    requires: "canViewReports",
    children: [
      { to: "/reports/general-ledger", label: "Buku Besar" },
      { to: "/reports/trial-balance", label: "Neraca Saldo" },
      { to: "/reports/profit-loss", label: "Laba Rugi" },
      { to: "/reports/balance-sheet", label: "Neraca" },
      { to: "/reports/cash-flow", label: "Arus Kas" },
      { to: "/reports/aging", label: "Piutang & Utang" },
    ],
  },
  {
    label: "Pengaturan",
    icon: Settings,
    requires: "canManageTeam",
    children: [
      { to: "/settings/team", label: "Tim" },
      { to: "/settings/period-locks", label: "Kunci Periode" },
      { to: "/approvals", label: "Persetujuan" },
      { to: "/approvals/settings", label: "Atur Persetujuan" },
    ],
  },
];

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const { canCreateTransaction } = useOrgPermissions();
  const navPermissions = useOrgPermissions();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // P1.4: Onboarding guard — redirect to onboarding if not completed
  useEffect(() => {
    if (orgData?.needsOnboarding) {
      navigate("/onboarding", { replace: true });
    }
  }, [orgData, navigate]);

  const mobileDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;
    if (mobileMenuOpen && !dialog.open) {
      dialog.showModal();
    } else if (!mobileMenuOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileMenuOpen]);

  const handleDialogClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Filter nav items based on permissions
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.requires) return true;
    return (navPermissions as Record<string, boolean>)[item.requires] === true;
  });

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const isActive = (path: string) => location.pathname === path;
  const isParentActive = (children: { to: string }[]) =>
    children.some((child) => location.pathname === child.to);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // Keyboard shortcut: Ctrl+K / Cmd+K to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sentry Feedback widget — only visible inside dashboard layout
  useEffect(() => {
    const feedback = Sentry.getFeedback() as { createWidget: (opts?: Record<string, unknown>) => { remove: () => void } } | undefined;
    if (!feedback) return;
    const widget = feedback.createWidget();
    return () => widget.remove();
  }, []);

  if (orgData?.needsOnboarding) {
    return (
      <output className="flex ledger-min-dvh items-center justify-center" aria-label="Memuat data organisasi">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="sr-only">Memuat data organisasi...</span>
      </output>
    );
  }

  const handleSkipToContent = () => {
    const main = document.getElementById('main-content');
    if (main) {
      main.focus();
      main.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const showBottomNav = location.pathname !== '/transactions/new';

  const sidebarWidth = sidebarCollapsed ? "w-16" : "w-60";

  return (
    <div className="ledger-min-dvh bg-background">
      {/* Skip to content link — WCAG 2.4.1 */}
      <a
        href="#main-content"
        onClick={(e) => { e.preventDefault(); handleSkipToContent(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[var(--z-toast)] focus:rounded-lg focus:bg-cream-50 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-wood-900 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-wood-500"
      >
        Langsung ke konten utama
      </a>
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden bg-wood-700 transition-all duration-300 ease-out lg:fixed lg:inset-y-0 lg:left-0 lg:z-[var(--z-drawer)] lg:flex lg:flex-col",
        sidebarWidth
      )}>
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-wood-600 px-4">
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="flex items-center gap-2"
              aria-label="Perluas sidebar"
            >
              <Logo size="sm" variant="icon" className="h-8 w-8" />
            </button>
          ) : (
            <Link to="/dashboard" className="flex items-center gap-2">
              <Logo size="md" variant="full" color="white" className="h-8" />
            </Link>
          )}
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="p-2 rounded-md text-wood-300 hover:bg-wood-600 hover:text-cream-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Ciutkan sidebar"
            >
              <AnglesLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2" aria-label="Primary">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const children = item.children;
              const isExpanded = expandedMenus.includes(item.label);
              const active = children ? isParentActive(children) : isActive(item.to!);
              const menuId = `desktop-nav-${item.label.toLowerCase()}`;

              if (children) {
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => toggleMenu(item.label)}
                      aria-expanded={isExpanded}
                      aria-controls={menuId}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                        sidebarCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                        active
                          ? "bg-wood-600 text-cream-50"
                          : "text-wood-200 hover:bg-wood-600/50 hover:text-cream-50"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!sidebarCollapsed && (
                        <>
                          <span className="min-w-0 flex-1 break-words text-left">{item.label}</span>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </>
                      )}
                    </button>
                    {!sidebarCollapsed && isExpanded && (
                      <ul id={menuId} className="mt-1 ml-8 space-y-1">
                        {children.map((child) => (
                          <li key={child.to}>
                            <Link
                              to={child.to}
                              aria-current={isActive(child.to) ? "page" : undefined}
                              className={cn(
                                "block rounded-lg px-3 py-2 text-sm transition-colors",
                                isActive(child.to)
                                  ? "bg-wood-600/50 text-cream-50 font-medium"
                                  : "text-wood-300 hover:bg-wood-600/30 hover:text-cream-50"
                              )}
                            >
                              <span className="break-words">{child.label}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              }

              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                      sidebarCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                      active
                        ? "bg-wood-600 text-cream-50"
                        : "text-wood-200 hover:bg-wood-600/50 hover:text-cream-50"
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span className="min-w-0 break-words">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>



        {/* User Section */}
        <div className={cn(
          "border-t border-wood-600 p-3",
          sidebarCollapsed && "px-2"
        )}>
          <div className={cn(
            "flex items-center",
            sidebarCollapsed ? "justify-center" : "gap-3"
          )}>
            <div className="h-9 w-9 rounded-full bg-wood-500 flex items-center justify-center text-cream-50 text-sm font-medium shrink-0">
              {orgData?.organization?.name?.charAt(0) || "U"}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="break-words text-sm font-medium text-cream-50">
                    {orgData?.organization?.name || "Organisasi"}
                  </p>
                  <p className="text-xs text-wood-300 capitalize">
                    {isOwner ? "Owner" : "Staff"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-2 rounded-md text-wood-300 hover:text-cream-50 hover:bg-wood-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Keluar"
                >
                  <Logout className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-2 w-full p-2 rounded-md text-wood-300 hover:text-cream-50 hover:bg-wood-600 flex justify-center min-h-[44px]"
              aria-label="Keluar"
            >
              <Logout className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="fixed top-0 inset-x-0 z-[var(--z-dropdown)] border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center -ml-2 text-wood-600 hover:bg-cream-200 rounded-lg"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/dashboard" className="flex h-11 items-center">
            <Logo size="sm" variant="full" className="h-7" />
          </Link>
          {canCreateTransaction && location.pathname !== '/transactions/new' && (
            <Link
              to="/transactions/new"
              className="flex h-11 w-11 items-center justify-center -mr-2 text-wood-600 hover:bg-cream-200 rounded-lg"
              aria-label="Transaksi baru"
            >
              <Plus className="h-5 w-5" />
            </Link>
          )}
          {location.pathname === '/transactions/new' && (
            <Link
              to="/transactions"
              className="flex h-11 w-11 items-center justify-center -mr-2 text-wood-600 hover:bg-cream-200 rounded-lg"
              aria-label="Batalkan transaksi"
            >
              <X className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Menu Dialog */}
      <dialog
        ref={mobileDialogRef}
        onClose={handleDialogClose}
        className="fixed inset-0 z-[var(--z-modal)] m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent lg:hidden"
        aria-label="Menu navigasi"
      >
        <button type="button" aria-label="Tutup menu" className="ledger-drawer-backdrop absolute inset-0 border-0 bg-wood-900/50 p-0" onClick={() => mobileDialogRef.current?.close()} />
        <div className="ledger-drawer absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-wood-700 shadow-xl">
          <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-wood-600">
            <Logo size="md" variant="full" color="white" className="h-8" />
            <button
              type="button"
              onClick={() => mobileDialogRef.current?.close()}
              className="p-2 text-wood-300 hover:text-cream-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Primary">
            <ul className="space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const children = item.children;
                const active = children
                  ? isParentActive(children)
                  : isActive(item.to!);
                const menuId = `mobile-nav-${item.label.toLowerCase()}`;

                if (children) {
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => toggleMenu(item.label)}
                        aria-expanded={expandedMenus.includes(item.label)}
                        aria-controls={menuId}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium min-h-[44px]",
                          active
                            ? "bg-wood-600 text-cream-50"
                            : "text-wood-200 hover:bg-wood-600/50"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="min-w-0 flex-1 break-words text-left">{item.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            expandedMenus.includes(item.label) && "rotate-180"
                          )}
                        />
                      </button>
                      {expandedMenus.includes(item.label) && (
                        <ul id={menuId} className="mt-1 ml-8 space-y-1">
                          {children.map((child) => (
                            <li key={child.to}>
                              <Link
                                to={child.to}
                                onClick={() => setMobileMenuOpen(false)}
                                aria-current={isActive(child.to) ? "page" : undefined}
                                className={cn(
                                  "block rounded-lg px-3 py-2 text-sm min-h-[44px] flex items-center",
                                  isActive(child.to)
                                    ? "bg-wood-600/50 text-cream-50 font-medium"
                                    : "text-wood-300 hover:bg-wood-600/30"
                                )}
                              >
                                <span className="break-words">{child.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium min-h-[44px]",
                        active
                          ? "bg-wood-600 text-cream-50"
                          : "text-wood-200 hover:bg-wood-600/50"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="min-w-0 break-words">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="shrink-0 border-t border-wood-600 p-4 ledger-safe-bottom">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-wood-500 flex items-center justify-center text-cream-50 text-sm font-medium shrink-0">
                {orgData?.organization?.name?.charAt(0) || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="break-words text-sm font-medium text-cream-50">
                  {orgData?.organization?.name || "Organisasi"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 rounded-md text-wood-300 hover:text-cream-50 hover:bg-wood-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Keluar"
              >
                <Logout className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </dialog>

      {/* Main Content */}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "bg-background transition-[padding] duration-300 ease-out outline-none",
          "pt-14 lg:pt-0",
          showBottomNav && "pb-[calc(56px+env(safe-area-inset-bottom,0px)+16px)] lg:pb-0",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-60"
        )}
      >
        <OfflineBanner />
        <div className="hidden border-b border-wood-100 bg-surface px-4 py-2 lg:flex items-center justify-end gap-3">
          <SearchTrigger onClick={() => setSearchOpen(true)} />
          <NotificationBell />
        </div>
        <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <div key={location.pathname} className="@container ledger-page mx-auto max-w-7xl px-4 md:px-6 lg:px-8 pt-4 md:pt-6 lg:pt-8 pb-8 md:pb-8 lg:pb-8">
          <Outlet />
        </div>
      </main>
      {showBottomNav && (
      <nav
        className="fixed bottom-0 inset-x-0 z-[var(--z-sticky)] border-t border-wood-200 bg-cream-50/95 backdrop-blur-sm lg:hidden ledger-safe-bottom ledger-scroll-x no-scrollbar"
        aria-label="Navigasi mobile"
      >
        <div className="mx-auto flex items-stretch justify-center gap-1 px-2">
          {visibleNavItems.filter((item) => !item.children).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to!);
            return (
              <Link
                key={item.to}
                to={item.to!}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center gap-0.5 py-2 px-3 text-[11px] font-medium transition-colors min-h-[56px] relative",
                  active
                    ? "text-wood-800"
                    : "text-wood-500 hover:text-wood-700"
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] bg-wood-700 rounded-full" aria-hidden="true" />
                )}
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  active ? "bg-wood-100 text-wood-800" : ""
                )}>
                  <Icon className={cn("h-5 w-5", active && "text-wood-700 font-semibold")} />
                </div>
                <span className={cn(active && "font-semibold")}>{item.label}</span>
              </Link>
            );
          })}
          {visibleNavItems.some((item) => !item.children) && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex shrink-0 flex-col items-center justify-center gap-0.5 py-2 px-3 text-[11px] font-medium text-wood-500 min-h-[56px]"
              aria-label="Menu lainnya"
            >
              <div className="flex h-9 w-9 items-center justify-center">
                <Menu className="h-5 w-5" />
              </div>
              <span>Lainnya</span>
            </button>
          )}
        </div>
      </nav>
      )}
    </div>
  );
}
