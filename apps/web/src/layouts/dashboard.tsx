import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Chart, Home, Logout, Menu, Plus, Receipt, Settings, Wallet, X } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";

type NavItem =
  | { to: string; label: string; icon: ComponentType<{ className?: string }>; children?: never }
  | { label: string; icon: ComponentType<{ className?: string }>; children: { to: string; label: string }[]; to?: never };

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Beranda", icon: Home },
  { to: "/transactions", label: "Transaksi", icon: Receipt },
  { to: "/accounts", label: "Kas & Bank", icon: Wallet },
  {
    label: "Laporan",
    icon: Chart,
    children: [
      { to: "/reports/profit-loss", label: "Laba Rugi" },
      { to: "/reports/balance-sheet", label: "Neraca" },
      { to: "/reports/general-ledger", label: "Buku Besar" },
    ],
  },
  { to: "/settings", label: "Pengaturan", icon: Settings },
];

const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.children);

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: orgData } = useOrganization();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(["Laporan"]);
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

  const handleSkipToContent = () => {
    const main = document.getElementById("main-content");
    if (main) {
      main.focus();
      main.scrollIntoView({ behavior: "smooth" });
    }
  };

  const showBottomNav = location.pathname !== "/transactions/new";
  const orgInitial = orgData?.organization?.name?.charAt(0)?.toUpperCase() || "L";

  return (
    <div className="ledger-min-dvh bg-background">
      {/* Skip to content link - WCAG 2.4.1 */}
      <a
        href="#main-content"
        onClick={(e) => { e.preventDefault(); handleSkipToContent(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[var(--z-toast)] focus:rounded-lg focus:bg-cream-50 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-wood-900 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-wood-500"
      >
        Langsung ke konten utama
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden bg-wood-700 lg:fixed lg:inset-y-0 lg:left-0 lg:z-[var(--z-drawer)] lg:flex lg:w-60 lg:flex-col">
        <div className="flex h-16 items-center justify-between border-b border-wood-600 px-4">
          <Link to="/dashboard" aria-label="Ledjer beranda" className="flex items-center gap-2">
            <Logo size="md" variant="full" color="white" className="h-8" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Navigasi utama">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const children = item.children;
              const isExpanded = children ? expandedMenus.includes(item.label) || isParentActive(children) : false;
              const active = children ? isParentActive(children) : isActive(item.to!);

              if (children) {
                const menuId = `desktop-nav-${item.label.toLowerCase()}`;
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => toggleMenu(item.label)}
                      aria-expanded={isExpanded}
                      aria-controls={menuId}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-wood-600 text-cream-50"
                          : "text-wood-200 hover:bg-wood-600/50 hover:text-cream-50"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 flex-1 break-words text-left">{item.label}</span>
                      <span
                        className={cn("text-wood-300 transition-transform", isExpanded && "rotate-180")}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                    {isExpanded && (
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
                    to={item.to!}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-wood-600 text-cream-50"
                        : "text-wood-200 hover:bg-wood-600/50 hover:text-cream-50"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 break-words">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-wood-600 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wood-500 text-sm font-medium text-cream-50">
              {orgInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium text-cream-50">
                {orgData?.organization?.name || "Organisasi"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-wood-300 hover:bg-wood-600 hover:text-cream-50"
              aria-label="Keluar"
            >
              <Logout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="ledger-safe-top fixed inset-x-0 top-0 z-[var(--z-dropdown)] border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-wood-600 hover:bg-cream-200"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/dashboard" aria-label="Ledjer beranda" className="flex h-11 items-center">
            <Logo size="sm" variant="full" className="h-7" />
          </Link>
          {location.pathname !== "/transactions/new" ? (
            <Link
              to="/transactions/new"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-wood-600 hover:bg-cream-200"
              aria-label="Transaksi baru"
            >
              <Plus className="h-5 w-5" />
            </Link>
          ) : (
            <Link
              to="/transactions"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-wood-600 hover:bg-cream-200"
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
        <button
          type="button"
          aria-label="Tutup menu"
          className="ledger-drawer-backdrop absolute inset-0 border-0 bg-wood-900/50 p-0"
          onClick={() => mobileDialogRef.current?.close()}
        />
        <div className="ledger-drawer ledger-safe-top absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-wood-700 shadow-xl">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-wood-600 px-5">
            <Logo size="md" variant="full" color="white" className="h-8" />
            <button
              type="button"
              onClick={() => mobileDialogRef.current?.close()}
              className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-wood-300 hover:text-cream-50"
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigasi utama">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const children = item.children;
                const active = children ? isParentActive(children) : isActive(item.to!);
                const isExpanded = children ? expandedMenus.includes(item.label) || isParentActive(children) : false;
                const menuId = `mobile-nav-${item.label.toLowerCase()}`;

                if (children) {
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => toggleMenu(item.label)}
                        aria-expanded={isExpanded}
                        aria-controls={menuId}
                        className={cn(
                          "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                          active
                            ? "bg-wood-600 text-cream-50"
                            : "text-wood-200 hover:bg-wood-600/50"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="min-w-0 flex-1 break-words text-left">{item.label}</span>
                        <span
                          className={cn("text-wood-300 transition-transform", isExpanded && "rotate-180")}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </button>
                      {isExpanded && (
                        <ul id={menuId} className="mt-1 ml-8 space-y-1">
                          {children.map((child) => (
                            <li key={child.to}>
                              <Link
                                to={child.to}
                                onClick={() => setMobileMenuOpen(false)}
                                aria-current={isActive(child.to) ? "page" : undefined}
                                className={cn(
                                  "flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm",
                                  isActive(child.to)
                                    ? "bg-wood-600/50 font-medium text-cream-50"
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
                      to={item.to!}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wood-500 text-sm font-medium text-cream-50">
                {orgInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-cream-50">
                  {orgData?.organization?.name || "Organisasi"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2 text-wood-300 hover:bg-wood-600 hover:text-cream-50"
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
          "bg-background outline-none transition-[padding] duration-300 ease-out",
          "pt-[calc(56px+env(safe-area-inset-top,0px))] lg:pl-60 lg:pt-0",
          showBottomNav && "pb-[calc(56px+env(safe-area-inset-bottom,0px)+16px)] lg:pb-0"
        )}
      >
        <div key={location.pathname} className="ledger-page mx-auto max-w-7xl px-4 pt-4 pb-8 md:px-6 md:pt-6 lg:px-8 lg:pt-8">
          <Outlet />
        </div>
      </main>

      {showBottomNav && (
        <nav
          className="ledger-safe-bottom fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-wood-200 bg-cream-50/95 backdrop-blur-sm lg:hidden"
          aria-label="Navigasi mobile"
        >
          <div className="mx-auto flex w-full max-w-md items-stretch gap-0.5 px-1.5">
            {BOTTOM_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to!);
              return (
                <Link
                  key={item.to}
                  to={item.to!}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium leading-tight transition-colors",
                    active ? "text-wood-800" : "text-wood-500 hover:text-wood-700"
                  )}
                >
                  {active && (
                    <span className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full bg-wood-700" aria-hidden="true" />
                  )}
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    active ? "bg-wood-100 text-wood-800" : ""
                  )}>
                    <Icon className={cn("h-5 w-5", active && "font-semibold text-wood-700")} />
                  </div>
                  <span className={cn("max-w-full truncate", active && "font-semibold")}>{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium leading-tight text-wood-500"
              aria-label="Menu lainnya"
            >
              <div className="flex h-8 w-8 items-center justify-center">
                <Menu className="h-5 w-5" />
              </div>
              <span className="max-w-full truncate">Lainnya</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}