import { useAuth } from "@/contexts/auth-context";

/**
 * Satu akun = satu buku. `userId` dipakai sebagai scope query key, dan
 * `businessName` (dulu organization.name) datang dari profil user di
 * GET /api/auth/me sehingga tidak perlu request terpisah.
 */
export function useBook() {
  const { user, loading } = useAuth();

  return {
    userId: user?.id,
    businessName: user?.business_name ?? null,
    ready: !loading && !!user,
  };
}
