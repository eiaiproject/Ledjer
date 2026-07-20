import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "reicon-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

export function NotFoundPage() {
  return (
    <div className="ledger-page flex ledger-min-dvh items-center justify-center bg-cream-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="md" variant="full" />
        </div>

        <Card className="p-6">
          <CardContent>
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">Halaman tidak ditemukan</h1>
              <p className="mt-2 text-sm text-text-secondary">
                Link ini tidak tersedia atau sudah berubah. Periksa kembali alamatnya.
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                <Button as={Link} to="/dashboard" fullWidth>
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button as={Link} to="/" variant="secondary" fullWidth>
                  Beranda
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
