import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/components/ui";

const NAV_ITEMS = [
  { to: "/", label: "Ringkasan", end: true },
  { to: "/users", label: "Pengguna" },
  { to: "/organizations", label: "Organisasi" },
  { to: "/audit-logs", label: "Audit Log" },
  { to: "/backups", label: "Backup" },
  { to: "/settings", label: "Pengaturan" },
];

export function AdminLayout() {
  const { admin, logout } = useAuth();

  return (
    <div className="ledger-min-dvh flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-wood-800 text-cream-50">
        <div className="flex items-center gap-3 border-b border-wood-700 px-5 py-5">
          <img
            src="/logo-icon.svg"
            alt=""
            className="h-8 w-8 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight tracking-tight">Ledjer Admin</p>
            <p className="mt-0.5 text-xs text-wood-200">Panel Operasional Platform</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navigasi admin">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-wood-700 text-cream-50" : "text-wood-200 hover:bg-wood-700/60 hover:text-cream-50",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-wood-700 px-5 py-4">
          <p className="truncate text-sm font-medium">{admin?.full_name || admin?.email}</p>
          <p className="truncate text-xs text-wood-200">{admin?.email}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 rounded-md border border-wood-600 px-3 py-1.5 text-xs font-medium text-cream-50 transition-colors hover:bg-wood-700"
          >
            Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          <Outlet />
        </main>
        <footer className="border-t border-border px-6 py-4 text-xs text-text-tertiary">
          Ledjer Admin — akses terbatas untuk tim internal. Semua aksi tercatat di audit log.
        </footer>
      </div>
    </div>
  );
}
