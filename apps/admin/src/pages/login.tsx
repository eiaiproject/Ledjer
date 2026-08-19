import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth";
import { ApiError, isApiError } from "@/lib/api/client";
import { Button, Field, Input, Toast } from "@/components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === "rate_limited"
          ? "Terlalu banyak percobaan login yang gagal. Coba lagi nanti."
          : err.message);
      } else if (isApiError(err)) {
        setError(err.message);
      } else {
        setError("Gagal terhubung ke server.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-wood-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo-icon.svg" alt="Ledjer" className="mx-auto mb-4 h-12 w-12" />
          <h1 className="text-2xl font-semibold text-cream-50">Ledjer Admin</h1>
          <p className="mt-2 text-sm text-wood-200">Panel operasional internal — akses terbatas.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-wood-700 bg-surface p-6 shadow-lg">
          {error ? <Toast message={error} /> : null}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ledjer.id"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Memeriksa..." : "Masuk"}
          </Button>
        </form>
      </div>
    </div>
  );
}
