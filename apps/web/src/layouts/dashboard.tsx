import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Receipt,
  BookOpen,
  Package,
  BarChart3,
  Settings,
  Plus,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronsLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useOrganization, useIsOwner, useOrgPermissions } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";

type NavItem =
  | { to: string; label: string; icon: LucideIcon; children?: never }
  | { label: string; icon: LucideIcon; children: { to: string; label: string }[]; to?: never };

type NavItemWithPerm = NavItem & { requires?: string };

const NAV_ITEMS: NavItemWithPerm[] = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/transactions", label: "Transaksi", icon: Receipt, requires: "canCreateTransaction" },
  { to: "/accounts", label: "Akun", icon: BookOpen, requires: "canManageAccounts" },
  { to: "/products", label: "Produk", icon: Package, requires: "canManageProducts" },
  {
    label: "Laporan",
    icon: BarChart3,
    requires: "canViewReports",
    children: [
      { to: "/reports/general-ledger", label: "Buku Besar" },
      { to: "/reports/trial-balance", label: "Neraca Saldo" },
      { to: "/reports/profit-loss", label: "Laba Rugi" },
      { to: "/reports/balance-sheet", label: "Neraca" },
    ],
  },
  {
    label: "Pengaturan",
    icon: Settings,
    requires: "canManageTeam",
    children: [
      { to: "/settings/team", label: "Tim" },
      { to: "/settings/period-locks", label: "Kunci Periode" },
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

  if (orgData?.needsOnboarding) {
    return (
      <div className="flex ledger-min-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

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

  const showBottomNav = location.pathname !== '/transactions/new';

  const sidebarWidth = sidebarCollapsed ? "w-16" : "w-60";

  return (
    <div className="ledger-min-dvh bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden bg-wood-700 transition-all duration-300 ease-out lg:fixed lg:inset-y-0 lg:left-0 lg:z-drawer lg:flex lg:flex-col",
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
              <ChevronsLeft className="h-4 w-4" />
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
                  <LogOut className="h-4 w-4" />
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
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="sticky top-0 z-dropdown border-b border-wood-200 bg-cream-50 lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-wood-600 hover:bg-cream-200 rounded-lg"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo size="sm" variant="full" className="h-7" />
          </Link>
          {canCreateTransaction && (
            <Link
              to="/transactions/new"
              className="p-2 -mr-2 text-wood-600 hover:bg-cream-200 rounded-lg"
              aria-label="Transaksi baru"
            >
              <Plus className="h-5 w-5" />
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Menu Dialog */}
      <dialog
        ref={mobileDialogRef}
        onClose={handleDialogClose}
        className="fixed inset-0 z-modal m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-transparent lg:hidden"
        aria-label="Menu navigasi"
      >
        <button type="button" aria-label="Tutup menu" className="ledger-drawer-backdrop absolute inset-0 border-0 bg-wood-900/50 p-0" onClick={() => mobileDialogRef.current?.close()} />
        <div className="ledger-drawer absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-wood-700 shadow-xl">
          <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-wood-600">
            <Logo size="md" variant="full" className="h-8" />
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
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </dialog>

      {/* Main Content */}
      <main className={cn(
        "bg-background transition-[padding] duration-300 ease-out",
        showBottomNav && "pb-20 lg:pb-0",
        sidebarCollapsed ? "lg:pl-16" : "lg:pl-60"
      )}>
        <div key={location.pathname} className="@container ledger-page mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
      {showBottomNav && (
      <nav
        className="fixed bottom-0 inset-x-0 z-sticky border-t border-wood-200 bg-cream-50/95 backdrop-blur-sm lg:hidden ledger-safe-bottom"
        aria-label="Navigasi mobile"
      >
        <div className="flex items-stretch justify-around">
          {visibleNavItems.filter((item) => !item.children).slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to!);
            return (
              <Link
                key={item.to}
                to={item.to!}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[56px]",
                  active
                    ? "text-wood-800"
                    : "text-wood-500 hover:text-wood-700"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-wood-700")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {visibleNavItems.filter((item) => !item.children).length > 4 && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-wood-500 min-h-[56px]"
              aria-label="Menu lainnya"
            >
              <Menu className="h-5 w-5" />
              <span>Lainnya</span>
            </button>
          )}
        </div>
      </nav>
      )}
    </div>
  );
}
