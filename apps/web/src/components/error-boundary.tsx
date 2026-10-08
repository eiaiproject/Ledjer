import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle } from "reicon-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) console.error("ErrorBoundary caught:", error, errorInfo);
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: { errorInfo } });
      // Buka dialog feedback agar user bisa lapor setelah error
      const fb = Sentry.getFeedback() as { createForm: (opts?: Record<string, unknown>) => Promise<void> } | undefined;
      fb?.createForm().catch(() => undefined);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center px-4 py-12 text-center" role="alert" aria-live="assertive">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error/10 mb-4">
            <AlertTriangle className="h-8 w-8 text-error" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-xl font-bold text-text-primary">
            Terjadi kesalahan
          </h1>
          <p className="mt-1 max-w-sm break-words text-sm text-text-secondary">
            {import.meta.env.DEV
              ? this.state.error?.message || "Terjadi kesalahan yang tidak terduga"
              : "Terjadi kesalahan yang tidak terduga. Silakan muat ulang halaman atau hubungi admin."}
          </p>
          <div className="mt-4">
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Muat Ulang
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
