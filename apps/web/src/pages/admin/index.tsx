import { Shield } from "lucide-react";

/**
 * Admin dashboard — only visible to service_role callers.
 * In production, this page should be behind a separate admin auth gate
 * (e.g. Supabase service role key in server-side middleware).
 *
 * ⚠️ This page calls admin_* RPCs which are REVOKED from anon/authenticated.
 * It currently uses the service role key from env for demonstration.
 * In production, use a server-side proxy or Edge Function.
 *
 * SECURITY: Never expose service role key to the browser.
 */

export function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary">Admin Dashboard</h1>
      <p className="mt-1 text-sm text-wood-500">Kelola organisasi dan langganan.</p>

      <div className="mt-8">
        <div className="rounded-lg border border-wood-200 bg-cream-50 p-8 text-center">
          <Shield className="mx-auto h-12 w-12 text-wood-300" />
          <h2 className="mt-4 text-lg font-bold text-wood-800">Admin Dashboard</h2>
          <p className="mt-2 max-w-md text-sm text-wood-500">
            Halaman ini hanya untuk administrator platform. Dalam produksi,
            halaman ini dilindungi oleh autentikasi admin terpisah dan tidak
            menggunakan service role key dari browser.
          </p>
          <div className="mx-auto mt-6 max-w-lg rounded-lg border border-honey-200 bg-honey-50 p-4 text-left text-sm text-honey-800">
            <p className="font-medium">Catatan Implementasi:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-honey-700">
              <li>Admin RPCs (<code>admin_list_organizations</code>, <code>admin_update_plan</code>, <code>admin_set_suspension</code>) sudah dibuat di migration Stage 4.</li>
              <li>RPCs ini di-REVOKE dari anon/authenticated — hanya bisa dipanggil via service role.</li>
              <li>Implementasi production harus menggunakan server-side proxy atau Edge Function.</li>
              <li>Jangan pernah mengekspos service role key ke browser.</li>
            </ul>
          </div>
          <div className="mx-auto mt-4 max-w-lg rounded-lg border border-wood-200 bg-cream-100 p-4 text-left text-sm text-wood-700">
            <p className="font-medium">Tersedia via SQL Console (service role):</p>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-wood-600">
              <li><code>SELECT public.admin_list_organizations();</code></li>
              <li><code>SELECT public.admin_get_organization('&lt;ORG_UUID&gt;'::uuid);</code></li>
              <li><code>SELECT public.admin_update_plan('&lt;ORG_UUID&gt;'::uuid, 'solo');</code></li>
              <li><code>SELECT public.admin_set_suspension('&lt;ORG_UUID&gt;'::uuid, true, 'reason');</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
