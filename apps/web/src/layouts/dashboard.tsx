import { useState } from "react";
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
import { useOrganization, useIsOwner } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

type NavItem =
  | { to: string; label: string; icon: LucideIcon; children?: never }
  | { label: string; icon: LucideIcon; children: { to: string; label: string }[]; to?: never };

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/transactions", label: "Transaksi", icon: Receipt },
  { to: "/accounts", label: "Akun", icon: BookOpen },
  { to: "/products", label: "Produk", icon: Package },
  {
    label: "Laporan",
    icon: BarChart3,
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
    children: [
      { to: "/settings/team", label: "Tim" },
    ],
  },
];

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const sidebarWidth = sidebarCollapsed ? "w-16" : "w-60";

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-[1200] lg:flex lg:flex-col bg-wood-700 transition-all duration-300",
        sidebarWidth
      )}>
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-wood-600 px-4">
          {sidebarCollapsed ? (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="flex items-center gap-2"
              aria-label="Perluas sidebar"
            >
              <div className="h-8 w-8 rounded-lg bg-leaf-500 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">L</span>
              </div>
            </button>
          ) : (
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-leaf-500 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <span className="text-xl font-bold text-cream-50">Ledjer</span>
            </Link>
          )}
          {!sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-md text-wood-300 hover:bg-wood-600 hover:text-cream-50 transition-colors"
              aria-label="Ciutkan sidebar"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const children = item.children;
              const isExpanded = expandedMenus.includes(item.label);
              const active = children ? isParentActive(children) : isActive(item.to);

              if (children) {
                return (
                  <li key={item.label}>
                    <button
                      onClick={() => toggleMenu(item.label)}
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
                          <span className="flex-1 text-left">{item.label}</span>
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
                      <ul className="mt-1 ml-8 space-y-1">
                        {children.map((child) => (
                          <li key={child.to}>
                            <Link
                              to={child.to}
                              className={cn(
                                "block rounded-lg px-3 py-2 text-sm transition-colors",
                                isActive(child.to)
                                  ? "bg-wood-600/50 text-cream-50 font-medium"
                                  : "text-wood-300 hover:bg-wood-600/30 hover:text-cream-50"
                              )}
                            >
                              {child.label}
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
                    {!sidebarCollapsed && <span>{item.label}</span>}
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
                  <p className="text-sm font-medium text-cream-50 truncate">
                    {orgData?.organization?.name || "Organisasi"}
                  </p>
                  <p className="text-xs text-wood-300 capitalize">
                    {isOwner ? "Owner" : "Staff"}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-1.5 rounded-md text-wood-300 hover:text-cream-50 hover:bg-wood-600"
                  aria-label="Keluar"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {sidebarCollapsed && (
            <button
              onClick={handleSignOut}
              className="mt-2 w-full p-2 rounded-md text-wood-300 hover:text-cream-50 hover:bg-wood-600 flex justify-center"
              aria-label="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-[1100] bg-cream-50 border-b border-wood-200">
        <div className="flex h-14 items-center justify-between px-4">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-wood-600 hover:bg-cream-200 rounded-lg"
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-leaf-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">L</span>
            </div>
            <span className="font-bold text-wood-800">Ledjer</span>
          </Link>
          <Link
            to="/transactions/new"
            className="p-2 -mr-2 text-wood-600 hover:bg-cream-200 rounded-lg"
            aria-label="Transaksi baru"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[1300]">
          <div
            className="absolute inset-0 bg-wood-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-wood-700 shadow-xl">
            <div className="flex h-16 items-center justify-between px-5 border-b border-wood-600">
              <span className="text-xl font-bold text-cream-50">Ledjer</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-wood-300 hover:text-cream-50"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="py-4 px-3 overflow-y-auto">
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const children = item.children;
                  const active = children
                    ? isParentActive(children)
                    : isActive(item.to);

                  if (children) {
                    return (
                      <li key={item.label}>
                        <button
                          onClick={() => toggleMenu(item.label)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                            active
                              ? "bg-wood-600 text-cream-50"
                              : "text-wood-200 hover:bg-wood-600/50"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="flex-1 text-left">{item.label}</span>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              expandedMenus.includes(item.label) && "rotate-180"
                            )}
                          />
                        </button>
                        {expandedMenus.includes(item.label) && (
                          <ul className="mt-1 ml-8 space-y-1">
                            {children.map((child) => (
                              <li key={child.to}>
                                <Link
                                  to={child.to}
                                  onClick={() => setMobileMenuOpen(false)}
                                  className={cn(
                                    "block rounded-lg px-3 py-2 text-sm",
                                    isActive(child.to)
                                      ? "bg-wood-600/50 text-cream-50 font-medium"
                                      : "text-wood-300 hover:bg-wood-600/30"
                                  )}
                                >
                                  {child.label}
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
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                          active
                            ? "bg-wood-600 text-cream-50"
                            : "text-wood-200 hover:bg-wood-600/50"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="absolute bottom-0 left-0 right-0 border-t border-wood-600 p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-wood-500 flex items-center justify-center text-cream-50 text-sm font-medium">
                  {orgData?.organization?.name?.charAt(0) || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cream-50 truncate">
                    {orgData?.organization?.name || "Organisasi"}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-1.5 rounded-md text-wood-300 hover:text-cream-50 hover:bg-wood-60"
                  aria-label="Keluar"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={cn(
        "min-h-screen bg-background transition-all duration-300",
        sidebarCollapsed ? "lg:pl-16" : "lg:pl-60"
      )}>
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
