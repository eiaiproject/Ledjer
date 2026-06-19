import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { translateError } from "@/lib/errors";
import { Lock, Mail, User, BookOpen } from "lucide-react";

const registerSchema = z.object({
  fullName: z.string().min(2, "Nama harus minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(8, "Password harus minimal 8 karakter"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    setError(null);
    try {
      await signUp(data.email, data.password, data.fullName);
      navigate("/onboarding");
    } catch (err) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex">
      {/* Left side — illustration (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-wood-700 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="h-20 w-20 rounded-2xl bg-leaf-500 flex items-center justify-center mx-auto mb-6">
            <BookOpen className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-cream-50">Ledjer</h1>
          <p className="mt-3 text-wood-200 text-lg">
            Mulai kelola keuangan bisnis Anda dengan mudah
          </p>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-wood-300">
            <span>✓ Gratis untuk UMKM</span>
            <span>✓ Tanpa kartu kredit</span>
          </div>
        </div>
      </div>

      {/* Right side — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="h-12 w-12 rounded-xl bg-leaf-500 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-wood-800">Ledjer</h1>
          </div>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-wood-800">Daftar</h2>
              <p className="mt-1 text-sm text-wood-500">
                Buat akun baru untuk mulai menggunakan Ledjer
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-error/10 text-sm text-error">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wood-400" />
                  <Input
                    {...register("fullName")}
                    placeholder="Nama lengkap"
                    className="pl-10"
                    error={errors.fullName?.message}
                  />
                </div>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wood-400" />
                  <Input
                    {...register("email")}
                    type="email"
                    placeholder="email@contoh.com"
                    className="pl-10"
                    error={errors.email?.message}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wood-400" />
                  <Input
                    {...register("password")}
                    type="password"
                    placeholder="Password (minimal 8 karakter)"
                    className="pl-10"
                    error={errors.password?.message}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wood-400" />
                  <Input
                    {...register("confirmPassword")}
                    type="password"
                    placeholder="Konfirmasi password"
                    className="pl-10"
                    error={errors.confirmPassword?.message}
                  />
                </div>

                <Button type="submit" fullWidth loading={loading}>
                  Daftar
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-wood-500">
                Sudah punya akun?{" "}
                <Link to="/login" className="font-medium text-wood-600 hover:text-wood-800">
                  Masuk
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
