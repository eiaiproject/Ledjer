export function ConfigError({ message }: { message: string }) {
  return (
    <div className="flex ledger-min-dvh items-center justify-center bg-cream-100 px-4">
      <div className="w-full max-w-md rounded-lg border border-wood-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-wood-900">Konfigurasi Belum Lengkap</h1>
        <p className="mt-3 text-sm text-wood-600">{message}</p>
        <p className="mt-4 text-xs text-wood-400">
          Lihat <code className="rounded bg-wood-100 px-1.5 py-0.5">apps/web/.env.example</code> untuk template.
        </p>
      </div>
    </div>
  );
}
