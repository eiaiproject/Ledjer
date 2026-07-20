import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

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
      fb?.createForm();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center px-4 py-12 text-center" role="alert" aria-live="assertive">
          <h2 className="mt-3 text-lg font-semibold text-wood-900">
            Terjadi kesalahan
          </h2>
          <p className="mt-1 max-w-sm break-words text-sm text-wood-500">
            {import.meta.env.DEV
              ? this.state.error?.message || "Terjadi kesalahan yang tidak terduga"
              : "Terjadi kesalahan yang tidak terduga. Silakan muat ulang halaman atau hubungi admin."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="mt-4 rounded-md bg-wood-500 px-4 py-2 text-sm font-medium text-white hover:bg-wood-600"
          >
            Muat Ulang
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
