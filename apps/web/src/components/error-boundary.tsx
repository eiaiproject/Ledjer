import { Component, type ReactNode } from "react";

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
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center px-4 py-12 text-center">
          <span className="text-4xl"></span>
          <h2 className="mt-3 text-lg font-semibold text-wood-900">
            Terjadi kesalahan
          </h2>
          <p className="mt-1 text-sm text-wood-500">
            {this.state.error?.message || "Terjadi kesalahan yang tidak terduga"}
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
